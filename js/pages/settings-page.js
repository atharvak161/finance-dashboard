import { initPage, saveSec } from '../page-init.js';
import { save, initializeDefaults } from '../store.js';
import { fetchLiveRate, clearFxCache } from '../fx-rate.js';

const state = await initPage('settings');

// ── Tab management ────────────────────────────────────────────

let _currentTab = 'profile';

document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _currentTab = btn.dataset.tab;
    // NOTE: switching tabs re-renders from `state` (in-memory). Any edits made
    // on the previous tab that were NOT saved are still held in `state` for the
    // current session, but they are NOT persisted to localStorage until the
    // user clicks Save on that tab. Reloading the page before saving loses them.
    renderTab(_currentTab);
  });
});

// ── Explicit-save state ───────────────────────────────────────
//
// Replaces the old auto-save-on-keypress approach. Typing now only mutates the
// in-memory objects (held inside `state`); nothing is written to localStorage
// and nothing re-renders until the user clicks the tab's Save button.
//
// `_pendingState[storeKey]` holds the list of {key, obj} pairs that the current
// tab's Save button must persist. A tab may persist more than one store key
// (e.g. Profile writes fin_profile + fin_settings + fin_goals).

// ── All module-level constants must be declared BEFORE renderTab() is called ──
// renderTab → render* → registerSave/saveButtonHtml all read these.
// Any const/let declared after the renderTab() call is in the TDZ when
// those functions run, causing a silent ReferenceError and blank content.

const _pendingState = {}; // storeKey → [{ key, obj }, ...]
let _currentStoreKey = null;
const _saveBtnId = 'settings-save-btn'; // also needed by saveButtonHtml()

// Register a save target for the currently-rendering tab. Called by each
// render function. The first registered key becomes the tab's primary storeKey.
function registerSave(key, obj) {
  if (_currentStoreKey === null) {
    _currentStoreKey = key;
    _pendingState[key] = [];
  }
  const list = _pendingState[_currentStoreKey];
  if (!list.some(e => e.key === key)) {
    list.push({ key, obj });
  } else {
    list.find(e => e.key === key).obj = obj;
  }
}

// Initial render — runs after all declarations above are initialised.
renderTab('profile');

// Save handler shared by every tab's Save button.
async function saveCurrentTab(btn) {
  const storeKey = _currentStoreKey;
  if (!storeKey || !_pendingState[storeKey]) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    // Persist every registered store key for this tab. saveSec writes to
    // localStorage and re-runs highlightEmptyData (amber highlights update).
    for (const { key, obj } of _pendingState[storeKey]) {
      await saveSec(key, obj);
    }

    btn.textContent = '✓ Saved';
    // Show the "✓ Saved" confirmation for 2s, THEN re-render the tab. Re-rendering
    // is safe here because the user clicked the button — no input is focused, so
    // we will not steal focus mid-typing. The re-render rebuilds the fresh "Save"
    // button (and refreshes any computed/defaulted field values).
    setTimeout(() => renderTab(_currentTab), 2000);
  } catch (err) {
    console.error('Settings save failed:', err);
    btn.textContent = '✕ Error';
    setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 2000);
  }
}

// Builds the Save-button HTML appended to the bottom of each tab. The onclick
// wiring is attached afterwards by _attachSaveButton().
// NOTE: _saveBtnId is declared near the top of the module (before renderTab).
function saveButtonHtml() {
  return `<div style="margin-top:20px;display:flex;justify-content:flex-end">
    <button id="${_saveBtnId}" class="btn btn-primary" type="button">Save</button>
  </div>`;
}
function _attachSaveButton() {
  setTimeout(() => {
    const btn = document.getElementById(_saveBtnId);
    if (!btn) return;
    btn.addEventListener('click', () => saveCurrentTab(btn));
  }, 0);
}

// ── Field helpers ─────────────────────────────────────────────

function field(label, type, value, onChange, hint='') {
  const id = 'sf_' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    // Both input and change ONLY update the in-memory state object via onChange.
    // No save and no re-render happen here — that is the Save button's job.
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

// ── Live FX rate helper ───────────────────────────────────────

function _attachFxButton(btnId, inputId, statusId) {
  setTimeout(() => {
    const btn    = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    const input  = document.getElementById(inputId);
    if (!btn || !status || !input) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Fetching…';
      status.textContent = '';

      const result = await fetchLiveRate();

      btn.disabled = false;
      btn.textContent = 'Fetch live rate';

      if (result.source === 'error' || result.rate === null) {
        status.textContent = 'Could not fetch live rate. Enter manually.';
        status.style.color = 'var(--color-negative)';
      } else {
        input.value = result.rate;
        // Trigger the input event so the onChange handler updates the state object
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const label = result.source === 'cache' ? 'Cached rate' : 'Live rate';
        const dateStr = result.date ? ` as of ${result.date}` : '';
        status.textContent = `${label}: ${result.rate}${dateStr} — click Save to apply`;
        status.style.color = 'var(--color-positive, #4caf50)';
      }
    });
  }, 0);
}

// ── Tab renderers ─────────────────────────────────────────────

function renderTab(tab) {
  // Reset the per-tab save registration before building the new tab.
  _currentStoreKey = null;
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
  registerSave('fin_profile', p);
  registerSave('fin_settings', state.settings);
  registerSave('fin_goals', state.goals);
  const rateInputId = 'fx-rate-input-profile';
  const rateStatusId = 'fx-rate-status-profile';
  setTimeout(() => {
    const el = document.getElementById(rateInputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value) || 0;
      p.inrGbpRate = v;
      state.settings.inrGbpRate = v;
    });
    el.addEventListener('change', () => {
      const v = parseFloat(el.value) || 0;
      p.inrGbpRate = v;
      state.settings.inrGbpRate = v;
    });
  }, 0);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Profile</div>
    <div class="grid-2">
      ${field('Full name',              'text',   p.name,              v=>{p.name=v;})}
      ${field('Age',                    'number', p.age,               v=>{p.age=v;})}
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">INR/GBP rate</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="${rateInputId}" class="form-input" value="${p.inrGbpRate ?? ''}" step="any" style="flex:1" />
          <button id="fx-btn-profile" class="btn btn-secondary btn-sm" type="button">Fetch live rate</button>
        </div>
        <span id="${rateStatusId}" class="label-muted" style="font-size:12px;margin-top:2px"></span>
      </div>
      ${field('Target age for wealth',  'number', p.targetAge,         v=>{p.targetAge=v;})}
      ${field('Wealth target (£)',       'number', p.wealthTargetGBP,   v=>{p.wealthTargetGBP=v; state.goals.wealthTargetGBP=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachFxButton('fx-btn-profile', rateInputId, rateStatusId);
  _attachSaveButton();
}

function renderIncome(content) {
  const inc = state.income || {};
  registerSave('fin_income', inc);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Income Settings</div>
    <div class="grid-2">
      ${field('Base salary (£/yr)',           'number', inc.baseSalaryGBP,          v=>{inc.baseSalaryGBP=v;})}
      ${field('Avg overtime gross (£/mo)',    'number', inc.avgOvertimeGrossGBP,    v=>{inc.avgOvertimeGrossGBP=v;})}
      ${field('Hours/week',                   'number', inc.hoursPerWeek,           v=>{inc.hoursPerWeek=v;})}
      ${field('Tax-free allowance (£/yr)',    'number', inc.taxFreeAllowanceAnnual, v=>{inc.taxFreeAllowanceAnnual=v;})}
      ${field('Pension employee (%)',         'number', inc.pensionEmployeeRate,    v=>{inc.pensionEmployeeRate=v;})}
      ${field('Pension employer (%)',         'number', inc.pensionEmployerRate,    v=>{inc.pensionEmployerRate=v;})}
      ${field('Underpayment deduction (£/mo)','number', inc.underpaymentMonthlyGBP,v=>{inc.underpaymentMonthlyGBP=v;})}
      ${field('Underpayment clears',          'date',   inc.underpaymentClearsDate, v=>{inc.underpaymentClearsDate=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderExpenses(content) {
  // Read-only tab (expenses are edited on the Expenses page) — no Save button.
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
  registerSave('fin_debts', state.debts);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">SBI Loan</div>
    <div class="grid-2">
      ${field('Outstanding (₹)',        'number', sbi.outstandingINR,   v=>{state.debts.sbi.outstandingINR=v;})}
      ${field('Interest rate (%)',      'number', sbi.ratePercent,      v=>{state.debts.sbi.ratePercent=v;})}
      ${field('EMI (₹/mo)',            'number', sbi.emiINR,           v=>{state.debts.sbi.emiINR=v;})}
      ${field('Extra payment (₹/mo)',  'number', sbi.extraMonthlyINR,  v=>{state.debts.sbi.extraMonthlyINR=v;})}
      ${field('Start date',            'date',   sbi.startDate,        v=>{state.debts.sbi.startDate=v;})}
      ${field('Co-applicant',          'text',   sbi.coApplicant,      v=>{state.debts.sbi.coApplicant=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderInvestments(content) {
  const inv = state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  registerSave('fin_investments', inv);
  const p = inv.pensions?.[0] || {};
  const c = inv.cashAccounts?.[0] || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Investments</div>
    <p class="panel-title" style="margin-bottom:10px;font-size:12px">Pension</p>
    <div class="grid-2">
      ${field('Pension value (£)',         'number', p.valueGBP,  v=>{inv.pensions[0].valueGBP=v;})}
      ${field('Monthly contribution (£)',  'number', p.monthlyGBP,v=>{inv.pensions[0].monthlyGBP=v;})}
    </div>
    <p class="panel-title" style="margin:20px 0 10px;font-size:12px">Cash / Savings</p>
    <div class="grid-2">
      ${field('Balance (£)',  'number', c.balanceGBP, v=>{inv.cashAccounts[0].balanceGBP=v;})}
      ${field('AER (%)',      'number', c.aerPercent,  v=>{inv.cashAccounts[0].aerPercent=v;})}
    </div>
    ${inv.ulips.map((u,i)=>`
      <p class="panel-title" style="margin:20px 0 10px;font-size:12px">ULIP — ${u.name}</p>
      <div class="grid-2">
        ${field('Current value ('+u.currency+')',  'number', u.currentValue,         v=>{inv.ulips[i].currentValue=v;})}
        ${field('Monthly premium ('+u.currency+')', 'number', u.monthlyPremium,      v=>{inv.ulips[i].monthlyPremium=v;})}
        ${field('Conservative rate (%)',           'number', u.conservativeRatePercent,v=>{inv.ulips[i].conservativeRatePercent=v;})}
        ${field('Expected rate (%)',               'number', u.expectedRatePercent,   v=>{inv.ulips[i].expectedRatePercent=v;})}
        ${field('Aggressive rate (%)',             'number', u.aggressiveRatePercent, v=>{inv.ulips[i].aggressiveRatePercent=v;})}
        ${field('Pay term end date',               'date',   u.payTermEndDate,        v=>{inv.ulips[i].payTermEndDate=v;})}
      </div>
    `).join('')}
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderGoals(content) {
  const g    = state.goals    || {};
  const trip = g.indiaTrip    || {};
  registerSave('fin_goals', g);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Goals</div>
    <div class="grid-2">
      ${field('Emergency fund target (£)', 'number', g.emergencyFundTargetGBP, v=>{g.emergencyFundTargetGBP=v;})}
      ${field('Wealth target (£)',         'number', g.wealthTargetGBP,        v=>{g.wealthTargetGBP=v;})}
      ${field('Target age',               'number', g.targetAge,              v=>{g.targetAge=v;})}
    </div>
    <p class="panel-title" style="margin:20px 0 10px;font-size:12px">India Trip</p>
    <div class="grid-2">
      ${field('Trip target (£)',   'number', trip.targetGBP, v=>{g.indiaTrip.targetGBP=v;})}
      ${field('Saved so far (£)', 'number', trip.savedGBP,  v=>{g.indiaTrip.savedGBP=v;})}
      ${field('Deadline',         'date',   trip.deadline,  v=>{g.indiaTrip.deadline=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderProjections(content) {
  // Ensure a live nwProjection object exists and mutate IT directly. The old
  // code spread a stale {...nwp} snapshot per field, which (without a re-render
  // between keystrokes) would lose earlier edits when editing multiple fields
  // before Save. Mutating the live object avoids that.
  if (!state.settings.nwProjection) state.settings.nwProjection = {};
  const nwp = state.settings.nwProjection;
  registerSave('fin_settings', state.settings);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Net Worth Projections</div>
    <div class="grid-2">
      ${field('Pension growth rate (%/yr)',        'number', nwp.pensionGrowthRate,        v=>{nwp.pensionGrowthRate=v;})}
      ${field('Career transition date',            'date',   nwp.careerTransitionDate,     v=>{nwp.careerTransitionDate=v;})}
      ${field('New salary after transition (£/yr)','number', nwp.newSalaryGBP,            v=>{nwp.newSalaryGBP=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderTaxSettings(content) {
  const tt = state.taxTracker || {};
  registerSave('fin_tax_tracker', tt);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Tax Tracker</div>
    <div class="grid-2">
      ${field('Tax code',                 'text',   tt.taxCode,           v=>{tt.taxCode=v;})}
      ${field('Total underpayment (£)',   'number', tt.underpaymentTotal, v=>{tt.underpaymentTotal=v;})}
      ${field('Monthly deduction (£)',   'number', tt.monthlyDeduction,  v=>{tt.monthlyDeduction=v;})}
      ${field('Start date',              'date',   tt.startDate,         v=>{tt.startDate=v;})}
      ${field('End date',                'date',   tt.endDate,           v=>{tt.endDate=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachSaveButton();
}

function renderDisplay(content) {
  const s = state.settings || {};
  registerSave('fin_settings', s);
  registerSave('fin_profile', state.profile);
  const rateInputId  = 'fx-rate-input-display';
  const rateStatusId = 'fx-rate-status-display';
  setTimeout(() => {
    const el = document.getElementById(rateInputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value) || 0;
      s.inrGbpRate = v;
      state.profile.inrGbpRate = v;
    });
    el.addEventListener('change', () => {
      const v = parseFloat(el.value) || 0;
      s.inrGbpRate = v;
      state.profile.inrGbpRate = v;
    });
  }, 0);
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:20px">Display</div>
    <div class="grid-2">
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">INR/GBP rate</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="${rateInputId}" class="form-input" value="${s.inrGbpRate ?? ''}" step="any" style="flex:1" />
          <button id="fx-btn-display" class="btn btn-secondary btn-sm" type="button">Fetch live rate</button>
        </div>
        <span id="${rateStatusId}" class="label-muted" style="font-size:12px;margin-top:2px"></span>
      </div>
      ${field('Inactivity timeout (minutes)','number',   s.inactivityTimeoutMinutes,  v=>{s.inactivityTimeoutMinutes=v;})}
      ${field('Show INR equivalents',        'checkbox', s.showInrEquivalents,        v=>{s.showInrEquivalents=v;})}
    </div>
    ${saveButtonHtml()}
  </div>`;
  _attachFxButton('fx-btn-display', rateInputId, rateStatusId);
  _attachSaveButton();
}

function renderChartParams(content) {
  const cp = state.settings?.chartParams || {};
  const at = cp.ageTrajectory || {};
  const bg = cp.budgetByCategory || {};
  const cg = cp.compoundGrowth || {};
  const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];

  registerSave('fin_settings', state.settings);

  const ensureCp = () => {
    if (!state.settings.chartParams) state.settings.chartParams = {};
  };

  content.innerHTML = `
    <div class="panel">
      <div class="panel-title" style="margin-bottom:20px">Age Trajectory Chart</div>
      <div class="grid-2">
        ${field('Current age',                      'number', at.currentAge||25,                    v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.currentAge=v;})}
        ${field('Target age',                       'number', at.targetAge||50,                     v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.targetAge=v;})}
        ${field('Growth rate (%/yr)',               'number', at.growthRatePercent||10,             v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.growthRatePercent=v;})}
        ${field('Career transition age',            'number', at.careerTransitionAge||28,           v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.careerTransitionAge=v;})}
        ${field('Post-transition surplus (£/mo)',   'number', at.careerTransitionMonthlySurplus||860,v=>{ensureCp();if(!state.settings.chartParams.ageTrajectory)state.settings.chartParams.ageTrajectory={};state.settings.chartParams.ageTrajectory.careerTransitionMonthlySurplus=v;})}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-title" style="margin-bottom:20px">Budget by Category (£/mo)</div>
      <div class="grid-2">
        ${CATS.map(cat => field(cat, 'number', bg[cat]??0, v=>{ensureCp();if(!state.settings.chartParams.budgetByCategory)state.settings.chartParams.budgetByCategory={};state.settings.chartParams.budgetByCategory[cat]=v;})).join('')}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-title" style="margin-bottom:20px">Compound Growth Projector</div>
      <div class="grid-2">
        ${field('Monthly amount (£)', 'number', cg.monthlyAmount||217, v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.monthlyAmount=v;})}
        ${field('Annual rate (%)',    'number', cg.ratePercent||10,     v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.ratePercent=v;})}
        ${field('Years',             'number', cg.years||25,           v=>{ensureCp();if(!state.settings.chartParams.compoundGrowth)state.settings.chartParams.compoundGrowth={};state.settings.chartParams.compoundGrowth.years=v;})}
      </div>
      ${saveButtonHtml()}
    </div>`;
  _attachSaveButton();
}

function renderData(content) {
  // Import/Export/Reset actions — these persist immediately by design, no Save button.
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
