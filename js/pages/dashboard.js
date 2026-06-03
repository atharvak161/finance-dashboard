import { initPage }                             from '../page-init.js';
import { fetchLiveRate }                         from '../fx-rate.js';
import {
  calculateNetPay, calculateNetWorth,
  applyScheduledChanges, totalExpenses,
  expensesByCategory, indiaTripProgress,
  emergencyFundProgress, calculateSurplus,
  emergencyRunwayMonths, generateAmortisation,
  amortPayoffDate, loanPaidToDate,
  projectULIP, ulipValueGBP, ulipPremiumGBP,
  projectNetWorthTimeline, ageWealthTrajectory,
  taxTrackerProgress, calcNetIndiaTax, calc80EDeduction,
  surplusTrajectoryEvents,
  fmtGBP, fmtINR, fmtPct, fmtMonths, round2
} from '../calc.js';

const safeRate = r => (r && r > 0) ? r : 83;

// ── Shared chart styling ──────────────────────────────────────
const base = {
  responsive:true, maintainAspectRatio:false,
  animation:{ duration:700, easing:'easeInOutQuart' },
  plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'rgba(9,12,20,0.96)', borderColor:'rgba(0,191,255,0.25)', borderWidth:1, titleColor:'#00bfff', bodyColor:'#7a96b3', padding:10 } },
  scales:{ x:{ grid:{ color:'rgba(255,255,255,0.06)' }, ticks:{ color:'#3d5473', font:{ size:11 } } }, y:{ grid:{ color:'rgba(255,255,255,0.06)' }, ticks:{ color:'#3d5473', font:{ size:11 } } } },
};
const C = {
  grid:'rgba(0,191,255,0.07)', tick:'#3d5473',
  info:'#00bfff', positive:'#00e676', warning:'#ff9100', negative:'#ff1744',
  purple:'#d500f9', teal:'#00e5ff', cyan:'#18ffff', yellow:'#ffd600',
  chart:['#00bfff','#00e676','#ffd600','#ff9100','#ff1744','#d500f9','#00e5ff','#18ffff'],
};

// Chart instance registry — destroy before re-render to avoid
// "canvas already in use" errors when switching tabs.
const dashCharts = {};
function getCtx(id) {
  if (dashCharts[id]) { dashCharts[id].destroy(); delete dashCharts[id]; }
  return document.getElementById(id)?.getContext('2d') || null;
}
function destroyAllCharts() {
  for (const id of Object.keys(dashCharts)) { dashCharts[id].destroy(); delete dashCharts[id]; }
}

const state = await initPage('overview');

// ── Tab wiring ────────────────────────────────────────────────
let activeTab = 'overview';
document.querySelectorAll('.dash-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderDashTab(activeTab, state);
  });
});
renderDashTab('overview', state); // initial render

// ── Live rate in top bar ──────────────────────────────────────
async function updateTopbarRate() {
  const el = document.getElementById('topbar-rate-value');
  const timeEl = document.getElementById('topbar-rate-time');
  const container = document.getElementById('topbar-rate');
  if (!container) return;
  container.style.display = 'flex';
  try {
    const r = await fetchLiveRate();
    if (r.rate) {
      el.textContent = `£1 = ₹${r.rate.toFixed(2)}`;
      timeEl.textContent = `· ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} ↻`;
    }
  } catch {}
}
updateTopbarRate();
setInterval(updateTopbarRate, 10 * 60 * 1000);
document.getElementById('topbar-rate-refresh')?.addEventListener('click', updateTopbarRate);

// ══════════════════════════════════════════════════════════════
// Tab dispatcher
// ══════════════════════════════════════════════════════════════

function renderDashTab(tab, st) {
  destroyAllCharts();
  const host = document.getElementById('dash-content');
  if (!host) return;
  switch (tab) {
    case 'overview':  renderOverview(host, st);  break;
    case 'income':    renderIncome(host, st);    break;
    case 'expenses':  renderExpenses(host, st);  break;
    case 'debts':     renderDebts(host, st);     break;
    case 'assets':    renderAssets(host, st);    break;
    case 'networth':  renderNetWorth(host, st);  break;
    case 'goals':     renderGoals(host, st);     break;
    case 'ot':        renderOT(host, st);        break;
    case 'tax':       renderTax(host, st);       break;
    case 'analytics': renderAnalytics(host, st); break;
    default:          renderOverview(host, st);
  }
}

// ── Shared helpers ────────────────────────────────────────────

function metricCard(label, value, colorClass, sub) {
  const cls = colorClass === 'positive' ? 'text-positive'
            : colorClass === 'negative' ? 'text-negative'
            : colorClass === 'warning'  ? 'text-warning'
            : 'text-info';
  return `<div class="metric-card">
    <div class="label">${label}</div>
    <div class="value ${cls}">${value}</div>
    <div class="sub">${sub || ''}</div>
  </div>`;
}

function panel(title, bodyHtml) {
  return `<div class="panel"><div class="panel-header"><span class="panel-title">${title}</span></div>${bodyHtml}</div>`;
}

function chartPanel(title, canvasId, height = 'chart-h-260', legendId = '') {
  return `<div class="panel">
    <div class="panel-header"><span class="panel-title">${title}</span></div>
    <div class="chart-wrap ${height}"><canvas id="${canvasId}"></canvas></div>
    ${legendId ? `<div class="chart-legend" id="${legendId}"></div>` : ''}
  </div>`;
}

function gauge(id, pct, color) {
  const ctx = getCtx(id); if (!ctx) return;
  const val = Math.max(0, Math.min(100, pct));
  dashCharts[id] = new Chart(ctx, {
    type:'doughnut',
    data:{ datasets:[{ data:[val, 100-val, 100], backgroundColor:[color,'#252830','transparent'], borderWidth:0, hoverOffset:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'72%',
      animation:{ animateRotate:true, duration:1000, easing:'easeInOutCubic' },
      plugins:{ legend:{display:false}, tooltip:{enabled:false} } },
  });
}

function gaugePanel(title, id, valId, lblId) {
  return `<div class="panel gauge-wrap">
    <div class="panel-title" style="margin-bottom:8px">${title}</div>
    <div class="gauge-chart-container"><canvas id="${id}"></canvas></div>
    <div class="gauge-value" id="${valId}">0%</div>
    <div class="gauge-label" id="${lblId}"></div>
  </div>`;
}

function legend(legId, labels) {
  const leg = document.getElementById(legId);
  if (leg) leg.innerHTML = labels.map((l,i)=>
    `<div class="legend-item"><div class="legend-dot" style="background:${C.chart[i%C.chart.length]}"></div>${l}</div>`
  ).join('');
}

function doughnut(id, labels, values, legId = '') {
  const ctx = getCtx(id); if (!ctx) return;
  dashCharts[id] = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor:C.chart, borderWidth:0, hoverOffset:6 }] },
    options:{ ...base, cutout:'65%', scales:{ x:{display:false}, y:{display:false} },
      animation:{ animateRotate:true, animateScale:true, duration:900, easing:'easeInOutBack' },
      plugins:{ ...base.plugins, tooltip:{ ...base.plugins.tooltip,
        callbacks:{ label:c=>` £${Number(c.raw).toFixed(0)} — ${c.label}` } } } },
  });
  if (legId) legend(legId, labels);
}

// ══════════════════════════════════════════════════════════════
// OVERVIEW
// ══════════════════════════════════════════════════════════════

function renderOverview(host, st) {
  const rate    = st.settings?.inrGbpRate || 83;
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

  const cashBalance = (inv.cashAccounts || []).reduce((s, a) => s + (a.balanceGBP || 0), 0);

  // India trip saved = explicitly saved amount + liquid cash savings (Revolut etc.)
  const indiaTotalSaved = round2((goals.indiaTrip?.savedGBP || 0) + cashBalance);
  const indiaGoals = { ...goals, indiaTrip: { ...goals.indiaTrip, savedGBP: indiaTotalSaved } };
  const india     = indiaTripProgress(indiaGoals);
  const emergency = emergencyFundProgress(inv, goals);
  const savingsRate = pay.netWithOT > 0 ? round2((surplus / pay.netWithOT) * 100) : 0;
  const runway = emergencyRunwayMonths(cashBalance, totalExp);
  const runwayColor = runway >= 6 ? 'positive' : runway >= 3 ? 'warning' : 'negative';

  const totalDebt    = (dbt.sbi?.outstandingINR || 0) / safeRate(rate);
  const originalDebt = (dbt.sbi?.originalPrincipalINR || dbt.sbi?.outstandingINR || 0) / safeRate(rate);
  const debtPct      = originalDebt <= 0 || totalDebt <= 0 ? (totalDebt <= 0 ? 100 : 0)
    : Math.max(0, Math.min(100, round2(((originalDebt - totalDebt) / originalDebt) * 100)));

  host.innerHTML = `
    <div class="grid-4" data-section="income">
      ${metricCard('Net Worth', fmtGBP(nw.netWorth), nw.netWorth >= 0 ? 'positive' : 'negative', `Assets ${fmtGBP(nw.totalAssets)} · Debt ${fmtGBP(nw.totalDebts)}`)}
      ${metricCard('Take-Home (w/ OT)', fmtGBP(pay.netWithOT), 'info', `Base ${fmtGBP(pay.netBase)} /mo`)}
      ${metricCard('Total Expenses', fmtGBP(totalExp), 'warning', `${effItems.filter(i=>i.active).length} active items`)}
      ${metricCard('Monthly Surplus', fmtGBP(surplus), surplus >= 0 ? 'positive' : 'negative', `Savings rate ${fmtPct(savingsRate)}`)}
    </div>

    <div class="grid-4 mt-20">
      ${metricCard('Savings Rate', fmtPct(savingsRate), savingsRate>=20?'positive':savingsRate>=10?'warning':'negative', 'Benchmark 20%+')}
      ${metricCard('Emergency Runway', runway.toFixed(1) + ' months', runwayColor, runway>=6?'Excellent':runway>=3?'3–6mo target':'Build fund')}
      ${metricCard('SBI Outstanding', fmtGBP(nw.sbiGBP), 'negative', fmtINR(dbt.sbi?.outstandingINR || 0))}
      ${metricCard('India Trip', fmtPct(india.pct), india.pct>=80?'positive':'info', `${fmtGBP(indiaTotalSaved)} of ${fmtGBP(goals.indiaTrip?.targetGBP||3000)}`)}
    </div>

    <div class="grid-2 mt-20">
      ${chartPanel('Net Pay Trend', 'ov-chart-trend')}
      ${chartPanel('Expense Breakdown', 'ov-chart-doughnut', 'chart-h-260', 'ov-legend-doughnut')}
    </div>

    <div class="grid-3 mt-20">
      ${gaugePanel('Debt Clearance', 'ov-gauge-debt', 'ov-val-debt', 'ov-lbl-debt')}
      ${gaugePanel('Emergency Fund', 'ov-gauge-emergency', 'ov-val-emergency', 'ov-lbl-emergency')}
      ${gaugePanel('India Trip', 'ov-gauge-india', 'ov-val-india', 'ov-lbl-india')}
    </div>`;

  // Gauges labels
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('ov-val-debt', fmtPct(debtPct));       set('ov-lbl-debt', `${fmtGBP(totalDebt)} remaining`);
  set('ov-val-emergency', fmtPct(emergency.pct)); set('ov-lbl-emergency', `${fmtGBP(emergency.savings)} of ${fmtGBP(emergency.target)}`);
  set('ov-val-india', fmtPct(india.pct));    set('ov-lbl-india', `${fmtGBP(indiaTotalSaved)} of ${fmtGBP(goals.indiaTrip?.targetGBP||3000)}`);

  // Net pay trend
  const ctxTrend = getCtx('ov-chart-trend');
  if (ctxTrend && log.length) {
    dashCharts['ov-chart-trend'] = new Chart(ctxTrend, {
      type:'line',
      data:{ labels:log.map(r=>r.month), datasets:[
        { label:'Net Income', data:log.map(r=>r.netGBP||0), borderColor:C.info, backgroundColor:C.info+'22', fill:true, tension:0.3, pointRadius:3, borderWidth:2 },
        { label:'Saved', data:log.map(r=>r.savedGBP||0), borderColor:C.positive, backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v } } } },
    });
  }

  const byCat = expensesByCategory(effItems);
  doughnut('ov-chart-doughnut', Object.keys(byCat), Object.values(byCat), 'ov-legend-doughnut');

  gauge('ov-gauge-debt',      debtPct,       debtPct >= 50 ? C.positive : C.warning);
  gauge('ov-gauge-emergency', emergency.pct, emergency.pct >= 80 ? C.positive : C.warning);
  gauge('ov-gauge-india',     india.pct,     india.pct >= 80 ? C.positive : C.warning);
}

// ══════════════════════════════════════════════════════════════
// INCOME
// ══════════════════════════════════════════════════════════════

function renderIncome(host, st) {
  const inc = st.income || {};
  const pay = calculateNetPay(inc);
  const effItems = applyScheduledChanges(st.expenses || { items:[], scheduledChanges:[] });
  const exp = totalExpenses(effItems);
  const otShifts = st.otShifts || [];
  const ytdOT = round2(otShifts.filter(s => (s.date||'').startsWith('2026')).reduce((s, sh) => s + (sh.grossGBP||0), 0));

  const scenarioRows = [28000,40000,55000,65000].map(sal => {
    const p = calculateNetPay({...inc, baseSalaryGBP:sal, avgOvertimeGrossGBP:0});
    const s = calculateSurplus(p.netBase, exp);
    const isCur = sal === (inc.baseSalaryGBP || 28000);
    return `<tr class="${isCur?'highlight-row':''}">
      <td>${isCur?'Current':('£'+sal.toLocaleString())}</td>
      <td class="td-right mono">${fmtGBP(sal)}</td>
      <td class="td-right mono">${fmtGBP(p.netBase)}</td>
      <td class="td-right mono ${s>=0?'text-positive':'text-negative'}">${fmtGBP(s)}</td></tr>`;
  }).join('');

  host.innerHTML = `
    <div class="grid-4" data-section="income">
      ${metricCard('Net (w/ OT)', fmtGBP(pay.netWithOT), 'positive', `Base ${fmtGBP(pay.netBase)}`)}
      ${metricCard('Total Deductions', fmtGBP(pay.totalDeductions), 'negative', 'Tax + NI + Pension')}
      ${metricCard('Hourly Rate', fmtGBP(pay.hourlyRate,2)+'/hr', 'info', `${inc.hoursPerWeek||0} hrs/wk`)}
      ${metricCard('YTD Overtime', fmtGBP(ytdOT), 'info', `${otShifts.length} shifts logged`)}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Net Pay Waterfall', 'inc-chart-waterfall')}
      ${panel('Salary Scenarios', `<table class="data-table">
        <thead><tr><th>Scenario</th><th class="td-right">Gross/yr</th><th class="td-right">Net/mo</th><th class="td-right">Surplus/mo</th></tr></thead>
        <tbody>${scenarioRows}</tbody></table>`)}
    </div>`;

  // Waterfall
  const ctx = getCtx('inc-chart-waterfall');
  if (ctx) {
    const labels = ['Gross','+ OT','− Tax','− NI','− Pension','− Underpay','Net'];
    const offset = [0, pay.grossBase, pay.grossWithOT, pay.grossWithOT-pay.incomeTax, pay.grossWithOT-pay.incomeTax-pay.ni, pay.grossWithOT-pay.incomeTax-pay.ni-pay.pension, 0];
    const bars   = [pay.grossBase, inc.avgOvertimeGrossGBP||0, pay.incomeTax, pay.ni, pay.pension, pay.extraTax, pay.netWithOT];
    const colors = [C.info, C.teal, C.negative, C.negative, C.negative, C.negative, C.positive];
    dashCharts['inc-chart-waterfall'] = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[
        { data:offset, backgroundColor:'transparent', borderWidth:0 },
        { data:bars, backgroundColor:colors, borderRadius:4, borderWidth:0 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'rgba(9,12,20,0.96)', borderColor:'rgba(0,191,255,0.25)', borderWidth:1, filter:i=>i.datasetIndex===1, callbacks:{ label:c=>` £${c.raw.toFixed(0)}` } } },
        scales:{
          x:{ stacked:true, grid:{ color:C.grid }, ticks:{ color:C.tick, font:{size:11} } },
          y:{ stacked:true, grid:{ color:C.grid }, ticks:{ color:C.tick, font:{size:11}, callback:v=>'£'+v.toFixed(0) } },
        } },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════════════════════

function renderExpenses(host, st) {
  const expenses = st.expenses || { items:[], scheduledChanges:[] };
  const effItems = applyScheduledChanges(expenses);
  const total    = totalExpenses(effItems);
  const byCat    = expensesByCategory(effItems);
  const today    = new Date().toISOString().slice(0,10);

  const scList = (expenses.scheduledChanges || []).length === 0
    ? '<p class="label-muted" style="padding:12px">No scheduled changes.</p>'
    : `<table class="data-table"><thead><tr><th>Expense</th><th>Date</th><th class="td-right">New Amount</th><th>Note</th></tr></thead><tbody>
      ${expenses.scheduledChanges.map(sc => {
        const item = expenses.items.find(i=>i.id===sc.expenseId);
        const past = sc.changeDate <= today;
        return `<tr><td>${item?.name||sc.expenseId}</td><td class="mono">${sc.changeDate}</td>
          <td class="td-right mono">${fmtGBP(sc.newMonthlyGBP)}</td>
          <td>${sc.note||''} ${past?'<span class="badge badge-positive">Applied</span>':''}</td></tr>`;
      }).join('')}</tbody></table>`;

  host.innerHTML = `
    <div class="grid-4" data-section="expenses">
      ${metricCard('Total Monthly', fmtGBP(total), 'warning', `${effItems.filter(i=>i.active).length} active`)}
      ${metricCard('Annual Spend', fmtGBP(total*12), 'warning', '12 × monthly')}
      ${metricCard('Categories', String(Object.keys(byCat).length), 'info', 'distinct groups')}
      ${metricCard('Scheduled Changes', String((expenses.scheduledChanges||[]).length), 'info', 'upcoming adjustments')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Expenses by Category', 'exp-chart-doughnut', 'chart-h-260', 'exp-legend-doughnut')}
      ${chartPanel('Month-by-Month Total', 'exp-chart-line')}
    </div>
    <div class="mt-20">${panel('Scheduled Changes Timeline', scList)}</div>`;

  doughnut('exp-chart-doughnut', Object.keys(byCat), Object.values(byCat), 'exp-legend-doughnut');

  // Month-by-month from scheduled changes over next 12 months
  const t = new Date();
  const months12 = Array.from({length:12},(_,i)=>{
    const d=new Date(t.getFullYear(),t.getMonth()+i,1);
    return d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
  });
  const monthlyTotals = months12.map((_,i)=>{
    const d=new Date(t.getFullYear(),t.getMonth()+i,1);
    const dStr=d.toISOString().slice(0,10);
    const items=expenses.items.map(item=>{
      const sc=(expenses.scheduledChanges||[]).find(c=>c.expenseId===item.id&&c.changeDate<=dStr);
      return sc?{...item,monthlyGBP:sc.newMonthlyGBP}:item;
    });
    return totalExpenses(items.filter(i=>i.active));
  });
  const ctx = getCtx('exp-chart-line');
  if (ctx) {
    dashCharts['exp-chart-line'] = new Chart(ctx, {
      type:'bar',
      data:{ labels:months12, datasets:[{ label:'Total Expenses', data:monthlyTotals, backgroundColor:C.warning+'cc', borderRadius:4 }] },
      options:{ ...base, scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v.toFixed(0) } } } },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// DEBTS
// ══════════════════════════════════════════════════════════════

function renderDebts(host, st) {
  const sbi  = st.debts?.sbi || {};
  const rate = st.settings?.inrGbpRate || 83;
  const sch  = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const gbpOut = round2((sbi.outstandingINR||0) / rate);
  const totalInterest = sch[sch.length-1]?.totalInterest || 0;
  const paid = loanPaidToDate(sbi);
  const intGBP  = round2(paid.interestPaid / rate);
  const prinGBP = round2(paid.principalPaid / rate);
  const remGBP  = round2((paid.remaining || 0) / rate);

  host.innerHTML = `
    <div class="grid-4" data-section="debts">
      ${metricCard('Outstanding (GBP)', fmtGBP(gbpOut), 'negative', fmtINR(sbi.outstandingINR||0))}
      ${metricCard('Payoff Date', amortPayoffDate(sch), 'info', `${fmtMonths(sch.length)} remaining`)}
      ${metricCard('Interest Remaining', fmtINR(totalInterest), 'negative', `${fmtGBP(round2(totalInterest/rate))} equiv`)}
      ${metricCard('Monthly EMI', fmtINR(sbi.emiINR||34090), 'warning', `${sbi.ratePercent||9.9}% p.a.`)}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Balance Over Time', 'dbt-chart-balance')}
      ${chartPanel('Interest vs Principal Paid', 'dbt-chart-donut')}
    </div>`;

  // Balance line
  const ctxBal = getCtx('dbt-chart-balance');
  if (ctxBal && sch.length) {
    const step = Math.max(1, Math.floor(sch.length/24));
    const lbls = sch.filter((_,i)=>i%step===0).map(r=>`M${r.month}`);
    const bal  = sch.filter((_,i)=>i%step===0).map(r=>round2(r.closing/100000));
    dashCharts['dbt-chart-balance'] = new Chart(ctxBal, {
      type:'line',
      data:{ labels:lbls, datasets:[{ label:'Balance', data:bal, borderColor:C.negative, backgroundColor:C.negative+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2 }] },
      options:{ ...base, scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'₹'+v+'L' } } } },
    });
  }

  // Interest vs principal donut
  const ctxDo = getCtx('dbt-chart-donut');
  if (ctxDo) {
    dashCharts['dbt-chart-donut'] = new Chart(ctxDo, {
      type:'doughnut',
      data:{ labels:['Interest Paid','Principal Paid','Remaining'], datasets:[{ data:[intGBP, prinGBP, remGBP], backgroundColor:[C.negative+'cc', C.positive+'cc', '#5c6170cc'], borderWidth:0, hoverOffset:6 }] },
      options:{ ...base, cutout:'60%', scales:{ x:{display:false}, y:{display:false} },
        animation:{ animateRotate:true, animateScale:true, duration:900, easing:'easeInOutBack' },
        plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } },
          tooltip:{ ...base.plugins.tooltip, callbacks:{ label:c=>` £${Math.round(c.raw).toLocaleString()} — ${c.label}` } } } },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ASSETS
// ══════════════════════════════════════════════════════════════

function renderAssets(host, st) {
  const inv  = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const rate = st.settings?.inrGbpRate || 83;
  const nw   = calculateNetWorth(inv, st.debts || { sbi:{} }, rate);

  // Portfolio breakdown
  const isa = inv.isa || {};
  const isaTotal = (isa.stocksAndSharesISA?.currentValueGBP || 0) + (isa.cashISA?.currentValueGBP || 0) + (isa.lifetimeISA?.currentValueGBP || 0);
  const sippTotal = inv.sipp?.currentValueGBP || 0;
  const npsGBP  = ((inv.nps?.tier1ValueINR || 0) + (inv.nps?.tier2ValueINR || 0)) / safeRate(rate);
  const elssGBP = (inv.elss || []).reduce((s, e) => s + (e.currentValueINR || 0), 0) / safeRate(rate);
  const ppfGBP  = (inv.ppf?.currentValueINR || 0) / safeRate(rate);

  const breakdownLabels = ['Cash','Pension','ULIPs','ISA','SIPP','NPS','ELSS','PPF'];
  const breakdownValues = [nw.cashTotal, nw.pensionTotal, nw.ulipTotal, round2(isaTotal), round2(sippTotal), round2(npsGBP), round2(elssGBP), round2(ppfGBP)];

  // ISA allowance
  const TOTAL_ISA = 20000;
  const isaYtd = (isa.stocksAndSharesISA?.yearToDateContributionGBP || 0) + (isa.cashISA?.yearToDateContributionGBP || 0) + (isa.lifetimeISA?.yearToDateContributionGBP || 0);
  const isaPct = Math.min(100, round2((isaYtd / TOTAL_ISA) * 100));

  host.innerHTML = `
    <div class="grid-4" data-section="investments">
      ${metricCard('Total Assets', fmtGBP(nw.totalAssets), 'positive', 'All accounts')}
      ${metricCard('Pension', fmtGBP(nw.pensionTotal), 'info', 'Workplace')}
      ${metricCard('ULIPs', fmtGBP(nw.ulipTotal), 'info', `${(inv.ulips||[]).length} policies`)}
      ${metricCard('Cash', fmtGBP(nw.cashTotal), 'positive', 'Liquid savings')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Portfolio Breakdown', 'ast-chart-breakdown', 'chart-h-260', 'ast-legend-breakdown')}
      ${chartPanel('ULIP Projection (3 scenarios)', 'ast-chart-ulip')}
    </div>
    <div class="mt-20">${panel('ISA Allowance — 2025/26', `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px">
        <span class="stat-label">Used <span class="stat-value mono">${fmtGBP(isaYtd)}</span></span>
        <span class="stat-label">Remaining <span class="stat-value mono">${fmtGBP(TOTAL_ISA - isaYtd)}</span></span>
        <span class="stat-label">Limit <span class="stat-value mono">${fmtGBP(TOTAL_ISA)}</span></span>
      </div>
      <div style="background:rgba(255,255,255,0.07);border-radius:4px;height:10px;overflow:hidden">
        <div style="width:${isaPct}%;height:100%;background:${isaPct>=100?C.negative:isaPct>=80?C.warning:C.positive};border-radius:4px"></div>
      </div>
      <div class="label-muted" style="text-align:right;margin-top:4px">${isaPct.toFixed(1)}% used</div>`)}</div>`;

  doughnut('ast-chart-breakdown',
    breakdownLabels.filter((_,i)=>breakdownValues[i]>0),
    breakdownValues.filter(v=>v>0),
    'ast-legend-breakdown');

  // ULIP combined projection — conservative/expected/aggressive
  const ctx = getCtx('ast-chart-ulip');
  const ulips = inv.ulips || [];
  if (ctx && ulips.length) {
    const maxYears = Math.max(...ulips.map(u=>u.totalTermYears||20));
    const yrs = Array.from({length:maxYears+1},(_,i)=>i);
    const series = (rateKey) => yrs.map(yr => round2(ulips.reduce((s,u)=>{
      const vGBP=ulipValueGBP(u,rate), pGBP=ulipPremiumGBP(u,rate);
      const pts=projectULIP(vGBP,pGBP,u[rateKey],u.payTermEndDate,u.totalTermYears);
      const pt=pts.find(p=>p.year===yr);
      return s+(pt?pt.value:0);
    },0)));
    dashCharts['ast-chart-ulip'] = new Chart(ctx, {
      type:'line',
      data:{ labels:yrs.map(y=>`Yr ${y}`), datasets:[
        { label:'Conservative', data:series('conservativeRatePercent'), borderColor:C.warning, backgroundColor:'transparent', tension:0.4, pointRadius:0, borderWidth:2, borderDash:[4,4] },
        { label:'Expected', data:series('expectedRatePercent'), borderColor:C.info, backgroundColor:C.info+'22', fill:true, tension:0.4, pointRadius:0, borderWidth:2 },
        { label:'Aggressive', data:series('aggressiveRatePercent'), borderColor:C.positive, backgroundColor:'transparent', tension:0.4, pointRadius:0, borderWidth:2, borderDash:[2,2] },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+Math.round(v).toLocaleString() } } } },
    });
  } else if (ctx) {
    const el = document.getElementById('ast-chart-ulip');
    if (el) el.parentElement.innerHTML = '<p class="label-muted" style="padding:24px;text-align:center">No ULIP policies recorded.</p>';
  }
}

// ══════════════════════════════════════════════════════════════
// NET WORTH
// ══════════════════════════════════════════════════════════════

function renderNetWorth(host, st) {
  const rate  = st.settings?.inrGbpRate || 83;
  const inc   = st.income   || {};
  const inv   = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = st.debts?.sbi || {};
  const goals = st.goals || {};
  const nwProj= st.settings?.nwProjection || {};

  const nw  = calculateNetWorth(inv, st.debts || { sbi:{} }, rate);
  const pay = calculateNetPay(inc);
  const eff = applyScheduledChanges(st.expenses || { items:[], scheduledChanges:[] });
  const surplus = calculateSurplus(pay.netWithOT, totalExpenses(eff));
  const target = goals.wealthTargetGBP || 4760000;

  host.innerHTML = `
    <div class="grid-4" data-section="networth">
      ${metricCard('Net Worth', fmtGBP(nw.netWorth), nw.netWorth>=0?'positive':'negative', 'Assets − Debt')}
      ${metricCard('Wealth Target', fmtGBP(target), 'info', 'Long-term goal')}
      ${metricCard('Monthly Saving', fmtGBP(surplus), surplus>=0?'positive':'negative', 'Current surplus')}
      ${metricCard('Total Debt', fmtGBP(nw.totalDebts), 'negative', 'SBI loan')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Net Worth Timeline (5yr)', 'nw-chart-timeline', 'chart-h-300')}
      ${chartPanel('Age-to-Wealth Trajectory', 'nw-chart-age', 'chart-h-300')}
    </div>`;

  // Timeline
  const ctxTl = getCtx('nw-chart-timeline');
  if (ctxTl) {
    const ulips = inv.ulips || [];
    const ulipTotalGBP = ulips.reduce((s, u) => s + ulipValueGBP(u, rate), 0);
    const ulipPremGBP  = ulips.reduce((s, u) => s + ulipPremiumGBP(u, rate), 0);
    const ulipAvgRate  = ulips.length ? ulips.reduce((s, u) => s + (u.expectedRatePercent || 12), 0) / ulips.length : 12;
    const nowD = new Date();
    const latestEnd = ulips.reduce((latest, u) => { const e = new Date(u.payTermEndDate); return e > latest ? e : latest; }, nowD);
    const ulipPayMo = Math.max(0, (latestEnd.getFullYear()-nowD.getFullYear())*12 + (latestEnd.getMonth()-nowD.getMonth()));

    const timeline = projectNetWorthTimeline({
      startDate: new Date().toISOString().slice(0,7)+'-01',
      startNetWorth: nw.netWorth,
      monthlySaving: surplus,
      pensionValue:  inv.pensions?.[0]?.valueGBP  || 0,
      pensionMonthly:inv.pensions?.[0]?.monthlyGBP || 0,
      pensionGrowthRate: nwProj.pensionGrowthRate || 7,
      ulipTotalValueGBP:  ulipTotalGBP,
      ulipMonthlyPremGBP: ulipPremGBP,
      ulipPayMonthsLeft:  ulipPayMo,
      ulipGrowthRate:     ulipAvgRate,
      debtOutstandingINR: dbt.outstandingINR || 0,
      debtEmiINR:         dbt.emiINR || 34090,
      debtRatePercent:    dbt.ratePercent || 9.9,
      inrGbpRate: rate,
      careerTransitionDate: nwProj.careerTransitionDate || null,
      newSalaryGBP:         nwProj.newSalaryGBP || null,
      currentSalaryGBP:     inc.baseSalaryGBP || 28000,
    });
    dashCharts['nw-chart-timeline'] = new Chart(ctxTl, {
      type:'line',
      data:{ labels:timeline.map(p=>p.label), datasets:[
        { label:'Assets', data:timeline.map(p=>p.assets), borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2 },
        { label:'Liabilities', data:timeline.map(p=>-p.liabilities), borderColor:C.negative, backgroundColor:C.negative+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2 },
        { label:'Net Worth', data:timeline.map(p=>p.netWorth), borderColor:'#ffffff', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:2.5 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+Math.round(v).toLocaleString() } } } },
    });
  }

  // Age trajectory
  const ctxAge = getCtx('nw-chart-age');
  if (ctxAge) {
    const cp = st.settings?.chartParams?.ageTrajectory || {};
    const pts = ageWealthTrajectory({
      currentAge: cp.currentAge || 25,
      targetAge:  cp.targetAge  || 50,
      startNetWorth: nw.netWorth,
      monthlySurplus: surplus,
      growthRatePercent: cp.growthRatePercent || 10,
      careerTransitionAge: cp.careerTransitionAge || 28,
      careerTransitionSurplus: cp.careerTransitionMonthlySurplus || 860,
    });
    dashCharts['nw-chart-age'] = new Chart(ctxAge, {
      type:'line',
      data:{ labels:pts.map(p=>`Age ${p.age}`), datasets:[{ label:'Projected Net Worth', data:pts.map(p=>p.netWorth), borderColor:C.info, backgroundColor:C.info+'22', fill:true, tension:0.35, pointRadius:0, borderWidth:2 }] },
      options:{ ...base, plugins:{ ...base.plugins, tooltip:{ ...base.plugins.tooltip, callbacks:{ label:i=>` £${Math.round(i.raw).toLocaleString()}` } } },
        scales:{ ...base.scales, x:{ ...base.scales.x, ticks:{ ...base.scales.x.ticks, maxTicksLimit:10 } }, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+Math.round(v/1000)+'k' } } } },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// GOALS
// ══════════════════════════════════════════════════════════════

function renderGoals(host, st) {
  const rate  = st.settings?.inrGbpRate || 83;
  const inv   = st.investments || { cashAccounts:[] };
  const goals = st.goals || {};
  // India trip saved = dedicated savings + cash account balances (Revolut etc.)
  const goalsCashBalance = (inv.cashAccounts || []).reduce((s, a) => s + (a.balanceGBP || 0), 0);
  const goalIndiaTotalSaved = round2((goals.indiaTrip?.savedGBP || 0) + goalsCashBalance);
  const india = indiaTripProgress({ ...goals, indiaTrip: { ...goals.indiaTrip, savedGBP: goalIndiaTotalSaved } });
  const emergency = emergencyFundProgress(inv, goals);
  const nw = calculateNetWorth(inv, st.debts || { sbi:{} }, rate);
  const target = goals.wealthTargetGBP || 4760000;
  const wealthPct = target > 0 ? Math.max(0, Math.min(100, round2((nw.netWorth / target) * 100))) : 0;

  host.innerHTML = `
    <div class="grid-3" data-section="goals">
      ${gaugePanel('India Trip (£3,000)', 'goal-gauge-india', 'goal-val-india', 'goal-lbl-india')}
      ${gaugePanel('Emergency Fund', 'goal-gauge-emergency', 'goal-val-emergency', 'goal-lbl-emergency')}
      ${gaugePanel('Wealth Target', 'goal-gauge-wealth', 'goal-val-wealth', 'goal-lbl-wealth')}
    </div>
    <div class="grid-3 mt-20">
      ${metricCard('India Remaining', fmtGBP(india.remaining), 'warning', `${india.daysLeft} days left`)}
      ${metricCard('Emergency Remaining', fmtGBP(emergency.remaining), 'info', `of ${fmtGBP(emergency.target)}`)}
      ${metricCard('Net Worth vs Target', fmtPct(wealthPct), wealthPct>0?'positive':'negative', `${fmtGBP(nw.netWorth)} of ${fmtGBP(target)}`)}
    </div>`;

  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('goal-val-india', fmtPct(india.pct));        set('goal-lbl-india', `${fmtGBP(goalIndiaTotalSaved)} of ${fmtGBP(goals.indiaTrip?.targetGBP||3000)}`);
  set('goal-val-emergency', fmtPct(emergency.pct)); set('goal-lbl-emergency', `${fmtGBP(emergency.savings)} of ${fmtGBP(emergency.target)}`);
  set('goal-val-wealth', fmtPct(wealthPct));        set('goal-lbl-wealth', `of ${fmtGBP(target)}`);

  gauge('goal-gauge-india',     india.pct,     india.pct >= 80 ? C.positive : C.warning);
  gauge('goal-gauge-emergency', emergency.pct, emergency.pct >= 80 ? C.positive : C.warning);
  gauge('goal-gauge-wealth',    wealthPct,     wealthPct >= 50 ? C.positive : C.info);
}

// ══════════════════════════════════════════════════════════════
// OT TRACKER
// ══════════════════════════════════════════════════════════════

function renderOT(host, st) {
  const MONTHS = ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];
  const LABELS = { '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug','2026-09':'Sep','2026-10':'Oct' };
  const TARGET = 3000;
  const START_BALANCE = st.goals?.indiaTrip?.savedGBP || 600;
  const CURRENT_MONTH = new Date().toISOString().slice(0,7);
  const otShifts = st.otShifts || [];
  const otSummary = st.otMonthlySummary || {};

  const monthShifts = ym => otShifts.filter(s => (s.date||'').slice(0,7) === ym);
  const monthTotal  = ym => round2(monthShifts(ym).reduce((s, sh) => s + (sh.grossGBP||0), 0));
  const isConfirmed = ym => !!otSummary[ym]?.confirmed;

  const expForMonth = ym => {
    const targetDate = ym + '-15';
    const items = (st.expenses?.items || []).map(i => ({ ...i }));
    for (const c of (st.expenses?.scheduledChanges || [])) {
      if (c.changeDate <= targetDate) { const idx = items.findIndex(i=>i.id===c.expenseId); if (idx>=0) items[idx].monthlyGBP = c.newMonthlyGBP; }
    }
    return items;
  };
  const indiaRedirect = items => (items||[]).find(e=>e.id==='india')?.monthlyGBP || 0;
  const predict = ym => {
    const otGross = monthTotal(ym);
    const pay = calculateNetPay({ ...(st.income||{}), avgOvertimeGrossGBP: otGross });
    const items = expForMonth(ym);
    return { otGross, pay, monthExpenses: totalExpenses(items), indiaRedirect: indiaRedirect(items) };
  };

  const thisMonth = monthTotal(CURRENT_MONTH);
  const complete = MONTHS.filter(m => m < CURRENT_MONTH).slice(-3);
  const rollAvg = complete.length ? round2(complete.reduce((s,m)=>s+monthTotal(m),0)/complete.length) : 0;
  const ytd = round2(otShifts.filter(s=>(s.date||'').startsWith('2026')).reduce((s,sh)=>s+(sh.grossGBP||0),0));
  const curPredict = predict(CURRENT_MONTH);

  host.innerHTML = `
    <div class="grid-4" data-section="income">
      ${metricCard('This Month OT', fmtGBP(thisMonth), 'positive', LABELS[CURRENT_MONTH]||CURRENT_MONTH)}
      ${metricCard('3-Month Avg', fmtGBP(rollAvg), 'info', 'Complete months')}
      ${metricCard('YTD Total (2026)', fmtGBP(ytd), 'info', `${otShifts.length} shifts`)}
      ${metricCard('Predicted Net', fmtGBP(curPredict.pay.netWithOT), 'positive', 'This month w/ OT')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Monthly OT & 3-Month Average', 'ot-chart-bar')}
      ${chartPanel('Savings Forecast vs £3k Target', 'ot-chart-savings')}
    </div>
    <div class="grid-3 mt-20">
      ${gaugePanel('Current Month vs Last', 'ot-gauge', 'ot-gauge-val', 'ot-gauge-lbl')}
      <div class="panel" style="grid-column:span 2">
        <div class="panel-header"><span class="panel-title">Net Pay Split — Base vs OT</span></div>
        <div class="chart-wrap chart-h-200"><canvas id="ot-chart-stacked"></canvas></div>
      </div>
    </div>`;

  const labels = MONTHS.map(m => LABELS[m]);
  const otData = MONTHS.map(monthTotal);
  const avgData = MONTHS.map((m,i)=>{ const w=MONTHS.slice(Math.max(0,i-2),i+1).map(monthTotal); return round2(w.reduce((s,v)=>s+v,0)/w.length); });
  const confirmedFlags = MONTHS.map(isConfirmed);

  // Bar + rolling avg
  const ctx1 = getCtx('ot-chart-bar');
  if (ctx1) {
    dashCharts['ot-chart-bar'] = new Chart(ctx1, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'OT Gross', data:otData, order:2, backgroundColor:c=>confirmedFlags[c.dataIndex]?'#00e676':'rgba(0,230,118,0.4)', borderRadius:4 },
        { label:'3-Month Avg', data:avgData, type:'line', order:1, borderColor:C.warning, backgroundColor:C.warning, pointRadius:4, tension:0.3, borderWidth:2 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v } } } },
    });
  }

  // Stacked base vs OT net
  const ctx2 = getCtx('ot-chart-stacked');
  if (ctx2) {
    const baseNet = MONTHS.map(m => predict(m).pay.netBase);
    const otNet = MONTHS.map(m => { const p = predict(m); return round2(Math.max(0, p.pay.netWithOT - p.pay.netBase)); });
    dashCharts['ot-chart-stacked'] = new Chart(ctx2, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Base net', data:baseNet, backgroundColor:C.info, borderRadius:4 },
        { label:'OT net', data:otNet, backgroundColor:C.positive, borderRadius:4 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, font:{size:11} } } },
        scales:{ x:{ stacked:true, grid:{ color:C.grid }, ticks:{ color:C.tick, font:{size:11} } }, y:{ stacked:true, grid:{ color:C.grid }, ticks:{ color:C.tick, font:{size:11}, callback:v=>'£'+v } } } },
    });
  }

  // Savings forecast line
  const ctx3 = getCtx('ot-chart-savings');
  if (ctx3) {
    let running = START_BALANCE;
    const pts = [];
    MONTHS.forEach(ym => {
      const p = predict(ym);
      const summary = otSummary[ym] || {};
      const netPay = (isConfirmed(ym) && summary.actualNetGBP != null) ? summary.actualNetGBP : p.pay.netWithOT;
      let saved = ym === '2026-05' ? 100 : round2(round2(netPay - p.monthExpenses) + p.indiaRedirect);
      running = round2(running + saved);
      pts.push(running);
    });
    const lastConfirmedIdx = MONTHS.reduce((acc,m,i)=>isConfirmed(m)?i:acc,-1);
    dashCharts['ot-chart-savings'] = new Chart(ctx3, {
      type:'line',
      data:{ labels, datasets:[
        { label:'Running savings', data:pts, borderColor:C.info, backgroundColor:C.info+'22', pointRadius:4, tension:0.25, fill:true,
          segment:{ borderDash:c=>c.p0DataIndex>=lastConfirmedIdx?[6,4]:undefined, borderColor:c=>c.p0DataIndex>=lastConfirmedIdx?C.warning:C.info } },
        { label:'£3k Target', data:MONTHS.map(()=>TARGET), borderColor:C.positive, borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v } } } },
    });
  }

  // Current vs last month gauge
  const lastMonthYm = MONTHS[Math.max(0, MONTHS.indexOf(CURRENT_MONTH) - 1)];
  const lastTotal = monthTotal(lastMonthYm);
  const pct = lastTotal > 0 ? Math.min(100, round2((thisMonth / lastTotal) * 100)) : (thisMonth > 0 ? 100 : 0);
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('ot-gauge-val', pct.toFixed(0)+'%');
  set('ot-gauge-lbl', `${fmtGBP(thisMonth)} vs ${fmtGBP(lastTotal)}`);
  gauge('ot-gauge', pct, pct >= 100 ? C.positive : pct >= 50 ? C.info : C.warning);
}

// ══════════════════════════════════════════════════════════════
// TAX
// ══════════════════════════════════════════════════════════════

function renderTax(host, st) {
  const tt = st.taxTracker || {};
  const prog = taxTrackerProgress(tt);
  const it = st.indiaTax || {};
  const hasIndia = (it.nroInterestIncomeINR || it.rentalIncomeINR || it.dividendIncomeINR || it.otherIndiaIncomeINR);

  let indiaCards = '';
  if (hasIndia) {
    const net = calcNetIndiaTax(it);
    const { deductionINR } = calc80EDeduction(it);
    indiaCards = `
      <div class="section-header mt-20"><div><div class="section-title" style="font-size:16px">India NRI Tax</div></div></div>
      <div class="grid-4">
        ${metricCard('India Gross Income', fmtINR(net.grossIndiaIncomeINR), 'info', 'NRO + rental + dividend')}
        ${metricCard('Total TDS', fmtINR(net.totalTdsINR), 'positive', 'Credit toward liability')}
        ${metricCard('Section 80E', fmtINR(deductionINR), 'positive', it.taxRegime==='old'?'Education loan':'New regime n/a')}
        ${metricCard('Net India Payable', fmtINR(net.netPayableINR), net.netPayableINR>0?'warning':'positive', 'After TDS & DTAA')}
      </div>`;
  }

  host.innerHTML = `
    <div class="grid-4" data-section="tax">
      ${metricCard('Underpayment Total', fmtGBP(tt.underpaymentTotal||0), 'warning', tt.taxCode||'—')}
      ${metricCard('Collected', fmtGBP(prog.collected,2), 'positive', fmtPct(prog.pct))}
      ${metricCard('Remaining', fmtGBP(prog.remaining,2), 'warning', `${prog.monthsLeft} months left`)}
      ${metricCard('Days to Clear', String(prog.daysLeft), 'info', `${prog.monthsElapsed} months in`)}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('UK Underpayment Progress', 'tax-chart-line')}
      ${panel('Collection Status', `
        <div class="stat-row"><span class="stat-label">Collected so far</span><span class="stat-value mono text-positive">${fmtGBP(prog.collected,2)}</span></div>
        <div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value mono text-warning">${fmtGBP(prog.remaining,2)}</span></div>
        <div class="stat-row"><span class="stat-label">Progress</span><span class="stat-value mono">${fmtPct(prog.pct)}</span></div>
        <div class="stat-row"><span class="stat-label">Months elapsed</span><span class="stat-value mono">${prog.monthsElapsed}</span></div>
        <div class="progress-wrap mt-12">
          <div class="progress-label"><span>£0</span><span>${fmtGBP(tt.underpaymentTotal||0)}</span></div>
          <div class="progress-track"><div class="progress-fill positive" style="width:${prog.pct}%"></div></div>
        </div>`)}
    </div>
    ${indiaCards}`;

  const ctx = getCtx('tax-chart-line');
  if (ctx) {
    const start = new Date(tt.startDate || '2026-04-06');
    const labels=[], cumulative=[];
    for (let i=0;i<=12;i++){ const d=new Date(start.getFullYear(),start.getMonth()+i,1); labels.push(d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})); cumulative.push(Math.min(tt.underpaymentTotal||456, round2(i*(tt.monthlyDeduction||38)))); }
    dashCharts['tax-chart-line'] = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets:[
        { label:'Collected', data:cumulative, borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:2, borderWidth:2 },
        { label:'Target', data:Array(13).fill(tt.underpaymentTotal||456), borderColor:C.warning, backgroundColor:'transparent', borderDash:[4,4], pointRadius:0, borderWidth:1.5 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v.toFixed(0) } } } },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════

function renderAnalytics(host, st) {
  const rate  = st.settings?.inrGbpRate || 83;
  const inc   = st.income   || {};
  const inv   = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = st.debts    || { sbi:{} };

  const pay = calculateNetPay(inc);
  const nw  = calculateNetWorth(inv, dbt, rate);
  const effItems = applyScheduledChanges(st.expenses || { items:[], scheduledChanges:[] });
  const totalExp = totalExpenses(effItems);
  const surplus  = calculateSurplus(pay.netWithOT, totalExp);
  const grossMonthly = pay.grossWithOT, netMonthly = pay.netWithOT;

  const savingsRate = netMonthly > 0 ? round2((surplus / netMonthly) * 100) : 0;
  const housingCost = (st.expenses?.items?.find(i=>i.id==='rent')?.monthlyGBP || 0);
  const housingRatio = netMonthly > 0 ? round2((housingCost / netMonthly) * 100) : 0;
  const investRate = grossMonthly > 0 ? round2(((pay.pension + pay.employerPension) / grossMonthly) * 100) : 0;
  const debtIncome = pay.grossBase > 0 ? round2((dbt.sbi?.emiINR||0)/rate / pay.grossBase * 100) : 0;
  const runway = surplus > 0 ? round2((inv.cashAccounts?.[0]?.balanceGBP||0) / totalExp) : 0;

  host.innerHTML = `
    <div class="grid-4" data-section="analytics">
      ${metricCard('Savings Rate', fmtPct(savingsRate), savingsRate>=20?'positive':savingsRate>=10?'warning':'negative', 'Benchmark 20%+')}
      ${metricCard('Housing Ratio', fmtPct(housingRatio), housingRatio<=30?'positive':'negative', 'Benchmark <30%')}
      ${metricCard('Invest Rate', fmtPct(investRate), investRate>=10?'positive':'warning', 'Pension contributions')}
      ${metricCard('Cash Runway', runway.toFixed(1)+'mo', runway>=3?'positive':'negative', 'Emergency coverage')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Financial Ratios vs Benchmark', 'an-chart-ratios')}
      ${chartPanel('Savings Rate Trend', 'an-chart-savings')}
    </div>
    <div class="grid-2 mt-20">
      ${chartPanel('Income vs Expenses Trend', 'an-chart-incexp')}
      ${chartPanel('Budget vs Actual', 'an-chart-budget', 'chart-h-300')}
    </div>
    <div class="mt-20">${chartPanel('Surplus Trajectory', 'an-chart-surplus', 'chart-h-300')}</div>`;

  // Ratios bar
  const ctxR = getCtx('an-chart-ratios');
  if (ctxR) {
    const labels = ['Savings %','Housing %','Invest %','Debt/Income %'];
    const actual = [savingsRate, housingRatio, investRate, debtIncome];
    const benchmarks = [20, 30, 10, 20];
    const colors = actual.map((v,i)=> (labels[i]==='Housing %'||labels[i]==='Debt/Income %') ? (v<=benchmarks[i]?C.positive:C.negative) : (v>=benchmarks[i]?C.positive:C.warning));
    dashCharts['an-chart-ratios'] = new Chart(ctxR, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Actual', data:actual, backgroundColor:colors.map(c=>c+'cc'), borderRadius:4 },
        { label:'Benchmark', data:benchmarks, backgroundColor:'rgba(255,255,255,0.06)', borderRadius:4, borderColor:'rgba(255,255,255,0.2)', borderWidth:1 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, max:100, ticks:{ ...base.scales.y.ticks, callback:v=>v+'%' } } } },
    });
  }

  // Savings rate trend
  const log = st.monthlyLog || [];
  const ctxS = getCtx('an-chart-savings');
  if (ctxS) {
    const labels = log.map(r=>r.month);
    const rates = log.map(r=>r.netGBP>0?round2((r.savedGBP/r.netGBP)*100):0);
    dashCharts['an-chart-savings'] = new Chart(ctxS, {
      type:'line',
      data:{ labels, datasets:[
        { label:'Savings Rate %', data:rates, borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:4, borderWidth:2 },
        { label:'20% Benchmark', data:log.map(()=>20), borderColor:C.warning, backgroundColor:'transparent', borderDash:[5,5], pointRadius:0, borderWidth:1.5 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, min:0, max:50, ticks:{ ...base.scales.y.ticks, callback:v=>v+'%' } } } },
    });
  }

  // Income vs expenses trend
  const ctxIE = getCtx('an-chart-incexp');
  if (ctxIE) {
    const labels = log.map(r=>r.month);
    dashCharts['an-chart-incexp'] = new Chart(ctxIE, {
      type:'line',
      data:{ labels, datasets:[
        { label:'Net Income', data:log.map(r=>r.netGBP||0), borderColor:C.info, backgroundColor:C.info+'22', fill:true, tension:0.3, pointRadius:3, borderWidth:2 },
        { label:'Saved', data:log.map(r=>r.savedGBP||0), borderColor:C.positive, backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v } } } },
    });
  }

  // Budget radar
  const ctxB = getCtx('an-chart-budget');
  if (ctxB) {
    const byCat = expensesByCategory(effItems);
    const budgetMap = st.settings?.chartParams?.budgetByCategory || {};
    const cats = Object.keys(byCat).filter(c=>byCat[c]>0);
    dashCharts['an-chart-budget'] = new Chart(ctxB, {
      type:'radar',
      data:{ labels:cats, datasets:[
        { label:'Actual', data:cats.map(c=>byCat[c]||0), borderColor:C.negative, backgroundColor:C.negative+'33', pointBackgroundColor:C.negative, borderWidth:2 },
        { label:'Budget', data:cats.map(c=>budgetMap[c]||byCat[c]||0), borderColor:C.info, backgroundColor:C.info+'22', pointBackgroundColor:C.info, borderDash:[4,4], borderWidth:2 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, animation:{ duration:700 },
        plugins:{ legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } }, tooltip:base.plugins.tooltip },
        scales:{ r:{ grid:{ color:C.grid }, ticks:{ color:C.tick, font:{size:10}, backdropColor:'transparent', callback:v=>'£'+v }, pointLabels:{ color:'#d9dde2', font:{size:11} }, angleLines:{ color:C.grid } } } },
    });
  }

  // Surplus trajectory
  const ctxSur = getCtx('an-chart-surplus');
  if (ctxSur) {
    const events = surplusTrajectoryEvents(st);
    const labels = events.map(e=>e.date.slice(0,7));
    const data = events.map(e=>e.surplus);
    const pointLabels = events.map(e=>e.label);
    dashCharts['an-chart-surplus'] = new Chart(ctxSur, {
      type:'line',
      data:{ labels, datasets:[{ label:'Monthly Surplus (£)', data, borderColor:C.info, backgroundColor:C.info+'22', fill:true, stepped:'before', pointRadius:6, pointBackgroundColor:data.map(v=>v>=0?C.positive:C.negative), borderWidth:2 }] },
      options:{ ...base, plugins:{ legend:{ display:false }, tooltip:{ ...base.plugins.tooltip,
        callbacks:{ title:items=>pointLabels[items[0].dataIndex]||labels[items[0].dataIndex], label:i=>` £${i.raw.toFixed(0)} surplus`, afterLabel:i=>events[i.dataIndex].detail||'' } } },
        scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v } } } },
    });
  }
}
