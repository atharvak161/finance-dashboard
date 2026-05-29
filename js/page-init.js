// Common initialization run by every non-login page.
// Handles: SW init, auth check, data load, layout render, inactivity timer.

import { initSW, isAuthenticated, lock } from './sw-client.js';
import { loadAll, save }                  from './store.js';
import { renderSharedLayout }              from './shared-layout.js';

let _inactivityTimer = null;

/**
 * Initialize a dashboard page.
 * @param {string} activeNav  - Which nav item is active (e.g. 'income')
 * @returns {object} state    - Fully loaded state object
 */
export async function initPage(activeNav) {
  // ── 1. Register Service Worker ───────────────────────────
  await initSW();

  // Wait up to 800ms for the SW to take control (handles first-load timing)
  if (!navigator.serviceWorker.controller) {
    await Promise.race([
      new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
      ),
      new Promise(resolve => setTimeout(resolve, 800)),
    ]);
  }

  // ── 2. Auth check ────────────────────────────────────────
  const auth = await isAuthenticated();
  if (!auth) {
    window.location.replace('login.html');
    throw new Error('Not authenticated');
  }

  // ── 3. Load all encrypted state ──────────────────────────
  const state = await loadAll();

  // ── 4. Render shared chrome (sidebar + topbar) ───────────
  renderSharedLayout(activeNav, state);

  // ── 5. Apply global CSS variables from settings ──────────
  const rate = state.settings?.inrGbpRate || 125;
  document.documentElement.style.setProperty('--inr-gbp-rate', rate);

  // ── 6. Inactivity timer ──────────────────────────────────
  const timeoutMs = ((state.settings?.inactivityTimeoutMinutes || 15) * 60 * 1000);
  const resetTimer = () => {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
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

/** Save a single state section and return the mutated state (convenience wrapper). */
export async function saveSec(key, data) {
  await save(key, data);
}

/** Re-render the user name in the sidebar footer if it changed. */
export function updateSidebarProfile(name) {
  const el = document.getElementById('sidebar-profile-name');
  if (el) el.textContent = (name || '').split(' ')[0];
}
