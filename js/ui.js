import { isAuthenticated, logout, startInactivityTimer } from './auth.js';
import { load, save } from './store.js';
import {
  calculateNetPay, generateAmortisation, projectULIP,
  calculateNetWorth, applyScheduledChanges, totalExpenses,
  expensesByCategory, calculateSurplus, indiaTripProgress,
  emergencyFundProgress, taxTrackerProgress, fmtGBP, fmtINR,
  fmtPct, fmtMonths, round2, round0, ulipValueGBP, ulipPremiumGBP,
  amortPayoffDate, amortInterestSaved, amortMonthsSaved,
  projectionAtYear, projectNetWorthTimeline
} from './calc.js';
import { initAllCharts, updateCharts } from './charts.js';
import { initSettings } from './settings.js';
import { initExport } from './export.js';

// ── Auth guard ───────────────────────────────────────────────

if (!isAuthenticated()) {
  sessionStorage.removeItem('session_active');
  window.location.replace('index.html');
}

// ── App state ────────────────────────────────────────────────

const state = {
  profile: null, income: null, expenses: null, debts: null,
  investments: null, goals: null, monthlyLog: null, settings: null,
  taxTracker: null, indiaLog: null
};

let amortShowAll = false;
let currentSection = 'overview';

// ── Boot ─────────────────────────────────────────────────────

async function boot() {
  await loadAll();
  applySettings();
  renderTopbar();
  bindNav();
  bindSidebarToggle();
  bindLockBtn();
  bindMobileMenu();

  const timeout = state.settings?.inactivityTimeoutMinutes || 15;
  startInactivityTimer(timeout, () => { window.location.replace('index.html'); });

  await initAllCharts(state);
  renderSection('overview');
  initSettings(state, saveAll, refreshAll);
  initExport(state);
  bindExportPdfBtn();
}

async function loadAll() {
  [
    state.profile, state.income, state.expenses, state.debts,
    state.investments, state.goals, state.monthlyLog, state.settings,
    state.taxTracker, state.indiaLog
  ] = await Promise.all([
    load('fin_profile'), load('fin_income'), load('fin_expenses'), load('fin_debts'),
    load('fin_investments'), load('fin_goals'), load('fin_monthly_log'), load('fin_settings'),
    load('fin_tax_tracker'), load('fin_india_log')
  ]);
  state.indiaLog = state.indiaLog || [];
}

async function saveAll() {
  await Promise.all([
    save('fin_profile',     state.profile),
    save('fin_income',      state.income),
    save('fin_expenses',    state.expenses),
    save('fin_debts',       state.debts),
    save('fin_investments', state.investments),
    save('fin_goals',       state.goals),
    save('fin_monthly_log', state.monthlyLog),
    save('fin_settings',    state.settings),
    save('fin_tax_tracker', state.taxTracker),
    save('fin_india_log',   state.indiaLog)
  ]);
}

export async function refreshAll() {
  await loadAll();
  await updateCharts(state);
  renderSection(currentSection);
}

function applySettings() {
  const s = state.settings || {};
  document.documentElement.style.setProperty('--inr-gbp-rate', s.inrGbpRate || 125);
}

// ── Navigation ───────────────────────────────────────────────

const SECTION_TITLES = {
  overview:'Overview', income:'Income', expenses:'Expenses', debts:'Debts',
  investments:'Investments & ULIPs', networth:'Net Worth Timeline',
  india:'India Trip Tracker', tax:'Tax Tracker', settings:'Settings', export:'Export'
};

function bindNav() {
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', () => {
      const sec = el.dataset.section;
      navigateTo(sec);
      // Close more menu if open
      closeMoreMenu();
    });
  });
}

function navigateTo(sec) {
  currentSection = sec;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('sec-' + sec);
  if (target) target.classList.add('active');

  document.querySelectorAll('[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === sec);
  });

  document.getElementById('topbar-title').textContent = SECTION_TITLES[sec] || sec;
  renderSection(sec);
}

function renderSection(sec) {
  switch(sec) {
    case 'overview':    renderOverview();    break;
    case 'income':      renderIncome();      break;
    case 'expenses':    renderExpenses();    break;
    case 'debts':       renderDebts();       break;
    case 'investments': renderInvestments(); break;
    case 'networth':    renderNetWorth();    break;
    case 'india':       renderIndiaTrip();   break;
    case 'tax':         renderTaxTracker();  break;
    case 'settings':    initSettings(state, saveAll, refreshAll); break;
    case 'export':      initExport(state);   break;
  }
}

// ── Topbar ───────────────────────────────────────────────────

function renderTopbar() {
  document.getElementById('topbar-user').textContent = state.profile?.name?.split(' ')[0] || '';
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

// ── Sidebar toggle ───────────────────────────────────────────

function bindSidebarToggle() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
}

function bindLockBtn() {
  document.getElementById('lock-btn').addEventListener('click', () => {
    logout();
    window.location.replace('index.html');
  });
}

// ── Mobile more menu ─────────────────────────────────────────

function bindMobileMenu() {
  document.getElementById('more-tab').addEventListener('click', () => {
    document.getElementById('more-menu').classList.toggle('open');
    document.getElementById('more-overlay').classList.toggle('open');
  });
  document.getElementById('more-overlay').addEventListener('click', closeMoreMenu);
}

function closeMoreMenu() {
  document.getElementById('more-menu').classList.remove('open');
  document.getElementById('more-overlay').classList.remove('open');
}

// ── PDF export button ────────────────────────────────────────

function bindExportPdfBtn() {
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    window._exportSectionPDF && window._exportSectionPDF(currentSection);
  });
}

// ══════════════════════════════════════════════════════════════
// SECTION RENDERERS
// ══════════════════════════════════════════════════════════════

// ── Overview ─────────────────────────────────────────────────

function renderOverview() {
  const rate  = state.settings?.inrGbpRate || state.profile?.inrGbpRate || 125;
  const inc   = state.income || {};
  const inv   = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = state.debts || { sbi:{} };
  const goals = state.goals || {};
  const log   = state.monthlyLog || [];

  const pay   = calculateNetPay(inc);
  const effItems = applyScheduledChanges(state.expenses || { items:[], scheduledChanges:[] });
  const totalExp  = totalExpenses(effItems);
  const surplus   = calculateSurplus(pay.netWithOT, totalExp);
  const nw        = calculateNetWorth(inv, dbt, rate);
  const india     = indiaTripProgress(goals);
  const emergency = emergencyFundProgress(inv, goals);

  const cards = document.getElementById('overview-cards');
  cards.innerHTML = `
    ${metricCard('Net Worth', fmtGBP(nw.netWorth), nw.netWorth >= 0 ? 'positive' : 'negative', `Assets ${fmtGBP(nw.totalAssets)} · Debt ${fmtGBP(nw.totalDebts)}`)}
    ${metricCard('Take-Home (w/ OT)', fmtGBP(pay.netWithOT), 'info', `Base ${fmtGBP(pay.netBase)} /mo`)}
    ${metricCard('Monthly Surplus', fmtGBP(surplus), surplus >= 0 ? 'positive' : 'negative', `Income ${fmtGBP(pay.netWithOT)} − Exp ${fmtGBP(totalExp)}`)}
    ${metricCard('India Trip', fmtPct(india.pct), india.pct >= 80 ? 'positive' : 'warning', `${fmtGBP(goals.indiaTrip?.savedGBP||0)} of ${fmtGBP(goals.indiaTrip?.targetGBP||3000)}`)}
    ${metricCard('Emergency Fund', fmtPct(emergency.pct), emergency.pct >= 80 ? 'positive' : 'warning', `${fmtGBP(emergency.savings)} of ${fmtGBP(emergency.target)}`)}
    ${metricCard('SBI Outstanding', fmtGBP(nw.sbiGBP), 'negative', fmtINR(dbt.sbi?.outstandingINR || 0))}
  `;

  updateGauges(india.pct, emergency.pct, nw.netWorth, goals.wealthTargetGBP || 4760000);
  updateCharts(state);
}

function metricCard(label, value, colorClass, sub) {
  const cls = colorClass === 'positive' ? 'text-positive'
            : colorClass === 'negative' ? 'text-negative'
            : colorClass === 'warning'  ? 'text-warning'
            : 'text-info';
  return `<div class="metric-card">
    <div class="label">${label}</div>
    <div class="value ${cls}">${value}</div>
    <div class="sub">${sub}</div>
  </div>`;
}

function updateGauges(indiaPct, emergPct, netWorth, wealthTarget) {
  document.getElementById('gauge-val-india').textContent = fmtPct(indiaPct);
  document.getElementById('gauge-val-emergency').textContent = fmtPct(emergPct);

  const nwPct = Math.max(0, Math.min(100, round2(((netWorth + wealthTarget) / (2 * wealthTarget)) * 100)));
  document.getElementById('gauge-val-wealth').textContent = fmtPct(nwPct);
  document.getElementById('gauge-lbl-india').textContent = `of ${fmtGBP(state.goals?.indiaTrip?.targetGBP||3000)}`;
  document.getElementById('gauge-lbl-emergency').textContent = `of ${fmtGBP(state.goals?.emergencyFundTargetGBP||3000)}`;
  document.getElementById('gauge-lbl-wealth').textContent = `of ${fmtGBP(state.goals?.wealthTargetGBP||4760000)}`;
}

// ── Income ───────────────────────────────────────────────────

function renderIncome() {
  const inc = state.income || {};
  const pay = calculateNetPay(inc);

  document.getElementById('income-fields').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${incomeField('Base salary (£/yr)', 'baseSalaryGBP', inc.baseSalaryGBP, 'fin_income')}
      ${incomeField('Avg overtime gross (£/mo)', 'avgOvertimeGrossGBP', inc.avgOvertimeGrossGBP, 'fin_income')}
      ${incomeField('Hours per week', 'hoursPerWeek', inc.hoursPerWeek, 'fin_income')}
      ${incomeField('Pension employee (%)', 'pensionEmployeeRate', inc.pensionEmployeeRate, 'fin_income')}
      ${incomeField('Pension employer (%)', 'pensionEmployerRate', inc.pensionEmployerRate, 'fin_income')}
      ${incomeField('Tax-free allowance (£/yr)', 'taxFreeAllowanceAnnual', inc.taxFreeAllowanceAnnual, 'fin_income')}
      ${incomeField('Underpayment deduction (£/mo)', 'underpaymentMonthlyGBP', inc.underpaymentMonthlyGBP, 'fin_income')}
    </div>
  `;
  attachAutoSave('fin_income', state, 'income');

  document.getElementById('income-deductions').innerHTML = `
    <div class="stat-row"><span class="stat-label">Hourly rate</span><span class="stat-value mono">${fmtGBP(pay.hourlyRate, 2)}/hr</span></div>
    <div class="deduction-row"><span class="ded-label">Gross (base)</span><span class="ded-plus">${fmtGBP(pay.grossBase)}</span></div>
    <div class="deduction-row"><span class="ded-label">Overtime</span><span class="ded-plus">+${fmtGBP(inc.avgOvertimeGrossGBP||0)}</span></div>
    <div class="deduction-row"><span class="ded-label">Income Tax (20%)</span><span class="ded-minus">−${fmtGBP(pay.incomeTax)}</span></div>
    <div class="deduction-row"><span class="ded-label">National Insurance (8%)</span><span class="ded-minus">−${fmtGBP(pay.ni)}</span></div>
    <div class="deduction-row"><span class="ded-label">Pension (${inc.pensionEmployeeRate||0}%)</span><span class="ded-minus">−${fmtGBP(pay.pension)}</span></div>
    <div class="deduction-row"><span class="ded-label">Tax underpayment</span><span class="ded-minus">−${fmtGBP(pay.extraTax)}</span></div>
    <div class="deduction-row" style="border-top:1px solid var(--border-medium);font-weight:600"><span class="ded-label">Net Take-Home (base)</span><span class="ded-value mono">${fmtGBP(pay.netBase)}</span></div>
    <div class="deduction-row" style="font-weight:600"><span class="ded-label">Net Take-Home (w/ OT)</span><span class="ded-value mono">${fmtGBP(pay.netWithOT)}</span></div>
    <div class="deduction-row"><span class="ded-label">Employer pension contrib</span><span class="ded-plus">+${fmtGBP(pay.employerPension)}</span></div>
  `;

  document.getElementById('income-scenarios').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Scenario</th><th class="td-right">Gross (£/yr)</th><th class="td-right">Net/mo</th><th class="td-right">Surplus/mo</th></tr></thead>
      <tbody>
        ${[28000,40000,55000,65000].map(sal => {
          const p = calculateNetPay({...inc, baseSalaryGBP:sal, avgOvertimeGrossGBP:0});
          const effItems = applyScheduledChanges(state.expenses||{items:[],scheduledChanges:[]});
          const exp = totalExpenses(effItems);
          const s = calculateSurplus(p.netBase, exp);
          return `<tr class="${sal===28000?'highlight-row':''}"><td>${sal===28000?'Current':('£'+sal.toLocaleString())}</td><td class="td-right mono">${fmtGBP(sal)}</td><td class="td-right mono">${fmtGBP(p.netBase)}</td><td class="td-right mono ${s>=0?'text-positive':'text-negative'}">${fmtGBP(s)}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function incomeField(label, key, value, storeKey) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input" data-store="${storeKey}" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

// ── Expenses ─────────────────────────────────────────────────

function renderExpenses() {
  const expenses = state.expenses || { items:[], scheduledChanges:[] };
  const effItems = applyScheduledChanges(expenses);
  const total    = totalExpenses(effItems);

  const wrap = document.getElementById('expenses-table-wrap');
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Category</th><th class="td-right">Monthly</th><th>Active</th><th></th></tr></thead>
      <tbody id="expenses-tbody">
        ${expenses.items.map((item,i) => expenseRow(item, i)).join('')}
        <tr class="total-row"><td colspan="2"><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(total)}</strong></td><td colspan="2"></td></tr>
      </tbody>
    </table>
  `;

  document.querySelectorAll('.exp-name-input').forEach(el => {
    el.addEventListener('change', e => saveExpenseField(e));
  });
  document.querySelectorAll('.exp-cat-input').forEach(el => {
    el.addEventListener('change', e => saveExpenseField(e));
  });
  document.querySelectorAll('.exp-amt-input').forEach(el => {
    el.addEventListener('change', e => saveExpenseField(e));
  });
  document.querySelectorAll('.exp-active-input').forEach(el => {
    el.addEventListener('change', e => saveExpenseField(e));
  });
  document.querySelectorAll('.exp-delete-btn').forEach(el => {
    el.addEventListener('click', e => deleteExpense(parseInt(el.dataset.idx)));
  });

  document.getElementById('add-expense-btn').onclick = addExpense;

  // Scheduled changes
  const scList = document.getElementById('scheduled-changes-list');
  scList.innerHTML = expenses.scheduledChanges.length === 0
    ? '<p class="label-muted">No scheduled changes.</p>'
    : `<table class="data-table"><thead><tr><th>Expense</th><th>Date</th><th class="td-right">New Amount</th><th>Note</th></tr></thead><tbody>
      ${expenses.scheduledChanges.map(sc => {
        const item = expenses.items.find(i=>i.id===sc.expenseId);
        const isPast = sc.changeDate <= new Date().toISOString().slice(0,10);
        return `<tr><td>${item?.name||sc.expenseId}</td><td class="mono">${sc.changeDate}</td><td class="td-right mono">${fmtGBP(sc.newMonthlyGBP)}</td><td>${sc.note||''} ${isPast?'<span class="badge badge-positive">Applied</span>':''}</td></tr>`;
      }).join('')}
    </tbody></table>`;
}

function expenseRow(item, i) {
  const cats = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];
  return `<tr>
    <td><input class="form-input-inline exp-name-input" data-idx="${i}" data-field="name" value="${escHtml(item.name)}" /></td>
    <td>
      <select class="form-select exp-cat-input" data-idx="${i}" data-field="category" style="background:var(--bg-input);font-size:12px;padding:3px 6px">
        ${cats.map(c=>`<option ${c===item.category?'selected':''}>${c}</option>`).join('')}
      </select>
    </td>
    <td class="td-right"><input type="number" class="form-input-inline exp-amt-input" data-idx="${i}" data-field="monthlyGBP" value="${item.monthlyGBP}" style="text-align:right;width:70px" /></td>
    <td><input type="checkbox" class="exp-active-input" data-idx="${i}" data-field="active" ${item.active?'checked':''} /></td>
    <td><button class="btn-icon danger exp-delete-btn" data-idx="${i}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></td>
  </tr>`;
}

async function saveExpenseField(e) {
  const el  = e.target;
  const idx = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  const item  = state.expenses.items[idx];
  if (!item) return;
  if (field === 'monthlyGBP') item[field] = parseFloat(el.value) || 0;
  else if (field === 'active') item[field] = el.checked;
  else item[field] = el.value;
  await save('fin_expenses', state.expenses);
  await updateCharts(state);
}

async function addExpense() {
  state.expenses.items.push({ id: 'exp_'+Date.now(), name:'New Expense', category:'Other', monthlyGBP:0, active:true });
  await save('fin_expenses', state.expenses);
  renderExpenses();
}

async function deleteExpense(idx) {
  state.expenses.items.splice(idx, 1);
  await save('fin_expenses', state.expenses);
  renderExpenses();
  updateCharts(state);
}

// ── Debts ────────────────────────────────────────────────────

function renderDebts() {
  const sbi  = state.debts?.sbi || {};
  const rate = state.settings?.inrGbpRate || 125;

  document.getElementById('debt-fields').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${debtField('Outstanding balance (₹)', 'outstandingINR', sbi.outstandingINR)}
      ${debtField('Interest rate (%)', 'ratePercent', sbi.ratePercent)}
      ${debtField('EMI (₹/mo)', 'emiINR', sbi.emiINR)}
      ${debtField('Extra payment (₹/mo)', 'extraMonthlyINR', sbi.extraMonthlyINR)}
      <div class="form-group"><label class="form-label">Co-applicant</label><input class="form-input" data-store="fin_debts" data-key="sbi.coApplicant" value="${sbi.coApplicant||''}" /></div>
    </div>
  `;

  const sch    = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, sbi.extraMonthlyINR||0);
  const monthlyInterest  = sch[0]?.interest  || 0;
  const monthlyPrincipal = sch[0]?.principal || 0;
  const payoffDate       = amortPayoffDate(sch);
  const gbpOutstanding   = round2((sbi.outstandingINR||0) / rate);

  document.getElementById('debt-metrics').innerHTML = `
    <div class="stat-row"><span class="stat-label">Outstanding (GBP)</span><span class="stat-value mono text-negative">${fmtGBP(gbpOutstanding)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly Interest</span><span class="stat-value mono">${fmtINR(monthlyInterest)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly Principal</span><span class="stat-value mono">${fmtINR(monthlyPrincipal)}</span></div>
    <div class="stat-row"><span class="stat-label">Remaining months</span><span class="stat-value mono">${fmtMonths(sch.length)}</span></div>
    <div class="stat-row"><span class="stat-label">Payoff date</span><span class="stat-value mono">${payoffDate}</span></div>
    <div class="stat-row"><span class="stat-label">Total interest remaining</span><span class="stat-value mono text-negative">${fmtINR(sch[sch.length-1]?.totalInterest||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Start date</span><span class="stat-value mono">${sbi.startDate||'—'}</span></div>
  `;

  attachDebtAutoSave();

  // Overpayment simulator
  const curExtra = sbi.extraMonthlyINR || 0;
  document.getElementById('debt-simulator').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label class="form-label" style="display:flex;justify-content:space-between">
          Extra monthly payment <span class="mono text-info" id="slider-val">${fmtINR(curExtra)}</span>
        </label>
        <input type="range" class="range-slider" id="overpay-slider" min="0" max="50000" step="1000" value="${curExtra}" style="margin-top:8px" />
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)"><span>₹0</span><span>₹50,000</span></div>
      </div>
      <div id="simulator-result" style="min-width:200px"></div>
    </div>
  `;

  updateSimulator(sbi, curExtra);

  document.getElementById('overpay-slider').addEventListener('input', e => {
    const extra = parseInt(e.target.value);
    document.getElementById('slider-val').textContent = fmtINR(extra);
    updateSimulator(sbi, extra);
  });

  // Comparison table
  const comparisons = [0, 10000, 20000, 35000].map(extra => {
    const s = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, extra);
    const saved = amortInterestSaved(sch, s);
    const monthsSaved = amortMonthsSaved(sch, s);
    return { extra, months: s.length, payoff: amortPayoffDate(s), saved, monthsSaved };
  });

  document.getElementById('debt-compare-wrap').innerHTML = `
    <table class="compare-table">
      <thead><tr><th>Extra/mo</th><th>Months</th><th>Payoff</th><th>Interest Saved</th><th>Months Saved</th></tr></thead>
      <tbody>
        ${comparisons.map((c,i) => `<tr class="${i===0?'current-row':''} ${i===3?'best-row':''}">
          <td>${c.extra===0?'Current (no extra)':fmtINR(c.extra)}</td>
          <td class="mono">${fmtMonths(c.months)}</td>
          <td class="mono">${c.payoff}</td>
          <td class="mono text-positive">${c.saved>0?fmtINR(c.saved):'—'}</td>
          <td class="mono text-positive">${c.monthsSaved>0?fmtMonths(c.monthsSaved):'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  // Amortisation table
  renderAmortTable(sch);

  document.getElementById('amort-toggle-btn').onclick = () => {
    amortShowAll = !amortShowAll;
    renderAmortTable(sch);
    document.getElementById('amort-toggle-btn').textContent = amortShowAll ? 'Show less' : 'Show all';
  };
}

function updateSimulator(sbi, extra) {
  const base = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, 0);
  const with_ = generateAmortisation(sbi.outstandingINR||0, sbi.ratePercent||9.9, sbi.emiINR||34090, extra);
  const saved  = amortInterestSaved(base, with_);
  const months = amortMonthsSaved(base, with_);
  document.getElementById('simulator-result').innerHTML = extra === 0 ? '' : `
    <div class="stat-row"><span class="stat-label">New payoff</span><span class="stat-value mono">${amortPayoffDate(with_)}</span></div>
    <div class="stat-row"><span class="stat-label">Months saved</span><span class="stat-value mono text-positive">${fmtMonths(months)}</span></div>
    <div class="stat-row"><span class="stat-label">Interest saved</span><span class="stat-value mono text-positive">${fmtINR(saved)}</span></div>
  `;
}

function renderAmortTable(sch) {
  const PREVIEW = 24;
  const wrap = document.getElementById('amort-table-wrap');
  const rows  = amortShowAll ? sch : sch.slice(0, PREVIEW);
  const milestones = [Math.floor(sch.length * 0.25), Math.floor(sch.length * 0.5), Math.floor(sch.length * 0.75)];

  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>#</th><th class="td-right">Interest</th><th class="td-right">Principal</th><th class="td-right">Balance</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr class="${milestones.includes(r.month)?'milestone':''}">
        <td>${r.month}</td>
        <td class="td-right mono">${fmtINR(r.interest)}</td>
        <td class="td-right mono">${fmtINR(r.principal)}</td>
        <td class="td-right mono">${fmtINR(r.closing)}</td>
      </tr>`).join('')}
      ${!amortShowAll && sch.length > PREVIEW ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px">... ${sch.length - PREVIEW} more rows — click "Show all"</td></tr>` : ''}
    </tbody>
  </table>`;
}

function debtField(label, key, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input debt-field" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

function attachDebtAutoSave() {
  document.querySelectorAll('.debt-field').forEach(el => {
    el.addEventListener('change', async () => {
      const key = el.dataset.key;
      if (!state.debts.sbi) state.debts.sbi = {};
      state.debts.sbi[key] = parseFloat(el.value) || 0;
      await save('fin_debts', state.debts);
      renderDebts();
      updateCharts(state);
    });
  });
}

// ── Investments ───────────────────────────────────────────────

function renderInvestments() {
  const inv  = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const rate = state.settings?.inrGbpRate || 125;
  const pension = inv.pensions?.[0] || {};
  const cash    = inv.cashAccounts?.[0] || {};

  document.getElementById('pension-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Pension</span><span class="badge badge-positive">Active</span></div>
    <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${pension.provider||'—'}</span></div>
    <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(pension.valueGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly contribution</span><span class="stat-value mono">${fmtGBP(pension.monthlyGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${pension.note||''}</span></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      ${invEditField('Pension value (£)', 'pensions.0.valueGBP', pension.valueGBP)}
      ${invEditField('Monthly contribution (£)', 'pensions.0.monthlyGBP', pension.monthlyGBP)}
    </div>
  `;

  document.getElementById('cash-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Cash / Savings</span></div>
    <div class="stat-row"><span class="stat-label">${cash.name||'Savings'}</span><span class="stat-value mono">${fmtGBP(cash.balanceGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">AER</span><span class="stat-value mono">${cash.aerPercent||0}%</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${cash.note||''}</span></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      ${invEditField('Balance (£)', 'cashAccounts.0.balanceGBP', cash.balanceGBP)}
      ${invEditField('AER (%)', 'cashAccounts.0.aerPercent', cash.aerPercent)}
    </div>
  `;

  attachInvAutoSave();

  // ULIPs
  const ulipSection = document.getElementById('ulip-section');
  ulipSection.innerHTML = inv.ulips.map((u, i) => {
    const valueGBP   = ulipValueGBP(u, rate);
    const premGBP    = ulipPremiumGBP(u, rate);
    const c_pts = projectULIP(valueGBP, premGBP, u.conservativeRatePercent, u.payTermEndDate, u.totalTermYears);
    const e_pts = projectULIP(valueGBP, premGBP, u.expectedRatePercent,     u.payTermEndDate, u.totalTermYears);
    const a_pts = projectULIP(valueGBP, premGBP, u.aggressiveRatePercent,   u.payTermEndDate, u.totalTermYears);

    const lockInYr   = round2((new Date(u.lockInDate)   - new Date()) / (365.25*24*3600*1000));
    const payTermYr  = round2((new Date(u.payTermEndDate)- new Date()) / (365.25*24*3600*1000));

    return `<div class="panel mt-12">
      <div class="ulip-header">
        <div>
          <div class="ulip-name">${u.name}</div>
          <div class="ulip-insurer">${u.insurer} · ${u.currency}</div>
        </div>
        <div style="text-align:right">
          <div class="metric-sm mono">${u.currency==='GBP'?fmtGBP(valueGBP):fmtINR(u.currentValue)}</div>
          <div class="label-muted">${u.currency==='INR'?fmtGBP(valueGBP)+' equivalent':''}</div>
        </div>
      </div>
      <div class="grid-2">
        <div>
          <div class="stat-row"><span class="stat-label">Monthly premium</span><span class="stat-value mono">${u.currency==='GBP'?fmtGBP(u.monthlyPremium):fmtINR(u.monthlyPremium)}</span></div>
          <div class="stat-row"><span class="stat-label">Lock-in date</span><span class="stat-value mono">${u.lockInDate}</span></div>
          <div class="stat-row"><span class="stat-label">Pay term ends</span><span class="stat-value mono">${u.payTermEndDate}</span></div>
          <div class="stat-row"><span class="stat-label">Total term</span><span class="stat-value mono">${u.totalTermYears} years</span></div>
          <div class="stat-row"><span class="stat-label">Sum assured</span><span class="stat-value mono">${fmtGBP(u.sumAssuredGBP)}</span></div>
        </div>
        <div>
          <table class="data-table" style="font-size:12px">
            <thead><tr><th>Milestone</th><th class="td-right">Conservative (${u.conservativeRatePercent}%)</th><th class="td-right">Expected (${u.expectedRatePercent}%)</th><th class="td-right">Aggressive (${u.aggressiveRatePercent}%)</th></tr></thead>
            <tbody>
              ${[{label:'Lock-in', yr:Math.ceil(lockInYr)},{label:'Pay term end', yr:Math.ceil(payTermYr)},{label:'Year 10', yr:10},{label:'Year 15', yr:15},{label:'Year 20', yr:20}].map(({label,yr}) => {
                const c = projectionAtYear(c_pts, yr)||0, e = projectionAtYear(e_pts, yr)||0, a = projectionAtYear(a_pts, yr)||0;
                return `<tr><td>${label}</td><td class="td-right mono">${u.currency==='GBP'?fmtGBP(c):fmtINR(c)}</td><td class="td-right mono text-info">${u.currency==='GBP'?fmtGBP(e):fmtINR(e)}</td><td class="td-right mono text-positive">${u.currency==='GBP'?fmtGBP(a):fmtINR(a)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="chart-wrap chart-h-200 mt-12"><canvas id="chart-ulip-${u.id}"></canvas></div>
    </div>`;
  }).join('');

  updateCharts(state);
}

function invEditField(label, path, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input inv-field" data-path="${path}" value="${value||0}" step="any" />
  </div>`;
}

function attachInvAutoSave() {
  document.querySelectorAll('.inv-field').forEach(el => {
    el.addEventListener('change', async () => {
      const path = el.dataset.path.split('.');
      let obj = state.investments;
      for (let i = 0; i < path.length - 1; i++) {
        if (!isNaN(path[i+1]) || !isNaN(path[i])) {
          const key = isNaN(path[i]) ? path[i] : parseInt(path[i]);
          obj = obj[key];
        } else {
          obj = obj[path[i]];
        }
      }
      const last = path[path.length-1];
      const idx  = isNaN(last) ? last : parseInt(last);
      obj[idx] = parseFloat(el.value)||0;
      await save('fin_investments', state.investments);
      renderInvestments();
      updateCharts(state);
    });
  });
}

// ── Net Worth Timeline ────────────────────────────────────────

function renderNetWorth() {
  const rate  = state.settings?.inrGbpRate || 125;
  const inc   = state.income || {};
  const inv   = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const dbt   = state.debts?.sbi || {};
  const goals = state.goals || {};
  const nw    = calculateNetWorth(inv, dbt, rate);
  const pay   = calculateNetPay(inc);
  const effItems = applyScheduledChanges(state.expenses||{items:[],scheduledChanges:[]});
  const surplus   = calculateSurplus(pay.netWithOT, totalExpenses(effItems));

  document.getElementById('nw-settings-fields').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${nwField('Pension growth rate (%/yr)', 'pensionGrowthRate', 7)}
      ${nwField('Career transition (date)', 'careerTransitionDate', '', 'date')}
      ${nwField('New salary after transition (£/yr)', 'newSalaryGBP', '')}
    </div>
  `;

  // Wealth scenarios
  const target = goals.wealthTargetGBP || 4760000;
  document.getElementById('nw-scenarios').innerHTML = `
    <div class="stat-row"><span class="stat-label">Current net worth</span><span class="stat-value mono ${nw.netWorth<0?'text-negative':'text-positive'}">${fmtGBP(nw.netWorth)}</span></div>
    <div class="stat-row"><span class="stat-label">Target</span><span class="stat-value mono">${fmtGBP(target)}</span></div>
    <div class="stat-row"><span class="stat-label">Current saving/mo</span><span class="stat-value mono text-info">${fmtGBP(surplus)}</span></div>
    <div class="divider"></div>
    <table class="data-table" style="font-size:12px">
      <thead><tr><th>Salary (£/yr)</th><th class="td-right">Saving/mo</th><th class="td-right">Yrs to target</th></tr></thead>
      <tbody>
        ${[28000,40000,55000,65000].map(sal => {
          const p2 = calculateNetPay({...inc, baseSalaryGBP:sal, avgOvertimeGrossGBP:0});
          const s2 = calculateSurplus(p2.netBase, totalExpenses(effItems));
          const yrs = s2 > 0 ? round2((target - nw.netWorth) / (s2 * 12)) : '∞';
          return `<tr class="${sal===28000?'highlight-row':''}"><td>${fmtGBP(sal)}</td><td class="td-right mono">${fmtGBP(s2)}</td><td class="td-right mono">${typeof yrs==='number'?yrs.toFixed(1)+' yrs':yrs}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  updateCharts(state);
}

function nwField(label, key, value, type='number') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input" value="${value}" />
  </div>`;
}

// ── India Trip ────────────────────────────────────────────────

function renderIndiaTrip() {
  const goals = state.goals || {};
  const trip  = goals.indiaTrip || {};
  const prog  = indiaTripProgress(goals);
  const log   = state.indiaLog || [];

  document.getElementById('india-fields').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${indiaField('Target (£)', 'targetGBP', trip.targetGBP)}
      ${indiaField('Saved so far (£)', 'savedGBP', trip.savedGBP)}
      ${indiaField('Deadline', 'deadline', trip.deadline, 'date')}
    </div>
    <div class="stat-row mt-12"><span class="stat-label">Remaining</span><span class="stat-value mono text-warning">${fmtGBP(prog.remaining)}</span></div>
    <div class="stat-row"><span class="stat-label">Days left</span><span class="stat-value mono">${prog.daysLeft} days</span></div>
    <div class="stat-row"><span class="stat-label">Months left</span><span class="stat-value mono">${prog.monthsLeft.toFixed(1)} months</span></div>
    ${prog.remaining > 0 && prog.monthsLeft > 0 ? `<div class="stat-row"><span class="stat-label">Needed/mo</span><span class="stat-value mono text-info">${fmtGBP(round2(prog.remaining/prog.monthsLeft))}</span></div>` : ''}
  `;

  document.getElementById('india-gauge-val').textContent = fmtPct(prog.pct);
  document.getElementById('india-gauge-lbl').textContent = `of ${fmtGBP(trip.targetGBP||3000)}`;

  document.querySelectorAll('.india-field').forEach(el => {
    el.addEventListener('change', async () => {
      if (!state.goals.indiaTrip) state.goals.indiaTrip = {};
      const key = el.dataset.key;
      state.goals.indiaTrip[key] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      await save('fin_goals', state.goals);
      renderIndiaTrip();
      updateCharts(state);
    });
  });

  // Breakdown table
  const breakdown = trip.breakdown || [];
  document.getElementById('india-breakdown-table').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Item</th><th>Currency</th><th class="td-right">Amount (₹)</th><th class="td-right">Amount (£)</th><th>Status</th></tr></thead>
      <tbody>
        ${breakdown.map(b=>`<tr>
          <td>${b.item}</td>
          <td>${b.currency}</td>
          <td class="td-right mono">${b.amountINR>0?fmtINR(b.amountINR):'—'}</td>
          <td class="td-right mono">${fmtGBP(b.amountGBP)}</td>
          <td><span class="badge ${b.paid?'badge-paid':'badge-pending'}">${b.paid?'Paid':'Pending'}</span></td>
        </tr>`).join('')}
        <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(breakdown.reduce((s,b)=>s+b.amountGBP,0))}</strong></td><td></td></tr>
      </tbody>
    </table>
  `;

  // Log table
  document.getElementById('india-log-table').innerHTML = log.length === 0
    ? '<p class="label-muted" style="padding:12px">No entries yet. Click + Add month to log savings.</p>'
    : `<table class="data-table">
      <thead><tr><th>Month</th><th class="td-right">Planned (£)</th><th class="td-right">Actual (£)</th><th class="td-right">Running Total</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${log.reduce((acc,r,i) => {
          const running = round2(log.slice(0,i+1).reduce((s,x)=>s+(x.actualGBP||0),0));
          return acc + `<tr>
            <td class="mono">${r.month}</td>
            <td class="td-right mono">${fmtGBP(r.plannedGBP||0)}</td>
            <td class="td-right mono ${(r.actualGBP||0)>=(r.plannedGBP||0)?'text-positive':'text-warning'}">${fmtGBP(r.actualGBP||0)}</td>
            <td class="td-right mono">${fmtGBP(running)}</td>
            <td style="font-size:12px;color:var(--text-secondary)">${r.note||''}</td>
            <td><button class="btn-icon danger india-log-delete" data-idx="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></td>
          </tr>`;
        }, '')}
      </tbody>
    </table>`;

  document.querySelectorAll('.india-log-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.indiaLog.splice(parseInt(btn.dataset.idx), 1);
      await save('fin_india_log', state.indiaLog);
      renderIndiaTrip();
    });
  });

  document.getElementById('add-india-log-btn').onclick = async () => {
    const month = prompt('Month (YYYY-MM):', new Date().toISOString().slice(0,7));
    if (!month) return;
    const planned = parseFloat(prompt('Planned saving (£):', '0')||'0');
    const actual  = parseFloat(prompt('Actual saved (£):', '0')||'0');
    const note    = prompt('Note (optional):', '') || '';
    state.indiaLog.push({ month, plannedGBP: planned, actualGBP: actual, note });
    await save('fin_india_log', state.indiaLog);
    renderIndiaTrip();
    updateCharts(state);
  };

  updateCharts(state);
}

function indiaField(label, key, value, type='number') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input india-field" data-key="${key}" value="${value||''}" step="any" />
  </div>`;
}

// ── Tax Tracker ───────────────────────────────────────────────

function renderTaxTracker() {
  const tt   = state.taxTracker || {};
  const prog = taxTrackerProgress(tt);

  document.getElementById('tax-fields').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${taxField('Tax code', 'taxCode', tt.taxCode, 'text')}
      ${taxField('Total underpayment (£)', 'underpaymentTotal', tt.underpaymentTotal)}
      ${taxField('Monthly deduction (£)', 'monthlyDeduction', tt.monthlyDeduction)}
      ${taxField('Start date', 'startDate', tt.startDate, 'date')}
      ${taxField('End date', 'endDate', tt.endDate, 'date')}
    </div>
  `;

  attachTaxAutoSave();

  document.getElementById('tax-progress').innerHTML = `
    <div class="stat-row"><span class="stat-label">Collected so far</span><span class="stat-value mono text-positive">${fmtGBP(prog.collected, 2)}</span></div>
    <div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value mono text-warning">${fmtGBP(prog.remaining, 2)}</span></div>
    <div class="stat-row"><span class="stat-label">Progress</span><span class="stat-value mono">${fmtPct(prog.pct)}</span></div>
    <div class="stat-row"><span class="stat-label">Months elapsed</span><span class="stat-value mono">${prog.monthsElapsed}</span></div>
    <div class="stat-row"><span class="stat-label">Months remaining</span><span class="stat-value mono">${prog.monthsLeft}</span></div>
    <div class="stat-row"><span class="stat-label">Days until clear</span><span class="stat-value mono">${prog.daysLeft}</span></div>
    <div class="progress-wrap mt-12">
      <div class="progress-label"><span>£0</span><span>${fmtGBP(tt.underpaymentTotal||456)}</span></div>
      <div class="progress-track"><div class="progress-fill positive" style="width:${prog.pct}%"></div></div>
    </div>
  `;

  // Calendar grid — one cell per month Apr 2026 → Apr 2027
  const grid   = document.getElementById('tax-calendar');
  const start  = new Date(tt.startDate || '2026-04-06');
  const months = 12;
  const verified = tt.verifiedMonths || [];

  grid.innerHTML = '';
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = d.toISOString().slice(0, 7);
    const isVerified = verified.includes(key);
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (isVerified ? ' verified' : '');
    cell.innerHTML = `<span class="cal-month">${d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})}</span>${isVerified?'<span class="cal-check">✓</span>':''}`;
    cell.title = isVerified ? 'Verified' : 'Click to mark verified';
    cell.addEventListener('click', async () => {
      if (isVerified) {
        state.taxTracker.verifiedMonths = verified.filter(v => v !== key);
      } else {
        state.taxTracker.verifiedMonths = [...verified, key];
      }
      await save('fin_tax_tracker', state.taxTracker);
      renderTaxTracker();
    });
    grid.appendChild(cell);
  }

  updateCharts(state);
}

function taxField(label, key, value, type='number') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-input tax-field" data-key="${key}" value="${value||''}" ${type==='number'?'step="any"':''} />
  </div>`;
}

function attachTaxAutoSave() {
  document.querySelectorAll('.tax-field').forEach(el => {
    el.addEventListener('change', async () => {
      const key = el.dataset.key;
      state.taxTracker[key] = el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      await save('fin_tax_tracker', state.taxTracker);
      renderTaxTracker();
      updateCharts(state);
    });
  });
}

// ── Auto-save helper ─────────────────────────────────────────

function attachAutoSave(storeKey, stateObj, stateField) {
  document.querySelectorAll(`[data-store="${storeKey}"]`).forEach(el => {
    el.addEventListener('change', async () => {
      const key = el.dataset.key;
      const val = el.type === 'checkbox' ? el.checked
                : el.type === 'number'   ? (parseFloat(el.value) || 0)
                : el.value;
      stateObj[stateField][key] = val;
      await save(storeKey, stateObj[stateField]);
      renderSection(currentSection);
      updateCharts(stateObj);
    });
  });
}

// ── Utilities ────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Start ────────────────────────────────────────────────────

boot();
