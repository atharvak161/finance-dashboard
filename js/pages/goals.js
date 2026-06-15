import { initPage, saveSec } from '../page-init.js';
import {
  indiaTripProgress, emergencyFundProgress,
  calculateNetWorth,
  calculateNetPay, calculateSurplus, totalExpenses, applyScheduledChanges,
  fmtGBP, fmtPct, round2
} from '../calc.js';

const state = await initPage('goals');
render(state);

// Event delegation — guaranteed to catch clicks regardless of render timing
document.addEventListener('click', e => {
  if (e.target.id === 'goals-edit-btn' && !_editing) {
    _editing = true;
    renderEditPanel(state);
  }
});

// ── Main render ───────────────────────────────────────────────

function render(st) {
  renderSummaryCards(st);
  try { renderSavingsAchievability(st); } catch(e) { console.error('savings panel error:', e); }
  renderEditPanel(st);
}

// ── Summary cards ─────────────────────────────────────────────

function renderSummaryCards(st) {
  const goals = st.goals || {};
  const trip  = goals.indiaTrip || {};
  const inv   = st.investments  || { cashAccounts: [], pensions: [], ulips: [] };
  const dbt   = st.debts        || { sbi: {} };
  const rate  = st.settings?.inrGbpRate || 83;

  // Normalise types in case values were stored as strings
  if (trip.savedGBP !== undefined) trip.savedGBP = parseFloat(trip.savedGBP) || 0;
  if (trip.targetGBP !== undefined) trip.targetGBP = parseFloat(trip.targetGBP) || 3000;

  const efProg   = emergencyFundProgress(inv, goals);
  const tripProg = indiaTripProgress(goals);
  const nw       = calculateNetWorth(inv, dbt, rate);
  const wTarget  = goals.wealthTargetGBP || 0;

  // Emergency fund card
  const efColor = efProg.pct >= 100 ? 'positive' : efProg.pct >= 50 ? 'warning' : 'negative';

  // India trip countdown
  const deadline    = trip.deadline ? new Date(trip.deadline) : null;
  const daysLeft    = deadline && !isNaN(deadline.getTime()) ? Math.max(0, Math.round((deadline - new Date()) / 86400000)) : null;
  const deadlineStr = deadline ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // Wealth card
  const wPct    = wTarget > 0 ? Math.min(100, round2((nw.netWorth / wTarget) * 100)) : 0;
  const wColor  = wPct >= 100 ? 'positive' : wPct >= 40 ? 'info' : 'warning';

  document.getElementById('goals-summary-cards').innerHTML = `
    <!-- Emergency fund -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Emergency Fund</span></div>
      <div class="stat-row">
        <span class="stat-label">Saved</span>
        <span class="stat-value mono text-${efColor}">${fmtGBP(efProg.savings)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Target</span>
        <span class="stat-value mono">${fmtGBP(efProg.target)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining</span>
        <span class="stat-value mono ${efProg.remaining > 0 ? 'text-warning' : 'text-positive'}">${fmtGBP(efProg.remaining)}</span>
      </div>
      <div style="margin-top:14px;background:var(--border-weak);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${efProg.pct}%;height:100%;background:var(--color-${efColor});border-radius:4px;transition:width 0.6s ease"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${fmtPct(efProg.pct)} of target</div>
    </div>

    <!-- India trip -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">India Trip</span></div>
      <div class="stat-row">
        <span class="stat-label">Saved</span>
        <span class="stat-value mono text-info">${fmtGBP(trip.savedGBP || 0)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Target</span>
        <span class="stat-value mono">${fmtGBP(trip.targetGBP || 3000)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining</span>
        <span class="stat-value mono ${tripProg.remaining > 0 ? 'text-warning' : 'text-positive'}">${fmtGBP(tripProg.remaining)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Deadline</span>
        <span class="stat-value mono">${deadlineStr}</span>
      </div>
      ${daysLeft !== null ? `<div class="stat-row">
        <span class="stat-label">Days left</span>
        <span class="stat-value mono ${daysLeft < 90 ? 'text-warning' : ''}">${daysLeft} days</span>
      </div>` : ''}
      <div style="margin-top:14px;background:var(--border-weak);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${tripProg.pct}%;height:100%;background:var(--color-info);border-radius:4px;transition:width 0.6s ease"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${fmtPct(tripProg.pct)} of ${fmtGBP(trip.targetGBP || 3000)}</div>
    </div>`;

  document.getElementById('goals-wealth-card').innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Wealth Target</span></div>
      <div style="display:flex;gap:32px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Current net worth</div>
          <div class="stat-value mono text-${nw.netWorth >= 0 ? 'positive' : 'negative'}" style="font-size:1.8rem">${fmtGBP(nw.netWorth)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Wealth target</div>
          <div class="stat-value mono" style="font-size:1.8rem">${fmtGBP(wTarget)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Progress</div>
          <div class="stat-value mono text-${wColor}" style="font-size:1.8rem">${fmtPct(wPct)}</div>
        </div>
      </div>
      <div style="margin-top:16px;background:var(--border-weak);border-radius:4px;height:8px;overflow:hidden">
        <div style="width:${wPct}%;height:100%;background:var(--color-${wColor});border-radius:4px;transition:width 0.6s ease"></div>
      </div>
    </div>`;
}

// ── Savings Goal Achievability ────────────────────────────────

let _savingsChart = null;
let _savingsGauge = null;
let _editingSavings = false;

function renderSavingsAchievability(st) {
  const el = document.getElementById('goals-savings-achievability');
  if (!el) return;

  const savingsTarget = st.goals?.savingsTarget;

  if (_editingSavings) {
    renderSavingsEditForm(st, el);
    return;
  }

  if (!savingsTarget || !savingsTarget.targetAmount || !savingsTarget.targetDate) {
    el.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Savings Goal</span>
          <button class="btn btn-secondary btn-sm" id="savings-edit-btn">&#9998; Edit</button>
        </div>
        <div style="padding:24px 0;text-align:center;color:var(--text-secondary);font-size:13px">
          Set a savings target to see your achievability forecast.
        </div>
      </div>`;
    document.getElementById('savings-edit-btn').onclick = () => { _editingSavings = true; renderSavingsAchievability(st); };
    return;
  }

  // ── Calculations ──────────────────────────────────────────
  const { targetAmount, targetDate, currentSaved = 0, monthlyContribution = 0 } = savingsTarget;

  // Auto-derive surplus from income / expenses
  const pay     = calculateNetPay(st.income || {});
  const effItems = applyScheduledChanges(st.expenses || { items: [], scheduledChanges: [] });
  const totalExp = totalExpenses(effItems);
  const autoSurplus = calculateSurplus(pay.netWithOT, totalExp);

  // OT monthly average from last 3 months of logged shifts
  const shifts = st.otShifts || [];
  const today  = new Date();
  const OT_TAX = 0.40;
  let avgMonthlyOT = 0;
  if (shifts.length > 0) {
    const last3 = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const gross = round2(shifts.filter(s => (s.date || '').slice(0, 7) === ym).reduce((a, s) => a + (s.grossGBP || 0), 0));
      if (gross > 0) last3.push(round2(gross * (1 - OT_TAX)));
    }
    avgMonthlyOT = last3.length > 0 ? round2(last3.reduce((a, v) => a + v, 0) / last3.length) : 0;
  }

  // Effective monthly going in
  const baseSurplus  = monthlyContribution > 0 ? monthlyContribution : autoSurplus;
  const monthlyTotal = Math.max(0, round2(baseSurplus + avgMonthlyOT));

  // Months from today to target date
  const target   = new Date(targetDate);
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  const monthsToTarget = Math.max(0, Math.ceil((target - today) / msPerMonth));

  // Projection
  const projectedAtTarget = round2(currentSaved + (monthlyTotal * monthsToTarget));
  const confidencePct     = monthlyTotal > 0
    ? Math.min(100, round2((projectedAtTarget / targetAmount) * 100))
    : round2((currentSaved / targetAmount) * 100);

  let status, statusColor;
  if (confidencePct >= 100) { status = 'ACHIEVABLE'; statusColor = 'positive'; }
  else if (confidencePct >= 75) { status = 'ON TRACK';   statusColor = 'warning'; }
  else                           { status = 'AT RISK';    statusColor = 'negative'; }

  // Months needed to reach target independently
  const remaining    = Math.max(0, targetAmount - currentSaved);
  const monthsNeeded = monthlyTotal > 0 ? Math.ceil(remaining / monthlyTotal) : null;
  let reachDateStr   = '—';
  if (monthsNeeded !== null) {
    const rd = new Date(today.getFullYear(), today.getMonth() + monthsNeeded, 1);
    reachDateStr = rd.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  // Target date label
  const targetDateLabel = target.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  // Chart data — build cumulative array from today to targetDate
  const chartLabels  = [];
  const chartSavings = [];
  const chartTarget  = [];
  for (let m = 0; m <= monthsToTarget; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const label = d.toLocaleString('en-GB', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2);
    chartLabels.push(label);
    chartSavings.push(round2(currentSaved + monthlyTotal * m));
    chartTarget.push(targetAmount);
  }

  // ── Render HTML ───────────────────────────────────────────
  el.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Savings Goal</span>
        <button class="btn btn-secondary btn-sm" id="savings-edit-btn">&#9998; Edit</button>
      </div>

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap">
        <span class="badge badge-${statusColor}" style="font-size:12px;font-weight:700;padding:4px 10px;letter-spacing:0.04em">${status}</span>
        <span style="font-size:13.5px;color:var(--text-secondary)">Target: <span class="mono text-info">${fmtGBP(targetAmount)}</span> by <span class="mono">${targetDateLabel}</span></span>
      </div>

      <div style="margin-bottom:6px;font-size:12.5px;color:var(--text-secondary)">
        Confidence — <span class="mono text-${statusColor}">${fmtPct(confidencePct)}</span>
        &nbsp;<span style="color:var(--text-muted)">${fmtGBP(projectedAtTarget)} of ${fmtGBP(targetAmount)} projected</span>
      </div>
      <div style="background:var(--border-weak);border-radius:4px;height:8px;overflow:hidden;margin-bottom:20px">
        <div style="width:${Math.min(100, confidencePct)}%;height:100%;background:var(--color-${statusColor});border-radius:4px;transition:width 0.6s ease"></div>
      </div>

      <div class="stat-row">
        <span class="stat-label">Monthly going in</span>
        <span class="stat-value mono text-info">${fmtGBP(monthlyTotal)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Currently saved</span>
        <span class="stat-value mono">${fmtGBP(currentSaved)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining</span>
        <span class="stat-value mono ${remaining > 0 ? 'text-warning' : 'text-positive'}">${fmtGBP(remaining)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Will reach target</span>
        <span class="stat-value mono">${reachDateStr}</span>
      </div>

      <!-- Gauge -->
      <div style="margin-top:24px;margin-bottom:0">
        <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;font-weight:500">GOAL ACHIEVABILITY</div>
        <div class="chart-wrap" style="height:180px">
          <canvas id="savings-goal-gauge"></canvas>
        </div>
        <div style="text-align:center;margin-top:-30px;position:relative;z-index:2">
          <div style="font-size:2.2rem;font-weight:700;color:var(--color-${statusColor});font-family:monospace">${fmtPct(confidencePct)}</div>
          <div style="font-size:12px;font-weight:700;color:var(--color-${statusColor});letter-spacing:0.1em">${status}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmtGBP(projectedAtTarget)} projected by ${targetDateLabel}</div>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border-weak);margin:20px 0">

      <div class="chart-wrap chart-h-260" style="margin-top:20px">
        <canvas id="savings-goal-chart"></canvas>
      </div>
    </div>`;

  document.getElementById('savings-edit-btn').onclick = () => { _editingSavings = true; renderSavingsAchievability(st); };

  // ── Gauge chart ───────────────────────────────────────────
  if (_savingsGauge) { _savingsGauge.destroy(); _savingsGauge = null; }

  const gaugeNeedlePlugin = {
    id: 'gaugeNeedle',
    afterDraw(chart) {
      const { ctx, chartArea: { width, height, left, top } } = chart;
      const cx = left + width / 2;
      const cy = top + height * 0.85;

      const pct      = chart.config.options._needlePct || 0;
      const angleRad = Math.PI * (1 - pct / 100); // 0%=π (left/red), 100%=0 (right/green)

      const needleLen  = Math.min(width, height * 1.7) * 0.38;
      const needleBase = 8;

      ctx.save();
      ctx.translate(cx, cy);

      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur  = 6;

      ctx.beginPath();
      ctx.moveTo(-needleBase * Math.sin(angleRad - Math.PI / 2), needleBase * Math.cos(angleRad - Math.PI / 2));
      ctx.lineTo(needleLen * Math.cos(Math.PI - angleRad), -needleLen * Math.sin(Math.PI - angleRad));
      ctx.lineTo(needleBase * Math.sin(angleRad - Math.PI / 2), -needleBase * Math.cos(angleRad - Math.PI / 2));
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, needleBase * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    }
  };

  const gaugeCtx = document.getElementById('savings-goal-gauge');
  if (gaugeCtx && typeof Chart !== 'undefined') {
    _savingsGauge = new Chart(gaugeCtx, {
      type: 'doughnut',
      plugins: [gaugeNeedlePlugin],
      data: {
        datasets: [{
          data: [50, 30, 20, 100],
          backgroundColor: ['#ff1744', '#ff9100', '#00e676', 'transparent'],
          borderWidth: 0,
          hoverBackgroundColor: ['#ff1744', '#ff9100', '#00e676', 'transparent'],
          hoverBorderWidth: 0,
        }]
      },
      options: {
        rotation: -90,
        circumference: 180,
        cutout: '65%',
        _needlePct: confidencePct,
        animation: {
          duration: 900,
          easing: 'easeOutQuart',
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        events: [],
      }
    });
  }

  // ── Line chart ────────────────────────────────────────────
  if (_savingsChart) { _savingsChart.destroy(); _savingsChart = null; }

  const ctx = document.getElementById('savings-goal-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  _savingsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Projected savings',
          data: chartSavings,
          borderColor: '#00bfff',
          backgroundColor: 'rgba(0,191,255,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#00bfff',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Target',
          data: chartTarget,
          borderColor: '#ff9100',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          labels: {
            color: '#3d5473',
            boxWidth: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmtGBP(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#3d5473', font: { size: 11 } },
          grid:  { color: 'rgba(0,191,255,0.07)' },
        },
        y: {
          ticks: {
            color: '#3d5473',
            font: { size: 11 },
            callback: v => fmtGBP(v),
          },
          grid: { color: 'rgba(0,191,255,0.07)' },
        },
      },
    },
  });
}

function renderSavingsEditForm(st, el) {
  const sv = st.goals?.savingsTarget || {};

  el.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Savings Goal</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">
        <div class="form-group">
          <label class="form-label">Target amount (£)</label>
          <input type="number" class="form-input" id="sv-target-amount" value="${sv.targetAmount || ''}" step="any" />
        </div>
        <div class="form-group">
          <label class="form-label">Target date</label>
          <input type="date" class="form-input" id="sv-target-date" value="${sv.targetDate || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Currently saved (£)</label>
          <input type="number" class="form-input" id="sv-current-saved" value="${sv.currentSaved || ''}" step="any" />
        </div>
        <div class="form-group">
          <label class="form-label">Monthly amount going in (£)</label>
          <input type="number" class="form-input" id="sv-monthly-contrib" value="${sv.monthlyContribution || ''}" step="any" placeholder="0 = auto from surplus" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Leave 0 to auto-calculate from surplus</div>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" id="sv-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="sv-save-btn">Save</button>
      </div>
    </div>`;

  document.getElementById('sv-cancel-btn').onclick = () => {
    _editingSavings = false;
    renderSavingsAchievability(st);
  };

  document.getElementById('sv-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('sv-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    if (!st.goals) st.goals = {};
    st.goals.savingsTarget = {
      targetAmount:       parseFloat(document.getElementById('sv-target-amount').value)   || 0,
      targetDate:         document.getElementById('sv-target-date').value,
      currentSaved:       parseFloat(document.getElementById('sv-current-saved').value)   || 0,
      monthlyContribution: parseFloat(document.getElementById('sv-monthly-contrib').value) || 0,
    };

    try {
      await saveSec('fin_goals', st.goals);
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        _editingSavings = false;
        render(st);
      }, 1200);
    } catch (err) {
      console.error('Savings goal save failed:', err);
      saveBtn.textContent = '✕ Error';
      saveBtn.disabled = false;
    }
  };
}

// ── Edit panel ────────────────────────────────────────────────

let _editing = false;

function renderEditPanel(st) {
  const body = document.getElementById('goals-edit-body');
  const btn  = document.getElementById('goals-edit-btn');

  if (!_editing) {
    body.innerHTML = '';
    btn.textContent = '✎ Edit Goals';
    btn.onclick = () => { _editing = true; renderEditPanel(st); };
    return;
  }

  const goals = st.goals || {};
  const trip  = goals.indiaTrip  || {};
  const bd    = trip.breakdown   || [];

  btn.textContent = '';
  btn.onclick = null;

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">
      <div class="form-group">
        <label class="form-label">Emergency fund target (£)</label>
        <input type="number" class="form-input" id="ef-edit-target" value="${goals.emergencyFundTargetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Wealth target (£)</label>
        <input type="number" class="form-input" id="ef-edit-wealth" value="${goals.wealthTargetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Target retirement age</label>
        <input type="number" class="form-input" id="ef-edit-retage" value="${goals.targetAge || ''}" step="1" />
      </div>
    </div>

    <div style="margin-top:20px;margin-bottom:12px;font-size:12.5px;color:var(--text-secondary);font-weight:500">India Trip</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-group">
        <label class="form-label">Target (£)</label>
        <input type="number" class="form-input" id="trip-edit-target" value="${trip.targetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Saved (£)</label>
        <input type="number" class="form-input" id="trip-edit-saved" value="${trip.savedGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Deadline</label>
        <input type="date" class="form-input" id="trip-edit-deadline" value="${trip.deadline || ''}" />
      </div>
      <div class="form-group" style="justify-content:flex-end;padding-bottom:2px">
        <label class="form-label">Flights paid?</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="trip-edit-flights" ${trip.flightsPaid ? 'checked' : ''} style="width:auto">
          <span class="label-muted">Yes, flights are paid</span>
        </label>
      </div>
    </div>

    <div style="margin-top:20px;margin-bottom:10px;font-size:12.5px;color:var(--text-secondary);font-weight:500">Budget Breakdown</div>
    <table class="data-table" style="margin-bottom:10px">
      <thead>
        <tr>
          <th>Item</th>
          <th>Currency</th>
          <th>Amount</th>
          <th>Paid?</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="bd-rows">
        ${bd.map((b, i) => breakdownRow(b, i)).join('')}
      </tbody>
    </table>
    <button class="btn btn-secondary btn-sm" id="bd-add-btn">+ Add item</button>

    <div style="margin-top:24px;display:flex;justify-content:flex-end;gap:10px">
      <button class="btn btn-secondary" id="goals-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="goals-save-btn">Save</button>
    </div>`;

  // Bind breakdown row delete buttons
  bindBreakdownDelete(st);

  // Add item button
  document.getElementById('bd-add-btn').onclick = () => {
    if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
    if (!st.goals.indiaTrip.breakdown) st.goals.indiaTrip.breakdown = [];
    st.goals.indiaTrip.breakdown.push({ item: '', currency: 'GBP', amountGBP: 0, paid: false });
    renderEditPanel(st);
  };

  // Cancel
  document.getElementById('goals-cancel-btn').onclick = () => {
    _editing = false;
    renderEditPanel(st);
  };

  // Save
  document.getElementById('goals-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('goals-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    // Read top-level fields
    if (!st.goals) st.goals = {};
    if (!st.goals.indiaTrip) st.goals.indiaTrip = {};

    st.goals.emergencyFundTargetGBP = parseFloat(document.getElementById('ef-edit-target').value) || 0;
    st.goals.wealthTargetGBP        = parseFloat(document.getElementById('ef-edit-wealth').value)  || 0;
    st.goals.targetAge              = parseInt(document.getElementById('ef-edit-retage').value, 10) || 0;

    st.goals.indiaTrip.targetGBP   = parseFloat(document.getElementById('trip-edit-target').value)   || 0;
    st.goals.indiaTrip.savedGBP    = parseFloat(document.getElementById('trip-edit-saved').value)    || 0;
    st.goals.indiaTrip.deadline    = document.getElementById('trip-edit-deadline').value;
    st.goals.indiaTrip.flightsPaid = document.getElementById('trip-edit-flights').checked;

    // Read breakdown rows
    const rows = document.querySelectorAll('.bd-row');
    st.goals.indiaTrip.breakdown = Array.from(rows).map(row => ({
      item:      row.querySelector('.bd-item').value,
      currency:  row.querySelector('.bd-currency').value,
      amountGBP: parseFloat(row.querySelector('.bd-amount').value) || 0,
      paid:      row.querySelector('.bd-paid').checked,
    }));

    try {
      await saveSec('fin_goals', st.goals);
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        _editing = false;
        render(st);
      }, 1200);
    } catch (err) {
      console.error('Goals save failed:', err);
      saveBtn.textContent = '✕ Error';
      saveBtn.disabled = false;
    }
  };
}

function breakdownRow(b, i) {
  return `<tr class="bd-row" data-idx="${i}">
    <td><input type="text"   class="form-input bd-item"     value="${escHtml(b.item || '')}" placeholder="Item name" style="padding:4px 8px;font-size:12px" /></td>
    <td><input type="text"   class="form-input bd-currency" value="${escHtml(b.currency || 'GBP')}" style="padding:4px 8px;font-size:12px;width:80px" /></td>
    <td><input type="number" class="form-input bd-amount"   value="${b.amountGBP || ''}" step="any" style="padding:4px 8px;font-size:12px" /></td>
    <td style="text-align:center"><input type="checkbox" class="bd-paid" ${b.paid ? 'checked' : ''} style="width:auto" /></td>
    <td><button class="btn-icon danger bd-delete" data-idx="${i}" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
    </button></td>
  </tr>`;
}

function bindBreakdownDelete(st) {
  document.querySelectorAll('.bd-delete').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
      if (!st.goals.indiaTrip.breakdown) st.goals.indiaTrip.breakdown = [];
      st.goals.indiaTrip.breakdown.splice(idx, 1);
      renderEditPanel(st);
    };
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
