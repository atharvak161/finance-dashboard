// Common initialization run by every non-login page.
// Handles: SW init, auth check (with key recovery), data load, layout render, inactivity timer.

import { initSW, isAuthenticated, setKey, lock } from './sw-client.js';
import { loadAll, save }                          from './store.js';
import { renderSharedLayout }                      from './shared-layout.js';

let _inactivityTimer = null;

// ── Key recovery from sessionStorage ────────────────────────
// Service Workers can be terminated by the browser between page navigations,
// which resets _encKey to null in the SW. When that happens we re-import the
// key from sessionStorage and push it back into the SW automatically.

async function _recoverKey() {
  const b64 = sessionStorage.getItem('_ek');
  if (!b64) return false;
  try {
    const raw       = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const recovered = await crypto.subtle.importKey(
      'raw', raw,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    await setKey(recovered);
    return await isAuthenticated();
  } catch {
    return false;
  }
}

/**
 * Initialize a dashboard page.
 * @param {string} activeNav - nav item id (e.g. 'income')
 * @returns {object} state
 */
export async function initPage(activeNav) {
  // ── 1. Register Service Worker ───────────────────────────
  await initSW();

  // Give SW controller a moment to take over on first load
  if (!navigator.serviceWorker.controller) {
    await Promise.race([
      new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
      ),
      new Promise(resolve => setTimeout(resolve, 1000)),
    ]);
  }

  // ── 2. Auth check — with automatic SW key recovery ───────
  let auth = await isAuthenticated();

  if (!auth) {
    // SW was likely terminated; try to restore the key from sessionStorage
    auth = await _recoverKey();
  }

  if (!auth) {
    // No key anywhere — redirect to login
    sessionStorage.removeItem('_ek');
    window.location.replace('login.html');
    throw new Error('Not authenticated');
  }

  // ── 3. Load all encrypted state ──────────────────────────
  const state = await loadAll();

  // ── 4. Render shared chrome ───────────────────────────────
  renderSharedLayout(activeNav, state);

  // ── 5. Apply global CSS variables ────────────────────────
  const rate = state.settings?.inrGbpRate || 125;
  document.documentElement.style.setProperty('--inr-gbp-rate', rate);

  // ── 6. Inactivity timer (60 min minimum) ─────────────────
  const timeoutMs = (Math.max(60, state.settings?.inactivityTimeoutMinutes || 60) * 60 * 1000);
  const resetTimer = () => {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
      sessionStorage.removeItem('_ek');
      await lock();
      window.location.replace('login.html');
    }, timeoutMs);
  };
  ['mousemove', 'keypress', 'touchstart', 'click', 'scroll'].forEach(ev =>
    document.addEventListener(ev, resetTimer, { passive: true })
  );
  resetTimer();

  return state;
}

export async function saveSec(key, data) {
  await save(key, data);
}

export function updateSidebarProfile(name) {
  const el = document.getElementById('sidebar-profile-name');
  if (el) el.textContent = (name || '').split(' ')[0];
}
