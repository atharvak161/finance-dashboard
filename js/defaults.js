// Default financial data — shown until the user saves their own values.
// NOTE: These defaults are visible in source code / GitHub.
// All personal values are zeroed; enter your own values via Settings.

export const DEFAULTS = {

  fin_profile: {
    name: '',
    age: 0,
    inrGbpRate: 83,
    targetAge: 60,
    wealthTargetGBP: 0,
  },

  fin_income: {
    baseSalaryGBP: 0,
    hoursPerWeek: 37.5,
    avgOvertimeGrossGBP: 0,
    pensionEmployeeRate: 5,
    pensionEmployerRate: 3,
    taxCode: '1257L',
    taxFreeAllowanceAnnual: 12570,
    underpaymentMonthlyGBP: 0,
    underpaymentClearsDate: '',
  },

  fin_expenses: {
    items: [
      { id: 'rent',    name: 'Rent',                category: 'Housing',      monthlyGBP: 0, active: true },
      { id: 'sbi',     name: 'Education Loan EMI',   category: 'Debt',         monthlyGBP: 0, active: true },
      { id: 'sud',     name: 'SUD Life ULIP',         category: 'Insurance',    monthlyGBP: 0, active: true },
      { id: 'pnb',     name: 'PNB MetLife ULIP',      category: 'Insurance',    monthlyGBP: 0, active: true },
      { id: 'axis',    name: 'Axis Max Life ULIP',    category: 'Insurance',    monthlyGBP: 0, active: true },
      { id: 'ee',      name: 'EE Phone',               category: 'Phone',        monthlyGBP: 0, active: true },
      { id: 'tfl',     name: 'TFL Transport',          category: 'Transport',    monthlyGBP: 0, active: true },
      { id: 'apple',   name: 'Apple / iTunes',         category: 'Subscription', monthlyGBP: 0, active: true },
      { id: 'thm',     name: 'TryHackMe',              category: 'Subscription', monthlyGBP: 0, active: true },
      { id: 'claude',  name: 'Claude Pro',             category: 'Subscription', monthlyGBP: 0, active: true },
      { id: 'yonder',  name: 'Yonder Membership',      category: 'Subscription', monthlyGBP: 0, active: true },
      { id: 'grocery', name: 'Groceries (own)',        category: 'Food',         monthlyGBP: 0, active: true },
      { id: 'eat',     name: 'Eating out / social',    category: 'Food',         monthlyGBP: 0, active: true },
      { id: 'hair',    name: 'Hair (amortised)',       category: 'Personal',     monthlyGBP: 0, active: true },
      { id: 'india',   name: 'India trip (amortised)', category: 'Travel',       monthlyGBP: 0, active: true },
    ],
    scheduledChanges: [],
  },

  fin_debts: {
    sbi: {
      originalPrincipalINR: 0,
      outstandingINR: 0,
      ratePercent: 0,
      emiINR: 0,
      startDate: '',
      coApplicant: '',
      extraMonthlyINR: 0,
    },
  },

  fin_investments: {
    cashAccounts: [
      { id: 'revolut', name: 'Revolut Savings Vault', balanceGBP: 0, aerPercent: 0, note: '' },
    ],
    pensions: [
      {
        id: 'standard_life',
        name: 'Standard Life Pension',
        provider: 'Standard Life',
        valueGBP: 0,
        monthlyGBP: 0,
        status: 'active',
        note: '',
      },
    ],
    ulips: [
      {
        id: 'sud',
        name: 'International Wealth Creator',
        insurer: 'SUD Life (GIFT City)',
        currency: 'GBP',
        monthlyPremium: 0,
        currentValue: 0,
        lockInDate: '',
        payTermEndDate: '',
        totalTermYears: 20,
        sumAssuredGBP: 0,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
      {
        id: 'pnb',
        name: 'Smart Goal Ensuring Multiplier',
        insurer: 'PNB MetLife',
        currency: 'INR',
        monthlyPremium: 0,
        currentValue: 0,
        lockInDate: '',
        payTermEndDate: '',
        totalTermYears: 20,
        sumAssuredGBP: 0,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
      {
        id: 'axis',
        name: 'Online Savings Plan',
        insurer: 'Axis Max Life',
        currency: 'INR',
        monthlyPremium: 0,
        currentValue: 0,
        lockInDate: '',
        payTermEndDate: '',
        totalTermYears: 20,
        sumAssuredGBP: 0,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
    ],
    isa: {
      stocksAndSharesISA: {
        provider: '',
        currentValueGBP: 0,
        annualContributionGBP: 0,
        yearToDateContributionGBP: 0,
      },
      cashISA: {
        provider: '',
        currentValueGBP: 0,
        annualContributionGBP: 0,
        yearToDateContributionGBP: 0,
      },
      lifetimeISA: {
        provider: '',
        currentValueGBP: 0,
        annualContributionGBP: 0,
        yearToDateContributionGBP: 0,
        bonusReceivedGBP: 0,
        firstHomePurpose: false,
      },
    },
    sipp: {
      provider: '',
      currentValueGBP: 0,
      annualContributionGBP: 0,
      yearToDateContributionGBP: 0,
      employerContributionGBP: 0,
    },
    nps: {
      tier1ValueINR: 0,
      tier1MonthlyINR: 0,
      tier2ValueINR: 0,
      equityAllocationPercent: 75,
    },
    elss: [
      { fund: '', currentValueINR: 0, monthlyINR: 0, lockInDate: '' },
    ],
    ppf: {
      currentValueINR: 0,
      annualContributionINR: 0,
      maturityYear: 0,
    },
    sgbs: [
      { series: '', gramsHeld: 0, purchasePriceINR: 0, interestRatePercent: 2.5, maturityDate: '' },
    ],
  },

  fin_goals: {
    emergencyFundTargetGBP: 0,
    wealthTargetGBP: 0,
    targetAge: 60,
    indiaTrip: {
      targetGBP: 0,
      savedGBP: 0,
      deadline: '',
      flightsPaid: true,
      breakdown: [
        { item: 'Work',            currency: 'INR', amountINR: 0, amountGBP: 0, paid: false },
        { item: 'Vacation',        currency: 'GBP', amountINR: 0, amountGBP: 0, paid: false },
        { item: 'Family/shopping', currency: 'GBP', amountINR: 0, amountGBP: 0, paid: false },
        { item: 'Flights',         currency: 'GBP', amountINR: 0, amountGBP: 0, paid: true  },
      ],
    },
  },

  fin_monthly_log: [],

  fin_settings: {
    inactivityTimeoutMinutes: 60,
    theme: 'dark',
    inrGbpRate: 83,
    showInrEquivalents: true,
    nwProjection: {
      pensionGrowthRate: 7,
      careerTransitionDate: '',
      newSalaryGBP: '',
    },
    chartParams: {
      ageTrajectory: {
        currentAge: 0,
        targetAge: 60,
        growthRatePercent: 10,
        careerTransitionAge: 0,
        careerTransitionMonthlySurplus: 0,
      },
      budgetByCategory: {
        Housing: 0, Debt: 0, Insurance: 0, Phone: 0,
        Transport: 0, Subscription: 0, Food: 0, Personal: 0, Travel: 0, Other: 0,
      },
      compoundGrowth: {
        monthlyAmount: 0,
        ratePercent: 10,
        years: 25,
      },
    },
  },

  fin_tax_tracker: {
    taxCode: '1257L',
    underpaymentTotal: 0,
    monthlyDeduction: 0,
    startDate: '',
    endDate: '',
    verifiedMonths: [],
  },

  fin_india_log: [],

  // ── India NRI Tax Module (CA Arjun Mehta approved, spec v1.1) ──
  // Separate jurisdiction key from fin_tax_tracker (UK-only).
  fin_india_tax: {

    // ── Assessment year configuration ─────────────────────────
    assessmentYear: 'AY 2025-26',     // string, e.g. 'AY 2025-26'. Financial year = 'FY 2024-25'.
    taxRegime: 'old',                 // 'old' | 'new'. Old regime allows 80E; new regime does not.

    // ── Indian income sources (NRI-relevant) ──────────────────
    nroInterestIncomeINR: 0,          // Annual NRO savings/FD interest received (INR). Subject to TDS.
                                      // UI note: NRE account interest is tax-exempt u/s 10(4)(ii) IT Act 1961
                                      // and should NOT be included here.
    rentalIncomeINR: 0,               // Annual gross rental income from Indian property (INR).
                                      // Gross rental received — 30% standard deduction u/s 24(a) applied
                                      // automatically before slab calculation. Taxable amount = rentalIncomeINR × 0.70.
    dividendIncomeINR: 0,             // Annual dividend income from Indian equities/MFs (INR).
                                      // s.115A — NRI dividend income taxed at flat 20% + 4% cess,
                                      // NOT at progressive slab rates. Handled separately in calcDividendTax().
    otherIndiaIncomeINR: 0,           // Any other Indian-sourced income not listed above (INR).
    otherIndiaIncomeNote: '',         // Free text description of otherIndiaIncomeINR.

    // ── TDS deducted in India ─────────────────────────────────
    tdsOnNroInterestINR: 0,           // TDS deducted by bank on NRO interest (normally 30% + surcharge + cess).
    tdsOnRentalINR: 0,                // TDS deducted by tenant on rental income (normally 30% for NRI landlord).
    tdsOnDividendINR: 0,              // TDS deducted by company/fund on dividends.
    tdsOtherINR: 0,                   // Any other TDS deducted (INR).

    // ── Section 80E — Education loan interest deduction ───────
    // Only available under the old tax regime. Deductible for up to 8 consecutive AYs.
    sec80E: {
      claimingDeduction: false,       // boolean. True = taxpayer is claiming 80E in this AY.
      loanHolder: 'self',             // 'self' | 'spouse' | 'child' | 'student_for_whom_legal_guardian'
      lenderName: 'SBI',              // string. Free text. Must be approved financial institution.
      annualInterestPaidINR: 0,       // Annual interest paid on the education loan during this FY (INR).
                                      // Source: SBI annual interest certificate / statement.
      deductionAY1: 'AY 2023-24',     // string. AY in which 80E was first claimed (year 1 of 8).
      deductionYearsUsed: 0,          // integer 0–8. How many AYs the 80E deduction has been used.
      deductionYearsRemaining: 8,     // integer. Auto-calculated: 8 - deductionYearsUsed. Read-only.
    },

    // ── ITR filing status ─────────────────────────────────────
    itr: {
      filingStatus: 'not_filed',      // 'not_filed' | 'filed' | 'not_required'
      itrFormNumber: 'ITR-2',         // 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4'. NRIs typically file ITR-2.
      filingDate: '',                 // ISO date string (YYYY-MM-DD). Date ITR was submitted.
      acknowledgementNumber: '',      // string. 15-digit ITR acknowledgement number from CPC.
      filingMode: 'online',           // 'online' | 'paper'. NRIs must file online.
      isAuditCase: false,             // boolean. If true, deadline is 31 Oct; otherwise 31 Jul.
      assessmentYear: 'AY 2025-26',   // string. AY the ITR covers (should mirror top-level assessmentYear).
      refundDue: false,               // boolean. Whether a refund is expected.
      refundAmountINR: 0,             // number (INR). Expected refund, if any.
      refundReceivedDate: '',         // ISO date string. Date refund credited to bank.
      noticeReceived: false,          // boolean. Whether any notice/scrutiny has been received.
      noticeDetails: '',              // Free text. Nature of notice if received.
    },

    // ── DTAA relief ───────────────────────────────────────────
    // India-UK DTAA (signed 1993). Relief can be claimed in India ITR via DTAA Article 25 (relief method).
    dtaa: {
      dtaaReliefClaimed: false,       // boolean. Is DTAA foreign tax credit being claimed in Indian ITR?
      ukTaxPaidOnIndiaIncomeGBP: 0,   // GBP. UK income tax paid that relates to Indian-sourced income.
                                      // Used to claim credit in India ITR (convert to INR at RBI rate on relevant date).
      dtaaReliefClaimedINR: 0,        // INR. Actual amount of DTAA credit claimed in the ITR (from Form 67).
      form67Filed: false,             // boolean. Form 67 (foreign tax credit claim) must be filed before ITR.
      form67FilingDate: '',           // ISO date string. Date Form 67 was filed.
      rbiRateUsed: 0,                 // number. INR/GBP exchange rate used for conversion in Form 67 (RBI TT buying rate).
    },

    // ── Cross-border double tax tracker ──────────────────────
    // Tracks the net tax position across both jurisdictions on Indian-sourced income.
    crossBorder: {
      ukTaxOnIndiaIncomeGBP: 0,       // GBP. UK income tax attributable to Indian income sources (from SA106 working).
      indiaTaxAfterReliefINR: 0,      // INR. Net India tax payable after TDS credit and DTAA relief (auto-calculated).
      netDoubleTaxPositionGBP: 0,     // GBP. Net total tax paid on Indian income in both countries (auto-calculated).
    },
  },
};
