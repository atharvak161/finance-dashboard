import { initPage, saveSec } from '../page-init.js';
import { fmtGBP } from '../calc.js';

const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other'];

const state = await initPage('transactions');

// Active tab state
let activeTab = 'log';
// Parsed SMS rows pending import
let smsParsed = [];
// Parsed CSV data pending import
let csvParsed = { format: 'generic', headers: [], dataRows: [] };
// Generic CSV column mapping (indices)
let csvMap = { date: 0, description: 1, amount: 2, currency: -1 };

// ── Category guesser ────────────────────────────────────────────
function guessCategory(desc) {
  const d = desc.toUpperCase();
  if (/swiggy|zomato|food|restaurant|cafe|dhaba|dominos|pizza|kfc|mcdonalds|burger/i.test(d)) return 'Food';
  if (/amazon|flipkart|myntra|nykaa|meesho|shopping|mall|market/i.test(d)) return 'Personal';
  if (/uber|ola|metro|irctc|flight|bus|petrol|fuel|parking/i.test(d)) return 'Transport';
  if (/netflix|spotify|prime|hotstar|zee5|subscription|recharge/i.test(d)) return 'Subscription';
  if (/rent|maintenance|society|electricity|water|gas|broadband|internet/i.test(d)) return 'Housing';
  if (/emi|loan|credit card|payment|hdfc cc|sbi cc|icici cc/i.test(d)) return 'Debt';
  if (/insurance|lic|star health|policy/i.test(d)) return 'Insurance';
  if (/mobile|phone|jio|airtel|vi|bsnl/i.test(d)) return 'Phone';
  if (/hotel|travel|holiday|trip|tour|booking\.com|makemytrip|cleartrip/i.test(d)) return 'Travel';
  return 'Other';
}

// ── SMS parser ───────────────────────────────────────────────────
function parseSMS(text) {
  const results = [];
  const messages = text.split(/\n{2,}|\r\n{2,}/).map(s => s.trim()).filter(Boolean);

  for (const msg of messages) {
    // Amount
    const amtMatch = msg.match(/(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (!amtMatch) continue;
    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (!amount || isNaN(amount)) continue;

    // Debit or credit
    const isDebit = /\b(?:debited?|spent|paid|transfer(?:red)?\s+to|withdrawn|purchase)\b/i.test(msg);
    const isCredit = /\b(?:credited?|received|transfer(?:red)?\s+from|refund)\b/i.test(msg);
    if (!isDebit && !isCredit) continue;

    // Bank detection
    let bank = 'Unknown';
    if (/hdfc/i.test(msg)) bank = 'HDFC';
    else if (/\bsbi\b/i.test(msg)) bank = 'SBI';
    else if (/icici/i.test(msg)) bank = 'ICICI';
    else if (/axis/i.test(msg)) bank = 'Axis';
    else if (/kotak/i.test(msg)) bank = 'Kotak';
    else if (/paytm/i.test(msg)) bank = 'Paytm';
    else if (/phonepe/i.test(msg)) bank = 'PhonePe';
    else if (/gpay|google pay/i.test(msg)) bank = 'GPay';
    else if (/idbi/i.test(msg)) bank = 'IDBI';
    else if (/pnb/i.test(msg)) bank = 'PNB';
    else if (/upi/i.test(msg)) bank = 'UPI';

    // Merchant / description extraction
    let description = '';
    const merchantPatterns = [
      /\bat\s+([A-Za-z0-9&@\s\-\/\.]{2,40}?)(?:\s+(?:on|ref|avl|bal|a\/c|from)|[,\.]|$)/i,
      /\bto\s+([A-Za-z0-9&@\s\-\/\.]{2,40}?)(?:\s+(?:on|ref|avl|a\/c)|[,\.]|$)/i,
      /\bfor\s+([A-Za-z0-9&@\s\-\/\.]{2,40}?)(?:\s+(?:on|ref|avl|a\/c)|[,\.]|$)/i,
      /\btowards\s+([A-Za-z0-9&@\s\-\/\.]{2,40}?)(?:\s+(?:on|ref|avl|a\/c)|[,\.]|$)/i,
      /UPI\/P2[AM]\/\d+\/([A-Za-z0-9&@\s\-\.]{2,30})/i,
      /VPA:([A-Za-z0-9@\.\-]+)/i,
    ];
    for (const re of merchantPatterns) {
      const m = msg.match(re);
      if (m && m[1]) { description = m[1].trim().replace(/\s+/g, ' '); break; }
    }
    if (!description) description = bank + ' Transaction';

    // Date extraction
    let date = new Date().toISOString().slice(0, 10);
    const dateMatch = msg.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      let [, d, m2, y] = dateMatch;
      if (y.length === 2) y = '20' + y;
      date = `${y}-${m2.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    const cat = guessCategory(description);
    results.push({ date, bank, description, amount, isDebit, category: cat });
  }
  return results;
}

// ── CSV helpers ──────────────────────────────────────────────────
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false, i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'; i += 2; // escaped quote ""
      } else {
        inQuote = !inQuote; i++;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = ''; i++;
    } else {
      cur += ch; i++;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { format: 'unknown', headers: [], dataRows: [] };

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  let format = 'generic';
  if (headers.includes('transaction id') && headers.includes('emoji')) format = 'monzo';
  else if (headers.includes('started date') || (headers.includes('description') && headers.includes('amount') && headers.includes('currency') && headers.length < 12)) format = 'revolut';

  const dataRows = lines.slice(1)
    .filter(l => l.trim())
    .map(l => splitCSVLine(l).map(c => c.replace(/^["']|["']$/g, '').trim()));

  return { format, headers, dataRows };
}

function normaliseDate(str) {
  if (!str) return new Date().toISOString().slice(0,10);
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  // UK format DD/MM/YYYY
  const uk = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2,'0')}-${uk[1].padStart(2,'0')}`;
  return new Date().toISOString().slice(0,10);
}

function mapRevolutRow(headers, row) {
  const get = (name) => row[headers.indexOf(name)] || '';
  const dateStr = get('started date') || get('completed date') || get('date');
  const desc = get('description');
  const amt = parseFloat(get('amount')) || 0;
  const currency = get('currency') || 'GBP';
  return { date: normaliseDate(dateStr), description: desc, amount: Math.abs(amt), isDebit: amt < 0, currency, category: guessCategory(desc) };
}

function mapMonzoRow(headers, row) {
  const get = (name) => row[headers.indexOf(name)] || '';
  const dateStr = get('date') + ' ' + (get('time') || '');
  const desc = get('name') || get('description') || '';
  const amt = parseFloat(get('amount')) || 0;
  const currency = get('currency') || 'GBP';
  return { date: normaliseDate(dateStr), description: desc, amount: Math.abs(amt), isDebit: amt < 0, currency, category: get('category') || guessCategory(desc) };
}

function mapGenericRow(headers, row, map) {
  const get = (idx) => (idx >= 0 && idx < row.length) ? row[idx] : '';
  const dateStr = get(map.date);
  const desc = get(map.description);
  const rawAmt = get(map.amount).replace(/[£$€,\s]/g, '');
  const amt = parseFloat(rawAmt) || 0;
  const currency = map.currency >= 0 ? (get(map.currency) || 'GBP') : 'GBP';
  return { date: normaliseDate(dateStr), description: desc, amount: Math.abs(amt), isDebit: amt < 0, currency, category: guessCategory(desc) };
}

// ── Save helper ──────────────────────────────────────────────────
function makeTransaction(row, source, bankOverride) {
  const rate = state.settings?.inrGbpRate || 83;
  const currency = row.currency || 'INR';
  const amountGBP = currency === 'GBP' ? row.amount : row.amount / rate;
  return {
    id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    date: row.date,
    description: row.description,
    amount: row.amount,
    currency,
    amountGBP: Math.round(amountGBP * 100) / 100,
    isDebit: row.isDebit,
    category: row.category,
    source,
    bank: bankOverride || row.bank || 'Unknown',
  };
}

async function importTransactions(newItems) {
  if (!state.transactions) state.transactions = { items: [] };
  // Prepend (newest first)
  state.transactions.items = [...newItems, ...state.transactions.items];
  await saveSec('fin_transactions', state.transactions);
}

// ── Category select HTML ─────────────────────────────────────────
function catSelect(selected, name) {
  return `<select class="form-input" name="${name}" style="padding:2px 6px;font-size:12px">
    ${CATS.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('')}
  </select>`;
}

// ── Month options for filter ─────────────────────────────────────
function monthOptions(selectedVal) {
  const now = new Date();
  const opts = ['<option value="">All months</option>'];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    opts.push(`<option value="${val}"${val === selectedVal ? ' selected' : ''}>${label}</option>`);
  }
  return opts.join('');
}

// ── Current month default ────────────────────────────────────────
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

// ── Tab: Transaction Log ─────────────────────────────────────────
function renderLog(container) {
  const items = state.transactions?.items || [];

  // Read current filter state from existing DOM if present, else defaults
  const existingSearch = container.querySelector('#txn-search')?.value || '';
  const existingCat    = container.querySelector('#txn-cat')?.value || '';
  const existingMonth  = container.querySelector('#txn-month')?.value ?? currentMonth();
  const existingSource = container.querySelector('#txn-source')?.value || '';

  // Summary
  const totalDebits  = items.filter(t => t.isDebit).reduce((s,t) => s + (t.amountGBP||0), 0);
  const totalCredits = items.filter(t => !t.isDebit).reduce((s,t) => s + (t.amountGBP||0), 0);

  // Filter
  const filtered = items.filter(t => {
    if (existingSearch && !t.description.toLowerCase().includes(existingSearch.toLowerCase())) return false;
    if (existingCat && t.category !== existingCat) return false;
    if (existingMonth && !t.date.startsWith(existingMonth)) return false;
    if (existingSource && t.source !== existingSource) return false;
    return true;
  });

  container.innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><div class="panel-title">Summary</div></div>
      <div style="padding:12px 16px">
        <div class="grid-3">
          <div class="metric-card">
            <div class="label-muted">Total transactions</div>
            <div class="stat-value">${items.length}</div>
          </div>
          <div class="metric-card">
            <div class="label-muted">Total debits</div>
            <div class="stat-value roai-negative">${fmtGBP(totalDebits)}</div>
          </div>
          <div class="metric-card">
            <div class="label-muted">Total credits</div>
            <div class="stat-value roai-positive">${fmtGBP(totalCredits)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Transaction Log</div>
        <button id="txn-clear-all" class="btn btn-secondary btn-sm" ${items.length === 0 ? 'disabled' : ''}>Clear all</button>
      </div>
      <div style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <input id="txn-search" class="form-input" type="text" placeholder="Search description…" value="${existingSearch}" style="flex:1;min-width:160px">
        <select id="txn-cat" class="form-input" style="min-width:130px">
          <option value="">All categories</option>
          ${CATS.map(c => `<option value="${c}"${c === existingCat ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        <select id="txn-month" class="form-input" style="min-width:150px">
          ${monthOptions(existingMonth)}
        </select>
        <select id="txn-source" class="form-input" style="min-width:110px">
          <option value="">All sources</option>
          <option value="sms"${existingSource==='sms' ? ' selected':''}>SMS</option>
          <option value="csv"${existingSource==='csv' ? ' selected':''}>CSV</option>
          <option value="manual"${existingSource==='manual' ? ' selected':''}>Manual</option>
        </select>
      </div>
      <div style="overflow-x:auto">
        ${filtered.length === 0 ? `
          <div class="alert-info" style="margin:20px 16px">
            ${items.length === 0
              ? 'No transactions yet. Use SMS Parser or CSV Import to get started.'
              : 'No transactions match the current filters.'}
          </div>
        ` : `
          <table class="data-table">
            <thead><tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th class="td-right">Amount (GBP)</th>
              <th>Source</th>
              <th>Bank</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${filtered.map(t => `
                <tr>
                  <td class="mono" style="white-space:nowrap">${t.date}</td>
                  <td>${t.description}</td>
                  <td><span class="badge">${t.category}</span></td>
                  <td class="td-right mono ${t.isDebit ? 'roai-negative' : 'roai-positive'}">
                    ${t.isDebit ? '-' : '+'}${fmtGBP(t.amountGBP||0)}
                  </td>
                  <td><span class="badge badge-warning">${t.source}</span></td>
                  <td>${t.bank || '—'}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm txn-delete" data-id="${t.id}" style="color:var(--red,#e74c3c)">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;

  // Filter listeners — re-render log in place
  const rerender = () => renderLog(container);
  container.querySelector('#txn-search').addEventListener('input', rerender);
  container.querySelector('#txn-cat').addEventListener('change', rerender);
  container.querySelector('#txn-month').addEventListener('change', rerender);
  container.querySelector('#txn-source').addEventListener('change', rerender);

  // Delete listeners
  container.querySelectorAll('.txn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      state.transactions.items = state.transactions.items.filter(t => t.id !== id);
      await saveSec('fin_transactions', state.transactions);
      renderLog(container);
    });
  });

  // Clear all
  container.querySelector('#txn-clear-all')?.addEventListener('click', async () => {
    if (!confirm('Delete all transactions? This cannot be undone.')) return;
    state.transactions.items = [];
    await saveSec('fin_transactions', state.transactions);
    renderLog(container);
  });
}

// ── Tab: SMS Parser ──────────────────────────────────────────────
function renderSMS(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><div class="panel-title">SMS Parser</div></div>
      <div style="padding:16px">
        <div class="form-group">
          <label class="form-label">Paste one or more bank SMS messages</label>
          <textarea id="sms-input" class="form-input" rows="10" style="width:100%;resize:vertical;font-family:monospace;font-size:13px" placeholder="Paste SMS messages here. Separate multiple messages with a blank line."></textarea>
        </div>
        <button id="sms-parse-btn" class="btn btn-primary">Parse</button>
      </div>
      <div id="sms-preview"></div>
    </div>
  `;

  container.querySelector('#sms-parse-btn').addEventListener('click', () => {
    const text = container.querySelector('#sms-input').value.trim();
    if (!text) return;
    smsParsed = parseSMS(text);
    renderSMSPreview(container.querySelector('#sms-preview'));
  });
}

function renderSMSPreview(previewEl) {
  if (!smsParsed.length) {
    previewEl.innerHTML = `<div class="alert-info" style="margin:0 16px 16px">No recognisable bank SMS found. Check the format and try again.</div>`;
    return;
  }

  previewEl.innerHTML = `
    <div style="padding:0 16px 16px">
      <div style="margin-bottom:8px;font-size:13px;color:var(--text-muted,#888)">${smsParsed.length} message(s) parsed</div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th><input type="checkbox" id="sms-check-all" checked></th>
            <th>Date</th>
            <th>Bank</th>
            <th>Description</th>
            <th class="td-right">Amount (INR)</th>
            <th>Type</th>
            <th>Category</th>
          </tr></thead>
          <tbody>
            ${smsParsed.map((r, i) => `
              <tr>
                <td><input type="checkbox" class="sms-row-check" data-idx="${i}" checked></td>
                <td class="mono" style="white-space:nowrap">${r.date}</td>
                <td>${r.bank}</td>
                <td>${r.description}</td>
                <td class="td-right mono ${r.isDebit ? 'roai-negative':'roai-positive'}">
                  ${r.isDebit ? '-' : '+'}₹${r.amount.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}
                </td>
                <td><span class="badge ${r.isDebit ? 'badge-warning':'badge-positive'}">${r.isDebit ? 'Debit':'Credit'}</span></td>
                <td>${catSelect(r.category, 'sms-cat-' + i)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <button id="sms-import-btn" class="btn btn-primary">Import selected</button>
        <span id="sms-import-status" style="font-size:13px;color:var(--text-muted,#888)"></span>
      </div>
    </div>
  `;

  // Select-all checkbox
  previewEl.querySelector('#sms-check-all').addEventListener('change', (e) => {
    previewEl.querySelectorAll('.sms-row-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // Import button
  previewEl.querySelector('#sms-import-btn').addEventListener('click', async () => {
    const checks = previewEl.querySelectorAll('.sms-row-check');
    const toImport = [];
    checks.forEach((cb, i) => {
      if (!cb.checked) return;
      const catSel = previewEl.querySelector(`select[name="sms-cat-${i}"]`);
      const row = { ...smsParsed[i], category: catSel?.value || smsParsed[i].category, currency: 'INR' };
      toImport.push(makeTransaction(row, 'sms', row.bank));
    });
    if (!toImport.length) {
      previewEl.querySelector('#sms-import-status').textContent = 'No rows selected.';
      return;
    }
    await importTransactions(toImport);
    smsParsed = [];
    previewEl.querySelector('#sms-import-status').textContent = `${toImport.length} transaction(s) imported.`;
    // Switch to log tab
    switchTab('log');
  });
}

// ── Tab: CSV Import ──────────────────────────────────────────────
function renderCSV(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><div class="panel-title">CSV Import</div></div>
      <div style="padding:16px">
        <div class="form-group">
          <label class="form-label">Select bank CSV file</label>
          <input id="csv-file" type="file" accept=".csv" class="form-input" style="padding:6px">
        </div>
        <div id="csv-format-badge" style="margin-top:8px;display:none">
          Detected format: <span id="csv-format-name" class="badge badge-positive"></span>
        </div>
        <div id="csv-map-section" style="display:none;margin-top:16px">
          <div class="section-title" style="font-size:14px;margin-bottom:8px">Column mapping</div>
          <div class="grid-3">
            <div class="form-group">
              <label class="form-label">Date column</label>
              <select id="csv-map-date" class="form-input"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Description column</label>
              <select id="csv-map-desc" class="form-input"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount column</label>
              <select id="csv-map-amt" class="form-input"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Currency column (optional)</label>
              <select id="csv-map-currency" class="form-input"></select>
            </div>
          </div>
          <button id="csv-remap-btn" class="btn btn-secondary btn-sm mt-12">Apply mapping</button>
        </div>
      </div>
      <div id="csv-preview"></div>
    </div>
  `;

  container.querySelector('#csv-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    csvParsed = parseCSV(text);
    if (csvParsed.format === 'unknown') {
      container.querySelector('#csv-preview').innerHTML = `<div class="alert-info" style="margin:0 16px 16px">Could not parse CSV — must have at least a header row and one data row.</div>`;
      return;
    }

    // Show format badge
    const badgeEl = container.querySelector('#csv-format-badge');
    badgeEl.style.display = 'block';
    container.querySelector('#csv-format-name').textContent =
      csvParsed.format === 'revolut' ? 'Revolut' :
      csvParsed.format === 'monzo'   ? 'Monzo'   : 'Generic';

    // Show column mapping only for generic
    if (csvParsed.format === 'generic') {
      const mapSection = container.querySelector('#csv-map-section');
      mapSection.style.display = 'block';
      const headerOpts = csvParsed.headers.map((h,i) => `<option value="${i}">${h}</option>`).join('');
      const headerOptsWithNone = `<option value="-1">— none —</option>` + headerOpts;
      container.querySelector('#csv-map-date').innerHTML = headerOpts;
      container.querySelector('#csv-map-desc').innerHTML = headerOpts;
      container.querySelector('#csv-map-amt').innerHTML = headerOpts;
      container.querySelector('#csv-map-currency').innerHTML = headerOptsWithNone;

      // Auto-select sensible defaults by header name
      const h = csvParsed.headers;
      const bestIdx = (terms) => {
        const idx = h.findIndex(x => terms.some(t => x.includes(t)));
        return idx >= 0 ? idx : 0;
      };
      container.querySelector('#csv-map-date').value     = bestIdx(['date','time']);
      container.querySelector('#csv-map-desc').value     = bestIdx(['desc','narr','merchant','name','ref']);
      container.querySelector('#csv-map-amt').value      = bestIdx(['amount','amt','debit','credit','value']);
      const currIdx = h.findIndex(x => x.includes('curr'));
      container.querySelector('#csv-map-currency').value = currIdx >= 0 ? currIdx : -1;

      container.querySelector('#csv-remap-btn').addEventListener('click', () => {
        csvMap = {
          date:        parseInt(container.querySelector('#csv-map-date').value, 10),
          description: parseInt(container.querySelector('#csv-map-desc').value, 10),
          amount:      parseInt(container.querySelector('#csv-map-amt').value, 10),
          currency:    parseInt(container.querySelector('#csv-map-currency').value, 10),
        };
        renderCSVPreview(container.querySelector('#csv-preview'));
      });
    }

    renderCSVPreview(container.querySelector('#csv-preview'));
  });
}

function csvRowsToMapped() {
  return csvParsed.dataRows.map(row => {
    if (csvParsed.format === 'revolut') return mapRevolutRow(csvParsed.headers, row);
    if (csvParsed.format === 'monzo')   return mapMonzoRow(csvParsed.headers, row);
    return mapGenericRow(csvParsed.headers, row, csvMap);
  }).filter(r => r.description || r.amount);
}

function renderCSVPreview(previewEl) {
  const mapped = csvRowsToMapped();
  const preview = mapped.slice(0, 10);

  if (!mapped.length) {
    previewEl.innerHTML = `<div class="alert-info" style="margin:0 16px 16px">No data rows found in CSV.</div>`;
    return;
  }

  const bankName = csvParsed.format === 'revolut' ? 'Revolut' : csvParsed.format === 'monzo' ? 'Monzo' : 'Unknown';

  previewEl.innerHTML = `
    <div style="padding:0 16px 16px">
      <div style="margin-bottom:8px;font-size:13px;color:var(--text-muted,#888)">
        Showing first ${preview.length} of ${mapped.length} rows
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th><input type="checkbox" id="csv-check-all" checked></th>
            <th>Date</th>
            <th>Description</th>
            <th class="td-right">Amount</th>
            <th>Category</th>
          </tr></thead>
          <tbody>
            ${preview.map((r, i) => `
              <tr>
                <td><input type="checkbox" class="csv-row-check" data-idx="${i}" checked></td>
                <td class="mono" style="white-space:nowrap">${r.date}</td>
                <td>${r.description}</td>
                <td class="td-right mono ${r.isDebit ? 'roai-negative':'roai-positive'}">
                  ${r.isDebit ? '-' : '+'}${r.currency === 'GBP' ? fmtGBP(r.amount) : '₹' + r.amount.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}
                </td>
                <td>${catSelect(r.category, 'csv-cat-' + i)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <button id="csv-import-btn" class="btn btn-primary">Import selected (${mapped.length} total)</button>
        <span id="csv-import-status" style="font-size:13px;color:var(--text-muted,#888)"></span>
      </div>
    </div>
  `;

  // Select-all
  previewEl.querySelector('#csv-check-all').addEventListener('change', (e) => {
    previewEl.querySelectorAll('.csv-row-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // Import — only imports the previewed rows that have their checkbox checked.
  previewEl.querySelector('#csv-import-btn').addEventListener('click', async () => {
    const previewRows = mapped.slice(0, 10);
    const toImport = [];
    previewRows.forEach((row, idx) => {
      const cb = document.querySelector(`[data-csv-row="${idx}"]`) ||
                 previewEl.querySelector(`.csv-row-check[data-idx="${idx}"]`);
      if (!cb || !cb.checked) return;
      const catSel = previewEl.querySelector(`select[name="csv-cat-${idx}"]`);
      const category = catSel ? catSel.value : row.category;
      toImport.push(makeTransaction({ ...row, category }, 'csv', bankName));
    });

    if (!toImport.length) {
      previewEl.querySelector('#csv-import-status').textContent = 'No rows selected.';
      return;
    }

    await importTransactions(toImport);
    previewEl.querySelector('#csv-import-status').textContent = `${toImport.length} transaction(s) imported.`;
    // Switch to log tab
    switchTab('log');
  });
}

// ── Tab switching ────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#txn-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderActiveTab();
}

function renderActiveTab() {
  const container = document.getElementById('txn-content');
  if (!container) return;
  if (activeTab === 'log')  { renderLog(container); return; }
  if (activeTab === 'sms')  { renderSMS(container); return; }
  if (activeTab === 'csv')  { renderCSV(container); return; }
}

// ── Boot ─────────────────────────────────────────────────────────
document.getElementById('txn-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

renderActiveTab();
