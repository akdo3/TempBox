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

$('btnNew').addEventListener('click', async () => {
  const btn = $('btnNew');
  btn.disabled = true;
  btn.innerHTML = '<div class="btn-spinner"></div>';

  const res = await browser.runtime.sendMessage({ action: 'generate' });

  btn.disabled = false;
  btn.innerHTML = '<span>+ New</span>';

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

loadEmails();
