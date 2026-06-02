import { initPage, saveSec } from '../page-init.js';
import { save }      from '../store.js';
import {
  taxTrackerProgress, fmtGBP, fmtPct, fmtINR, round2,
  calc80EDeduction, calcNetIndiaTax, calcCrossBorderPosition, calcITRDeadline
} from '../calc.js';

// Hoisted before top-level await
const C = { positive:'#00e676', warning:'#ff9100', grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
let _chart = null;

const state = await initPage('tax');
render(state);
renderIndia(state);

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
      await saveSec('fin_tax_tracker', st.taxTracker);
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
      await saveSec('fin_tax_tracker', st.taxTracker);
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

// ════════════════════════════════════════════════════════════
// India NRI Tax Module (CA Arjun Mehta approved, spec v1.1)
// ════════════════════════════════════════════════════════════

const ITR_TODAY = new Date().toISOString().slice(0, 10);

// Defensive accessor — old saved data won't have fin_india_tax fields.
function itState(st) {
  const it = st.indiaTax || (st.indiaTax = {});
  it.sec80E      = it.sec80E      || {};
  it.itr         = it.itr         || {};
  it.dtaa        = it.dtaa        || {};
  it.crossBorder = it.crossBorder || {};
  return it;
}

function renderIndia(st) {
  if (!document.getElementById('india-income-fields')) return; // page without India section
  const it = itState(st);

  // AY label in divider
  const ayLabel = document.getElementById('india-ay-label');
  if (ayLabel) ayLabel.textContent = it.assessmentYear || 'AY 2025-26';

  renderIndiaIncome(st, it);
  renderIndiaTds(st, it);
  renderIndia80E(st, it);
  renderIndiaDtaa(st, it);
  renderIndiaItr(st, it);
  renderIndiaSummaryCards(st, it);
  renderSurchargeBanner(it);
}

// ── Small field builders ─────────────────────────────────────
function inrField(label, key, value, help = '') {
  return `<div class="form-group">
    <label class="form-label" for="india-${key}">${label}</label>
    <input id="india-${key}" type="number" step="any" min="0" class="form-input india-field" data-key="${key}" value="${value || ''}" placeholder="0" />
    ${help ? `<div class="field-help">${help}</div>` : ''}
    <div class="field-error" id="india-err-${key}"></div>
  </div>`;
}
function txtField(label, key, value, placeholder = '', help = '') {
  return `<div class="form-group">
    <label class="form-label" for="india-${key}">${label}</label>
    <input id="india-${key}" type="text" class="form-input india-field" data-key="${key}" value="${value || ''}" placeholder="${placeholder}" />
    ${help ? `<div class="field-help">${help}</div>` : ''}
  </div>`;
}
function dateField(label, key, value, help = '') {
  return `<div class="form-group">
    <label class="form-label" for="india-${key}">${label}</label>
    <input id="india-${key}" type="date" class="form-input india-field" data-key="${key}" value="${value || ''}" max="${ITR_TODAY}" />
    ${help ? `<div class="field-help">${help}</div>` : ''}
  </div>`;
}
function selField(label, key, value, opts, help = '') {
  const o = opts.map(([v, t]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="form-group">
    <label class="form-label" for="india-${key}">${label}</label>
    <select id="india-${key}" class="form-select india-field" data-key="${key}">${o}</select>
    ${help ? `<div class="field-help">${help}</div>` : ''}
  </div>`;
}
function checkRow(label, key, checked) {
  return `<label class="form-check-row" for="india-${key}">
    <input id="india-${key}" type="checkbox" class="india-field" data-key="${key}" ${checked ? 'checked' : ''} />
    <span>${label}</span>
  </label>`;
}

// ── 2.4 Income sources ───────────────────────────────────────
function renderIndiaIncome(st, it) {
  const showNote = (it.otherIndiaIncomeINR || 0) > 0;
  document.getElementById('india-income-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${txtField('Assessment Year', 'assessmentYear', it.assessmentYear, 'AY 2025-26', 'Financial year runs Apr–Mar')}
      ${selField('Tax Regime', 'taxRegime', it.taxRegime || 'old', [
        ['old', 'Old Regime (with deductions)'],
        ['new', 'New Regime (flat slabs)'],
      ], 'Old regime: 80E available. New regime: flat slabs, no deductions')}
      ${inrField('NRO Interest Income (₹)', 'nroInterestIncomeINR', it.nroInterestIncomeINR,
        'Annual interest credited in NRO accounts. NRE account interest is tax-exempt u/s 10(4)(ii) IT Act 1961 and should NOT be included here.')}
      ${inrField('Rental Income — India (₹)', 'rentalIncomeINR', it.rentalIncomeINR,
        'Gross annual rent received from Indian property. A 30% standard deduction u/s 24(a) is applied automatically before slab calculation.')}
      ${inrField('Dividend Income — India (₹)', 'dividendIncomeINR', it.dividendIncomeINR,
        'From Indian equities or mutual funds. Taxed at flat 20% + 4% cess u/s 115A — not at slab rates. Calculated separately.')}
      ${inrField('Other India Income (₹)', 'otherIndiaIncomeINR', it.otherIndiaIncomeINR, 'Specify below')}
      ${showNote ? txtField('Description of other income', 'otherIndiaIncomeNote', it.otherIndiaIncomeNote, 'e.g. commission, royalty') : ''}
    </div>`;
  bindIndiaFields(st, it, 'india-income-fields');
}

// ── 2.5 TDS ──────────────────────────────────────────────────
function renderIndiaTds(st, it) {
  const totalTds = (it.tdsOnNroInterestINR || 0) + (it.tdsOnRentalINR || 0) +
                   (it.tdsOnDividendINR || 0) + (it.tdsOtherINR || 0);
  document.getElementById('india-tds-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${inrField('TDS on NRO Interest (₹)', 'tdsOnNroInterestINR', it.tdsOnNroInterestINR, 'Cannot exceed NRO interest income')}
      ${inrField('TDS on Rental Income (₹)', 'tdsOnRentalINR', it.tdsOnRentalINR, 'Cannot exceed rental income')}
      ${inrField('TDS on Dividends (₹)', 'tdsOnDividendINR', it.tdsOnDividendINR, 'Cannot exceed dividend income')}
      ${inrField('Other TDS Deducted (₹)', 'tdsOtherINR', it.tdsOtherINR, 'Any other TDS from Form 26AS')}
    </div>
    <div class="stat-row mt-12"><span class="stat-label">Total TDS Deducted</span>
      <span class="stat-value mono text-positive">${fmtINR(totalTds)}</span></div>
    <div class="india-note">Verify TDS amounts against your Form 26AS / AIS on the Income Tax portal. The 30% TDS rate applicable to NRIs is higher than the 10% rate for residents.</div>`;
  bindIndiaFields(st, it, 'india-tds-fields');
  validateTds(it);
}

// ── 2.6 Section 80E ──────────────────────────────────────────
function renderIndia80E(st, it) {
  const s = it.sec80E;
  const newRegime = (it.taxRegime || 'old') !== 'old';
  const claiming = !!s.claimingDeduction;
  const used = s.deductionYearsUsed || 0;
  const remaining = Math.max(0, 8 - used);
  const exhausted = used >= 8;
  const { deductionINR, taxSavingINR } = calc80EDeduction(it);

  const panel = document.getElementById('india-80e-panel');
  if (panel) panel.classList.toggle('panel-disabled', newRegime);

  const inputs = claiming ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" class="mt-12">
      ${txtField('Lender Name', 'sec80E.lenderName', s.lenderName, 'SBI', 'Must be an approved financial institution or employer')}
      ${selField('Loan Holder', 'sec80E.loanHolder', s.loanHolder || 'self', [
        ['self', 'Self'], ['spouse', 'Spouse'], ['child', 'Child'],
        ['student_for_whom_legal_guardian', 'Student (legal guardian)'],
      ])}
      ${inrField('Annual Interest Paid (₹)', 'sec80E.annualInterestPaidINR', s.annualInterestPaidINR, 'From SBI annual interest certificate')}
      ${txtField('First AY of claim', 'sec80E.deductionAY1', s.deductionAY1, 'AY 2023-24',
        'Year 1 is the Assessment Year in which you made your first interest payment to the lender. If your bank capitalised interest during the moratorium and you paid nothing, Year 1 starts from the AY in which repayment EMIs began. Check your SBI loan statement — the date of your first interest payment determines Year 1.')}
      ${inrField('Years of deduction used', 'sec80E.deductionYearsUsed', s.deductionYearsUsed, 'Integer 0–8')}
    </div>` : '';

  const remainingBadge = remaining <= 1
    ? `<span class="badge badge-warning">${remaining} left</span>`
    : `<span class="badge badge-info">${remaining}</span>`;

  document.getElementById('india-80e-fields').innerHTML = `
    ${newRegime ? `<div class="india-banner warning">Section 80E deduction is not available under the New Tax Regime.</div>` : ''}
    ${checkRow('I am claiming Section 80E deduction this year.', 'sec80E.claimingDeduction', claiming)}
    ${inputs}
    ${exhausted ? `<div class="india-banner danger mt-12">The 8-year Section 80E deduction window has been exhausted. This deduction cannot be claimed for this AY.</div>` : ''}
    <div class="mt-12">
      <div class="stat-row"><span class="stat-label">Years remaining</span><span class="stat-value mono">${remainingBadge}</span></div>
      <div class="stat-row"><span class="stat-label">Deduction claimed this AY</span><span class="stat-value mono text-positive">${fmtINR(deductionINR)}</span></div>
      <div class="stat-row"><span class="stat-label">Tax saving (old regime)</span><span class="stat-value mono text-positive">${fmtINR(taxSavingINR)}</span></div>
    </div>
    <div class="india-note">Section 80E allows deduction of the full interest paid on an education loan taken from an approved lender for higher education of self, spouse, child, or a student for whom you are the legal guardian. There is no cap on the deduction amount. The deduction is available for a maximum of 8 consecutive Assessment Years beginning from the year you start repaying interest. The principal EMI is not deductible.</div>`;
  bindIndiaFields(st, it, 'india-80e-fields');
}

// ── 2.7 DTAA ─────────────────────────────────────────────────
function renderIndiaDtaa(st, it) {
  const d = it.dtaa;
  const rate = st.settings?.inrGbpRate || st.profile?.inrGbpRate || 0; // safeRate() in calc layer handles zero
  const claiming = !!d.dtaaReliefClaimed;
  const net = calcNetIndiaTax(it);
  const cb = calcCrossBorderPosition(it, rate);
  const ukInrEquiv = round2((d.ukTaxPaidOnIndiaIncomeGBP || 0) * (d.rbiRateUsed || 0));
  const form67Late = d.form67FilingDate && it.itr?.filingDate && d.form67FilingDate > it.itr.filingDate;

  const conditional = claiming ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" class="mt-12">
      ${inrFieldGBP('UK Tax Paid on India Income (£)', 'dtaa.ukTaxPaidOnIndiaIncomeGBP', d.ukTaxPaidOnIndiaIncomeGBP, 'From SA106 working — portion of UK tax on Indian income')}
      ${inrField('DTAA Relief Claimed in ITR (₹)', 'dtaa.dtaaReliefClaimedINR', d.dtaaReliefClaimedINR, 'As per Form 67 filed with ITR')}
      ${inrFieldGBP('RBI Rate Used (₹/£)', 'dtaa.rbiRateUsed', d.rbiRateUsed, 'RBI TT buying rate on the date of payment (Rule 128(3)). Source: SBI historical treasury rates. Do not use the market rate from Settings.')}
      ${checkRow('Form 67 Filed?', 'dtaa.form67Filed', !!d.form67Filed)}
      ${dateField('Form 67 Filing Date', 'dtaa.form67FilingDate', d.form67FilingDate, 'Must be on or before the ITR filing date')}
    </div>
    ${form67Late ? `<div class="india-banner danger mt-8">Form 67 filing date is after the ITR filing date. The foreign tax credit may be disallowed.</div>` : ''}
    <div class="mt-12">
      <div class="stat-row"><span class="stat-label">UK Tax on India Income (₹ equiv)</span><span class="stat-value mono">${fmtINR(ukInrEquiv)}</span></div>
      <div class="stat-row"><span class="stat-label">Net India Tax Position</span><span class="stat-value mono ${net.netPayableINR > 0 ? 'text-warning' : 'text-positive'}">${fmtINR(net.netPayableINR)}</span></div>
      <div class="stat-row"><span class="stat-label">Cross-Border Net Tax (£)</span><span class="stat-value mono">${fmtGBP(cb.totalCrossBorderGBP, 2)}</span></div>
    </div>` : '';

  document.getElementById('india-dtaa-fields').innerHTML = `
    ${checkRow('Claiming DTAA relief in India ITR?', 'dtaa.dtaaReliefClaimed', claiming)}
    ${conditional}
    <div class="india-banner info mt-12">Form 67 must be filed on or before the ITR filing due date (31 July for non-audit cases). Filing Form 67 after the due date will result in disallowance of the foreign tax credit, even if your ITR is filed on time. Verify the RBI TT buying rate applicable to the date the UK tax was paid — do not use the fin_settings exchange rate, which is a market rate.</div>`;
  bindIndiaFields(st, it, 'india-dtaa-fields');
}

// GBP-denominated number field (no min:0 clamp note about INR income)
function inrFieldGBP(label, key, value, help = '') {
  return `<div class="form-group">
    <label class="form-label" for="india-${key}">${label}</label>
    <input id="india-${key}" type="number" step="any" min="0" class="form-input india-field" data-key="${key}" value="${value || ''}" placeholder="0" />
    ${help ? `<div class="field-help">${help}</div>` : ''}
  </div>`;
}

// ── 2.8 ITR status ───────────────────────────────────────────
function renderIndiaItr(st, it) {
  const r = it.itr;
  const filed = r.filingStatus === 'filed';
  const refund = !!r.refundDue;
  const notice = !!r.noticeReceived;

  document.getElementById('india-itr-fields').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${selField('Filing Status', 'itr.filingStatus', r.filingStatus || 'not_filed', [
        ['not_filed', 'Not filed'], ['filed', 'Filed'], ['not_required', 'Not required'],
      ])}
      ${selField('ITR Form', 'itr.itrFormNumber', r.itrFormNumber || 'ITR-2', [
        ['ITR-1', 'ITR-1'], ['ITR-2', 'ITR-2'], ['ITR-3', 'ITR-3'], ['ITR-4', 'ITR-4'],
      ], 'NRIs with income beyond salary and one house property must file ITR-2. Business income → ITR-3. ITR-1 (Sahaj) is not available to NRIs.')}
      ${filed ? dateField('Filing Date', 'itr.filingDate', r.filingDate) : ''}
      ${filed ? txtField('Acknowledgement Number', 'itr.acknowledgementNumber', r.acknowledgementNumber, '15 digits') : ''}
    </div>
    ${checkRow('Is this an audit case?', 'itr.isAuditCase', !!r.isAuditCase)}
    ${checkRow('Refund expected?', 'itr.refundDue', refund)}
    ${refund ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${inrField('Refund Amount (₹)', 'itr.refundAmountINR', r.refundAmountINR)}
      ${dateField('Refund Received Date', 'itr.refundReceivedDate', r.refundReceivedDate)}
    </div>` : ''}
    ${checkRow('Income Tax Notice Received (India)?', 'itr.noticeReceived', notice)}
    ${notice ? `<div class="form-group">
      <label class="form-label" for="india-itr.noticeDetails">Notice Details</label>
      <textarea id="india-itr.noticeDetails" class="form-input india-field" data-key="itr.noticeDetails" rows="2">${r.noticeDetails || ''}</textarea>
    </div>` : ''}
    <div class="field-help">Has the Income Tax Department of India issued any notice, intimation (u/s 143(1)), or scrutiny notice (u/s 143(2)) regarding this ITR?</div>`;
  bindIndiaFields(st, it, 'india-itr-fields');

  // Right-side status badge + deadline
  const dl = calcITRDeadline({ ...r, assessmentYear: r.assessmentYear || it.assessmentYear }, ITR_TODAY);
  let cls = 'grey', text = 'NOT REQUIRED';
  if (dl.alertState === 'filed') { cls = 'green'; text = `FILED — ${r.filingDate || ''}`; }
  else if (dl.alertState === 'not_required') { cls = 'grey'; text = 'NOT REQUIRED'; }
  else if (dl.alertState === 'overdue') { cls = 'red'; text = `OVERDUE — deadline was ${dl.deadlineLabel}`; }
  else { cls = 'amber'; text = `NOT YET FILED — ${dl.daysToDeadline} days to deadline`; }

  const detail = (dl.alertState === 'ok' || dl.alertState === 'warning' || dl.alertState === 'overdue')
    ? `<div class="stat-row mt-12"><span class="stat-label">Filing deadline</span><span class="stat-value mono">${dl.deadlineLabel}</span></div>
       <div class="stat-row"><span class="stat-label">Days remaining</span><span class="stat-value mono ${dl.daysToDeadline < 0 ? 'text-warning' : ''}">${dl.daysToDeadline}</span></div>`
    : '';

  document.getElementById('india-itr-status').innerHTML = `
    <div class="itr-status-badge ${cls}" role="status" aria-label="${text}">${text}</div>${detail}`;
}

// ── 2.3 Summary cards ────────────────────────────────────────
function renderIndiaSummaryCards(st, it) {
  const net = calcNetIndiaTax(it);
  const totalTds = net.totalTdsINR;
  const { deductionINR } = calc80EDeduction(it);
  const dl = calcITRDeadline({ ...it.itr, assessmentYear: it.itr?.assessmentYear || it.assessmentYear }, ITR_TODAY);

  let deadlineVal, deadlineCls, deadlineSub;
  if (dl.alertState === 'filed') { deadlineVal = 'Filed'; deadlineCls = 'positive'; deadlineSub = 'ITR submitted'; }
  else if (dl.alertState === 'not_required') { deadlineVal = '—'; deadlineCls = 'positive'; deadlineSub = 'Not required'; }
  else if (dl.alertState === 'overdue') { deadlineVal = 'Overdue'; deadlineCls = 'negative'; deadlineSub = `was ${dl.deadlineLabel}`; }
  else { deadlineVal = dl.daysToDeadline + 'd'; deadlineCls = dl.alertState === 'warning' ? 'warning' : 'positive'; deadlineSub = `to ${dl.deadlineLabel}`; }

  const netCls = net.netPayableINR > 0 ? 'warning' : 'positive';

  document.getElementById('india-summary-cards').innerHTML = [
    card('Total India Gross Income', fmtINR(net.grossIndiaIncomeINR), 'neutral', 'NRO + rental + dividend + other'),
    card('Total TDS Deducted', fmtINR(totalTds), 'positive', 'Credit toward your liability'),
    card('Section 80E Deduction', fmtINR(deductionINR), 'positive', it.taxRegime === 'old' ? 'Education loan interest' : 'New regime — n/a'),
    card('Net India Tax Payable', fmtINR(net.netPayableINR), netCls, 'After TDS & DTAA relief'),
    card('ITR Deadline', deadlineVal, deadlineCls, deadlineSub),
  ].join('');
}

function card(label, value, color, sub) {
  const cls = color === 'positive' ? 'text-positive' : color === 'negative' ? 'text-negative'
            : color === 'warning' ? 'text-warning' : '';
  return `<div class="metric-card"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

// ── Surcharge banner (income > ₹50L) ─────────────────────────
function renderSurchargeBanner(it) {
  const el = document.getElementById('india-surcharge-banner');
  if (!el) return;
  const net = calcNetIndiaTax(it);
  el.innerHTML = net.surchargeWarning
    ? `<div class="india-banner warning">Your total Indian income exceeds ₹50 lakh. Surcharge applies and is not calculated here. Consult your CA for the correct tax liability.</div>`
    : '';
}

// ── TDS validation (cannot exceed corresponding income) ──────
function validateTds(it) {
  const checks = [
    ['tdsOnNroInterestINR', it.nroInterestIncomeINR || 0, 'NRO interest income'],
    ['tdsOnRentalINR', it.rentalIncomeINR || 0, 'rental income'],
    ['tdsOnDividendINR', it.dividendIncomeINR || 0, 'dividend income'],
  ];
  for (const [key, cap, name] of checks) {
    const err = document.getElementById('india-err-' + key);
    if (!err) continue;
    err.textContent = (it[key] || 0) > cap ? `TDS exceeds ${name} (${fmtINR(cap)}).` : '';
  }
}

// ── Generic nested binder ────────────────────────────────────
// Supports dotted data-key paths (e.g. 'sec80E.annualInterestPaidINR').
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function bindIndiaFields(st, it, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.india-field').forEach(el => {
    const handler = async () => {
      const key = el.dataset.key;
      let val;
      if (el.type === 'checkbox')      val = el.checked;
      else if (el.type === 'number')   val = parseFloat(el.value) || 0;
      else                             val = el.value;
      setPath(it, key, val);

      // Keep auto-calculated 80E years remaining in sync
      if (key === 'sec80E.deductionYearsUsed') {
        it.sec80E.deductionYearsRemaining = Math.max(0, 8 - (it.sec80E.deductionYearsUsed || 0));
      }
      // Mirror top-level AY into the ITR sub-object when it changes
      if (key === 'assessmentYear' && it.itr) {
        it.itr.assessmentYear = it.assessmentYear;
      }

      await saveSec('fin_india_tax', it);
      renderIndia(st);
    };
    // Text/number: persist on change (blur/enter); checkbox/select: on change
    el.addEventListener('change', handler);
  });
}
