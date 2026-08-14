const $ = id => document.getElementById(id);

function showToast(msg, type = 'default') {
  const t = $('toast');
  if (!t) return;

  t.textContent = msg;
  t.className = 'toast show';

  t.style.background = '';
  t.style.color = '';

  if (type === 'error') {
    t.style.background = 'rgba(255, 59, 48, 0.92)';
    t.style.color = '#fff';
  } else if (type === 'success') {
    t.style.background = 'rgba(52, 199, 89, 0.92)';
    t.style.color = '#fff';
  }

  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => {
      t.style.background = '';
      t.style.color = '';
    }, 200);
  }, 2000);
}

function showError(msg) {
  const bar = $('errorBar');
  $('errorText').textContent = msg;
  bar.classList.add('visible');
  clearTimeout(bar._timer);
  bar._timer = setTimeout(() => bar.classList.remove('visible'), 5000);
}

function escapeHtml(text) {
  if (text == null) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMessageDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function rafBatch(fn) {
  let queued = false;
  return (...args) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...args);
    });
  };
}
