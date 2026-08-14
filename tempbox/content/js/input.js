window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  const TB = window.TempBox;

  function setNativeValue(input, value) {
    const type = input.type;
    let finalValue = String(value);

    if (type === 'number' || type === 'tel') {
      finalValue = finalValue.replace(/[^0-9.-]/g, '');
    }

    // Method 1: Standard descriptor
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, finalValue);
    } else {
      input.value = finalValue;
    }

    // Method 2: React 15+ value tracker
    const tracker = input._valueTracker;
    if (tracker && tracker.setValue) {
      try { tracker.setValue(''); } catch (e) {}
    }

    // Method 3: For contenteditable
    if (input.isContentEditable) {
      input.textContent = finalValue;
    }
  }

  function setContentEditableValue(el, value) {
    el.textContent = value;
    const events = [
      new Event('input', { bubbles: true }),
      new Event('change', { bubbles: true }),
      new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' })
    ];
    events.forEach(ev => {
      try { el.dispatchEvent(ev); } catch (e) {}
    });
  }

  function triggerInputEvents(input, value) {
    const val = String(value);
    const events = [
      new Event('focus', { bubbles: true }),
      new Event('beforeinput', { bubbles: true, cancelable: true }),
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: val, inputType: 'insertText' }),
      new Event('input', { bubbles: true }),
      new InputEvent('input', { bubbles: true, data: val, inputType: 'insertText' }),
      new Event('change', { bubbles: true }),
      new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }),
      new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' })
    ];

    events.forEach(ev => {
      try { input.dispatchEvent(ev); } catch (e) {}
    });

    const tracker = input._valueTracker;
    if (tracker && tracker.setValue) {
      try { tracker.setValue(''); } catch (e) {}
    }
  }

  function fillInput(input, value) {
    if (input.isContentEditable) {
      setContentEditableValue(input, value);
    } else {
      setNativeValue(input, value);
      triggerInputEvents(input, value);
    }
    input.focus();

    browser.runtime.sendMessage({
      action: 'trackEmail',
      email: value,
      url: location.href
    }).catch(() => {});

    TB.Popover.closeAll();
    TB.OTP.startWaitingForOTP(input);
  }

  window.TempBox.Input = {
    setNativeValue,
    setContentEditableValue,
    triggerInputEvents,
    fillInput
  };
})();
