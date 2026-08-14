function sanitizeEmailHtml(rawHtml) {
  if (!rawHtml) return { head: '', body: '', hasBody: false };
  const html = Array.isArray(rawHtml) ? rawHtml.join('') : String(rawHtml);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const dangerous = [
    'script', 'noscript', 'form', 'input', 'textarea', 'button', 'select',
    'option', 'optgroup', 'fieldset', 'legend', 'label', 'datalist', 'output',
    'object', 'embed', 'iframe', 'frame', 'frameset', 'canvas',
    'audio', 'video', 'source', 'track', 'map', 'area', 'applet',
    'bgsound', 'template', 'slot', 'portal', 'fencedframe'
  ];
  dangerous.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  doc.querySelectorAll('link').forEach(el => {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    const href = (el.getAttribute('href') || '').toLowerCase();
    if (rel === 'stylesheet' || rel === 'import' || href.endsWith('.css')) {
      el.remove();
    }
  });

  doc.querySelectorAll('meta').forEach(el => {
    const equiv = (el.getAttribute('http-equiv') || '').toLowerCase();
    if (['refresh', 'set-cookie', 'content-security-policy'].includes(equiv)) {
      el.remove();
    }
  });

  doc.querySelectorAll('font, basefont').forEach(el => {
    el.removeAttribute('color');
    el.removeAttribute('face');
    el.removeAttribute('size');
  });

  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.hasAttribute('hidden')) {
      node.removeAttribute('hidden');
    }

    if (node.getAttribute('aria-hidden') === 'true') {
      node.removeAttribute('aria-hidden');
    }

    if (node.getAttribute('tabindex') === '-1') {
      node.removeAttribute('tabindex');
    }

    if (node.hasAttribute('class')) {
      const filtered = filterClasses(node.getAttribute('class'));
      if (filtered) node.setAttribute('class', filtered);
      else node.removeAttribute('class');
    }

    if (node.hasAttribute('bgcolor')) node.removeAttribute('bgcolor');
    if (node.hasAttribute('text')) node.removeAttribute('text');
    if (node.hasAttribute('background')) node.removeAttribute('background');
    if (node.tagName === 'BODY') {
      node.removeAttribute('link');
      node.removeAttribute('vlink');
      node.removeAttribute('alink');
    }

    if (node.hasAttribute('height')) {
      const h = node.getAttribute('height');
      if (h === '0' || h === '1' || h === '0px' || h === '1px') node.removeAttribute('height');
    }
    if (node.hasAttribute('width')) {
      const w = node.getAttribute('width');
      if (w === '0' || w === '1' || w === '0px' || w === '1px') node.removeAttribute('width');
    }

    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (['srcdoc', 'formaction', 'form', 'action', 'method', 'dynsrc', 'lowsrc', 'poster', 'background', 'xmlns', 'xmlns:xlink'].includes(name)) {
        node.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'src' || name === 'href' || name === 'data' || name === 'xlink:href' || name === 'action') &&
          (/^javascript:/i.test(value) || /^vbscript:/i.test(value) || /^data:text\/html/i.test(value) || /^file:/i.test(value))) {
        node.removeAttribute(attr.name);
        continue;
      }
    }

    if (node.tagName === 'A') {
      const href = (node.getAttribute('href') || '').trim();
      if (!href || /^javascript:/i.test(href) || /^vbscript:/i.test(href) || /^data:text\/html/i.test(href)) {
        node.removeAttribute('href');
        node.style.cssText = (node.getAttribute('style') || '') + ';color:inherit;text-decoration:none;cursor:text;';
      } else {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (node.tagName === 'IMG') {
      node.style.maxWidth = '100%';
      node.style.height = 'auto';
      node.removeAttribute('onerror');
      node.setAttribute('loading', 'lazy');
      if (!node.hasAttribute('alt')) node.setAttribute('alt', '');
      const src = node.getAttribute('src') || '';
      if (!src.trim() || (src.startsWith('data:') && src.length < 100)) {
        node.style.display = 'none';
      }
    }

    if (node.hasAttribute('style')) {
      let st = node.getAttribute('style');
      st = sanitizeCssString(st);
      if (st) node.setAttribute('style', st);
      else node.removeAttribute('style');
    }
  }

  doc.querySelectorAll('style').forEach(style => {
    let css = style.textContent || '';
    css = sanitizeCssString(css);
    if (css.trim()) style.textContent = css;
    else style.remove();
  });

  doc.querySelectorAll('table').forEach(table => {
    const parent = table.parentNode;
    if (parent && parent.tagName !== 'DIV' && parent.className !== 'tb-table-wrap') {
      const wrapper = doc.createElement('div');
      wrapper.className = 'tb-table-wrap';
      wrapper.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;';
      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });

  const headHtml = doc.head ? doc.head.innerHTML : '';
  const bodyHtml = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;

  return {
    head: headHtml,
    body: bodyHtml,
    hasBody: !!(doc.body && doc.body.innerHTML.trim().length > 0)
  };
}

function filterClasses(className) {
  if (!className) return '';
  const hiddenPatterns = [
    /hidden/i, /hide/i, /invisible/i, /transparent/i,
    /collapse/i, /ghost/i, /blank/i, /empty/i,
    /mso/i, /outlook/i
  ];
  const classes = className.split(/\s+/).filter(c => {
    return !hiddenPatterns.some(p => p.test(c));
  });
  return classes.join(' ');
}

function sanitizeCssString(css) {
  if (!css) return '';
  css = css.replace(/@import\s+[^;]+;/gi, '');
  css = css.replace(/expression\s*\([^)]*\)/gi, '');
  css = css.replace(/-moz-binding\s*:[^;]+;/gi, '');
  css = css.replace(/behavior\s*:[^;]+;/gi, '');
  css = css.replace(/@keyframes\s+[^\{]+\{[^}]*\}/gi, '');
  css = css.replace(/url\s*\(\s*(['"]?)(?!data:)[^'")]*\1\s*\)/gi, 'url()');

  const hidingPatterns = [
    /display\s*:\s*none\s*;?/gi,
    /display\s*:\s*none\s*!important\s*;?/gi,
    /visibility\s*:\s*hidden\s*;?/gi,
    /visibility\s*:\s*hidden\s*!important\s*;?/gi,
    /opacity\s*:\s*0\s*;?/gi,
    /opacity\s*:\s*0\.0+\s*;?/gi,
    /opacity\s*:\s*0\s*!important\s*;?/gi,
    /filter\s*:\s*opacity\s*\(\s*0\s*\)\s*;?/gi,
    /filter\s*:\s*alpha\s*\(\s*opacity\s*=\s*0\s*\)\s*;?/gi,
    /-ms-filter\s*:\s*['"]?progid:DXImageTransform.Microsoft.Alpha\(Opacity=0\)\s*;?/gi,
    /max-height\s*:\s*0\s*;?/gi,
    /max-width\s*:\s*0\s*;?/gi,
    /height\s*:\s*0\s*;?/gi,
    /width\s*:\s*0\s*;?/gi,
    /height\s*:\s*0px\s*;?/gi,
    /width\s*:\s*0px\s*;?/gi,
    /height\s*:\s*1px\s*;?/gi,
    /width\s*:\s*1px\s*;?/gi,
    /clip\s*:\s*rect\s*\(\s*0[^)]*\)\s*;?/gi,
    /clip-path\s*:\s*(inset\s*\(\s*100%\s*\)|circle\s*\(\s*0\s*\)|polygon\s*\(\s*0\s+0\s*\))\s*;?/gi,
    /transform\s*:\s*[^;]*scale\s*\(\s*0\s*\)[^;]*;?/gi,
    /transform\s*:\s*[^;]*scale3d\s*\(\s*0[^)]*\)[^;]*;?/gi,
    /position\s*:\s*fixed\s*;?/gi,
    /position\s*:\s*absolute\s*;?/gi,
    /left\s*:\s*-9999[^;]*;?/gi,
    /top\s*:\s*-9999[^;]*;?/gi,
    /margin-left\s*:\s*-9999[^;]*;?/gi,
    /margin-top\s*:\s*-9999[^;]*;?/gi,
    /z-index\s*:\s*-9999[^;]*;?/gi,
    /pointer-events\s*:\s*none\s*;?/gi,
    /overflow\s*:\s*hidden\s*;?/gi
  ];

  hidingPatterns.forEach(p => {
    css = css.replace(p, '');
  });

  css = css.replace(/position\s*:\s*fixed\s*;?/gi, 'position:relative;');
  css = css.replace(/position\s*:\s*absolute\s*;?/gi, 'position:relative;');

  return css;
}
