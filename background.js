const API = 'https://api.mail.tm';
let isRateLimited = false;

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers }
  });
  if (res.status === 429) {
    isRateLimited = true;
    browser.alarms.clear('checkMail');
    browser.alarms.create('rateLimitBackoff', { delayInMinutes: 0.5 });
    throw new Error('Rate limited. Please wait a moment.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

async function getDomains() {
  const data = await api('/domains');
  return data['hydra:member'] || [];
}

async function createAccount(address, password) {
  return api('/accounts', {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });
}

async function getToken(address, password) {
  return api('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });
}

async function fetchMessages(token) {
  return api('/messages', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function extractOTP(text) {
  if (!text) return null;
  const t = text.replace(/[​-‍﻿]/g, '');

  const patterns = [
    /(?:code|otp|pin|token|verification|verify|password|passcode|security|auth|authentication|confirm|confirmation|one-time|single-use|2fa|mfa)[\s:]*([0-9]{4,8})/i,
    /([0-9]{4,8})[\s:]*(?:is your|is the|as your|as the)[\s:]*(?:code|otp|pin|token|verification|password)/i,
    /(?:enter|type|input|provide)[\s:]*([0-9]{4,8})/i,
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[1];
  }

  const lines = t.split(/|<br\s*\/?>/i);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 4 && trimmed.length <= 30) {
      const digits = trimmed.match(/^([0-9\s-]{3,10}[0-9])$/);
      if (digits) {
        const code = digits[1].replace(/\D/g, '');
        if (code.length >= 4 && code.length <= 8) return code;
      }
    }
  }

  const m = t.match(/(?:^|\D)([0-9]{4,8})(?:\D|$)/);
  return m ? m[1] : null;
}

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
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    address,
    token,
    createdAt: Date.now(),
    messageCount: 0,
    lastChecked: Date.now()
  };
}

async function checkMessages() {
  if (isRateLimited) return;

  const { emails = [] } = await browser.storage.local.get('emails');
  const { otpSessions = {}, lastMsgIds = {} } = await browser.storage.local.get(['otpSessions', 'lastMsgIds']);

  let updated = false;
  const newEmails = [];
  const newLastMsgIds = { ...lastMsgIds };
  const newOtpSessions = { ...otpSessions };
  let sessionsCleaned = false;

  for (const email of emails) {
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

        for (const m of newMsgs) {
          const code = extractOTP(m.text || m.intro || m.subject || '');
          if (code) {
            const session = newOtpSessions[email.address];
            if (session && (Date.now() - session.time < 10 * 60 * 1000)) {
              try {
                const tab = await browser.tabs.get(session.tabId);
                if (tab && tab.url) {
                  await browser.tabs.sendMessage(session.tabId, {
                    action: 'otp',
                    code,
                    email: email.address
                  });
                }
              } catch (e) {
                delete newOtpSessions[email.address];
                sessionsCleaned = true;
              }
            }
          }
        }
      }

      newEmails.push({ ...email, messageCount: msgs.length, lastChecked: Date.now() });
    } catch(e) {
      newEmails.push(email);
    }
  }

  if (updated) {
    await browser.storage.local.set({ emails: newEmails, lastMsgIds: newLastMsgIds });
    const total = newEmails.reduce((s, e) => s + (e.messageCount || 0), 0);
    browser.browserAction.setBadgeText({ text: total > 0 ? String(total) : '' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#ff3b30' });
  }

  const now = Date.now();
  for (const [email, session] of Object.entries(newOtpSessions)) {
    if (now - session.time > 10 * 60 * 1000) {
      delete newOtpSessions[email];
      sessionsCleaned = true;
    }
  }
  if (sessionsCleaned) {
    await browser.storage.local.set({ otpSessions: newOtpSessions });
  }
}

browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
  const handle = async () => {
    switch (req.action) {
      case 'generate': {
        const email = await generateEmail();
        const { emails = [] } = await browser.storage.local.get('emails');
        if (emails.length >= 20) emails.pop();
        emails.unshift(email);
        await browser.storage.local.set({ emails });
        return { ok: true, email };
      }
      case 'list': {
        const { emails = [] } = await browser.storage.local.get('emails');
        return { ok: true, emails };
      }
      case 'delete': {
        const { emails = [], lastMsgIds = {}, otpSessions = {} } = await browser.storage.local.get(['emails', 'lastMsgIds', 'otpSessions']);
        const emailToDelete = emails.find(e => e.id === req.id);
        const filtered = emails.filter(e => e.id !== req.id);

        if (emailToDelete) {
          delete lastMsgIds[emailToDelete.address];
          delete otpSessions[emailToDelete.address];
          await browser.storage.local.set({ emails: filtered, lastMsgIds, otpSessions });
        } else {
          await browser.storage.local.set({ emails: filtered });
        }
        return { ok: true };
      }
      case 'messages': {
        const data = await fetchMessages(req.token);
        return { ok: true, messages: data['hydra:member'] || [] };
      }
      case 'refresh': {
        await checkMessages();
        const { emails = [] } = await browser.storage.local.get('emails');
        return { ok: true, emails };
      }
      case 'trackEmail': {
        const { otpSessions = {} } = await browser.storage.local.get('otpSessions');
        otpSessions[req.email] = { tabId: sender.tab.id, url: req.url, time: Date.now() };
        await browser.storage.local.set({ otpSessions });
        return { ok: true };
      }
      case 'getTabTheme': {
        try {
          const res = await browser.tabs.sendMessage(req.tabId, { action: 'getSiteTheme' });
          return { ok: true, theme: res?.theme || 'light' };
        } catch (e) {
          return { ok: false, theme: 'light' };
        }
      }
      default:
        return { ok: false, error: 'Unknown action' };
    }
  };

  handle().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

browser.alarms.create('checkMail', { periodInMinutes: 0.083 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkMail') checkMessages();
  if (alarm.name === 'rateLimitBackoff') {
    isRateLimited = false;
    browser.alarms.create('checkMail', { periodInMinutes: 0.083 });
  }
});

browser.contextMenus.create({
  id: 'tempbox-fill',
  title: 'Fill with TempBox email',
  contexts: ['editable']
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tempbox-fill') {
    browser.tabs.sendMessage(tab.id, { action: 'fillFromMenu' });
  }
});
