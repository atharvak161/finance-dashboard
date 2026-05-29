import { save } from './store.js';
import { changePassword, getEncKey } from './auth.js';
import { reEncryptAll } from './store.js';

let _state, _saveAll, _refreshAll;

export function initSettings(state, saveAll, refreshAll) {
  _state    = state;
  _saveAll  = saveAll;
  _refreshAll = refreshAll;

  const content = document.getElementById('settings-content');
  if (!content) return;

  // Tab switching
  document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#settings-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(btn.dataset.tab);
    };
  });

  renderTab('profile');
}

function renderTab(tab) {
  const content = document.getElementById('settings-content');
  switch(tab) {
    case 'profile':     renderProfile(content);     break;
    case 'income':      renderIncomeSettings(content);  break;
    case 'expenses':    renderExpensesSettings(content);break;
    case 'debts':       renderDebtSettings(content);    break;
    case 'investments': renderInvSettings(content);     break;
    case 'goals':       renderGoalSettings(content);    break;
    case 'display':     renderDisplaySettings(content); break;
    case 'security':    renderSecuritySettings(content);break;
    case 'data':        renderDataSettings(content);    break;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function field(label, type, value, onChange, hint='') {
  const id = 'sf_'+Math.random().toString(36).slice(2,8);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = el.type==='checkbox' ? el.checked
              : el.type==='number'   ? (parseFloat(el.value)||0)
              : el.value;
      onChange(v);
    });
  }, 0);
  return `<div class="form-group" style="margin-bottom:12px">
    <label class="form-label">${label}</label>
    ${type==='checkbox'
      ? `<input type="checkbox" id="${id}" ${value?'checked':''}>`
      : `<input type="${type}" id="${id}" class="form-input" value="${value||''}" ${type==='number'?'step="any"':''} />`}
    ${hint?`<span class="label-muted">${hint}</span>`:''}
  </div>`;
}

async function autoSave(storeKey, obj) {
  await save(storeKey, obj);
  _refreshAll();
}

// ── Profile ──────────────────────────────────────────────────

function renderProfile(content) {
  const p = _state.profile || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Profile</div>
    <div class="grid-2">
      ${field('Full name', 'text', p.name, v => { _state.profile.name=v; autoSave('fin_profile',_state.profile); })}
      ${field('Age', 'number', p.age, v => { _state.profile.age=v; autoSave('fin_profile',_state.profile); })}
      ${field('INR/GBP rate', 'number', p.inrGbpRate, v => { _state.profile.inrGbpRate=v; _state.settings.inrGbpRate=v; autoSave('fin_profile',_state.profile); autoSave('fin_settings',_state.settings); })}
      ${field('Target age for wealth', 'number', p.targetAge, v => { _state.profile.targetAge=v; autoSave('fin_profile',_state.profile); })}
      ${field('Wealth target (£)', 'number', p.wealthTargetGBP, v => { _state.profile.wealthTargetGBP=v; _state.goals.wealthTargetGBP=v; autoSave('fin_profile',_state.profile); autoSave('fin_goals',_state.goals); })}
    </div>
  </div>`;
}

// ── Income ───────────────────────────────────────────────────

function renderIncomeSettings(content) {
  const inc = _state.income || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Income Settings</div>
    <div class="grid-2">
      ${field('Base salary (£/yr)', 'number', inc.baseSalaryGBP, v=>{inc.baseSalaryGBP=v;autoSave('fin_income',inc);})}
      ${field('Avg overtime gross (£/mo)', 'number', inc.avgOvertimeGrossGBP, v=>{inc.avgOvertimeGrossGBP=v;autoSave('fin_income',inc);})}
      ${field('Hours/week', 'number', inc.hoursPerWeek, v=>{inc.hoursPerWeek=v;autoSave('fin_income',inc);})}
      ${field('Tax-free allowance (£/yr)', 'number', inc.taxFreeAllowanceAnnual, v=>{inc.taxFreeAllowanceAnnual=v;autoSave('fin_income',inc);})}
      ${field('Pension employee (%)', 'number', inc.pensionEmployeeRate, v=>{inc.pensionEmployeeRate=v;autoSave('fin_income',inc);})}
      ${field('Pension employer (%)', 'number', inc.pensionEmployerRate, v=>{inc.pensionEmployerRate=v;autoSave('fin_income',inc);})}
      ${field('Underpayment (£/mo)', 'number', inc.underpaymentMonthlyGBP, v=>{inc.underpaymentMonthlyGBP=v;autoSave('fin_income',inc);})}
      ${field('Underpayment clears', 'date', inc.underpaymentClearsDate, v=>{inc.underpaymentClearsDate=v;autoSave('fin_income',inc);})}
    </div>
  </div>`;
}

// ── Expenses ─────────────────────────────────────────────────

function renderExpensesSettings(content) {
  const exp = _state.expenses || { items:[], scheduledChanges:[] };
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Expenses</div>
    <p class="label-muted" style="margin-bottom:12px">Edit expenses from the Expenses section. Scheduled changes shown below.</p>
    <table class="data-table">
      <thead><tr><th>Expense</th><th>Change date</th><th class="td-right">New amount</th><th>Note</th></tr></thead>
      <tbody>
        ${exp.scheduledChanges.map(sc=>{
          const item = exp.items.find(i=>i.id===sc.expenseId);
          return `<tr><td>${item?.name||sc.expenseId}</td><td>${sc.changeDate}</td><td class="td-right mono">£${sc.newMonthlyGBP}</td><td style="font-size:12px">${sc.note||''}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── Debts ─────────────────────────────────────────────────────

function renderDebtSettings(content) {
  const sbi = _state.debts?.sbi || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">SBI Loan</div>
    <div class="grid-2">
      ${field('Outstanding (₹)', 'number', sbi.outstandingINR, v=>{_state.debts.sbi.outstandingINR=v;autoSave('fin_debts',_state.debts);})}
      ${field('Interest rate (%)', 'number', sbi.ratePercent, v=>{_state.debts.sbi.ratePercent=v;autoSave('fin_debts',_state.debts);})}
      ${field('EMI (₹/mo)', 'number', sbi.emiINR, v=>{_state.debts.sbi.emiINR=v;autoSave('fin_debts',_state.debts);})}
      ${field('Extra payment (₹/mo)', 'number', sbi.extraMonthlyINR, v=>{_state.debts.sbi.extraMonthlyINR=v;autoSave('fin_debts',_state.debts);})}
      ${field('Start date', 'date', sbi.startDate, v=>{_state.debts.sbi.startDate=v;autoSave('fin_debts',_state.debts);})}
    </div>
  </div>`;
}

// ── Investments ───────────────────────────────────────────────

function renderInvSettings(content) {
  const inv = _state.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const p   = inv.pensions?.[0] || {};
  const c   = inv.cashAccounts?.[0] || {};

  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Investments</div>
    <div class="panel-title" style="margin-bottom:8px;font-size:12px">Pension</div>
    <div class="grid-2">
      ${field('Pension value (£)', 'number', p.valueGBP, v=>{inv.pensions[0].valueGBP=v;autoSave('fin_investments',inv);})}
      ${field('Monthly contribution (£)', 'number', p.monthlyGBP, v=>{inv.pensions[0].monthlyGBP=v;autoSave('fin_investments',inv);})}
    </div>
    <div class="panel-title" style="margin:16px 0 8px;font-size:12px">Cash / Savings</div>
    <div class="grid-2">
      ${field('Balance (£)', 'number', c.balanceGBP, v=>{inv.cashAccounts[0].balanceGBP=v;autoSave('fin_investments',inv);})}
      ${field('AER (%)', 'number', c.aerPercent, v=>{inv.cashAccounts[0].aerPercent=v;autoSave('fin_investments',inv);})}
    </div>
    ${inv.ulips.map((u,i)=>`
      <div class="panel-title" style="margin:16px 0 8px;font-size:12px">ULIP — ${u.name}</div>
      <div class="grid-2">
        ${field('Current value ('+u.currency+')', 'number', u.currentValue, v=>{inv.ulips[i].currentValue=v;autoSave('fin_investments',inv);})}
        ${field('Monthly premium ('+u.currency+')', 'number', u.monthlyPremium, v=>{inv.ulips[i].monthlyPremium=v;autoSave('fin_investments',inv);})}
        ${field('Conservative rate (%)', 'number', u.conservativeRatePercent, v=>{inv.ulips[i].conservativeRatePercent=v;autoSave('fin_investments',inv);})}
        ${field('Expected rate (%)', 'number', u.expectedRatePercent, v=>{inv.ulips[i].expectedRatePercent=v;autoSave('fin_investments',inv);})}
        ${field('Aggressive rate (%)', 'number', u.aggressiveRatePercent, v=>{inv.ulips[i].aggressiveRatePercent=v;autoSave('fin_investments',inv);})}
        ${field('Pay term end date', 'date', u.payTermEndDate, v=>{inv.ulips[i].payTermEndDate=v;autoSave('fin_investments',inv);})}
      </div>
    `).join('')}
  </div>`;
}

// ── Goals ─────────────────────────────────────────────────────

function renderGoalSettings(content) {
  const g   = _state.goals || {};
  const trip = g.indiaTrip || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Goals</div>
    <div class="grid-2">
      ${field('Emergency fund target (£)', 'number', g.emergencyFundTargetGBP, v=>{g.emergencyFundTargetGBP=v;autoSave('fin_goals',g);})}
      ${field('Wealth target (£)', 'number', g.wealthTargetGBP, v=>{g.wealthTargetGBP=v;autoSave('fin_goals',g);})}
      ${field('Target age', 'number', g.targetAge, v=>{g.targetAge=v;autoSave('fin_goals',g);})}
    </div>
    <div class="panel-title" style="margin:16px 0 8px;font-size:12px">India Trip</div>
    <div class="grid-2">
      ${field('Trip target (£)', 'number', trip.targetGBP, v=>{g.indiaTrip.targetGBP=v;autoSave('fin_goals',g);})}
      ${field('Saved so far (£)', 'number', trip.savedGBP, v=>{g.indiaTrip.savedGBP=v;autoSave('fin_goals',g);})}
      ${field('Deadline', 'date', trip.deadline, v=>{g.indiaTrip.deadline=v;autoSave('fin_goals',g);})}
    </div>
  </div>`;
}

// ── Display ───────────────────────────────────────────────────

function renderDisplaySettings(content) {
  const s = _state.settings || {};
  content.innerHTML = `<div class="panel"><div class="panel-title" style="margin-bottom:16px">Display</div>
    <div class="grid-2">
      ${field('INR/GBP rate', 'number', s.inrGbpRate, v=>{s.inrGbpRate=v;_state.profile.inrGbpRate=v;autoSave('fin_settings',s);autoSave('fin_profile',_state.profile);})}
      ${field('Inactivity timeout (minutes)', 'number', s.inactivityTimeoutMinutes, v=>{s.inactivityTimeoutMinutes=v;autoSave('fin_settings',s);})}
      ${field('Show INR equivalents', 'checkbox', s.showInrEquivalents, v=>{s.showInrEquivalents=v;autoSave('fin_settings',s);})}
    </div>
  </div>`;
}

// ── Security ──────────────────────────────────────────────────

function renderSecuritySettings(content) {
  content.innerHTML = `<div class="panel">
    <div class="panel-title" style="margin-bottom:16px">Change Password</div>
    <div style="max-width:400px;display:flex;flex-direction:column;gap:12px">
      <div class="form-group"><label class="form-label">Current password</label><input type="password" id="sec-cur-pwd" class="form-input" /></div>
      <div class="form-group"><label class="form-label">New password</label><input type="password" id="sec-new-pwd" class="form-input" /></div>
      <div class="form-group"><label class="form-label">Confirm new password</label><input type="password" id="sec-conf-pwd" class="form-input" /></div>
      <div id="sec-error" class="login-error" style="display:none"></div>
      <div id="sec-success" class="alert alert-success" style="display:none">Password changed successfully.</div>
      <button class="btn btn-primary" id="sec-change-btn">Change Password</button>
    </div>
  </div>`;

  document.getElementById('sec-change-btn').addEventListener('click', async () => {
    const cur  = document.getElementById('sec-cur-pwd').value;
    const nw   = document.getElementById('sec-new-pwd').value;
    const conf = document.getElementById('sec-conf-pwd').value;
    const errEl = document.getElementById('sec-error');
    const okEl  = document.getElementById('sec-success');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    if (nw !== conf) { errEl.textContent='Passwords do not match.'; errEl.style.display='block'; return; }
    try {
      await changePassword(cur, nw, reEncryptAll);
      okEl.style.display = 'block';
      document.getElementById('sec-cur-pwd').value = '';
      document.getElementById('sec-new-pwd').value = '';
      document.getElementById('sec-conf-pwd').value = '';
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
}

// ── Data ──────────────────────────────────────────────────────

function renderDataSettings(content) {
  content.innerHTML = `<div class="panel">
    <div class="panel-title" style="margin-bottom:16px">Data Management</div>
    <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
      <div>
        <p class="label-muted" style="margin-bottom:8px">Export all your encrypted data as JSON.</p>
        <button class="btn btn-secondary" id="data-export-btn">Export JSON backup</button>
      </div>
      <hr class="divider" />
      <div>
        <p class="label-muted" style="margin-bottom:8px">Import a JSON backup.</p>
        <input type="file" id="data-import-file" accept=".json" style="display:none" />
        <button class="btn btn-secondary" id="data-import-btn">Import JSON backup</button>
      </div>
      <hr class="divider" />
      <div>
        <p class="label-muted" style="margin-bottom:8px">Reset all data to defaults. <strong style="color:var(--color-negative)">This cannot be undone.</strong></p>
        <button class="btn btn-danger" id="data-reset-btn">Reset to defaults</button>
      </div>
    </div>
  </div>`;

  document.getElementById('data-export-btn').addEventListener('click', () => {
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('fin_')||k.startsWith('auth_')||k.startsWith('enc_'));
    const data = {};
    keys.forEach(k => data[k] = localStorage.getItem(k));
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `FinanceDashboard_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  });

  document.getElementById('data-import-btn').addEventListener('click', () => {
    document.getElementById('data-import-file').click();
  });

  document.getElementById('data-import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    Object.entries(data).forEach(([k,v]) => localStorage.setItem(k,v));
    alert('Import successful. Reloading...');
    window.location.reload();
  });

  document.getElementById('data-reset-btn').addEventListener('click', async () => {
    if (!confirm('Reset ALL financial data to defaults? This cannot be undone.')) return;
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('fin_'));
    keys.forEach(k=>localStorage.removeItem(k));
    const { initializeDefaults } = await import('./store.js');
    const { getEncKey } = await import('./auth.js');
    await initializeDefaults(getEncKey());
    await _refreshAll();
    alert('Data reset to defaults.');
  });
}
