import { initPage, saveSec } from '../page-init.js';
import { calculateNetPay, totalExpenses, fmtGBP, round2 } from '../calc.js';

// ── OT Tracker — full build ───────────────────────────────────
// Shift model: { id, date, hours, type, notes, grossGBP, netGBP }
// Types: 'regular' | 'weekend' | 'bank_holiday'
// Net = gross * (1 - 0.40) effective tax estimate

const state = await initPage('overtime');

// Ensure data structures exist
if (!Array.isArray(state.otShifts)) state.otShifts = [];
if (!state.otMonthlySummary || typeof state.otMonthlySummary !== 'object') state.otMonthlySummary = {};

// Forecast/prediction config (preserved from original page)
const FORECAST_MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const FORECAST_LABELS = { '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug','2026-09':'Sep','2026-10':'Oct' };
const INDIA_TARGET_GBP = 3000;
const START_BALANCE = state.goals?.indiaTrip?.savedGBP || 600;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// OT rate per hour from income settings
function getOTRatePerHour() {
  return state.income?.avgOvertimeGrossGBP || 0;
}

// Effective tax for OT net estimate (40% blended)
const OT_TAX_RATE = 0.40;

// What-if slider (display only, never saved)
let whatIfExtra = 0;

// Chart instances (destroyed on re-render to avoid duplicates)
let chartBar = null;
let chartDoughnut = null;

// ── Helpers ───────────────────────────────────────────────────

function calcGross(hours) {
  const rate = getOTRatePerHour();
  if (!rate || !hours) return 0;
  return round2(hours * rate);
}

function calcNet(grossGBP) {
  return round2(grossGBP * (1 - OT_TAX_RATE));
}

function getMonthShifts(yearMonth) {
  return state.otShifts.filter(s => (s.date || '').slice(0, 7) === yearMonth);
}

function getMonthGrossTotal(yearMonth) {
  return round2(getMonthShifts(yearMonth).reduce((s, sh) => s + (sh.grossGBP || 0), 0));
}

function ytdGrossTotal() {
  const year = new Date().getFullYear().toString();
  return round2(state.otShifts
    .filter(s => (s.date || '').startsWith(year))
    .reduce((s, sh) => s + (sh.grossGBP || 0), 0));
}

function ytdNetTotal() {
  return round2(ytdGrossTotal() * (1 - OT_TAX_RATE));
}

function currentMonthHours() {
  return round2(getMonthShifts(CURRENT_MONTH).reduce((s, sh) => s + (sh.hours || 0), 0));
}

function currentMonthGross() {
  return getMonthGrossTotal(CURRENT_MONTH);
}

function currentMonthNet() {
  return round2(currentMonthGross() * (1 - OT_TAX_RATE));
}

// Last 12 calendar months (inclusive of current) in YYYY-MM order
function last12Months() {
  const months = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'));
  }
  return months;
}

function shortMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('en-GB', { month: 'short' });
}

function typeLabel(type) {
  return { regular: 'Regular OT', weekend: 'Weekend', bank_holiday: 'Bank Holiday' }[type] || type;
}

function typeBadgeClass(type) {
  return { regular: 'badge-info', weekend: 'badge-warning', bank_holiday: 'badge-positive' }[type] || 'badge-neutral';
}

// Forecast helpers (kept for savings forecast section)
function getExpensesForMonth(yearMonth) {
  const targetDate = yearMonth + '-15';
  const items = (state.expenses?.items || []).map(item => ({ ...item }));
  for (const change of (state.expenses?.scheduledChanges || [])) {
    if (change.changeDate <= targetDate) {
      const idx = items.findIndex(i => i.id === change.expenseId);
      if (idx >= 0) items[idx].monthlyGBP = change.newMonthlyGBP;
    }
  }
  return items;
}

function indiaRedirectGBP(expItems) {
  return (expItems || []).find(e => e.id === 'india')?.monthlyGBP || 0;
}

function predictMonth(yearMonth, extraOT = 0) {
  const shifts = getMonthShifts(yearMonth);
  const otGross = round2(shifts.reduce((s, sh) => s + (sh.grossGBP || 0), 0) + extraOT);
  const pay = calculateNetPay({ ...(state.income || {}), avgOvertimeGrossGBP: otGross });
  const expItems = getExpensesForMonth(yearMonth);
  const monthExpenses = totalExpenses(expItems);
  const indiaRedirect = indiaRedirectGBP(expItems);
  const surplus = round2(pay.netWithOT - monthExpenses);
  const projectedSavings = round2(surplus + indiaRedirect);
  return { yearMonth, otGross, pay, monthExpenses, indiaRedirect, surplus, projectedSavings, shifts };
}

function rollingAverage() {
  const complete = FORECAST_MONTHS.filter(m => m < CURRENT_MONTH);
  const last3 = complete.slice(-3);
  if (!last3.length) return 0;
  return round2(last3.reduce((s, m) => s + getMonthGrossTotal(m), 0) / last3.length);
}

function isConfirmed(yearMonth) {
  return !!state.otMonthlySummary[yearMonth]?.confirmed;
}

// ── Render ────────────────────────────────────────────────────

function render() {
  // Destroy existing chart instances before re-render clears the canvas
  if (chartBar) { try { chartBar.destroy(); } catch(_) {} chartBar = null; }
  if (chartDoughnut) { try { chartDoughnut.destroy(); } catch(_) {} chartDoughnut = null; }

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">OT Tracker</div>
        <div class="section-subtitle">Log overtime shifts, track hours &amp; forecast take-home earnings</div>
      </div>
    </div>

    ${renderSummaryCards()}
    ${renderAddShiftForm()}
    ${renderShiftsTable()}
    ${renderCharts()}
    ${renderPredictiveSalary()}
    ${renderSavingsForecast()}
  `;

  attachEvents();
  initCharts();
}

// ── Summary cards ─────────────────────────────────────────────

function renderSummaryCards() {
  const hours  = currentMonthHours();
  const gross  = currentMonthGross();
  const net    = currentMonthNet();
  const ytd    = ytdGrossTotal();
  const rate   = getOTRatePerHour();
  const rateNote = rate > 0 ? `£${rate}/hr` : 'Set rate in Income';

  return `
    <div class="grid-4 mt-8">
      <div class="metric-card">
        <span class="label">OT Hours This Month</span>
        <span class="value mono">${hours.toFixed(1)}<span style="font-size:16px;color:var(--text-secondary)"> hrs</span></span>
        <span class="sub">${rateNote}</span>
      </div>
      <div class="metric-card">
        <span class="label">Gross OT This Month</span>
        <span class="value text-positive mono">${fmtGBP(gross)}</span>
        <span class="sub">before tax</span>
      </div>
      <div class="metric-card">
        <span class="label">Net OT This Month</span>
        <span class="value mono">${fmtGBP(net)}</span>
        <span class="sub">~40% effective tax</span>
      </div>
      <div class="metric-card">
        <span class="label">YTD OT (Net)</span>
        <span class="value mono">${fmtGBP(ytdNetTotal())}</span>
        <span class="sub">Gross: ${fmtGBP(ytd)}</span>
      </div>
    </div>`;
}

// ── Add shift form ────────────────────────────────────────────

function renderAddShiftForm() {
  const today = new Date().toISOString().slice(0, 10);
  const rate = getOTRatePerHour();
  return `
    <div class="panel mt-20" data-section="income">
      <div class="panel-header"><span class="panel-title">Log OT Shift</span></div>
      <div class="grid-4" style="align-items:end;gap:12px">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="ot-date" class="form-input" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (hours)</label>
          <input type="number" id="ot-hours" class="form-input" placeholder="e.g. 7.5" min="0.25" step="0.25">
        </div>
        <div class="form-group">
          <label class="form-label">Shift Type</label>
          <select id="ot-type" class="form-select">
            <option value="regular">Regular OT</option>
            <option value="weekend">Weekend</option>
            <option value="bank_holiday">Bank Holiday</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <input type="text" id="ot-notes" class="form-input" placeholder="Ward, reason…">
        </div>
      </div>
      ${rate > 0 ? `<div class="label-muted mt-8" style="font-size:12px">OT rate: £${rate}/hr &middot; Enter hours to auto-calculate gross. Override the calculated amount if your actual pay differs.</div>` : `<div class="alert alert-warning mt-8" style="font-size:12px;padding:8px 12px">Set your hourly OT rate in <a href="income.html" style="color:var(--color-info)">Income Settings</a> (avgOvertimeGrossGBP) for auto-calculation.</div>`}
      <div class="flex items-center gap-8 mt-12" style="flex-wrap:wrap">
        <div class="form-group" style="flex:0 0 200px">
          <label class="form-label">Gross Pay Override (£)</label>
          <input type="number" id="ot-gross-override" class="form-input" placeholder="Auto-calculated" step="any" min="0">
        </div>
        <div style="margin-top:22px">
          <button id="ot-add-btn" class="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Shift
          </button>
        </div>
      </div>
    </div>`;
}

// ── Shifts table ──────────────────────────────────────────────

function renderShiftsTable() {
  const sorted = [...state.otShifts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!sorted.length) {
    return `
      <div class="panel mt-20">
        <div class="panel-header"><span class="panel-title">Logged Shifts</span></div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          <div>No shifts logged yet. Add your first shift above.</div>
        </div>
      </div>`;
  }

  const rows = sorted.map(sh => `
    <tr>
      <td class="mono">${sh.date || ''}</td>
      <td class="mono td-right">${(sh.hours || 0).toFixed(2)}</td>
      <td><span class="badge ${typeBadgeClass(sh.type)}">${typeLabel(sh.type)}</span></td>
      <td class="mono td-right text-positive">${fmtGBP(sh.grossGBP || 0)}</td>
      <td class="mono td-right">${fmtGBP(sh.netGBP || 0)}</td>
      <td style="color:var(--text-muted);font-size:12px">${escapeHtml(sh.notes || '')}</td>
      <td>
        <button class="btn-icon danger ot-del-btn" data-id="${sh.id}" title="Delete shift">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </td>
    </tr>`).join('');

  return `
    <div class="panel mt-20">
      <div class="panel-header">
        <span class="panel-title">Logged Shifts</span>
        <span class="label-muted" style="font-size:12px">${sorted.length} shift${sorted.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th class="td-right">Hrs</th>
              <th>Type</th>
              <th class="td-right">Gross</th>
              <th class="td-right">Net (~60%)</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Charts ────────────────────────────────────────────────────

function renderCharts() {
  return `
    <div class="grid-2 mt-20">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">OT Hours — Last 12 Months</span></div>
        <div class="chart-wrap chart-h-200"><canvas id="ot-chart-bar"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Shift Type Distribution</span></div>
        <div class="chart-wrap chart-h-200"><canvas id="ot-chart-doughnut"></canvas></div>
        <div class="chart-legend" id="ot-doughnut-legend"></div>
      </div>
    </div>`;
}

function initCharts() {
  // Bar chart — last 12 months OT hours
  const months = last12Months();
  const labels = months.map(shortMonthLabel);
  const hoursData = months.map(ym =>
    round2(getMonthShifts(ym).reduce((s, sh) => s + (sh.hours || 0), 0))
  );

  const barCtx = document.getElementById('ot-chart-bar')?.getContext('2d');
  if (barCtx) {
    chartBar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'OT Hours',
          data: hoursData,
          backgroundColor: 'rgba(0,191,255,0.55)',
          borderColor: '#00bfff',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.y.toFixed(1)} hrs`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,191,255,0.06)' },
            ticks: { color: '#7a96b3', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(0,191,255,0.06)' },
            ticks: { color: '#7a96b3', font: { size: 11 }, callback: v => v + 'h' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // Doughnut chart — shift type distribution
  const typeCounts = { regular: 0, weekend: 0, bank_holiday: 0 };
  for (const sh of state.otShifts) {
    const t = sh.type || 'regular';
    if (typeCounts[t] !== undefined) typeCounts[t]++;
  }
  const donutLabels = ['Regular OT', 'Weekend', 'Bank Holiday'];
  const donutData = [typeCounts.regular, typeCounts.weekend, typeCounts.bank_holiday];
  const donutColors = ['#00bfff', '#ff9100', '#00e676'];

  const donutCtx = document.getElementById('ot-chart-doughnut')?.getContext('2d');
  if (donutCtx) {
    chartDoughnut = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: donutLabels,
        datasets: [{
          data: donutData,
          backgroundColor: donutColors.map(c => c + 'aa'),
          borderColor: donutColors,
          borderWidth: 1.5,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} shift${ctx.parsed !== 1 ? 's' : ''}`,
            },
          },
        },
      },
    });

    // Custom legend
    const legend = document.getElementById('ot-doughnut-legend');
    if (legend) {
      legend.innerHTML = donutLabels.map((l, i) =>
        `<div class="legend-item"><div class="legend-dot" style="background:${donutColors[i]}"></div>${l}: <strong class="mono">${donutData[i]}</strong></div>`
      ).join('');
    }
  }
}

// ── Predictive salary panel ────────────────────────────────────

function renderPredictiveSalary() {
  const cards = FORECAST_MONTHS.map(ym => {
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
      const vStr = variance == null ? '—' : (variance >= 0 ? '+' : '−') + fmtGBP(Math.abs(variance));
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
          <span class="panel-title">${FORECAST_LABELS[ym] || ym} 2026</span>
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
    <div class="section-header mt-20">
      <div><div class="section-title" style="font-size:16px">Predictive Salary — May to Oct 2026</div></div>
    </div>
    <div class="grid-3">${cards}</div>`;
}

// ── Savings forecast ──────────────────────────────────────────

function renderSavingsForecast() {
  let running = START_BALANCE;
  let rows = '';

  FORECAST_MONTHS.forEach(ym => {
    const confirmed = isConfirmed(ym);
    const extra = (whatIfExtra > 0 && ym >= CURRENT_MONTH) ? whatIfExtra : 0;
    const p = predictMonth(ym, extra);
    const summary = state.otMonthlySummary[ym] || {};
    const netPay = (confirmed && summary.actualNetGBP != null) ? summary.actualNetGBP : p.pay.netWithOT;

    let saved;
    if (ym === '2026-05') {
      saved = 100;
    } else {
      saved = round2(round2(netPay - p.monthExpenses) + p.indiaRedirect);
    }
    running = round2(running + saved);

    const hitTarget = running >= INDIA_TARGET_GBP;
    const vsTarget = round2(running - INDIA_TARGET_GBP);
    const vsCls = vsTarget >= 0 ? 'text-positive' : 'text-negative';
    const vsStr = (vsTarget >= 0 ? '+' : '−') + fmtGBP(Math.abs(vsTarget));

    rows += `
      <tr class="${hitTarget ? 'best-row' : ''}">
        <td>${FORECAST_LABELS[ym] || ym} ${confirmed ? '<span class="badge badge-positive" style="margin-left:4px">✓</span>' : ''}</td>
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
      <div class="panel-header"><span class="panel-title">Savings Forecast — India Trip (£${INDIA_TARGET_GBP.toLocaleString()} target)</span></div>
      <div class="label-muted" style="margin-bottom:10px">Starting balance: ${fmtGBP(START_BALANCE)}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Month</th><th class="td-right">Shifts</th><th class="td-right">OT Gross</th>
            <th class="td-right">Est. Net</th><th class="td-right">Expenses</th><th class="td-right">Redirect</th>
            <th class="td-right">Saved</th><th class="td-right">Running</th><th class="td-right">vs £3k</th>
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
    const date   = document.getElementById('ot-date').value;
    const hours  = parseFloat(document.getElementById('ot-hours').value);
    const type   = document.getElementById('ot-type').value;
    const notes  = document.getElementById('ot-notes').value.trim();
    const override = document.getElementById('ot-gross-override').value;

    if (!date) { alert('Select a date.'); return; }
    if (!(hours > 0)) { alert('Enter a valid duration in hours.'); return; }

    // Use override if provided; otherwise auto-calculate from rate × hours
    let grossGBP;
    if (override !== '' && parseFloat(override) > 0) {
      grossGBP = round2(parseFloat(override));
    } else {
      grossGBP = calcGross(hours);
    }
    const netGBP = calcNet(grossGBP);

    state.otShifts.push({
      id: 'ot-' + Date.now(),
      date,
      hours: round2(hours),
      type,
      notes,
      grossGBP,
      netGBP,
    });

    // Recompute and save monthly summary
    recomputeMonthlySummary();

    await saveSec('fin_ot_shifts', state.otShifts);
    await saveSec('fin_ot_monthly_summary', state.otMonthlySummary);
    render();
  });

  // Delete shift
  document.querySelectorAll('.ot-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.otShifts = state.otShifts.filter(s => s.id !== btn.dataset.id);
      recomputeMonthlySummary();
      await saveSec('fin_ot_shifts', state.otShifts);
      await saveSec('fin_ot_monthly_summary', state.otMonthlySummary);
      render();
    });
  });

  // Confirm month — reveal input
  document.querySelectorAll('.ot-confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.querySelector(`.ot-confirm-form[data-month="${btn.dataset.month}"]`);
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Confirm month — save actual
  document.querySelectorAll('.ot-confirm-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const month = btn.dataset.month;
      const input = document.querySelector(`.ot-actual-input[data-month="${month}"]`);
      const actual = parseFloat(input?.value);
      if (!(actual > 0)) { alert('Enter the actual net pay.'); return; }
      const p = predictMonth(month);
      const summary = state.otMonthlySummary[month] || {
        totalGross: getMonthGrossTotal(month),
        shiftCount: getMonthShifts(month).length,
      };
      summary.confirmed    = true;
      summary.actualNetGBP = round2(actual);
      summary.varianceGBP  = round2(actual - p.pay.netWithOT);
      state.otMonthlySummary[month] = summary;
      await saveSec('fin_ot_monthly_summary', state.otMonthlySummary);

      // Sync India trip saved balance
      const expenses      = p.monthExpenses || 0;
      const indiaRedirect = p.indiaRedirect  || 0;
      const monthlySaved  = round2(actual - expenses + indiaRedirect);
      if (monthlySaved > 0 && state.goals?.indiaTrip) {
        state.goals.indiaTrip.savedGBP = round2((state.goals.indiaTrip.savedGBP || 0) + monthlySaved);
        await saveSec('fin_goals', state.goals);
      }
      render();
    });
  });

  // What-if slider
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

// Recompute monthly summary from shifts array
function recomputeMonthlySummary() {
  const grouped = {};
  for (const sh of state.otShifts) {
    const ym = (sh.date || '').slice(0, 7);
    if (!ym) continue;
    if (!grouped[ym]) grouped[ym] = { totalGross: 0, totalNet: 0, totalHours: 0, shiftCount: 0 };
    grouped[ym].totalGross  = round2(grouped[ym].totalGross  + (sh.grossGBP || 0));
    grouped[ym].totalNet    = round2(grouped[ym].totalNet    + (sh.netGBP   || 0));
    grouped[ym].totalHours  = round2(grouped[ym].totalHours  + (sh.hours    || 0));
    grouped[ym].shiftCount++;
  }
  // Preserve existing confirmed flags, just update the totals
  for (const [ym, totals] of Object.entries(grouped)) {
    const existing = state.otMonthlySummary[ym] || {};
    state.otMonthlySummary[ym] = { ...existing, ...totals };
  }
}

// ── Util ──────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

render();
