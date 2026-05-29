import { initPage }    from '../page-init.js';
import { save }        from '../store.js';
import {
  applyScheduledChanges, totalExpenses, expensesByCategory, fmtGBP, round2
} from '../calc.js';

// Hoisted before top-level await — avoids TDZ errors when render() runs
const base = { responsive:true, maintainAspectRatio:false,
  animation:{ duration:700, easing:'easeInOutQuart' },
  plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'rgba(9,12,20,0.96)', borderColor:'rgba(0,191,255,0.25)', borderWidth:1, titleColor:'#00bfff', bodyColor:'#7a96b3', padding:10 } },
  scales:{ x:{ grid:{ color:'rgba(255,255,255,0.06)' }, ticks:{ color:'#3d5473', font:{size:11} } }, y:{ grid:{ color:'rgba(255,255,255,0.06)' }, ticks:{ color:'#3d5473', font:{size:11} } } },
};
const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];
const C = { chart:['#00bfff','#00e676','#ffd600','#ff9100','#ff1744','#d500f9','#00e5ff','#18ffff'],
            info:'#00bfff', teal:'#00e5ff', warning:'#ff9100',
            grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
const charts = {};

const state = await initPage('expenses');
render(state);

// ── Render ─────────────────────────────────────────────────────

function render(st) {
  const expenses  = st.expenses || { items:[], scheduledChanges:[] };
  const effItems  = applyScheduledChanges(expenses);
  const total     = totalExpenses(effItems);
  const today     = new Date().toISOString().slice(0,10);

  // Table
  document.getElementById('expenses-table-wrap').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Category</th><th class="td-right">Monthly</th><th>Active</th><th></th></tr></thead>
      <tbody id="exp-tbody">
        ${expenses.items.map((item,i) => expRow(item, i)).join('')}
        <tr class="total-row">
          <td colspan="2"><strong>Total</strong></td>
          <td class="td-right mono"><strong>${fmtGBP(total)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>`;

  bindExpenseEvents(st);

  // Scheduled changes
  const scList = document.getElementById('scheduled-changes-list');
  scList.innerHTML = expenses.scheduledChanges.length === 0
    ? '<p class="label-muted">No scheduled changes.</p>'
    : `<table class="data-table"><thead><tr><th>Expense</th><th>Date</th><th class="td-right">New Amount</th><th>Note</th></tr></thead><tbody>
      ${expenses.scheduledChanges.map(sc => {
        const item = expenses.items.find(i=>i.id===sc.expenseId);
        const past = sc.changeDate <= today;
        return `<tr><td>${item?.name||sc.expenseId}</td><td class="mono">${sc.changeDate}</td>
          <td class="td-right mono">${fmtGBP(sc.newMonthlyGBP)}</td>
          <td>${sc.note||''} ${past?'<span class="badge badge-positive">Applied</span>':''}</td></tr>`;
      }).join('')}
    </tbody></table>`;

  renderExpenseHeatmap(expenses);
  renderCharts(expenses, effItems);

  // Add expense button
  document.getElementById('add-expense-btn').onclick = async () => {
    st.expenses.items.push({ id:'exp_'+Date.now(), name:'New Expense', category:'Other', monthlyGBP:0, active:true });
    await save('fin_expenses', st.expenses);
    render(st);
  };
}

function expRow(item, i) {
  return `<tr>
    <td><input class="form-input-inline exp-name-input" data-idx="${i}" data-field="name" value="${escHtml(item.name)}" /></td>
    <td>
      <select class="form-select exp-cat-input" data-idx="${i}" data-field="category" style="font-size:12px;padding:3px 6px">
        ${CATS.map(c=>`<option ${c===item.category?'selected':''}>${c}</option>`).join('')}
      </select>
    </td>
    <td class="td-right">
      <input type="number" class="form-input-inline exp-amt-input" data-idx="${i}" data-field="monthlyGBP"
             value="${item.monthlyGBP}" style="text-align:right;width:70px" />
    </td>
    <td><input type="checkbox" class="exp-active-input" data-idx="${i}" data-field="active" ${item.active?'checked':''} /></td>
    <td><button class="btn-icon danger exp-delete-btn" data-idx="${i}" title="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
      </svg>
    </button></td>
  </tr>`;
}

function bindExpenseEvents(st) {
  const save_ = async () => { await save('fin_expenses', st.expenses); render(st); };

  document.querySelectorAll('.exp-name-input, .exp-cat-input, .exp-amt-input').forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.idx);
      const f   = el.dataset.field;
      if (f === 'monthlyGBP') st.expenses.items[idx][f] = parseFloat(el.value)||0;
      else st.expenses.items[idx][f] = el.value;
    });
    el.addEventListener('change', save_);
  });
  document.querySelectorAll('.exp-active-input').forEach(el => {
    el.addEventListener('change', async () => {
      st.expenses.items[parseInt(el.dataset.idx)].active = el.checked;
      await save_;
    });
  });
  document.querySelectorAll('.exp-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      st.expenses.items.splice(parseInt(btn.dataset.idx), 1);
      await save('fin_expenses', st.expenses);
      render(st);
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Expense Heatmap ───────────────────────────────────────────

function renderExpenseHeatmap(expenses) {
  const container = document.getElementById('expense-heatmap');
  if (!container) return;

  const today = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      dateStr: d.toISOString().slice(0, 10),
    };
  });

  const cats = [...new Set(expenses.items.filter(i => i.active).map(i => i.category))].sort();

  const grid = {};
  for (const cat of cats) {
    grid[cat] = months.map(({ dateStr }) => {
      const items = expenses.items.filter(i => i.active && i.category === cat);
      return items.reduce((s, item) => {
        const sc = (expenses.scheduledChanges || []).find(c => c.expenseId === item.id && c.changeDate <= dateStr);
        return s + (sc ? sc.newMonthlyGBP : item.monthlyGBP);
      }, 0);
    });
  }

  const maxByCat = {};
  for (const cat of cats) maxByCat[cat] = Math.max(...grid[cat]);

  let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--font-mono)">';
  html += '<tr><th style="text-align:left;padding:4px 8px;color:var(--text-secondary);white-space:nowrap">Category</th>';
  for (const m of months) html += `<th style="padding:4px 6px;color:var(--text-secondary);min-width:52px">${m.label}</th>`;
  html += '</tr>';

  for (const cat of cats) {
    html += `<tr><td style="padding:4px 8px;color:var(--text-secondary);white-space:nowrap">${cat}</td>`;
    for (let i = 0; i < months.length; i++) {
      const val = grid[cat][i];
      const opacity = maxByCat[cat] > 0 ? 0.15 + (val / maxByCat[cat]) * 0.7 : 0;
      const changed = i > 0 && grid[cat][i] !== grid[cat][i - 1];
      html += `<td style="padding:3px 6px;text-align:right;background:rgba(87,148,242,${opacity.toFixed(2)});border-radius:3px;${changed ? 'outline:1px solid rgba(87,148,242,0.5)' : ''}">${val > 0 ? '£' + Math.round(val) : '—'}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  container.innerHTML = html;
}

// ── Charts ─────────────────────────────────────────────────────

function getCtx(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  return document.getElementById(id)?.getContext('2d') || null;
}

function renderCharts(expenses, effItems) {
  const byCat    = expensesByCategory(effItems);
  const catLabels= Object.keys(byCat);
  const catVals  = Object.values(byCat);

  const ctxDo = getCtx('chart-exp-doughnut');
  if (ctxDo) {
    charts['chart-exp-doughnut'] = new Chart(ctxDo, {
      type:'doughnut',
      data:{ labels:catLabels, datasets:[{ data:catVals, backgroundColor:C.chart, borderWidth:0 }] },
      options:{ ...base, cutout:'65%', scales:{ x:{display:false}, y:{display:false} },
        animation:{ animateRotate:true, animateScale:true, duration:900, easing:'easeInOutBack' },
        plugins:{ ...base.plugins, tooltip:{ ...base.plugins.tooltip, callbacks:{ label:c=>` £${c.raw.toFixed(0)}` } } } },
    });
    const leg = document.getElementById('legend-exp-doughnut');
    if (leg) leg.innerHTML = catLabels.map((l,i)=>`<div class="legend-item"><div class="legend-dot" style="background:${C.chart[i%C.chart.length]}"></div>${l}</div>`).join('');
  }

  const futureCat = expensesByCategory(expenses.items.map(item=>{
    const sc=(expenses.scheduledChanges||[]).find(c=>c.expenseId===item.id);
    return sc?{...item,monthlyGBP:sc.newMonthlyGBP}:item;
  }).filter(i=>i.active));
  const allCats=[...new Set([...catLabels,...Object.keys(futureCat)])];
  const ctxBar = getCtx('chart-exp-bar');
  if (ctxBar) {
    charts['chart-exp-bar'] = new Chart(ctxBar, {
      type:'bar',
      data:{ labels:allCats, datasets:[
        { label:'Current', data:allCats.map(c=>byCat[c]||0), backgroundColor:C.info+'cc', borderRadius:4,
          animations:{ y:{ from:0, duration:600, easing:'easeOutQuart' } } },
        { label:'Post-changes', data:allCats.map(c=>futureCat[c]||0), backgroundColor:C.teal+'cc', borderRadius:4 },
      ]},
      options:{ ...base, plugins:{ ...base.plugins, legend:{ display:true, labels:{ color:C.tick, boxWidth:10, font:{size:11} } } } },
    });
  }

  const today_ = new Date();
  const months12 = Array.from({length:12},(_,i)=>{
    const d=new Date(today_.getFullYear(),today_.getMonth()+i,1);
    return d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
  });
  const monthlyTotals = months12.map((_,i)=>{
    const d=new Date(today_.getFullYear(),today_.getMonth()+i,1);
    const dStr=d.toISOString().slice(0,10);
    const items=expenses.items.map(item=>{
      const sc=(expenses.scheduledChanges||[]).find(c=>c.expenseId===item.id&&c.changeDate<=dStr);
      return sc?{...item,monthlyGBP:sc.newMonthlyGBP}:item;
    });
    return totalExpenses(items.filter(i=>i.active));
  });
  const ctxLn = getCtx('chart-exp-line');
  if (ctxLn) {
    charts['chart-exp-line'] = new Chart(ctxLn, {
      type:'line',
      data:{ labels:months12, datasets:[{ label:'Total Expenses', data:monthlyTotals, borderColor:C.warning, backgroundColor:C.warning+'22', fill:true, tension:0.3, pointRadius:3, borderWidth:2 }] },
      options:{ ...base, scales:{ ...base.scales, y:{ ...base.scales.y, ticks:{ ...base.scales.y.ticks, callback:v=>'£'+v.toFixed(0) } } } },
    });
  }
}
