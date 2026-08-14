async function generateEmail() {
  const domains = await getDomains();
  if (!domains.length) throw new Error('No domains available from provider');

  const domain = domains[0].domain;
  const rand = () => Math.random().toString(36).slice(2, 10);
  const address = `${rand()}@${domain}`;
  const password = rand() + rand();

  await createAccount(address, password);
  const { token } = await getToken(address, password);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    address,
    token,
    createdAt: Date.now(),
    messageCount: 0,
    lastChecked: Date.now()
  };
}

function broadcastToTabs(message) {
  browser.tabs.query({}).then(tabs => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && tab.url.startsWith('http')) {
        browser.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}

async function updateBadge() {
  const { emails = [], lastMsgIds = {}, readMsgIds = {} } = await browser.storage.local.get(['emails', 'lastMsgIds', 'readMsgIds']);
  let unreadTotal = 0;
  for (const email of emails) {
    const seen = new Set(lastMsgIds[email.address] || []);
    const read = new Set(readMsgIds[email.address] || []);
    unreadTotal += Array.from(seen).filter(id => !read.has(id)).length;
  }
  const text = unreadTotal > 0 ? String(unreadTotal) : '';
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color: '#ff3b30' });
}

async function checkMessages() {
  const { isRateLimited } = await browser.storage.local.get('isRateLimited');
  if (isRateLimited) return;

  const storage = await browser.storage.local.get(['emails', 'lastMsgIds', 'readMsgIds', 'otpSessions', 'lastExtractedOTP', 'lastExtractedTime', 'lastExtractedEmail']);
  const emails = storage.emails || [];
  if (!emails.length) { await updateBadge(); return; }

  const lastMsgIds = storage.lastMsgIds || {};
  const readMsgIds = storage.readMsgIds || {};
  const otpSessions = storage.otpSessions || {};
  const newLastMsgIds = { ...lastMsgIds };
  const newOtpSessions = { ...otpSessions };
  let sessionsCleaned = false;
  let latestOTP = storage.lastExtractedOTP || null;
  let latestOTPTime = storage.lastExtractedTime || 0;
  let latestOTPEmail = storage.lastExtractedEmail || null;
  let updated = false;
  const newEmails = [];

  const results = await Promise.allSettled(emails.map(async (email) => {
    try {
      const data = await fetchMessages(email.token);
      const msgs = data['hydra:member'] || [];
      const seen = new Set(newLastMsgIds[email.address] || []);
      const newMsgs = msgs.filter(m => !seen.has(m.id));

      if (newMsgs.length) {
        updated = true;
        newMsgs.forEach(m => seen.add(m.id));
        const seenArr = Array.from(seen);
        if (seenArr.length > 200) seenArr.splice(0, seenArr.length - 200);
        newLastMsgIds[email.address] = seenArr;

        const sorted = [...newMsgs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        for (const m of sorted) {
          const code = extractOTP(m.text || m.intro || m.subject || '');
          if (code) { latestOTP = code; latestOTPTime = Date.now(); latestOTPEmail = email.address; break; }
        }
      }
      return { email, msgs, hasNew: newMsgs.length > 0 };
    } catch (e) {
      return { email, msgs: null, hasNew: false, error: true };
    }
  }));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { email, msgs } = result.value;
      newEmails.push({ ...email, messageCount: msgs ? msgs.length : email.messageCount, lastChecked: Date.now() });
    } else {
      const email = emails[results.indexOf(result)];
      newEmails.push(email);
    }
  }

  const writes = {};

  if (latestOTP && latestOTPTime > 0) {
    writes.lastExtractedOTP = latestOTP;
    writes.lastExtractedTime = latestOTPTime;
    writes.lastExtractedEmail = latestOTPEmail;
  }

  if (updated) {
    writes.emails = newEmails;
    writes.lastMsgIds = newLastMsgIds;

    if (latestOTP && latestOTPEmail) {
      const session = newOtpSessions[latestOTPEmail];
      if (session?.tabId) {
        try {
          const tab = await browser.tabs.get(session.tabId);
          if (tab?.url?.startsWith('http')) {
            browser.tabs.sendMessage(session.tabId, { action: 'otp', code: latestOTP, email: latestOTPEmail }).catch(() => {});
          }
        } catch (e) {
          delete newOtpSessions[latestOTPEmail];
          sessionsCleaned = true;
        }
      }
      broadcastToTabs({ action: 'emailsUpdated', emails: newEmails });
    }
  }

  const now = Date.now();
  for (const [email, session] of Object.entries(newOtpSessions)) {
    if (now - session.time > 10 * 60 * 1000) { delete newOtpSessions[email]; sessionsCleaned = true; }
  }
  if (sessionsCleaned) writes.otpSessions = newOtpSessions;

  if (Object.keys(writes).length) await browser.storage.local.set(writes);
  await updateBadge();
}
