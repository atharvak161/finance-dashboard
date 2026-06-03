import { initPage, saveSec } from '../page-init.js';
import {
  calculateNetPay, totalExpenses, fmtGBP, round2
} from '../calc.js';

const state = await initPage('overtime');

// Ensure data structures exist (defensive — older localStorage may predate this feature)
if (!Array.isArray(state.otShifts)) state.otShifts = [];
if (!state.otMonthlySummary || typeof state.otMonthlySummary !== 'object') state.otMonthlySummary = {};

// Months covered by the predictive/forecast features
const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const MONTH_LABELS = { '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug','2026-09':'Sep','2026-10':'Oct' };
const TARGET_GBP = 3000;
const START_BALANCE = state.goals?.indiaTrip?.savedGBP || 600;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7); // e.g. '2026-06'

// What-if slider value (display only, never saved)
let whatIfExtra = 0;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns expense items for a specific YYYY-MM month, applying any scheduled
 * changes whose changeDate is on or before the 15th of that month.
 * applyScheduledChanges() only uses today's date internally, so for per-month
 * forecast accuracy we implement this helper manually.
 */
function getExpensesForMonth(yearMonth) {
  const targetDate = yearMonth + '-15'; // mid-month
  const items = (state.expenses?.items || []).map(item => ({ ...item }));
  for (const change of (state.expenses?.scheduledChanges || [])) {
    if (change.changeDate <= targetDate) {
      const idx = items.findIndex(i => i.id === change.expenseId);
      if (idx >= 0) items[idx].monthlyGBP = change.newMonthlyGBP;
    }
  }
  return items;
}

function getMonthShifts(yearMonth) {
  return state.otShifts.filter(s => (s.date || '').slice(0, 7) === yearMonth);
}
function getMonthTotal(yearMonth) {
  return round2(getMonthShifts(yearMonth).reduce((s, sh) => s + (sh.grossGBP || 0), 0));
}
function isConfirmed(yearMonth) {
  return !!state.otMonthlySummary[yearMonth]?.confirmed;
}

// Last 3 *complete* months (months before the current calendar month)
function rollingAverage() {
  const complete = MONTHS.filter(m => m < CURRENT_MONTH);
  const last3 = complete.slice(-3);
  if (!last3.length) return 0;
  return round2(last3.reduce((s, m) => s + getMonthTotal(m), 0) / last3.length);
}

function ytdTotal() {
  return round2(state.otShifts
    .filter(s => (s.date || '').startsWith('2026'))
    .reduce((s, sh) => s + (sh.grossGBP || 0), 0));
}

// India redirect expense — surplus is partly funded by redirecting the amortised India payment.
function indiaRedirectGBP(expItems) {
  return (expItems || []).find(e => e.id === 'india')?.monthlyGBP || 0;
}

// ── Core prediction ───────────────────────────────────────────

function predictMonth(yearMonth, extraOT = 0) {
  const shifts = getMonthShifts(yearMonth);
  const otGross = round2(shifts.reduce((s, sh) => s + (sh.grossGBP || 0), 0) + extraOT);

  // Use full state.income so all user-configured fields (tax code, pension rates, etc.) apply.
  // Override avgOvertimeGrossGBP with the actual OT for this month (not the stored rolling average).
  const pay = calculateNetPay({ ...(state.income || {}), avgOvertimeGrossGBP: otGross });

  // Use getExpensesForMonth so scheduled expense changes are applied at the correct month,
  // not just at today's date (Correction 1: applyScheduledChanges only takes one arg and uses today internally).
  const expItems = getExpensesForMonth(yearMonth);
  const monthExpenses = totalExpenses(expItems);
  const indiaRedirect = indiaRedirectGBP(expItems);
  const surplus = round2(pay.netWithOT - monthExpenses);
  const projectedSavings = round2(surplus + indiaRedirect);

  return { yearMonth, otGross, pay, monthExpenses, indiaRedirect, surplus, projectedSavings, shifts };
}

// ── Render ────────────────────────────────────────────────────

function render() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">OT Tracker &amp; Salary Predictor</div>
        <div class="section-subtitle">Log overtime, predict take-home pay &amp; forecast India trip savings</div>
      </div>
    </div>
    ${renderSummaryCards()}
    ${renderShiftLogger()}
    ${renderPredictiveSalary()}
    ${renderSavingsForecast()}
  `;
  attachEvents();
}

// ── Feature A: Summary cards ──────────────────────────────────

function renderSummaryCards() {
  const thisMonth = getMonthTotal(CURRENT_MONTH);
  const thisCount = getMonthShifts(CURRENT_MONTH).length;
  const roll = rollingAverage();
  const ytd = ytdTotal();
  return `
    <div class="grid-4 mt-8">
      <div class="metric-card">
        <span class="label">This Month OT Gross</span>
        <span class="value text-positive">${fmtGBP(thisMonth)}</span>
        <span class="sub">${MONTH_LABELS[CURRENT_MONTH] || CURRENT_MONTH}</span>
      </div>
      <div class="metric-card">
        <span class="label">This Month Shifts</span>
        <span class="value">${thisCount}</span>
        <span class="sub">logged this month</span>
      </div>
      <div class="metric-card">
        <span class="label">3-Month Rolling Avg</span>
        <span class="value">${fmtGBP(roll)}</span>
        <span class="sub">last 3 complete months</span>
      </div>
      <div class="metric-card">
        <span class="label">YTD Total (2026)</span>
        <span class="value">${fmtGBP(ytd)}</span>
        <span class="sub">all confirmed + est.</span>
      </div>
    </div>`;
}

// ── Feature A: Shift logger ───────────────────────────────────

function renderShiftLogger() {
  return `
    <div class="panel mt-20" data-section="income">
      <div class="panel-header"><span class="panel-title">Log Overtime Shift</span></div>
      <div class="grid-2">
        <input type="date" id="ot-date" class="form-input">
        <input type="number" id="ot-amount" class="form-input" placeholder="£ gross amount" step="any">
        <input type="text" id="ot-note" class="form-input" placeholder="Note (optional)">
        <label class="flex items-center gap-8" style="font-size:13px;color:var(--text-secondary)">
          <input type="checkbox" id="ot-confirmed"> Confirmed (actual)
        </label>
      </div>
      <button id="ot-add-btn" class="btn btn-primary mt-12">Add Shift</button>
    </div>
    <div class="panel mt-20">
      <div class="panel-header"><span class="panel-title">Logged Shifts</span></div>
      ${renderShiftTable()}
    </div>`;
}

function renderShiftTable() {
  if (!state.otShifts.length) {
    return `<div class="empty-state">No shifts logged yet.</div>`;
  }
  // Group by YYYY-MM
  const groups = {};
  for (const sh of state.otShifts) {
    const ym = (sh.date || '').slice(0, 7);
    (groups[ym] ||= []).push(sh);
  }
  const orderedMonths = Object.keys(groups).sort();

  let rows = '';
  for (const ym of orderedMonths) {
    const monthShifts = groups[ym].slice().sort((a, b) => (a.date || '').localeCompare(b.date));
    const total = round2(monthShifts.reduce((s, sh) => s + (sh.grossGBP || 0), 0));
    rows += `
      <tr class="total-row">
        <td colspan="2">${MONTH_LABELS[ym] || ym} ${ym.slice(0,4)}</td>
        <td class="td-right mono">${fmtGBP(total)}</td>
        <td colspan="2" class="label-muted">${monthShifts.length} shift${monthShifts.length>1?'s':''}</td>
      </tr>`;
    for (const sh of monthShifts) {
      const badge = sh.confirmed
        ? `<span class="badge badge-positive">✓ Actual</span>`
        : `<span class="badge badge-warning">~ Est.</span>`;
      rows += `
        <tr>
          <td class="mono">${sh.date || ''}</td>
          <td class="td-right mono">${fmtGBP(sh.grossGBP || 0)}</td>
          <td>${badge}</td>
          <td>${escapeHtml(sh.note || '')}</td>
          <td class="td-right">
            <button class="btn-icon danger ot-del-btn" data-id="${sh.id}" title="Delete shift">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>`;
    }
  }
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Date</th><th class="td-right">Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Feature B: Predictive salary panel ────────────────────────

function renderPredictiveSalary() {
  const cards = MONTHS.map(ym => {
    const p = predictMonth(ym);
    const summary = state.otMonthlySummary[ym] || {};
    const confirmed = !!summary.confirmed;
    const statusBadge = confirmed
      ? `<span class="badge badge-positive">✓ CONFIRMED</span>`
      : `<span class="badge badge-warning">~ ESTIMATED</span>`;

    let actualBlock = '';
    if (confirmed && summary.actualNetGBP != null) {
      const variance = summary.varianceGBP;
      const vCls = variance >= 0 ? 'text-positive' : 'text-negative';
      const vStr = variance == null ? '—' : (variance >= 0 ? '+' : '−') + fmtGBP(Math.abs(variance)).replace('£','£');
      actualBlock = `
        <div class="stat-row"><span class="stat-label">Actual net pay</span><span class="stat-value mono">${fmtGBP(summary.actualNetGBP)}</span></div>
        <div class="stat-row"><span class="stat-label">Variance vs predicted</span><span class="stat-value mono ${vCls}">${vStr}</span></div>`;
    } else {
      actualBlock = `
        <button class="btn btn-secondary btn-sm mt-8 ot-confirm-btn" data-month="${ym}">Mark confirmed</button>
        <div class="ot-confirm-form" data-month="${ym}" style="display:none;margin-top:10px">
          <div class="flex gap-8 items-center">
            <input type="number" class="form-input ot-actual-input" data-month="${ym}" placeholder="Actual net £" step="any" style="max-width:160px">
            <button class="btn btn-primary btn-sm ot-confirm-save" data-month="${ym}">Save</button>
          </div>
        </div>`;
    }

    return `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">${MONTH_LABELS[ym]} 2026</span>
          ${statusBadge}
        </div>
        <div class="stat-row"><span class="stat-label">OT gross (${p.shifts.length} shift${p.shifts.length===1?'':'s'})</span><span class="stat-value mono">${fmtGBP(p.otGross)}</span></div>
        <div class="stat-row"><span class="stat-label">Predicted net (w/ OT)</span><span class="stat-value mono text-positive">${fmtGBP(p.pay.netWithOT)}</span></div>
        <div class="stat-row"><span class="stat-label">Net (base only)</span><span class="stat-value mono">${fmtGBP(p.pay.netBase)}</span></div>
        <div class="stat-row"><span class="stat-label">Expenses</span><span class="stat-value mono text-negative">−${fmtGBP(p.monthExpenses)}</span></div>
        <div class="stat-row"><span class="stat-label">India redirect</span><span class="stat-value mono">+${fmtGBP(p.indiaRedirect)}</span></div>
        <div class="stat-row"><span class="stat-label">Projected saved</span><span class="stat-value mono ${p.projectedSavings>=0?'text-positive':'text-negative'}">${fmtGBP(p.projectedSavings)}</span></div>
        ${actualBlock}
      </div>`;
  }).join('');

  return `
    <div class="section-header mt-20"><div><div class="section-title" style="font-size:16px">Predictive Salary — May to Oct 2026</div></div></div>
    <div class="grid-3">${cards}</div>`;
}

// ── Feature C: Savings forecast table ─────────────────────────

function renderSavingsForecast() {
  let running = START_BALANCE;
  let rows = '';

  MONTHS.forEach(ym => {
    const confirmed = isConfirmed(ym);
    // What-if applies to FUTURE months only (current month onwards)
    const extra = (whatIfExtra > 0 && ym >= CURRENT_MONTH) ? whatIfExtra : 0;
    const p = predictMonth(ym, extra);
    const summary = state.otMonthlySummary[ym] || {};

    // Net pay used: actual when confirmed, else predicted
    const netPay = (confirmed && summary.actualNetGBP != null) ? summary.actualNetGBP : p.pay.netWithOT;

    // May was a confirmed month where the actual saved was £100 (not the calculated surplus).
    let saved;
    if (ym === '2026-05') {
      saved = 100;
    } else {
      const surplus = round2(netPay - p.monthExpenses);
      saved = round2(surplus + p.indiaRedirect);
    }
    running = round2(running + saved);

    const hitTarget = running >= TARGET_GBP;
    const vsTarget = round2(running - TARGET_GBP);
    const vsCls = vsTarget >= 0 ? 'text-positive' : 'text-negative';
    const vsStr = (vsTarget >= 0 ? '+' : '−') + fmtGBP(Math.abs(vsTarget));

    rows += `
      <tr class="${hitTarget ? 'best-row' : ''}">
        <td>${MONTH_LABELS[ym]} ${confirmed ? '<span class="badge badge-positive" style="margin-left:4px">✓</span>' : ''}</td>
        <td class="td-right mono">${p.shifts.length}</td>
        <td class="td-right mono">${fmtGBP(p.otGross)}</td>
        <td class="td-right mono">${fmtGBP(netPay)}</td>
        <td class="td-right mono text-negative">${fmtGBP(p.monthExpenses)}</td>
        <td class="td-right mono">${fmtGBP(p.indiaRedirect)}</td>
        <td class="td-right mono ${saved>=0?'text-positive':'text-negative'}">${fmtGBP(saved)}</td>
        <td class="td-right mono">${fmtGBP(running)}</td>
        <td class="td-right mono ${vsCls}">${vsStr}</td>
      </tr>`;
  });

  return `
    <div class="panel mt-20" data-section="goals">
      <div class="panel-header"><span class="panel-title">Savings Forecast — India Trip (£${TARGET_GBP.toLocaleString()} target)</span></div>
      <div class="label-muted" style="margin-bottom:10px">Starting balance: ${fmtGBP(START_BALANCE)}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Month</th><th class="td-right">Shifts</th><th class="td-right">OT Gross</th>
            <th class="td-right">Est. Net</th><th class="td-right">Expenses</th><th class="td-right">Redirect</th>
            <th class="td-right">Saved</th><th class="td-right">Running Total</th><th class="td-right">vs £3k</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="mt-16">
        <div class="progress-label">
          <span>What-if: add hypothetical OT to future months</span>
          <span class="mono" id="ot-whatif-label">+${fmtGBP(whatIfExtra)}/mo</span>
        </div>
        <input type="range" id="ot-whatif" class="range-slider mt-8" min="0" max="500" step="25" value="${whatIfExtra}">
      </div>
    </div>`;
}

// ── Events ────────────────────────────────────────────────────

function attachEvents() {
  // Add shift
  const addBtn = document.getElementById('ot-add-btn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const date = document.getElementById('ot-date').value;
    const amount = parseFloat(document.getElementById('ot-amount').value);
    const note = document.getElementById('ot-note').value.trim();
    const confirmed = document.getElementById('ot-confirmed').checked;
    if (!date || !(amount > 0)) {
      alert('Enter a valid date and a positive amount.');
      return;
    }
    state.otShifts.push({ id: 'ot-' + Date.now(), date, grossGBP: round2(amount), note, confirmed });
    await saveSec('fin_ot_shifts', state.otShifts);
    render();
  });

  // Delete shift
  document.querySelectorAll('.ot-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      state.otShifts = state.otShifts.filter(s => s.id !== id);
      await saveSec('fin_ot_shifts', state.otShifts);
      render();
    });
  });

  // Mark-confirmed: reveal inline form
  document.querySelectorAll('.ot-confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.querySelector(`.ot-confirm-form[data-month="${btn.dataset.month}"]`);
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Mark-confirmed: save actual net pay + variance
  document.querySelectorAll('.ot-confirm-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const month = btn.dataset.month;
      const input = document.querySelector(`.ot-actual-input[data-month="${month}"]`);
      const actual = parseFloat(input?.value);
      if (!(actual > 0)) { alert('Enter the actual net pay.'); return; }
      const p = predictMonth(month);
      const summary = state.otMonthlySummary[month] || { totalGross: getMonthTotal(month), shiftCount: getMonthShifts(month).length };
      summary.confirmed = true;
      summary.actualNetGBP = round2(actual);
      summary.varianceGBP = round2(actual - p.pay.netWithOT);
      state.otMonthlySummary[month] = summary;
      await saveSec('fin_ot_monthly_summary', state.otMonthlySummary);

      // Write confirmed month's saved amount back to India trip goal
      // so the dashboard Goals tab and India trip gauge stay in sync
      const expenses = p.monthExpenses || 0;
      const indiaRedirect = p.indiaRedirect || 0;
      const monthlySaved = round2(actual - expenses + indiaRedirect);
      if (monthlySaved > 0 && state.goals?.indiaTrip) {
        state.goals.indiaTrip.savedGBP = round2((state.goals.indiaTrip.savedGBP || 0) + monthlySaved);
        await saveSec('fin_goals', state.goals);
      }

      render();
    });
  });

  // What-if slider (display only — NOT saved)
  const slider = document.getElementById('ot-whatif');
  if (slider) {
    slider.addEventListener('input', () => {
      whatIfExtra = parseFloat(slider.value) || 0;
      const label = document.getElementById('ot-whatif-label');
      if (label) label.textContent = '+' + fmtGBP(whatIfExtra) + '/mo';
    });
    slider.addEventListener('change', () => {
      whatIfExtra = parseFloat(slider.value) || 0;
      render();
    });
  }
}

// ── Util ──────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

render();
