import {
  calculateNetPay, generateAmortisation, projectULIP,
  calculateNetWorth, applyScheduledChanges, totalExpenses,
  expensesByCategory, indiaTripProgress, emergencyFundProgress,
  taxTrackerProgress, round2, ulipValueGBP, ulipPremiumGBP,
  projectionAtYear, projectNetWorthTimeline, fmtGBP, fmtINR
} from './calc.js';

// ── Colour palette (hardcoded hex — Chart.js can't use CSS vars) ─

const C = {
  bg:       '#121828',
  grid:     'rgba(0,191,255,0.07)',
  tick:     '#3d5473',
  positive: '#00e676',
  negative: '#ff1744',
  warning:  '#ff9100',
  info:     '#00bfff',
  purple:   '#d500f9',
  yellow:   '#ffd600',
  teal:     '#00e5ff',
  cyan:     '#18ffff',
  chart:    ['#00bfff','#00e676','#ffd600','#ff9100','#ff1744','#d500f9','#00e5ff','#18ffff'],
};

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function getCtx(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  destroyChart(id);
  return canvas.getContext('2d');
}

// ── Base options ─────────────────────────────────────────────

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(9,12,20,0.96)',
      borderColor: 'rgba(0,191,255,0.25)',
      borderWidth: 1,
      titleColor: '#00bfff',
      bodyColor: '#7a96b3',
      padding: 12,
      cornerRadius: 6,
    }
  },
  scales: {
    x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } },
    y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } }
  }
};

function noScales() {
  return { x: { display: false }, y: { display: false } };
}

// ── Gauge (half-doughnut) ────────────────────────────────────

function gaugeChart(id, pct, color) {
  const ctx = getCtx(id);
  if (!ctx) return;
  const val  = Math.max(0, Math.min(100, pct));
  const rest = 100 - val;
  chartInstances[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [val, rest, 100],
        backgroundColor: [color, '#252830', 'transparent'],
        borderWidth: 0,
        hoverOffset: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      animation: { duration: 600 }
    }
  });
}

// ── Overview charts ──────────────────────────────────────────

function initOverviewCharts(state) {
  const expenses  = state.expenses || { items:[], scheduledChanges:[] };
  const effItems  = applyScheduledChanges(expenses);
  const byCat     = expensesByCategory(effItems);
  const catLabels = Object.keys(byCat);
  const catValues = Object.values(byCat);

  // Expense doughnut
  const ctxDo = getCtx('chart-expense-doughnut');
  if (ctxDo) {
    chartInstances['chart-expense-doughnut'] = new Chart(ctxDo, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catValues, backgroundColor: C.chart, borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        ...baseOpts,
        cutout: '65%',
        scales: noScales(),
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: { label: ctx => ` £${ctx.raw.toFixed(0)} — ${ctx.label}` }
          }
        }
      }
    });

    // Custom legend
    const leg = document.getElementById('legend-expense-doughnut');
    if (leg) {
      leg.innerHTML = catLabels.map((l,i) =>
        `<div class="legend-item"><div class="legend-dot" style="background:${C.chart[i%C.chart.length]}"></div>${l}</div>`
      ).join('');
    }
  }

  // Monthly bar
  const log = state.monthlyLog || [];
  const months = log.map(r => r.month.slice(5));
  const ctxBar = getCtx('chart-monthly-bar');
  if (ctxBar) {
    const inc = state.income || {};
    const pay = calculateNetPay(inc);
    chartInstances['chart-monthly-bar'] = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: log.map(r => r.month.replace('-','/')),
        datasets: [
          { label:'Net Income', data: log.map(r=>r.netGBP||0), backgroundColor: C.info + 'cc', borderRadius: 3 },
          { label:'Expenses',   data: log.map(r=>(r.netGBP||0)-(r.savedGBP||0)), backgroundColor: C.warning + 'cc', borderRadius: 3 },
          { label:'Saved',      data: log.map(r=>r.savedGBP||0), backgroundColor: C.positive + 'cc', borderRadius: 3 }
        ]
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: true, labels: { color: C.tick, boxWidth: 10, font:{size:11} } } }
      }
    });
  }

  // Gauges
  const rate   = state.settings?.inrGbpRate || 125;
  const inv    = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt    = state.debts || { sbi:{} };
  const goals  = state.goals || {};
  const india  = indiaTripProgress(goals);
  const emerg  = emergencyFundProgress(inv, goals);
  const nw     = calculateNetWorth(inv, dbt, rate);
  const nwPct  = Math.max(0, Math.min(100, round2(((nw.netWorth + (goals.wealthTargetGBP||4760000)) / (2*(goals.wealthTargetGBP||4760000)))*100)));

  gaugeChart('chart-gauge-india',     india.pct, india.pct >= 80 ? C.positive : C.warning);
  gaugeChart('chart-gauge-emergency', emerg.pct, emerg.pct >= 80 ? C.positive : C.warning);
  gaugeChart('chart-gauge-wealth',    nwPct,     nwPct  >= 50 ? C.positive : C.info);
}

// ── Income waterfall ─────────────────────────────────────────

function initIncomeCharts(state) {
  const inc = state.income || {};
  const pay = calculateNetPay(inc);
  const ctx = getCtx('chart-income-waterfall');
  if (!ctx) return;

  const labels  = ['Gross (base)','+ Overtime','− Tax','− NI','− Pension','− Underpay','Net'];
  const invisib  = [0, pay.grossBase, pay.grossWithOT, pay.grossWithOT-pay.incomeTax, pay.grossWithOT-pay.incomeTax-pay.ni, pay.grossWithOT-pay.incomeTax-pay.ni-pay.pension, 0];
  const bars     = [pay.grossBase, inc.avgOvertimeGrossGBP||0, pay.incomeTax, pay.ni, pay.pension, pay.extraTax, pay.netWithOT];
  const colors   = [C.info, C.teal, C.negative, C.negative, C.negative, C.negative, C.positive];

  chartInstances['chart-income-waterfall'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'offset', data: invisib, backgroundColor:'transparent', borderWidth:0 },
        { label:'value',  data: bars, backgroundColor: colors, borderRadius:3, borderWidth:0 }
      ]
    },
    options: {
      ...baseOpts,
      plugins: { ...baseOpts.plugins, tooltip: { ...baseOpts.plugins.tooltip, filter: i => i.datasetIndex===1,
        callbacks:{label:ctx=>' £'+ctx.raw.toFixed(0)} } },
      scales: {
        x: { stacked:true, grid:{color:C.grid}, ticks:{color:C.tick,font:{size:11}} },
        y: { stacked:true, grid:{color:C.grid}, ticks:{color:C.tick,font:{size:11},callback:v=>'£'+v.toFixed(0)} }
      }
    }
  });
}

// ── Expenses charts ───────────────────────────────────────────

function initExpenseCharts(state) {
  const expenses = state.expenses || { items:[], scheduledChanges:[] };
  const effItems = applyScheduledChanges(expenses);
  const byCat    = expensesByCategory(effItems);
  const catLabels= Object.keys(byCat);
  const catVals  = Object.values(byCat);

  // Doughnut
  const ctxDo = getCtx('chart-exp-doughnut');
  if (ctxDo) {
    chartInstances['chart-exp-doughnut'] = new Chart(ctxDo, {
      type:'doughnut',
      data:{ labels:catLabels, datasets:[{data:catVals, backgroundColor:C.chart, borderWidth:0}] },
      options:{ ...baseOpts, cutout:'65%', scales:noScales(),
        plugins:{...baseOpts.plugins,legend:{display:false},tooltip:{...baseOpts.plugins.tooltip,callbacks:{label:ctx=>' £'+ctx.raw.toFixed(0)}}} }
    });
    const leg = document.getElementById('legend-exp-doughnut');
    if (leg) leg.innerHTML = catLabels.map((l,i)=>`<div class="legend-item"><div class="legend-dot" style="background:${C.chart[i%C.chart.length]}"></div>${l}</div>`).join('');
  }

  // Bar current vs post-changes
  const futureItems = expenses.items.map(item => {
    const sc = (expenses.scheduledChanges||[]).find(c=>c.expenseId===item.id);
    return { ...item, monthlyGBP: sc ? sc.newMonthlyGBP : item.monthlyGBP };
  });
  const futureCat = expensesByCategory(futureItems.filter(i=>i.active));
  const allCats   = [...new Set([...catLabels, ...Object.keys(futureCat)])];
  const ctxBar = getCtx('chart-exp-bar');
  if (ctxBar) {
    chartInstances['chart-exp-bar'] = new Chart(ctxBar, {
      type:'bar',
      data:{
        labels:allCats,
        datasets:[
          {label:'Current', data:allCats.map(c=>byCat[c]||0), backgroundColor:C.info+'cc', borderRadius:3},
          {label:'Post-changes', data:allCats.map(c=>futureCat[c]||0), backgroundColor:C.teal+'cc', borderRadius:3}
        ]
      },
      options:{...baseOpts, plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}}
    });
  }

  // 12-month trajectory
  const today = new Date();
  const months12 = Array.from({length:12},(_,i)=>{
    const d = new Date(today.getFullYear(), today.getMonth()+i, 1);
    return d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
  });
  const monthlyTotals = months12.map((_,i)=>{
    const d = new Date(today.getFullYear(), today.getMonth()+i, 1);
    const dStr = d.toISOString().slice(0,10);
    const items = expenses.items.map(item=>{
      const sc = (expenses.scheduledChanges||[]).find(c=>c.expenseId===item.id && c.changeDate<=dStr);
      return {...item, monthlyGBP: sc ? sc.newMonthlyGBP : item.monthlyGBP};
    });
    return totalExpenses(items.filter(i=>i.active));
  });

  const ctxLn = getCtx('chart-exp-line');
  if (ctxLn) {
    chartInstances['chart-exp-line'] = new Chart(ctxLn, {
      type:'line',
      data:{labels:months12, datasets:[{label:'Total Expenses', data:monthlyTotals, borderColor:C.warning, backgroundColor:C.warning+'22', fill:true, tension:0.3, pointRadius:3, borderWidth:2}]},
      options:{...baseOpts, scales:{...baseOpts.scales, y:{...baseOpts.scales.y, ticks:{...baseOpts.scales.y.ticks,callback:v=>'£'+v.toFixed(0)}}}}
    });
  }
}

// ── Debt charts ───────────────────────────────────────────────

function initDebtCharts(state) {
  const sbi   = state.debts?.sbi || {};
  const sch   = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, 0);
  const schEx = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);

  // Annual stacked bar
  const years = Math.min(Math.ceil(sch.length/12), 10);
  const yearLabels = Array.from({length:years},(_,i)=>`Yr ${i+1}`);
  const annInterest = [], annPrincipal = [];
  for (let y=0; y<years; y++) {
    const slice = sch.slice(y*12, (y+1)*12);
    annInterest.push(round2(slice.reduce((s,r)=>s+r.interest,0)/1000));
    annPrincipal.push(round2(slice.reduce((s,r)=>s+r.principal,0)/1000));
  }

  const ctxStk = getCtx('chart-debt-stacked');
  if (ctxStk) {
    chartInstances['chart-debt-stacked'] = new Chart(ctxStk, {
      type:'bar',
      data:{
        labels:yearLabels,
        datasets:[
          {label:'Interest (₹k)', data:annInterest, backgroundColor:C.negative+'cc', borderRadius:2},
          {label:'Principal (₹k)',data:annPrincipal, backgroundColor:C.positive+'cc', borderRadius:2}
        ]
      },
      options:{...baseOpts, scales:{x:{stacked:true,grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},y:{stacked:true,grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}}},
        plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}}
    });
  }

  // Balance line chart
  const step = Math.max(1, Math.floor(sch.length/24));
  const lineLabels = sch.filter((_,i)=>i%step===0).map(r=>`M${r.month}`);
  const balBase    = sch.filter((_,i)=>i%step===0).map(r=>round2(r.closing/100000));
  const balEx      = schEx.filter((_,i)=>i%step===0).map(r=>round2(r.closing/100000));
  while (balEx.length < balBase.length) balEx.push(0);

  const ctxLn = getCtx('chart-debt-line');
  if (ctxLn) {
    chartInstances['chart-debt-line'] = new Chart(ctxLn, {
      type:'line',
      data:{
        labels:lineLabels,
        datasets:[
          {label:'Base EMI', data:balBase, borderColor:C.negative, backgroundColor:C.negative+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2},
          {label:`+₹${sbi.extraMonthlyINR||0}/mo`, data:balEx, borderColor:C.positive, backgroundColor:C.positive+'11', fill:true, tension:0.3, pointRadius:0, borderWidth:2}
        ]
      },
      options:{...baseOpts, scales:{...baseOpts.scales, y:{...baseOpts.scales.y,ticks:{...baseOpts.scales.y.ticks,callback:v=>'₹'+v+'L'}}},
        plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}}
    });
  }
}

// ── Investment/ULIP charts ────────────────────────────────────

function initInvestmentCharts(state) {
  const inv  = state.investments || { ulips:[] };
  const rate = state.settings?.inrGbpRate || 125;

  // Per-ULIP charts
  inv.ulips.forEach(u => {
    const valueGBP = ulipValueGBP(u, rate);
    const premGBP  = ulipPremiumGBP(u, rate);
    const cPts = projectULIP(valueGBP, premGBP, u.conservativeRatePercent, u.payTermEndDate, u.totalTermYears);
    const ePts = projectULIP(valueGBP, premGBP, u.expectedRatePercent,     u.payTermEndDate, u.totalTermYears);
    const aPts = projectULIP(valueGBP, premGBP, u.aggressiveRatePercent,   u.payTermEndDate, u.totalTermYears);
    const years = cPts.map(p=>p.year);

    const ctx = getCtx('chart-ulip-'+u.id);
    if (!ctx) return;

    const divBy = u.currency==='INR' ? 1 : 1;
    chartInstances['chart-ulip-'+u.id] = new Chart(ctx, {
      type:'line',
      data:{
        labels: years.map(y=>`Yr ${y}`),
        datasets:[
          {label:`Conservative ${u.conservativeRatePercent}%`, data:cPts.map(p=>p.value), borderColor:C.warning, backgroundColor:'transparent', tension:0.4, pointRadius:0, borderWidth:2, borderDash:[4,4]},
          {label:`Expected ${u.expectedRatePercent}%`,         data:ePts.map(p=>p.value), borderColor:C.info,    backgroundColor:C.info+'22', fill:true, tension:0.4, pointRadius:0, borderWidth:2},
          {label:`Aggressive ${u.aggressiveRatePercent}%`,     data:aPts.map(p=>p.value), borderColor:C.positive,backgroundColor:'transparent', tension:0.4, pointRadius:0, borderWidth:2, borderDash:[2,2]}
        ]
      },
      options:{
        ...baseOpts,
        scales:{...baseOpts.scales, y:{...baseOpts.scales.y, ticks:{...baseOpts.scales.y.ticks, callback:v=>u.currency==='GBP'?'£'+Math.round(v).toLocaleString():'₹'+Math.round(v).toLocaleString()}}},
        plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}
      }
    });
  });

  // Combined ULIP chart
  const ctx = getCtx('chart-ulip-combined');
  if (!ctx || inv.ulips.length === 0) return;

  const maxTermYears = Math.max(...inv.ulips.map(u=>u.totalTermYears));
  const yearRange = Array.from({length:maxTermYears+1},(_,i)=>i);

  const combined = yearRange.map(yr => {
    return round2(inv.ulips.reduce((sum, u) => {
      const valueGBP = ulipValueGBP(u, rate);
      const premGBP  = ulipPremiumGBP(u, rate);
      const pts = projectULIP(valueGBP, premGBP, u.expectedRatePercent, u.payTermEndDate, u.totalTermYears);
      const pt  = pts.find(p=>p.year===yr);
      const v   = pt ? (u.currency==='INR' ? round2(pt.value/rate) : pt.value) : 0;
      return sum + v;
    }, 0));
  });

  chartInstances['chart-ulip-combined'] = new Chart(ctx, {
    type:'line',
    data:{
      labels: yearRange.map(y=>`Yr ${y}`),
      datasets:[{label:'Combined ULIPs (£)', data:combined, borderColor:C.purple, backgroundColor:C.purple+'22', fill:true, tension:0.4, pointRadius:2, borderWidth:2}]
    },
    options:{
      ...baseOpts,
      scales:{...baseOpts.scales, y:{...baseOpts.scales.y, ticks:{...baseOpts.scales.y.ticks, callback:v=>'£'+Math.round(v).toLocaleString()}}},
      plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}
    }
  });
}

// ── Net worth timeline ────────────────────────────────────────

function initNetWorthChart(state) {
  const ctx = getCtx('chart-nw-timeline');
  if (!ctx) return;

  const rate  = state.settings?.inrGbpRate || 125;
  const inc   = state.income || {};
  const inv   = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = state.debts?.sbi || {};
  const goals = state.goals || {};
  const pay   = calculateNetPay(inc);
  const effItems = applyScheduledChanges(state.expenses||{items:[],scheduledChanges:[]});
  const surplus   = round2(pay.netWithOT - totalExpenses(effItems));
  const nw        = calculateNetWorth(inv, dbt, rate);

  const timeline = projectNetWorthTimeline({
    startDate: new Date().toISOString().slice(0,7)+'-01',
    startNetWorth: nw.netWorth,
    monthlySaving: surplus,
    pensionValue: inv.pensions?.[0]?.valueGBP || 0,
    pensionMonthly: inv.pensions?.[0]?.monthlyGBP || 0,
    pensionGrowthRate: 7,
    debtOutstandingINR: dbt.outstandingINR || 0,
    debtEmiINR: dbt.emiINR || 34090,
    debtRatePercent: dbt.ratePercent || 9.9,
    inrGbpRate: rate
  });

  const labels = timeline.map(p=>p.label);
  const milestones = [0, 10000, 50000, 100000];

  chartInstances['chart-nw-timeline'] = new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Assets', data:timeline.map(p=>p.assets), borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2},
        {label:'Liabilities', data:timeline.map(p=>-p.liabilities), borderColor:C.negative, backgroundColor:C.negative+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2},
        {label:'Net Worth', data:timeline.map(p=>p.netWorth), borderColor:'#ffffff', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:2.5}
      ]
    },
    options:{
      ...baseOpts,
      scales:{...baseOpts.scales, y:{...baseOpts.scales.y, ticks:{...baseOpts.scales.y.ticks, callback:v=>'£'+Math.round(v).toLocaleString()}}},
      plugins:{
        ...baseOpts.plugins,
        legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}},
        annotation: undefined
      }
    }
  });
}

// ── India trip charts ─────────────────────────────────────────

function initIndiaTripCharts(state) {
  const goals = state.goals || {};
  const log   = state.indiaLog || [];
  const prog  = indiaTripProgress(goals);

  // Speedometer
  gaugeChart('chart-india-gauge', prog.pct, prog.pct >= 80 ? C.positive : C.warning);
  const el = document.getElementById('india-gauge-val');
  if (el) el.textContent = prog.pct.toFixed(1)+'%';

  if (log.length === 0) return;

  const labels  = log.map(r=>r.month);
  const planned = log.map((_,i)=>round2(log.slice(0,i+1).reduce((s,r)=>s+(r.plannedGBP||0),0)));
  const actual  = log.map((_,i)=>round2(log.slice(0,i+1).reduce((s,r)=>s+(r.actualGBP||0),0)));

  // Running total line
  const ctxLn = getCtx('chart-india-line');
  if (ctxLn) {
    chartInstances['chart-india-line'] = new Chart(ctxLn, {
      type:'line',
      data:{
        labels,
        datasets:[
          {label:'Planned', data:planned, borderColor:C.info, backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2, borderDash:[4,4]},
          {label:'Actual',  data:actual,  borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:3, borderWidth:2}
        ]
      },
      options:{...baseOpts, scales:{...baseOpts.scales, y:{...baseOpts.scales.y,ticks:{...baseOpts.scales.y.ticks,callback:v=>'£'+v.toFixed(0)}}},
        plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}}
    });
  }

  // Bar monthly
  const ctxBr = getCtx('chart-india-bar');
  if (ctxBr) {
    chartInstances['chart-india-bar'] = new Chart(ctxBr, {
      type:'bar',
      data:{
        labels,
        datasets:[
          {label:'Planned (£)', data:log.map(r=>r.plannedGBP||0), backgroundColor:C.info+'cc', borderRadius:3},
          {label:'Actual (£)',  data:log.map(r=>r.actualGBP||0),  backgroundColor:C.positive+'cc', borderRadius:3}
        ]
      },
      options:{...baseOpts, plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}}
    });
  }
}

// ── Tax tracker chart ─────────────────────────────────────────

function initTaxChart(state) {
  const tt   = state.taxTracker || {};
  const ctx  = getCtx('chart-tax-line');
  if (!ctx) return;

  const start  = new Date(tt.startDate || '2026-04-06');
  const months = 12;
  const labels = [];
  const cumulative = [];
  const prog = taxTrackerProgress(tt);

  for (let i=0; i<=months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth()+i, 1);
    labels.push(d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}));
    cumulative.push(Math.min(tt.underpaymentTotal||456, round2(i * (tt.monthlyDeduction||38))));
  }

  chartInstances['chart-tax-line'] = new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Collected', data:cumulative, borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:2, borderWidth:2},
        {label:'Target',    data:Array(months+1).fill(tt.underpaymentTotal||456), borderColor:C.warning, backgroundColor:'transparent', borderDash:[4,4], pointRadius:0, borderWidth:1.5}
      ]
    },
    options:{
      ...baseOpts,
      scales:{...baseOpts.scales, y:{...baseOpts.scales.y,ticks:{...baseOpts.scales.y.ticks,callback:v=>'£'+v.toFixed(0)}}},
      plugins:{...baseOpts.plugins, legend:{display:true, labels:{color:C.tick,boxWidth:10,font:{size:11}}}}
    }
  });
}

// ── Public API ───────────────────────────────────────────────

export async function initAllCharts(state) {
  initOverviewCharts(state);
  initIncomeCharts(state);
  initExpenseCharts(state);
  initDebtCharts(state);
  initInvestmentCharts(state);
  initNetWorthChart(state);
  initIndiaTripCharts(state);
  initTaxChart(state);
}

export async function updateCharts(state) {
  // Re-init all charts (simplest approach with destroy/recreate pattern)
  initOverviewCharts(state);
  initIncomeCharts(state);
  initExpenseCharts(state);
  initDebtCharts(state);
  // Re-init per-section only if visible to avoid null canvas errors
  if (document.getElementById('chart-ulip-combined')) initInvestmentCharts(state);
  if (document.getElementById('chart-nw-timeline'))   initNetWorthChart(state);
  if (document.getElementById('chart-india-gauge'))   initIndiaTripCharts(state);
  if (document.getElementById('chart-tax-line'))      initTaxChart(state);
}
