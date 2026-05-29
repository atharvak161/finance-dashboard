// Service Worker client — Promise-based API for the crypto vault SW

let _reg = null;

// ── Init ─────────────────────────────────────────────────────

export async function initSW() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers not supported. Use a modern browser over HTTPS.');
  }
  _reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  return _reg;
}

// ── Internal postMessage helper ──────────────────────────────

function _send(type, data = {}) {
  return new Promise((resolve, reject) => {
    // Prefer controller (page is already controlled); fall back to reg.active
    const worker = navigator.serviceWorker.controller
      || (_reg && _reg.active);

    if (!worker) {
      reject(new Error('No active service worker'));
      return;
    }

    const channel = new MessageChannel();
    const timer   = setTimeout(() => reject(new Error('SW timeout')), 8000);

    channel.port1.onmessage = e => {
      clearTimeout(timer);
      if (e.data && e.data.error) reject(new Error(e.data.error));
      else resolve(e.data);
    };

    worker.postMessage({ type, ...data }, [channel.port2]);
  });
}

// ── Public API ───────────────────────────────────────────────

export async function setKey(cryptoKey) {
  return _send('SET_KEY', { key: cryptoKey });
}

export async function isAuthenticated() {
  try {
    const r = await _send('CHECK_AUTH');
    return r.authenticated === true;
  } catch {
    return false;
  }
}

export async function swEncrypt(data) {
  const r = await _send('ENCRYPT', { payload: data });
  return r.result;
}

export async function swDecrypt(stored) {
  const r = await _send('DECRYPT', { stored });
  return r.result;
}

export async function lock() {
  return _send('LOCK');
}
