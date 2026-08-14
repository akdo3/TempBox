window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  let activePopover = null;
  let activeInput = null;
  let popoverPool = null; // Reuse DOM element

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

  function attach(input) {
    if (input.dataset.tempboxAttached) return;
    if (!input.parentNode) return;
    if (input.closest('.tempbox-popover') || input.closest('.tempbox-otp-chip')) return;

    input.dataset.tempboxAttached = '1';

    try {
      const wrap = document.createElement('div');
      wrap.className = 'tempbox-wrap';

      const computed = window.getComputedStyle(input);
      const width = computed.width === 'auto' ? '100%' : computed.width;
      wrap.style.width = width;
      wrap.style.display = computed.display === 'block' || computed.display === 'flex' ? 'block' : 'inline-block';
      wrap.style.position = 'relative';

      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement('button');
      btn.className = 'tempbox-trigger';
      btn.type = 'button';
      btn.innerHTML = TB.ICON_SVG;
      btn.title = 'TempBox';
      wrap.appendChild(btn);

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

      TB.Scanner.resizeObserver.observe(input);
    } catch (err) {
      delete input.dataset.tempboxAttached;
    }
  }

  window.TempBox.Popover = {
    closeAll,
    renderPopover,
    attach,
    getActivePopover: () => activePopover,
    getActiveInput: () => activeInput,
    setActivePopover: (p) => { activePopover = p; },
    setActiveInput: (i) => { activeInput = i; }
  };
})();
