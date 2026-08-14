document.querySelector('.refresh-btn')?.addEventListener('click', async () => {
  const btn = document.querySelector('.refresh-btn');
  btn.classList.add('spinning');
  await loadEmails();
  btn.classList.remove('spinning');
});

document.getElementById('btnMarkAllRead')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnMarkAllRead');
  btn.classList.add('spinning');
  await browser.runtime.sendMessage({ action: 'markAllRead' });
  btn.classList.remove('spinning');
  showToast('All messages marked as read', 'success');
  loadEmails();
});

const settingsBtn = document.querySelector('.settings-btn');
const settingsDropdown = document.getElementById('settingsDropdown');

settingsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpening = !settingsDropdown.classList.contains('active');
  if (isOpening) {
    settingsDropdown.classList.remove('active');
    settingsDropdown.style.visibility = 'hidden';
    settingsDropdown.style.display = 'block';
    const ddHeight = settingsDropdown.offsetHeight;
    settingsDropdown.style.display = '';
    settingsDropdown.style.visibility = '';

    const rect = settingsBtn.getBoundingClientRect();
    const ddWidth = 260;
    let left = rect.right - ddWidth + 6;
    if (left < 8) left = 8;
    if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - ddWidth - 8;

    let top = rect.bottom + 8;
    if (top + ddHeight > window.innerHeight - 8) {
      top = rect.top - ddHeight - 8;
    }
    if (top < 8) top = 8;

    settingsDropdown.style.position = 'fixed';
    settingsDropdown.style.top = `${top}px`;
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
    row.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (target === 'popup') {
      await browser.storage.local.set({ popupTheme: theme });
      await applyPopupTheme(theme);
    } else if (target === 'site') {
      await browser.storage.local.set({ sitePopoverTheme: theme });
    }
    showToast('Saved', 'success');
  });
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const { popupTheme = 'auto-site' } = await browser.storage.local.get('popupTheme');
  if (popupTheme === 'system') await applyPopupTheme('system');
});

$('btnNew').addEventListener('click', async () => {
  const btn = $('btnNew');
  btn.disabled = true;
  btn.innerHTML = '<div class="btn-spinner"></div>';

  const res = await browser.runtime.sendMessage({ action: 'generate' });

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><span>New</span>`;

  if (res.ok) {
    loadEmails();
    showToast('Inbox created', 'success');
  } else {
    loadEmails();
    showError(res.error);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsDropdown?.classList.contains('active')) {
    settingsDropdown.classList.remove('active');
  }
});
