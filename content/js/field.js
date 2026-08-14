window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  function isEmailField(el) {
    if (!el || el.dataset.tempboxAttached) return false;
    if (el.closest('.tempbox-popover') || el.closest('.tempbox-otp-chip')) return false;

    if (el.isContentEditable) {
      const text = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.className || '').toLowerCase();
      return /\b(email|e-mail|mail|username|login|account)\b/.test(text);
    }

    if (el.tagName !== 'INPUT') return false;

    const t = (el.type || '').toLowerCase();
    if (t === 'email') return true;
    if (t === 'password') return false;

    const n = (el.name || '').toLowerCase();
    const i = (el.id || '').toLowerCase();
    const p = (el.placeholder || '').toLowerCase();
    const a = (el.autocomplete || '').toLowerCase();
    const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const inputmode = (el.getAttribute('inputmode') || '').toLowerCase();

    const str = `${n} ${i} ${p} ${a} ${lbl} ${cls}`;

    if (/\b(code|otp|pin|password|passcode)\b/.test(str)) return false;
    if (inputmode === 'email') return true;

    const keys = ['email', 'e-mail', 'mail', 'username', 'login', 'account', 'identifier', 'user'];
    return keys.some(k => str.includes(k)) || a.includes('email');
  }

  function findOTPInputs() {
    const inputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'
    ));
    const visibleInputs = inputs.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!visibleInputs.length) return [];

    const otc = visibleInputs.filter(el => el.autocomplete === 'one-time-code');
    if (otc.length > 0) return otc;

    // Split inputs (character-by-character)
    const splitInputs = visibleInputs.filter(el => {
      const mx = el.getAttribute('maxlength');
      const isMaxLenOne = mx === '1' || el.maxLength === 1;
      const isSizeOne = el.getAttribute('size') === '1' || el.size === 1;
      const cls = (el.className || '').toLowerCase();
      const hasCharClass = cls.includes('character') || cls.includes('digit') || cls.includes('single') ||
                           cls.includes('pin-') || cls.includes('otp-') || cls.includes('code-') ||
                           cls.includes('char-') || cls.includes('num-');
      return isMaxLenOne || isSizeOne || hasCharClass;
    });

    if (splitInputs.length >= 2) {
      const sorted = [...splitInputs].sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.top - rectB.top || rectA.left - rectB.left;
      });
      const groups = [];
      let currentGroup = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const prev = currentGroup[currentGroup.length - 1];
        const prevRect = prev.getBoundingClientRect();
        const currRect = sorted[i].getBoundingClientRect();
        const dist = Math.abs(currRect.left - (prevRect.left + prevRect.width));
        const sameRow = Math.abs(currRect.top - prevRect.top) < 30;
        if (sameRow && dist < 60) {
          currentGroup.push(sorted[i]);
        } else {
          if (currentGroup.length >= 2) groups.push(currentGroup);
          currentGroup = [sorted[i]];
        }
      }
      if (currentGroup.length >= 2) groups.push(currentGroup);
      if (groups.length > 0) {
        return groups.reduce((a, b) => a.length > b.length ? a : b);
      }
    }

    // Keyword-based detection
    const keywordInputs = visibleInputs.filter(el => {
      if (isEmailField(el)) return false;

      const props = [
        el.name, el.id, el.className, el.placeholder,
        el.getAttribute('aria-label'), el.getAttribute('aria-labelledby'),
        el.getAttribute('aria-describedby'), el.getAttribute('inputmode'),
        el.getAttribute('autocomplete'), el.getAttribute('pattern')
      ].filter(Boolean).join(' ').toLowerCase();

      let labelText = '';
      if (el.id) {
        try {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l) labelText += ' ' + l.textContent.toLowerCase();
        } catch (e) {}
      }

      const p = el.closest('label, .form-group, fieldset, [role="group"], div[class*="otp"], div[class*="pin"], div[class*="code"], div[class*="verify"], div[class*="2fa"], div[class*="mfa"], div[class*="auth"], div[class*="security"]');
      if (p) labelText += ' ' + p.textContent.toLowerCase();

      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        try {
          const ids = ariaLabelledBy.split(' ');
          for (const id of ids) {
            const el2 = document.getElementById(id);
            if (el2) labelText += ' ' + el2.textContent.toLowerCase();
          }
        } catch (e) {}
      }

      const combined = props + ' ' + labelText;

      const otpKeywords = /\b(otp|one.time|one_time|onetime|verification.code|verify.code|auth.code|security.code|2fa|mfa|totp|passcode|pin.code|pincode|access.code|activation.code|confirmation.code|login.code|signin.code|authorize.code|approval.code|authenticator.code)\b/;
      const hasOTPKeyword = otpKeywords.test(combined);

      const codeKeywords = /\b(code|number|digit|pin|otp|passcode|token|verify|verification|auth|security|2fa|mfa|confirm|authenticator|launch|approval|activation)\b/;
      const hasCodeKeyword = codeKeywords.test(combined);

      const numericIndicators = el.type === 'number' || el.type === 'tel' ||
                                el.getAttribute('inputmode') === 'numeric' ||
                                el.getAttribute('inputmode') === 'tel' ||
                                /^\d+$/.test(el.getAttribute('pattern') || '') ||
                                /^\[\d-]+\$|^\d\{/.test(el.getAttribute('pattern') || '');

      return (hasOTPKeyword && hasCodeKeyword) ||
             (hasOTPKeyword && numericIndicators) ||
             (hasCodeKeyword && numericIndicators && /(?:code|pin|otp|token)/.test(combined));
    });

    if (keywordInputs.length > 0) return keywordInputs;

    // Numeric inputs near verification text
    const numericInputs = visibleInputs.filter(el => {
      if (isEmailField(el)) return false;
      const type = el.type;
      const inputmode = el.getAttribute('inputmode');
      const pattern = el.getAttribute('pattern');
      const isNumeric = type === 'number' || type === 'tel' || inputmode === 'numeric' || inputmode === 'tel' ||
                        /^\[\d-]+\$|^\d\{/.test(pattern || '') ||
                        /^\d+$/.test(pattern || '');
      if (!isNumeric) return false;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      try {
        const surrounding = document.elementsFromPoint(centerX, centerY);
        for (const surr of surrounding) {
          const text = (surr.textContent || '').toLowerCase();
          if (/(verify|verification|code|otp|pin|2fa|mfa|security|authenticate|confirm|login|signin|auth)/.test(text)) {
            return true;
          }
        }
      } catch (e) {}
      return false;
    });

    if (numericInputs.length > 0) return numericInputs;

    return [];
  }

  window.TempBox.isEmailField = isEmailField;
  window.TempBox.findOTPInputs = findOTPInputs;
})();
