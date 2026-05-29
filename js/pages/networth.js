import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  calculateNetPay, calculateNetWorth, applyScheduledChanges, totalExpenses,
  calculateSurplus, projectNetWorthTimeline, ageWealthTrajectory,
  fmtGBP, round2
} from '../calc.js';

// Hoisted before top-level await
const C = { positive:'#73bf69', negative:'#f2495c', info:'#5794f2', grid:'rgba(255,255,255,0.06)', tick:'#5c6170' };
let _chart = null;
const charts = {};

const state = await initPage('networth');
render(state);

function render(st) {
  const rate  = st.settings?.inrGbpRate || 125;
  const inc   = st.income   || {};
  const inv   = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = st.debts    || { sbi:{} };
  const goals = st.goals    || {};
  const nwProj= st.settings?.nwProjection || {};

  const nw    = calculateNetWorth(inv, dbt, rate);
  const pay   = calculateNetPay(inc);
  const eff   = applyScheduledChanges(st.expenses||{items:[],scheduledChanges:[]});
  const surplus = calculateSurplus(pay.netWithOT, totalExpenses(eff));

  // ── Projection fields (2-col grid) ─────────────────────────
  document.getElementById('nw-settings-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${nwField('Pension growth rate (%/yr)', 'pensionGrowthRate', nwProj.pensionGrowthRate||7)}
      ${nwField('Career transition date', 'careerTransitionDate', nwProj.careerTransitionDate||'', 'date')}
      ${nwField('New salary after transition (£/yr)', 'newSalaryGBP', nwProj.newSalaryGBP||'')}
    </div>`;
  bindNwFields(st);

  // ── Scenarios ─────────────────────────────────────────────
  const target = goals.wealthTargetGBP || 4760000;
  document.getElementById('nw-scenarios').innerHTML = `
    <div class="stat-row"><span class="stat-label">Current net worth</span>
      <span class="stat-value mono ${nw.netWorth<0?'text-negative':'text-positive'}">${fmtGBP(nw.netWorth)}</span></div>
    <div class="stat-row"><span class="stat-label">Wealth target</span><span class="stat-value mono">${fmtGBP(target)}</span></div>
    <div class="stat-row"><span class="stat-label">Current saving/mo</span><span class="stat-value mono text-info">${fmtGBP(surplus)}</span></div>
    <hr class="divider">
    <table class="data-table" style="font-size:12px">
      <thead><tr><th>Salary</th><th class="td-right">Saving/mo</th><th class="td-right">Yrs to target</th></tr></thead>
      <tbody>
        ${[28000,40000,55000,65000].map(sal=>{
          const p2=calculateNetPay({...inc,baseSalaryGBP:sal,avgOvertimeGrossGBP:0});
          const s2=calculateSurplus(p2.netBase,totalExpenses(eff));
          const yrs=s2>0?round2((target-nw.netWorth)/(s2*12)):'∞';
          return `<tr class="${sal===(inc.baseSalaryGBP||28000)?'highlight-row':''}">
            <td>${fmtGBP(sal)}</td>
            <td class="td-right mono">${fmtGBP(s2)}</td>
            <td class="td-right mono">${typeof yrs==='number'?yrs.toFixed(1)+' yrs':yrs}</td></tr>`;
        }).join('')}
      </tbody>
    </table>`;

  renderNwChart(st, surplus, nwProj);
  renderAgeTrajectoryChart(st, nw.netWorth, surplus);
}

function nwField(label, key, value, type='number') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input nw-proj-field" data-key="${key}" value="${value??''}" ${type==='number'?'step="any"':''} />
  </div>`;
}

function bindNwFields(st) {
  document.querySelectorAll('.nw-proj-field').forEach(el => {
    el.addEventListener('input', () => {
      if (!st.settings.nwProjection) st.settings.nwProjection = {};
      const k = el.dataset.key;
      st.settings.nwProjection[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
    });
    el.addEventListener('change', async () => {
      if (!st.settings.nwProjection) st.settings.nwProjection = {};
      const k = el.dataset.key;
      st.settings.nwProjection[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      await save('fin_settings', st.settings);
      render(st);
    });
  });
}

// ── Age Trajectory Chart ──────────────────────────────────────

function renderAgeTrajectoryChart(st, currentNetWorth, monthlySurplus) {
  const cp = st.settings?.chartParams?.ageTrajectory || {};
  const p = {
    currentAge: cp.currentAge || 25,
    targetAge:  cp.targetAge  || 50,
    growthRatePercent: cp.growthRatePercent || 10,
    careerTransitionAge: cp.careerTransitionAge || 28,
    careerTransitionSurplus: cp.careerTransitionMonthlySurplus || 860,
  };

  // Controls
  const ctrl = document.getElementById('age-traj-controls');
  if (ctrl) {
    ctrl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px">
        ${ageTrajField('Current age', 'currentAge', p.currentAge)}
        ${ageTrajField('Target age', 'targetAge', p.targetAge)}
        ${ageTrajField('Growth rate (%/yr)', 'growthRatePercent', p.growthRatePercent)}
        ${ageTrajField('Career transition age', 'careerTransitionAge', p.careerTransitionAge)}
        ${ageTrajField('Post-transition surplus (£/mo)', 'careerTransitionSurplus', p.careerTransitionSurplus)}
      </div>`;
    ctrl.querySelectorAll('.age-traj-field').forEach(el => {
      el.addEventListener('input', () => {
        if (!st.settings.chartParams) st.settings.chartParams = {};
        if (!st.settings.chartParams.ageTrajectory) st.settings.chartParams.ageTrajectory = {};
        const k = el.dataset.key;
        const v = parseFloat(el.value) || 0;
        st.settings.chartParams.ageTrajectory[k] = v;
        if (k === 'careerTransitionSurplus') st.settings.chartParams.ageTrajectory.careerTransitionMonthlySurplus = v;
        renderAgeTrajectoryChart(st, currentNetWorth, monthlySurplus);
      });
      el.addEventListener('change', async () => {
        if (!st.settings.chartParams) st.settings.chartParams = {};
        if (!st.settings.chartParams.ageTrajectory) st.settings.chartParams.ageTrajectory = {};
        const k = el.dataset.key;
        const v = parseFloat(el.value) || 0;
        st.settings.chartParams.ageTrajectory[k] = v;
        if (k === 'careerTransitionSurplus') st.settings.chartParams.ageTrajectory.careerTransitionMonthlySurplus = v;
        await save('fin_settings', st.settings);
      });
    });
  }

  const pts = ageWealthTrajectory({
    currentAge: p.currentAge,
    targetAge:  p.targetAge,
    startNetWorth: currentNetWorth,
    monthlySurplus,
    growthRatePercent: p.growthRatePercent,
    careerTransitionAge: p.careerTransitionAge,
    careerTransitionSurplus: p.careerTransitionSurplus,
  });

  // Milestone annotations
  const milestoneColors = pts.map(pt => {
    if (pt.netWorth >= 1000000) return C.positive;
    if (pt.netWorth >= 100000) return C.info;
    if (pt.netWorth >= 0) return '#fade2a';
    return C.negative;
  });

  if (charts['chart-age-trajectory']) { charts['chart-age-trajectory'].destroy(); delete charts['chart-age-trajectory']; }
  const ctx = document.getElementById('chart-age-trajectory')?.getContext('2d');
  if (!ctx) return;

  charts['chart-age-trajectory'] = new Chart(ctx, {
    type: 'line',
    data: { labels: pts.map(pt => `Age ${pt.age}`), datasets: [{
      label: 'Projected Net Worth',
      data: pts.map(pt => pt.netWorth),
      borderColor: C.info,
      backgroundColor: C.info + '22',
      fill: true,
      tension: 0.35,
      pointRadius: pts.map(pt =>
        (pt.age === p.careerTransitionAge) ||
        (Math.abs(pt.netWorth) < 5000) ||
        (pt.netWorth >= 100000 && pts[pts.indexOf(pt)-1]?.netWorth < 100000) ||
        (pt.netWorth >= 1000000 && pts[pts.indexOf(pt)-1]?.netWorth < 1000000)
          ? 6 : 0
      ),
      pointBackgroundColor: milestoneColors,
      borderWidth: 2,
    }]},
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#252830', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#d9dde2', bodyColor: '#8e9099', padding: 10,
          callbacks: { label: item => ` £${Math.round(item.raw).toLocaleString()}` }
        },
        annotation: undefined,
      },
      scales: {
        x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, maxTicksLimit: 10 } },
        y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, callback: v => '£' + Math.round(v/1000) + 'k' } },
      },
    },
  });
}

function ageTrajField(label, key, value) {
  return `<div class="form-group" style="margin-bottom:0">
    <label class="form-label" style="font-size:11px">${label}</label>
    <input type="number" class="form-input age-traj-field" data-key="${key}" value="${value}" step="any" style="padding:4px 8px;font-size:12px" />
  </div>`;
}

// ── Chart ─────────────────────────────────────────────────────

function renderNwChart(st, surplus, nwProj) {
  const ctx = document.getElementById('chart-nw-timeline')?.getContext('2d');
  if (!ctx) return;
  if (_chart) { _chart.destroy(); }

  const rate  = st.settings?.inrGbpRate || 125;
  const inv   = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = st.debts?.sbi  || {};
  const nw    = calculateNetWorth(inv, st.debts||{sbi:{}}, rate);

  const timeline = projectNetWorthTimeline({
    startDate: new Date().toISOString().slice(0,7)+'-01',
    startNetWorth: nw.netWorth,
    monthlySaving: surplus,
    pensionValue:  inv.pensions?.[0]?.valueGBP || 0,
    pensionMonthly:inv.pensions?.[0]?.monthlyGBP || 0,
    pensionGrowthRate: nwProj.pensionGrowthRate || 7,
    debtOutstandingINR: dbt.outstandingINR || 0,
    debtEmiINR: dbt.emiINR || 34090,
    debtRatePercent: dbt.ratePercent || 9.9,
    inrGbpRate: rate,
    careerTransitionDate: nwProj.careerTransitionDate || null,
    newSalaryGBP: nwProj.newSalaryGBP || null,
    currentSalaryGBP: st.income?.baseSalaryGBP || 28000,
  });

  _chart = new Chart(ctx, {
    type:'line',
    data:{ labels: timeline.map(p=>p.label),
      datasets:[
        { label:'Assets',       data:timeline.map(p=>p.assets),      borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2 },
        { label:'Liabilities',  data:timeline.map(p=>-p.liabilities), borderColor:C.negative, backgroundColor:C.negative+'22', fill:true, tension:0.3, pointRadius:0, borderWidth:2 },
        { label:'Net Worth',    data:timeline.map(p=>p.netWorth),     borderColor:'#ffffff', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:2.5 },
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:800,easing:'easeInOutQuart'},
      plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'#252830',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,titleColor:'#d9dde2',bodyColor:'#8e9099',padding:10} },
      scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
               y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11},callback:v=>'£'+Math.round(v).toLocaleString()}} },
    },
  });
}
