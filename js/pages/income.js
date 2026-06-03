import { initPage, saveSec } from '../page-init.js';
import { calculateNetPay, fmtGBP } from '../calc.js';

// Edit-only Income page. Charts now live on the dashboard.
// Summary cards (read-only, computed from state) + an Edit/Save details panel.

const state = await initPage('income');

let editMode = false;

// MUST be declared before renderPage() is called — TDZ guard
const DETAIL_ROWS = [
  ['Base salary (£/yr)',      'baseSalaryGBP',          v => fmtGBP(v || 0)],
  ['Avg overtime (£/mo)',     'avgOvertimeGrossGBP',    v => fmtGBP(v || 0)],
  ['Hours/week',              'hoursPerWeek',           v => `${v ?? '—'}`],
  ['Pension employee (%)',    'pensionEmployeeRate',    v => `${v ?? 0}%`],
  ['Pension employer (%)',    'pensionEmployerRate',    v => `${v ?? 0}%`],
  ['Tax code',                'taxCode',                v => `${v || '—'}`],
  ['Tax-free allowance (£)',  'taxFreeAllowanceAnnual', v => fmtGBP(v || 0)],
  ['Underpayment (£/mo)',     'underpaymentMonthlyGBP', v => fmtGBP(v || 0)],
  ['Underpayment clears',     'underpaymentClearsDate', v => v || '—'],
];

renderPage();

function renderPage() {
  const content = document.getElementById('content');
  if (!content) { console.error('Income: #content not found'); return; }
  try {
  content.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Income</div>
        <div class="section-subtitle">Salary, deductions &amp; take-home pay</div>
      </div>
    </div>
    ${renderSummaryCards()}
    <div class="mt-20" data-section="income">
      ${renderEditSection()}
    </div>`;
  attachEvents();
  } catch(e) {
    console.error('Income page render error:', e);
    content.innerHTML = `<div style="color:#ff4d4d;padding:24px;font-family:monospace;font-size:12px">
      Income page error: ${e.message}<br><pre>${e.stack}</pre></div>`;
  }
}

// ── Summary cards (read-only) ─────────────────────────────────

function renderSummaryCards() {
  const inc = state.income || {};
  const pay = calculateNetPay(inc);
  const card = (label, value, sub) => `
    <div class="metric-card">
      <div class="label">${label}</div>
      <div class="value mono">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  return `<div class="grid-4">
    ${card('Monthly net pay', fmtGBP(pay.netWithOT), 'After tax, NI &amp; pension')}
    ${card('Monthly OT gross', fmtGBP(inc.avgOvertimeGrossGBP || 0), 'Average overtime')}
    ${card('Pension (employee)', fmtGBP(pay.pension), `${inc.pensionEmployeeRate || 0}% of gross pay`)}
    ${card('Tax this month', fmtGBP(pay.incomeTax), 'Income Tax deducted')}
  </div>`;
}

// ── Edit / read-only details section ──────────────────────────

function renderEditSection() {
  if (!editMode) {
    return `<div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="panel-title">Income Details</div>
        <button id="edit-btn" class="btn btn-secondary btn-sm">✏️ Edit</button>
      </div>
      ${renderReadOnlyDetails()}
    </div>`;
  }
  return `<div class="panel">
    <div class="panel-title" style="margin-bottom:16px">Edit Income Details</div>
    ${renderEditForm()}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button id="cancel-btn" class="btn btn-secondary btn-sm">Cancel</button>
      <button id="save-btn" class="btn btn-primary btn-sm">Save</button>
    </div>
  </div>`;
}

function renderReadOnlyDetails() {
  const inc = state.income || {};
  return `<div class="mt-16">
    ${DETAIL_ROWS.map(([label, key, fmt]) => `
      <div class="stat-row">
        <span class="stat-label">${label}</span>
        <span class="stat-value mono">${fmt(inc[key])}</span>
      </div>`).join('')}
  </div>`;
}

// ── Edit form fields (ported from settings-page renderIncome) ─

function iField(label, key, type = 'number') {
  const inc = state.income || {};
  const val = inc[key];
  return `<div class="form-group" style="margin-bottom:14px">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input income-field" data-key="${key}"
           value="${val ?? ''}" ${type === 'number' ? 'step="any"' : ''} />
  </div>`;
}

function iPctField(label, key) {
  const inc = state.income || {};
  const val = inc[key];
  return `<div class="form-group" style="margin-bottom:14px">
    <label class="form-label">${label}</label>
    <div style="display:flex;align-items:center;gap:6px">
      <input type="number" class="form-input income-field" data-key="${key}"
             value="${val ?? ''}" step="0.1" min="0" max="100" style="flex:1" />
      <span style="color:var(--text-secondary);font-family:var(--font-mono);font-size:14px;padding:0 4px">%</span>
    </div>
  </div>`;
}

function renderEditForm() {
  return `<div class="grid-2">
    ${iField('Base salary (£/yr)',      'baseSalaryGBP')}
    ${iField('Avg overtime (£/mo)',     'avgOvertimeGrossGBP')}
    ${iField('Hours/week',              'hoursPerWeek')}
    ${iPctField('Pension employee',     'pensionEmployeeRate')}
    ${iPctField('Pension employer',     'pensionEmployerRate')}
    ${iField('Tax code',                'taxCode', 'text')}
    ${iField('Tax-free allowance (£)',  'taxFreeAllowanceAnnual')}
    ${iField('Underpayment (£/mo)',     'underpaymentMonthlyGBP')}
    ${iField('Underpayment clears',     'underpaymentClearsDate', 'date')}
  </div>`;
}

// ── Events ────────────────────────────────────────────────────

function attachEvents() {
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) editBtn.onclick = () => { editMode = true; renderPage(); };

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) cancelBtn.onclick = () => { editMode = false; renderPage(); };

  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.onclick = onSave;

  // Live-update the in-memory object as fields change so the summary preview
  // is correct the moment Save re-renders.
  document.querySelectorAll('.income-field').forEach(el => {
    el.addEventListener('input', () => {
      if (!state.income) state.income = {};
      state.income[el.dataset.key] =
        el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
    });
  });
}

async function onSave() {
  const btn = document.getElementById('save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  // Re-read every field (covers values changed without firing input).
  if (!state.income) state.income = {};
  document.querySelectorAll('.income-field').forEach(el => {
    state.income[el.dataset.key] =
      el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
  });
  await saveSec('fin_income', state.income);
  editMode = false;
  renderPage();
}
