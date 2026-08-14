let currentMessageView = null;
window.currentDetailMessage = null;

async function renderEmails(emails) {
  const list = $('emailList');
  const empty = $('emptyState');
  const { readMsgIds = {} } = await browser.storage.local.get('readMsgIds');

  if (!emails || !emails.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = '';

  const frag = document.createDocumentFragment();
  emails.forEach(e => {
    const read = readMsgIds[e.address] || [];
    const unread = Math.max(0, (e.messageCount || 0) - read.length);

    const card = document.createElement('div');
    card.className = 'email-card';
    card.dataset.id = e.id;
    card.innerHTML = `
      <div class="email-header">
        <div class="email-address">${escapeHtml(e.address)}</div>
        ${unread > 0 ? `<div class="badge">${unread}</div>` : ''}
      </div>
      <div class="email-meta">Created ${formatTime(e.createdAt)}</div>
      <div class="email-actions">
        <button class="btn-action" data-action="copy" data-addr="${escapeHtml(e.address)}">Copy</button>
        <button class="btn-action" data-action="inbox" data-id="${e.id}" data-token="${e.token}" data-address="${escapeHtml(e.address)}">Inbox</button>
        <button class="btn-action delete" data-action="delete" data-id="${e.id}">Delete</button>
      </div>
    `;
    frag.appendChild(card);
  });

  list.appendChild(frag);

  list.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset));
  });
}

async function showMessageView(emailId, token, address, messages) {
  currentMessageView = { id: emailId, token, address, messages };
  const list = $('emailList');
  $('emptyState').style.display = 'none';

  const { readMsgIds = {} } = await browser.storage.local.get('readMsgIds');
  const read = new Set(readMsgIds[address] || []);
  const msgsWithRead = messages.map(m => ({ ...m, _read: read.has(m.id) }));
  const unreadMsgs = msgsWithRead.filter(m => !m._read);

  const wrapper = document.createElement('div');
  wrapper.className = 'message-view-wrapper';
  wrapper.innerHTML = `
    <div class="message-view-header">
      <button class="message-view-back" id="msgViewBack">&#8592; Inboxes</button>
      <div class="message-view-title">${escapeHtml(address)}</div>
      ${unreadMsgs.length ? `<button class="message-view-mark-read" id="msgMarkRead" title="Mark all as read">Mark all read</button>` : ''}
      ${unreadMsgs.length ? `<div class="badge">${unreadMsgs.length}</div>` : ''}
    </div>
    <div class="message-view-list" id="msgList"></div>
  `;

  const msgList = wrapper.querySelector('#msgList');
  if (!msgsWithRead.length) {
    msgList.innerHTML = '<div class="message-view-empty">No messages yet</div>';
  } else {
    const frag = document.createDocumentFragment();
    msgsWithRead.forEach(m => {
      const item = document.createElement('div');
      item.className = `message-item ${m._read ? 'read' : 'unread'}`;
      item.dataset.messageId = m.id;
      item.innerHTML = `
        <div class="message-item-top">
          <span class="message-item-from">${escapeHtml(m.from?.name || m.from?.address || 'Unknown')}</span>
          <span class="message-item-date">${formatMessageDate(m.createdAt)}</span>
        </div>
        <div class="message-item-subject">${escapeHtml(m.subject || '(No subject)')}</div>
        ${m.intro ? `<div class="message-item-preview">${escapeHtml(Array.isArray(m.intro) ? m.intro.join('') : m.intro)}</div>` : ''}
      `;
      frag.appendChild(item);
    });
    msgList.appendChild(frag);
  }

  list.innerHTML = '';
  list.appendChild(wrapper);

  $('msgViewBack').addEventListener('click', () => {
    window.currentDetailMessage = null;
    currentMessageView = null;
    loadEmails();
  });

  const markReadBtn = $('msgMarkRead');
  if (markReadBtn) {
    markReadBtn.addEventListener('click', async () => {
      markReadBtn.disabled = true;
      markReadBtn.innerHTML = '<div class="btn-spinner"></div>';
      await browser.runtime.sendMessage({ action: 'markInboxRead', address });
      showToast('All messages marked as read');
      const res = await browser.runtime.sendMessage({ action: 'messages', token });
      if (res.ok) showMessageView(emailId, token, address, res.messages);
    });
  }

  msgList.querySelectorAll('.message-item').forEach(item => {
    item.addEventListener('click', async () => {
      const listEl = $('emailList');
      listEl.innerHTML = renderDetailSkeleton();

      const detailRes = await browser.runtime.sendMessage({ action: 'message', token, messageId: item.dataset.messageId });
      if (detailRes.ok) {
        await showMessageDetail(detailRes.message, token);
      } else {
        showError(detailRes.error || 'Failed to load message');
        if (currentMessageView) {
          showMessageView(currentMessageView.id, currentMessageView.token, currentMessageView.address, currentMessageView.messages);
        }
      }
    });
  });
}
