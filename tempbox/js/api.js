const API = 'https://api.mail.tm';

async function api(path, opts = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers }
    });
    if (res.status === 429) {
      await browser.storage.local.set({ isRateLimited: true });
      browser.alarms.clear('checkMail');
      browser.alarms.create('rateLimitBackoff', { delayInMinutes: 2 });
      throw new Error('Rate limited. Please wait a moment.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  } catch (e) {
    if (e.message === 'Rate limited. Please wait a moment.') throw e;
    throw new Error(e.message || 'Network error');
  }
}

async function getDomains() {
  const data = await api('/domains');
  return data['hydra:member'] || [];
}

async function createAccount(address, password) {
  return api('/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
}

async function getToken(address, password) {
  return api('/token', { method: 'POST', body: JSON.stringify({ address, password }) });
}

async function fetchMessages(token) {
  return api('/messages', { headers: { Authorization: `Bearer ${token}` } });
}

async function fetchMessage(token, messageId) {
  return api(`/messages/${messageId}`, { headers: { Authorization: `Bearer ${token}` } });
}

function extractOTP(text) {
  if (!text) return null;

  const clean = String(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ');

  const toWestern = (str) => str.replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 1632 + 48));

  // Pattern 1: standalone formatted codes per line
  const lines = clean.split(/[\n\r]|<br\s*\/?>/i);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[\d\s-]{3,12}$/.test(trimmed)) {
      const code = toWestern(trimmed).replace(/\D/g, '');
      if (code.length >= 3 && code.length <= 10) return code;
    }
    if (/^[A-Za-z0-9\s-]{4,12}$/.test(trimmed)) {
      const code = trimmed.replace(/[\s-]/g, '');
      if (/^\d+$/.test(code) && code.length >= 3 && code.length <= 10) return code;
      if (/[A-Za-z]/.test(code) && code.length >= 4 && code.length <= 12) return code.toUpperCase();
    }
  }

  // Pattern 2: context-based extraction
  const patterns = [
    /(?:code|otp|pin|token|verification|verify|password|passcode|security|auth|authentication|confirm|confirmation|one-time|single-use|2fa|mfa|launch|access|login|signin|authorize|approval|activation)[\s\S]{0,200}?\b(\d{3,10})\b/i,
    /\b(\d{3,10})\b[\s\S]{0,80}?(?:is your|is the|as your|as the)[\s:]*(?:code|otp|pin|token|verification|password|passcode)/i,
    /(?:enter|type|input|provide|paste|use|confirm)[\s\S]{0,80}?(?:code|otp|pin|token|verification|passcode|launch)[\s\S]{0,80}?\b(\d{3,10})\b/i,
    /(?:code|otp|pin|token|passcode)[\s\S]{0,30}?[:=]\s*(\d{3,10})/i,
    /(?:your|the)[\s\S]{0,30}?(?:code|otp|pin|token|passcode)[\s\S]{0,30}?\b([A-Za-z0-9]{4,12})\b/i,
    /(?:verification|security|auth)[\s\S]{0,50}?\b([A-Z0-9]{6,8})\b/i,
    /\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/i,
    /(?:use|enter)[\s\S]{0,40}?\b([A-Z0-9]{6,10})\b[\s\S]{0,20}?(?:to|for)/i
  ];

  for (const p of patterns) {
    const m = clean.match(p);
    if (m) {
      let code = m[1].replace(/[\s-]/g, '');
      code = toWestern(code);
      if (/^\d+$/.test(code) && code.length >= 3 && code.length <= 10) return code;
      if (code.length >= 4 && code.length <= 12) return code.toUpperCase();
    }
  }

  // Pattern 3: generic fallback
  const genericMatch = clean.match(/(?:^|\s|\D)\b(\d{4,8})\b(?:\s|\D|$)/);
  if (genericMatch) return toWestern(genericMatch[1]);

  const alphaMatch = clean.match(/(?:^|\s|\D)\b([A-Z0-9]{6,8})\b(?:\s|\D|$)/i);
  if (alphaMatch) return alphaMatch[1].toUpperCase();

  return null;
}
