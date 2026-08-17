window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  let activePopover = null;
  let activeInput = null;
  let popoverPool = null;
  const triggerRegistry = new Map();

  function getPopover() {
    if (!popoverPool) {
      popoverPool = document.createElement('div');
      popoverPool.className = 'tempbox-popover';
      document.body.appendChild(popoverPool);
    }
    return popoverPool;
  }

  function closeAll() {
    if (activePopover) {
      activePopover.classList.remove('active');
      activePopover = null;
      activeInput = null;
    }
    TB.OTP.stopWaitingForOTP();
  }

  async function renderPopover(popover, input) {
    await TB.applyTheme(popover);

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
      const frag = document.createDocumentFragment();
      emails.forEach(e => {
        const item = document.createElement('div');
        item.className = 'tempbox-item';
        item.dataset.addr = e.address;

        const addr = document.createElement('span');
        addr.className = 'tempbox-item-addr';
        addr.textContent = e.address;
        item.appendChild(addr);

        item.addEventListener('click', () => TB.Input.fillInput(input, e.address));
        frag.appendChild(item);
      });
      popover.appendChild(frag);
    } else {
      const empty = document.createElement('div');
      empty.className = 'tempbox-empty';
      empty.textContent = 'No inboxes yet';
      popover.appendChild(empty);
    }

    const createBtn = document.createElement('button');
    createBtn.className = 'tempbox-create';

    if (TB.OTP.isWaitingForOTP()) {
      createBtn.innerHTML = '<div class="tempbox-inline-spinner"></div> Waiting for code...';
      createBtn.disabled = true;
      createBtn.style.opacity = '0.7';
      createBtn.style.cursor = 'default';
    } else {
      createBtn.textContent = '+ Create new inbox';
    }

    createBtn.addEventListener('click', async () => {
      if (TB.OTP.isWaitingForOTP()) return;

      const loading = document.createElement('div');
      loading.className = 'tempbox-loading';
      loading.innerHTML = '<div class="tempbox-inline-spinner"></div> Creating inbox...';
      popover.innerHTML = '';
      popover.appendChild(loading);

      const gen = await browser.runtime.sendMessage({ action: 'generate' });
      if (gen.ok) {
        TB.Input.fillInput(input, gen.email.address);
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

  function applyBtnStyles(btn) {
    let isDark = false;
    try {
      if (typeof TB.detectSiteTheme === 'function') {
        isDark = TB.detectSiteTheme() === 'dark';
      }
    } catch (e) {
      isDark = false;
    }

    const bg = isDark ? 'rgba(58,58,60,0.95)' : 'rgba(255,255,255,0.95)';
    const color = isDark ? '#ffffff' : '#1d1d1f';
    const border = isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)';
    const shadow = isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.15)';

    const s = btn.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('z-index', '2147483647', 'important');
    s.setProperty('pointer-events', 'auto', 'important');
    s.setProperty('width', '20px', 'important');
    s.setProperty('height', '20px', 'important');
    s.setProperty('padding', '0', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('border', border, 'important');
    s.setProperty('background', bg, 'important');
    s.setProperty('color', color, 'important');
    s.setProperty('cursor', 'pointer', 'important');
    s.setProperty('display', 'flex', 'important');
    s.setProperty('align-items', 'center', 'important');
    s.setProperty('justify-content', 'center', 'important');
    s.setProperty('border-radius', '6px', 'important');
    s.setProperty('box-shadow', shadow, 'important');
    s.setProperty('backdrop-filter', 'blur(4px)', 'important');
    s.setProperty('-webkit-backdrop-filter', 'blur(4px)', 'important');
    s.setProperty('opacity', '1', 'important');
    s.setProperty('visibility', 'visible', 'important');
    s.setProperty('overflow', 'hidden', 'important');
    s.setProperty('min-width', '20px', 'important');
    s.setProperty('min-height', '20px', 'important');
    s.setProperty('max-width', '20px', 'important');
    s.setProperty('max-height', '20px', 'important');
    s.setProperty('outline', 'none', 'important');
    s.setProperty('box-sizing', 'border-box', 'important');
    s.setProperty('transform', 'none', 'important');
  }

  function positionTrigger(btn, input) {
    if (!input.isConnected) {
      cleanupTrigger(input);
      return false;
    }
    const rect = input.getBoundingClientRect();
    const btnSize = 20;
    const pad = 6;

    let left = rect.right - btnSize - pad;
    const centerY = rect.top + rect.height / 2;

    if (left < 0) left = 0;

    btn.style.setProperty('left', Math.round(left) + 'px', 'important');
    btn.style.setProperty('top', Math.round(centerY) + 'px', 'important');
    btn.style.setProperty('transform', 'translateY(-50%)', 'important');
    return true;
  }

  function cleanupTrigger(input) {
    const reg = triggerRegistry.get(input);
    if (!reg) return;
    if (reg.ro) reg.ro.disconnect();
    if (reg.io) reg.io.disconnect();
    if (reg.checkTimer) clearInterval(reg.checkTimer);
    window.removeEventListener('scroll', reg.onScroll, true);
    window.removeEventListener('resize', reg.onResize);
    if (reg.btn && reg.btn.parentNode) reg.btn.remove();
    triggerRegistry.delete(input);
    if (input.dataset) delete input.dataset.tempboxAttached;
  }

  function attach(input) {
    if (input.dataset.tempboxAttached) return;
    if (!input.parentNode) return;
    if (input.closest('.tempbox-popover') || input.closest('.tempbox-otp-chip')) return;

    input.dataset.tempboxAttached = '1';

    try {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = TB.ICON_SVG;
      btn.title = 'TempBox';
      btn.className = 'tempbox-trigger';

      applyBtnStyles(btn);

      document.body.appendChild(btn);

      const update = () => positionTrigger(btn, input);

      const ro = new ResizeObserver(update);
      ro.observe(input);

      const io = new IntersectionObserver((entries) => {
        const visible = entries[0].isIntersecting;
        btn.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
        btn.style.setProperty('opacity', visible ? '1' : '0', 'important');
        if (visible) update();
      });
      io.observe(input);

      const onScroll = update;
      const onResize = update;
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);

      const checkTimer = setInterval(() => {
        if (!input.isConnected) {
          cleanupTrigger(input);
        }
      }, 1000);

      triggerRegistry.set(input, { btn, ro, io, onScroll, onResize, checkTimer });

      update();

      btn.addEventListener('mousedown', (e) => { e.preventDefault(); });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.blur();

        const popover = getPopover();

        if (activePopover === popover) {
          closeAll();
          return;
        }

        closeAll();
        activeInput = input;
        await renderPopover(popover, input);

        const rect = input.getBoundingClientRect();
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

      TB.Scanner.resizeObserver.observe(input);
    } catch (err) {
      delete input.dataset.tempboxAttached;
    }
  }

  window.TempBox.Popover = {
    closeAll,
    renderPopover,
    attach,
    getTrigger: (input) => {
      const reg = triggerRegistry.get(input);
      return reg ? reg.btn : null;
    },
    getActivePopover: () => activePopover,
    getActiveInput: () => activeInput,
    setActivePopover: (p) => { activePopover = p; },
    setActiveInput: (i) => { activeInput = i; }
  };
})();
