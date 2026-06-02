// store.js — plain JSON localStorage (no encryption)
import { DEFAULTS } from './defaults.js';

export { DEFAULTS };

const KEYS = [
  'fin_profile','fin_income','fin_expenses','fin_debts',
  'fin_investments','fin_goals','fin_monthly_log',
  'fin_settings','fin_tax_tracker','fin_india_log','fin_india_tax'
];

// Multi-word keys are stored snake_case in localStorage but consumed
// camelCase by the pages. Map between the two so consumers stay consistent.
const camelMap = {
  'monthly_log': 'monthlyLog',
  'tax_tracker': 'taxTracker',
  'india_log':   'indiaLog',
  'india_tax':   'indiaTax',
};
const reverseMap = {
  'monthlyLog': 'fin_monthly_log',
  'taxTracker': 'fin_tax_tracker',
  'indiaLog':   'fin_india_log',
  'indiaTax':   'fin_india_tax',
};

export async function loadAll() {
  const out = {};
  for (const k of KEYS) {
    const shortKey = k.replace('fin_', '');
    const finalKey = camelMap[shortKey] || shortKey;
    try {
      const raw = localStorage.getItem(k);
      out[finalKey] = raw ? JSON.parse(raw) : (DEFAULTS[k] ?? null);
    } catch {
      out[finalKey] = DEFAULTS[k] ?? null;
    }
  }
  return out;
}

export async function load(key) {
  // Route camelCase keys through reverseMap before building the localStorage key
  const lsKey = reverseMap[key] || (key.startsWith('fin_') ? key : 'fin_' + key);
  try {
    const raw = localStorage.getItem(lsKey);
    return raw ? JSON.parse(raw) : (DEFAULTS[lsKey] ?? null);
  } catch {
    return DEFAULTS[lsKey] ?? null;
  }
}

export async function save(key, data) {
  const lsKey = reverseMap[key] || (key.startsWith('fin_') ? key : 'fin_' + key);
  localStorage.setItem(lsKey, JSON.stringify(data));
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
