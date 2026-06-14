import { initPage, saveSec } from '../page-init.js';
import { applyScheduledChanges, fmtGBP } from '../calc.js';

const state = await initPage('calendar');

let viewYear  = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0-indexed
let _calSaveTimer;

document.getElementById('cal-prev').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  render();
});
document.getElementById('cal-next').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
});

render();

function render() {
  const expenses = state.expenses || { items: [], scheduledChanges: [] };
  const effItems = applyScheduledChanges(expenses);
  const activeItems = effItems.filter(i => i.active);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = monthName;

  // Group items by dayOfMonth (default 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const byDay = {};
  let totalMonthly = 0;
  for (const item of activeItems) {
    const day = Math.min(Math.max(parseInt(item.dayOfMonth) || 1, 1), daysInMonth); // cap at actual days in month
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
    totalMonthly += item.monthlyGBP || 0;
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Make Mon=0
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const todayDate = isCurrentMonth ? today.getDate() : -1;

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const headerCells = DAYS.map(d => `<div class="cal-header-cell">${d}</div>`).join('');

  let cells = '';
  // Empty cells before first day
  for (let i = 0; i < startOffset; i++) cells += '<div class="cal-cell cal-cell-empty"></div>';
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const items = byDay[d] || [];
    const dayTotal = items.reduce((s, i) => s + (i.monthlyGBP || 0), 0);
    const isToday = d === todayDate;
    cells += `<div class="cal-cell${isToday ? ' cal-cell-today' : ''}${items.length ? ' cal-cell-has-bills' : ''}">
      <div class="cal-day-num${isToday ? ' cal-today-num' : ''}">${d}</div>
      ${items.map(item => `
        <div class="cal-bill-chip" title="${item.name} — ${fmtGBP(item.monthlyGBP||0)}/mo">
          <span class="cal-bill-name">${item.name}</span>
          <span class="cal-bill-amt mono">${fmtGBP(item.monthlyGBP||0)}</span>
        </div>`).join('')}
      ${dayTotal > 0 ? `<div class="cal-day-total mono">${fmtGBP(dayTotal)}</div>` : ''}
    </div>`;
  }

  // Summary panel below calendar
  const summaryRows = activeItems.map(item => {
    return `<tr>
      <td>${item.name}</td>
      <td><span class="badge badge-neutral" style="font-size:11px">${item.category||'Other'}</span></td>
      <td class="td-right mono">${fmtGBP(item.monthlyGBP||0)}</td>
      <td class="td-right">
        <input type="number" class="form-input" style="width:60px;padding:4px;font-size:12px;text-align:center"
          min="1" max="${daysInMonth}" value="${item.dayOfMonth || 1}"
          data-item-id="${item.id}"
          title="Day of month this bill is due" />
      </td>
    </tr>`;
  }).join('');

  document.getElementById('cal-content').innerHTML = `
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-header">
        <span class="panel-title">${monthName}</span>
        <span class="label-muted">Total: <span class="mono">${fmtGBP(totalMonthly)}/mo</span></span>
      </div>
      <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${headerCells}
        ${cells}
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">Bill Schedule</span><span class="label-muted">Set the day each bill is due (1–31)</span></div>
      ${activeItems.length ? `<table class="data-table">
        <thead><tr><th>Bill</th><th>Category</th><th class="td-right">Monthly</th><th class="td-right">Due day</th></tr></thead>
        <tbody>${summaryRows}</tbody>
        <tfoot><tr class="total-row"><td colspan="2"><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(totalMonthly)}</strong></td><td></td></tr></tfoot>
      </table>` : '<div class="label-muted" style="padding:20px;text-align:center">No active expenses. Add some on the Expenses page.</div>'}
    </div>`;

  // Wire due-day inputs — debounced save
  document.querySelectorAll('[data-item-id]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.itemId;
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const day = Math.min(Math.max(parseInt(input.value) || 1, 1), daysInMonth);
      input.value = day;
      const item = (state.expenses?.items || []).find(i => i.id === id);
      if (item) {
        item.dayOfMonth = day;
        clearTimeout(_calSaveTimer);
        _calSaveTimer = setTimeout(async () => {
          await saveSec('fin_expenses', state.expenses || { items: [], scheduledChanges: [] });
          render(); // re-render calendar with updated positions
        }, 400);
      }
    });
  });
}
