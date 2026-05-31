// store.js — plain JSON localStorage (no encryption)
import { DEFAULTS } from './defaults.js';

export { DEFAULTS };

const KEYS = [
  'fin_profile','fin_income','fin_expenses','fin_debts',
  'fin_investments','fin_goals','fin_monthly_log',
  'fin_settings','fin_tax_tracker','fin_india_log'
];

export async function loadAll() {
  const out = {};
  for (const k of KEYS) {
    try {
      const raw = localStorage.getItem(k);
      const shortKey = k.replace('fin_', '');
      out[shortKey] = raw ? JSON.parse(raw) : (DEFAULTS[k] ?? null);
    } catch {
      const shortKey = k.replace('fin_', '');
      out[shortKey] = DEFAULTS[k] ?? null;
    }
  }
  return out;
}

export async function load(key) {
  const fullKey = key.startsWith('fin_') ? key : 'fin_' + key;
  try {
    const raw = localStorage.getItem(fullKey);
    return raw ? JSON.parse(raw) : (DEFAULTS[fullKey] ?? null);
  } catch {
    return DEFAULTS[fullKey] ?? null;
  }
}

export async function save(key, data) {
  localStorage.setItem(key.startsWith('fin_') ? key : 'fin_' + key, JSON.stringify(data));
}

export async function saveAll(state) {
  for (const [k, v] of Object.entries(state)) {
    await save(k, v);
  }
}

export async function clearAll() {
  KEYS.forEach(k => localStorage.removeItem(k));
}

// ── Initialize defaults (called from Data tab reset) ─────────
export async function initializeDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await save(key, value);
  }
}

// ── Re-encrypt no longer applies; kept as a no-op for API compatibility ──
export async function reEncryptAll() {}
