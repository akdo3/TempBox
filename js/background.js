browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
  const handle = async () => {
    switch (req.action) {
      case 'generate': {
        const email = await generateEmail();
        const { emails = [] } = await browser.storage.local.get('emails');
        if (emails.length >= 20) emails.pop();
        emails.unshift(email);
        await browser.storage.local.set({ emails });
        broadcastToTabs({ action: 'emailsUpdated', emails });
        await updateBadge();
        return { ok: true, email };
      }
      case 'list': {
        const { emails = [] } = await browser.storage.local.get('emails');
        return { ok: true, emails };
      }
      case 'delete': {
        const storage = await browser.storage.local.get(['emails', 'lastMsgIds', 'otpSessions', 'readMsgIds']);
        const emails = storage.emails || [];
        const emailToDelete = emails.find(e => e.id === req.id);
        const filtered = emails.filter(e => e.id !== req.id);
        const lastMsgIds = { ...(storage.lastMsgIds || {}) };
        const otpSessions = { ...(storage.otpSessions || {}) };
        const readMsgIds = { ...(storage.readMsgIds || {}) };

        if (emailToDelete) {
          delete lastMsgIds[emailToDelete.address];
          delete otpSessions[emailToDelete.address];
          delete readMsgIds[emailToDelete.address];
          await browser.storage.local.set({ emails: filtered, lastMsgIds, otpSessions, readMsgIds });
        } else {
          await browser.storage.local.set({ emails: filtered });
        }
        broadcastToTabs({ action: 'emailsUpdated', emails: filtered });
        await updateBadge();
        return { ok: true };
      }
      case 'messages': {
        const data = await fetchMessages(req.token);
        return { ok: true, messages: data['hydra:member'] || [] };
      }
      case 'message': {
        const msg = await fetchMessage(req.token, req.messageId);
        return { ok: true, message: msg };
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
      case 'getLatestOTP': {
        const { lastExtractedOTP = null, lastExtractedTime = 0 } = await browser.storage.local.get(['lastExtractedOTP', 'lastExtractedTime']);
        if (lastExtractedOTP && (Date.now() - lastExtractedTime < 5 * 60 * 1000)) {
          return { ok: true, code: lastExtractedOTP };
        }
        return { ok: true, code: null };
      }
      case 'getTabTheme': {
        try {
          const res = await browser.tabs.sendMessage(req.tabId, { action: 'getSiteTheme' });
          return { ok: true, theme: res?.theme || 'light' };
        } catch (e) {
          return { ok: false, theme: 'light' };
        }
      }
      case 'pick': {
        const { emails = [], otpSessions = {} } = await browser.storage.local.get(['emails', 'otpSessions']);
        const tabSession = Object.entries(otpSessions).find(([email, session]) => session.tabId === sender.tab.id);
        if (tabSession) {
          const email = emails.find(e => e.address === tabSession[0]);
          if (email) return { ok: true, address: email.address };
        }
        if (emails.length > 0) return { ok: true, address: emails[0].address };
        return { ok: false, error: 'No emails available' };
      }
      case 'markAllRead': {
        const { readMsgIds = {}, lastMsgIds = {} } = await browser.storage.local.get(['readMsgIds', 'lastMsgIds']);
        const newRead = { ...readMsgIds };
        for (const addr of Object.keys(lastMsgIds)) {
          newRead[addr] = [...(lastMsgIds[addr] || [])];
        }
        await browser.storage.local.set({ readMsgIds: newRead });
        await updateBadge();
        return { ok: true };
      }
      case 'markInboxRead': {
        const { readMsgIds = {}, lastMsgIds = {}, emails = [] } = await browser.storage.local.get(['readMsgIds', 'lastMsgIds', 'emails']);
        const email = emails.find(e => e.address === req.address);
        if (email) {
          const newRead = { ...readMsgIds, [req.address]: [...(lastMsgIds[req.address] || [])] };
          await browser.storage.local.set({ readMsgIds: newRead });
          await updateBadge();
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown action' };
    }
  };

  handle().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.readMsgIds || changes.lastMsgIds || changes.emails)) {
    updateBadge();
  }
});

// Fast polling (5s) using setInterval — keeps background page alive in Chrome
setInterval(() => {
  checkMessages();
}, 5000);

// Fallback alarm (60s minimum in packed Chrome extensions)
browser.alarms.create('checkMail', { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkMail') checkMessages();
  if (alarm.name === 'rateLimitBackoff') {
    browser.storage.local.set({ isRateLimited: false });
  }
});

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'tempbox-fill',
      title: 'Fill with TempBox email',
      contexts: ['editable']
    });
  }).catch(() => {});
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tempbox-fill') {
    browser.tabs.sendMessage(tab.id, { action: 'fillFromMenu' }).catch(() => {});
  }
});
