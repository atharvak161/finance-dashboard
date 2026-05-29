import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  generateAmortisation, amortPayoffDate, amortInterestSaved, amortMonthsSaved,
  fmtGBP, fmtINR, fmtMonths, round2
} from '../calc.js';

const state = await initPage('debts');
let amortShowAll = false;
render(state);

// ── Render ─────────────────────────────────────────────────────

function render(st) {
  const sbi  = st.debts?.sbi || {};
  const rate = st.settings?.inrGbpRate || 125;

  // ── Fields (2-col grid) ───────────────────────────────────
  document.getElementById('debt-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
      ${dField('Outstanding (₹)', 'outstandingINR', sbi.outstandingINR)}
      ${dField('Interest rate (%)', 'ratePercent', sbi.ratePercent)}
      ${dField('EMI (₹/mo)', 'emiINR', sbi.emiINR)}
      ${dField('Extra payment (₹/mo)', 'extraMonthlyINR', sbi.extraMonthlyINR)}
      <div class="form-group">
        <label class="form-label">Start date</label>
        <input type="date" class="form-input debt-field" data-key="startDate" value="${sbi.startDate||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Co-applicant</label>
        <input type="text" class="form-input debt-field" data-key="coApplicant" value="${sbi.coApplicant||''}" />
      </div>
    </div>`;
  bindDebtFields(st);

  const sch    = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const gbpOut = round2((sbi.outstandingINR||0) / rate);

  // ── Metrics ───────────────────────────────────────────────
  document.getElementById('debt-metrics').innerHTML = `
    <div class="stat-row"><span class="stat-label">Outstanding (GBP)</span><span class="stat-value mono text-negative">${fmtGBP(gbpOut)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly Interest</span><span class="stat-value mono">${fmtINR(sch[0]?.interest||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly Principal</span><span class="stat-value mono">${fmtINR(sch[0]?.principal||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Remaining months</span><span class="stat-value mono">${fmtMonths(sch.length)}</span></div>
    <div class="stat-row"><span class="stat-label">Payoff date</span><span class="stat-value mono">${amortPayoffDate(sch)}</span></div>
    <div class="stat-row"><span class="stat-label">Total interest remaining</span><span class="stat-value mono text-negative">${fmtINR(sch[sch.length-1]?.totalInterest||0)}</span></div>`;

  // ── Overpayment simulator ─────────────────────────────────
  const curExtra = sbi.extraMonthlyINR || 0;
  document.getElementById('debt-simulator').innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <label class="form-label" style="display:flex;justify-content:space-between">
          Extra monthly payment <span class="mono text-info" id="slider-val">${fmtINR(curExtra)}</span>
        </label>
        <input type="range" class="range-slider" id="overpay-slider" min="0" max="50000" step="1000" value="${curExtra}" style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)"><span>₹0</span><span>₹50,000</span></div>
      </div>
      <div id="simulator-result" style="min-width:220px"></div>
    </div>`;
  updateSimulator(sbi, curExtra);
  document.getElementById('overpay-slider').addEventListener('input', e => {
    const extra = parseInt(e.target.value);
    document.getElementById('slider-val').textContent = fmtINR(extra);
    updateSimulator(sbi, extra);
  });

  // ── Comparison table ──────────────────────────────────────
  const comparisons = [0,10000,20000,35000].map(extra => {
    const s = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, extra);
    return { extra, months:s.length, payoff:amortPayoffDate(s),
             saved:amortInterestSaved(sch,s), monthsSaved:amortMonthsSaved(sch,s) };
  });
  document.getElementById('debt-compare-wrap').innerHTML = `
    <table class="compare-table">
      <thead><tr><th>Extra/mo</th><th>Months</th><th>Payoff</th><th>Interest Saved</th><th>Months Saved</th></tr></thead>
      <tbody>
        ${comparisons.map((c,i)=>`<tr class="${i===0?'current-row':''} ${i===3?'best-row':''}">
          <td>${c.extra===0?'Current (no extra)':fmtINR(c.extra)}</td>
          <td class="mono">${fmtMonths(c.months)}</td>
          <td class="mono">${c.payoff}</td>
          <td class="mono text-positive">${c.saved>0?fmtINR(c.saved):'—'}</td>
          <td class="mono text-positive">${c.monthsSaved>0?fmtMonths(c.monthsSaved):'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  renderAmortTable(sch);
  document.getElementById('amort-toggle-btn').onclick = () => {
    amortShowAll = !amortShowAll;
    renderAmortTable(sch);
    document.getElementById('amort-toggle-btn').textContent = amortShowAll ? 'Show less' : 'Show all';
  };

  renderDebtCharts(sbi);
}

function updateSimulator(sbi, extra) {
  const base_ = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, 0);
  const with_  = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, extra);
  document.getElementById('simulator-result').innerHTML = extra===0 ? '' : `
    <div class="stat-row"><span class="stat-label">New payoff</span><span class="stat-value mono">${amortPayoffDate(with_)}</span></div>
    <div class="stat-row"><span class="stat-label">Months saved</span><span class="stat-value mono text-positive">${fmtMonths(amortMonthsSaved(base_,with_))}</span></div>
    <div class="stat-row"><span class="stat-label">Interest saved</span><span class="stat-value mono text-positive">${fmtINR(amortInterestSaved(base_,with_))}</span></div>`;
}

function renderAmortTable(sch) {
  const PREVIEW = 24;
  const rows = amortShowAll ? sch : sch.slice(0, PREVIEW);
  const milestones = [Math.floor(sch.length*0.25), Math.floor(sch.length*0.5), Math.floor(sch.length*0.75)];
  document.getElementById('amort-table-wrap').innerHTML = `
    <table class="data-table">
      <thead><tr><th>#</th><th class="td-right">Interest</th><th class="td-right">Principal</th><th class="td-right">Balance</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr class="${milestones.includes(r.month)?'milestone':''}">
          <td>${r.month}</td>
          <td class="td-right mono">${fmtINR(r.interest)}</td>
          <td class="td-right mono">${fmtINR(r.principal)}</td>
          <td class="td-right mono">${fmtINR(r.closing)}</td>
        </tr>`).join('')}
        ${!amortShowAll&&sch.length>PREVIEW?`<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px">… ${sch.length-PREVIEW} more rows</td></tr>`:''}
      </tbody>
    </table>`;
}

// ── Auto-save ─────────────────────────────────────────────────

function bindDebtFields(st) {
  document.querySelectorAll('.debt-field').forEach(el => {
    el.addEventListener('input', () => {
      if (!st.debts.sbi) st.debts.sbi = {};
      const k = el.dataset.key;
      st.debts.sbi[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
    });
    el.addEventListener('change', async () => {
      if (!st.debts.sbi) st.debts.sbi = {};
      const k = el.dataset.key;
      st.debts.sbi[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      await save('fin_debts', st.debts);
      render(st);
    });
  });
}

function dField(label, key, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input debt-field" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

// ── Charts ─────────────────────────────────────────────────────

const C = { negative:'#f2495c', positive:'#73bf69', info:'#5794f2', grid:'rgba(255,255,255,0.06)', tick:'#5c6170' };
const charts = {};
function getCtx(id) { if(charts[id]){charts[id].destroy();delete charts[id];}return document.getElementById(id)?.getContext('2d')||null; }

function renderDebtCharts(sbi) {
  const sch    = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, 0);
  const schEx  = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const base_  = { responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
    plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'#252830',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,titleColor:'#d9dde2',bodyColor:'#8e9099',padding:10} },
    scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}}, y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}} },
  };
  const years = Math.min(Math.ceil(sch.length/12),10);
  const yLabels = Array.from({length:years},(_,i)=>`Yr ${i+1}`);
  const annI=[],annP=[];
  for(let y=0;y<years;y++){const sl=sch.slice(y*12,(y+1)*12);annI.push(round2(sl.reduce((s,r)=>s+r.interest,0)/1000));annP.push(round2(sl.reduce((s,r)=>s+r.principal,0)/1000));}
  const ctxStk=getCtx('chart-debt-stacked');
  if(ctxStk){charts['chart-debt-stacked']=new Chart(ctxStk,{type:'bar',data:{labels:yLabels,datasets:[
    {label:'Interest (₹k)',data:annI,backgroundColor:C.negative+'cc',borderRadius:3,animations:{y:{from:0,duration:600,easing:'easeOutQuart'}}},
    {label:'Principal (₹k)',data:annP,backgroundColor:C.positive+'cc',borderRadius:3},
  ]},options:{...base_,scales:{x:{stacked:true,grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},y:{stacked:true,grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}}}}});}
  const step=Math.max(1,Math.floor(sch.length/24));
  const lnLbls=sch.filter((_,i)=>i%step===0).map(r=>`M${r.month}`);
  const balBase=sch.filter((_,i)=>i%step===0).map(r=>round2(r.closing/100000));
  const balEx=schEx.filter((_,i)=>i%step===0).map(r=>round2(r.closing/100000));
  while(balEx.length<balBase.length)balEx.push(0);
  const ctxLn=getCtx('chart-debt-line');
  if(ctxLn){charts['chart-debt-line']=new Chart(ctxLn,{type:'line',data:{labels:lnLbls,datasets:[
    {label:'Base EMI',data:balBase,borderColor:C.negative,backgroundColor:C.negative+'22',fill:true,tension:0.3,pointRadius:0,borderWidth:2},
    {label:`+₹${sbi.extraMonthlyINR||0}/mo`,data:balEx,borderColor:C.positive,backgroundColor:C.positive+'11',fill:true,tension:0.3,pointRadius:0,borderWidth:2},
  ]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:v=>'₹'+v+'L'}}}}});}
}
