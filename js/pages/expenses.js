import { initPage, saveSec } from '../page-init.js';
import { applyScheduledChanges, totalExpenses, fmtGBP } from '../calc.js';

// Edit-only Expenses page. Charts/heatmap moved to the dashboard.
// Keeps the inline add/edit/delete expense list, adds a monthly-total summary
// card, and a fully editable Scheduled Changes editor.

const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];

const state = await initPage('expenses');
render(state);

// ── Render ─────────────────────────────────────────────────────

function render(st) {
  const expenses  = st.expenses || { items:[], scheduledChanges:[] };
  if (!expenses.scheduledChanges) expenses.scheduledChanges = [];
  const effItems  = applyScheduledChanges(expenses);
  const total     = totalExpenses(effItems);
  const today     = new Date().toISOString().slice(0,10);

  // Summary card — current effective monthly total (read-only)
  document.getElementById('expenses-summary').innerHTML = `
    <div class="grid-3">
      <div class="metric-card">
        <div class="label">Monthly total</div>
        <div class="value mono">${fmtGBP(total)}</div>
        <div class="sub">${expenses.items.filter(i=>i.active).length} active item(s)</div>
      </div>
    </div>`;

  // Expense table (inline add/edit/delete — preserved)
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

  // Scheduled changes editor
  renderScheduledChanges(st, today);

  // Add expense button
  document.getElementById('add-expense-btn').onclick = async () => {
    st.expenses.items.push({ id:'exp_'+Date.now(), name:'New Expense', category:'Other', monthlyGBP:0, active:true });
    await saveSec('fin_expenses', st.expenses);
    render(st);
  };

  // Add scheduled change button
  document.getElementById('add-sc-btn').onclick = async () => {
    const firstItem = st.expenses.items[0];
    st.expenses.scheduledChanges.push({
      expenseId: firstItem ? firstItem.id : '',
      changeDate: today,
      newMonthlyGBP: 0,
      note: '',
    });
    await saveSec('fin_expenses', st.expenses);
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
  const save_ = async () => { await saveSec('fin_expenses', st.expenses); render(st); };

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
      await save_();
    });
  });
  document.querySelectorAll('.exp-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      st.expenses.items.splice(parseInt(btn.dataset.idx), 1);
      await saveSec('fin_expenses', st.expenses);
      render(st);
    });
  });
}

// ── Scheduled changes editor ──────────────────────────────────

function renderScheduledChanges(st, today) {
  const expenses = st.expenses;
  const scList = document.getElementById('scheduled-changes-list');

  if (expenses.scheduledChanges.length === 0) {
    scList.innerHTML = '<p class="label-muted">No scheduled changes. Use “+ Add change” to schedule a future amount change.</p>';
    return;
  }

  scList.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Expense</th><th>Date</th><th class="td-right">New Amount</th><th>Note</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${expenses.scheduledChanges.map((sc, i) => scRow(sc, i, expenses, today)).join('')}
      </tbody>
    </table>`;

  bindScheduledEvents(st);
}

function scRow(sc, i, expenses, today) {
  const past = sc.changeDate <= today;
  return `<tr>
    <td>
      <select class="form-select sc-input" data-idx="${i}" data-field="expenseId" style="font-size:12px;padding:3px 6px">
        ${expenses.items.map(it=>`<option value="${it.id}" ${it.id===sc.expenseId?'selected':''}>${escHtml(it.name)}</option>`).join('')}
      </select>
    </td>
    <td><input type="date" class="form-input-inline sc-input" data-idx="${i}" data-field="changeDate" value="${sc.changeDate||''}" /></td>
    <td class="td-right">
      <input type="number" class="form-input-inline sc-input" data-idx="${i}" data-field="newMonthlyGBP"
             value="${sc.newMonthlyGBP}" style="text-align:right;width:80px" />
    </td>
    <td><input class="form-input-inline sc-input" data-idx="${i}" data-field="note" value="${escHtml(sc.note||'')}" style="width:140px" /></td>
    <td>${past?'<span class="badge badge-positive">Applied</span>':'<span class="label-muted">Pending</span>'}</td>
    <td><button class="btn-icon danger sc-delete-btn" data-idx="${i}" title="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
      </svg>
    </button></td>
  </tr>`;
}

function bindScheduledEvents(st) {
  const save_ = async () => { await saveSec('fin_expenses', st.expenses); render(st); };

  document.querySelectorAll('.sc-input').forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.idx);
      const f   = el.dataset.field;
      st.expenses.scheduledChanges[idx][f] =
        f === 'newMonthlyGBP' ? (parseFloat(el.value)||0) : el.value;
    });
    el.addEventListener('change', save_);
  });

  document.querySelectorAll('.sc-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      st.expenses.scheduledChanges.splice(parseInt(btn.dataset.idx), 1);
      await saveSec('fin_expenses', st.expenses);
      render(st);
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
