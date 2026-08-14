window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const input = entry.target;
      if (TB.isEmailField(input) && !input.dataset.tempboxAttached) {
        TB.Popover.attach(input);
      }
      if (TB.findOTPInputs().includes(input) && !input.dataset.tempboxOtp) {
        const pending = TB.OTP.getPendingOTP();
        if (pending) {
          TB.OTP.showOTPChip(input, pending);
          TB.OTP.clearPendingOTP();
        }
      }
    }
  });

  const intersectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const input = entry.target;
      if (entry.isIntersecting && TB.isEmailField(input) && !input.dataset.tempboxAttached) {
        TB.Popover.attach(input);
      }
    }
  }, { threshold: 0 });

  function scan(root, depth) {
    root = root || document;
    depth = depth || 0;
    if (depth > 5) return;

    const inputs = root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"])');
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      if (TB.isEmailField(el)) TB.Popover.attach(el);
    }

    const editables = root.querySelectorAll('[contenteditable="true"]');
    for (let i = 0; i < editables.length; i++) {
      const el = editables[i];
      if (TB.isEmailField(el)) TB.Popover.attach(el);
    }

    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.shadowRoot) {
        scan(el.shadowRoot, depth + 1);
      }
    }

    const iframes = root.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (iframeDoc) {
          scan(iframeDoc, depth + 1);
        }
      } catch (e) {}
    }

    const pending = TB.OTP.getPendingOTP();
    if (pending) {
      const otpInputs = TB.findOTPInputs();
      if (otpInputs.length) {
        TB.OTP.showOTPChip(otpInputs[0], pending);
        TB.OTP.clearPendingOTP();
      }
    }
  }

  window.TempBox.Scanner = {
    resizeObserver,
    intersectionObserver,
    scan,
    debouncedScan: scan
  };
})();
