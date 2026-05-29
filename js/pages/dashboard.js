import { initPage }                             from '../page-init.js';
import { save }                                  from '../store.js';
import {
  calculateNetPay, calculateNetWorth,
  applyScheduledChanges, totalExpenses,
  expensesByCategory, indiaTripProgress,
  emergencyFundProgress, calculateSurplus,
  fmtGBP, fmtINR, fmtPct, round2
} from '../calc.js';

// Hoisted before top-level await
const C = {
  grid:'rgba(255,255,255,0.06)', tick:'#5c6170',
  info:'#5794f2', positive:'#73bf69', warning:'#ff9830', negative:'#f2495c',
  purple:'#b877d9', teal:'#6ccf8e', cyan:'#4dd0e1', yellow:'#fade2a',
  chart:['#5794f2','#73bf69','#fade2a','#ff9830','#f2495c','#b877d9','#6ccf8e','#4dd0e1'],
};
const charts = {};

const state = await initPage('overview');
render(state);

// ── Render ────────────────────────────────────────────────────

function render(st) {
  const rate    = st.settings?.inrGbpRate || 125;
  const inc     = st.income   || {};
  const inv     = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt     = st.debts    || { sbi:{} };
  const goals   = st.goals    || {};
  const log     = st.monthlyLog || [];

  const pay       = calculateNetPay(inc);
  const effItems  = applyScheduledChanges(st.expenses || { items:[], scheduledChanges:[] });
  const totalExp  = totalExpenses(effItems);
  const surplus   = calculateSurplus(pay.netWithOT, totalExp);
  const nw        = calculateNetWorth(inv, dbt, rate);
  const india     = indiaTripProgress(goals);
  const emergency = emergencyFundProgress(inv, goals);

  // ── KPI cards ────────────────────────────────────────────
  document.getElementById('overview-cards').innerHTML = [
    metricCard('Net Worth', fmtGBP(nw.netWorth),
      nw.netWorth >= 0 ? 'positive' : 'negative',
      `Assets ${fmtGBP(nw.totalAssets)} · Debt ${fmtGBP(nw.totalDebts)}`),
    metricCard('Take-Home (w/ OT)', fmtGBP(pay.netWithOT), 'info',
      `Base ${fmtGBP(pay.netBase)} /mo`),
    metricCard('Monthly Surplus', fmtGBP(surplus),
      surplus >= 0 ? 'positive' : 'negative',
      `Income ${fmtGBP(pay.netWithOT)} − Exp ${fmtGBP(totalExp)}`),
    metricCard('SBI Outstanding', fmtGBP(nw.sbiGBP), 'negative',
      fmtINR(dbt.sbi?.outstandingINR || 0)),
  ].join('');

  // ── Gauges ───────────────────────────────────────────────
  // Debt clearance — progress from outstanding debt toward £0
  const totalDebt   = (dbt.sbi?.outstandingINR || 0) / rate;
  const originalDebt= 3600000 / rate; // sanctioned ₹36L
  const debtPct     = totalDebt <= 0 ? 100 :
    Math.max(0, Math.min(100, round2(((originalDebt - totalDebt) / originalDebt) * 100)));

  document.getElementById('gauge-val-debt').textContent = fmtPct(debtPct);
  document.getElementById('gauge-lbl-debt').textContent = `${fmtGBP(totalDebt)} remaining`;
  document.getElementById('gauge-val-emergency').textContent = fmtPct(emergency.pct);
  document.getElementById('gauge-lbl-emergency').textContent = `${fmtGBP(emergency.savings)} of ${fmtGBP(emergency.target)}`;
  document.getElementById('gauge-val-india').textContent = fmtPct(india.pct);
  document.getElementById('gauge-lbl-india').textContent = `${fmtGBP(goals.indiaTrip?.savedGBP||0)} of ${fmtGBP(goals.indiaTrip?.targetGBP||3000)}`;

  // ── Charts ───────────────────────────────────────────────
  renderCharts(st, { byCat: expensesByCategory(effItems), log, debtPct, india, emergency });
}

// ── Metric card helper ────────────────────────────────────────

function metricCard(label, value, colorClass, sub) {
  const cls = colorClass === 'positive' ? 'text-positive'
            : colorClass === 'negative' ? 'text-negative'
            : colorClass === 'warning'  ? 'text-warning'
            : 'text-info';
  return `<div class="metric-card">
    <div class="label">${label}</div>
    <div class="value ${cls}">${value}</div>
    <div class="sub">${sub}</div>
  </div>`;
}

// ── Charts ────────────────────────────────────────────────────

function getCtx(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  return document.getElementById(id)?.getContext('2d') || null;
}
const base = {
  responsive:true, maintainAspectRatio:false,
  animation:{ duration:700, easing:'easeInOutQuart' },
  plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#252830', borderColor:'rgba(255,255,255,0.12)', borderWidth:1, titleColor:'#d9dde2', bodyColor:'#8e9099', padding:10 } },
  scales:{ x:{ grid:{ color:C.grid }, ticks:{ color:C.tick, font:{ size:11 } } }, y:{ grid:{ color:C.grid }, ticks:{ color:C.tick, font:{ size:11 } } } },
};

function renderCharts(st, { byCat, log, debtPct, india, emergency }) {
  // Expense doughnut
  const labels = Object.keys(byCat), values = Object.values(byCat);
  const ctxDo = getCtx('chart-expense-doughnut');
  if (ctxDo) {
    charts['chart-expense-doughnut'] = new Chart(ctxDo, {
      type:'doughnut',
      data:{ labels, datasets:[{ data:values, backgroundColor:C.chart, borderWidth:0, hoverOffset:6 }] },
      options:{ ...base, cutout:'65%', scales:{ x:{display:false}, y:{display:false} },
        animation:{ animateRotate:true, animateScale:true, duration:900, easing:'easeInOutBack' },
        plugins:{ ...base.plugins, tooltip:{ ...base.plugins.tooltip,
          callbacks:{ label:c=>` £${c.raw.toFixed(0)} — ${c.label}` } } } },
    });
    const leg = document.getElementById('legend-expense-doughnut');
    if (leg) leg.innerHTML = labels.map((l,i)=>
      `<div class="legend-item"><div class="legend-dot" style="background:${C.chart[i%C.chart.length]}"></div>${l}</div>`
    ).join('');
  }

  // Monthly bar
  const ctxBar = getCtx('chart-monthly-bar');
  if (ctxBar && log.length) {
    charts['chart-monthly-bar'] = new Chart(ctxBar, {
      type:'bar',
      data:{ labels:log.map(r=>r.month.replace('-','/')),
        datasets:[
          { label:'Net Income', data:log.map(r=>r.netGBP||0), backgroundColor:C.info+'cc', borderRadius:4,
            animations:{ y:{ from:0, duration:600, easing:'easeOutQuart' } } },
          { label:'Saved',      data:log.map(r=>r.savedGBP||0), backgroundColor:C.positive+'cc', borderRadius:4 },
        ]
      },
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } } },
    });
  }

  // Gauges
  gauge('chart-gauge-debt',      debtPct,    debtPct >= 50 ? C.positive : C.warning);
  gauge('chart-gauge-emergency', emergency.pct, emergency.pct >= 80 ? C.positive : C.warning);
  gauge('chart-gauge-india',     india.pct,  india.pct >= 80 ? C.positive : C.warning);
}

function gauge(id, pct, color) {
  const ctx = getCtx(id); if (!ctx) return;
  const val  = Math.max(0, Math.min(100, pct));
  charts[id] = new Chart(ctx, {
    type:'doughnut',
    data:{ datasets:[{ data:[val, 100-val, 100], backgroundColor:[color,'#252830','transparent'], borderWidth:0, hoverOffset:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'72%',
      animation:{ animateRotate:true, duration:1000, easing:'easeInOutCubic' },
      plugins:{ legend:{display:false}, tooltip:{enabled:false} } },
  });
}
