// csv-import.js — Browser-native CSV import, no server required
// Supports: generic template, Revolut, Monzo
//
// Privacy: every byte is parsed in-memory in the browser. No network calls,
// no upload — the file never leaves the device.

// ── Merchant → category keyword map ────────────────────────────
// Order matters: first match wins. `id` is the matching expense item id in
// fin_expenses.items (or null where no recurring expense item applies).
export const MERCHANT_MAP = [
  { keywords: ['tfl', 'transport for london', 'oyster'], category: 'Transport', id: 'tfl' },
  { keywords: ['tesco', 'sainsbury', 'asda', 'morrisons', 'lidl', 'aldi', 'waitrose'], category: 'Food', id: 'grocery' },
  { keywords: ['netflix', 'spotify', 'amazon prime', 'disney'], category: 'Subscription', id: 'apple' },
  { keywords: ['apple', 'itunes', 'app store'], category: 'Subscription', id: 'apple' },
  { keywords: ['tryhackme'], category: 'Subscription', id: 'thm' },
  { keywords: ['claude'], category: 'Subscription', id: 'claude' },
  { keywords: ['ee mobile', 'ee ltd'], category: 'Phone', id: 'ee' },
  { keywords: ['rent', 'landlord'], category: 'Housing', id: 'rent' },
  { keywords: ['salary', 'payroll', 'wages', 'eurostop'], category: 'Income', id: null },
  { keywords: ['revolut'], category: 'Transfer', id: null },
];

// ── Format detection ───────────────────────────────────────────
export function detectFormat(headers) {
  // Revolut: has "Started Date", "Completed Date", "Description", "Amount", "Currency"
  // Monzo: has "Transaction ID", "Date", "Type", "Name", "Category", "Amount"
  // Generic: has "Date", "Description", "Amount (GBP)", "Category"
  if (headers.some(h => h.includes('Started Date'))) return 'revolut';
  if (headers.some(h => h.includes('Transaction ID'))) return 'monzo';
  return 'generic';
}

// ── CSV parsing (RFC-4180-ish: quoted fields, escaped quotes, commas) ──
export function parseCSV(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip fully-empty lines (trailing newline, blank rows)
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (cells[idx] ?? '').trim(); });
    out.push(obj);
  }
  return out;
}

// Tokenise the whole document into a 2D array, honouring quotes/newlines.
function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalise CRLF / CR to LF so newline handling is uniform.
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row if the file did not end on a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Date normalisation → YYYY-MM-DD ────────────────────────────
function normaliseDate(raw) {
  if (!raw) return '';
  const v = raw.trim();
  // Already ISO (YYYY-MM-DD, optionally with time)
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${m}-${d}`;
  }
  // Last resort: let Date try, else return raw
  const parsed = new Date(v);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return v;
}

function toNumber(raw) {
  if (raw == null) return 0;
  // Strip currency symbols, thousands separators and spaces; keep sign + decimal
  const cleaned = String(raw).replace(/[£$€,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ── Row normalisation → { date, description, amountGBP, category, type } ──
// Negative amountGBP = money out (expense), positive = money in (income).
export function normaliseRow(row, format) {
  let date = '';
  let description = '';
  let amountGBP = 0;
  let category = '';
  let type = '';

  if (format === 'revolut') {
    date = normaliseDate(row['Started Date'] || row['Completed Date'] || row['Date']);
    description = row['Description'] || '';
    amountGBP = toNumber(row['Amount']);
    type = row['Type'] || '';
  } else if (format === 'monzo') {
    date = normaliseDate(row['Date']);
    description = row['Name'] || row['Description'] || '';
    // Monzo has a signed "Amount" plus separate Money Out/In columns.
    if (row['Amount'] !== undefined && row['Amount'] !== '') {
      amountGBP = toNumber(row['Amount']);
    } else {
      const out = toNumber(row['Money Out']);
      const inn = toNumber(row['Money In']);
      // Money Out is stored as a positive magnitude in Monzo exports.
      amountGBP = inn - Math.abs(out);
    }
    category = row['Category'] || '';
    type = row['Type'] || '';
  } else {
    // generic template
    date = normaliseDate(row['Date']);
    description = row['Description'] || '';
    amountGBP = toNumber(row['Amount (GBP)'] ?? row['Amount']);
    category = row['Category'] || '';
    type = row['Type'] || '';
  }

  // Derive type if not supplied
  if (!type) type = amountGBP >= 0 ? 'income' : 'expense';

  // Apply merchant categorisation when the source gave us nothing useful.
  if (!category || category === 'Income' || category === 'expense' || category === 'income') {
    const matched = categorizeMerchant(description);
    category = matched.category;
  }

  return {
    date,
    description: description.trim(),
    amountGBP: round2(amountGBP),
    category,
    type,
  };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// ── Merchant categorisation ────────────────────────────────────
export function categorizeMerchant(description) {
  const d = (description || '').toLowerCase();
  for (const entry of MERCHANT_MAP) {
    if (entry.keywords.some(k => d.includes(k))) {
      return { category: entry.category, expenseId: entry.id };
    }
  }
  return { category: 'Other', expenseId: null };
}

// ── Deduplication ──────────────────────────────────────────────
// Fingerprint = date + description + amount. Re-importing the same file is safe.
export function transactionHash(t) {
  const desc = (t.description || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const amt = Number(t.amountGBP).toFixed(2);
  return `${t.date}|${desc}|${amt}`;
}

export function deduplicateTransactions(existing, incoming) {
  const seen = new Set((existing || []).map(transactionHash));
  const unique = [];
  let duplicates = 0;
  for (const t of incoming) {
    const h = transactionHash(t);
    if (seen.has(h)) {
      duplicates++;
      continue;
    }
    seen.add(h); // also dedupe within the incoming batch itself
    unique.push(t);
  }
  return { unique, duplicates };
}

// ── Collect existing transactions out of fin_monthly_log ───────
// monthly_log is an array of monthly aggregates; imported transactions live
// under each month's `transactions` array. This flattens them for dedup.
export function collectExistingTransactions(monthlyLog) {
  const out = [];
  for (const m of monthlyLog || []) {
    if (Array.isArray(m.transactions)) out.push(...m.transactions);
  }
  return out;
}

// ── Merge new transactions into the monthly_log aggregate ──────
// Preserves existing rows (netGBP/savedGBP/note) and adds:
//   - the raw transactions (for future dedup)
//   - income → netGBP, |expenses| → savedGBP roll-ups
// Returns a NEW monthly_log array (does not mutate the input).
export function mergeIntoMonthlyLog(monthlyLog, transactions) {
  const byMonth = new Map();
  for (const m of monthlyLog || []) {
    byMonth.set(m.month, { ...m, transactions: Array.isArray(m.transactions) ? [...m.transactions] : [] });
  }
  for (const t of transactions) {
    const month = (t.date || '').slice(0, 7); // YYYY-MM
    if (!month) continue;
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, netGBP: 0, savedGBP: 0, note: '', transactions: [] });
    }
    const entry = byMonth.get(month);
    entry.transactions.push(t);
    if (t.amountGBP >= 0) {
      entry.netGBP = round2((entry.netGBP || 0) + t.amountGBP);
    } else {
      entry.savedGBP = round2((entry.savedGBP || 0) + Math.abs(t.amountGBP));
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ── High-level orchestration used by the UI ────────────────────
// text         : raw CSV string
// existingLog  : current fin_monthly_log array
// Returns { format, transactions, unique, duplicates, newLog }
export function processImport(text, existingLog) {
  const rows = parseCSV(text);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const format = detectFormat(headers);
  const transactions = rows
    .map(r => normaliseRow(r, format))
    .filter(t => t.date && (t.description || t.amountGBP !== 0));

  const existingTx = collectExistingTransactions(existingLog);
  const { unique, duplicates } = deduplicateTransactions(existingTx, transactions);
  const newLog = mergeIntoMonthlyLog(existingLog, unique);

  return { format, transactions, unique, duplicates, newLog };
}
