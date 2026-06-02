// Pure financial calculations — zero DOM dependencies

export function round2(n) { return Math.round(n * 100) / 100; }
export function round0(n) { return Math.round(n); }

// Never divide by a zero/invalid INR→GBP rate. Fall back to a sensible default.
const safeRate = r => (r && r > 0) ? r : 83;

// ── Net pay ──────────────────────────────────────────────────

export function calculateNetPay({
  baseSalaryGBP, hoursPerWeek, avgOvertimeGrossGBP,
  pensionEmployeeRate, pensionEmployerRate,
  taxFreeAllowanceAnnual, underpaymentMonthlyGBP
}) {
  const baseMonthly       = (baseSalaryGBP || 0) / 12;
  const avgOvertimeMonthly = avgOvertimeGrossGBP || 0;

  // Salary sacrifice: pension reduces taxable AND NIable pay
  const annualGross = (baseMonthly + avgOvertimeMonthly) * 12;
  const annualPension = (baseSalaryGBP || 0) * ((pensionEmployeeRate || 0) / 100); // salary sacrifice on base only
  const adjustedGross = Math.max(0, annualGross - annualPension); // taxable and NIable

  // Personal Allowance (tapered above £100,000 — £1 PA lost per £2 over £100k)
  let pa = taxFreeAllowanceAnnual || 12570;
  if (adjustedGross > 100000) {
    pa = Math.max(0, pa - Math.floor((adjustedGross - 100000) / 2));
  }

  // Income Tax — band by band
  const taxable = Math.max(0, adjustedGross - pa);
  const basicBandMax = Math.max(0, 50270 - pa); // width of basic rate band above PA
  const basicTax = Math.min(taxable, basicBandMax) * 0.20;
  const higherTax = Math.min(Math.max(0, taxable - basicBandMax), 125140 - 50270) * 0.40;
  const additionalTax = Math.max(0, taxable - Math.max(0, 125140 - pa)) * 0.45;
  const annualIncomeTax = basicTax + higherTax + additionalTax;

  // National Insurance (2024/25 rates — employee)
  // 8% on £12,570–£50,270 (primary threshold to upper earnings limit)
  // 2% on everything above £50,270
  const niPT = 12570; // primary threshold
  const niUEL = 50270; // upper earnings limit
  const annualNI =
    Math.max(0, Math.min(adjustedGross, niUEL) - niPT) * 0.08 +
    Math.max(0, adjustedGross - niUEL) * 0.02;

  // Monthly figures
  const monthlyIncomeTax = round2(annualIncomeTax / 12);
  const monthlyNI = round2(annualNI / 12);
  const monthlyPension = round2(annualPension / 12);
  const totalMonthlyGross = round2(baseMonthly + avgOvertimeMonthly);
  const netMonthly = round2(totalMonthlyGross - monthlyIncomeTax - monthlyNI - monthlyPension);

  const extraTax        = underpaymentMonthlyGBP || 0;
  const employerPension = baseMonthly * ((pensionEmployerRate || 0) / 100);
  const hourlyRate      = hoursPerWeek > 0 ? round2((baseSalaryGBP || 0) / (hoursPerWeek * 52)) : 0;

  return {
    grossBase:       round2(baseMonthly),
    grossWithOT:     totalMonthlyGross,
    incomeTax:       monthlyIncomeTax,
    ni:              monthlyNI,
    pension:         monthlyPension,
    employerPension: round2(employerPension),
    extraTax:        round2(extraTax),
    netBase:         round2(baseMonthly - monthlyIncomeTax - monthlyNI - monthlyPension - extraTax),
    netWithOT:       round2(netMonthly - extraTax),
    hourlyRate,
    totalDeductions: round2(monthlyIncomeTax + monthlyNI + monthlyPension + extraTax)
  };
}

// ── SBI amortisation ─────────────────────────────────────────

export function generateAmortisation(outstandingINR, ratePercent, emiINR, extraINR = 0) {
  const monthlyRate = ratePercent / 12 / 100;
  const totalEMI    = emiINR + extraINR;
  let balance       = outstandingINR;
  const schedule    = [];
  let month         = 0;
  let totalInterest = 0;
  let totalPrincipal= 0;

  while (balance > 0.01 && month < 600) {
    month++;
    const interest  = Math.round(balance * monthlyRate);
    // Negative amortisation guard: if the EMI does not even cover the monthly
    // interest, the balance never reduces — bail out instead of looping forever.
    if (totalEMI <= interest && balance > 0) {
      const empty = [];
      empty.error = 'EMI_TOO_LOW';
      return empty;
    }
    const principal = Math.min(Math.round(totalEMI - interest), Math.round(balance));
    balance         = Math.max(0, Math.round(balance - principal));
    totalInterest  += interest;
    totalPrincipal += principal;
    schedule.push({ month, interest, principal, closing: balance, totalInterest, totalPrincipal });
  }
  return schedule;
}

export function amortPayoffDate(schedule) {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + schedule.length, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function amortInterestSaved(schedule1, schedule2) {
  const t1 = schedule1[schedule1.length - 1]?.totalInterest || 0;
  const t2 = schedule2[schedule2.length - 1]?.totalInterest || 0;
  return round0(t1 - t2);
}

export function amortMonthsSaved(schedule1, schedule2) {
  return schedule1.length - schedule2.length;
}

// ── ULIP projection ──────────────────────────────────────────

export function projectULIP(currentValue, monthlyPremium, ratePercent, payTermEndDate, totalTermYears) {
  const monthlyRate = ratePercent / 12 / 100;
  const today       = new Date();
  const payEnd      = payTermEndDate ? new Date(payTermEndDate) : null;
  let value         = currentValue;
  const points      = [{ year: 0, value: Math.round(value) }];

  for (let m = 1; m <= totalTermYears * 12; m++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() + m);
    const withinPayTerm = payEnd && !isNaN(payEnd.getTime()) && date <= payEnd;
    if (withinPayTerm) value = (value + monthlyPremium) * (1 + monthlyRate);
    else               value = value * (1 + monthlyRate);
    if (m % 12 === 0) points.push({ year: m / 12, value: Math.round(value) });
  }
  return points;
}

/** Get value at a specific year from projection points */
export function projectionAtYear(points, year) {
  const pt = points.find(p => p.year === year);
  return pt ? pt.value : null;
}

// ── ULIP currency normalisation ──────────────────────────────

export function ulipValueGBP(ulip, inrGbpRate) {
  if (ulip.currency === 'GBP') return ulip.currentValue;
  return round2(ulip.currentValue / safeRate(inrGbpRate));
}

export function ulipPremiumGBP(ulip, inrGbpRate) {
  if (ulip.currency === 'GBP') return ulip.monthlyPremium;
  return round2(ulip.monthlyPremium / safeRate(inrGbpRate));
}

// ── Net worth ────────────────────────────────────────────────

export function calculateNetWorth(investments, debts, inrGbpRate) {
  const { cashAccounts = [], pensions = [], ulips = [] } = investments;

  const cashTotal    = cashAccounts.reduce((s, a) => s + (a.balanceGBP || 0), 0);
  const pensionTotal = pensions.reduce((s, p) => s + (p.valueGBP || 0), 0);
  const ulipTotal    = ulips.reduce((s, u) => s + ulipValueGBP(u, inrGbpRate), 0);

  // ── UK Wrappers (ISA + SIPP) ─────────────────────────────────
  const isaTotal = (investments.isa?.stocksAndSharesISA?.currentValueGBP || 0)
                 + (investments.isa?.cashISA?.currentValueGBP || 0)
                 + (investments.isa?.lifetimeISA?.currentValueGBP || 0);
  const sippTotal = investments.sipp?.currentValueGBP || 0;

  // ── India (converted to GBP at the safe rate) ────────────────
  const rate = safeRate(inrGbpRate);
  const npsTotal  = ((investments.nps?.tier1ValueINR || 0) + (investments.nps?.tier2ValueINR || 0)) / rate;
  const elssTotal = (investments.elss || []).reduce((s, e) => s + (e.currentValueINR || 0), 0) / rate;
  const ppfTotal  = (investments.ppf?.currentValueINR || 0) / rate;
  const sgbTotal  = (investments.sgbs || []).reduce((s, x) => s + (x.gramsHeld || 0) * (x.purchasePriceINR || 0), 0) / rate;

  const totalAssets  = round2(cashTotal + pensionTotal + ulipTotal
                     + isaTotal + sippTotal + npsTotal + elssTotal + ppfTotal + sgbTotal);

  const sbiGBP       = round2((debts.sbi?.outstandingINR || 0) / safeRate(inrGbpRate));
  const totalDebts   = sbiGBP;

  return {
    cashTotal:    round2(cashTotal),
    pensionTotal: round2(pensionTotal),
    ulipTotal:    round2(ulipTotal),
    totalAssets,
    sbiGBP,
    totalDebts,
    netWorth:     round2(totalAssets - totalDebts)
  };
}

// ── Expenses ─────────────────────────────────────────────────

export function applyScheduledChanges(expenses) {
  const today = new Date().toISOString().slice(0, 10);
  const items = expenses.items.map(item => ({ ...item }));

  for (const change of (expenses.scheduledChanges || [])) {
    if (change.changeDate <= today) {
      const idx = items.findIndex(i => i.id === change.expenseId);
      if (idx >= 0) items[idx].monthlyGBP = change.newMonthlyGBP;
    }
  }
  return items;
}

export function totalExpenses(items) {
  return round2(items.filter(i => i.active).reduce((s, i) => s + i.monthlyGBP, 0));
}

export function expensesByCategory(items) {
  const map = {};
  for (const item of items.filter(i => i.active)) {
    map[item.category] = round2((map[item.category] || 0) + item.monthlyGBP);
  }
  return map;
}

// ── Monthly surplus ──────────────────────────────────────────

export function calculateSurplus(netPay, expenses) {
  return round2(netPay - expenses);
}

// ── India trip ───────────────────────────────────────────────

export function indiaTripProgress(goals) {
  const trip = goals?.indiaTrip;
  if (!trip || !trip.targetGBP) return { pct: 0, remaining: 0, daysLeft: 0, monthsLeft: 0 };
  const pct  = Math.min(100, round2(((trip.savedGBP || 0) / trip.targetGBP) * 100));
  const remaining = round2(trip.targetGBP - (trip.savedGBP || 0));
  const daysLeft  = Math.max(0, Math.round((new Date(trip.deadline) - new Date()) / 86400000));
  const monthsLeft= Math.max(0, round2(daysLeft / 30.44));
  return { pct, remaining, daysLeft, monthsLeft };
}

// ── Emergency fund ───────────────────────────────────────────

export function emergencyFundProgress(investments, goals) {
  const savings = investments.cashAccounts?.reduce((s, a) => s + (a.balanceGBP || 0), 0) || 0;
  const target  = goals.emergencyFundTargetGBP || 3000;
  const pct     = Math.min(100, round2((savings / target) * 100));
  return { savings: round2(savings), target, pct, remaining: round2(Math.max(0, target - savings)) };
}

// ── Net worth toward target ──────────────────────────────────

// Phase 1 (netWorth < 0): debt clearance 0→100%
// Phase 2 (netWorth >= 0): wealth building 0→100%
// Replaces the old formula that showed 49.7% with a deeply negative net worth.
export function wealthProgress(netWorth, targetGBP, totalDebtGBP) {
  if (netWorth < 0) {
    const original = Math.max(totalDebtGBP || 0, Math.abs(netWorth));
    const cleared  = Math.max(0, original - Math.abs(netWorth));
    const pct      = original > 0 ? Math.min(100, round2((cleared / original) * 100)) : 0;
    return { pct, phase: 'debt', netWorth: round2(netWorth), target: targetGBP };
  }
  if (!targetGBP || targetGBP <= 0) {
    return { pct: netWorth > 0 ? 100 : 0, phase: 'wealth', netWorth: round2(netWorth), target: targetGBP };
  }
  const pct = Math.min(100, round2((netWorth / targetGBP) * 100));
  return { pct, phase: 'wealth', netWorth: round2(netWorth), target: targetGBP };
}

// ── Tax tracker ──────────────────────────────────────────────

export function taxTrackerProgress(tracker) {
  if (!tracker?.startDate || !tracker?.endDate || !tracker?.underpaymentTotal) {
    return { collected: 0, remaining: tracker?.underpaymentTotal || 0, pct: 0, monthsElapsed: 0, monthsLeft: 0, daysLeft: 0 };
  }
  const start  = new Date(tracker.startDate);
  const end    = new Date(tracker.endDate);
  const today  = new Date();
  const total  = tracker.underpaymentTotal;
  const monthly= tracker.monthlyDeduction;

  const monthsElapsed = Math.max(0,
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth())
  );
  const collected     = Math.min(total, round2(monthsElapsed * monthly));
  const pct           = Math.min(100, round2((collected / total) * 100));
  const daysLeft      = Math.max(0, Math.round((end - today) / 86400000));
  const monthsLeft    = Math.max(0,
    (end.getFullYear() - today.getFullYear()) * 12 +
    (end.getMonth() - today.getMonth())
  );
  return { collected, remaining: round2(total - collected), pct, monthsElapsed, monthsLeft, daysLeft };
}

// ── Net worth timeline projection ───────────────────────────
//
// Fix history:
//   v1 bug: cashSavings was initialised to totalAssets (incl. pension),
//           then assets = cashSavings + pensionVal → pension counted twice.
//   v1 bug: ULIP compound growth was not modelled; ULIPs sat as static cash.
//
// Now: cashSavings = non-pension, non-ULIP assets only.
//      Pension and ULIPs each tracked separately with their own growth rates.
//      ULIP premiums are already subtracted from monthlySaving (they are expenses),
//      so they are added back as asset growth each month while in pay term.

export function projectNetWorthTimeline(params) {
  const {
    startDate,
    startNetWorth,
    monthlySaving,
    pensionValue,
    pensionMonthly,
    pensionGrowthRate,
    ulipTotalValueGBP   = 0,   // sum of all ULIP current values in GBP
    ulipMonthlyPremGBP  = 0,   // sum of all monthly premiums in GBP
    ulipPayMonthsLeft   = 0,   // months until last pay term ends
    ulipGrowthRate      = 12,  // average expected ULIP growth rate %/yr
    debtOutstandingINR,
    debtEmiINR,
    debtRatePercent,
    inrGbpRate,
    careerTransitionDate,
    newSalaryGBP,
    currentSalaryGBP
  } = params;

  const months = 60; // 5 years
  const start  = startDate ? new Date(startDate) : new Date();
  const result = [];

  // totalAssets = startNetWorth + debtGBP
  const totalAssetsStart = startNetWorth + debtOutstandingINR / safeRate(inrGbpRate);

  // Separate the three asset pools — no double-counting
  let pensionVal   = pensionValue;
  let ulipVal      = ulipTotalValueGBP;
  let cashSavings  = Math.max(0, totalAssetsStart - pensionValue - ulipTotalValueGBP);

  let debtBalance  = debtOutstandingINR;
  let currentSaving= monthlySaving;

  const penRate  = pensionGrowthRate / 12 / 100;
  const ulipRate = ulipGrowthRate    / 12 / 100;

  for (let m = 0; m <= months; m++) {
    const date  = new Date(start);
    date.setMonth(date.getMonth() + m);
    const label = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

    // Career transition boosts monthly saving
    if (careerTransitionDate) {
      const trans = new Date(careerTransitionDate);
      if (date >= trans && newSalaryGBP && currentSalaryGBP) {
        currentSaving = monthlySaving + (newSalaryGBP - currentSalaryGBP) / 12 * 0.4;
      }
    }

    if (m > 0) {
      // Cash savings grow by monthly surplus (already net of ULIP premiums)
      cashSavings += currentSaving;

      // Pension: compound growth + monthly contribution
      pensionVal = pensionVal * (1 + penRate) + pensionMonthly;

      // ULIP: compound growth + premium if still in pay term
      // (premiums are already subtracted from surplus via expenses,
      //  so adding them here is the correct asset-side accounting)
      const ulipPrem = m <= ulipPayMonthsLeft ? ulipMonthlyPremGBP : 0;
      ulipVal = (ulipVal + ulipPrem) * (1 + ulipRate);

      // Debt amortisation
      if (debtBalance > 0) {
        const interest  = Math.round(debtBalance * debtRatePercent / 12 / 100);
        const principal = Math.min(Math.round(debtEmiINR - interest), debtBalance);
        debtBalance     = Math.max(0, debtBalance - principal);
      }
    }

    const debtGBP  = round2(debtBalance / safeRate(inrGbpRate));
    const assets   = round2(cashSavings + pensionVal + ulipVal);
    const netWorth = round2(assets - debtGBP);

    result.push({ label, month: m, assets, liabilities: debtGBP, netWorth, date: date.toISOString().slice(0, 7) });
  }
  return result;
}

// ── Formatting helpers ───────────────────────────────────────

export function fmtGBP(n, decimals = 0) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (n < 0 ? '−£' : '£') + str;
}

export function fmtINR(n) {
  const abs = Math.abs(n);
  // Indian number format
  const str = abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return (n < 0 ? '−₹' : '₹') + str;
}

export function fmtPct(n) {
  return n.toFixed(1) + '%';
}

export function fmtMonths(m) {
  const y = Math.floor(m / 12), mo = m % 12;
  if (y === 0) return `${mo}m`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}m`;
}

// ── Compound growth projection ───────────────────────────────

export function compoundGrowthProjection(monthlyAmount, ratePercent, years) {
  const r = ratePercent / 100 / 12;
  const pts = [{ year: 0, value: 0 }];
  let v = 0;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) v = (v + monthlyAmount) * (1 + r);
    pts.push({ year: y, value: Math.round(v) });
  }
  return pts;
}

// ── Age-based wealth trajectory ──────────────────────────────

export function ageWealthTrajectory(params) {
  const { currentAge, targetAge, startNetWorth, monthlySurplus,
          growthRatePercent, careerTransitionAge, careerTransitionSurplus } = params;
  const r = (growthRatePercent || 7) / 100 / 12;
  const pts = [{ age: currentAge, netWorth: Math.round(startNetWorth) }];
  let nw = startNetWorth;
  for (let y = 1; y <= targetAge - currentAge; y++) {
    const age = currentAge + y;
    const monthly = (careerTransitionAge && age > careerTransitionAge && careerTransitionSurplus)
      ? careerTransitionSurplus : monthlySurplus;
    for (let m = 0; m < 12; m++) nw = nw * (1 + r) + monthly;
    pts.push({ age, netWorth: Math.round(nw) });
  }
  return pts;
}

// ── Emergency fund runway in months ─────────────────────────

export function emergencyRunwayMonths(cashBalanceGBP, monthlyExpensesGBP) {
  if (!monthlyExpensesGBP) return 0;
  return round2(cashBalanceGBP / monthlyExpensesGBP);
}

// ── Surplus trajectory events from state ────────────────────

export function surplusTrajectoryEvents(state) {
  const inc = state.income || {};
  const exp = state.expenses || { items: [], scheduledChanges: [] };
  const tt  = state.taxTracker || {};
  const nwp = state.settings?.nwProjection || {};
  const today = new Date().toISOString().slice(0, 10);

  const basePay  = calculateNetPay(inc);
  const baseExp  = totalExpenses(applyScheduledChanges(exp));
  let   running  = round2(basePay.netWithOT - baseExp);

  const events = [{ date: today, surplus: running, label: 'Now', detail: '' }];

  // Scheduled expense changes (future only)
  const future = (exp.scheduledChanges || [])
    .filter(c => c.changeDate > today)
    .sort((a, b) => a.changeDate.localeCompare(b.changeDate));

  for (const c of future) {
    const item = exp.items.find(i => i.id === c.expenseId);
    const diff = round2((item?.monthlyGBP || 0) - c.newMonthlyGBP);
    running = round2(running + diff);
    events.push({ date: c.changeDate, surplus: running,
      label: item?.name || c.expenseId,
      detail: `${item?.name}: £${item?.monthlyGBP}→£${c.newMonthlyGBP} (+£${diff})` });
  }

  // Tax code normalises
  if (tt.endDate > today) {
    const bump = tt.monthlyDeduction || 38;
    running = round2(running + bump);
    events.push({ date: tt.endDate, surplus: running,
      label: 'Tax code normalises', detail: `1034L clears +£${bump}/mo` });
  }

  // Career transition
  if (nwp.careerTransitionDate > today && nwp.newSalaryGBP) {
    const newPay = calculateNetPay({ ...inc, baseSalaryGBP: nwp.newSalaryGBP, avgOvertimeGrossGBP: 0 });
    const newSurplus = round2(newPay.netBase - baseExp);
    events.push({ date: nwp.careerTransitionDate, surplus: newSurplus,
      label: 'Career transition', detail: `Salary £${Number(nwp.newSalaryGBP).toLocaleString()}` });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Cumulative interest + principal paid from loan start ─────

export function loanPaidToDate(sbi) {
  if (!sbi?.startDate || !sbi?.outstandingINR) return { interestPaid: 0, principalPaid: 0 };
  const start     = new Date(sbi.startDate);
  const today     = new Date();
  const monthsIn  = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()));
  // Use the real sanctioned principal when known; never assume a hardcoded ₹36L.
  // When originalPrincipalINR is unset (0), we cannot reconstruct history — return zeros gracefully.
  const sanctioned = sbi.originalPrincipalINR || 0;
  if (!sanctioned || !sbi.ratePercent || !sbi.emiINR) {
    return { interestPaid: 0, principalPaid: 0, remaining: sbi.outstandingINR || 0 };
  }
  const fullSched  = generateAmortisation(sanctioned, sbi.ratePercent, sbi.emiINR, 0);
  const paid = fullSched.slice(0, monthsIn);
  return {
    interestPaid:  paid.reduce((s, r) => s + r.interest,  0),
    principalPaid: paid.reduce((s, r) => s + r.principal, 0),
    remaining:     sbi.outstandingINR || 0,
  };
}

// ── India NRI Tax ────────────────────────────────────────────
//
// All functions below are pure (zero DOM dependencies). Slab rates and cess
// treatment are per the legally reviewed spec v1.1 (CA Arjun Mehta, ICAI/ICAEW).
// FY 2024-25 / AY 2025-26 baseline. Years are user-configurable in state.

/**
 * Calculates the Section 80E deduction and the resulting tax saving.
 *
 * Rules:
 * - Only available under the old tax regime.
 * - Deduction = full interest paid (no monetary cap per s.80E ITA 1961).
 * - The deduction reduces total Indian taxable income.
 * - Tax saving is estimated at the marginal rate applicable to the taxpayer's
 *   Indian taxable income slab (NRI, old regime).
 * - 8-year window: if deductionYearsUsed >= 8, deduction is zero.
 *
 * @param {object} indiaTax  - the fin_india_tax state object
 * @returns {{ deductionINR: number, taxSavingINR: number, marginalRatePct: number }}
 */
export function calc80EDeduction(indiaTax) {
  const sec80E = indiaTax.sec80E || {};

  // Guard: new regime, not claiming, or window exhausted
  if (
    indiaTax.taxRegime !== 'old' ||
    !sec80E.claimingDeduction ||
    (sec80E.deductionYearsUsed || 0) >= 8
  ) {
    return { deductionINR: 0, taxSavingINR: 0, marginalRatePct: 0 };
  }

  const deductionINR = sec80E.annualInterestPaidINR || 0;

  // Slab-taxable income for marginal rate estimation (before 80E).
  // Rental income uses taxable amount after 30% standard deduction u/s 24(a).
  // Dividend income excluded — it is taxed at flat rate u/s 115A, not slab rates.
  const grossIndiaIncome =
    (indiaTax.nroInterestIncomeINR || 0) +
    ((indiaTax.rentalIncomeINR || 0) * 0.70) +
    (indiaTax.otherIndiaIncomeINR || 0);

  const marginalRatePct = indiaMarginalRate(grossIndiaIncome);

  // Tax saving = deduction × marginal rate × (1 + cess rate). Cess is 4%.
  const taxSavingINR = round2(deductionINR * (marginalRatePct / 100) * 1.04);

  return { deductionINR, taxSavingINR, marginalRatePct };
}

/**
 * Returns the marginal Income Tax rate (%) under India old regime for NRIs.
 * Does not include cess.
 * @param {number} totalIncomeINR
 * @returns {number} rate as percentage, e.g. 20
 */
export function indiaMarginalRate(totalIncomeINR) {
  if (totalIncomeINR <= 250000)  return 0;
  if (totalIncomeINR <= 500000)  return 5;
  if (totalIncomeINR <= 1000000) return 20;
  return 30;
}

/**
 * Calculates India income tax on dividend income from Indian companies / equity MFs.
 *
 * s.115A — NRI dividend income taxed at flat 20% + 4% cess, not at progressive slab rates.
 * Dividend income is bifurcated from other income and taxed separately at this flat rate.
 * The basic exemption limit does NOT apply to this component.
 *
 * Effective combined rate: 20% × 1.04 = 20.8%.
 *
 * @param {number} dividendIncomeINR  - gross dividend income from Indian equities/MFs
 * @returns {number} tax in INR (inclusive of cess)
 */
export function calcDividendTax(dividendIncomeINR) {
  // s.115A — NRI dividend income taxed at flat 20% + 4% cess, not at progressive slab rates.
  return round2((dividendIncomeINR || 0) * 0.208); // 20% flat + 4% cess = 20.8%
}

/**
 * Calculates the net India income tax liability for an NRI
 * after applying TDS credit and DTAA foreign tax credit.
 *
 * Income bifurcation (BLOCKING FIX — CA review 2026-06-02):
 *   - NRO interest + (rental × 0.70) + other income → progressive slab rates via calcIndiaIncomeTax()
 *   - Dividend income → flat 20% + 4% cess via calcDividendTax() (s.115A)
 *   - Rental income: 30% standard deduction u/s 24(a) applied before slab entry.
 *     Taxable rental = rentalIncomeINR × 0.70.
 *
 * Surcharge note: surcharge is not implemented. If total taxable income exceeds
 * ₹50,00,000, surcharge applies and this function will under-calculate tax.
 *
 * @param {object} indiaTax  - the fin_india_tax state object
 * @returns {{
 *   grossIndiaIncomeINR: number,
 *   rentalStdDeductionINR: number,
 *   taxableRentalIncomeINR: number,
 *   sec80EDeductionINR: number,
 *   slabTaxableIncomeINR: number,
 *   slabTaxINR: number,
 *   dividendTaxINR: number,
 *   grossTaxINR: number,
 *   cessINR: number,
 *   totalTaxBeforeCreditINR: number,
 *   totalTdsINR: number,
 *   afterTdsINR: number,
 *   dtaaReliefINR: number,
 *   netPayableINR: number,
 *   refundDueINR: number,
 *   effectiveRatePct: number,
 *   surchargeWarning: boolean
 * }}
 */
export function calcNetIndiaTax(indiaTax) {
  indiaTax = indiaTax || {};
  const nroInterest    = indiaTax.nroInterestIncomeINR || 0;
  const rentalGross    = indiaTax.rentalIncomeINR      || 0;
  const dividendIncome = indiaTax.dividendIncomeINR    || 0;
  const otherIncome    = indiaTax.otherIndiaIncomeINR  || 0;

  // Apply 30% standard deduction u/s 24(a) on rental income before slab entry.
  // Taxable rental income = gross rental × 0.70.
  const rentalStdDeductionINR  = round2(rentalGross * 0.30);
  const taxableRentalIncomeINR = round2(rentalGross * 0.70);

  // Gross income for display (uses gross rental — deduction shown separately)
  const grossIndiaIncomeINR = nroInterest + rentalGross + dividendIncome + otherIncome;

  // Section 80E (old regime only) — applied against slab income only (not dividends)
  const { deductionINR: sec80EDeductionINR } = calc80EDeduction(indiaTax);

  // Slab-taxable income: NRO interest + taxable rental (after 30% deduction) + other - 80E
  // Dividend income is bifurcated out and handled by calcDividendTax() below.
  const slabTaxableIncomeINR = Math.max(
    0,
    nroInterest + taxableRentalIncomeINR + otherIncome - sec80EDeductionINR
  );

  // Surcharge guard: surcharge is not implemented; warn if income exceeds ₹50L.
  const surchargeWarning = (slabTaxableIncomeINR + dividendIncome) > 5000000;
  if (surchargeWarning) {
    console.warn(
      'calcNetIndiaTax: total taxable income exceeds ₹50L — surcharge not applied. Tax calculation is understated.'
    );
  }

  // Slab tax on (NRO interest + taxable rental + other income) — before cess
  const slabTaxBeforeCessINR = calcIndiaIncomeTax(slabTaxableIncomeINR, indiaTax.taxRegime || 'old');
  const slabCessINR          = round2(slabTaxBeforeCessINR * 0.04);
  const slabTaxINR           = round2(slabTaxBeforeCessINR + slabCessINR);

  // s.115A — NRI dividend income taxed at flat 20% + 4% cess, not at progressive slab rates.
  const dividendTaxINR = calcDividendTax(dividendIncome);

  // Combined tax (slab component + dividend flat rate component)
  const totalTaxBeforeCreditINR = round2(slabTaxINR + dividendTaxINR);

  // For backward-compatible return shape, expose grossTaxINR (pre-cess total) and cessINR separately.
  const grossTaxINR = round2(slabTaxBeforeCessINR + (dividendIncome * 0.20));
  const cessINR     = round2(totalTaxBeforeCreditINR - grossTaxINR);

  // Total TDS already deducted
  const totalTdsINR =
    (indiaTax.tdsOnNroInterestINR || 0) +
    (indiaTax.tdsOnRentalINR      || 0) +
    (indiaTax.tdsOnDividendINR    || 0) +
    (indiaTax.tdsOtherINR         || 0);

  // After TDS credit
  const afterTdsINR = round2(totalTaxBeforeCreditINR - totalTdsINR);

  // DTAA foreign tax credit (only if Form 67 filed and relief claimed)
  const dtaaReliefINR = (indiaTax.dtaa?.dtaaReliefClaimed && indiaTax.dtaa?.form67Filed)
    ? (indiaTax.dtaa?.dtaaReliefClaimedINR || 0)
    : 0;

  // Net payable (floor at 0; negative means refund)
  const rawNet = round2(afterTdsINR - dtaaReliefINR);
  const netPayableINR = Math.max(0, rawNet);
  const refundDueINR  = rawNet < 0 ? Math.abs(rawNet) : 0;

  // Effective rate on gross income
  const effectiveRatePct = grossIndiaIncomeINR > 0
    ? round2((totalTaxBeforeCreditINR / grossIndiaIncomeINR) * 100)
    : 0;

  // Section 80TTA and 80TTB are not applicable to NRIs on NRO interest income and are intentionally excluded.

  return {
    grossIndiaIncomeINR,
    rentalStdDeductionINR,
    taxableRentalIncomeINR,
    sec80EDeductionINR,
    slabTaxableIncomeINR,
    slabTaxINR,
    dividendTaxINR,
    grossTaxINR,
    cessINR,
    totalTaxBeforeCreditINR,
    totalTdsINR,
    afterTdsINR,
    dtaaReliefINR,
    netPayableINR,
    refundDueINR,
    effectiveRatePct,
    surchargeWarning,
  };
}

/**
 * Computes India income tax on a given slab-taxable income under the specified regime.
 * NRI slab rates — FY 2024-25 (AY 2025-26). Does NOT include cess.
 *
 * IMPORTANT: Do NOT pass dividend income to this function.
 * Dividend income from Indian companies/MFs is taxed at a flat 20% u/s 115A (not slab rates)
 * and must be processed via calcDividendTax() separately. See calcNetIndiaTax() for the
 * correct bifurcation logic.
 *
 * Old regime slabs:
 *   0 – 2,50,000: 0%
 *   2,50,001 – 5,00,000: 5%
 *   5,00,001 – 10,00,000: 20%
 *   Above 10,00,000: 30%
 *
 * New regime slabs (NRI, FY 2024-25 post-Budget):
 *   0 – 3,00,000: 0%
 *   3,00,001 – 7,00,000: 5%
 *   7,00,001 – 10,00,000: 10%
 *   10,00,001 – 12,00,000: 15%
 *   12,00,001 – 15,00,000: 20%
 *   Above 15,00,000: 30%
 * Note: Rebate u/s 87A is NOT available to NRIs.
 *
 * @param {number} taxableIncomeINR
 * @param {'old'|'new'} regime
 * @returns {number} tax in INR (before cess)
 */
export function calcIndiaIncomeTax(taxableIncomeINR, regime) {
  if (regime === 'new') {
    return calcSlabTax(taxableIncomeINR, [
      { upTo: 300000,   rate: 0    },
      { upTo: 700000,   rate: 0.05 },
      { upTo: 1000000,  rate: 0.10 },
      { upTo: 1200000,  rate: 0.15 },
      { upTo: 1500000,  rate: 0.20 },
      { upTo: Infinity, rate: 0.30 },
    ]);
  }
  // Old regime (default)
  return calcSlabTax(taxableIncomeINR, [
    { upTo: 250000,   rate: 0    },
    { upTo: 500000,   rate: 0.05 },
    { upTo: 1000000,  rate: 0.20 },
    { upTo: Infinity, rate: 0.30 },
  ]);
}

/**
 * Generic slab tax calculator.
 * @param {number} income
 * @param {{ upTo: number, rate: number }[]} slabs - ordered ascending by upTo
 * @returns {number} tax
 */
export function calcSlabTax(income, slabs) {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (income <= prev) break;
    const taxable = Math.min(income, slab.upTo) - prev;
    tax += taxable * slab.rate;
    prev = slab.upTo;
  }
  return round2(tax);
}

/**
 * Calculates the total tax paid on Indian-sourced income across both jurisdictions.
 *
 * Formula:
 *   indiaTaxGBP         = netPayableINR / inrGbpRate
 *   totalCrossBorderGBP = ukTaxOnIndiaIncomeGBP + indiaTaxGBP
 *
 * This represents the combined tax cost of earning Indian income, in GBP.
 * The DTAA is designed to prevent double taxation; this figure shows the actual
 * combined burden after all reliefs.
 *
 * @param {object} indiaTax    - fin_india_tax state
 * @param {number} inrGbpRate  - from fin_settings.inrGbpRate
 * @returns {{
 *   netIndiaTaxGBP: number,
 *   ukTaxOnIndiaIncomeGBP: number,
 *   totalCrossBorderGBP: number,
 *   crossBorderEffectiveRatePct: number
 * }}
 */
export function calcCrossBorderPosition(indiaTax, inrGbpRate) {
  const rate = (inrGbpRate && inrGbpRate > 0) ? inrGbpRate : 83;
  const { netPayableINR, grossIndiaIncomeINR } = calcNetIndiaTax(indiaTax);

  const netIndiaTaxGBP = round2(netPayableINR / rate);
  const ukTaxOnIndiaIncomeGBP = indiaTax.dtaa?.ukTaxPaidOnIndiaIncomeGBP || 0;
  const totalCrossBorderGBP = round2(netIndiaTaxGBP + ukTaxOnIndiaIncomeGBP);

  const grossIndiaIncomeGBP = round2(grossIndiaIncomeINR / rate);
  const crossBorderEffectiveRatePct = grossIndiaIncomeGBP > 0
    ? round2((totalCrossBorderGBP / grossIndiaIncomeGBP) * 100)
    : 0;

  return {
    netIndiaTaxGBP,
    ukTaxOnIndiaIncomeGBP,
    totalCrossBorderGBP,
    crossBorderEffectiveRatePct,
  };
}

/**
 * Returns the ITR filing deadline and alert state for the current AY.
 *
 * Rules (India Income Tax Act):
 * - Normal (non-audit) deadline: 31 July of the AY (e.g. AY 2025-26 → 31 July 2025)
 * - Audit case deadline: 31 October of the AY
 * - "AY YYYY-YY" format: the first YYYY is the AY calendar year.
 *
 * Alert states:
 *   'filed'        — ITR already filed (green)
 *   'not_required' — not required (grey)
 *   'ok'           — not filed, deadline > 30 days away (neutral)
 *   'warning'      — not filed, 1–30 days to deadline (amber)
 *   'overdue'      — not filed, deadline passed (red)
 *
 * @param {object} itr    - indiaTax.itr
 * @param {string} today  - ISO date string YYYY-MM-DD
 * @returns {{
 *   deadline: Date,
 *   deadlineISO: string,
 *   daysToDeadline: number,
 *   alertState: 'filed'|'not_required'|'ok'|'warning'|'overdue',
 *   deadlineLabel: string
 * }}
 */
export function calcITRDeadline(itr, today) {
  itr = itr || {};
  if (itr.filingStatus === 'filed') {
    return { deadline: null, deadlineISO: '', daysToDeadline: 0, alertState: 'filed', deadlineLabel: 'Filed' };
  }
  if (itr.filingStatus === 'not_required') {
    return { deadline: null, deadlineISO: '', daysToDeadline: 0, alertState: 'not_required', deadlineLabel: 'Not required' };
  }

  // Parse AY year from assessmentYear string e.g. 'AY 2025-26' → 2025
  const ayMatch = (itr.assessmentYear || '').match(/AY\s+(\d{4})/);
  const ayYear = ayMatch ? parseInt(ayMatch[1], 10) : new Date().getFullYear();

  const deadlineMonth = itr.isAuditCase ? 9 : 6; // October = 9, July = 6 (0-indexed)
  const deadline = new Date(ayYear, deadlineMonth, 31);
  const deadlineISO = deadline.toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const daysToDeadline = Math.round((deadline - todayDate) / 86400000);

  let alertState;
  if (daysToDeadline < 0)  alertState = 'overdue';
  else if (daysToDeadline <= 30) alertState = 'warning';
  else alertState = 'ok';

  const deadlineLabel = deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return { deadline, deadlineISO, daysToDeadline, alertState, deadlineLabel };
}
