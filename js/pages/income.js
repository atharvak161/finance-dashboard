import { initPage, saveSec } from '../page-init.js';
import { save }        from '../store.js';
import {
  calculateNetPay, applyScheduledChanges, totalExpenses,
  calculateSurplus, fmtGBP, round2
} from '../calc.js';

// Hoisted before top-level await — avoids TDZ errors when render() runs
const C = { info:'#00bfff', teal:'#00e5ff', negative:'#ff1744', positive:'#00e676',
            grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
let _wChart = null;

const state = await initPage('income');
render(state);

function render(st) {
  const inc = st.income || {};
  const pay = calculateNetPay(inc);

  // ── Fields (2-column grid) ─────────────────────────────────
  document.getElementById('income-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
      ${iField('Base salary (£/yr)', 'baseSalaryGBP', inc.baseSalaryGBP)}
      ${iField('Avg overtime gross (£/mo)', 'avgOvertimeGrossGBP', inc.avgOvertimeGrossGBP)}
      ${iField('Hours per week', 'hoursPerWeek', inc.hoursPerWeek)}
      ${iField('Pension employee (%)', 'pensionEmployeeRate', inc.pensionEmployeeRate)}
      ${iField('Pension employer (%)', 'pensionEmployerRate', inc.pensionEmployerRate)}
      ${iField('Tax-free allowance (£/yr)', 'taxFreeAllowanceAnnual', inc.taxFreeAllowanceAnnual)}
      ${iField('Underpayment deduction (£/mo)', 'underpaymentMonthlyGBP', inc.underpaymentMonthlyGBP)}
      <div class="form-group">
        <label class="form-label">Underpayment clears</label>
        <input type="date" class="form-input income-field" data-key="underpaymentClearsDate"
               value="${inc.underpaymentClearsDate||''}" />
      </div>
    </div>`;
  bindFields(st);

  // ── Deductions waterfall ───────────────────────────────────
  document.getElementById('income-deductions').innerHTML = `
    <div class="stat-row"><span class="stat-label">Hourly rate</span><span class="stat-value mono">${fmtGBP(pay.hourlyRate,2)}/hr</span></div>
    <div class="deduction-row"><span class="ded-label">Gross (base)</span><span class="ded-plus">${fmtGBP(pay.grossBase)}</span></div>
    <div class="deduction-row"><span class="ded-label">Overtime</span><span class="ded-plus">+${fmtGBP(inc.avgOvertimeGrossGBP||0)}</span></div>
    <div class="deduction-row"><span class="ded-label">Income Tax (${pay.grossWithOT > 0 ? (pay.incomeTax / pay.grossWithOT * 100).toFixed(1) + '%' : '—'})</span><span class="ded-minus">−${fmtGBP(pay.incomeTax)}</span></div>
    <div class="deduction-row"><span class="ded-label">National Insurance (8%)</span><span class="ded-minus">−${fmtGBP(pay.ni)}</span></div>
    <div class="deduction-row"><span class="ded-label">Pension (${inc.pensionEmployeeRate||0}%)</span><span class="ded-minus">−${fmtGBP(pay.pension)}</span></div>
    <div class="deduction-row"><span class="ded-label">Tax underpayment (1034L)</span><span class="ded-minus">−${fmtGBP(pay.extraTax)}</span></div>
    <div class="deduction-row" style="border-top:1px solid var(--border-medium);font-weight:600">
      <span class="ded-label">Net Take-Home (base)</span><span class="ded-value mono">${fmtGBP(pay.netBase)}</span></div>
    <div class="deduction-row" style="font-weight:600">
      <span class="ded-label">Net Take-Home (w/ OT)</span><span class="ded-value mono">${fmtGBP(pay.netWithOT)}</span></div>
    <div class="deduction-row"><span class="ded-label">Employer pension contrib</span><span class="ded-plus">+${fmtGBP(pay.employerPension)}</span></div>`;

  // ── Scenarios table ────────────────────────────────────────
  const effItems = applyScheduledChanges(st.expenses||{items:[],scheduledChanges:[]});
  const exp      = totalExpenses(effItems);
  document.getElementById('income-scenarios').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Scenario</th><th class="td-right">Gross/yr</th><th class="td-right">Net/mo</th><th class="td-right">Surplus/mo</th></tr></thead>
      <tbody>
        ${[28000,40000,55000,65000].map(sal => {
          const p = calculateNetPay({...inc, baseSalaryGBP:sal, avgOvertimeGrossGBP:0});
          const s = calculateSurplus(p.netBase, exp);
          const isCur = sal === (inc.baseSalaryGBP || 28000);
          return `<tr class="${isCur?'highlight-row':''}">
            <td>${isCur?'Current':('£'+sal.toLocaleString())}</td>
            <td class="td-right mono">${fmtGBP(sal)}</td>
            <td class="td-right mono">${fmtGBP(p.netBase)}</td>
            <td class="td-right mono ${s>=0?'text-positive':'text-negative'}">${fmtGBP(s)}</td></tr>`;
        }).join('')}
      </tbody>
    </table>`;

  renderWaterfallChart(pay, inc);
}

// ── Auto-save ─────────────────────────────────────────────────

function bindFields(st) {
  document.querySelectorAll('.income-field').forEach(el => {
    el.addEventListener('input', () => {
      st.income[el.dataset.key] = el.type === 'number' ? (parseFloat(el.value)||0) : el.value;
    });
    el.addEventListener('change', async () => {
      st.income[el.dataset.key] = el.type === 'number' ? (parseFloat(el.value)||0) : el.value;
      await saveSec('fin_income', st.income);
      render(st);
    });
  });
}

function iField(label, key, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input income-field" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

// ── Chart ─────────────────────────────────────────────────────

function renderWaterfallChart(pay, inc) {
  const ctx = document.getElementById('chart-income-waterfall')?.getContext('2d');
  if (!ctx) return;
  if (_wChart) { _wChart.destroy(); }
  const labels  = ['Gross','+ OT','− Tax','− NI','− Pension','− Underpay','Net'];
  const offset  = [0, pay.grossBase, pay.grossWithOT, pay.grossWithOT-pay.incomeTax, pay.grossWithOT-pay.incomeTax-pay.ni, pay.grossWithOT-pay.incomeTax-pay.ni-pay.pension, 0];
  const bars    = [pay.grossBase, inc.avgOvertimeGrossGBP||0, pay.incomeTax, pay.ni, pay.pension, pay.extraTax, pay.netWithOT];
  const colors  = [C.info, C.teal, C.negative, C.negative, C.negative, C.negative, C.positive];
  _wChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { data:offset, backgroundColor:'transparent', borderWidth:0 },
      { data:bars, backgroundColor:colors, borderRadius:4, borderWidth:0,
        animations:{ y:{ from:0, duration:600, easing:'easeOutQuart' } } },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      animation:{ duration:700, easing:'easeInOutQuart' },
      plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'rgba(9,12,20,0.96)', borderColor:'rgba(0,191,255,0.25)', borderWidth:1,
        filter:i=>i.datasetIndex===1, callbacks:{ label:c=>` £${c.raw.toFixed(0)}` } } },
      scales:{
        x:{ stacked:true, grid:{ color:C.grid, drawBorder:false }, ticks:{ color:C.tick, font:{size:11} } },
        y:{ stacked:true, grid:{ color:C.grid, drawBorder:false }, ticks:{ color:C.tick, font:{size:11}, callback:v=>'£'+v.toFixed(0) } },
      }
    }
  });
}
