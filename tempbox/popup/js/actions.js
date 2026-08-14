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
      const res = await browser.runtime.sendMessage({ action: 'messages', token: data.token });
      if (!res.ok) {
        showError(res.error || 'Failed to load messages');
        loadEmails();
        return;
      }
      showMessageView(data.id, data.token, data.address || '', res.messages);
      break;
    }
  }
}

async function loadEmails() {
  const list = $('emailList');
  const empty = $('emptyState');
  const res = await browser.runtime.sendMessage({ action: 'refresh' });
  if (res.ok) {
    renderEmails(res.emails);
  } else {
    list.innerHTML = '';
    empty.style.display = 'block';
  }
}
