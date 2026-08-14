window.TempBox = window.TempBox || {};

(function() {
  'use strict';

  function isDarkColor(rgbStr) {
    const m = rgbStr.match(/rgba?\((\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,]+([\d.]+))?\)/i);
    if (!m) return false;
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a < 0.35) return false;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
  }

  function getElementBg(el) {
    if (!el) return null;
    const style = window.getComputedStyle(el);
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const alphaMatch = bg.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
      if (!alphaMatch || parseFloat(alphaMatch[1]) >= 0.35) return bg;
    }
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      if (/linear-gradient.*(?:rgb\(\s*0,\s*0,\s*0|#0{3,6}|black|dark)/i.test(bgImage)) return 'rgb(0,0,0)';
      if (/linear-gradient.*(?:rgb\(\s*255,\s*255,\s*255|#f{3,6}|white|light)/i.test(bgImage)) return 'rgb(255,255,255)';
    }
    return null;
  }

  function findLargestVisibleElement() {
    const candidates = document.querySelectorAll('div, section, main, article, header, nav, aside');
    let largest = null, maxArea = 0;
    const viewportArea = window.innerWidth * window.innerHeight;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && area > viewportArea * 0.25) { maxArea = area; largest = el; }
    }
    return largest;
  }

  function detectSiteTheme() {
    try {
      const html = document.documentElement;
      const body = document.body;

      const dataTheme = html.dataset.theme || body?.dataset.theme || html.getAttribute('data-color-mode') || body?.getAttribute('data-color-mode');
      if (dataTheme) {
        if (/dark/i.test(dataTheme)) return 'dark';
        if (/light/i.test(dataTheme)) return 'light';
      }

      const htmlBg = getElementBg(html);
      if (htmlBg) return isDarkColor(htmlBg) ? 'dark' : 'light';

      const bodyBg = getElementBg(body);
      if (bodyBg) return isDarkColor(bodyBg) ? 'dark' : 'light';

      const centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (centerEl) {
        let el = centerEl;
        while (el && el !== body && el !== html) {
          const bg = getElementBg(el);
          if (bg) return isDarkColor(bg) ? 'dark' : 'light';
          el = el.parentElement;
        }
      }

      const largest = findLargestVisibleElement();
      if (largest) {
        const bg = getElementBg(largest);
        if (bg) return isDarkColor(bg) ? 'dark' : 'light';
      }

      const scheme = html.style.colorScheme || getComputedStyle(html).colorScheme;
      if (scheme === 'dark') return 'dark';
      if (scheme === 'light') return 'light';

      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        const content = meta.content;
        if (content.includes('dark')) return 'dark';
        if (content.includes('light')) return 'light';
      }

      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      return 'light';
    } catch (e) { return 'light'; }
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

  window.TempBox.isDarkColor = isDarkColor;
  window.TempBox.getElementBg = getElementBg;
  window.TempBox.findLargestVisibleElement = findLargestVisibleElement;
  window.TempBox.detectSiteTheme = detectSiteTheme;
  window.TempBox.resolveTheme = resolveTheme;
  window.TempBox.applyTheme = applyTheme;
})();
