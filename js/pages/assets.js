import { initPage, saveSec } from '../page-init.js';
import { save }      from '../store.js';
import {
  projectULIP, ulipValueGBP, ulipPremiumGBP, projectionAtYear,
  fmtGBP, fmtINR, round2
} from '../calc.js';

// Hoisted before top-level await
const C = { info:'#00bfff', positive:'#00e676', warning:'#ff9100', purple:'#d500f9', grid:'rgba(0,191,255,0.07)', tick:'#3d5473' };
const charts = {};

const state = await initPage('assets');
render(state);

function render(st) {
  const inv  = st.investments || { cashAccounts:[], pensions:[], ulips:[] };
  const rate = st.settings?.inrGbpRate || 83;
  const pension = inv.pensions?.[0] || {};
  const cash    = inv.cashAccounts?.[0] || {};

  // ── Pension card ──────────────────────────────────────────
  document.getElementById('pension-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Pension</span><span class="badge badge-positive">Active</span></div>
    <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${pension.provider||'—'}</span></div>
    <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(pension.valueGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Monthly contribution</span><span class="stat-value mono">${fmtGBP(pension.monthlyGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${pension.note||''}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      ${invField('Pension value (£)', 'pensions.0.valueGBP', pension.valueGBP)}
      ${invField('Monthly contribution (£)', 'pensions.0.monthlyGBP', pension.monthlyGBP)}
    </div>`;

  // ── Cash card ─────────────────────────────────────────────
  document.getElementById('cash-card').innerHTML = `
    <div class="panel-header"><span class="panel-title">Cash / Savings</span></div>
    <div class="stat-row"><span class="stat-label">${cash.name||'Savings'}</span><span class="stat-value mono">${fmtGBP(cash.balanceGBP||0)}</span></div>
    <div class="stat-row"><span class="stat-label">AER</span><span class="stat-value mono">${cash.aerPercent||0}%</span></div>
    <div class="stat-row"><span class="stat-label">Note</span><span class="stat-value" style="font-size:12px;color:var(--text-secondary)">${cash.note||''}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      ${invField('Balance (£)', 'cashAccounts.0.balanceGBP', cash.balanceGBP)}
      ${invField('AER (%)', 'cashAccounts.0.aerPercent', cash.aerPercent)}
    </div>`;

  bindInvFields(st);

  // ── ULIP cards ────────────────────────────────────────────
  const ulipSection = document.getElementById('ulip-section');
  ulipSection.innerHTML = inv.ulips.map((u, i) => {
    const valueGBP = ulipValueGBP(u, rate);
    const premGBP  = ulipPremiumGBP(u, rate);
    const c_pts = projectULIP(valueGBP, premGBP, u.conservativeRatePercent, u.payTermEndDate, u.totalTermYears);
    const e_pts = projectULIP(valueGBP, premGBP, u.expectedRatePercent,     u.payTermEndDate, u.totalTermYears);
    const a_pts = projectULIP(valueGBP, premGBP, u.aggressiveRatePercent,   u.payTermEndDate, u.totalTermYears);
    const lockInYr  = round2((new Date(u.lockInDate)    - new Date()) / (365.25*24*3600*1000));
    const payTermYr = round2((new Date(u.payTermEndDate) - new Date()) / (365.25*24*3600*1000));
    return `
      <div class="panel mt-12 ulip-card">
        <div class="ulip-header">
          <div><div class="ulip-name">${u.name}</div><div class="ulip-insurer">${u.insurer} · ${u.currency}</div></div>
          <div style="text-align:right">
            <div class="metric-sm mono">${u.currency==='GBP'?fmtGBP(valueGBP):fmtINR(u.currentValue)}</div>
            <div class="label-muted">${u.currency==='INR'?fmtGBP(valueGBP)+' equiv':''}</div>
          </div>
        </div>
        <div class="grid-2">
          <div>
            <div class="stat-row"><span class="stat-label">Monthly premium</span><span class="stat-value mono">${u.currency==='GBP'?fmtGBP(u.monthlyPremium):fmtINR(u.monthlyPremium)}</span></div>
            <div class="stat-row"><span class="stat-label">Lock-in date</span><span class="stat-value mono">${u.lockInDate}</span></div>
            <div class="stat-row"><span class="stat-label">Pay term ends</span><span class="stat-value mono">${u.payTermEndDate}</span></div>
            <div class="stat-row"><span class="stat-label">Sum assured</span><span class="stat-value mono">${fmtGBP(u.sumAssuredGBP)}</span></div>
          </div>
          <div>
            <table class="data-table" style="font-size:12px">
              <thead><tr><th>Milestone</th><th class="td-right">Conservative</th><th class="td-right">Expected</th><th class="td-right">Aggressive</th></tr></thead>
              <tbody>
                ${[{label:'Lock-in',yr:Math.ceil(lockInYr)},{label:'Pay term',yr:Math.ceil(payTermYr)},{label:'Year 10',yr:10},{label:'Year 20',yr:20}].map(({label,yr})=>{
                  const c=projectionAtYear(c_pts,yr)||0,e=projectionAtYear(e_pts,yr)||0,a=projectionAtYear(a_pts,yr)||0;
                  const fmt=v=>u.currency==='GBP'?fmtGBP(v):fmtINR(v);
                  return `<tr><td>${label}</td><td class="td-right mono">${fmt(c)}</td><td class="td-right mono text-info">${fmt(e)}</td><td class="td-right mono text-positive">${fmt(a)}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="chart-wrap chart-h-200 mt-12"><canvas id="chart-ulip-${u.id}"></canvas></div>
      </div>`;
  }).join('');

  renderUKWrappers(st, inv, rate);
  renderIndiaInvestments(st, inv, rate);

  renderCharts(inv, rate);
}

function invField(label, path, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="number" class="form-input inv-field" data-path="${path}" value="${value||0}" step="any" />
  </div>`;
}

function invFieldText(label, path, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="text" class="form-input inv-field-text" data-path="${path}" value="${value || ''}" />
  </div>`;
}

function invFieldDate(label, path, value) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="date" class="form-input inv-field-text" data-path="${path}" value="${value || ''}" />
  </div>`;
}

function bindInvFieldsText(st) {
  document.querySelectorAll('.inv-field-text').forEach(el => {
    el.addEventListener('change', async () => {
      setPath(st.investments, el.dataset.path, el.value);
      await saveSec('fin_investments', st.investments);
      render(st);
    });
  });
}

function progressBar(percent, colour) {
  const capped = Math.min(percent, 100);
  return `<div style="background:rgba(255,255,255,0.07);border-radius:4px;height:8px;overflow:hidden;margin:10px 0">
    <div style="width:${capped}%;height:100%;background:${colour};border-radius:4px;transition:width 0.4s"></div>
  </div>`;
}

function isaBarColour(percent) {
  if (percent >= 100) return '#ff1744';
  if (percent >= 80)  return '#ff9100';
  return '#00e676';
}

function bindInvFields(st) {
  document.querySelectorAll('.inv-field').forEach(el => {
    el.addEventListener('input', () => setPath(st.investments, el.dataset.path, parseFloat(el.value)||0));
    el.addEventListener('change', async () => {
      setPath(st.investments, el.dataset.path, parseFloat(el.value)||0);
      await saveSec('fin_investments', st.investments);
      render(st);
    });
  });
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = isNaN(parts[i]) ? parts[i] : parseInt(parts[i]);
    cur = cur[k];
  }
  const last = parts[parts.length-1];
  cur[isNaN(last) ? last : parseInt(last)] = val;
}

// ── UK Tax-Advantaged Wrappers ─────────────────────────────────

function renderUKWrappers(st, inv, rate) {
  const el = document.getElementById('uk-wrappers-section');
  if (!el) return;

  // Defensive access — old saved data may lack these keys
  const isa   = inv.isa || { stocksAndSharesISA: {}, cashISA: {}, lifetimeISA: {} };
  const ssISA = isa.stocksAndSharesISA || {};
  const cISA  = isa.cashISA || {};
  const lISA  = isa.lifetimeISA || {};
  const sipp  = inv.sipp || {};
  const pension = inv.pensions?.[0] || {};

  // ── ISA allowance tracking ──
  const TOTAL_ISA_ALLOWANCE = 20000;
  const isaYtdTotal = (ssISA.yearToDateContributionGBP || 0)
                    + (cISA.yearToDateContributionGBP || 0)
                    + (lISA.yearToDateContributionGBP || 0);
  const isaAllowanceRemaining = TOTAL_ISA_ALLOWANCE - isaYtdTotal;
  const isaAllowanceUsedPercent = TOTAL_ISA_ALLOWANCE > 0 ? (isaYtdTotal / TOTAL_ISA_ALLOWANCE) * 100 : 0;

  let isaBadge;
  if (isaAllowanceUsedPercent >= 100)     isaBadge = '<span class="badge-danger">Limit Exceeded</span>';
  else if (isaAllowanceUsedPercent >= 80) isaBadge = '<span class="badge badge-warning">Near Limit</span>';
  else                                    isaBadge = '<span class="badge badge-positive">On Track</span>';

  // ── LISA bonus ──
  const LISA_ANNUAL_LIMIT = 4000;
  const LISA_BONUS_RATE   = 0.25;
  const LISA_BONUS_CAP    = 1000;
  const lisaYtd = lISA.yearToDateContributionGBP || 0;
  const lisaBonusEarned = Math.min(lisaYtd * LISA_BONUS_RATE, LISA_BONUS_CAP);
  const lisaAllowanceRemaining = LISA_ANNUAL_LIMIT - lisaYtd;
  const lisaUsedPercent = LISA_ANNUAL_LIMIT > 0 ? (lisaYtd / LISA_ANNUAL_LIMIT) * 100 : 0;

  // ── SIPP tax relief ──
  const grossSalaryGBP = st.income?.baseSalaryGBP || 0;
  const personalAllowance = 12570;
  let marginalRatePercent;
  if (grossSalaryGBP <= personalAllowance)   marginalRatePercent = 0;
  else if (grossSalaryGBP <= 50270)          marginalRatePercent = 20;
  else if (grossSalaryGBP <= 125140)         marginalRatePercent = 40;
  else                                       marginalRatePercent = 45;
  const sippYtd = sipp.yearToDateContributionGBP || 0;
  const sippEmployer = sipp.employerContributionGBP || 0;
  const sippTaxReliefGBP = sippYtd * (marginalRatePercent / 100);
  const sippEffective = sippYtd + sippTaxReliefGBP + sippEmployer;
  const sippTotalYtd = sippYtd + sippEmployer;

  // ── UK total ──
  const ssVal   = ssISA.currentValueGBP || 0;
  const cVal    = cISA.currentValueGBP || 0;
  const lVal    = lISA.currentValueGBP || 0;
  const sippVal = sipp.currentValueGBP || 0;
  const penVal  = pension.valueGBP || 0;
  const totalUKTaxAdvantaged = ssVal + cVal + lVal + sippVal + penVal;

  const purposeBadge = lISA.firstHomePurpose
    ? '<span class="badge badge-positive">First Home</span>'
    : '<span class="badge badge-info">Retirement</span>';

  el.innerHTML = `
    <div class="section-header" style="margin-top: 32px;">
      <div>
        <div class="section-title">UK Tax-Advantaged Wrappers</div>
        <div class="section-subtitle">ISA, LISA &amp; SIPP — 2025/26 tax year</div>
      </div>
    </div>

    <!-- Panel 1: ISA Allowance Tracker -->
    <div class="panel mt-12">
      <div class="panel-header">
        <span class="panel-title">ISA Allowance — 2025/26 Tax Year</span>
        ${isaBadge}
      </div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:6px">
        <span class="stat-label">Used <span class="stat-value mono">${fmtGBP(isaYtdTotal)}</span></span>
        <span class="stat-label">Remaining <span class="stat-value mono ${isaAllowanceRemaining<0?'text-negative':''}">${fmtGBP(isaAllowanceRemaining)}</span></span>
        <span class="stat-label">Limit <span class="stat-value mono">${fmtGBP(TOTAL_ISA_ALLOWANCE)}</span></span>
      </div>
      ${progressBar(isaAllowanceUsedPercent, isaBarColour(isaAllowanceUsedPercent))}
      <div class="label-muted" style="text-align:right">${isaAllowanceUsedPercent.toFixed(1)}% used</div>
      <div class="grid-2 mt-12">
        <div class="stat-row"><span class="stat-label">Stocks ISA YTD</span><span class="stat-value mono">${fmtGBP(ssISA.yearToDateContributionGBP||0)}</span></div>
        <div class="stat-row"><span class="stat-label">Cash ISA YTD</span><span class="stat-value mono">${fmtGBP(cISA.yearToDateContributionGBP||0)}</span></div>
        <div class="stat-row"><span class="stat-label">LISA YTD</span><span class="stat-value mono">${fmtGBP(lISA.yearToDateContributionGBP||0)}</span></div>
      </div>
    </div>

    <!-- Panel 2: Stocks & Shares ISA + Cash ISA -->
    <div class="grid-2 mt-12">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Stocks &amp; Shares ISA</span></div>
        <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${ssISA.provider||'—'}</span></div>
        <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(ssVal)}</span></div>
        <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(ssISA.yearToDateContributionGBP||0)}</span></div>
        <div class="stat-row"><span class="stat-label">Planned annual</span><span class="stat-value mono">${fmtGBP(ssISA.annualContributionGBP||0)}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          ${invFieldText('Provider', 'isa.stocksAndSharesISA.provider', ssISA.provider)}
          ${invField('Current value (£)', 'isa.stocksAndSharesISA.currentValueGBP', ssVal)}
          ${invField('YTD contributed (£)', 'isa.stocksAndSharesISA.yearToDateContributionGBP', ssISA.yearToDateContributionGBP)}
          ${invField('Planned annual (£)', 'isa.stocksAndSharesISA.annualContributionGBP', ssISA.annualContributionGBP)}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Cash ISA</span></div>
        <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${cISA.provider||'—'}</span></div>
        <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(cVal)}</span></div>
        <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(cISA.yearToDateContributionGBP||0)}</span></div>
        <div class="stat-row"><span class="stat-label">Planned annual</span><span class="stat-value mono">${fmtGBP(cISA.annualContributionGBP||0)}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          ${invFieldText('Provider', 'isa.cashISA.provider', cISA.provider)}
          ${invField('Current value (£)', 'isa.cashISA.currentValueGBP', cVal)}
          ${invField('YTD contributed (£)', 'isa.cashISA.yearToDateContributionGBP', cISA.yearToDateContributionGBP)}
          ${invField('Planned annual (£)', 'isa.cashISA.annualContributionGBP', cISA.annualContributionGBP)}
        </div>
      </div>
    </div>

    <!-- Panel 3: Lifetime ISA -->
    <div class="panel mt-12">
      <div class="panel-header">
        <span class="panel-title">Lifetime ISA (LISA)</span>
        ${purposeBadge}
      </div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${lISA.provider||'—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(lVal)}</span></div>
      <div class="stat-row"><span class="stat-label">YTD contributed</span><span class="stat-value mono">${fmtGBP(lisaYtd)} of ${fmtGBP(LISA_ANNUAL_LIMIT)} limit</span></div>
      <div class="stat-row"><span class="stat-label">LISA allowance left</span><span class="stat-value mono ${lisaAllowanceRemaining<0?'text-negative':''}">${fmtGBP(lisaAllowanceRemaining)}</span></div>
      <div class="stat-row"><span class="stat-label">Bonus earned this yr (est.)</span><span class="stat-value mono text-positive">${fmtGBP(lisaBonusEarned)}<span class="label-muted"> · cap ${fmtGBP(LISA_BONUS_CAP)}/yr</span></span></div>
      <div class="stat-row"><span class="stat-label">Bonus received (total)</span><span class="stat-value mono">${fmtGBP(lISA.bonusReceivedGBP||0)}</span></div>
      ${progressBar(lisaUsedPercent, isaBarColour(lisaUsedPercent))}
      <div class="label-muted" style="text-align:right">${lisaUsedPercent.toFixed(1)}% of ${fmtGBP(LISA_ANNUAL_LIMIT)} used</div>
      <div class="label-muted" style="margin-top:6px">Bonus is paid by HMRC approx 6–8 weeks after contribution.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        ${invFieldText('Provider', 'isa.lifetimeISA.provider', lISA.provider)}
        ${invField('Current value (£)', 'isa.lifetimeISA.currentValueGBP', lVal)}
        ${invField('YTD contributed (£)', 'isa.lifetimeISA.yearToDateContributionGBP', lisaYtd)}
        ${invField('Bonus received total (£)', 'isa.lifetimeISA.bonusReceivedGBP', lISA.bonusReceivedGBP)}
      </div>
      <div class="purpose-toggle">
        <button class="purpose-btn ${lISA.firstHomePurpose?'active':''}" data-lisa-purpose="true">First Home</button>
        <button class="purpose-btn ${!lISA.firstHomePurpose?'active':''}" data-lisa-purpose="false">Retirement</button>
      </div>
    </div>

    <!-- Panel 4: SIPP -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">SIPP — Self-Invested Personal Pension</span></div>
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${sipp.provider||'—'}</span></div>
      <div class="stat-row"><span class="stat-label">Current value</span><span class="stat-value mono">${fmtGBP(sippVal)}</span></div>
      <hr class="divider">
      <div class="label-muted" style="margin-bottom:6px">Contributions this year</div>
      <div class="stat-row"><span class="stat-label">Your contributions</span><span class="stat-value mono">${fmtGBP(sippYtd)}</span></div>
      <div class="stat-row"><span class="stat-label">Employer contributions</span><span class="stat-value mono">${fmtGBP(sippEmployer)}</span></div>
      <div class="stat-row"><span class="stat-label">Total</span><span class="stat-value mono">${fmtGBP(sippTotalYtd)}</span></div>
      <hr class="divider">
      <div class="stat-row"><span class="stat-label">Estimated tax relief</span><span class="stat-value mono text-positive">${fmtGBP(sippTaxReliefGBP)} <span class="label-muted">at ${marginalRatePercent}% marginal rate</span></span></div>
      <div class="stat-row"><span class="stat-label">Effective contribution (after relief)</span><span class="stat-value mono">${fmtGBP(sippEffective)}</span></div>
      <div class="label-muted" style="margin-top:6px">Basic rate relief applied at source. Higher rate claimable via Self Assessment.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        ${invFieldText('Provider', 'sipp.provider', sipp.provider)}
        ${invField('Current value (£)', 'sipp.currentValueGBP', sippVal)}
        ${invField('Your YTD (£)', 'sipp.yearToDateContributionGBP', sippYtd)}
        ${invField('Employer YTD (£)', 'sipp.employerContributionGBP', sippEmployer)}
      </div>
    </div>

    <!-- Panel 5: UK Summary -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">UK Tax-Advantaged Portfolio</span></div>
      <table class="data-table">
        <tbody>
          <tr><td>Stocks &amp; Shares ISA</td><td class="td-right mono">${fmtGBP(ssVal)}</td></tr>
          <tr><td>Cash ISA</td><td class="td-right mono">${fmtGBP(cVal)}</td></tr>
          <tr><td>Lifetime ISA</td><td class="td-right mono">${fmtGBP(lVal)}</td></tr>
          <tr><td>SIPP</td><td class="td-right mono">${fmtGBP(sippVal)}</td></tr>
          <tr><td>Workplace Pension</td><td class="td-right mono">${fmtGBP(penVal)}</td></tr>
          <tr class="total-row"><td><strong>Total</strong></td><td class="td-right mono"><strong>${fmtGBP(totalUKTaxAdvantaged)}</strong></td></tr>
        </tbody>
      </table>
    </div>`;

  bindInvFields(st);
  bindInvFieldsText(st);

  el.querySelectorAll('[data-lisa-purpose]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!st.investments.isa) st.investments.isa = { stocksAndSharesISA:{}, cashISA:{}, lifetimeISA:{} };
      if (!st.investments.isa.lifetimeISA) st.investments.isa.lifetimeISA = {};
      st.investments.isa.lifetimeISA.firstHomePurpose = btn.dataset.lisaPurpose === 'true';
      await saveSec('fin_investments', st.investments);
      render(st);
    });
  });
}

// ── Indian Investment Instruments ──────────────────────────────

function renderIndiaInvestments(st, inv, rate) {
  const el = document.getElementById('india-investments-section');
  if (!el) return;

  // Defensive access
  const nps  = inv.nps || {};
  const elss = inv.elss || [];
  const ppf  = inv.ppf || {};
  const sgbs = inv.sgbs || [];
  const safeRate = (rate && rate > 0) ? rate : 83;

  // ── NPS ──
  const npsT1 = nps.tier1ValueINR || 0;
  const npsT2 = nps.tier2ValueINR || 0;
  const npsMonthly = nps.tier1MonthlyINR || 0;
  const equityPct = (nps.equityAllocationPercent != null) ? nps.equityAllocationPercent : 75;
  const npsGBP = (npsT1 + npsT2) / safeRate;
  const npsT1GBP = npsT1 / safeRate;
  const npsT2GBP = npsT2 / safeRate;
  const equityValueINR = npsT1 * (equityPct / 100);
  const bondValueINR   = npsT1 * (1 - equityPct / 100);

  // ── ELSS ──
  const today = new Date();
  const elssTotalINR = elss.reduce((s, e) => s + (e.currentValueINR || 0), 0);
  const elssMonthlyTotal = elss.reduce((s, e) => s + (e.monthlyINR || 0), 0);
  const elssGBP = elssTotalINR / safeRate;

  // ── PPF ──
  const PPF_INTEREST_RATE = 0.071;
  const currentYear = today.getFullYear();
  const ppfVal = ppf.currentValueINR || 0;
  const ppfGBP = ppfVal / safeRate;
  const yearsToMaturity = (ppf.maturityYear || 0) - currentYear;
  const ppfInterestThisYearINR = ppfVal * PPF_INTEREST_RATE;
  let ppfMaturityBadge = '', ppfMaturityNote = '';
  if (!ppf.maturityYear) {
    ppfMaturityNote = `${yearsToMaturity} years`;
  } else if (yearsToMaturity <= 0) {
    ppfMaturityBadge = '<span class="badge badge-positive">Matured</span>';
    ppfMaturityNote = 'Eligible for full withdrawal or 5-year extension.';
  } else if (yearsToMaturity === 1) {
    ppfMaturityBadge = '<span class="badge badge-warning">Matures this year</span>';
    ppfMaturityNote = '1 year remaining';
  } else {
    ppfMaturityNote = `${yearsToMaturity} years remaining`;
  }

  // ── SGBs ──
  const sgbTotalCostINR = sgbs.reduce((s, x) => s + (x.gramsHeld || 0) * (x.purchasePriceINR || 0), 0);
  const sgbTotalGramsHeld = sgbs.reduce((s, x) => s + (x.gramsHeld || 0), 0);
  const sgbTotalInterestAnnualINR = sgbs.reduce((s, x) => s + (x.gramsHeld || 0) * (x.purchasePriceINR || 0) * ((x.interestRatePercent || 0) / 100), 0);
  const sgbGBP = sgbTotalCostINR / safeRate;

  // ── 80C / 80CCD(1B) ──
  const LIMIT_80C = 150000;
  const LIMIT_80CCD1B = 50000;
  const elss80C = elss.reduce((s, e) => s + (e.monthlyINR || 0) * 12, 0);
  const ppf80C  = Math.min(ppf.annualContributionINR || 0, LIMIT_80C);
  let total80C = elss80C + ppf80C;
  total80C = Math.min(total80C, LIMIT_80C);
  const remaining80C = LIMIT_80C - total80C;
  const used80CPercent = LIMIT_80C > 0 ? (total80C / LIMIT_80C) * 100 : 0;
  const elss80CCapped = Math.min(elss80C, LIMIT_80C);

  const nps80CCD1B = Math.min(npsMonthly * 12, LIMIT_80CCD1B);
  const used80CCD1BPercent = LIMIT_80CCD1B > 0 ? (nps80CCD1B / LIMIT_80CCD1B) * 100 : 0;
  const totalIndianDeductions = total80C + nps80CCD1B;

  const totalIndiaGBP = npsGBP + elssGBP + ppfGBP + sgbGBP;

  // ── ELSS table rows ──
  const elssRows = elss.map((e, i) => {
    const lockInDate = e.lockInDate ? new Date(e.lockInDate) : null;
    const isLocked = lockInDate && !isNaN(lockInDate.getTime()) && lockInDate > today;
    const daysRemaining = isLocked ? Math.ceil((lockInDate - today) / (1000 * 60 * 60 * 24)) : 0;
    const statusBadge = isLocked
      ? `<span class="badge badge-warning" title="Unlocks on ${e.lockInDate}">LOCKED</span><div class="label-muted">${daysRemaining}d left</div>`
      : '<span class="badge badge-positive">OPEN</span>';
    return `<tr>
      <td><input type="text" class="form-input inv-field-text" data-path="elss.${i}.fund" value="${e.fund||''}" style="min-width:120px" /></td>
      <td><input type="number" class="form-input inv-field" data-path="elss.${i}.currentValueINR" value="${e.currentValueINR||0}" step="any" /></td>
      <td><input type="number" class="form-input inv-field" data-path="elss.${i}.monthlyINR" value="${e.monthlyINR||0}" step="any" /></td>
      <td><input type="date" class="form-input inv-field-text" data-path="elss.${i}.lockInDate" value="${e.lockInDate||''}" /></td>
      <td>${statusBadge}</td>
      <td><button class="btn-icon" data-elss-index="${i}" title="Remove">×</button></td>
    </tr>`;
  }).join('');

  // ── SGB sub-cards ──
  const sgbCards = sgbs.map((x, i) => {
    const matDate = x.maturityDate ? new Date(x.maturityDate) : null;
    let matBadge = '';
    if (matDate && !isNaN(matDate.getTime())) {
      const daysToMat = Math.ceil((matDate - today) / (1000 * 60 * 60 * 24));
      if (daysToMat <= 0)        matBadge = '<span class="badge badge-positive">Matured</span>';
      else if (daysToMat <= 365) matBadge = '<span class="badge badge-warning">Matures soon</span>';
    }
    return `<div class="panel mt-12" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>${x.series||'New Series'}</strong>
        <div style="display:flex;gap:6px;align-items:center">${matBadge}<button class="btn-icon" data-sgb-index="${i}" title="Remove">×</button></div>
      </div>
      <div class="stat-row"><span class="stat-label">Grams held</span><span class="stat-value mono">${x.gramsHeld||0} g</span></div>
      <div class="stat-row"><span class="stat-label">Purchase price/g</span><span class="stat-value mono">${fmtINR(x.purchasePriceINR||0)}</span></div>
      <div class="stat-row"><span class="stat-label">Maturity</span><span class="stat-value mono">${x.maturityDate||'—'} · ${x.interestRatePercent||0}%</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        ${invFieldText('Series', 'sgbs.'+i+'.series', x.series)}
        ${invField('Grams held', 'sgbs.'+i+'.gramsHeld', x.gramsHeld)}
        ${invField('Purchase price/g (₹)', 'sgbs.'+i+'.purchasePriceINR', x.purchasePriceINR)}
        ${invField('Interest rate (%)', 'sgbs.'+i+'.interestRatePercent', x.interestRatePercent)}
        ${invFieldDate('Maturity date', 'sgbs.'+i+'.maturityDate', x.maturityDate)}
      </div>
    </div>`;
  }).join('');

  const ppf80CNote = remaining80C <= 0
    ? '80C limit reached via ELSS — PPF contributions still grow tax-free.'
    : `80C utilised (PPF): ${fmtINR(ppf80C)}/yr`;

  el.innerHTML = `
    <div class="section-header" style="margin-top: 32px;">
      <div>
        <div class="section-title">Indian Investments</div>
        <div class="section-subtitle">NPS · ELSS · PPF · Sovereign Gold Bonds</div>
      </div>
    </div>

    <!-- Panel 1: NPS -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">NPS — National Pension System</span></div>
      <div class="stat-row"><span class="stat-label">Tier 1 corpus <span class="badge badge-warning" title="Locked until age 60. Partial withdrawal permitted after 3 years for specific purposes.">LOCKED</span></span><span class="stat-value mono">${fmtINR(npsT1)} <span class="label-muted">${fmtGBP(npsT1GBP)} equiv</span></span></div>
      <div class="stat-row"><span class="stat-label">Tier 2 corpus <span class="badge badge-positive" title="Freely withdrawable anytime. No tax benefit.">LIQUID</span></span><span class="stat-value mono">${fmtINR(npsT2)} <span class="label-muted">${fmtGBP(npsT2GBP)} equiv</span></span></div>
      <div class="stat-row"><span class="stat-label">Monthly SIP</span><span class="stat-value mono">${fmtINR(npsMonthly)}</span></div>
      <div class="label-muted" style="margin-top:10px">Equity / Bonds allocation</div>
      <div class="split-bar">
        <div class="split-bar-equity" style="width:${equityPct}%"></div>
        <div class="split-bar-bond" style="width:${100-equityPct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="stat-label">${equityPct}% Equity <span class="stat-value mono">${fmtINR(equityValueINR)}</span></span>
        <span class="stat-label">${100-equityPct}% Bonds <span class="stat-value mono">${fmtINR(bondValueINR)}</span></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        ${invField('Tier 1 value (₹)', 'nps.tier1ValueINR', npsT1)}
        ${invField('Monthly SIP (₹)', 'nps.tier1MonthlyINR', npsMonthly)}
        ${invField('Tier 2 value (₹)', 'nps.tier2ValueINR', npsT2)}
        <div class="form-group">
          <label class="form-label">Equity % (max 75)</label>
          <input type="number" class="form-input inv-field" data-path="nps.equityAllocationPercent" value="${equityPct}" min="0" max="75" step="5" />
        </div>
      </div>
      <div class="label-muted" style="margin-top:6px">Max 75% equity under Active Choice (Tier 1).</div>
      <div class="label-muted" style="margin-top:6px">80CCD(1B) eligible: ${fmtINR(nps80CCD1B)} (of ${fmtINR(LIMIT_80CCD1B)} limit)</div>
    </div>

    <!-- Panel 2: ELSS -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">ELSS Funds — Equity Linked Savings Scheme</span><span class="badge badge-info">80C</span></div>
      <table class="data-table" style="font-size:13px">
        <thead><tr><th>Fund Name</th><th>Value (₹)</th><th>Monthly</th><th>Lock-in Date</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${elssRows}
          <tr class="total-row">
            <td><strong>Total</strong></td>
            <td class="mono"><strong>${fmtINR(elssTotalINR)}</strong><div class="label-muted">${fmtGBP(elssGBP)}</div></td>
            <td class="mono"><strong>${fmtINR(elssMonthlyTotal)}</strong></td>
            <td colspan="3"></td>
          </tr>
        </tbody>
      </table>
      <button class="btn btn-secondary mt-12" id="elss-add-btn">+ Add Fund</button>
      <div class="label-muted" style="margin-top:10px">80C utilised (ELSS): ${fmtINR(elss80CCapped)}/yr</div>
      <div class="label-muted" style="margin-top:4px">Note: Lock-in date shown is earliest unlock date for the fund. Individual SIP tranches each carry a 3-year lock from their investment date.</div>
    </div>

    <!-- Panels 3 & 4: PPF + SGBs -->
    <div class="grid-2 mt-12">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">PPF — Public Provident Fund</span><span class="badge badge-info">80C</span></div>
        <div class="stat-row"><span class="stat-label">Current balance</span><span class="stat-value mono">${fmtINR(ppfVal)} <span class="label-muted">${fmtGBP(ppfGBP)} equiv</span></span></div>
        <div class="stat-row"><span class="stat-label">Annual contribution</span><span class="stat-value mono">${fmtINR(ppf.annualContributionINR||0)}</span></div>
        <div class="stat-row"><span class="stat-label">Maturity year</span><span class="stat-value mono">${ppf.maturityYear||'—'} ${ppfMaturityBadge}</span></div>
        <div class="stat-row"><span class="stat-label">Years to maturity</span><span class="stat-value mono">${ppfMaturityNote}</span></div>
        <div class="stat-row"><span class="stat-label">Interest this yr (est.)</span><span class="stat-value mono text-positive">${fmtINR(ppfInterestThisYearINR)} <span class="label-muted">@ 7.1% p.a.</span></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          ${invField('Current balance (₹)', 'ppf.currentValueINR', ppfVal)}
          ${invField('Annual contrib (₹)', 'ppf.annualContributionINR', ppf.annualContributionINR)}
          ${invField('Maturity year', 'ppf.maturityYear', ppf.maturityYear)}
        </div>
        <div class="label-muted" style="margin-top:10px">${ppf80CNote}</div>
        <div class="label-muted" style="margin-top:6px">Note: NRIs cannot open new PPF accounts. Existing accounts may continue until maturity.</div>
        <div class="label-muted" style="margin-top:4px">Rate set by Government of India quarterly. Current rate: 7.1% p.a.</div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Sovereign Gold Bonds</span></div>
        <div class="stat-row"><span class="stat-label">Total grams held</span><span class="stat-value mono">${sgbTotalGramsHeld} g</span></div>
        <div class="stat-row"><span class="stat-label">Cost basis (₹)</span><span class="stat-value mono">${fmtINR(sgbTotalCostINR)}</span></div>
        <div class="stat-row"><span class="stat-label">Cost basis (£)</span><span class="stat-value mono">${fmtGBP(sgbGBP)} equiv</span></div>
        <div class="stat-row"><span class="stat-label">Annual interest</span><span class="stat-value mono text-positive">${fmtINR(sgbTotalInterestAnnualINR)}</span></div>
        <div class="label-muted" style="margin-top:10px">Series breakdown:</div>
        ${sgbCards || '<div class="label-muted">No series added yet.</div>'}
        <button class="btn btn-secondary mt-12" id="sgb-add-btn">+ Add Series</button>
        <div class="label-muted" style="margin-top:10px">Current market value not tracked — shows cost basis only. Update values manually after checking NSE/BSE gold rates.</div>
        <div class="label-muted" style="margin-top:4px">Note: Capital gain at maturity is tax-free in India. UK CGT may apply for UK residents. Early exit from Year 5 available at market price.</div>
      </div>
    </div>

    <!-- Panel 5: 80C / 80CCD(1B) tracker -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">Indian Tax Deductions — Estimated Annual Utilisation</span>${used80CPercent>=100?'<span class="badge-danger">Limit Reached</span>':''}</div>
      <div class="label-muted" style="margin-bottom:10px">These are Indian tax deductions on Indian income. They do not affect UK PAYE or Self Assessment calculations.</div>
      <div style="display:flex;justify-content:space-between"><strong>Section 80C breakdown</strong><span class="label-muted">Limit: ${fmtINR(LIMIT_80C)}</span></div>
      <hr class="divider">
      <div class="stat-row"><span class="stat-label">ELSS SIP (annualised)</span><span class="stat-value mono">${fmtINR(elss80C)}</span></div>
      <div class="stat-row"><span class="stat-label">PPF contribution</span><span class="stat-value mono">${fmtINR(ppf80C)}</span></div>
      <div class="stat-row"><span class="stat-label">Total 80C utilised</span><span class="stat-value mono">${fmtINR(total80C)} of ${fmtINR(LIMIT_80C)}</span></div>
      ${progressBar(used80CPercent, isaBarColour(used80CPercent))}
      <div class="label-muted" style="text-align:right">${used80CPercent.toFixed(1)}%</div>
      <div class="stat-row"><span class="stat-label">Remaining 80C headroom</span><span class="stat-value mono">${fmtINR(remaining80C)}</span></div>
      <hr class="divider">
      <div><strong>Section 80CCD(1B) — NPS additional deduction</strong></div>
      <div class="stat-row"><span class="stat-label">NPS Tier 1 (annualised)</span><span class="stat-value mono">${fmtINR(nps80CCD1B)} of ${fmtINR(LIMIT_80CCD1B)} limit</span></div>
      ${progressBar(used80CCD1BPercent, isaBarColour(used80CCD1BPercent))}
      <div class="label-muted" style="text-align:right">${used80CCD1BPercent.toFixed(1)}%</div>
      <hr class="divider">
      <div class="stat-row"><span class="stat-label">Total deductions available</span><span class="stat-value mono text-positive">${fmtINR(totalIndianDeductions)} <span class="label-muted">(80C + 80CCD1B combined)</span></span></div>
    </div>

    <!-- Panel 6: India Portfolio Summary -->
    <div class="panel mt-12">
      <div class="panel-header"><span class="panel-title">India Investment Portfolio</span></div>
      <table class="data-table">
        <tbody>
          <tr><td>NPS Tier 1</td><td class="td-right mono">${fmtINR(npsT1)}</td><td class="td-right mono">${fmtGBP(npsT1GBP)}</td></tr>
          <tr><td>NPS Tier 2</td><td class="td-right mono">${fmtINR(npsT2)}</td><td class="td-right mono">${fmtGBP(npsT2GBP)}</td></tr>
          <tr><td>ELSS Funds</td><td class="td-right mono">${fmtINR(elssTotalINR)}</td><td class="td-right mono">${fmtGBP(elssGBP)}</td></tr>
          <tr><td>PPF</td><td class="td-right mono">${fmtINR(ppfVal)}</td><td class="td-right mono">${fmtGBP(ppfGBP)}</td></tr>
          <tr><td>SGBs (cost basis)</td><td class="td-right mono">${fmtINR(sgbTotalCostINR)}</td><td class="td-right mono">${fmtGBP(sgbGBP)}</td></tr>
          <tr class="total-row"><td><strong>Total (GBP equiv)</strong></td><td></td><td class="td-right mono"><strong>${fmtGBP(totalIndiaGBP)}</strong></td></tr>
        </tbody>
      </table>
      <div class="label-muted" style="margin-top:10px">Exchange rate used: 1 GBP = ₹${safeRate} (from Settings)</div>
    </div>`;

  bindInvFields(st);
  bindInvFieldsText(st);

  const elssAdd = document.getElementById('elss-add-btn');
  if (elssAdd) elssAdd.addEventListener('click', async () => {
    if (!st.investments.elss) st.investments.elss = [];
    st.investments.elss.push({ fund: '', currentValueINR: 0, monthlyINR: 0, lockInDate: '' });
    await saveSec('fin_investments', st.investments);
    render(st);
  });

  el.querySelectorAll('[data-elss-index]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.elssIndex);
      st.investments.elss.splice(idx, 1);
      await saveSec('fin_investments', st.investments);
      render(st);
    });
  });

  const sgbAdd = document.getElementById('sgb-add-btn');
  if (sgbAdd) sgbAdd.addEventListener('click', async () => {
    if (!st.investments.sgbs) st.investments.sgbs = [];
    st.investments.sgbs.push({ series: '', gramsHeld: 0, purchasePriceINR: 0, interestRatePercent: 2.5, maturityDate: '' });
    await saveSec('fin_investments', st.investments);
    render(st);
  });

  el.querySelectorAll('[data-sgb-index]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.sgbIndex);
      st.investments.sgbs.splice(idx, 1);
      await saveSec('fin_investments', st.investments);
      render(st);
    });
  });
}

// ── Charts ─────────────────────────────────────────────────────

function getCtx(id) { if(charts[id]){charts[id].destroy();delete charts[id];}return document.getElementById(id)?.getContext('2d')||null; }

function renderCharts(inv, rate) {
  const base_ = { responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeInOutQuart'},
    plugins:{ legend:{display:true,labels:{color:C.tick,boxWidth:10,font:{size:11}}}, tooltip:{backgroundColor:'rgba(9,12,20,0.96)',borderColor:'rgba(0,191,255,0.25)',borderWidth:1,titleColor:'#00bfff',bodyColor:'#7a96b3',padding:10} },
    scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}}, y:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}} },
  };

  inv.ulips.forEach(u => {
    const vGBP=ulipValueGBP(u,rate),pGBP=ulipPremiumGBP(u,rate);
    const cP=projectULIP(vGBP,pGBP,u.conservativeRatePercent,u.payTermEndDate,u.totalTermYears);
    const eP=projectULIP(vGBP,pGBP,u.expectedRatePercent,u.payTermEndDate,u.totalTermYears);
    const aP=projectULIP(vGBP,pGBP,u.aggressiveRatePercent,u.payTermEndDate,u.totalTermYears);
    const ctx=getCtx('chart-ulip-'+u.id);if(!ctx)return;
    const fmt=v=>u.currency==='GBP'?'£'+Math.round(v).toLocaleString():'₹'+Math.round(v).toLocaleString();
    charts['chart-ulip-'+u.id]=new Chart(ctx,{type:'line',data:{labels:cP.map(p=>`Yr ${p.year}`),datasets:[
      {label:`Conservative ${u.conservativeRatePercent}%`,data:cP.map(p=>p.value),borderColor:C.warning,backgroundColor:'transparent',tension:0.4,pointRadius:0,borderWidth:2,borderDash:[4,4]},
      {label:`Expected ${u.expectedRatePercent}%`,data:eP.map(p=>p.value),borderColor:C.info,backgroundColor:C.info+'22',fill:true,tension:0.4,pointRadius:0,borderWidth:2},
      {label:`Aggressive ${u.aggressiveRatePercent}%`,data:aP.map(p=>p.value),borderColor:C.positive,backgroundColor:'transparent',tension:0.4,pointRadius:0,borderWidth:2,borderDash:[2,2]},
    ]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:fmt}}}}});
  });

  // Combined
  const ctx=getCtx('chart-ulip-combined');if(!ctx||!inv.ulips.length)return;
  const maxYears=Math.max(...inv.ulips.map(u=>u.totalTermYears));
  const yrs=Array.from({length:maxYears+1},(_,i)=>i);
  const combined=yrs.map(yr=>round2(inv.ulips.reduce((s,u)=>{
    const vGBP=ulipValueGBP(u,rate),pGBP=ulipPremiumGBP(u,rate);
    const pts=projectULIP(vGBP,pGBP,u.expectedRatePercent,u.payTermEndDate,u.totalTermYears);
    const pt=pts.find(p=>p.year===yr);
    return s+(pt?pt.value:0);
  },0)));
  charts['chart-ulip-combined']=new Chart(ctx,{type:'line',data:{labels:yrs.map(y=>`Yr ${y}`),datasets:[{label:'Combined ULIPs (£)',data:combined,borderColor:C.purple,backgroundColor:C.purple+'22',fill:true,tension:0.4,pointRadius:2,borderWidth:2}]},options:{...base_,scales:{...base_.scales,y:{...base_.scales.y,ticks:{...base_.scales.y.ticks,callback:v=>'£'+Math.round(v).toLocaleString()}}}}});
}
