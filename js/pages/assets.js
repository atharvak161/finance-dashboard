import { initPage }  from '../page-init.js';
import { save }      from '../store.js';
import {
  projectULIP, ulipValueGBP, ulipPremiumGBP, projectionAtYear,
  fmtGBP, fmtINR, round2
} from '../calc.js';

// Hoisted before top-level await
const C = { info:'#00bfff', positive:'#00e676', warning:'#ff9100', purple:'#d500f9', grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
const charts = {};

const state = await initPage('assets');
render(state);

function render(st) {
  const inv  = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const rate = st.settings?.inrGbpRate || 83;
  const pension = inv.pensions?.[0] || {};
  const cash    = inv.cashAccounts?.[0] || {};

  // ── Pension card ──────────────────────────────────────────
  document.getElementById('pension-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Pension</span><span class="badge badge-positive">Active</span></div>
    <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${pension.provider||'—'}</span></div>
    <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(pension.valueGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly contribution</span><span class="stat-value mono">${fmtGBP(pension.monthlyGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${pension.note||''}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      ${invField('Pension value (£)', 'pensions.0.valueGBP', pension.valueGBP)}
      ${invField('Monthly contribution (£)', 'pensions.0.monthlyGBP', pension.monthlyGBP)}
    </div>`;

  // ── Cash card ─────────────────────────────────────────────
  document.getElementById('cash-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Cash / Savings</span></div>
    <div class="stat-row"><span class="stat-label">${cash.name||'Savings'}</span><span class="stat-value mono">${fmtGBP(cash.balanceGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">AER</span><span class="stat-value mono">${cash.aerPercent||0}%</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${cash.note||''}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      ${invField('Balance (£)', 'cashAccounts.0.balanceGBP', cash.balanceGBP)}
      ${invField('AER (%)', 'cashAccounts.0.aerPercent', cash.aerPercent)}
    </div>`;

  bindInvFields(st);

  // ── ULIP cards ────────────────────────────────────────────
  const ulipSection = document.getElementById('ulip-section');
  ulipSection.innerHTML = inv.ulips.map((u, i) => {
    const valueGBP = ulipValueGBP(u, rate);
    const premGBP  = ulipPremiumGBP(u, rate);
    const c_pts = projectULIP(valueGBP, premGBP, u.conservativeRatePercent, u.payTermEndDate, u.totalTermYears);
    const e_pts = projectULIP(valueGBP, premGBP, u.expectedRatePercent,     u.payTermEndDate, u.totalTermYears);
    const a_pts = projectULIP(valueGBP, premGBP, u.aggressiveRatePercent,   u.payTermEndDate, u.totalTermYears);
    const lockInYr  = round2((new Date(u.lockInDate)    - new Date()) / (365.25*24*3600*1000));
    const payTermYr = round2((new Date(u.payTermEndDate) - new Date()) / (365.25*24*3600*1000));
    return `
      <div class="panel mt-12 ulip-card">
        <div class="ulip-header">
          <div><div class="ulip-name">${u.name}</div><div class="ulip-insurer">${u.insurer} · ${u.currency}</div></div>
          <div style="text-align:right">
            <div class="metric-sm mono">${u.currency==='GBP'?fmtGBP(valueGBP):fmtINR(u.currentValue)}</div>
            <div class="label-muted">${u.currency==='INR'?fmtGBP(valueGBP)+' equiv':''}</div>
          </div>
        </div>
        <div class="grid-2">
          <div>
            <div class="stat-row"><span class="stat-label">Monthly premium</span><span class="stat-value mono">${u.currency==='GBP'?fmtGBP(u.monthlyPremium):fmtINR(u.monthlyPremium)}</span></div>
            <div class="stat-row"><span class="stat-label">Lock-in date</span><span class="stat-value mono">${u.lockInDate}</span></div>
            <div class="stat-row"><span class="stat-label">Pay term ends</span><span class="stat-value mono">${u.payTermEndDate}</span></div>
            <div class="stat-row"><span class="stat-label">Sum assured</span><span class="stat-value mono">${fmtGBP(u.sumAssuredGBP)}</span></div>
          </div>
          <div>
            <table class="data-table" style="font-size:12px">
              <thead><tr><th>Milestone</th><th class="td-right">Conservative</th><th class="td-right">Expected</th><th class="td-right">Aggressive</th></tr></thead>
              <tbody>
                ${[{label:'Lock-in',yr:Math.ceil(lockInYr)},{label:'Pay term',yr:Math.ceil(payTermYr)},{label:'Year 10',yr:10},{label:'Year 20',yr:20}].map(({label,yr})=>{
                  const c=projectionAtYear(c_pts,yr)||0,e=projectionAtYear(e_pts,yr)||0,a=projectionAtYear(a_pts,yr)||0;
                  const fmt=v=>u.currency==='GBP'?fmtGBP(v):fmtINR(v);
                  return `<tr><td>${label}</td><td class="td-right mono">${fmt(c)}</td><td class="td-right mono text-info">${fmt(e)}</td><td class="td-right mono text-positive">${fmt(a)}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="chart-wrap chart-h-200 mt-12"><canvas id="chart-ulip-${u.id}"></canvas></div>
      </div>`;
  }).join('');

  renderCharts(inv, rate);
}

function invField(label, path, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input inv-field" data-path="${path}" value="${value||0}" step="any" />
  </div>`;
}

function bindInvFields(st) {
  document.querySelectorAll('.inv-field').forEach(el => {
    el.addEventListener('input', () => setPath(st.investments, el.dataset.path, parseFloat(el.value)||0));
    el.addEventListener('change', async () => {
      setPath(st.investments, el.dataset.path, parseFloat(el.value)||0);
      await save('fin_investments', st.investments);
      render(st);
    });
  });
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = isNaN(parts[i]) ? parts[i] : parseInt(parts[i]);
    cur = cur[k];
  }
  const last = parts[parts.length-1];
  cur[isNaN(last) ? last : parseInt(last)] = val;
}

// ── Charts ─────────────────────────────────────────────────────

function getCtx(id) { if(charts[id]){charts[id].destroy();delete charts[id];}return document.getElementById(id)?.getContext('2d')||null; }

function renderCharts(inv, rate) {
  const base_ = { responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
    plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'rgba(9,12,20,0.96)',borderColor:'rgba(0,191,255,0.25)',borderWidth:1,titleColor:'#00bfff',bodyColor:'#7a96b3',padding:10} },
    scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}}, y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}} },
  };

  inv.ulips.forEach(u => {
    const vGBP=ulipValueGBP(u,rate),pGBP=ulipPremiumGBP(u,rate);
    const cP=projectULIP(vGBP,pGBP,u.conservativeRatePercent,u.payTermEndDate,u.totalTermYears);
    const eP=projectULIP(vGBP,pGBP,u.expectedRatePercent,u.payTermEndDate,u.totalTermYears);
    const aP=projectULIP(vGBP,pGBP,u.aggressiveRatePercent,u.payTermEndDate,u.totalTermYears);
    const ctx=getCtx('chart-ulip-'+u.id);if(!ctx)return;
    const fmt=v=>u.currency==='GBP'?'£'+Math.round(v).toLocaleString():'₹'+Math.round(v).toLocaleString();
    charts['chart-ulip-'+u.id]=new Chart(ctx,{type:'line',data:{labels:cP.map(p=>`Yr ${p.year}`),datasets:[
      {label:`Conservative ${u.conservativeRatePercent}%`,data:cP.map(p=>p.value),borderColor:C.warning,backgroundColor:'transparent',tension:0.4,pointRadius:0,borderWidth:2,borderDash:[4,4]},
      {label:`Expected ${u.expectedRatePercent}%`,data:eP.map(p=>p.value),borderColor:C.info,backgroundColor:C.info+'22',fill:true,tension:0.4,pointRadius:0,borderWidth:2},
      {label:`Aggressive ${u.aggressiveRatePercent}%`,data:aP.map(p=>p.value),borderColor:C.positive,backgroundColor:'transparent',tension:0.4,pointRadius:0,borderWidth:2,borderDash:[2,2]},
    ]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:fmt}}}}});
  });

  // Combined
  const ctx=getCtx('chart-ulip-combined');if(!ctx||!inv.ulips.length)return;
  const maxYears=Math.max(...inv.ulips.map(u=>u.totalTermYears));
  const yrs=Array.from({length:maxYears+1},(_,i)=>i);
  const combined=yrs.map(yr=>round2(inv.ulips.reduce((s,u)=>{
    const vGBP=ulipValueGBP(u,rate),pGBP=ulipPremiumGBP(u,rate);
    const pts=projectULIP(vGBP,pGBP,u.expectedRatePercent,u.payTermEndDate,u.totalTermYears);
    const pt=pts.find(p=>p.year===yr);
    return s+(pt?pt.value:0);
  },0)));
  charts['chart-ulip-combined']=new Chart(ctx,{type:'line',data:{labels:yrs.map(y=>`Yr ${y}`),datasets:[{label:'Combined ULIPs (£)',data:combined,borderColor:C.purple,backgroundColor:C.purple+'22',fill:true,tension:0.4,pointRadius:2,borderWidth:2}]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:v=>'£'+Math.round(v).toLocaleString()}}}}});
}
