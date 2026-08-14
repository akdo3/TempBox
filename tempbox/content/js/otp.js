window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  let chipRegistry = new Map();
  let chipFrame = null;
  let otpCheckInterval = null;
  let waitState = false;
  let pendingOTP = null;
  let lastShownCode = null;
  let lastShownTime = 0;

  function isWaitingForOTP() { return waitState; }

  function startWaitingForOTP(input) {
    waitState = true;
    const wrap = input.closest('.tempbox-wrap');
    if (wrap) {
      const trigger = wrap.querySelector('.tempbox-trigger');
      if (trigger) trigger.classList.add('waiting');
    }

    checkLatestOTP();
    if (otpCheckInterval) clearInterval(otpCheckInterval);
    otpCheckInterval = setInterval(() => {
      if (!waitState) {
        clearInterval(otpCheckInterval);
        otpCheckInterval = null;
        return;
      }
      checkLatestOTP();
    }, 2000);

    setTimeout(() => { stopWaitingForOTP(); }, 300000);
  }

  function stopWaitingForOTP() {
    waitState = false;
    if (otpCheckInterval) {
      clearInterval(otpCheckInterval);
      otpCheckInterval = null;
    }
    document.querySelectorAll('.tempbox-trigger.waiting').forEach(t => t.classList.remove('waiting'));
  }

  function repositionChips() {
    if (chipFrame) return;
    chipFrame = requestAnimationFrame(() => {
      chipFrame = null;
      chipRegistry.forEach((chip, id) => {
        if (!chip.isConnected) { chipRegistry.delete(id); return; }
        const inputId = chip.dataset.inputId;
        const input = document.querySelector(`[data-tempbox-id="${inputId}"]`);
        if (!input || !input.isConnected) { chip.remove(); chipRegistry.delete(id); return; }
        const rect = input.getBoundingClientRect();
        const margin = 8;
        const chipW = chip.offsetWidth;
        const chipH = chip.offsetHeight;

        let left = rect.left;
        let top = rect.bottom + margin;
        if (top + chipH > window.innerHeight - 8) top = rect.top - chipH - margin;
        if (left + chipW > window.innerWidth - 8) left = window.innerWidth - chipW - 8;
        if (left < 8) left = 8;
        if (top < 8) top = 8;

        chip.style.left = `${left}px`;
        chip.style.top = `${top}px`;
      });
    });
  }

  function fillSplitInputs(otpInputs, code) {
    const cleanCode = code.replace(/[^A-Za-z0-9]/g, '');
    const sorted = [...otpInputs].sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top || rectA.left - rectB.left;
    });

    const limit = Math.min(cleanCode.length, sorted.length);
    for (let i = 0; i < limit; i++) {
      const inp = sorted[i];
      const char = cleanCode[i];
      TB.Input.setNativeValue(inp, char);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
      inp.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: char }));
      inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
    }
    sorted[limit - 1]?.focus();
  }

  function fillSingleInput(input, code) {
    const inp = input;
    if (TB.isEmailField(inp)) return;
    TB.Input.setNativeValue(inp, code);
    TB.Input.triggerInputEvents(inp);
    inp.focus();
  }

  function showOTPChip(input, code) {
    stopWaitingForOTP();

    if (code === lastShownCode && Date.now() - lastShownTime < 3000) return;
    if (TB.isEmailField(input)) return;

    const otpInputs = TB.findOTPInputs();
    const isSplit = otpInputs.length > 1 && otpInputs.some(el => {
      const mx = el.getAttribute('maxlength');
      return mx === '1' || el.maxLength === 1;
    });

    const targetInput = isSplit ? otpInputs[0] : input;

    if (targetInput.dataset.tempboxOtp === code) return;
    targetInput.dataset.tempboxOtp = code;

    const oldChip = document.querySelector(`.tempbox-otp-chip[data-input-id="${targetInput.dataset.tempboxId || ''}"]`);
    if (oldChip) { oldChip.remove(); chipRegistry.delete(oldChip.dataset.otpId); }

    if (!targetInput.dataset.tempboxId) {
      targetInput.dataset.tempboxId = Math.random().toString(36).slice(2);
    }

    const rect = targetInput.getBoundingClientRect();
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tempbox-otp-chip';
    chip.dataset.inputId = targetInput.dataset.tempboxId;
    chip.dataset.otpId = Math.random().toString(36).slice(2);
    chip.textContent = code;

    const isDark = TB.detectSiteTheme() === 'dark';
    if (isDark) chip.classList.add('dark');

    const margin = 8;
    const chipW = Math.max(90, code.length * 10 + 40);
    const chipH = 34;

    let left = rect.left;
    let top = rect.bottom + margin;
    if (top + chipH > window.innerHeight - 8) top = rect.top - chipH - margin;
    if (left + chipW > window.innerWidth - 8) left = window.innerWidth - chipW - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    chip.style.left = `${left}px`;
    chip.style.top = `${top}px`;

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const otpInputs = TB.findOTPInputs();
      const isSplit = otpInputs.length > 1 && otpInputs.some(el => {
        const mx = el.getAttribute('maxlength');
        return mx === '1' || el.maxLength === 1;
      });

      if (isSplit) {
        fillSplitInputs(otpInputs, code);
      } else {
        fillSingleInput(input, code);
      }

      chip.remove();
      chipRegistry.delete(chip.dataset.otpId);
      delete targetInput.dataset.tempboxOtp;
    });

    document.body.appendChild(chip);
    chipRegistry.set(chip.dataset.otpId, chip);

    lastShownCode = code;
    lastShownTime = Date.now();

    setTimeout(() => {
      if (chip.parentNode) { chip.remove(); chipRegistry.delete(chip.dataset.otpId); }
      if (targetInput.dataset.tempboxOtp === code) delete targetInput.dataset.tempboxOtp;
    }, 300000);
  }

  async function checkLatestOTP() {
    const inputs = TB.findOTPInputs();
    if (!inputs.length) return;

    const hasExplicitOTP = inputs.some(el =>
      el.autocomplete === 'one-time-code' ||
      el.getAttribute('maxlength') === '1' ||
      el.maxLength === 1
    );

    if (!hasExplicitOTP) {
      const pickRes = await browser.runtime.sendMessage({ action: 'pick' });
      if (!pickRes.ok) return;
    }

    const res = await browser.runtime.sendMessage({ action: 'getLatestOTP' });
    if (res && res.code) showOTPChip(inputs[0], res.code);
  }

  window.TempBox.OTP = {
    startWaitingForOTP,
    stopWaitingForOTP,
    isWaitingForOTP,
    repositionChips,
    showOTPChip,
    checkLatestOTP,
    setPendingOTP: (code) => { pendingOTP = code; },
    getPendingOTP: () => pendingOTP,
    clearPendingOTP: () => { pendingOTP = null; },
    get chipRegistry() { return chipRegistry; }
  };
})();
