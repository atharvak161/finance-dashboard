// Finance Dashboard — Service Worker Crypto Vault
// Holds the AES-256-GCM CryptoKey in memory across page navigations.
// Key is cleared when the browser terminates all clients (natural session boundary).
// Classic SW (non-module) for maximum browser compatibility.

/* global crypto, TextEncoder, TextDecoder */

'use strict';

let _encKey = null;

// ── Lifecycle ────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// ── Message handler ──────────────────────────────────────────
self.addEventListener('message', async event => {
  const port = event.ports[0];
  if (!port) return; // unsolicited message — ignore

  const { type } = event.data || {};

  try {
    switch (type) {

      case 'SET_KEY':
        // CryptoKey is structured-cloneable — non-extractable flag is preserved
        _encKey = event.data.key;
        port.postMessage({ ok: true });
        break;

      case 'CHECK_AUTH':
        port.postMessage({ authenticated: _encKey !== null });
        break;

      case 'ENCRYPT': {
        if (!_encKey) { port.postMessage({ error: 'Not authenticated' }); break; }
        const iv      = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(event.data.payload));
        const cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _encKey, encoded);
        const ivB64   = _toB64(iv);
        const ctB64   = _toB64(new Uint8Array(cipher));
        port.postMessage({ result: ivB64 + ':' + ctB64 });
        break;
      }

      case 'DECRYPT': {
        if (!_encKey) { port.postMessage({ error: 'Not authenticated' }); break; }
        const parts = (event.data.stored || '').split(':');
        if (parts.length !== 2) { port.postMessage({ error: 'Bad ciphertext format' }); break; }
        const iv         = _fromB64(parts[0]);
        const ciphertext = _fromB64(parts[1]);
        const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _encKey, ciphertext);
        port.postMessage({ result: JSON.parse(new TextDecoder().decode(plain)) });
        break;
      }

      case 'LOCK':
        _encKey = null;
        port.postMessage({ ok: true });
        break;

      default:
        port.postMessage({ error: 'Unknown type: ' + type });
    }
  } catch (err) {
    port.postMessage({ error: err.message || 'SW operation failed' });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function _toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _fromB64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
