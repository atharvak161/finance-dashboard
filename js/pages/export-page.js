import { initPage }    from '../page-init.js';
import { save, load, initializeDefaults } from '../store.js';
import { processImport } from '../csv-import.js';
import {
  calculateNetPay, generateAmortisation, projectULIP,
  calculateNetWorth, applyScheduledChanges, totalExpenses,
  taxTrackerProgress, fmtGBP, fmtINR, round2,
  ulipValueGBP, ulipPremiumGBP
} from '../calc.js';

const state = await initPage('export');

const TODAY = new Date().toISOString().slice(0,10);
const rate  = state.settings?.inrGbpRate || 83;

// ── Excel export ───────────────────────────────────────────────

document.getElementById('export-excel-btn').addEventListener('click', () => exportExcel(state));

function exportExcel(st) {
  const wb  = XLSX.utils.book_new();
  const inv = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt = st.debts       || { sbi:{} };
  const nw  = calculateNetWorth(inv, dbt, rate);
  const inc = st.income      || {};
  const pay = calculateNetPay(inc);
  const eff = applyScheduledChanges(st.expenses||{items:[],scheduledChanges:[]});
  const exp = totalExpenses(eff);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Finance Dashboard — Overview', `Generated: ${TODAY}`],[],
    ['Net Worth Summary',''],['Total Assets (GBP)', nw.totalAssets],
    ['Total Liabilities (GBP)', -nw.totalDebts],['NET WORTH (GBP)', nw.netWorth],[],
    ['Monthly Summary',''],['Take-Home (w/ OT)', pay.netWithOT],
    ['Total Expenses', exp],['Monthly Surplus', round2(pay.netWithOT - exp)],
  ]), 'Overview');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Income Details',''],['Base Salary (£/yr)', inc.baseSalaryGBP],
    ['Overtime (£/mo)', inc.avgOvertimeGrossGBP||0],['Gross Monthly (base)', pay.grossBase],
    ['Gross Monthly (w/OT)', pay.grossWithOT],['Income Tax', pay.incomeTax],
    ['National Insurance', pay.ni],['Pension (employee)', pay.pension],
    ['Tax Underpayment', pay.extraTax],['Net (base)', pay.netBase],
    ['Net (w/ OT)', pay.netWithOT],['Hourly Rate', pay.hourlyRate],
  ]), 'Income');

  const expRows = [['Name','Category','Monthly (£)','Active']];
  (st.expenses?.items||[]).forEach(i => expRows.push([i.name, i.category, i.monthlyGBP, i.active]));
  expRows.push([],['TOTAL','',exp,'']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Expenses');

  const sbi = dbt.sbi || {};
  const sch = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const debtRows = [['SBI Loan Summary',''],['Outstanding (₹)', sbi.outstandingINR||0],['Rate (%)', sbi.ratePercent||0],['EMI (₹)', sbi.emiINR||0],['Months remaining', sch.length],[],['Month','Interest (₹)','Principal (₹)','Balance (₹)']];
  sch.forEach(r => debtRows.push([r.month, r.interest, r.principal, r.closing]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(debtRows), 'Debts');

  const tt = st.taxTracker || {};
  const prog = taxTrackerProgress(tt);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Tax Tracker',''],['Tax Code', tt.taxCode||''],['Total Underpayment (£)', tt.underpaymentTotal||0],
    ['Monthly Deduction (£)', tt.monthlyDeduction||0],['Collected (£)', prog.collected],
    ['Remaining (£)', prog.remaining],['Progress (%)', prog.pct],
    ['Start Date', tt.startDate||''],['End Date', tt.endDate||''],
  ]), 'Tax Tracker');

  const g = st.goals || {}, trip = g.indiaTrip || {};
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Goals',''],['Emergency Fund Target (£)', g.emergencyFundTargetGBP||0],
    ['Wealth Target (£)', g.wealthTargetGBP||0],['Target Age', g.targetAge||0],[],
    ['India Trip',''],['Target (£)', trip.targetGBP||0],['Saved (£)', trip.savedGBP||0],
    ['Remaining (£)', round2((trip.targetGBP||0)-(trip.savedGBP||0))],['Deadline', trip.deadline||''],
  ]), 'Goals');

  const logRows = [['Month','Net Income (£)','Saved (£)','Expenses (£)','Note']];
  (st.monthlyLog||[]).forEach(r => logRows.push([r.month, r.netGBP||0, r.savedGBP||0, round2((r.netGBP||0)-(r.savedGBP||0)), r.note||'']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logRows), 'Monthly Log');

  XLSX.writeFile(wb, `FinanceDashboard_${TODAY}.xlsx`);
}

// ── JSON backup / import / reset ──────────────────────────────

document.getElementById('data-export-btn')?.addEventListener('click', () => {
  const keys = Object.keys(localStorage).filter(k=>k.startsWith('fin_')||k.startsWith('auth_')||k.startsWith('enc_'));
  const data = {};
  keys.forEach(k => data[k] = localStorage.getItem(k));
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`FinanceDashboard_backup_${TODAY}.json`;
  a.click(); URL.revokeObjectURL(url);
});

document.getElementById('data-import-btn')?.addEventListener('click', () =>
  document.getElementById('data-import-file')?.click()
);
document.getElementById('data-import-file')?.addEventListener('change', async e => {
  const file = e.target.files[0]; if(!file) return;
  const data = JSON.parse(await file.text());
  Object.entries(data).forEach(([k,v]) => localStorage.setItem(k,v));
  alert('Import successful. Reloading...');
  location.reload();
});

document.getElementById('data-reset-btn')?.addEventListener('click', async () => {
  if (!confirm('Reset ALL financial data to defaults? This cannot be undone.')) return;
  await initializeDefaults();
  alert('Data reset to defaults.');
  location.reload();
});

// ── CSV bank statement import ─────────────────────────────────

const FMT_LABEL = { revolut: 'Revolut', monzo: 'Monzo', generic: 'Generic template' };

const csvEl = {
  file:        document.getElementById('csv-import-file'),
  detectMsg:   document.getElementById('csv-detect-msg'),
  previewWrap: document.getElementById('csv-preview-wrap'),
  previewTbl:  document.getElementById('csv-preview-table'),
  reviewBtn:   document.getElementById('csv-review-btn'),
  reviewWrap:  document.getElementById('csv-review-wrap'),
  reviewSum:   document.getElementById('csv-review-summary'),
  reviewTbl:   document.getElementById('csv-review-table'),
  confirmBtn:  document.getElementById('csv-confirm-btn'),
  cancelBtn:   document.getElementById('csv-cancel-btn'),
  resultMsg:   document.getElementById('csv-result-msg'),
};

let csvResult = null; // { format, transactions, unique, duplicates, newLog }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function fmtAmt(n) {
  const sign = n < 0 ? '−' : '+';
  return `${sign}£${Math.abs(n).toFixed(2)}`;
}

function resetCsvUi() {
  csvResult = null;
  [csvEl.previewWrap, csvEl.reviewWrap, csvEl.detectMsg, csvEl.resultMsg]
    .forEach(el => { if (el) el.style.display = 'none'; });
}

if (csvEl.file) {
  csvEl.file.addEventListener('change', async e => {
    const file = e.target.files[0];
    resetCsvUi();
    if (!file) return;

    let text;
    try {
      text = await readFileText(file);
    } catch {
      csvEl.detectMsg.className = 'alert alert-error mt-16';
      csvEl.detectMsg.textContent = 'Could not read the selected file.';
      csvEl.detectMsg.style.display = 'block';
      return;
    }

    const existingLog = (await load('monthlyLog')) || [];
    try {
      csvResult = processImport(text, existingLog);
    } catch (err) {
      csvEl.detectMsg.className = 'alert alert-error mt-16';
      csvEl.detectMsg.textContent = 'Could not parse this CSV. Check the format and try again.';
      csvEl.detectMsg.style.display = 'block';
      return;
    }

    csvEl.detectMsg.className = 'alert alert-info mt-16';
    csvEl.detectMsg.innerHTML =
      `Detected format: <strong>${esc(FMT_LABEL[csvResult.format] || csvResult.format)}</strong> · `
      + `${csvResult.transactions.length} transaction(s) read.`;
    csvEl.detectMsg.style.display = 'block';

    renderPreview(csvResult.transactions.slice(0, 5));
    csvEl.previewWrap.style.display = 'block';
  });
}

function renderPreview(rows) {
  const head = '<thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>';
  const body = rows.map(t =>
    `<tr><td>${esc(t.date)}</td><td>${esc(t.description)}</td>`
    + `<td style="text-align:right">${fmtAmt(t.amountGBP)}</td><td>${esc(t.category)}</td></tr>`
  ).join('');
  csvEl.previewTbl.innerHTML = head + '<tbody>' + body + '</tbody>';
}

csvEl.reviewBtn?.addEventListener('click', () => {
  if (!csvResult) return;
  const { unique, duplicates } = csvResult;
  csvEl.reviewSum.textContent =
    `${unique.length} new transaction(s) found, ${duplicates} duplicate(s) skipped.`;

  const head = '<thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Type</th></tr></thead>';
  const body = unique.map(t =>
    `<tr><td>${esc(t.date)}</td><td>${esc(t.description)}</td>`
    + `<td style="text-align:right">${fmtAmt(t.amountGBP)}</td>`
    + `<td>${esc(t.category)}</td><td>${esc(t.type)}</td></tr>`
  ).join('');
  csvEl.reviewTbl.innerHTML = head + '<tbody>' + body + '</tbody>';

  csvEl.previewWrap.style.display = 'none';
  csvEl.reviewWrap.style.display = 'block';
  // No new rows → disable confirm
  csvEl.confirmBtn.disabled = unique.length === 0;
});

csvEl.confirmBtn?.addEventListener('click', async () => {
  if (!csvResult || csvResult.unique.length === 0) return;
  await save('monthlyLog', csvResult.newLog);
  csvEl.reviewWrap.style.display = 'none';
  csvEl.resultMsg.className = 'alert alert-success mt-16';
  csvEl.resultMsg.textContent =
    `Imported ${csvResult.unique.length} transaction(s), ${csvResult.duplicates} duplicate(s) skipped. Saved to your monthly log.`;
  csvEl.resultMsg.style.display = 'block';
  csvEl.file.value = '';
  csvResult = null;
});

csvEl.cancelBtn?.addEventListener('click', () => {
  resetCsvUi();
  csvEl.file.value = '';
});

// FileReader API — keeps the data strictly on-device.
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
