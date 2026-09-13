# Personal Financial Dashboard

A personal finance tracker built with vanilla HTML, CSS, and JavaScript. No login, no server, no build step — open it in a browser and go.

---

## Architecture

### Shape

```
  16 HTML pages ── one per view, each a thin shell
      │           dashboard · transactions · expenses · income · goals ·
      │           debts · assets · networth · envelopes · calendar ·
      │           overtime · tax · analytics · export · settings · index
      ▼
  js/page-init.js ──── boots every page: layout, theme, nav, page module
  js/shared-layout.js  the chrome each page shares
      │
      ├──▶ js/pages/*.js    15 modules — one per page, DOM wiring only
      │
      ├──▶ js/store.js      the ONLY module that touches persistence
      │    js/calc.js       all money maths, pure functions
      │    js/csv-import.js js/fx-rate.js js/defaults.js
      │
      └──▶ js/vendor/chart.min.js    Chart.js 4.4.1, vendored not CDN
```

Multi-page rather than single-page, deliberately. Each view is a real HTML file
with its own URL, so the browser handles routing, history and bookmarks, and a
bug in one page cannot take down the others.

### Data

```
  everything lives in localStorage — one browser, one device, never sent
      │
      ├── no account, no login, no server, no sync
      ├── js/store.js is the single read/write boundary
      └── js/calc.js derives every figure; nothing derived is stored
```

Your financial data never leaves the browser. There is no backend, no account
and no sync, so there is no account to breach, no server to leak, and no third
party holding your finances.

Two outbound calls do exist, and neither carries your data: the live GBP/INR
exchange rate is fetched from `api.frankfurter.app`, falling back to
`open.er-api.com`, and cached for four hours in localStorage. If both are
unreachable the app falls back to the fixed rate in Settings and keeps working
offline. Google Fonts is the only other external request.

The cost of the no-backend design is equally real —
clearing site data loses everything, and nothing syncs between devices. Use
the export page.

### Offline

`sw.js` registers a service worker that caches the shell and assets, so the
dashboard opens and works with no connection. `js/sw-client.js` handles
registration and update prompts.

### Why it is shaped this way

**Derived values are never persisted.** `store.js` holds only what you entered;
`calc.js` recomputes every total, balance and projection on read. A stored
total can drift out of step with the rows it came from — a recomputed one
cannot.

**Chart.js is vendored, not loaded from a CDN.** A finance dashboard should not
break, or become injectable, because someone else's CDN had a bad day. The
vendored file is byte-identical to the official 4.4.1 UMD build.

**No build step.** Open `index.html` and it runs. What is committed is what
executes, so there is no bundled output to review separately from the source.


## What it does

- **Dashboard** — at-a-glance summary of income, expenses, net worth, and savings rate
- **Income** — base salary, overtime, pension contributions, and tax code
- **Expenses** — monthly expense breakdown by category with scheduled change support
- **Debts** — education loan tracker (outstanding balance, EMI, payoff projection)
- **Investments** — cash accounts, pension, and ULIP policies with projected values
- **Goals** — wealth target, emergency fund, and trip savings tracker
- **Net Worth** — net worth over time with age-trajectory projection charts
- **Analytics** — budget-by-category and compound growth charts
- **Tax Tracker** — tracks underpayment deductions, tax code, and verified months
- **Transactions** — a full transaction ledger with filtering and categorisation
- **Bill Calendar** — recurring bills and due dates on a month view
- **OT Tracker** — overtime hours and the pay they translate to
- **Envelopes** — envelope budgeting, allocating income to spending pots
- **CSV Import** — import bank statements (Monzo and Revolut formats supported, plus a generic template) with auto-categorisation
- **Export** — download all your data as JSON for backup
- **Settings** — enter your personal numbers; configure INR/GBP rate, theme, and projection parameters

---

## Getting started

1. Open `index.html` in any modern browser — no server required
2. You land on the dashboard
3. **Amber-highlighted sections** indicate where your data is missing (see Setup Highlighting below)
4. A banner at the top lists which sections need data and links directly to Settings
5. Go to **Settings** and enter your numbers — salary, expenses, loan details, investment values, etc.
6. All other pages update immediately once data is saved

---

## Setup highlighting

When data is missing, the dashboard shows visual cues:

- **Amber left border** on any card or section that has no data yet
- **"● enter data" pulse label** appears next to section headings
- **Setup banner** at the top of every page counts how many sections still need input and links to Settings

Sections checked: income, expenses, debts, investments, goals, tax, and profile.

Once you have filled in a section via Settings, the amber border disappears automatically on the next page load.

---

## Pages

| Page | File | Purpose |
|------|------|---------|
| Dashboard | `index.html` / `dashboard.html` | Summary view — income, expenses, net worth, savings rate |
| Income | `income.html` | Salary, overtime, pension, tax code |
| Expenses | `expenses.html` | Monthly line items by category |
| Debts | `debts.html` | Education loan tracker and payoff timeline |
| Assets / Investments | `assets.html` | Cash accounts, pension, ULIP policies |
| Goals | `goals.html` | Wealth target, emergency fund, trip budget |
| Net Worth | `networth.html` | Net worth chart and age-trajectory projection |
| Analytics | `analytics.html` | Budget-by-category and compound growth charts |
| Tax | `tax.html` | Tax code, underpayment tracker, verified months |
| Transactions | `transactions.html` | Transaction ledger with filtering and categorisation |
| Bill Calendar | `calendar.html` | Recurring bills and due dates on a month view |
| OT Tracker | `overtime.html` | Overtime hours and resulting pay |
| Envelopes | `envelopes.html` | Envelope budgeting — allocate income into spending pots |
| Export | `export.html` | Download all data as JSON |
| Settings | `settings.html` | Enter all personal financial data |

---

## Data storage

All data is stored in your **browser's localStorage** — nothing is sent to any server.

Keys are prefixed `fin_` (e.g. `fin_income`, `fin_expenses`). Data persists across browser sessions on the same device and browser profile. Clearing browser data will erase it — use Export to keep a backup.

There is no account, no login, and no remote storage.

---

## Technical stack

- **Vanilla HTML / CSS / JavaScript** — no frameworks, no dependencies
- **ES modules** — pages import shared utilities (`store.js`, `page-init.js`, `shared-layout.js`)
- **Progressive Web App** — `sw.js` registers a service worker for offline use
- **localStorage** — plain JSON, no encryption
- **INR/GBP dual-currency** — the live rate is fetched and cached for four hours, with a configurable fallback (default 83) used offline

---

## Development

No build step. Open any `.html` file directly in a browser, or serve locally:

```bash
# Python (any modern machine)
python3 -m http.server 8080

# Then open http://localhost:8080
```

Serving locally (rather than opening files directly) is recommended for ES module imports to work correctly in all browsers.

### File layout

```
financial-dashboard/
  index.html          # Redirects to dashboard.html
  dashboard.html      # Main overview page
  *.html              # One file per page
  js/
    page-init.js      # Shared init: SW registration, data load, setup highlighting
    store.js          # localStorage read/write (plain JSON)
    defaults.js       # Zero-value defaults shown before the user enters data
    shared-layout.js  # Sidebar and nav rendered on every page
    sw-client.js      # Service worker registration
  css/
    components.css    # Cards, panels, setup highlighting styles
    *.css             # Additional stylesheets
  sw.js               # Service worker (offline caching)
  favicon.svg
```

---

## Defaults

`defaults.js` contains zero-value placeholders for every data field. These are visible in source code — they contain no personal information. All real values are entered through Settings and stored only in your browser.
