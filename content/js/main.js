window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sitePopoverTheme && TB.Popover.getActivePopover()) {
      TB.applyTheme(TB.Popover.getActivePopover(), changes.sitePopoverTheme.newValue);
    }
    if (changes.emails && TB.Popover.getActivePopover() && TB.Popover.getActiveInput()) {
      TB.Popover.renderPopover(TB.Popover.getActivePopover(), TB.Popover.getActiveInput());
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const { sitePopoverTheme = 'auto' } = await browser.storage.local.get('sitePopoverTheme');
    if (sitePopoverTheme === 'system' && TB.Popover.getActivePopover()) {
      TB.applyTheme(TB.Popover.getActivePopover(), 'system');
    }
  });

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) {
      if (TB.isEmailField(target) && !target.dataset.tempboxAttached) {
        TB.Popover.attach(target);
      }
    }
  }, true);

  const onViewportChange = () => {
    TB.OTP.repositionChips();
    if (TB.Popover.getActivePopover()?.classList.contains('active')) {
      TB.Popover.closeAll();
    }
  };

  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  document.addEventListener('click', (e) => {
    const popover = TB.Popover.getActivePopover();
    if (popover && !popover.contains(e.target) && !e.target.closest('.tempbox-trigger')) {
      TB.Popover.closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      TB.Popover.closeAll();
      document.querySelectorAll('.tempbox-otp-chip').forEach(chip => {
        chip.remove();
        TB.OTP.chipRegistry.delete(chip.dataset.otpId);
      });
    }
  });

  const observer = new MutationObserver(() => {
    TB.Scanner.scan();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    TB.Scanner.resizeObserver.disconnect();
    TB.Scanner.intersectionObserver.disconnect();
    TB.OTP.stopWaitingForOTP();
  });

  let fastScanInterval = null;
  setInterval(() => {
    TB.Scanner.scan();
    if (TB.OTP.isWaitingForOTP()) {
      if (!fastScanInterval) {
        fastScanInterval = setInterval(() => {
          if (!TB.OTP.isWaitingForOTP()) {
            clearInterval(fastScanInterval);
            fastScanInterval = null;
            return;
          }
          TB.Scanner.scan();
        }, 1000);
      }
    } else if (fastScanInterval) {
      clearInterval(fastScanInterval);
      fastScanInterval = null;
    }
  }, 5000);

  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'getSiteTheme') {
      sendResponse({ theme: TB.detectSiteTheme() });
      return true;
    }
    if (req.action === 'otp') {
      TB.OTP.setPendingOTP(req.code);
      const inputs = TB.findOTPInputs();
      if (inputs.length) {
        TB.OTP.showOTPChip(inputs[0], req.code);
        TB.OTP.clearPendingOTP();
      } else {
        setTimeout(() => {
          const inputs = TB.findOTPInputs();
          if (inputs.length && TB.OTP.getPendingOTP()) {
            TB.OTP.showOTPChip(inputs[0], TB.OTP.getPendingOTP());
            TB.OTP.clearPendingOTP();
          }
        }, 2000);
      }
      return false;
    }
    if (req.action === 'fillFromMenu') {
      const active = document.activeElement;
      if (active && TB.isEmailField(active)) {
        browser.runtime.sendMessage({ action: 'pick' }).then(res => {
          if (res.ok) TB.Input.fillInput(active, res.address);
        }).catch(() => {});
      }
      return false;
    }
    if (req.action === 'emailsUpdated') {
      if (TB.Popover.getActivePopover() && TB.Popover.getActiveInput()) {
        TB.Popover.renderPopover(TB.Popover.getActivePopover(), TB.Popover.getActiveInput());
      }
      return false;
    }
    return false;
  });

  TB.Scanner.scan();
  TB.OTP.checkLatestOTP();
})();
