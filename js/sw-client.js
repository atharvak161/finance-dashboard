// sw-client.js — crypto removed, auth always passes
export async function initSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
export async function isAuthenticated() { return true; }
export async function setKey() {}
export async function lock() {}
export async function encryptData() { throw new Error('encryption removed'); }
export async function decryptData() { throw new Error('encryption removed'); }
export async function swEncrypt() { throw new Error('encryption removed'); }
export async function swDecrypt() { throw new Error('encryption removed'); }
