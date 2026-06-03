import { initPage, saveSec } from '../page-init.js';
import {
  indiaTripProgress, emergencyFundProgress, wealthProgress,
  calculateNetWorth,
  fmtGBP, fmtPct, round2
} from '../calc.js';

const state = await initPage('goals');
render(state);

// ── Main render ───────────────────────────────────────────────

function render(st) {
  renderSummaryCards(st);
  renderEditPanel(st);
}

// ── Summary cards ─────────────────────────────────────────────

function renderSummaryCards(st) {
  const goals = st.goals || {};
  const trip  = goals.indiaTrip || {};
  const inv   = st.investments  || { cashAccounts: [], pensions: [], ulips: [] };
  const dbt   = st.debts        || { sbi: {} };
  const rate  = st.settings?.inrGbpRate || 83;

  const efProg   = emergencyFundProgress(inv, goals);
  const tripProg = indiaTripProgress(goals);
  const nw       = calculateNetWorth(inv, dbt, rate);
  const wTarget  = goals.wealthTargetGBP || 0;

  // Emergency fund card
  const efColor = efProg.pct >= 100 ? 'positive' : efProg.pct >= 50 ? 'warning' : 'negative';

  // India trip countdown
  const deadline    = trip.deadline ? new Date(trip.deadline) : null;
  const daysLeft    = deadline ? Math.max(0, Math.round((deadline - new Date()) / 86400000)) : null;
  const deadlineStr = deadline ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // Wealth card
  const wPct    = wTarget > 0 ? Math.min(100, round2((nw.netWorth / wTarget) * 100)) : 0;
  const wColor  = wPct >= 100 ? 'positive' : wPct >= 40 ? 'info' : 'warning';

  document.getElementById('goals-summary-cards').innerHTML = `
    <!-- Emergency fund -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Emergency Fund</span></div>
      <div class="stat-row">
        <span class="stat-label">Saved</span>
        <span class="stat-value mono text-${efColor}">${fmtGBP(efProg.savings)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Target</span>
        <span class="stat-value mono">${fmtGBP(efProg.target)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining</span>
        <span class="stat-value mono ${efProg.remaining > 0 ? 'text-warning' : 'text-positive'}">${fmtGBP(efProg.remaining)}</span>
      </div>
      <div style="margin-top:14px;background:var(--border-weak);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${efProg.pct}%;height:100%;background:var(--color-${efColor});border-radius:4px;transition:width 0.6s ease"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${fmtPct(efProg.pct)} of target</div>
    </div>

    <!-- India trip -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">India Trip</span></div>
      <div class="stat-row">
        <span class="stat-label">Saved</span>
        <span class="stat-value mono text-info">${fmtGBP(trip.savedGBP || 0)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Target</span>
        <span class="stat-value mono">${fmtGBP(trip.targetGBP || 3000)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Remaining</span>
        <span class="stat-value mono ${tripProg.remaining > 0 ? 'text-warning' : 'text-positive'}">${fmtGBP(tripProg.remaining)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Deadline</span>
        <span class="stat-value mono">${deadlineStr}</span>
      </div>
      ${daysLeft !== null ? `<div class="stat-row">
        <span class="stat-label">Days left</span>
        <span class="stat-value mono ${daysLeft < 90 ? 'text-warning' : ''}">${daysLeft} days</span>
      </div>` : ''}
      <div style="margin-top:14px;background:var(--border-weak);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${tripProg.pct}%;height:100%;background:var(--color-info);border-radius:4px;transition:width 0.6s ease"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${fmtPct(tripProg.pct)} of ${fmtGBP(trip.targetGBP || 3000)}</div>
    </div>`;

  document.getElementById('goals-wealth-card').innerHTML = `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Wealth Target</span></div>
      <div style="display:flex;gap:32px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Current net worth</div>
          <div class="stat-value mono text-${nw.netWorth >= 0 ? 'positive' : 'negative'}" style="font-size:1.8rem">${fmtGBP(nw.netWorth)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Wealth target</div>
          <div class="stat-value mono" style="font-size:1.8rem">${fmtGBP(wTarget)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Progress</div>
          <div class="stat-value mono text-${wColor}" style="font-size:1.8rem">${fmtPct(wPct)}</div>
        </div>
      </div>
      <div style="margin-top:16px;background:var(--border-weak);border-radius:4px;height:8px;overflow:hidden">
        <div style="width:${wPct}%;height:100%;background:var(--color-${wColor});border-radius:4px;transition:width 0.6s ease"></div>
      </div>
    </div>`;
}

// ── Edit panel ────────────────────────────────────────────────

let _editing = false;

function renderEditPanel(st) {
  const body = document.getElementById('goals-edit-body');
  const btn  = document.getElementById('goals-edit-btn');

  if (!_editing) {
    body.innerHTML = '';
    btn.textContent = '✎ Edit Goals';
    btn.onclick = () => { _editing = true; renderEditPanel(st); };
    return;
  }

  const goals = st.goals || {};
  const trip  = goals.indiaTrip  || {};
  const bd    = trip.breakdown   || [];

  btn.textContent = '';
  btn.onclick = null;

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">
      <div class="form-group">
        <label class="form-label">Emergency fund target (£)</label>
        <input type="number" class="form-input" id="ef-edit-target" value="${goals.emergencyFundTargetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Wealth target (£)</label>
        <input type="number" class="form-input" id="ef-edit-wealth" value="${goals.wealthTargetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Target retirement age</label>
        <input type="number" class="form-input" id="ef-edit-retage" value="${goals.targetAge || ''}" step="1" />
      </div>
    </div>

    <div style="margin-top:20px;margin-bottom:12px;font-size:12.5px;color:var(--text-secondary);font-weight:500">India Trip</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-group">
        <label class="form-label">Target (£)</label>
        <input type="number" class="form-input" id="trip-edit-target" value="${trip.targetGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Saved (£)</label>
        <input type="number" class="form-input" id="trip-edit-saved" value="${trip.savedGBP || ''}" step="any" />
      </div>
      <div class="form-group">
        <label class="form-label">Deadline</label>
        <input type="date" class="form-input" id="trip-edit-deadline" value="${trip.deadline || ''}" />
      </div>
      <div class="form-group" style="justify-content:flex-end;padding-bottom:2px">
        <label class="form-label">Flights paid?</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="trip-edit-flights" ${trip.flightsPaid ? 'checked' : ''} style="width:auto">
          <span class="label-muted">Yes, flights are paid</span>
        </label>
      </div>
    </div>

    <div style="margin-top:20px;margin-bottom:10px;font-size:12.5px;color:var(--text-secondary);font-weight:500">Budget Breakdown</div>
    <table class="data-table" style="margin-bottom:10px">
      <thead>
        <tr>
          <th>Item</th>
          <th>Currency</th>
          <th>Amount</th>
          <th>Paid?</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="bd-rows">
        ${bd.map((b, i) => breakdownRow(b, i)).join('')}
      </tbody>
    </table>
    <button class="btn btn-secondary btn-sm" id="bd-add-btn">+ Add item</button>

    <div style="margin-top:24px;display:flex;justify-content:flex-end;gap:10px">
      <button class="btn btn-secondary" id="goals-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="goals-save-btn">Save</button>
    </div>`;

  // Bind breakdown row delete buttons
  bindBreakdownDelete(st);

  // Add item button
  document.getElementById('bd-add-btn').onclick = () => {
    if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
    if (!st.goals.indiaTrip.breakdown) st.goals.indiaTrip.breakdown = [];
    st.goals.indiaTrip.breakdown.push({ item: '', currency: 'GBP', amountGBP: 0, paid: false });
    renderEditPanel(st);
  };

  // Cancel
  document.getElementById('goals-cancel-btn').onclick = () => {
    _editing = false;
    renderEditPanel(st);
  };

  // Save
  document.getElementById('goals-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('goals-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    // Read top-level fields
    if (!st.goals) st.goals = {};
    if (!st.goals.indiaTrip) st.goals.indiaTrip = {};

    st.goals.emergencyFundTargetGBP = parseFloat(document.getElementById('ef-edit-target').value) || 0;
    st.goals.wealthTargetGBP        = parseFloat(document.getElementById('ef-edit-wealth').value)  || 0;
    st.goals.targetAge              = parseInt(document.getElementById('ef-edit-retage').value, 10) || 0;

    st.goals.indiaTrip.targetGBP   = parseFloat(document.getElementById('trip-edit-target').value)   || 0;
    st.goals.indiaTrip.savedGBP    = parseFloat(document.getElementById('trip-edit-saved').value)    || 0;
    st.goals.indiaTrip.deadline    = document.getElementById('trip-edit-deadline').value;
    st.goals.indiaTrip.flightsPaid = document.getElementById('trip-edit-flights').checked;

    // Read breakdown rows
    const rows = document.querySelectorAll('.bd-row');
    st.goals.indiaTrip.breakdown = Array.from(rows).map(row => ({
      item:      row.querySelector('.bd-item').value,
      currency:  row.querySelector('.bd-currency').value,
      amountGBP: parseFloat(row.querySelector('.bd-amount').value) || 0,
      paid:      row.querySelector('.bd-paid').checked,
    }));

    try {
      await saveSec('fin_goals', st.goals);
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        _editing = false;
        render(st);
      }, 1200);
    } catch (err) {
      console.error('Goals save failed:', err);
      saveBtn.textContent = '✕ Error';
      saveBtn.disabled = false;
    }
  };
}

function breakdownRow(b, i) {
  return `<tr class="bd-row" data-idx="${i}">
    <td><input type="text"   class="form-input bd-item"     value="${escHtml(b.item || '')}" placeholder="Item name" style="padding:4px 8px;font-size:12px" /></td>
    <td><input type="text"   class="form-input bd-currency" value="${escHtml(b.currency || 'GBP')}" style="padding:4px 8px;font-size:12px;width:80px" /></td>
    <td><input type="number" class="form-input bd-amount"   value="${b.amountGBP || ''}" step="any" style="padding:4px 8px;font-size:12px" /></td>
    <td style="text-align:center"><input type="checkbox" class="bd-paid" ${b.paid ? 'checked' : ''} style="width:auto" /></td>
    <td><button class="btn-icon danger bd-delete" data-idx="${i}" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
    </button></td>
  </tr>`;
}

function bindBreakdownDelete(st) {
  document.querySelectorAll('.bd-delete').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (!st.goals.indiaTrip) st.goals.indiaTrip = {};
      if (!st.goals.indiaTrip.breakdown) st.goals.indiaTrip.breakdown = [];
      st.goals.indiaTrip.breakdown.splice(idx, 1);
      renderEditPanel(st);
    };
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
