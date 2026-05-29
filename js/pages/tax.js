import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  taxTrackerProgress, fmtGBP, fmtPct, round2
} from '../calc.js';

// Hoisted before top-level await
const C = { positive:'#00e676', warning:'#ff9100', grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
let _chart = null;

const state = await initPage('tax');
render(state);

function render(st) {
  const tt   = st.taxTracker || {};
  const prog = taxTrackerProgress(tt);

  // ── Fields (2-col grid) ───────────────────────────────────
  document.getElementById('tax-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${taxField('Tax code', 'taxCode', tt.taxCode, 'text')}
      ${taxField('Total underpayment (£)', 'underpaymentTotal', tt.underpaymentTotal)}
      ${taxField('Monthly deduction (£)', 'monthlyDeduction', tt.monthlyDeduction)}
      <div class="form-group">
        <label class="form-label">Start date</label>
        <input type="date" class="form-input tax-field" data-key="startDate" value="${tt.startDate||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">End date</label>
        <input type="date" class="form-input tax-field" data-key="endDate" value="${tt.endDate||''}" />
      </div>
    </div>`;
  bindTaxFields(st);

  // ── Progress ──────────────────────────────────────────────
  document.getElementById('tax-progress').innerHTML = `
    <div class="stat-row"><span class="stat-label">Collected so far</span><span class="stat-value mono text-positive">${fmtGBP(prog.collected,2)}</span></div>
    <div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value mono text-warning">${fmtGBP(prog.remaining,2)}</span></div>
    <div class="stat-row"><span class="stat-label">Progress</span><span class="stat-value mono">${fmtPct(prog.pct)}</span></div>
    <div class="stat-row"><span class="stat-label">Months elapsed</span><span class="stat-value mono">${prog.monthsElapsed}</span></div>
    <div class="stat-row"><span class="stat-label">Months remaining</span><span class="stat-value mono">${prog.monthsLeft}</span></div>
    <div class="stat-row"><span class="stat-label">Days until clear</span><span class="stat-value mono">${prog.daysLeft}</span></div>
    <div class="progress-wrap mt-12">
      <div class="progress-label"><span>£0</span><span>${fmtGBP(tt.underpaymentTotal||0)}</span></div>
      <div class="progress-track"><div class="progress-fill positive" style="width:${prog.pct}%"></div></div>
    </div>`;

  // ── Calendar grid ─────────────────────────────────────────
  const grid     = document.getElementById('tax-calendar');
  const start    = new Date(tt.startDate || '2026-04-06');
  const verified = tt.verifiedMonths || [];
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const d   = new Date(start.getFullYear(), start.getMonth()+i, 1);
    const key = d.toISOString().slice(0, 7);
    const isV = verified.includes(key);
    const cell= document.createElement('div');
    cell.className = 'cal-cell' + (isV ? ' verified' : '');
    cell.innerHTML = `<span class="cal-month">${d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})}</span>${isV?'<span class="cal-check">✓</span>':''}`;
    cell.title = isV ? 'Verified' : 'Click to mark verified';
    cell.addEventListener('click', async () => {
      st.taxTracker.verifiedMonths = isV
        ? verified.filter(v=>v!==key)
        : [...verified, key];
      await save('fin_tax_tracker', st.taxTracker);
      render(st);
    });
    grid.appendChild(cell);
  }

  renderTaxChart(tt);
}

function taxField(label, key, value, type='number') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input tax-field" data-key="${key}" value="${value||''}" ${type==='number'?'step="any"':''} />
  </div>`;
}

function bindTaxFields(st) {
  document.querySelectorAll('.tax-field').forEach(el => {
    el.addEventListener('input', () => {
      st.taxTracker[el.dataset.key] = el.type==='number'?(parseFloat(el.value)||0):el.value;
    });
    el.addEventListener('change', async () => {
      st.taxTracker[el.dataset.key] = el.type==='number'?(parseFloat(el.value)||0):el.value;
      await save('fin_tax_tracker', st.taxTracker);
      render(st);
    });
  });
}

// ── Chart ─────────────────────────────────────────────────────

function renderTaxChart(tt) {
  const ctx = document.getElementById('chart-tax-line')?.getContext('2d');
  if (!ctx) return;
  if (_chart) { _chart.destroy(); }
  const start = new Date(tt.startDate || '2026-04-06');
  const labels=[], cumulative=[];
  for (let i=0; i<=12; i++) {
    const d=new Date(start.getFullYear(),start.getMonth()+i,1);
    labels.push(d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}));
    cumulative.push(Math.min(tt.underpaymentTotal||456, round2(i*(tt.monthlyDeduction||38))));
  }
  _chart = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[
      { label:'Collected', data:cumulative, borderColor:C.positive, backgroundColor:C.positive+'22', fill:true, tension:0.3, pointRadius:2, borderWidth:2 },
      { label:'Target', data:Array(13).fill(tt.underpaymentTotal||456), borderColor:C.warning, backgroundColor:'transparent', borderDash:[4,4], pointRadius:0, borderWidth:1.5 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
      plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'rgba(9,12,20,0.96)',borderColor:'rgba(0,191,255,0.25)',borderWidth:1,titleColor:'#00bfff',bodyColor:'#7a96b3',padding:10} },
      scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
               y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11},callback:v=>'£'+v.toFixed(0)}} },
    },
  });
}
