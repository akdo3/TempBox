let _cachedTabTheme = null;
let _cachedTabThemeTime = 0;
let _cachedTabId = null;

async function getActiveTabTheme() {
  const now = Date.now();
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      _cachedTabTheme = 'light';
      _cachedTabThemeTime = now;
      _cachedTabId = null;
      return 'light';
    }
    const tab = tabs[0];
    if (!tab.url || !/^https?:\/\//.test(tab.url)) {
      _cachedTabTheme = 'light';
      _cachedTabThemeTime = now;
      _cachedTabId = null;
      return 'light';
    }

    if (_cachedTabTheme && _cachedTabId === tab.id && (now - _cachedTabThemeTime < 3000)) {
      return _cachedTabTheme;
    }

    const detectionCode = `
      (function() {
        function isDarkColor(rgbStr) {
          const m = rgbStr.match(/rgba?\\((\\d+)[\\s,]+(\\d+)[\\s,]+(\\d+)(?:[\\s,]+([\\d.]+))?\\)/i);
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
            const alphaMatch = bg.match(/rgba?\\(\\d+,\\s*\\d+,\\s*\\d+,\\s*([\\d.]+)\\)/);
            if (!alphaMatch || parseFloat(alphaMatch[1]) >= 0.35) return bg;
          }
          const bgImage = style.backgroundImage;
          if (bgImage && bgImage !== 'none') {
            if (/linear-gradient.*(?:rgb\\(\\s*0,\\s*0,\\s*0|#0{3,6}|black|dark)/i.test(bgImage)) return 'rgb(0,0,0)';
            if (/linear-gradient.*(?:rgb\\(\\s*255,\\s*255,\\s*255|#f{3,6}|white|light)/i.test(bgImage)) return 'rgb(255,255,255)';
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
      })()
    `;

    const results = await browser.tabs.executeScript(tab.id, { code: detectionCode });
    const theme = (results && results[0]) || 'light';
    _cachedTabTheme = theme;
    _cachedTabThemeTime = now;
    _cachedTabId = tab.id;
    return theme;
  } catch (e) {
    _cachedTabTheme = 'light';
    _cachedTabThemeTime = now;
    _cachedTabId = null;
    return 'light';
  }
}

async function applyPopupTheme(theme) {
  let isDark = false;
  if (theme === 'auto-site') {
    const siteTheme = await getActiveTabTheme();
    isDark = siteTheme === 'dark';
  } else if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.body.classList.toggle('dark-mode', isDark);
}

async function initTheme() {
  const { popupTheme = 'auto-site' } = await browser.storage.local.get('popupTheme');
  await applyPopupTheme(popupTheme);
  updateThemeUI();
}

async function updateThemeUI() {
  const { popupTheme = 'auto-site', sitePopoverTheme = 'auto' } = await browser.storage.local.get(['popupTheme', 'sitePopoverTheme']);
  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.classList.remove('active');
    const target = btn.dataset.target;
    const theme = btn.dataset.theme;
    if ((target === 'popup' && theme === popupTheme) ||
        (target === 'site' && theme === sitePopoverTheme)) {
      btn.classList.add('active');
    }
  });
}

async function getMessageTheme() {
  try {
    const siteTheme = await getActiveTabTheme();
    return siteTheme;
  } catch (e) {
    return 'light';
  }
}
