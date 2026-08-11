const $ = id => document.getElementById(id);

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function showError(msg) {
  const bar = $('errorBar');
  $('errorText').textContent = msg;
  bar.classList.add('visible');
  setTimeout(() => bar.classList.remove('visible'), 5000);
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function formatTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderEmails(emails) {
  const list = $('emailList');
  const empty = $('emptyState');

  if (!emails?.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  list.innerHTML = emails.map(e => `
    <div class="email-card" data-id="${e.id}">
      <div class="email-header">
        <div class="email-address">${escapeHtml(e.address)}</div>
        ${e.messageCount ? `<div class="badge">${e.messageCount}</div>` : ''}
      </div>
      <div class="email-meta">Created ${formatTime(e.createdAt)}</div>
      <div class="email-actions">
        <button class="btn-action" data-action="copy" data-addr="${escapeHtml(e.address)}">Copy</button>
        <button class="btn-action" data-action="inbox" data-id="${e.id}" data-token="${e.token}">Inbox</button>
        <button class="btn-action delete" data-action="delete" data-id="${e.id}">Delete</button>
      </div>
      <div class="messages-panel" id="panel-${e.id}"></div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset));
  });
}

async function handleAction(action, data) {
  switch (action) {
    case 'copy': {
      await navigator.clipboard.writeText(data.addr);
      showToast('Copied to clipboard');
      break;
    }
    case 'delete': {
      const res = await browser.runtime.sendMessage({ action: 'delete', id: data.id });
      if (res.ok) {
        loadEmails();
        showToast('Deleted');
      }
      break;
    }
    case 'inbox': {
      const panel = document.getElementById(`panel-${data.id}`);
      const isOpen = panel.classList.contains('open');
      document.querySelectorAll('.messages-panel.open').forEach(p => p.classList.remove('open'));

      if (isOpen) return;

      panel.innerHTML = '<div style="padding:20px;text-align:center;color:#86868b;font-size:13px;">Loading...</div>';
      panel.classList.add('open');

      const res = await browser.runtime.sendMessage({ action: 'messages', token: data.token });
      if (!res.ok) {
        panel.innerHTML = `<div style="padding:20px;text-align:center;color:#ff3b30;font-size:13px;">${escapeHtml(res.error)}</div>`;
        return;
      }

      const msgs = res.messages;
      if (!msgs.length) {
        panel.innerHTML = '<div style="padding:20px;text-align:center;color:#86868b;font-size:13px;">No messages yet</div>';
        return;
      }

      panel.innerHTML = msgs.map(m => `
        <div class="message-item">
          <div class="message-from">${escapeHtml(m.from?.address || 'Unknown')}</div>
          <div class="message-subject">${escapeHtml(m.subject || '(No subject)')}</div>
          ${m.intro ? `<div class="message-preview">${escapeHtml(m.intro)}</div>` : ''}
        </div>
      `).join('');
      break;
    }
  }
}

async function loadEmails() {
  const res = await browser.runtime.sendMessage({ action: 'refresh' });
  if (res.ok) renderEmails(res.emails);
}

// ─── Theme Management ───

async function getActiveTabTheme() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return 'light';
    const res = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSiteTheme' });
    return res?.theme || 'light';
  } catch (e) {
    return 'light';
  }
}

async function applyPopupTheme(theme) {
  let isDark = false;

  if (theme === 'auto-site') {
    const siteTheme = await getActiveTabTheme();
    isDark = siteTheme === 'dark';
  } else if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

async function initTheme() {
  const { popupTheme = 'auto-site' } = await browser.storage.local.get('popupTheme');
  await applyPopupTheme(popupTheme);
  updateThemeUI();
}

async function updateThemeUI() {
  const { popupTheme = 'auto-site', sitePopoverTheme = 'auto' } = await browser.storage.local.get(['popupTheme', 'sitePopoverTheme']);

  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.classList.remove('active');
    const target = btn.dataset.target;
    const theme = btn.dataset.theme;
    if ((target === 'popup' && theme === popupTheme) || (target === 'site' && theme === sitePopoverTheme)) {
      btn.classList.add('active');
    }
  });
}

// Settings dropdown
const settingsBtn = document.querySelector('.settings-btn');
const settingsDropdown = document.getElementById('settingsDropdown');

settingsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpening = !settingsDropdown.classList.contains('active');

  if (isOpening) {
    const rect = settingsBtn.getBoundingClientRect();
    const ddWidth = 240;
    // Ensure dropdown stays within popup bounds (360px)
    let left = rect.right - ddWidth + 6;
    if (left < 8) left = 8;
    if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - ddWidth - 8;

    settingsDropdown.style.position = 'fixed';
    settingsDropdown.style.top = `${rect.bottom + 8}px`;
    settingsDropdown.style.left = `${left}px`;
    settingsDropdown.style.right = 'auto';
  }

  settingsDropdown.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (!settingsDropdown?.contains(e.target) && !settingsBtn?.contains(e.target)) {
    settingsDropdown?.classList.remove('active');
  }
});

document.querySelectorAll('.segment-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const target = btn.dataset.target;
    const theme = btn.dataset.theme;
    const row = btn.closest('.segmented-row');

    // Update UI immediately
    row.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (target === 'popup') {
      await browser.storage.local.set({ popupTheme: theme });
      await applyPopupTheme(theme);
    } else {
      await browser.storage.local.set({ sitePopoverTheme: theme });
    }

    showToast('Saved');
  });
});

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const { popupTheme = 'auto-site' } = await browser.storage.local.get('popupTheme');
  if (popupTheme === 'system') await applyPopupTheme('system');
});

// ─── New Inbox Button ───

$('btnNew').addEventListener('click', async () => {
  const btn = $('btnNew');
  btn.disabled = true;
  btn.innerHTML = '<div class="btn-spinner"></div>';

  const res = await browser.runtime.sendMessage({ action: 'generate' });

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><span>New</span>`;

  if (res.ok) {
    loadEmails();
    showToast('Inbox created');
  } else {
    showError(res.error);
  }
});

// Close message panel when clicking outside
document.addEventListener('click', (e) => {
  const openPanel = document.querySelector('.messages-panel.open');
  if (openPanel && !openPanel.contains(e.target) && !e.target.closest('[data-action="inbox"]')) {
    openPanel.classList.remove('open');
  }
});

// Initialize
initTheme();
loadEmails();
