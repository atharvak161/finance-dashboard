// Pure financial calculations — zero DOM dependencies

export function round2(n) { return Math.round(n * 100) / 100; }
export function round0(n) { return Math.round(n); }

// ── Net pay ──────────────────────────────────────────────────

export function calculateNetPay({
  baseSalaryGBP, hoursPerWeek, avgOvertimeGrossGBP,
  pensionEmployeeRate, pensionEmployerRate,
  taxFreeAllowanceAnnual, underpaymentMonthlyGBP
}) {
  const baseMonthly    = baseSalaryGBP / 12;
  const totalGross     = baseMonthly + (avgOvertimeGrossGBP || 0);
  const taxFreeMonthly = taxFreeAllowanceAnnual / 12;
  const incomeTax      = Math.max(0, totalGross - taxFreeMonthly) * 0.20;
  const niable         = Math.max(0, Math.min(totalGross, 4189) - 1048);
  const ni             = niable * 0.08;
  const pension        = baseMonthly * ((pensionEmployeeRate || 0) / 100);
  const extraTax       = underpaymentMonthlyGBP || 0;
  const employerPension = baseMonthly * ((pensionEmployerRate || 0) / 100);

  return {
    grossBase:       round2(baseMonthly),
    grossWithOT:     round2(totalGross),
    incomeTax:       round2(incomeTax),
    ni:              round2(ni),
    pension:         round2(pension),
    employerPension: round2(employerPension),
    extraTax:        round2(extraTax),
    netBase:         round2(baseMonthly - incomeTax - ni - pension - extraTax),
    netWithOT:       round2(totalGross - incomeTax - ni - pension - extraTax),
    hourlyRate:      round2(baseSalaryGBP / 1950),
    totalDeductions: round2(incomeTax + ni + pension + extraTax)
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
  const payEnd      = new Date(payTermEndDate);
  let value         = currentValue;
  const points      = [{ year: 0, value: Math.round(value) }];

  for (let m = 1; m <= totalTermYears * 12; m++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() + m);
    if (date <= payEnd) value = (value + monthlyPremium) * (1 + monthlyRate);
    else                value = value * (1 + monthlyRate);
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
  return round2(ulip.currentValue / inrGbpRate);
}

export function ulipPremiumGBP(ulip, inrGbpRate) {
  if (ulip.currency === 'GBP') return ulip.monthlyPremium;
  return round2(ulip.monthlyPremium / inrGbpRate);
}

// ── Net worth ────────────────────────────────────────────────

export function calculateNetWorth(investments, debts, inrGbpRate) {
  const { cashAccounts = [], pensions = [], ulips = [] } = investments;

  const cashTotal    = cashAccounts.reduce((s, a) => s + (a.balanceGBP || 0), 0);
  const pensionTotal = pensions.reduce((s, p) => s + (p.valueGBP || 0), 0);
  const ulipTotal    = ulips.reduce((s, u) => s + ulipValueGBP(u, inrGbpRate), 0);
  const totalAssets  = round2(cashTotal + pensionTotal + ulipTotal);

  const sbiGBP       = round2((debts.sbi?.outstandingINR || 0) / inrGbpRate);
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
  const trip = goals.indiaTrip;
  const pct  = Math.min(100, round2((trip.savedGBP / trip.targetGBP) * 100));
  const remaining = round2(trip.targetGBP - trip.savedGBP);
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

export function wealthProgress(netWorth, targetGBP) {
  const pct = Math.max(0, Math.min(100, round2(((netWorth + targetGBP) / (2 * targetGBP)) * 100)));
  return { pct, netWorth: round2(netWorth), target: targetGBP };
}

// ── Tax tracker ──────────────────────────────────────────────

export function taxTrackerProgress(tracker) {
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

export function projectNetWorthTimeline(params) {
  const {
    startDate,
    startNetWorth,
    monthlySaving,
    pensionValue,
    pensionMonthly,
    pensionGrowthRate,
    ulipValues,          // array of { currentValue, monthlyPremium, payTermEndDate, termYears, rate }
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

  let cashSavings     = Math.max(0, startNetWorth + debtOutstandingINR / inrGbpRate);
  let pensionVal      = pensionValue;
  let debtBalance     = debtOutstandingINR;
  let currentSaving   = monthlySaving;

  for (let m = 0; m <= months; m++) {
    const date     = new Date(start);
    date.setMonth(date.getMonth() + m);
    const label    = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

    // Career transition
    if (careerTransitionDate) {
      const trans = new Date(careerTransitionDate);
      if (date >= trans && newSalaryGBP && currentSalaryGBP) {
        currentSaving = monthlySaving + (newSalaryGBP - currentSalaryGBP) / 12 * 0.4;
      }
    }

    if (m > 0) {
      cashSavings += currentSaving;
      pensionVal  *= 1 + pensionGrowthRate / 12 / 100;
      pensionVal  += pensionMonthly;

      if (debtBalance > 0) {
        const interest  = Math.round(debtBalance * debtRatePercent / 12 / 100);
        const principal = Math.min(Math.round(debtEmiINR - interest), debtBalance);
        debtBalance     = Math.max(0, debtBalance - principal);
      }
    }

    const debtGBP  = round2(debtBalance / inrGbpRate);
    const assets   = round2(cashSavings + pensionVal);
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
