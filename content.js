(function() {
  'use strict';

  const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:14px;height:14px;min-width:14px;min-height:14px;flex-shrink:0;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;

  let activePopover = null;
  let trackedEmail = null;

  function isDarkColor(rgbStr) {
    const m = rgbStr.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (!m) return false;
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  function detectSiteTheme() {
    try {
      const el = document.body || document.documentElement;
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        const htmlStyle = window.getComputedStyle(document.documentElement);
        const htmlBg = htmlStyle.backgroundColor;
        if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
          return isDarkColor(htmlBg) ? 'dark' : 'light';
        }
        return 'light';
      }
      return isDarkColor(bg) ? 'dark' : 'light';
    } catch(e) {
      return 'light';
    }
  }

  function resolveTheme(themeValue) {
    if (themeValue === 'auto') return detectSiteTheme();
    if (themeValue === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return themeValue || 'light';
  }

  async function applyTheme(popover, forcedValue) {
    let themeValue = forcedValue;
    if (!themeValue) {
      const { sitePopoverTheme = 'auto' } = await browser.storage.local.get('sitePopoverTheme');
      themeValue = sitePopoverTheme;
    }
    const theme = resolveTheme(themeValue);
    popover.classList.remove('tempbox-theme-light', 'tempbox-theme-dark');
    popover.classList.add(`tempbox-theme-${theme}`);
  }

  // ─── Auto theme update without page reload ───
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sitePopoverTheme && activePopover) {
      applyTheme(activePopover, changes.sitePopoverTheme.newValue);
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const { sitePopoverTheme = 'auto' } = await browser.storage.local.get('sitePopoverTheme');
    if (sitePopoverTheme === 'system' && activePopover) {
      applyTheme(activePopover, 'system');
    }
  });

  function isEmailField(el) {
    const t = (el.type || '').toLowerCase();
    if (t === 'email') return true;

    const n = (el.name || '').toLowerCase();
    const i = (el.id || '').toLowerCase();
    const p = (el.placeholder || '').toLowerCase();
    const a = (el.autocomplete || '').toLowerCase();
    const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();

    const keys = ['email', 'e-mail', 'mail', 'username', 'login', 'account', 'identifier', 'user'];
    return keys.some(k => n.includes(k) || i.includes(k) || p.includes(k) || lbl.includes(k) || cls.includes(k)) || a.includes('email');
  }

  function findOTPInputs() {
    const all = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="range"])');
    const results = [];
    for (const el of all) {
      const s = [
        el.type, el.name, el.id, el.className, el.placeholder,
        el.getAttribute('aria-label'), el.autocomplete,
        el.getAttribute('data-testid'), el.getAttribute('data-cy'),
        el.getAttribute('data-field')
      ].join(' ').toLowerCase();

      const isLikelyOTP =
        el.autocomplete === 'one-time-code' ||
        /\b(otp|pin|token|verify|verification|confirm|auth|security|2fa|mfa|totp)\b/.test(s) && /\b(code|number|digit|pin|otp)\b/.test(s) ||
        (el.maxLength >= 4 && el.maxLength <= 8 && /(code|digit|number|verify)/.test(s)) ||
        (el.inputMode === 'numeric' && /(code|otp|verify)/.test(s));

      if (isLikelyOTP) results.push(el);
    }
    return results;
  }

  function closeAll() {
    if (activePopover) {
      activePopover.classList.remove('active');
      activePopover = null;
    }
  }

  function fillInput(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    trackedEmail = value;
    browser.runtime.sendMessage({
      action: 'trackEmail',
      email: value,
      url: location.href
    });

    closeAll();
  }

  function showOTPChip(input, code) {
    if (input.dataset.tempboxOtp === code) return;
    input.dataset.tempboxOtp = code;

    const existing = document.querySelector(`.tempbox-otp-chip[data-input-id="${input.dataset.tempboxId || ''}"]`);
    if (existing) existing.remove();

    if (!input.dataset.tempboxId) input.dataset.tempboxId = Math.random().toString(36).slice(2);

    const rect = input.getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'tempbox-otp-chip';
    chip.dataset.inputId = input.dataset.tempboxId;
    chip.textContent = code;

    const margin = 8;
    const chipW = 80;
    const chipH = 32;

    let left, top;
    if (rect.right + chipW + margin < window.innerWidth) {
      left = rect.right + margin;
      top = rect.top + (rect.height - chipH) / 2;
    } else if (rect.left - chipW - margin > 0) {
      left = rect.left - chipW - margin;
      top = rect.top + (rect.height - chipH) / 2;
    } else {
      left = rect.left;
      top = rect.bottom + margin;
    }

    chip.style.left = `${left}px`;
    chip.style.top = `${top}px`;

    chip.addEventListener('click', () => {
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      chip.remove();
      delete input.dataset.tempboxOtp;
    });

    document.body.appendChild(chip);

    setTimeout(() => {
      chip.remove();
      delete input.dataset.tempboxOtp;
    }, 180000);
  }

  // ─── Security: DOM-based rendering instead of innerHTML for user data ───
  async function renderPopover(popover, input) {
    await applyTheme(popover);

    const res = await browser.runtime.sendMessage({ action: 'list' });
    const emails = res.ok ? res.emails : [];

    popover.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'tempbox-popover-header';
    header.innerHTML = '<span>TempBox</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tempbox-popover-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', closeAll);
    header.appendChild(closeBtn);
    popover.appendChild(header);

    if (emails.length) {
      emails.forEach(e => {
        const item = document.createElement('div');
        item.className = 'tempbox-item';
        item.dataset.addr = e.address;

        const addr = document.createElement('span');
        addr.className = 'tempbox-item-addr';
        addr.textContent = e.address;
        item.appendChild(addr);

        if (e.messageCount) {
          const badge = document.createElement('span');
          badge.className = 'tempbox-item-badge';
          badge.textContent = e.messageCount;
          item.appendChild(badge);
        }

        item.addEventListener('click', () => fillInput(input, e.address));
        popover.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'tempbox-empty';
      empty.textContent = 'No inboxes yet';
      popover.appendChild(empty);
    }

    const createBtn = document.createElement('button');
    createBtn.className = 'tempbox-create';
    createBtn.textContent = '+ Create new inbox';
    createBtn.addEventListener('click', async () => {
      const loading = document.createElement('div');
      loading.className = 'tempbox-loading';
      loading.textContent = 'Creating...';
      popover.innerHTML = '';
      popover.appendChild(loading);

      const gen = await browser.runtime.sendMessage({ action: 'generate' });
      if (gen.ok) {
        fillInput(input, gen.email.address);
      } else {
        const errDiv = document.createElement('div');
        errDiv.className = 'tempbox-empty';
        errDiv.style.color = '#ff3b30';
        errDiv.textContent = gen.error || 'Failed to create inbox';
        popover.innerHTML = '';
        popover.appendChild(errDiv);
      }
    });
    popover.appendChild(createBtn);
  }

  function attach(input) {
    if (input.dataset.tempboxAttached || !input.offsetParent) return;
    if (input.closest('.tempbox-popover') || input.closest('.tempbox-otp-chip')) return;

    input.dataset.tempboxAttached = '1';

    const wrap = document.createElement('div');
    wrap.className = 'tempbox-wrap';

    const computed = window.getComputedStyle(input);
    wrap.style.width = computed.width;
    wrap.style.display = computed.display === 'block' ? 'block' : 'inline-block';
    wrap.style.position = 'relative';

    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.className = 'tempbox-trigger';
    btn.type = 'button';
    btn.innerHTML = ICON_SVG;
    btn.title = 'TempBox';
    wrap.appendChild(btn);

    const popover = document.createElement('div');
    popover.className = 'tempbox-popover';
    document.body.appendChild(popover);

    // Prevent focus/active state sticking on double-click
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.blur();

      if (activePopover === popover) {
        closeAll();
        return;
      }

      closeAll();
      await renderPopover(popover, input);

      const rect = wrap.getBoundingClientRect();
      const popH = 320;
      const popW = 300;

      let left = rect.left;
      let top = rect.bottom + 8;

      if (left + popW > window.innerWidth - 16) left = window.innerWidth - popW - 16;
      if (top + popH > window.innerHeight - 16) top = rect.top - popH - 8;
      if (left < 16) left = 16;
      if (top < 16) top = 16;

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      popover.classList.add('active');
      activePopover = popover;
    });
  }

  function scan(root = document) {
    const inputs = root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"])');
    inputs.forEach(el => { if (isEmailField(el)) attach(el); });

    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) scan(el.shadowRoot);
    });
  }

  scan();

  let debounce;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => scan(), 400);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Cleanup observer on page unload to prevent memory leaks
  window.addEventListener('beforeunload', () => observer.disconnect());

  document.addEventListener('click', (e) => {
    if (activePopover && !activePopover.contains(e.target) && !e.target.closest('.tempbox-trigger')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'getSiteTheme') {
      const theme = detectSiteTheme();
      sendResponse({ theme });
      return true;
    }
    if (req.action === 'otp') {
      const inputs = findOTPInputs();
      if (inputs.length) {
        inputs.forEach(input => showOTPChip(input, req.code));
      }
    }
    if (req.action === 'fillFromMenu') {
      const active = document.activeElement;
      if (active && isEmailField(active)) {
        browser.runtime.sendMessage({ action: 'pick' }).then(res => {
          if (res.ok) fillInput(active, res.address);
        });
      }
    }
    // Always return true for async responses, false for sync
    return false;
  });
})();
