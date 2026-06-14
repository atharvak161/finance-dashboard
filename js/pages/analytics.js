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
    kpiCard('Savings Rate',  fmtPct(savingsRate),           savingsRate>=20?'positive':savingsRate>=10?'warning':'negative', 'vs industry 20%+',  savingsRate>=20?'Above benchmark':savingsRate>=10?'Near benchmark':'Below benchmark'),
    kpiCard('Housing Ratio', fmtPct(housingRatio),          housingRatio<=30?'positive':'negative',                         'vs industry <30%',  housingRatio<=30?'Within safe limit':'Exceeds guideline'),
    kpiCard('Invest Rate',   fmtPct(investRate),            investRate>=10?'positive':'warning',                            'vs industry 10%+',  investRate>=10?'On track':'Room to grow'),
    kpiCard('Cash Runway',   runwayMonths.toFixed(1)+'mo',  runwayMonths>=3?'positive':'negative',                         'vs industry 3mo+',  runwayMonths>=6?'Excellent':runwayMonths>=3?'Adequate':'Build fund'),
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
  renderSpendHeatmap(st);
  renderBudgetRadarChart(st);
  renderYoYChart(st);
  renderPeriodComparison(st);
}

function kpiCard(label, value, colorClass, benchmarkLabel, statusText) {
  const cls        = colorClass==='positive'?'text-positive':colorClass==='negative'?'text-negative':'text-warning';
  const dotColor   = colorClass==='positive'?'#00e676':colorClass==='negative'?'#ff1744':'#ff9100';
  const dotGlow    = colorClass==='positive'?'rgba(0,230,118,0.6)':colorClass==='negative'?'rgba(255,23,68,0.6)':'rgba(255,145,0,0.6)';
  const trendAttr  = colorClass==='positive'?'positive':colorClass==='negative'?'negative':'neutral';
  const benchHtml  = benchmarkLabel ? `<div style="font-size:10.5px;color:var(--text-muted);font-family:var(--font-mono);margin-top:-2px">${benchmarkLabel}</div>` : '';
  const statusHtml = statusText ? `<div style="font-size:11.5px;color:${dotColor};font-family:var(--font-mono)">${statusText}</div>` : '';
  return `<div class="metric-card" data-trend="${trendAttr}" style="gap:10px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="label">${label}</div>
      <span style="width:9px;height:9px;border-radius:50%;background:${dotColor};box-shadow:0 0 7px ${dotGlow};flex-shrink:0;display:inline-block"></span>
    </div>
    <div class="value ${cls}">${value}</div>
    ${benchHtml}
    ${statusHtml}
  </div>`;
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

// ── Spending Category Heat Map ────────────────────────────────

function renderSpendHeatmap(st) {
  const container = document.getElementById('spend-heatmap');
  if (!container) return;

  const items = (st.expenses?.items || []).filter(i => i.active !== false && i.monthlyGBP > 0);

  // Empty state — no expense data at all
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">Add expenses in Settings to see your spending heat map.</div>`;
    return;
  }

  // ── Build the 6-month label list ────────────────────────────
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const months = []; // [{label:'Jun 2026', key:'2026-06'}]
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
    months.push({ key, label });
  }

  // ── Try to use monthlyLog categoryBreakdown ──────────────────
  // monthlyLog entries look like { month:'2026-05', netGBP:x, savedGBP:x, ... }
  // categoryBreakdown is not part of the default schema, so we check dynamically.
  const log = st.monthlyLog || [];
  const logByKey = {};
  for (const entry of log) {
    if (entry.month) logByKey[entry.month] = entry;
  }
  const hasHistoricalBreakdown = log.some(e => e.categoryBreakdown && Object.keys(e.categoryBreakdown).length > 0);

  // Build category list from current expenses
  const catSet = new Set();
  for (const item of items) catSet.add(item.category);
  const categories = [...catSet].sort();

  // currentMonth spend per category (from expenses.items)
  const currentCatSpend = {};
  for (const item of items) {
    currentCatSpend[item.category] = (currentCatSpend[item.category] || 0) + item.monthlyGBP;
  }

  // ── Build data grid: data[category][monthKey] = GBP ─────────
  const data = {};
  for (const cat of categories) {
    data[cat] = {};
    for (const m of months) {
      if (hasHistoricalBreakdown) {
        const entry = logByKey[m.key];
        data[cat][m.key] = (entry?.categoryBreakdown?.[cat]) || 0;
      } else {
        // Fallback: use current allocation for every month
        data[cat][m.key] = currentCatSpend[cat] || 0;
      }
    }
  }

  // ── Compute max spend for colour scale ──────────────────────
  let maxSpend = 0;
  for (const cat of categories) {
    for (const m of months) {
      const v = data[cat][m.key];
      if (v > maxSpend) maxSpend = v;
    }
  }
  if (maxSpend === 0) maxSpend = 1; // avoid division by zero

  const cellColor = (amount) => {
    const opacity = amount > 0 ? 0.08 + (amount / maxSpend) * 0.82 : 0.04;
    return `rgba(0,191,255,${opacity.toFixed(3)})`;
  };

  // ── Build HTML ───────────────────────────────────────────────
  // Grid columns: label + 6 month cells + 1 total cell
  const numCols = 1 + months.length + 1;
  let html = `<div class="heat-map-wrap">`;
  html += `<div class="heat-grid" style="grid-template-columns:minmax(96px,auto) repeat(${months.length},44px) 70px">`;

  // Header row
  html += `<div class="heat-col-header" style="text-align:left">Category</div>`;
  for (const m of months) {
    html += `<div class="heat-col-header">${m.label.replace(' ', '<br>')}</div>`;
  }
  html += `<div class="heat-col-header total-header">Current</div>`;

  // Data rows
  for (const cat of categories) {
    html += `<div class="heat-label">${cat}</div>`;
    for (const m of months) {
      const amount = data[cat][m.key];
      const bg = cellColor(amount);
      const tooltip = amount > 0 ? `${cat} · ${m.label}: £${amount.toFixed(0)}` : `${cat} · ${m.label}: £0`;
      html += `<div class="heat-cell" style="background:${bg}" data-tooltip="${tooltip}"></div>`;
    }
    const total = currentCatSpend[cat] || 0;
    html += `<div class="heat-cell-total">£${total.toFixed(0)}</div>`;
  }

  html += `</div>`; // .heat-grid

  // Legend
  html += `
    <div class="heat-legend">
      <span>Lower spend</span>
      <div class="heat-legend-bar"></div>
      <span>Higher spend</span>
    </div>`;

  // Fallback note
  if (!hasHistoricalBreakdown) {
    html += `<div class="heat-fallback-note">Historical detail unavailable — showing current allocation across all months.</div>`;
  }

  html += `</div>`; // .heat-map-wrap
  container.innerHTML = html;
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

// ── Year-over-Year Budget Comparison ─────────────────────────

function renderYoYChart(st) {
  const section = document.getElementById('yoy-chart-section');
  const titleEl = document.getElementById('yoy-chart-title');
  const toggleEl = document.getElementById('yoy-toggle-btns');
  if (!section || !titleEl || !toggleEl) return;

  const log = st.monthlyLog || [];

  if (log.length < 2) {
    section.querySelector('.chart-wrap').innerHTML =
      '<div class="empty-state">Add monthly snapshots to see year-over-year trends.</div>';
    titleEl.textContent = 'Year-over-Year';
    toggleEl.innerHTML = '';
    return;
  }

  // Fiscal year config
  const fyStart = (st.settings?.fiscalYearStartMonth ?? 3); // 0=Jan … 11=Dec, default 3=Apr

  // Determine current month from today
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth(); // 0-based

  // Build a Date for each log entry by working backwards from today
  const indexed = log.map((entry, i) => {
    const monthsAgo = log.length - 1 - i;
    const d = new Date(curYear, curMonth - monthsAgo, 1);
    return { entry, year: d.getFullYear(), month: d.getMonth() };
  });

  // Determine "this" fiscal year boundaries
  // FY starts on fyStart month. If curMonth >= fyStart, FY started this calendar year.
  // Otherwise FY started last calendar year.
  const fyThisStart = curMonth >= fyStart
    ? new Date(curYear, fyStart, 1)
    : new Date(curYear - 1, fyStart, 1);
  const fyThisEnd = new Date(fyThisStart.getFullYear() + 1, fyStart, 1); // exclusive

  const fyLastStart = new Date(fyThisStart.getFullYear() - 1, fyStart, 1);
  const fyLastEnd = fyThisStart; // exclusive

  // Build ordered month labels for a fiscal year (fyStart … fyStart+11)
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fyMonths = Array.from({ length: 12 }, (_, i) => (fyStart + i) % 12);
  const labels = fyMonths.map(m => MONTH_ABBR[m]);

  // Helper: given calendar year + month, which FY slot index (0-11)?
  function fySlot(year, month) {
    // offset from fyStart, mod 12
    const offset = (month - fyStart + 12) % 12;
    return offset;
  }

  // Classify entries into this FY and last FY
  const thisIncome   = new Array(12).fill(0);
  const thisExpenses = new Array(12).fill(0);
  const lastIncome   = new Array(12).fill(0);
  const lastExpenses = new Array(12).fill(0);

  for (const { entry, year, month } of indexed) {
    const ts = new Date(year, month, 1).getTime();
    const slot = fySlot(year, month);
    if (ts >= fyThisStart.getTime() && ts < fyThisEnd.getTime()) {
      thisIncome[slot]   += (entry.netGBP || 0);
      thisExpenses[slot] += (entry.expensesGBP || 0);
    } else if (ts >= fyLastStart.getTime() && ts < fyLastEnd.getTime()) {
      lastIncome[slot]   += (entry.netGBP || 0);
      lastExpenses[slot] += (entry.expensesGBP || 0);
    }
  }

  // FY label strings e.g. "FY2025–26"
  const fyLabel = (startDate) => {
    const y = startDate.getFullYear();
    return `FY${y}–${String(y + 1).slice(-2)}`;
  };
  const thisLabel = fyLabel(fyThisStart);
  const lastLabel = fyLabel(fyLastStart);
  titleEl.textContent = `Year-over-Year: ${thisLabel} vs ${lastLabel}`;

  // Dataset definitions — visibility toggled by buttons
  const CYAN  = '#00bfff';
  const RED   = '#ff1744';
  const datasets = [
    { label: `Income ${thisLabel}`,   data: thisIncome,   backgroundColor: CYAN + 'cc',  borderColor: CYAN,  borderWidth: 1, borderRadius: 3, group: 'income' },
    { label: `Income ${lastLabel}`,   data: lastIncome,   backgroundColor: CYAN + '66',  borderColor: CYAN + '88', borderWidth: 1, borderRadius: 3, group: 'income' },
    { label: `Expenses ${thisLabel}`, data: thisExpenses, backgroundColor: RED  + 'cc',  borderColor: RED,   borderWidth: 1, borderRadius: 3, group: 'expenses' },
    { label: `Expenses ${lastLabel}`, data: lastExpenses, backgroundColor: RED  + '66',  borderColor: RED  + '88', borderWidth: 1, borderRadius: 3, group: 'expenses' },
  ];

  // Destroy previous chart instance if present
  if (charts['yoy-chart']) { charts['yoy-chart'].destroy(); delete charts['yoy-chart']; }

  // Clear canvas placeholder
  section.querySelector('.chart-wrap').innerHTML = '<canvas id="yoy-chart"></canvas>';
  const ctx = document.getElementById('yoy-chart')?.getContext('2d');
  if (!ctx) return;

  charts['yoy-chart'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: true, labels: { color: C.tick, boxWidth: 10, font: { size: 11 } } },
        tooltip: { backgroundColor: '#252830', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#d9dde2', bodyColor: '#8e9099', padding: 10,
          callbacks: { label: item => ` £${Math.round(item.raw).toLocaleString()} — ${item.dataset.label}` }
        },
      },
      scales: {
        x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } },
        y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, callback: v => '£' + v } },
      },
    },
  });

  // Toggle buttons
  let activeGroup = 'both';
  const applyToggle = (group) => {
    activeGroup = group;
    const chart = charts['yoy-chart'];
    if (!chart) return;
    chart.data.datasets.forEach((ds, i) => {
      const show = group === 'both' || ds.group === group;
      chart.setDatasetVisibility(i, show);
    });
    chart.update();
    toggleEl.querySelectorAll('button').forEach(b => {
      b.style.opacity = b.dataset.group === group ? '1' : '0.45';
      b.style.borderColor = b.dataset.group === group ? CYAN : 'rgba(255,255,255,0.15)';
    });
  };

  const btnStyle = `style="padding:4px 12px;font-size:11px;font-family:var(--font-mono);background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:4px;cursor:pointer;color:var(--text-primary);transition:opacity 0.15s"`;
  toggleEl.innerHTML = `
    <button data-group="income"   ${btnStyle}>Income</button>
    <button data-group="expenses" ${btnStyle}>Expenses</button>
    <button data-group="both"     ${btnStyle}>Both</button>
  `;
  toggleEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => applyToggle(btn.dataset.group));
  });
  applyToggle('both');
}

function renderPeriodComparison(st) {
  const el = document.getElementById('period-comparison');
  if (!el) return;

  const log = st.monthlyLog || [];
  const inc = st.income || {};
  const pay = calculateNetPay(inc);
  const effItems = applyScheduledChanges(st.expenses || { items:[], scheduledChanges:[] });
  const totalExp = totalExpenses(effItems);
  const nw = calculateNetWorth(st.investments || {}, st.debts || {}, st.settings?.inrGbpRate || 83);
  const surplus = calculateSurplus(pay.netWithOT, totalExp);
  const savRate = pay.netWithOT > 0 ? round2((surplus / pay.netWithOT) * 100) : 0;

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,'0')}`;
  const sameLastYearKey = `${now.getFullYear()-1}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const lastM = log.find(r => r.month === lastMonthKey) || null;
  const lastY = log.find(r => r.month === sameLastYearKey) || null;

  function logNet(entry)  { return entry?.netGBP || 0; }
  function logExp(entry)  { return entry ? Math.max(0, (entry.netGBP || 0) - (entry.savedGBP || 0)) : 0; }
  function logSav(entry)  { return entry?.savedGBP || 0; }
  function logRate(entry) { return entry && entry.netGBP > 0 ? round2((entry.savedGBP / entry.netGBP) * 100) : 0; }

  function delta(curr, prev, higherIsBetter = true) {
    if (prev === null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < 0.01) return '<span class="label-muted">—</span>';
    const up = diff > 0;
    const good = higherIsBetter ? up : !up;
    const cls = good ? 'roai-positive' : 'roai-negative';
    const arrow = up ? '▲' : '▼';
    return `<span class="${cls}">${arrow} ${fmtGBP(Math.abs(diff))}</span>`;
  }

  function pctDelta(curr, prev, higherIsBetter = true) {
    if (prev === null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < 0.1) return '<span class="label-muted">—</span>';
    const up = diff > 0;
    const good = higherIsBetter ? up : !up;
    const cls = good ? 'roai-positive' : 'roai-negative';
    const arrow = up ? '▲' : '▼';
    return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(1)}pp</span>`;
  }

  const noData = (entry, label) => entry ? label : '<span class="label-muted">No log</span>';

  el.innerHTML = `
    <div class="panel-header"><span class="panel-title">Period Comparison</span><span class="label-muted" style="font-size:12px">This month vs last month vs same month last year</span></div>
    <div style="overflow-x:auto">
      <table class="data-table" style="min-width:580px">
        <thead><tr>
          <th>Metric</th>
          <th class="td-right">This Month</th>
          <th class="td-right">Last Month${lastM ? ` <span class="label-muted" style="font-size:10px">(${lastMonthKey})</span>` : ''}</th>
          <th class="td-right">vs Last Mo</th>
          <th class="td-right">Same Mo Last Yr${lastY ? ` <span class="label-muted" style="font-size:10px">(${sameLastYearKey})</span>` : ''}</th>
          <th class="td-right">vs Last Yr</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>Net Pay</td>
            <td class="td-right mono">${fmtGBP(pay.netWithOT)}</td>
            <td class="td-right mono">${noData(lastM, fmtGBP(logNet(lastM)))}</td>
            <td class="td-right">${lastM ? delta(pay.netWithOT, logNet(lastM)) : ''}</td>
            <td class="td-right mono">${noData(lastY, fmtGBP(logNet(lastY)))}</td>
            <td class="td-right">${lastY ? delta(pay.netWithOT, logNet(lastY)) : ''}</td>
          </tr>
          <tr>
            <td>Expenses</td>
            <td class="td-right mono">${fmtGBP(totalExp)}</td>
            <td class="td-right mono">${noData(lastM, fmtGBP(logExp(lastM)))}</td>
            <td class="td-right">${lastM ? delta(totalExp, logExp(lastM), false) : ''}</td>
            <td class="td-right mono">${noData(lastY, fmtGBP(logExp(lastY)))}</td>
            <td class="td-right">${lastY ? delta(totalExp, logExp(lastY), false) : ''}</td>
          </tr>
          <tr>
            <td>Savings</td>
            <td class="td-right mono">${fmtGBP(surplus)}</td>
            <td class="td-right mono">${noData(lastM, fmtGBP(logSav(lastM)))}</td>
            <td class="td-right">${lastM ? delta(surplus, logSav(lastM)) : ''}</td>
            <td class="td-right mono">${noData(lastY, fmtGBP(logSav(lastY)))}</td>
            <td class="td-right">${lastY ? delta(surplus, logSav(lastY)) : ''}</td>
          </tr>
          <tr>
            <td>Savings Rate</td>
            <td class="td-right mono">${savRate.toFixed(1)}%</td>
            <td class="td-right mono">${noData(lastM, logRate(lastM).toFixed(1)+'%')}</td>
            <td class="td-right">${lastM ? pctDelta(savRate, logRate(lastM)) : ''}</td>
            <td class="td-right mono">${noData(lastY, logRate(lastY).toFixed(1)+'%')}</td>
            <td class="td-right">${lastY ? pctDelta(savRate, logRate(lastY)) : ''}</td>
          </tr>
          <tr>
            <td>Net Worth</td>
            <td class="td-right mono">${fmtGBP(nw.netWorth)}</td>
            <td class="td-right mono">${noData(lastM, lastM?.netWorthGBP ? fmtGBP(lastM.netWorthGBP) : '<span class="label-muted">—</span>')}</td>
            <td class="td-right">${lastM?.netWorthGBP ? delta(nw.netWorth, lastM.netWorthGBP) : ''}</td>
            <td class="td-right mono">${noData(lastY, lastY?.netWorthGBP ? fmtGBP(lastY.netWorthGBP) : '<span class="label-muted">—</span>')}</td>
            <td class="td-right">${lastY?.netWorthGBP ? delta(nw.netWorth, lastY.netWorthGBP) : ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p style="margin-top:12px;font-size:11px;color:var(--text-muted)">Log entries come from the Income tab → Save Monthly Log. Entries without a log show "No log".</p>`;
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
