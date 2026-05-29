// Default financial data — shown on first login until the user saves their own values.
// NOTE: These defaults are visible in source code / GitHub.
// Personal values should be updated via Settings after first login.

export const DEFAULTS = {

  fin_profile: {
    name: 'Atharva Kishor Kulkarni',
    age: 25,
    inrGbpRate: 125,
    targetAge: 50,
    wealthTargetGBP: 4760000,
  },

  fin_income: {
    baseSalaryGBP: 28000,
    hoursPerWeek: 37.5,
    avgOvertimeGrossGBP: 275,
    pensionEmployeeRate: 3,
    pensionEmployerRate: 3,
    taxCode: '1034L',
    taxFreeAllowanceAnnual: 10348,
    underpaymentMonthlyGBP: 38,
    underpaymentClearsDate: '2027-04-05',
  },

  fin_expenses: {
    items: [
      { id: 'rent',    name: 'Rent',                category: 'Housing',      monthlyGBP: 700,  active: true },
      { id: 'sbi',     name: 'SBI Loan EMI',         category: 'Debt',         monthlyGBP: 325,  active: true },
      { id: 'sud',     name: 'SUD Life ULIP',         category: 'Insurance',    monthlyGBP: 149,  active: true },
      { id: 'pnb',     name: 'PNB MetLife ULIP',      category: 'Insurance',    monthlyGBP: 84,   active: true },
      { id: 'axis',    name: 'Axis Max Life ULIP',    category: 'Insurance',    monthlyGBP: 85,   active: true },
      { id: 'ee',      name: 'EE Phone',               category: 'Phone',        monthlyGBP: 74,   active: true },
      { id: 'tfl',     name: 'TFL Transport',          category: 'Transport',    monthlyGBP: 95,   active: true },
      { id: 'apple',   name: 'Apple / iTunes',         category: 'Subscription', monthlyGBP: 20,   active: true },
      { id: 'thm',     name: 'TryHackMe',              category: 'Subscription', monthlyGBP: 15,   active: true },
      { id: 'claude',  name: 'Claude Pro',             category: 'Subscription', monthlyGBP: 18,   active: true },
      { id: 'yonder',  name: 'Yonder Membership',      category: 'Subscription', monthlyGBP: 15,   active: true },
      { id: 'grocery', name: 'Groceries (own)',        category: 'Food',         monthlyGBP: 15,   active: true },
      { id: 'eat',     name: 'Eating out / social',    category: 'Food',         monthlyGBP: 70,   active: true },
      { id: 'hair',    name: 'Hair (amortised)',       category: 'Personal',     monthlyGBP: 8,    active: true },
      { id: 'india',   name: 'India trip (amortised)', category: 'Travel',       monthlyGBP: 113,  active: true },
    ],
    scheduledChanges: [
      { expenseId: 'rent', changeDate: '2026-08-01', newMonthlyGBP: 600, note: 'Brother debt cleared — rent reverts to £600' },
      { expenseId: 'ee',   changeDate: '2026-10-31', newMonthlyGBP: 12,  note: 'EE contract ends — switch to SIM-only ~£12' },
    ],
  },

  fin_debts: {
    sbi: {
      outstandingINR: 2752000,
      ratePercent: 9.90,
      emiINR: 34090,
      startDate: '2022-06-22',
      coApplicant: 'Kishor Kulkarni',
      extraMonthlyINR: 0,
    },
  },

  fin_investments: {
    cashAccounts: [
      { id: 'revolut', name: 'Revolut Savings Vault', balanceGBP: 600, aerPercent: 3.0, note: 'Emergency buffer' },
    ],
    pensions: [
      {
        id: 'standard_life',
        name: 'Standard Life Pension',
        provider: 'Standard Life',
        valueGBP: 1690,
        monthlyGBP: 115,
        status: 'active',
        note: 'Eurostop workplace pension. Includes transferred People\'s Pension (£693) + accumulated contributions.',
      },
    ],
    ulips: [
      {
        id: 'sud',
        name: 'International Wealth Creator',
        insurer: 'SUD Life (GIFT City)',
        currency: 'GBP',
        monthlyPremium: 149,
        currentValue: 149,
        lockInDate: '2028-04-01',
        payTermEndDate: '2031-04-01',
        totalTermYears: 20,
        sumAssuredGBP: 19000,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
      {
        id: 'pnb',
        name: 'Smart Goal Ensuring Multiplier',
        insurer: 'PNB MetLife',
        currency: 'INR',
        monthlyPremium: 10000,
        currentValue: 30052,
        lockInDate: '2028-01-01',
        payTermEndDate: '2031-01-01',
        totalTermYears: 20,
        sumAssuredGBP: 11400,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
      {
        id: 'axis',
        name: 'Online Savings Plan',
        insurer: 'Axis Max Life',
        currency: 'INR',
        monthlyPremium: 10000,
        currentValue: 31555,
        lockInDate: '2028-01-01',
        payTermEndDate: '2031-01-01',
        totalTermYears: 20,
        sumAssuredGBP: 11400,
        conservativeRatePercent: 8,
        expectedRatePercent: 12,
        aggressiveRatePercent: 16,
      },
    ],
  },

  fin_goals: {
    emergencyFundTargetGBP: 3000,
    wealthTargetGBP: 4760000,
    targetAge: 50,
    indiaTrip: {
      targetGBP: 3000,
      savedGBP: 600,
      deadline: '2026-10-31',
      flightsPaid: true,
      breakdown: [
        { item: 'Work',            currency: 'INR', amountINR: 225000, amountGBP: 1800, paid: false },
        { item: 'Vacation',        currency: 'GBP', amountINR: 0,      amountGBP: 600,  paid: false },
        { item: 'Family/shopping', currency: 'GBP', amountINR: 0,      amountGBP: 600,  paid: false },
        { item: 'Flights',         currency: 'GBP', amountINR: 0,      amountGBP: 650,  paid: true  },
      ],
    },
  },

  fin_monthly_log: [
    { month: '2026-05', netGBP: 2243.51, savedGBP: 100,  note: 'Actual — May payslip. Salary £2,166.67 (£26k) + OT £725. Tax £405.80, NI £147.49, Pension £94.87. Promoted end of May.' },
    { month: '2026-06', netGBP: 2003,   savedGBP: 217,  note: 'Estimated — £28k salary + avg OT £275. Surplus after £1,786 expenses.' },
    { month: '2026-07', netGBP: 2003,   savedGBP: 217,  note: 'Estimated — £28k salary + avg OT £275.' },
    { month: '2026-08', netGBP: 2003,   savedGBP: 317,  note: 'Estimated — rent drops £700→£600 (brother debt cleared). Surplus +£100.' },
    { month: '2026-09', netGBP: 2003,   savedGBP: 317,  note: 'Estimated — £28k salary + avg OT £275.' },
    { month: '2026-10', netGBP: 2003,   savedGBP: 379,  note: 'Estimated — EE contract ends, SIM-only saves £62. Surplus +£62.' },
  ],

  fin_settings: {
    inactivityTimeoutMinutes: 15,
    theme: 'dark',
    inrGbpRate: 125,
    showInrEquivalents: true,
    nwProjection: {
      pensionGrowthRate: 7,
      careerTransitionDate: '',
      newSalaryGBP: '',
    },
  },

  fin_tax_tracker: {
    taxCode: '1034L',
    underpaymentTotal: 456,
    monthlyDeduction: 38,
    startDate: '2026-04-06',
    endDate: '2027-04-05',
    verifiedMonths: [],
  },

  fin_india_log: [],
};
