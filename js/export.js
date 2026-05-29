import {
  calculateNetPay, generateAmortisation, projectULIP,
  calculateNetWorth, applyScheduledChanges, totalExpenses,
  expensesByCategory, taxTrackerProgress, round2,
  ulipValueGBP, ulipPremiumGBP, fmtGBP, fmtINR
} from './calc.js';

const TODAY = new Date().toISOString().slice(0, 10);

export function initExport(state) {
  const btn = document.getElementById('export-excel-btn');
  if (btn) btn.onclick = () => exportExcel(state);

  // PDF buttons per section
  const container = document.getElementById('pdf-section-btns');
  if (container) {
    const sections = [
      {id:'overview', label:'Overview'},
      {id:'income',   label:'Income'},
      {id:'expenses', label:'Expenses'},
      {id:'debts',    label:'Debts'},
      {id:'investments', label:'Investments'},
      {id:'networth', label:'Net Worth Timeline'},
      {id:'india',    label:'India Trip'},
      {id:'tax',      label:'Tax Tracker'},
    ];
    container.innerHTML = sections.map(s =>
      `<button class="btn btn-secondary" data-pdf-sec="${s.id}">${s.label} PDF</button>`
    ).join('');

    container.querySelectorAll('[data-pdf-sec]').forEach(btn => {
      btn.addEventListener('click', () => exportSectionPDF(btn.dataset.pdfSec));
    });
  }

  // Global PDF export handler (used by topbar button)
  window._exportSectionPDF = exportSectionPDF;
}

// ── Section PDF ───────────────────────────────────────────────

async function exportSectionPDF(sectionId) {
  const el = document.getElementById('sec-' + sectionId);
  if (!el) return;

  const wasHidden = !el.classList.contains('active');
  if (wasHidden) el.classList.add('active');

  const canvas = await html2canvas(el, {
    backgroundColor: '#111217',
    scale: 1.5,
    useCORS: true,
    logging: false
  });

  if (wasHidden) el.classList.remove('active');

  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
  const img  = canvas.toDataURL('image/png');
  pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${sectionId.charAt(0).toUpperCase()+sectionId.slice(1)}_${TODAY}.pdf`);
}

// ── Excel workbook ────────────────────────────────────────────

function exportExcel(state) {
  const wb   = XLSX.utils.book_new();
  const rate = state.settings?.inrGbpRate || 125;

  // 1. Overview / Net Worth
  const inv  = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt  = state.debts || { sbi:{} };
  const nw   = calculateNetWorth(inv, dbt, rate);
  const inc  = state.income || {};
  const pay  = calculateNetPay(inc);
  const effItems = applyScheduledChanges(state.expenses||{items:[],scheduledChanges:[]});
  const totalExp  = totalExpenses(effItems);

  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['Finance Dashboard — Overview', `Generated: ${TODAY}`],
      [],
      ['Net Worth Summary',''],
      ['Total Assets (GBP)', nw.totalAssets],
      ['Total Liabilities (GBP)', -nw.totalDebts],
      ['NET WORTH (GBP)', nw.netWorth],
      [],
      ['Monthly Summary',''],
      ['Take-Home (w/ OT)', pay.netWithOT],
      ['Total Expenses', totalExp],
      ['Monthly Surplus', round2(pay.netWithOT - totalExp)],
    ]),
    'Overview'
  );

  // 2. Income
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['Income Details',''],
      ['Base Salary (£/yr)', inc.baseSalaryGBP],
      ['Overtime (£/mo)', inc.avgOvertimeGrossGBP||0],
      ['Gross Monthly (base)', pay.grossBase],
      ['Gross Monthly (w/OT)', pay.grossWithOT],
      ['Income Tax', pay.incomeTax],
      ['National Insurance', pay.ni],
      ['Pension (employee)', pay.pension],
      ['Tax Underpayment', pay.extraTax],
      ['Net (base)', pay.netBase],
      ['Net (w/ OT)', pay.netWithOT],
      ['Hourly Rate', pay.hourlyRate],
    ]),
    'Income'
  );

  // 3. Expenses
  const expRows = [['Name','Category','Monthly (£)','Active']];
  (state.expenses?.items||[]).forEach(i => expRows.push([i.name, i.category, i.monthlyGBP, i.active]));
  expRows.push([],['TOTAL','',totalExp,'']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Expenses');

  // 4. Debts
  const sbi = dbt.sbi || {};
  const sch = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const debtRows = [
    ['SBI Loan Summary',''],
    ['Outstanding (₹)', sbi.outstandingINR||0],
    ['Rate (%)', sbi.ratePercent||0],
    ['EMI (₹)', sbi.emiINR||0],
    ['Extra (₹/mo)', sbi.extraMonthlyINR||0],
    ['Months remaining', sch.length],
    [],
    ['Month','Interest (₹)','Principal (₹)','Balance (₹)']
  ];
  sch.forEach(r => debtRows.push([r.month, r.interest, r.principal, r.closing]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(debtRows), 'Debts');

  // 5. Pension
  const pension = inv.pensions?.[0] || {};
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['Pension',''],
      ['Provider', pension.provider||''],
      ['Current Value (£)', pension.valueGBP||0],
      ['Monthly Contribution (£)', pension.monthlyGBP||0],
      ['Note', pension.note||''],
    ]),
    'Pension'
  );

  // 6. ULIPs
  const ulipRows = [['ULIP','Insurer','Currency','Current Value','Monthly Premium','Lock-in','Pay Term End','Conservative','Expected','Aggressive']];
  (inv.ulips||[]).forEach(u => ulipRows.push([u.name, u.insurer, u.currency, u.currentValue, u.monthlyPremium, u.lockInDate, u.payTermEndDate, u.conservativeRatePercent+'%', u.expectedRatePercent+'%', u.aggressiveRatePercent+'%']));
  const projRows = [[]];
  projRows.push(['ULIP Projections (GBP)','Year 0','Year 5','Year 10','Year 15','Year 20']);
  (inv.ulips||[]).forEach(u => {
    const valueGBP = ulipValueGBP(u, rate);
    const premGBP  = ulipPremiumGBP(u, rate);
    ['conservative','expected','aggressive'].forEach(type => {
      const r = u[type+'RatePercent'];
      const pts = projectULIP(valueGBP, premGBP, r, u.payTermEndDate, u.totalTermYears);
      const row = [u.name+' ('+type+'%)'];
      [0,5,10,15,20].forEach(yr => {
        const pt = pts.find(p=>p.year===yr);
        row.push(u.currency==='INR' ? round2((pt?.value||0)/rate) : pt?.value||0);
      });
      projRows.push(row);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...ulipRows, ...projRows]), 'ULIPs');

  // 7. Goals
  const goals = state.goals || {};
  const trip  = goals.indiaTrip || {};
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['Goals',''],
      ['Emergency Fund Target (£)', goals.emergencyFundTargetGBP||0],
      ['Wealth Target (£)', goals.wealthTargetGBP||0],
      ['Target Age', goals.targetAge||0],
      [],
      ['India Trip',''],
      ['Target (£)', trip.targetGBP||0],
      ['Saved (£)', trip.savedGBP||0],
      ['Remaining (£)', round2((trip.targetGBP||0)-(trip.savedGBP||0))],
      ['Deadline', trip.deadline||''],
    ]),
    'Goals'
  );

  // 8. Monthly Log
  const logRows = [['Month','Net Income (£)','Saved (£)','Expenses (£)','Note']];
  (state.monthlyLog||[]).forEach(r => logRows.push([r.month, r.netGBP||0, r.savedGBP||0, round2((r.netGBP||0)-(r.savedGBP||0)), r.note||'']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logRows), 'Monthly Log');

  // 9. Tax Tracker
  const tt   = state.taxTracker || {};
  const prog = taxTrackerProgress(tt);
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['Tax Tracker',''],
      ['Tax Code', tt.taxCode||''],
      ['Total Underpayment (£)', tt.underpaymentTotal||0],
      ['Monthly Deduction (£)', tt.monthlyDeduction||0],
      ['Collected (£)', prog.collected],
      ['Remaining (£)', prog.remaining],
      ['Progress (%)', prog.pct],
      ['Start Date', tt.startDate||''],
      ['End Date', tt.endDate||''],
    ]),
    'Tax Tracker'
  );

  // 10. India Trip Log
  const indiaRows = [['Month','Planned (£)','Actual (£)','Running Total (£)','Note']];
  let running = 0;
  (state.indiaLog||[]).forEach(r => {
    running = round2(running + (r.actualGBP||0));
    indiaRows.push([r.month, r.plannedGBP||0, r.actualGBP||0, running, r.note||'']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indiaRows), 'India Trip');

  XLSX.writeFile(wb, `FinanceDashboard_${TODAY}.xlsx`);
}
