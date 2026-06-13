// Common initialization run by every non-login page.
// Handles: SW init, data load, layout render, empty-data highlighting.

import { initSW } from './sw-client.js';
import { loadAll, save } from './store.js';
import { renderSharedLayout } from './shared-layout.js';

function highlightEmptyData(state) {
  // First clear all existing needs-data highlights
  document.querySelectorAll('.needs-data').forEach(el => el.classList.remove('needs-data'));
  // Remove existing banner
  document.querySelector('.setup-banner')?.remove();

  // Check which sections have zero/empty critical fields
  const checks = {
    income:      () => !state.income?.baseSalaryGBP,
    expenses:    () => !state.expenses?.items?.length || state.expenses.items.every(i => !i.monthlyGBP),
    debts:       () => !state.debts?.sbi?.outstandingINR,
    investments: () => !state.investments?.cashAccounts?.[0]?.balanceGBP &&
                       !state.investments?.pensions?.[0]?.valueGBP,
    goals:       () => !state.goals?.wealthTargetGBP,
    tax:         () => !state.taxTracker?.underpaymentTotal && !state.taxTracker?.taxCode,
    profile:     () => !state.profile?.age || !state.profile?.name,
  };

  const emptySections = Object.entries(checks)
    .filter(([, check]) => check())
    .map(([name]) => name);

  if (emptySections.length === 0) return;

  // Add needs-data class to any card/section whose data-section attr matches
  emptySections.forEach(section => {
    document.querySelectorAll(`[data-section="${section}"], [data-page="${section}"]`)
      .forEach(el => el.classList.add('needs-data'));
  });

  // Add setup banner to main content area
  const main = document.querySelector('main, .main-content, #main, .content, .page-content');
  if (main && !document.querySelector('.setup-banner')) {
    const banner = document.createElement('div');
    banner.className = 'setup-banner';
    banner.innerHTML = `
      <span class="setup-count">${emptySections.length}</span>
      section${emptySections.length > 1 ? 's' : ''} need your data:
      <strong>${emptySections.join(', ')}</strong>
      <a href="settings.html">Go to Settings →</a>
    `;
    main.prepend(banner);
  }
}

// ── Inline expression evaluator ───────────────────────────────
function safeEval(expr) {
  // Allow only digits, decimal points, operators, parentheses, and whitespace
  if (!/^[\d\s.+\-*/()]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    // Round to 2 decimal places only if needed
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

document.addEventListener('blur', function(e) {
  const el = e.target;
  if (!el.matches('input[type="text"].form-input, input[type="number"].form-input, .form-input-inline')) return;
  const raw = el.value.trim();
  // Only process if it contains math operators
  if (!/[+\-*/()]/.test(raw)) return;
  const result = safeEval(raw);
  if (result !== null) el.value = result;
}, true); // capture phase so it fires before page handlers

export async function initPage(activeNav) {
  await initSW();
  const state = await loadAll();
  renderSharedLayout(activeNav, state);
  const rate = state.settings?.inrGbpRate || 83;
  document.documentElement.style.setProperty('--inr-gbp-rate', rate);
  highlightEmptyData(state);
  return state;
}

export async function saveSec(key, data) {
  await save(key, data);
  // Re-run highlighting after any save so filled sections clear immediately
  const state = await loadAll();
  highlightEmptyData(state);
}

export function updateSidebarProfile(name) {
  const el = document.getElementById('sidebar-profile-name');
  if (el) el.textContent = (name || '').split(' ')[0] || 'You';
}
