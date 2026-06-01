import { initPage }      from '../page-init.js';
import { save, initializeDefaults } from '../store.js';

const state = await initPage('settings');

// ── Tab management ────────────────────────────────────────────

let _currentTab = 'profile';

document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _currentTab = btn.dataset.tab;
    renderTab(_currentTab);
  });
});

renderTab('profile');

// ── Auto-save helper ──────────────────────────────────────────

async function autoSave(storeKey, obj) {
  await save(storeKey, obj);
  renderTab(_currentTab); // re-render only current tab
}

// ── Field helpers ─────────────────────────────────────────────

function field(label, type, value, onChange, hint='') {
  const id = 'sf_' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.type==='checkbox' ? el.checked : el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      onChange(v);
    });
    el.addEventListener('change', () => {
      const v = el.type==='checkbox' ? el.checked : el.type==='number' ? (parseFloat(el.value)||0) : el.value;
      onChange(v);
    });
  }, 0);
  return `<div class="form-group" style="margin-bottom:14px">
    <label class="form-label">${label}</label>
    ${type==='checkbox'
      ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
           <input type="checkbox" id="${id}" ${value?'checked':''} style="width:auto">
           <span class="label-muted">Enabled</span></label>`
      : `<input type="${type}" id="${id}" class="form-input" value="${value??''}" ${type==='number'?'step="any"':''} />`}
    ${hint ? `<span class="label-muted">${hint}</span>` : ''}
  </div>`;
}

// ── Tab renderers ─────────────────────────────────────────────

function renderTab(tab) {
  const content = document.getElementById('settings-content');
  switch(tab) {
    case 'profile':     renderProfile(content);     break;
    case 'income':      renderIncome(content);      break;
    case 'expenses':    renderExpenses(content);    break;
    case 'debts':       renderDebts(content);       break;
    case 'investments': renderInvestments(content); break;
    case 'goals':       renderGoals(content);       break;
    case 'projections': renderProjections(content); break;
    case 'tax':         renderTaxSettings(content); break;
    case 'display':     renderDisplay(content);     break;
    case 'data':        renderData(content);        break;
    case 'charts':      renderChartParams(content); break;
  }
}

function renderProfile(content) {
  const p = state.profile || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Profile</div>
    <div class="grid-2">
      ${field('Full name',              'text',   p.name,              v=>{p.name=v;           autoSave('fin_profile',p);})}
      ${field('Age',                    'number', p.age,               v=>{p.age=v;            autoSave('fin_profile',p);})}
      ${field('INR/GBP rate',           'number', p.inrGbpRate,        v=>{p.inrGbpRate=v; state.settings.inrGbpRate=v; autoSave('fin_profile',p); autoSave('fin_settings',state.settings);})}
      ${field('Target age for wealth',  'number', p.targetAge,         v=>{p.targetAge=v;      autoSave('fin_profile',p);})}
      ${field('Wealth target (£)',       'number', p.wealthTargetGBP,   v=>{p.wealthTargetGBP=v; state.goals.wealthTargetGBP=v; autoSave('fin_profile',p); autoSave('fin_goals',state.goals);})}
    </div>
  </div>`;
}

function renderIncome(content) {
  const inc = state.income || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Income Settings</div>
    <div class="grid-2">
      ${field('Base salary (£/yr)',           'number', inc.baseSalaryGBP,          v=>{inc.baseSalaryGBP=v;           autoSave('fin_income',inc);})}
      ${field('Avg overtime gross (£/mo)',    'number', inc.avgOvertimeGrossGBP,    v=>{inc.avgOvertimeGrossGBP=v;    autoSave('fin_income',inc);})}
      ${field('Hours/week',                   'number', inc.hoursPerWeek,           v=>{inc.hoursPerWeek=v;           autoSave('fin_income',inc);})}
      ${field('Tax-free allowance (£/yr)',    'number', inc.taxFreeAllowanceAnnual, v=>{inc.taxFreeAllowanceAnnual=v; autoSave('fin_income',inc);})}
      ${field('Pension employee (%)',         'number', inc.pensionEmployeeRate,    v=>{inc.pensionEmployeeRate=v;    autoSave('fin_income',inc);})}
      ${field('Pension employer (%)',         'number', inc.pensionEmployerRate,    v=>{inc.pensionEmployerRate=v;    autoSave('fin_income',inc);})}
      ${field('Underpayment deduction (£/mo)','number', inc.underpaymentMonthlyGBP,v=>{inc.underpaymentMonthlyGBP=v; autoSave('fin_income',inc);})}
      ${field('Underpayment clears',          'date',   inc.underpaymentClearsDate, v=>{inc.underpaymentClearsDate=v; autoSave('fin_income',inc);})}
    </div>
  </div>`;
}

function renderExpenses(content) {
  const exp = state.expenses || { items:[], scheduledChanges:[] };
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Scheduled Changes</div>
    <p class="label-muted" style="margin-bottom:14px">Edit expenses from the <a href="expenses.html">Expenses page</a>. Scheduled changes:</p>
    <table class="data-table">
      <thead><tr><th>Expense</th><th>Change date</th><th class="td-right">New amount</th><th>Note</th></tr></thead>
      <tbody>
        ${exp.scheduledChanges.map(sc=>{
          const item=exp.items.find(i=>i.id===sc.expenseId);
          return `<tr><td>${item?.name||sc.expenseId}</td><td>${sc.changeDate}</td><td class="td-right mono">£${sc.newMonthlyGBP}</td><td style="font-size:12px">${sc.note||''}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderDebts(content) {
  const sbi = state.debts?.sbi || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">SBI Loan</div>
    <div class="grid-2">
      ${field('Outstanding (₹)',        'number', sbi.outstandingINR,   v=>{state.debts.sbi.outstandingINR=v;  autoSave('fin_debts',state.debts);})}
      ${field('Interest rate (%)',      'number', sbi.ratePercent,      v=>{state.debts.sbi.ratePercent=v;     autoSave('fin_debts',state.debts);})}
      ${field('EMI (₹/mo)',            'number', sbi.emiINR,           v=>{state.debts.sbi.emiINR=v;          autoSave('fin_debts',state.debts);})}
      ${field('Extra payment (₹/mo)',  'number', sbi.extraMonthlyINR,  v=>{state.debts.sbi.extraMonthlyINR=v; autoSave('fin_debts',state.debts);})}
      ${field('Start date',            'date',   sbi.startDate,        v=>{state.debts.sbi.startDate=v;       autoSave('fin_debts',state.debts);})}
      ${field('Co-applicant',          'text',   sbi.coApplicant,      v=>{state.debts.sbi.coApplicant=v;     autoSave('fin_debts',state.debts);})}
    </div>
  </div>`;
}

function renderInvestments(content) {
  const inv = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const p = inv.pensions?.[0] || {};
  const c = inv.cashAccounts?.[0] || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Investments</div>
    <p class="panel-title" style="margin-bottom:10px;font-size:12px">Pension</p>
    <div class="grid-2">
      ${field('Pension value (£)',         'number', p.valueGBP,  v=>{inv.pensions[0].valueGBP=v;  autoSave('fin_investments',inv);})}
      ${field('Monthly contribution (£)',  'number', p.monthlyGBP,v=>{inv.pensions[0].monthlyGBP=v; autoSave('fin_investments',inv);})}
    </div>
    <p class="panel-title" style="margin:20px 0 10px;font-size:12px">Cash / Savings</p>
    <div class="grid-2">
      ${field('Balance (£)',  'number', c.balanceGBP, v=>{inv.cashAccounts[0].balanceGBP=v; autoSave('fin_investments',inv);})}
      ${field('AER (%)',      'number', c.aerPercent,  v=>{inv.cashAccounts[0].aerPercent=v;  autoSave('fin_investments',inv);})}
    </div>
    ${inv.ulips.map((u,i)=>`
      <p class="panel-title" style="margin:20px 0 10px;font-size:12px">ULIP — ${u.name}</p>
      <div class="grid-2">
        ${field('Current value ('+u.currency+')',  'number', u.currentValue,         v=>{inv.ulips[i].currentValue=v;          autoSave('fin_investments',inv);})}
        ${field('Monthly premium ('+u.currency+')', 'number', u.monthlyPremium,      v=>{inv.ulips[i].monthlyPremium=v;        autoSave('fin_investments',inv);})}
        ${field('Conservative rate (%)',           'number', u.conservativeRatePercent,v=>{inv.ulips[i].conservativeRatePercent=v; autoSave('fin_investments',inv);})}
        ${field('Expected rate (%)',               'number', u.expectedRatePercent,   v=>{inv.ulips[i].expectedRatePercent=v;   autoSave('fin_investments',inv);})}
        ${field('Aggressive rate (%)',             'number', u.aggressiveRatePercent, v=>{inv.ulips[i].aggressiveRatePercent=v; autoSave('fin_investments',inv);})}
        ${field('Pay term end date',               'date',   u.payTermEndDate,        v=>{inv.ulips[i].payTermEndDate=v;        autoSave('fin_investments',inv);})}
      </div>
    `).join('')}
  </div>`;
}

function renderGoals(content) {
  const g    = state.goals    || {};
  const trip = g.indiaTrip    || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Goals</div>
    <div class="grid-2">
      ${field('Emergency fund target (£)', 'number', g.emergencyFundTargetGBP, v=>{g.emergencyFundTargetGBP=v; autoSave('fin_goals',g);})}
      ${field('Wealth target (£)',         'number', g.wealthTargetGBP,        v=>{g.wealthTargetGBP=v;        autoSave('fin_goals',g);})}
      ${field('Target age',               'number', g.targetAge,              v=>{g.targetAge=v;              autoSave('fin_goals',g);})}
    </div>
    <p class="panel-title" style="margin:20px 0 10px;font-size:12px">India Trip</p>
    <div class="grid-2">
      ${field('Trip target (£)',   'number', trip.targetGBP, v=>{g.indiaTrip.targetGBP=v; autoSave('fin_goals',g);})}
      ${field('Saved so far (£)', 'number', trip.savedGBP,  v=>{g.indiaTrip.savedGBP=v;  autoSave('fin_goals',g);})}
      ${field('Deadline',         'date',   trip.deadline,  v=>{g.indiaTrip.deadline=v;  autoSave('fin_goals',g);})}
    </div>
  </div>`;
}

function renderProjections(content) {
  const nwp = state.settings?.nwProjection || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Net Worth Projections</div>
    <div class="grid-2">
      ${field('Pension growth rate (%/yr)',        'number', nwp.pensionGrowthRate,        v=>{state.settings.nwProjection={...nwp,pensionGrowthRate:v};        autoSave('fin_settings',state.settings);})}
      ${field('Career transition date',            'date',   nwp.careerTransitionDate,     v=>{state.settings.nwProjection={...nwp,careerTransitionDate:v};     autoSave('fin_settings',state.settings);})}
      ${field('New salary after transition (£/yr)','number', nwp.newSalaryGBP,            v=>{state.settings.nwProjection={...nwp,newSalaryGBP:v};            autoSave('fin_settings',state.settings);})}
    </div>
  </div>`;
}

function renderTaxSettings(content) {
  const tt = state.taxTracker || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Tax Tracker</div>
    <div class="grid-2">
      ${field('Tax code',                 'text',   tt.taxCode,           v=>{tt.taxCode=v;           autoSave('fin_tax_tracker',tt);})}
      ${field('Total underpayment (£)',   'number', tt.underpaymentTotal, v=>{tt.underpaymentTotal=v; autoSave('fin_tax_tracker',tt);})}
      ${field('Monthly deduction (£)',   'number', tt.monthlyDeduction,  v=>{tt.monthlyDeduction=v;  autoSave('fin_tax_tracker',tt);})}
      ${field('Start date',              'date',   tt.startDate,         v=>{tt.startDate=v;         autoSave('fin_tax_tracker',tt);})}
      ${field('End date',                'date',   tt.endDate,           v=>{tt.endDate=v;           autoSave('fin_tax_tracker',tt);})}
    </div>
  </div>`;
}

function renderDisplay(content) {
  const s = state.settings || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Display</div>
    <div class="grid-2">
      ${field('INR/GBP rate',                'number',   s.inrGbpRate,                v=>{s.inrGbpRate=v; state.profile.inrGbpRate=v; autoSave('fin_settings',s); autoSave('fin_profile',state.profile);})}
      ${field('Inactivity timeout (minutes)','number',   s.inactivityTimeoutMinutes,  v=>{s.inactivityTimeoutMinutes=v; autoSave('fin_settings',s);})}
      ${field('Show INR equivalents',        'checkbox', s.showInrEquivalents,        v=>{s.showInrEquivalents=v; autoSave('fin_settings',s);})}
    </div>
  </div>`;
}

function renderChartParams(content) {
  const cp = state.settings?.chartParams || {};
  const at = cp.ageTrajectory || {};
  const bg = cp.budgetByCategory || {};
  const cg = cp.compoundGrowth || {};
  const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];

  const ensureCp = () => {
    if (!state.settings.chartParams) state.settings.chartParams = {};
  };

  content.innerHTML = `
    <div class="panel">
      <div class="panel-title" style="margin-bottom:20px">Age Trajectory Chart</div>
      <div class="grid-2">
        ${field('Current age',                      'number', at.currentAge||25,                    v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.currentAge=v;                          autoSave('fin_settings',state.settings);})}
        ${field('Target age',                       'number', at.targetAge||50,                     v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.targetAge=v;                           autoSave('fin_settings',state.settings);})}
        ${field('Growth rate (%/yr)',               'number', at.growthRatePercent||10,             v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.growthRatePercent=v;                  autoSave('fin_settings',state.settings);})}
        ${field('Career transition age',            'number', at.careerTransitionAge||28,           v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.careerTransitionAge=v;                autoSave('fin_settings',state.settings);})}
        ${field('Post-transition surplus (£/mo)',   'number', at.careerTransitionMonthlySurplus||860,v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.careerTransitionMonthlySurplus=v;   autoSave('fin_settings',state.settings);})}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-title" style="margin-bottom:20px">Budget by Category (£/mo)</div>
      <div class="grid-2">
        ${CATS.map(cat => field(cat, 'number', bg[cat]??0, v=>{ensureCp();if(!state.settings.chartParams.budgetByCategory)state.settings.chartParams.budgetByCategory={};state.settings.chartParams.budgetByCategory[cat]=v;autoSave('fin_settings',state.settings);})).join('')}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-title" style="margin-bottom:20px">Compound Growth Projector</div>
      <div class="grid-2">
        ${field('Monthly amount (£)', 'number', cg.monthlyAmount||217, v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.monthlyAmount=v; autoSave('fin_settings',state.settings);})}
        ${field('Annual rate (%)',    'number', cg.ratePercent||10,     v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.ratePercent=v;    autoSave('fin_settings',state.settings);})}
        ${field('Years',             'number', cg.years||25,           v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.years=v;          autoSave('fin_settings',state.settings);})}
      </div>
    </div>`;
}

function renderData(content) {
  content.innerHTML = `<div class="grid-3">
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Export</span></div>
      <p class="label-muted" style="margin-bottom:14px">Export all your locally stored data as JSON.</p>
      <button class="btn btn-secondary" id="data-export-btn">Export JSON backup</button>
    </div>
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Import</span></div>
      <p class="label-muted" style="margin-bottom:14px">Restore from a JSON backup.</p>
      <input type="file" id="data-import-file" accept=".json" style="display:none">
      <button class="btn btn-secondary" id="data-import-btn">Import JSON backup</button>
    </div>
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Reset</span></div>
      <p class="label-muted" style="margin-bottom:14px">Reset all data to defaults. <strong style="color:var(--color-negative)">Cannot be undone.</strong></p>
      <button class="btn btn-danger" id="data-reset-btn">Reset to defaults</button>
    </div>
  </div>`;

  document.getElementById('data-export-btn').addEventListener('click', () => {
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('fin_')||k.startsWith('auth_')||k.startsWith('enc_'));
    const data = {};
    keys.forEach(k => data[k] = localStorage.getItem(k));
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=`FinanceDashboard_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  });

  document.getElementById('data-import-btn').addEventListener('click', () =>
    document.getElementById('data-import-file').click()
  );
  document.getElementById('data-import-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if(!file) return;
    const data = JSON.parse(await file.text());
    Object.entries(data).forEach(([k,v]) => localStorage.setItem(k,v));
    alert('Import successful. Reloading...');
    location.reload();
  });

  document.getElementById('data-reset-btn').addEventListener('click', async () => {
    if (!confirm('Reset ALL financial data to defaults? This cannot be undone.')) return;
    await initializeDefaults();
    alert('Data reset to defaults.');
    location.reload();
  });
}
