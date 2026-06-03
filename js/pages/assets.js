import { initPage, saveSec } from '../page-init.js';
import {
  ulipValueGBP, ulipPremiumGBP, fmtGBP, fmtINR, round2
} from '../calc.js';

const state = await initPage('assets');

// Which tab is active, and which section (if any) is currently being edited.
let _tab     = 'cash';
let _editing = null; // null | 'cash' | 'pension' | 'ulips' | 'uk-ss' | 'uk-cash' | 'uk-lisa' | 'uk-sipp' | 'india-nps' | 'india-elss' | 'india-ppf' | 'india-sgb'

// ── Tab wiring ─────────────────────────────────────────────────

document.querySelectorAll('#assets-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#assets-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _tab = btn.dataset.tab;
    _editing = null; // leaving a tab cancels any in-progress edit
    renderTab();
  });
});

renderTab();

function inv() {
  return state.investments || (state.investments = { cashAccounts: [], pensions: [], ulips: [] });
}

function renderTab() {
  const rate = state.settings?.inrGbpRate || 83;
  switch (_tab) {
    case 'cash':    renderCash(rate);    break;
    case 'pension': renderPension(rate); break;
    case 'ulips':   renderULIPs(rate);   break;
    case 'uk':      renderUKWrappers(rate); break;
    case 'india':   renderIndia(rate);   break;
  }
}

// ── Generic edit helpers ───────────────────────────────────────

async function persist() {
  await saveSec('fin_investments', state.investments);
}

function editButton(section, label = '✏️ Edit') {
  return `<button class="btn btn-secondary btn-sm" data-edit="${section}">${label}</button>`;
}

function saveCancelBar(section) {
  return `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
    <button class="btn btn-secondary" data-cancel="${section}" type="button">Cancel</button>
    <button class="btn btn-primary" data-save="${section}" type="button">Save</button>
  </div>`;
}

// Wire edit/cancel buttons that simply toggle _editing and re-render.
function wireEditToggles(el) {
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { _editing = b.dataset.edit; renderTab(); }));
  el.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { _editing = null; renderTab(); }));
}

// Numeric/text/date field bound to a draft object.
function fld(label, draft, key, type = 'number') {
  const id = 'af_' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const e = document.getElementById(id);
    if (!e) return;
    const read = () => { draft[key] = type === 'number' ? (parseFloat(e.value) || 0) : e.value; };
    e.addEventListener('input', read);
    e.addEventListener('change', read);
  }, 0);
  const v = draft[key];
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" id="${id}" class="form-input" value="${v ?? (type === 'number' ? 0 : '')}" ${type === 'number' ? 'step="any"' : ''} />
  </div>`;
}

// ── CASH ───────────────────────────────────────────────────────

function renderCash(rate) {
  const el = document.getElementById('assets-content');
  const cash = inv().cashAccounts?.[0] || (inv().cashAccounts[0] = {});
  const editing = _editing === 'cash';

  if (!editing) {
    el.innerHTML = `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Cash / Savings</span>${editButton('cash')}</div>
        <div class="stat-row"><span class="stat-label">${cash.name || 'Savings'}</span><span class="stat-value mono">${fmtGBP(cash.balanceGBP || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">AER</span><span class="stat-value mono">${cash.aerPercent || 0}%</span></div>
        <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${cash.note || '—'}</span></div>
      </div>`;
    wireEditToggles(el);
    return;
  }

  const draft = { ...cash };
  el.innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Edit Cash / Savings</span></div>
      <div class="grid-2">
        ${fld('Account name', draft, 'name', 'text')}
        ${fld('Balance (£)', draft, 'balanceGBP')}
        ${fld('AER (%)', draft, 'aerPercent')}
        ${fld('Note', draft, 'note', 'text')}
      </div>
      ${saveCancelBar('cash')}
    </div>`;
  wireEditToggles(el);
  el.querySelector('[data-save="cash"]').addEventListener('click', async () => {
    Object.assign(inv().cashAccounts[0], draft);
    await persist();
    _editing = null;
    renderTab();
  });
}

// ── PENSION ────────────────────────────────────────────────────

function renderPension(rate) {
  const el = document.getElementById('assets-content');
  const pension = inv().pensions?.[0] || (inv().pensions[0] = {});
  const editing = _editing === 'pension';

  if (!editing) {
    el.innerHTML = `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Pension</span>
          <span style="display:flex;gap:8px;align-items:center"><span class="badge badge-positive">Active</span>${editButton('pension')}</span></div>
        <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${pension.provider || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(pension.valueGBP || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">Monthly contribution</span><span class="stat-value mono">${fmtGBP(pension.monthlyGBP || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${pension.note || '—'}</span></div>
      </div>`;
    wireEditToggles(el);
    return;
  }

  const draft = { ...pension };
  el.innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Edit Pension</span></div>
      <div class="grid-2">
        ${fld('Provider', draft, 'provider', 'text')}
        ${fld('Pension value (£)', draft, 'valueGBP')}
        ${fld('Monthly contribution (£)', draft, 'monthlyGBP')}
        ${fld('Note', draft, 'note', 'text')}
      </div>
      ${saveCancelBar('pension')}
    </div>`;
  wireEditToggles(el);
  el.querySelector('[data-save="pension"]').addEventListener('click', async () => {
    Object.assign(inv().pensions[0], draft);
    await persist();
    _editing = null;
    renderTab();
  });
}

// ── ULIPs (add / remove + per-card edit) ───────────────────────

function renderULIPs(rate) {
  const el = document.getElementById('assets-content');
  const ulips = inv().ulips || (inv().ulips = []);

  const cards = ulips.map((u, i) => {
    const valueGBP = ulipValueGBP(u, rate);
    const editing = _editing === 'ulip-' + i;

    if (editing) {
      const draft = { ...u };
      return `
        <div class="panel mt-12 ulip-card">
          <div class="panel-header"><span class="panel-title">Edit ULIP — ${u.name || 'ULIP'}</span></div>
          <div class="grid-2">
            ${fld('Name', draft, 'name', 'text')}
            ${fld('Insurer', draft, 'insurer', 'text')}
            ${fld('Currency (GBP/INR)', draft, 'currency', 'text')}
            ${fld('Current value (' + (draft.currency || '') + ')', draft, 'currentValue')}
            ${fld('Monthly premium (' + (draft.currency || '') + ')', draft, 'monthlyPremium')}
            ${fld('Sum assured (£)', draft, 'sumAssuredGBP')}
            ${fld('Conservative rate (%)', draft, 'conservativeRatePercent')}
            ${fld('Expected rate (%)', draft, 'expectedRatePercent')}
            ${fld('Aggressive rate (%)', draft, 'aggressiveRatePercent')}
            ${fld('Total term (years)', draft, 'totalTermYears')}
            ${fld('Lock-in date', draft, 'lockInDate', 'date')}
            ${fld('Pay term end date', draft, 'payTermEndDate', 'date')}
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
            <button class="btn btn-secondary" data-cancel="ulip-${i}" type="button">Cancel</button>
            <button class="btn btn-primary" data-save-ulip="${i}" type="button">Save</button>
          </div>
        </div>`;
    }

    return `
      <div class="panel mt-12 ulip-card">
        <div class="ulip-header">
          <div><div class="ulip-name">${u.name || 'ULIP'}</div><div class="ulip-insurer">${u.insurer || ''} · ${u.currency || ''}</div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="text-align:right">
              <div class="metric-sm mono">${u.currency === 'GBP' ? fmtGBP(valueGBP) : fmtINR(u.currentValue || 0)}</div>
              <div class="label-muted">${u.currency === 'INR' ? fmtGBP(valueGBP) + ' equiv' : ''}</div>
            </div>
            ${editButton('ulip-' + i)}
            <button class="btn-icon danger" data-ulip-remove="${i}" title="Remove">×</button>
          </div>
        </div>
        <div class="stat-row"><span class="stat-label">Monthly premium</span><span class="stat-value mono">${u.currency === 'GBP' ? fmtGBP(u.monthlyPremium || 0) : fmtINR(u.monthlyPremium || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">Lock-in date</span><span class="stat-value mono">${u.lockInDate || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">Pay term ends</span><span class="stat-value mono">${u.payTermEndDate || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">Sum assured</span><span class="stat-value mono">${fmtGBP(u.sumAssuredGBP || 0)}</span></div>
        <div class="stat-row"><span class="stat-label">Rates (cons/exp/agg)</span><span class="stat-value mono">${u.conservativeRatePercent || 0}% / ${u.expectedRatePercent || 0}% / ${u.aggressiveRatePercent || 0}%</span></div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">ULIPs</span></div>
      <p class="label-muted">Unit-linked insurance plans. Add or remove plans, then edit each one's details.</p>
    </div>
    ${cards || '<div class="panel mt-12"><div class="empty-state">No ULIPs added yet.</div></div>'}
    <button class="btn btn-secondary mt-12" id="ulip-add-btn">+ Add ULIP</button>`;

  wireEditToggles(el);

  el.querySelectorAll('[data-save-ulip]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.saveUlip);
      const card = btn.closest('.ulip-card');
      // The draft for this card lives in the closure of the rendered inputs;
      // re-read straight from the inputs to be safe.
      const draft = {};
      card.querySelectorAll('.form-input').forEach(() => {});
      // Simpler: rebuild from the live inputs via fld's draft. Instead, re-collect:
      Object.assign(inv().ulips[i], collectUlipDraft(card, inv().ulips[i]));
      await persist();
      _editing = null;
      renderTab();
    });
  });

  el.querySelectorAll('[data-ulip-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.ulipRemove);
      inv().ulips.splice(i, 1);
      _editing = null;
      await persist();
      renderTab();
    });
  });

  const addBtn = document.getElementById('ulip-add-btn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    inv().ulips.push({
      id: 'ulip_' + Date.now(),
      name: '', insurer: '', currency: 'GBP',
      currentValue: 0, monthlyPremium: 0, sumAssuredGBP: 0,
      conservativeRatePercent: 4, expectedRatePercent: 8, aggressiveRatePercent: 12,
      totalTermYears: 20, lockInDate: '', payTermEndDate: '',
    });
    await persist();
    _editing = 'ulip-' + (inv().ulips.length - 1);
    renderTab();
  });
}

// Read ULIP edit inputs directly off the DOM card. Maps form labels back to keys
// by position is fragile, so we tag each input via data-key in the markup instead.
function collectUlipDraft(card, existing) {
  const draft = { ...existing };
  card.querySelectorAll('[data-key]').forEach(e => {
    const k = e.dataset.key;
    draft[k] = e.type === 'number' ? (parseFloat(e.value) || 0) : e.value;
  });
  return draft;
}

// ── UK TAX-ADVANTAGED WRAPPERS ─────────────────────────────────

function progressBar(percent, colour) {
  const capped = Math.min(percent, 100);
  return `<div style="background:rgba(255,255,255,0.07);border-radius:4px;height:8px;overflow:hidden;margin:10px 0">
    <div style="width:${capped}%;height:100%;background:${colour};border-radius:4px;transition:width 0.4s"></div>
  </div>`;
}
function barColour(percent) {
  if (percent >= 100) return '#ff1744';
  if (percent >= 80)  return '#ff9100';
  return '#00e676';
}

function renderUKWrappers(rate) {
  const el = document.getElementById('assets-content');
  const i = inv();
  const isa  = i.isa || (i.isa = { stocksAndSharesISA: {}, cashISA: {}, lifetimeISA: {} });
  const ssISA = isa.stocksAndSharesISA || (isa.stocksAndSharesISA = {});
  const cISA  = isa.cashISA || (isa.cashISA = {});
  const lISA  = isa.lifetimeISA || (isa.lifetimeISA = {});
  const sipp  = i.sipp || (i.sipp = {});
  const pension = i.pensions?.[0] || {};

  const TOTAL_ISA_ALLOWANCE = 20000;
  const isaYtdTotal = (ssISA.yearToDateContributionGBP || 0) + (cISA.yearToDateContributionGBP || 0) + (lISA.yearToDateContributionGBP || 0);
  const isaRemaining = TOTAL_ISA_ALLOWANCE - isaYtdTotal;
  const isaUsedPct = TOTAL_ISA_ALLOWANCE > 0 ? (isaYtdTotal / TOTAL_ISA_ALLOWANCE) * 100 : 0;

  const LISA_ANNUAL_LIMIT = 4000, LISA_BONUS_RATE = 0.25, LISA_BONUS_CAP = 1000;
  const lisaYtd = lISA.yearToDateContributionGBP || 0;
  const lisaBonus = Math.min(lisaYtd * LISA_BONUS_RATE, LISA_BONUS_CAP);
  const lisaRemaining = LISA_ANNUAL_LIMIT - lisaYtd;
  const lisaUsedPct = LISA_ANNUAL_LIMIT > 0 ? (lisaYtd / LISA_ANNUAL_LIMIT) * 100 : 0;

  const grossSalaryGBP = state.income?.baseSalaryGBP || 0;
  let marginal;
  if (grossSalaryGBP <= 12570)      marginal = 0;
  else if (grossSalaryGBP <= 50270) marginal = 20;
  else if (grossSalaryGBP <= 125140) marginal = 40;
  else                              marginal = 45;
  const sippYtd = sipp.yearToDateContributionGBP || 0;
  const sippEmployer = sipp.employerContributionGBP || 0;
  const sippRelief = sippYtd * (marginal / 100);
  const sippEffective = sippYtd + sippRelief + sippEmployer;
  const sippTotalYtd = sippYtd + sippEmployer;

  const ssVal = ssISA.currentValueGBP || 0, cVal = cISA.currentValueGBP || 0;
  const lVal = lISA.currentValueGBP || 0, sippVal = sipp.currentValueGBP || 0, penVal = pension.valueGBP || 0;
  const totalUK = ssVal + cVal + lVal + sippVal + penVal;

  const isaBadge = isaUsedPct >= 100 ? '<span class="badge-danger">Limit Exceeded</span>'
    : isaUsedPct >= 80 ? '<span class="badge badge-warning">Near Limit</span>'
    : '<span class="badge badge-positive">On Track</span>';
  const purposeBadge = lISA.firstHomePurpose ? '<span class="badge badge-positive">First Home</span>' : '<span class="badge badge-info">Retirement</span>';

  // Per-section edit panels
  const ssPanel = (_editing === 'uk-ss') ? editUKSection('uk-ss', 'Stocks & Shares ISA', ssISA, [
    ['Provider', 'provider', 'text'], ['Current value (£)', 'currentValueGBP'],
    ['YTD contributed (£)', 'yearToDateContributionGBP'], ['Planned annual (£)', 'annualContributionGBP'],
  ]) : `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Stocks &amp; Shares ISA</span>${editButton('uk-ss')}</div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${ssISA.provider || '—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(ssVal)}</span></div>
      <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(ssISA.yearToDateContributionGBP || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Planned annual</span><span class="stat-value mono">${fmtGBP(ssISA.annualContributionGBP || 0)}</span></div>
    </div>`;

  const cPanel = (_editing === 'uk-cash') ? editUKSection('uk-cash', 'Cash ISA', cISA, [
    ['Provider', 'provider', 'text'], ['Current value (£)', 'currentValueGBP'],
    ['YTD contributed (£)', 'yearToDateContributionGBP'], ['Planned annual (£)', 'annualContributionGBP'],
  ]) : `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Cash ISA</span>${editButton('uk-cash')}</div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${cISA.provider || '—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(cVal)}</span></div>
      <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(cISA.yearToDateContributionGBP || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Planned annual</span><span class="stat-value mono">${fmtGBP(cISA.annualContributionGBP || 0)}</span></div>
    </div>`;

  const lisaPanel = (_editing === 'uk-lisa') ? editUKSection('uk-lisa', 'Lifetime ISA', lISA, [
    ['Provider', 'provider', 'text'], ['Current value (£)', 'currentValueGBP'],
    ['YTD contributed (£)', 'yearToDateContributionGBP'], ['Bonus received total (£)', 'bonusReceivedGBP'],
  ], true) : `
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">Lifetime ISA (LISA)</span>
        <span style="display:flex;gap:8px;align-items:center">${purposeBadge}${editButton('uk-lisa')}</span></div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${lISA.provider || '—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(lVal)}</span></div>
      <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(lisaYtd)} of ${fmtGBP(LISA_ANNUAL_LIMIT)} limit</span></div>
      <div class="stat-row"><span class="stat-label">LISA allowance left</span><span class="stat-value mono ${lisaRemaining < 0 ? 'text-negative' : ''}">${fmtGBP(lisaRemaining)}</span></div>
      <div class="stat-row"><span class="stat-label">Bonus earned this yr (est.)</span><span class="stat-value mono text-positive">${fmtGBP(lisaBonus)}<span class="label-muted"> · cap ${fmtGBP(LISA_BONUS_CAP)}/yr</span></span></div>
      <div class="stat-row"><span class="stat-label">Bonus received (total)</span><span class="stat-value mono">${fmtGBP(lISA.bonusReceivedGBP || 0)}</span></div>
      ${progressBar(lisaUsedPct, barColour(lisaUsedPct))}
      <div class="label-muted" style="text-align:right">${lisaUsedPct.toFixed(1)}% of ${fmtGBP(LISA_ANNUAL_LIMIT)} used</div>
      <div class="purpose-toggle">
        <button class="purpose-btn ${lISA.firstHomePurpose ? 'active' : ''}" data-lisa-purpose="true">First Home</button>
        <button class="purpose-btn ${!lISA.firstHomePurpose ? 'active' : ''}" data-lisa-purpose="false">Retirement</button>
      </div>
    </div>`;

  const sippPanel = (_editing === 'uk-sipp') ? editUKSection('uk-sipp', 'SIPP', sipp, [
    ['Provider', 'provider', 'text'], ['Current value (£)', 'currentValueGBP'],
    ['Your YTD (£)', 'yearToDateContributionGBP'], ['Employer YTD (£)', 'employerContributionGBP'],
  ]) : `
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">SIPP — Self-Invested Personal Pension</span>${editButton('uk-sipp')}</div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${sipp.provider || '—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(sippVal)}</span></div>
      <hr class="divider">
      <div class="stat-row"><span class="stat-label">Your contributions</span><span class="stat-value mono">${fmtGBP(sippYtd)}</span></div>
      <div class="stat-row"><span class="stat-label">Employer contributions</span><span class="stat-value mono">${fmtGBP(sippEmployer)}</span></div>
      <div class="stat-row"><span class="stat-label">Total</span><span class="stat-value mono">${fmtGBP(sippTotalYtd)}</span></div>
      <hr class="divider">
      <div class="stat-row"><span class="stat-label">Estimated tax relief</span><span class="stat-value mono text-positive">${fmtGBP(sippRelief)} <span class="label-muted">at ${marginal}% marginal rate</span></span></div>
      <div class="stat-row"><span class="stat-label">Effective contribution</span><span class="stat-value mono">${fmtGBP(sippEffective)}</span></div>
    </div>`;

  el.innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">ISA Allowance — 2025/26 Tax Year</span>${isaBadge}</div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:6px">
        <span class="stat-label">Used <span class="stat-value mono">${fmtGBP(isaYtdTotal)}</span></span>
        <span class="stat-label">Remaining <span class="stat-value mono ${isaRemaining < 0 ? 'text-negative' : ''}">${fmtGBP(isaRemaining)}</span></span>
        <span class="stat-label">Limit <span class="stat-value mono">${fmtGBP(TOTAL_ISA_ALLOWANCE)}</span></span>
      </div>
      ${progressBar(isaUsedPct, barColour(isaUsedPct))}
      <div class="label-muted" style="text-align:right">${isaUsedPct.toFixed(1)}% used</div>
    </div>
    <div class="grid-2 mt-12">
      ${ssPanel}
      ${cPanel}
    </div>
    ${lisaPanel}
    ${sippPanel}
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">UK Tax-Advantaged Portfolio</span></div>
      <table class="data-table"><tbody>
        <tr><td>Stocks &amp; Shares ISA</td><td class="td-right mono">${fmtGBP(ssVal)}</td></tr>
        <tr><td>Cash ISA</td><td class="td-right mono">${fmtGBP(cVal)}</td></tr>
        <tr><td>Lifetime ISA</td><td class="td-right mono">${fmtGBP(lVal)}</td></tr>
        <tr><td>SIPP</td><td class="td-right mono">${fmtGBP(sippVal)}</td></tr>
        <tr><td>Workplace Pension</td><td class="td-right mono">${fmtGBP(penVal)}</td></tr>
        <tr class="total-row"><td><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(totalUK)}</strong></td></tr>
      </tbody></table>
    </div>`;

  wireEditToggles(el);
  wireUKSaves(el);

  el.querySelectorAll('[data-lisa-purpose]').forEach(btn => {
    btn.addEventListener('click', async () => {
      lISA.firstHomePurpose = btn.dataset.lisaPurpose === 'true';
      await persist();
      renderTab();
    });
  });
}

// Generic edit panel for a UK wrapper sub-section.
function editUKSection(section, title, obj, fields, mt = false) {
  const draft = { ...obj };
  // store draft on a holder we can find at save-time
  _ukDrafts[section] = draft;
  return `
    <div class="panel ${mt ? 'mt-12' : ''}">
      <div class="panel-header"><span class="panel-title">Edit ${title}</span></div>
      <div class="grid-2">
        ${fields.map(([label, key, type]) => fld(label, draft, key, type || 'number')).join('')}
      </div>
      ${saveCancelBar(section)}
    </div>`;
}
const _ukDrafts = {};

function wireUKSaves(el) {
  const targets = {
    'uk-ss':   () => inv().isa.stocksAndSharesISA,
    'uk-cash': () => inv().isa.cashISA,
    'uk-lisa': () => inv().isa.lifetimeISA,
    'uk-sipp': () => inv().sipp,
  };
  el.querySelectorAll('[data-save]').forEach(btn => {
    const section = btn.dataset.save;
    if (!targets[section]) return;
    btn.addEventListener('click', async () => {
      Object.assign(targets[section](), _ukDrafts[section] || {});
      await persist();
      _editing = null;
      renderTab();
    });
  });
}

// ── INDIA INVESTMENTS ──────────────────────────────────────────

function renderIndia(rate) {
  const el = document.getElementById('assets-content');
  const i = inv();
  const nps  = i.nps || (i.nps = {});
  const elss = i.elss || (i.elss = []);
  const ppf  = i.ppf || (i.ppf = {});
  const sgbs = i.sgbs || (i.sgbs = []);
  const safeRate = (rate && rate > 0) ? rate : 83;
  const today = new Date();

  const npsT1 = nps.tier1ValueINR || 0, npsT2 = nps.tier2ValueINR || 0;
  const npsMonthly = nps.tier1MonthlyINR || 0;
  const equityPct = (nps.equityAllocationPercent != null) ? nps.equityAllocationPercent : 75;
  const npsT1GBP = npsT1 / safeRate, npsT2GBP = npsT2 / safeRate;

  const elssTotalINR = elss.reduce((s, e) => s + (e.currentValueINR || 0), 0);
  const elssGBP = elssTotalINR / safeRate;

  const ppfVal = ppf.currentValueINR || 0, ppfGBP = ppfVal / safeRate;

  const sgbTotalCostINR = sgbs.reduce((s, x) => s + (x.gramsHeld || 0) * (x.purchasePriceINR || 0), 0);
  const sgbTotalGrams = sgbs.reduce((s, x) => s + (x.gramsHeld || 0), 0);
  const sgbGBP = sgbTotalCostINR / safeRate;

  const totalIndiaGBP = (npsT1 + npsT2) / safeRate + elssGBP + ppfGBP + sgbGBP;

  // ── NPS panel ──
  const npsPanel = (_editing === 'india-nps') ? (() => {
    const draft = { ...nps };
    _indiaDrafts['india-nps'] = draft;
    return `
      <div class="panel mt-12">
        <div class="panel-header"><span class="panel-title">Edit NPS</span></div>
        <div class="grid-2">
          ${fld('Tier 1 value (₹)', draft, 'tier1ValueINR')}
          ${fld('Monthly SIP (₹)', draft, 'tier1MonthlyINR')}
          ${fld('Tier 2 value (₹)', draft, 'tier2ValueINR')}
          ${fld('Equity % (max 75)', draft, 'equityAllocationPercent')}
        </div>
        ${saveCancelBar('india-nps')}
      </div>`;
  })() : `
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">NPS — National Pension System</span>${editButton('india-nps')}</div>
      <div class="stat-row"><span class="stat-label">Tier 1 corpus</span><span class="stat-value mono">${fmtINR(npsT1)} <span class="label-muted">${fmtGBP(npsT1GBP)} equiv</span></span></div>
      <div class="stat-row"><span class="stat-label">Tier 2 corpus</span><span class="stat-value mono">${fmtINR(npsT2)} <span class="label-muted">${fmtGBP(npsT2GBP)} equiv</span></span></div>
      <div class="stat-row"><span class="stat-label">Monthly SIP</span><span class="stat-value mono">${fmtINR(npsMonthly)}</span></div>
      <div class="label-muted" style="margin-top:10px">Equity / Bonds allocation</div>
      <div class="split-bar"><div class="split-bar-equity" style="width:${equityPct}%"></div><div class="split-bar-bond" style="width:${100 - equityPct}%"></div></div>
      <div style="display:flex;justify-content:space-between"><span class="stat-label">${equityPct}% Equity</span><span class="stat-label">${100 - equityPct}% Bonds</span></div>
    </div>`;

  // ── ELSS table (add/remove + inline edit while editing) ──
  const elssEditing = _editing === 'india-elss';
  const elssRows = elss.map((e, idx) => {
    if (elssEditing) {
      return `<tr>
        <td><input type="text" class="form-input" data-elss="${idx}" data-key="fund" value="${e.fund || ''}" style="min-width:120px" /></td>
        <td><input type="number" class="form-input" data-elss="${idx}" data-key="currentValueINR" value="${e.currentValueINR || 0}" step="any" /></td>
        <td><input type="number" class="form-input" data-elss="${idx}" data-key="monthlyINR" value="${e.monthlyINR || 0}" step="any" /></td>
        <td><input type="date" class="form-input" data-elss="${idx}" data-key="lockInDate" value="${e.lockInDate || ''}" /></td>
        <td><button class="btn-icon danger" data-elss-remove="${idx}" title="Remove">×</button></td>
      </tr>`;
    }
    const lockInDate = e.lockInDate ? new Date(e.lockInDate) : null;
    const isLocked = lockInDate && !isNaN(lockInDate.getTime()) && lockInDate > today;
    const badge = isLocked ? '<span class="badge badge-warning">LOCKED</span>' : '<span class="badge badge-positive">OPEN</span>';
    return `<tr>
      <td>${e.fund || '—'}</td>
      <td class="mono">${fmtINR(e.currentValueINR || 0)}</td>
      <td class="mono">${fmtINR(e.monthlyINR || 0)}</td>
      <td class="mono">${e.lockInDate || '—'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  const elssPanel = `
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">ELSS Funds</span>
        <span style="display:flex;gap:8px;align-items:center"><span class="badge badge-info">80C</span>${elssEditing ? '' : editButton('india-elss')}</span></div>
      <table class="data-table" style="font-size:13px">
        <thead><tr><th>Fund Name</th><th>Value (₹)</th><th>Monthly</th><th>Lock-in Date</th><th>${elssEditing ? '' : 'Status'}</th></tr></thead>
        <tbody>
          ${elssRows || '<tr><td colspan="5" class="label-muted">No funds added.</td></tr>'}
          <tr class="total-row"><td><strong>Total</strong></td><td class="mono"><strong>${fmtINR(elssTotalINR)}</strong><div class="label-muted">${fmtGBP(elssGBP)}</div></td><td colspan="3"></td></tr>
        </tbody>
      </table>
      ${elssEditing
        ? `<div style="display:flex;justify-content:space-between;margin-top:12px">
             <button class="btn btn-secondary" id="elss-add-btn" type="button">+ Add Fund</button>
             <div style="display:flex;gap:10px">
               <button class="btn btn-secondary" data-cancel="india-elss" type="button">Cancel</button>
               <button class="btn btn-primary" id="elss-save-btn" type="button">Save</button>
             </div>
           </div>`
        : ''}
    </div>`;

  // ── PPF panel ──
  const ppfPanel = (_editing === 'india-ppf') ? (() => {
    const draft = { ...ppf };
    _indiaDrafts['india-ppf'] = draft;
    return `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Edit PPF</span></div>
        <div class="grid-2">
          ${fld('Current balance (₹)', draft, 'currentValueINR')}
          ${fld('Annual contrib (₹)', draft, 'annualContributionINR')}
          ${fld('Maturity year', draft, 'maturityYear')}
        </div>
        ${saveCancelBar('india-ppf')}
      </div>`;
  })() : `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">PPF — Public Provident Fund</span>
        <span style="display:flex;gap:8px;align-items:center"><span class="badge badge-info">80C</span>${editButton('india-ppf')}</span></div>
      <div class="stat-row"><span class="stat-label">Current balance</span><span class="stat-value mono">${fmtINR(ppfVal)} <span class="label-muted">${fmtGBP(ppfGBP)} equiv</span></span></div>
      <div class="stat-row"><span class="stat-label">Annual contribution</span><span class="stat-value mono">${fmtINR(ppf.annualContributionINR || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Maturity year</span><span class="stat-value mono">${ppf.maturityYear || '—'}</span></div>
    </div>`;

  // ── SGB panel (add/remove + inline edit) ──
  const sgbEditing = _editing === 'india-sgb';
  const sgbBody = sgbEditing
    ? sgbs.map((x, idx) => `
        <div class="panel mt-12" style="padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${x.series || 'New Series'}</strong>
            <button class="btn-icon danger" data-sgb-remove="${idx}" title="Remove">×</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label class="form-label">Series</label><input type="text" class="form-input" data-sgb="${idx}" data-key="series" value="${x.series || ''}" /></div>
            <div class="form-group"><label class="form-label">Grams held</label><input type="number" class="form-input" data-sgb="${idx}" data-key="gramsHeld" value="${x.gramsHeld || 0}" step="any" /></div>
            <div class="form-group"><label class="form-label">Purchase price/g (₹)</label><input type="number" class="form-input" data-sgb="${idx}" data-key="purchasePriceINR" value="${x.purchasePriceINR || 0}" step="any" /></div>
            <div class="form-group"><label class="form-label">Interest rate (%)</label><input type="number" class="form-input" data-sgb="${idx}" data-key="interestRatePercent" value="${x.interestRatePercent || 0}" step="any" /></div>
            <div class="form-group"><label class="form-label">Maturity date</label><input type="date" class="form-input" data-sgb="${idx}" data-key="maturityDate" value="${x.maturityDate || ''}" /></div>
          </div>
        </div>`).join('')
    : sgbs.map(x => `
        <div class="panel mt-12" style="padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>${x.series || 'Series'}</strong></div>
          <div class="stat-row"><span class="stat-label">Grams held</span><span class="stat-value mono">${x.gramsHeld || 0} g</span></div>
          <div class="stat-row"><span class="stat-label">Purchase price/g</span><span class="stat-value mono">${fmtINR(x.purchasePriceINR || 0)}</span></div>
          <div class="stat-row"><span class="stat-label">Maturity</span><span class="stat-value mono">${x.maturityDate || '—'} · ${x.interestRatePercent || 0}%</span></div>
        </div>`).join('');

  const sgbPanel = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Sovereign Gold Bonds</span>${sgbEditing ? '' : editButton('india-sgb')}</div>
      <div class="stat-row"><span class="stat-label">Total grams held</span><span class="stat-value mono">${sgbTotalGrams} g</span></div>
      <div class="stat-row"><span class="stat-label">Cost basis (₹)</span><span class="stat-value mono">${fmtINR(sgbTotalCostINR)}</span></div>
      <div class="stat-row"><span class="stat-label">Cost basis (£)</span><span class="stat-value mono">${fmtGBP(sgbGBP)} equiv</span></div>
      ${sgbBody || '<div class="label-muted" style="margin-top:10px">No series added yet.</div>'}
      ${sgbEditing
        ? `<div style="display:flex;justify-content:space-between;margin-top:12px">
             <button class="btn btn-secondary" id="sgb-add-btn" type="button">+ Add Series</button>
             <div style="display:flex;gap:10px">
               <button class="btn btn-secondary" data-cancel="india-sgb" type="button">Cancel</button>
               <button class="btn btn-primary" id="sgb-save-btn" type="button">Save</button>
             </div>
           </div>`
        : ''}
    </div>`;

  el.innerHTML = `
    ${npsPanel}
    ${elssPanel}
    <div class="grid-2 mt-12">
      ${ppfPanel}
      ${sgbPanel}
    </div>
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">India Investment Portfolio</span></div>
      <table class="data-table"><tbody>
        <tr><td>NPS Tier 1</td><td class="td-right mono">${fmtINR(npsT1)}</td><td class="td-right mono">${fmtGBP(npsT1GBP)}</td></tr>
        <tr><td>NPS Tier 2</td><td class="td-right mono">${fmtINR(npsT2)}</td><td class="td-right mono">${fmtGBP(npsT2GBP)}</td></tr>
        <tr><td>ELSS Funds</td><td class="td-right mono">${fmtINR(elssTotalINR)}</td><td class="td-right mono">${fmtGBP(elssGBP)}</td></tr>
        <tr><td>PPF</td><td class="td-right mono">${fmtINR(ppfVal)}</td><td class="td-right mono">${fmtGBP(ppfGBP)}</td></tr>
        <tr><td>SGBs (cost basis)</td><td class="td-right mono">${fmtINR(sgbTotalCostINR)}</td><td class="td-right mono">${fmtGBP(sgbGBP)}</td></tr>
        <tr class="total-row"><td><strong>Total (GBP equiv)</strong></td><td></td><td class="td-right mono"><strong>${fmtGBP(totalIndiaGBP)}</strong></td></tr>
      </tbody></table>
      <div class="label-muted" style="margin-top:10px">Exchange rate used: 1 GBP = ₹${safeRate} (from Settings)</div>
    </div>`;

  wireEditToggles(el);
  wireIndiaSaves(el);
}

const _indiaDrafts = {};

function wireIndiaSaves(el) {
  // NPS + PPF simple object saves
  const simple = { 'india-nps': () => inv().nps, 'india-ppf': () => inv().ppf };
  el.querySelectorAll('[data-save]').forEach(btn => {
    const section = btn.dataset.save;
    if (!simple[section]) return;
    btn.addEventListener('click', async () => {
      Object.assign(simple[section](), _indiaDrafts[section] || {});
      await persist();
      _editing = null;
      renderTab();
    });
  });

  // ELSS add/remove/save
  const elssAdd = document.getElementById('elss-add-btn');
  if (elssAdd) elssAdd.addEventListener('click', () => {
    inv().elss.push({ fund: '', currentValueINR: 0, monthlyINR: 0, lockInDate: '' });
    renderTab();
  });
  el.querySelectorAll('[data-elss-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      inv().elss.splice(parseInt(btn.dataset.elssRemove), 1);
      renderTab();
    });
  });
  const elssSave = document.getElementById('elss-save-btn');
  if (elssSave) elssSave.addEventListener('click', async () => {
    el.querySelectorAll('[data-elss]').forEach(inp => {
      const row = inv().elss[parseInt(inp.dataset.elss)];
      if (!row) return;
      const k = inp.dataset.key;
      row[k] = inp.type === 'number' ? (parseFloat(inp.value) || 0) : inp.value;
    });
    await persist();
    _editing = null;
    renderTab();
  });

  // SGB add/remove/save
  const sgbAdd = document.getElementById('sgb-add-btn');
  if (sgbAdd) sgbAdd.addEventListener('click', () => {
    inv().sgbs.push({ series: '', gramsHeld: 0, purchasePriceINR: 0, interestRatePercent: 2.5, maturityDate: '' });
    renderTab();
  });
  el.querySelectorAll('[data-sgb-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      inv().sgbs.splice(parseInt(btn.dataset.sgbRemove), 1);
      renderTab();
    });
  });
  const sgbSave = document.getElementById('sgb-save-btn');
  if (sgbSave) sgbSave.addEventListener('click', async () => {
    el.querySelectorAll('[data-sgb]').forEach(inp => {
      const row = inv().sgbs[parseInt(inp.dataset.sgb)];
      if (!row) return;
      const k = inp.dataset.key;
      row[k] = inp.type === 'number' ? (parseFloat(inp.value) || 0) : inp.value;
    });
    await persist();
    _editing = null;
    renderTab();
  });
}
