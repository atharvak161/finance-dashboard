import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  indiaTripProgress, fmtGBP, fmtPct, round2
} from '../calc.js';

const state = await initPage('goals');
render(state);

function render(st) {
  const goals = st.goals || {};
  const trip  = goals.indiaTrip || {};
  const log   = st.indiaLog || [];
  const prog  = indiaTripProgress(goals);

  // ── India trip fields (2-col grid) ─────────────────────────
  document.getElementById('india-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${indiaField('Target (£)', 'targetGBP', trip.targetGBP)}
      ${indiaField('Saved so far (£)', 'savedGBP', trip.savedGBP)}
      <div class="form-group">
        <label class="form-label">Deadline</label>
        <input type="date" class="form-input india-field" data-key="deadline" value="${trip.deadline||''}" />
      </div>
    </div>
    <div class="stat-row mt-12"><span class="stat-label">Remaining</span><span class="stat-value mono text-warning">${fmtGBP(prog.remaining)}</span></div>
    <div class="stat-row"><span class="stat-label">Days left</span><span class="stat-value mono">${prog.daysLeft} days</span></div>
    <div class="stat-row"><span class="stat-label">Months left</span><span class="stat-value mono">${prog.monthsLeft.toFixed(1)} months</span></div>
    ${prog.remaining>0&&prog.monthsLeft>0?`<div class="stat-row"><span class="stat-label">Needed/mo</span><span class="stat-value mono text-info">${fmtGBP(round2(prog.remaining/prog.monthsLeft))}</span></div>`:''}`;

  // India gauge
  const gaugeVal = document.getElementById('india-gauge-val');
  const gaugeLbl = document.getElementById('india-gauge-lbl');
  if (gaugeVal) gaugeVal.textContent = fmtPct(prog.pct);
  if (gaugeLbl) gaugeLbl.textContent = `${fmtGBP(trip.savedGBP||0)} of ${fmtGBP(trip.targetGBP||3000)}`;

  bindIndiaFields(st);

  // ── Breakdown table ───────────────────────────────────────
  const breakdown = trip.breakdown || [];
  document.getElementById('india-breakdown-table').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Item</th><th>Currency</th><th class="td-right">Amount (₹)</th><th class="td-right">Amount (£)</th><th>Status</th></tr></thead>
      <tbody>
        ${breakdown.map(b=>`<tr>
          <td>${b.item}</td><td>${b.currency}</td>
          <td class="td-right mono">${b.amountINR>0?'₹'+b.amountINR.toLocaleString('en-IN'):'—'}</td>
          <td class="td-right mono">${fmtGBP(b.amountGBP)}</td>
          <td><span class="badge ${b.paid?'badge-paid':'badge-pending'}">${b.paid?'Paid':'Pending'}</span></td>
        </tr>`).join('')}
        <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(breakdown.reduce((s,b)=>s+b.amountGBP,0))}</strong></td><td></td></tr>
      </tbody>
    </table>`;

  // ── Log table ─────────────────────────────────────────────
  document.getElementById('india-log-table').innerHTML = log.length===0
    ? '<p class="label-muted" style="padding:12px">No entries yet. Click + Add month to log savings.</p>'
    : `<table class="data-table">
      <thead><tr><th>Month</th><th class="td-right">Planned (£)</th><th class="td-right">Actual (£)</th><th class="td-right">Running Total</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${log.reduce((acc,r,i)=>{
          const running=round2(log.slice(0,i+1).reduce((s,x)=>s+(x.actualGBP||0),0));
          return acc+`<tr>
            <td class="mono">${r.month}</td>
            <td class="td-right mono">${fmtGBP(r.plannedGBP||0)}</td>
            <td class="td-right mono ${(r.actualGBP||0)>=(r.plannedGBP||0)?'text-positive':'text-warning'}">${fmtGBP(r.actualGBP||0)}</td>
            <td class="td-right mono">${fmtGBP(running)}</td>
            <td style="font-size:12px;color:var(--text-secondary)">${r.note||''}</td>
            <td><button class="btn-icon danger india-log-delete" data-idx="${i}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </button></td>
          </tr>`;
        },'')}
      </tbody>
    </table>`;

  document.querySelectorAll('.india-log-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      st.indiaLog.splice(parseInt(btn.dataset.idx), 1);
      await save('fin_india_log', st.indiaLog);
      render(st);
    });
  });

  document.getElementById('add-india-log-btn').onclick = async () => {
    const month   = prompt('Month (YYYY-MM):', new Date().toISOString().slice(0,7));
    if (!month) return;
    const planned = parseFloat(prompt('Planned saving (£):', '0')||'0');
    const actual  = parseFloat(prompt('Actual saved (£):',   '0')||'0');
    const note    = prompt('Note (optional):', '') || '';
    st.indiaLog.push({ month, plannedGBP:planned, actualGBP:actual, note });
    await save('fin_india_log', st.indiaLog);
    render(st);
  };

  renderCharts(st, log, prog);
}

function indiaField(label, key, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input india-field" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

function bindIndiaFields(st) {
  document.querySelectorAll('.india-field').forEach(el => {
    el.addEventListener('input', () => {
      if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
      const k = el.dataset.key;
      st.goals.indiaTrip[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
    });
    el.addEventListener('change', async () => {
      if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
      const k = el.dataset.key;
      st.goals.indiaTrip[k] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      await save('fin_goals', st.goals);
      render(st);
    });
  });
}

// ── Charts ─────────────────────────────────────────────────────

const C = { info:'#5794f2', positive:'#73bf69', warning:'#ff9830', grid:'rgba(255,255,255,0.06)', tick:'#5c6170' };
const charts = {};
function getCtx(id) { if(charts[id]){charts[id].destroy();delete charts[id];}return document.getElementById(id)?.getContext('2d')||null; }

function renderCharts(st, log, prog) {
  // India gauge
  const ctx0=getCtx('chart-india-gauge');if(ctx0){
    const v=Math.max(0,Math.min(100,prog.pct));const col=v>=80?C.positive:C.warning;
    charts['chart-india-gauge']=new Chart(ctx0,{type:'doughnut',data:{datasets:[{data:[v,100-v,100],backgroundColor:[col,'#252830','transparent'],borderWidth:0,hoverOffset:0}]},options:{responsive:true,maintainAspectRatio:false,rotation:-90,circumference:180,cutout:'72%',animation:{animateRotate:true,duration:1000,easing:'easeInOutCubic'},plugins:{legend:{display:false},tooltip:{enabled:false}}}});
  }
  if (!log.length) return;
  const labels=log.map(r=>r.month);
  const planned=log.map((_,i)=>round2(log.slice(0,i+1).reduce((s,r)=>s+(r.plannedGBP||0),0)));
  const actual=log.map((_,i)=>round2(log.slice(0,i+1).reduce((s,r)=>s+(r.actualGBP||0),0)));
  const base_={responsive:true,maintainAspectRatio:false,animation:{duration:700,easing:'easeInOutQuart'},plugins:{legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}},tooltip:{backgroundColor:'#252830',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,titleColor:'#d9dde2',bodyColor:'#8e9099',padding:10}},scales:{x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11},callback:v=>'£'+v.toFixed(0)}}}};
  const ctxLn=getCtx('chart-india-line');if(ctxLn)charts['chart-india-line']=new Chart(ctxLn,{type:'line',data:{labels,datasets:[{label:'Planned',data:planned,borderColor:C.info,backgroundColor:'transparent',tension:0.3,pointRadius:3,borderWidth:2,borderDash:[4,4]},{label:'Actual',data:actual,borderColor:C.positive,backgroundColor:C.positive+'22',fill:true,tension:0.3,pointRadius:3,borderWidth:2}]},options:base_});
  const ctxBr=getCtx('chart-india-bar');if(ctxBr)charts['chart-india-bar']=new Chart(ctxBr,{type:'bar',data:{labels,datasets:[{label:'Planned (£)',data:log.map(r=>r.plannedGBP||0),backgroundColor:C.info+'cc',borderRadius:4,animations:{y:{from:0,duration:600,easing:'easeOutQuart'}}},{label:'Actual (£)',data:log.map(r=>r.actualGBP||0),backgroundColor:C.positive+'cc',borderRadius:4}]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:v=>'£'+v.toFixed(0)}}}}});
}
