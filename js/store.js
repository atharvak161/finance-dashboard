// Encrypted storage — all reads/writes go through the SW crypto vault.
// Same public API as before (save/load/loadAll) — page modules require no changes.

import { swEncrypt, swDecrypt } from './sw-client.js';
import { DEFAULTS } from './defaults.js';

export { DEFAULTS };

const _FIN_KEYS = [
  'fin_profile', 'fin_income', 'fin_expenses', 'fin_debts',
  'fin_investments', 'fin_goals', 'fin_monthly_log', 'fin_settings',
  'fin_tax_tracker', 'fin_india_log',
];

// ── Core primitives ──────────────────────────────────────────

export async function save(key, data) {
  const stored = await swEncrypt(data);
  localStorage.setItem(key, stored);
}

export async function load(key) {
  const stored = localStorage.getItem(key);
  if (!stored) return DEFAULTS[key] ?? null;
  try {
    return await swDecrypt(stored);
  } catch {
    return DEFAULTS[key] ?? null; // decrypt fail → fall back to default
  }
}

// ── Load all sections in parallel ────────────────────────────

export async function loadAll() {
  const results = await Promise.allSettled(_FIN_KEYS.map(k => load(k)));

  const [
    profile, income, expenses, debts, investments, goals,
    monthlyLog, settings, taxTracker, indiaLog,
  ] = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : (DEFAULTS[_FIN_KEYS[i]] ?? null)
  );

  return {
    profile, income, expenses, debts, investments, goals,
    monthlyLog: monthlyLog || [],
    settings,
    taxTracker,
    indiaLog: indiaLog || [],
  };
}

// ── Re-encrypt all keys (used when changing password in future) ──

export async function reEncryptAll(decryptFn, encryptFn) {
  for (const key of Object.keys(localStorage).filter(k => k.startsWith('fin_'))) {
    const stored = localStorage.getItem(key);
    if (!stored || !stored.includes(':')) continue;
    try {
      const data    = await decryptFn(stored);
      const newStored = await encryptFn(data);
      localStorage.setItem(key, newStored);
    } catch { /* skip corrupt keys */ }
  }
}

// ── Initialize defaults (called from Data tab reset) ─────────

export async function initializeDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await save(key, value);
  }
}
