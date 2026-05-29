import { initPage }  from '../page-init.js';
import {
  calculateNetPay, calculateNetWorth, applyScheduledChanges, totalExpenses,
  calculateSurplus, fmtGBP, fmtPct, round2
} from '../calc.js';

// Hoisted before top-level await
const C = { positive:'#73bf69', negative:'#f2495c', warning:'#ff9830', info:'#5794f2', grid:'rgba(255,255,255,0.06)', tick:'#5c6170' };
let _chart = null;

const state = await initPage('analytics');
render(state);

function render(st) {
  const rate  = st.settings?.inrGbpRate || 125;
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
  const debtIncome    = grossMonthly > 0 ? round2((pay.grossBase/12 > 0 ? (dbt.sbi?.emiINR||0)/rate / (pay.grossBase/12) * 100 : 0)) : 0;
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
            <tr><td class="stat-label">Housing</td><td class="td-right mono">${fmtGBP(housingCost)}</td></div></tr>
            <tr><td class="stat-label">Monthly surplus</td><td class="td-right mono ${surplus>=0?'text-positive':'text-negative'}">${fmtGBP(surplus)}</td></tr>
            <tr><td class="stat-label">Annual surplus</td><td class="td-right mono ${surplus>=0?'text-positive':'text-negative'}">${fmtGBP(surplus*12)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  renderRatiosChart({ savingsRate, housingRatio, investRate, debtIncome });
}

function kpiCard(label, value, colorClass, sub) {
  const cls = colorClass==='positive'?'text-positive':colorClass==='negative'?'text-negative':'text-warning';
  return `<div class="metric-card"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

// ── Chart ─────────────────────────────────────────────────────

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
      plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'#252830',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,titleColor:'#d9dde2',bodyColor:'#8e9099',padding:10} },
      scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
               y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11},callback:v=>v+'%'},max:100} },
    },
  });
}
