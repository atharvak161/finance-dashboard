import { initPage, saveSec } from '../page-init.js';
import {
  generateAmortisation, amortPayoffDate, fmtGBP, fmtINR, round2
} from '../calc.js';

const state = await initPage('debts');
let editing = false;

// Bind the static Edit button via top-level event delegation so it can never be
// orphaned by a throw/null earlier in the render chain (Pattern 1).
document.addEventListener('click', (e) => {
  const editBtn = e.target.closest('#debt-edit-btn');
  if (editBtn && !editing) { editing = true; render(state); }
});

render(state);

// ── Render ─────────────────────────────────────────────────────

function render(st) {
  const sbi  = st.debts?.sbi || {};
  const rate = st.settings?.inrGbpRate || 83;

  let sch = [];
  try {
    sch = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0) || [];
  } catch (err) {
    console.error('Amortisation failed:', err);
    sch = [];
  }
  const gbpOut = round2((sbi.outstandingINR||0) / rate) || 0;
  const totalInterestRemaining = sch[sch.length-1]?.totalInterest || 0;
  // generateAmortisation returns an empty array tagged .error='EMI_TOO_LOW'
  // when the EMI doesn't cover monthly interest (balance never amortises).
  const emiTooLow = sch.error === 'EMI_TOO_LOW';
  const payoffText  = emiTooLow ? 'Never' : amortPayoffDate(sch);
  const monthsText  = emiTooLow ? 'EMI below interest' : `${sch.length} months remaining`;

  // ── Summary cards (read-only, computed) ───────────────────
  const summaryEl = document.getElementById('debt-summary');
  if (summaryEl) summaryEl.innerHTML = `
    <div class="metric-card">
      <div class="label">Outstanding Balance</div>
      <div class="value text-negative">${fmtINR(sbi.outstandingINR||0)}</div>
      <div class="sub">${fmtGBP(gbpOut)}</div>
    </div>
    <div class="metric-card">
      <div class="label">Monthly EMI</div>
      <div class="value">${fmtINR(sbi.emiINR||0)}</div>
      <div class="sub">${sbi.extraMonthlyINR ? '+ '+fmtINR(sbi.extraMonthlyINR)+' extra' : 'No extra payment'}</div>
    </div>
    <div class="metric-card">
      <div class="label">Estimated Payoff</div>
      <div class="value">${payoffText}</div>
      <div class="sub">${monthsText}</div>
    </div>
    <div class="metric-card">
      <div class="label">Interest Remaining</div>
      <div class="value text-negative">${fmtINR(totalInterestRemaining)}</div>
      <div class="sub">${fmtGBP(round2(totalInterestRemaining/rate))} · @ ${sbi.ratePercent||9.9}%</div>
    </div>`;

  renderFields(st, sbi);
}

// ── Edit / Save section ────────────────────────────────────────

function renderFields(st, sbi) {
  const wrap = document.getElementById('debt-fields');
  const btn  = document.getElementById('debt-edit-btn');
  if (!wrap) return;

  if (!editing) {
    // Read-only view
    wrap.innerHTML = `
      <div class="stat-row"><span class="stat-label">Outstanding balance (₹)</span><span class="stat-value mono">${fmtINR(sbi.outstandingINR||0)}</span></div>
      <div class="stat-row"><span class="stat-label">Original principal (₹)</span><span class="stat-value mono">${fmtINR(sbi.originalPrincipalINR||0)}</span></div>
      <div class="stat-row"><span class="stat-label">Interest rate (%)</span><span class="stat-value mono">${sbi.ratePercent||0}%</span></div>
      <div class="stat-row"><span class="stat-label">Monthly EMI (₹)</span><span class="stat-value mono">${fmtINR(sbi.emiINR||0)}</span></div>
      <div class="stat-row"><span class="stat-label">Extra monthly (₹)</span><span class="stat-value mono">${fmtINR(sbi.extraMonthlyINR||0)}</span></div>
      <div class="stat-row"><span class="stat-label">Loan start date</span><span class="stat-value mono">${sbi.startDate||'—'}</span></div>
      <div class="stat-row"><span class="stat-label">Co-applicant</span><span class="stat-value">${sbi.coApplicant||'—'}</span></div>`;
    if (btn) { btn.textContent = '✏️ Edit Loan Details'; btn.disabled = false; }
    // Edit click handled by top-level delegation — no per-render binding needed.
    return;
  }

  // Edit form — snapshot current values so Cancel can discard edits
  const draft = { ...sbi };
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
      ${dField('Outstanding balance (₹)', 'outstandingINR', draft.outstandingINR)}
      ${dField('Original principal (₹)', 'originalPrincipalINR', draft.originalPrincipalINR)}
      ${dField('Interest rate (%)', 'ratePercent', draft.ratePercent)}
      ${dField('Monthly EMI (₹)', 'emiINR', draft.emiINR)}
      ${dField('Extra monthly (₹)', 'extraMonthlyINR', draft.extraMonthlyINR)}
      <div class="form-group">
        <label class="form-label">Loan start date</label>
        <input type="date" class="form-input debt-field" data-key="startDate" value="${draft.startDate||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Co-applicant</label>
        <input type="text" class="form-input debt-field" data-key="coApplicant" value="${draft.coApplicant||''}" />
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
      <button class="btn btn-secondary" id="debt-cancel-btn" type="button">Cancel</button>
      <button class="btn btn-primary" id="debt-save-btn" type="button">Save</button>
    </div>`;

  // Edits only mutate the local draft until Save is pressed.
  wrap.querySelectorAll('.debt-field').forEach(el => {
    el.addEventListener('input', () => {
      draft[el.dataset.key] = el.type === 'number' ? (parseFloat(el.value)||0) : el.value;
    });
  });

  if (btn) { btn.textContent = 'Editing…'; btn.disabled = true; }

  const cancelBtn = document.getElementById('debt-cancel-btn');
  if (cancelBtn) cancelBtn.onclick = () => {
    editing = false;
    render(st);
  };

  const saveBtn = document.getElementById('debt-save-btn');
  if (saveBtn) saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    if (!st.debts) st.debts = {};
    if (!st.debts.sbi) st.debts.sbi = {};
    Object.assign(st.debts.sbi, draft);
    await saveSec('fin_debts', st.debts);
    editing = false;
    render(st);
  };
}

function dField(label, key, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input debt-field" data-key="${key}" value="${value??''}" step="any" />
  </div>`;
}
