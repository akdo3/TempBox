async function showMessageDetail(msg, token) {
  window.currentDetailMessage = { msg, token };
  const list = $('emailList');

  const combinedText = (msg.subject || '') + ' ' + (msg.text || '') + ' ' + (msg.html || '');
  const hasRtl = /[֐-ࣿ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿؀-ۿ]/.test(combinedText);
  const dir = hasRtl ? 'rtl' : 'ltr';

  let emailHead = '';
  let emailBody = '';
  let isHtml = false;

  if (msg.html) {
    const sanitized = sanitizeEmailHtml(msg.html);
    emailHead = sanitized.head || '';
    emailBody = sanitized.body || '';
    isHtml = true;
  } else if (msg.text) {
    const text = Array.isArray(msg.text) ? msg.text.join('') : String(msg.text);
    emailBody = formatPlainText(text, dir);
    isHtml = false;
  } else {
    emailBody = '<em style="opacity:0.6;">No content</em>';
    isHtml = false;
  }

  const msgTheme = await getMessageTheme();
  const msgBg = msgTheme === 'dark' ? '#1c1c1e' : '#ffffff';
  const msgColor = msgTheme === 'dark' ? '#f5f5f7' : '#1d1d1f';
  const msgBorder = msgTheme === 'dark' ? '#3a3a3c' : '#e5e5ea';

  const overrideCss = buildOverrideCss(dir, msgBg, msgColor);

  const colorFixScript = `<script>
(function(){
  function rgbToLum(s){
    var m=s.match(/rgba?\\((\\d+)[\\s,]+(\\d+)[\\s,]+(\\d+)\\)/i);
    if(!m)return 0.5;
    var r=parseInt(m[1])/255,g=parseInt(m[2])/255,b=parseInt(m[3])/255;
    var a=[r,g,b].map(function(v){return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return a[0]*0.2126+a[1]*0.7152+a[2]*0.0722;
  }
  function getBg(el){
    var cs=getComputedStyle(el),bg=cs.backgroundColor;
    if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')return bg;
    var p=el.parentElement;
    while(p){
      var b=getComputedStyle(p).backgroundColor;
      if(b&&b!=='rgba(0, 0, 0, 0)'&&b!=='transparent')return b;
      p=p.parentElement;
    }
    return '${msgBg}';
  }
  function fix(){
    var els=document.querySelectorAll('body, body *');
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(!el.textContent.trim().length)continue;
      var col=getComputedStyle(el).color;
      var bkg=getBg(el);
      var cl=rgbToLum(col),bl=rgbToLum(bkg);
      var ratio=(Math.max(cl,bl)+0.05)/(Math.min(cl,bl)+0.05);
      if(ratio<2.2){
        var dark=bl<0.5;
        el.style.setProperty('color',dark?'#f5f5f7':'#1d1d1f','important');
      }
    }
  }
  if(document.readyState==='complete'||document.readyState==='interactive')fix();
  else document.addEventListener('DOMContentLoaded',fix);
})();
</script>`;

  const iframeDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<base target="_blank">
<style>${overrideCss}</style>
${emailHead}
</head>
<body>
${emailBody}
${colorFixScript}
</body>
</html>`;

  const wrapper = document.createElement('div');
  wrapper.className = 'message-view-wrapper';
  wrapper.innerHTML = `
    <div class="message-view-header">
      <button class="message-view-back" id="msgDetailBack">&#8592; Back</button>
      <div class="message-view-title" style="font-weight:600;">${escapeHtml(msg.subject || '(No subject)')}</div>
    </div>
    <div class="message-detail-meta-bar">
      <div class="message-detail-from">
        <span class="detail-label">From:</span>
        <span class="detail-value">${escapeHtml(msg.from?.name ? msg.from.name + ' <' + msg.from.address + '>' : (msg.from?.address || 'Unknown'))}</span>
      </div>
      <div class="message-detail-date">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${formatMessageDate(msg.createdAt)}</span>
      </div>
    </div>
    <div class="message-detail-frame-wrap" id="msgFrameWrap">
      <iframe class="message-detail-iframe" id="msgIframe" sandbox="allow-same-origin allow-popups allow-scripts" scrolling="no" loading="eager" title="Email content"></iframe>
    </div>
  `;

  list.innerHTML = '';
  list.appendChild(wrapper);

  const frameWrap = $('msgFrameWrap');
  if (frameWrap) {
    frameWrap.style.background = msgBg;
    frameWrap.style.borderColor = msgBorder;
  }

  const iframe = $('msgIframe');
  if (!iframe) return;

  iframe.style.opacity = '0';
  iframe.style.transition = 'opacity 0.12s ease, transform 0.2s ease';

  requestAnimationFrame(() => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(iframeDoc);
      doc.close();

      doc.querySelectorAll('a[href]').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const href = a.getAttribute('href');
          if (href && !href.startsWith('javascript:') && !href.startsWith('vbscript:') && !href.startsWith('data:')) {
            window.open(href, '_blank');
          }
        });
      });

      const updateHeight = () => {
        try {
          const docEl = doc.documentElement;
          const bodyEl = doc.body;
          if (!docEl || !bodyEl) return;

          const contentWidth = docEl.scrollWidth;
          const availableWidth = iframe.clientWidth;

          let scale = 1;
          if (contentWidth > availableWidth + 1) {
            scale = (availableWidth - 4) / contentWidth;
            iframe.style.transform = `scale(${scale})`;
            iframe.style.transformOrigin = 'top left';
            iframe.style.width = `${contentWidth}px`;
          } else {
            iframe.style.transform = '';
            iframe.style.transformOrigin = '';
            iframe.style.width = '100%';
          }

          const h1 = docEl.scrollHeight;
          const h2 = bodyEl.scrollHeight;
          const h3 = bodyEl.offsetHeight;
          const height = Math.max(h1, h2, h3, 120);
          const finalHeight = Math.min(height + 24, 800);

          iframe.style.height = finalHeight + 'px';
          if (scale !== 1) {
            frameWrap.style.height = `${finalHeight * scale}px`;
          } else {
            frameWrap.style.height = '';
          }

          iframe.style.opacity = '1';
        } catch (e) {
          iframe.style.transform = '';
          iframe.style.width = '100%';
          iframe.style.height = '600px';
          iframe.style.opacity = '1';
          frameWrap.style.height = '';
        }
      };

      let ro = null;
      if (window.ResizeObserver && doc.documentElement && doc.body) {
        ro = new ResizeObserver(() => {
          requestAnimationFrame(updateHeight);
        });
        ro.observe(doc.documentElement);
        ro.observe(doc.body);
      }

      if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        updateHeight();
      } else {
        doc.addEventListener('DOMContentLoaded', updateHeight);
      }

      const imgs = doc.querySelectorAll('img');
      let pending = 0;
      imgs.forEach(img => {
        if (!img.complete) {
          pending++;
          img.addEventListener('load', () => { pending--; if (pending <= 0) updateHeight(); }, { once: true });
          img.addEventListener('error', () => { pending--; if (pending <= 0) updateHeight(); }, { once: true });
        }
      });
      if (!pending) updateHeight();

      const cleanup = () => {
        if (ro) { ro.disconnect(); ro = null; }
      };
      $('msgDetailBack')?.addEventListener('click', cleanup, { once: true });

    } catch (err) {
      iframe.style.height = '600px';
      iframe.style.opacity = '1';
    }
  });

  if (currentMessageView?.address && msg.id) {
    const { readMsgIds = {} } = await browser.storage.local.get('readMsgIds');
    const addr = currentMessageView.address;
    if (!readMsgIds[addr]) readMsgIds[addr] = [];
    if (!readMsgIds[addr].includes(msg.id)) {
      readMsgIds[addr].push(msg.id);
      if (readMsgIds[addr].length > 200) readMsgIds[addr].shift();
      await browser.storage.local.set({ readMsgIds });
    }
    const m = currentMessageView.messages.find(x => x.id === msg.id);
    if (m) m._read = true;
  }

  $('msgDetailBack').addEventListener('click', () => {
    window.currentDetailMessage = null;
    if (currentMessageView) {
      showMessageView(currentMessageView.id, currentMessageView.token, currentMessageView.address, currentMessageView.messages);
    }
  });
}

function buildOverrideCss(dir, bg, color) {
  return `
    html, body {
      -webkit-text-size-adjust: 100%;
      overflow-x: hidden !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    body {
      padding: 16px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
      font-size: 14px !important;
      line-height: 1.6 !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      box-sizing: border-box !important;
      background: ${bg} !important;
      color: ${color} !important;
      min-width: 0 !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      min-width: 0 !important;
    }
    body > * {
      max-width: 100% !important;
    }
    img, svg, video, canvas, picture, figure, iframe, embed, object {
      max-width: 100% !important;
      height: auto !important;
      display: block;
      margin: 8px 0;
    }
    img[src=""], img:not([src]) { display: none !important; }
    a {
      color: inherit;
      text-decoration: underline;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
    a:hover { opacity: 0.8; }
    a:visited { opacity: 0.9; }
    table, tbody, thead, tfoot, tr, td, th {
      max-width: 100% !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse;
    }
    td, th {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      max-width: 100%;
    }
    pre, code {
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      overflow-x: hidden !important;
      max-width: 100%;
    }
    blockquote {
      margin: 12px 0;
      padding: 8px 12px;
      border-${dir === 'rtl' ? 'right' : 'left'}: 3px solid ${bg === '#1c1c1e' ? '#48484a' : '#ddd'};
      opacity: 0.85;
      max-width: 100%;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    [style*="position:fixed"], [style*="position: absolute"] {
      position: relative !important;
    }
    [style*="width"] {
      max-width: 100% !important;
    }
    [style*="min-width"] {
      min-width: 0 !important;
    }
    body > div:first-child[style*="width"],
    body > table:first-child,
    body > center:first-child {
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    .tb-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }
    @media print {
      body { padding: 0 !important; }
    }
    @media (max-width: 360px) {
      body { padding: 12px !important; font-size: 13px !important; }
      blockquote { padding: 6px 8px !important; }
    }
  `.trim();
}

function formatPlainText(text, dir) {
  if (!text) return '';
  let html = escapeHtml(text);
  const borderSide = dir === 'rtl' ? 'right' : 'left';
  const borderRadius = dir === 'rtl' ? '6px 0 0 6px' : '0 6px 6px 0';

  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  html = html.replace(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    '<a href="mailto:$1">$1</a>'
  );

  const lines = html.split('\n');
  const result = [];
  let inQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('&gt;')) {
      if (!inQuote) {
        result.push(`<blockquote style="margin:8px 0;padding:8px 12px;border-${borderSide}:3px solid #ddd;opacity:0.85;border-radius:${borderRadius};">`);
        inQuote = true;
      }
      result.push(trimmed.replace(/^&gt;\s?/, '') + '<br>');
    } else {
      if (inQuote) {
        result.push('</blockquote>');
        inQuote = false;
      }
      result.push(line);
    }
  }
  if (inQuote) result.push('</blockquote>');

  html = result.join('\n');

  const paragraphs = html.split(/\n{2,}/).map(p => p.trim()).filter(p => p);
  if (paragraphs.length > 1) {
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  return html.replace(/\n/g, '<br>');
}
