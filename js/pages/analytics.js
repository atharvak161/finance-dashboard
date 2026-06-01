import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  calculateNetPay, calculateNetWorth, applyScheduledChanges, totalExpenses,
  calculateSurplus, fmtGBP, fmtPct, round2,
  surplusTrajectoryEvents, expensesByCategory
} from '../calc.js';

// Hoisted before top-level await
const C = { positive:'#00e676', negative:'#ff1744', warning:'#ff9100', info:'#00bfff', grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
let _chart = null;
const charts = {};

const state = await initPage('analytics');
render(state);

function render(st) {
  const rate  = st.settings?.inrGbpRate || 83;
  const inc   = st.income   || {};
  const inv   = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = st.debts    || { sbi:{} };

  const pay    = calculateNetPay(inc);
  const nw     = calculateNetWorth(inv, dbt, rate);
  const effItems = applyScheduledChanges(st.expenses||{items:[],scheduledChanges:[]});
  const totalExp  = totalExpenses(effItems);
  const surplus   = calculateSurplus(pay.netWithOT, totalExp);

  const grossMonthly = pay.grossWithOT;
  const netMonthly   = pay.netWithOT;

  // ── Ratio calculations ─────────────────────────────────────
  const savingsRate   = netMonthly > 0 ? round2((surplus / netMonthly) * 100) : 0;
  const debtIncome    = grossMonthly > 0 ? round2((pay.grossBase > 0 ? (dbt.sbi?.emiINR||0)/rate / pay.grossBase * 100 : 0)) : 0;
  const housingCost   = (st.expenses?.items?.find(i=>i.id==='rent')?.monthlyGBP || 0);
  const housingRatio  = netMonthly > 0 ? round2((housingCost / netMonthly) * 100) : 0;
  const investRate    = grossMonthly > 0 ? round2(((pay.pension + pay.employerPension) / grossMonthly) * 100) : 0;
  const runwayMonths  = surplus > 0 ? round2((inv.cashAccounts?.[0]?.balanceGBP||0) / totalExp) : 0;

  // ── KPI cards ─────────────────────────────────────────────
  document.getElementById('analytics-kpis').innerHTML = [
    kpiCard('Savings Rate',    fmtPct(savingsRate),  savingsRate>=20?'positive':savingsRate>=10?'warning':'negative', 'Benchmark: 20%+'),
    kpiCard('Housing Ratio',   fmtPct(housingRatio), housingRatio<=30?'positive':'negative', 'Benchmark: <30%'),
    kpiCard('Invest Rate',     fmtPct(investRate),   investRate>=10?'positive':'warning', 'Pension contributions'),
    kpiCard('Cash Runway',     runwayMonths.toFixed(1)+'mo', runwayMonths>=3?'positive':'negative', 'Emergency fund coverage'),
  ].join('');

  // ── Career impact ─────────────────────────────────────────
  document.getElementById('analytics-career').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Salary</th><th class="td-right">Net/mo</th><th class="td-right">Surplus/mo</th><th class="td-right">Savings %</th></tr></thead>
      <tbody>
        ${[28000,40000,55000,65000,80000].map(sal => {
          const p = calculateNetPay({...inc, baseSalaryGBP:sal, avgOvertimeGrossGBP:0});
          const s = calculateSurplus(p.netBase, totalExp);
          const pct = p.netBase>0 ? round2((s/p.netBase)*100) : 0;
          const cur = sal === (inc.baseSalaryGBP||28000);
          return `<tr class="${cur?'highlight-row':''}">
            <td>${cur?'▸ Current':''} ${fmtGBP(sal)}</td>
            <td class="td-right mono">${fmtGBP(p.netBase)}</td>
            <td class="td-right mono ${s>=0?'text-positive':'text-negative'}">${fmtGBP(s)}</td>
            <td class="td-right mono ${pct>=20?'text-positive':pct>=10?'text-warning':'text-negative'}">${fmtPct(pct)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  // ── Key metrics table ──────────────────────────────────────
  document.getElementById('analytics-metrics').innerHTML = `
    <div class="grid-3">
      <div>
        <table class="data-table">
          <thead><tr><th colspan="2">Income</th></tr></thead>
          <tbody>
            <tr><td class="stat-label">Gross base (annual)</td><td class="td-right mono">${fmtGBP(inc.baseSalaryGBP||0)}</td></tr>
            <tr><td class="stat-label">Net base (monthly)</td><td class="td-right mono">${fmtGBP(pay.netBase)}</td></tr>
            <tr><td class="stat-label">Net with OT</td><td class="td-right mono">${fmtGBP(pay.netWithOT)}</td></tr>
            <tr><td class="stat-label">Hourly rate</td><td class="td-right mono">${fmtGBP(pay.hourlyRate,2)}/hr</td></tr>
            <tr><td class="stat-label">Total deductions</td><td class="td-right mono text-negative">${fmtGBP(pay.totalDeductions)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table class="data-table">
          <thead><tr><th colspan="2">Net Worth</th></tr></thead>
          <tbody>
            <tr><td class="stat-label">Total assets</td><td class="td-right mono text-positive">${fmtGBP(nw.totalAssets)}</td></tr>
            <tr><td class="stat-label">Pension</td><td class="td-right mono">${fmtGBP(nw.pensionTotal)}</td></tr>
            <tr><td class="stat-label">Cash savings</td><td class="td-right mono">${fmtGBP(nw.cashTotal)}</td></tr>
            <tr><td class="stat-label">ULIPs (GBP)</td><td class="td-right mono">${fmtGBP(nw.ulipTotal)}</td></tr>
            <tr><td class="stat-label">SBI debt</td><td class="td-right mono text-negative">${fmtGBP(nw.sbiGBP)}</td></tr>
            <tr><td class="stat-label">Net worth</td><td class="td-right mono ${nw.netWorth<0?'text-negative':'text-positive'}">${fmtGBP(nw.netWorth)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table class="data-table">
          <thead><tr><th colspan="2">Monthly Cash Flow</th></tr></thead>
          <tbody>
            <tr><td class="stat-label">Total expenses</td><td class="td-right mono text-negative">${fmtGBP(totalExp)}</td></tr>
            <tr><td class="stat-label">Housing</td><td class="td-right mono">${fmtGBP(housingCost)}</td></tr>
            <tr><td class="stat-label">Monthly surplus</td><td class="td-right mono ${surplus>=0?'text-positive':'text-negative'}">${fmtGBP(surplus)}</td></tr>
            <tr><td class="stat-label">Annual surplus</td><td class="td-right mono ${surplus>=0?'text-positive':'text-negative'}">${fmtGBP(surplus*12)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  renderRatiosChart({ savingsRate, housingRatio, investRate, debtIncome });
  renderSankey(st);
  renderSavingsRateChart(st);
  renderSurplusTrajectoryChart(st);
  renderBudgetRadarChart(st);
}

function kpiCard(label, value, colorClass, sub) {
  const cls = colorClass==='positive'?'text-positive':colorClass==='negative'?'text-negative':'text-warning';
  return `<div class="metric-card"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

// ── Chart ─────────────────────────────────────────────────────

function getCtx(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  return document.getElementById(id)?.getContext('2d') || null;
}

// ── Sankey ────────────────────────────────────────────────────

function renderSankey(st) {
  const container = document.getElementById('sankey-container');
  if (!container) return;

  const pay = calculateNetPay(st.income || {});
  const effItems = applyScheduledChanges(st.expenses || { items: [], scheduledChanges: [] });
  const activeItems = effItems.filter(i => i.active);

  const W = container.clientWidth || 900;
  const H = 460;
  const nodeW = 14;

  const catColors = {
    Housing:'#00bfff', Debt:'#ff1744', Insurance:'#00e676', Phone:'#ff9100',
    Transport:'#ffd600', Subscription:'#d500f9', Food:'#00e5ff',
    Personal:'#18ffff', Travel:'#ff7eb6', Other:'#8e9099', Savings:'#00e676',
  };

  const gross = pay.grossWithOT;
  const deductions = [
    { label:'Income Tax', value:pay.incomeTax, color:'#ff1744' },
    { label:'Nat. Insurance', value:pay.ni, color:'#ff9100' },
    { label:'Pension', value:pay.pension, color:'#d500f9' },
  ];
  if (pay.extraTax > 0) deductions.push({ label:'Tax Underpay', value:pay.extraTax, color:'#ffd600' });
  const net = pay.netWithOT;

  const byCat = {};
  for (const item of activeItems) byCat[item.category] = (byCat[item.category] || 0) + item.monthlyGBP;
  const totalExp = Object.values(byCat).reduce((s, v) => s + v, 0);
  const savings = Math.max(0, net - totalExp);

  const expFlows = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => ({ label: cat, value: val, color: catColors[cat] || '#8e9099' }));
  if (savings > 0) expFlows.push({ label: 'Savings', value: savings, color: '#00e676' });

  const usableH = H - 80;
  const toH = v => Math.max(2, (v / gross) * usableH);

  const x1 = 20;
  const x2 = W * 0.42;
  const x3 = W - 20;
  const xDedLabel = W * 0.42 + 20;

  const grossH = usableH;
  const grossY = 40;

  let dedCursor = grossY;
  const dedNodes = deductions.map(d => {
    const h = toH(d.value);
    const y = dedCursor;
    dedCursor += h + 3;
    return { ...d, h, y };
  });
  const netH = toH(net);
  const netY = dedCursor + 3;

  let expCursor = netY;
  const expNodes = expFlows.map(e => {
    const h = toH(e.value);
    const y = expCursor;
    expCursor += h + 2;
    return { ...e, h, y };
  });

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--font-mono)">`;

  const flow = (x1n, y1n, h1, x2n, y2n, h2, color, opacity=0.45) => {
    const mx = (x1n + x2n) / 2;
    return `<path d="M${x1n},${y1n} C${mx},${y1n} ${mx},${y2n} ${x2n},${y2n} L${x2n},${y2n+h2} C${mx},${y2n+h2} ${mx},${y1n+h1} ${x1n},${y1n+h1} Z" fill="${color}" opacity="${opacity}"/>`;
  };

  let grossOut = grossY;
  for (const d of dedNodes) {
    svg += flow(x1 + nodeW, grossOut, d.h, x2 - nodeW, d.y, d.h, d.color);
    grossOut += d.h + 3;
  }
  svg += flow(x1 + nodeW, grossOut, netH, x2 - nodeW, netY, netH, '#00bfff');

  let netOut = netY;
  for (const e of expNodes) {
    svg += flow(x2 + nodeW, netOut, e.h, x3 - 140, e.y, e.h, e.color);
    netOut += e.h + 2;
  }

  svg += `<rect x="${x1}" y="${grossY}" width="${nodeW}" height="${grossH}" fill="#d9dde2" rx="2"/>`;
  svg += `<text x="${x1-4}" y="${grossY + grossH/2}" fill="#8e9099" font-size="10" text-anchor="end" dominant-baseline="middle">Gross</text>`;
  svg += `<text x="${x1-4}" y="${grossY + grossH/2 + 12}" fill="#d9dde2" font-size="11" text-anchor="end" dominant-baseline="middle">£${Math.round(gross).toLocaleString()}</text>`;

  for (const d of dedNodes) {
    svg += `<rect x="${x2-nodeW}" y="${d.y}" width="${nodeW}" height="${d.h}" fill="${d.color}" rx="2"/>`;
    svg += `<text x="${xDedLabel}" y="${d.y + d.h/2}" fill="${d.color}" font-size="10" dominant-baseline="middle">${d.label} £${Math.round(d.value).toLocaleString()}</text>`;
  }

  svg += `<rect x="${x2-nodeW}" y="${netY}" width="${nodeW*2}" height="${netH}" fill="#5794f2" rx="2"/>`;
  svg += `<text x="${x2}" y="${netY + netH/2}" fill="#fff" font-size="10" text-anchor="middle" dominant-baseline="middle">Net £${Math.round(net).toLocaleString()}</text>`;

  for (const e of expNodes) {
    svg += `<rect x="${x3-140-nodeW}" y="${e.y}" width="${nodeW}" height="${e.h}" fill="${e.color}" rx="2"/>`;
    const labelColor = e.label === 'Savings' ? '#00e676' : '#d9dde2';
    svg += `<text x="${x3-130}" y="${e.y + e.h/2}" fill="${labelColor}" font-size="10" dominant-baseline="middle">${e.label} £${Math.round(e.value).toLocaleString()}</text>`;
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

// ── Savings Rate Trend ────────────────────────────────────────

function renderSavingsRateChart(st) {
  const ctx = getCtx('chart-savings-rate');
  if (!ctx) return;
  const log = st.monthlyLog || [];
  const labels = log.map(r => r.month);
  const rates = log.map(r => r.netGBP > 0 ? round2((r.savedGBP / r.netGBP) * 100) : 0);
  const benchmark = log.map(() => 20);
  charts['chart-savings-rate'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Savings Rate %', data: rates, borderColor: C.positive, backgroundColor: C.positive + '22', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2 },
      { label: '20% Benchmark', data: benchmark, borderColor: C.warning, backgroundColor: 'transparent', borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700, easing: 'easeInOutQuart' },
      plugins: { legend: { display: true, labels: { color: C.tick, boxWidth: 10, font: { size: 11 } } }, tooltip: { backgroundColor: '#252830', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#d9dde2', bodyColor: '#8e9099', padding: 10 } },
      scales: { x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } },
                y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, callback: v => v + '%' }, min: 0, max: 50 } },
    },
  });
}

// ── Surplus Trajectory ────────────────────────────────────────

function renderSurplusTrajectoryChart(st) {
  const ctx = getCtx('chart-surplus-trajectory');
  if (!ctx) return;
  const events = surplusTrajectoryEvents(st);
  const labels = events.map(e => e.date.slice(0, 7));
  const data   = events.map(e => e.surplus);
  const pointLabels = events.map(e => e.label);
  charts['chart-surplus-trajectory'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      label: 'Monthly Surplus (£)',
      data,
      borderColor: C.info,
      backgroundColor: C.info + '22',
      fill: true,
      stepped: 'before',
      pointRadius: 6,
      pointBackgroundColor: data.map(v => v >= 0 ? C.positive : C.negative),
      borderWidth: 2,
    }]},
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#252830', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#d9dde2', bodyColor: '#8e9099', padding: 10,
          callbacks: {
            title: (items) => pointLabels[items[0].dataIndex] || labels[items[0].dataIndex],
            label: (item) => ` £${item.raw.toFixed(0)} surplus`,
            afterLabel: (item) => events[item.dataIndex].detail || '',
          }
        },
      },
      scales: { x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } },
                y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, callback: v => '£' + v } } },
    },
  });
}

// ── Budget vs Actual Radar ────────────────────────────────────

function renderBudgetRadarChart(st) {
  const ctx = getCtx('chart-budget-radar');
  if (!ctx) return;
  const effItems = applyScheduledChanges(st.expenses || { items: [], scheduledChanges: [] });
  const byCat = expensesByCategory(effItems);
  const budgetMap = st.settings?.chartParams?.budgetByCategory || {};
  const cats = Object.keys(byCat).filter(c => byCat[c] > 0);
  const actual = cats.map(c => byCat[c] || 0);
  const budget = cats.map(c => budgetMap[c] || byCat[c] || 0);
  charts['chart-budget-radar'] = new Chart(ctx, {
    type: 'radar',
    data: { labels: cats, datasets: [
      { label: 'Actual', data: actual, borderColor: C.negative, backgroundColor: C.negative + '33', pointBackgroundColor: C.negative, borderWidth: 2 },
      { label: 'Budget', data: budget, borderColor: C.info, backgroundColor: C.info + '22', pointBackgroundColor: C.info, borderDash: [4, 4], borderWidth: 2 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: { legend: { display: true, labels: { color: C.tick, boxWidth: 10, font: { size: 11 } } }, tooltip: { backgroundColor: '#252830', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#d9dde2', bodyColor: '#8e9099', padding: 10 } },
      scales: { r: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 10 }, backdropColor: 'transparent', callback: v => '£' + v }, pointLabels: { color: '#d9dde2', font: { size: 11 } }, angleLines: { color: C.grid } } },
    },
  });
}

function renderRatiosChart({ savingsRate, housingRatio, investRate, debtIncome }) {
  const ctx = document.getElementById('chart-ratios')?.getContext('2d');
  if (!ctx) return;
  if (_chart) { _chart.destroy(); }
  const labels     = ['Savings %', 'Housing %', 'Invest %', 'Debt/Income %'];
  const actual     = [savingsRate, housingRatio, investRate, debtIncome];
  const benchmarks = [20, 30, 10, 20];
  const colors     = actual.map((v,i)=>{
    if (labels[i]==='Housing %' || labels[i]==='Debt/Income %') return v<=benchmarks[i]?C.positive:C.negative;
    return v>=benchmarks[i]?C.positive:C.warning;
  });
  _chart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Actual', data:actual, backgroundColor:colors.map(c=>c+'cc'), borderRadius:4,
        animations:{ y:{ from:0, duration:600, easing:'easeOutQuart' } } },
      { label:'Benchmark', data:benchmarks, backgroundColor:'rgba(255,255,255,0.06)', borderRadius:4, borderColor:'rgba(255,255,255,0.2)', borderWidth:1 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
      plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'rgba(9,12,20,0.96)',borderColor:'rgba(0,191,255,0.25)',borderWidth:1,titleColor:'#00bfff',bodyColor:'#7a96b3',padding:10} },
      scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
               y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11},callback:v=>v+'%'},max:100} },
    },
  });
}
