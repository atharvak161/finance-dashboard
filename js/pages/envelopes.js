import { initPage, saveSec } from '../page-init.js';
import { calculateNetPay, fmtGBP, round2 } from '../calc.js';

const CATS = ['Housing','Debt','Insurance','Phone','Transport','Subscription','Food','Personal','Travel','Other','Savings','Emergency','Investment'];
const CAT_COLOURS = {
  Housing:'#00bfff', Debt:'#ff1744', Insurance:'#ff9100', Phone:'#d500f9',
  Transport:'#ffd600', Subscription:'#00e5ff', Food:'#00e676', Personal:'#18ffff',
  Travel:'#ff9100', Other:'#3d5473', Savings:'#00e676', Emergency:'#ff9100', Investment:'#00bfff',
};

const state = await initPage('envelopes');
let _envSaveTimer;

// Ensure envelopes structure exists
if (!state.envelopes) state.envelopes = { month: '', envelopes: [] };
if (!state.envelopes.envelopes) state.envelopes.envelopes = [];

// If envelopes list is empty, seed from expense categories
if (state.envelopes.envelopes.length === 0 && state.expenses?.items?.length) {
  const catTotals = {};
  (state.expenses.items || []).filter(i => i.active).forEach(i => {
    const cat = i.category || 'Other';
    catTotals[cat] = (catTotals[cat] || 0) + (i.monthlyGBP || 0);
  });
  state.envelopes.envelopes = Object.entries(catTotals).map(([cat, amt]) => ({
    id: 'env_' + cat.toLowerCase(),
    name: cat,
    category: cat,
    targetGBP: round2(amt),
    spentGBP: 0,
  }));
}

// Set current month if not set
const nowKey = new Date().toISOString().slice(0, 7);
if (state.envelopes.month !== nowKey) {
  // New month: reset spent amounts, keep targets
  state.envelopes.month = nowKey;
  state.envelopes.envelopes.forEach(e => { e.spentGBP = 0; });
  await saveSec('fin_envelopes', state.envelopes);
}

document.getElementById('env-add-btn').addEventListener('click', async () => {
  state.envelopes.envelopes.push({
    id: 'env_' + Date.now(),
    name: 'New Envelope',
    category: 'Other',
    targetGBP: 0,
    spentGBP: 0,
  });
  await saveSec('fin_envelopes', state.envelopes);
  render();
});

render();

function render() {
  const envs = state.envelopes.envelopes;
  const pay  = calculateNetPay(state.income || {});
  const totalIncome  = pay.netWithOT || 0;
  const totalTarget  = round2(envs.reduce((s, e) => s + (e.targetGBP || 0), 0));
  const totalSpent   = round2(envs.reduce((s, e) => s + (e.spentGBP || 0), 0));
  const unallocated  = round2(totalIncome - totalTarget);
  const nowKey = state.envelopes.month || new Date().toISOString().slice(0, 7);
  const monthLabel = new Date(nowKey + '-01').toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const envCards = envs.map((env, idx) => {
    const pct = env.targetGBP > 0 ? Math.min((env.spentGBP / env.targetGBP) * 100, 100) : 0;
    const remaining = round2((env.targetGBP || 0) - (env.spentGBP || 0));
    const overBudget = remaining < 0;
    const barColour = pct >= 100 ? '#ff1744' : pct >= 80 ? '#ff9100' : (CAT_COLOURS[env.category] || '#00bfff');
    return `
      <div class="panel" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:14px">${env.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${env.category}</div>
          </div>
          <button class="btn-icon danger" data-env-delete="${idx}" title="Remove">×</button>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span class="label-muted">Spent</span>
          <span class="mono" style="color:${overBudget ? '#ff1744' : 'var(--text-primary)'}">${fmtGBP(env.spentGBP || 0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span class="label-muted">Budget</span>
          <span class="mono">${fmtGBP(env.targetGBP || 0)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden;margin-bottom:8px">
          <div style="width:${pct}%;height:100%;background:${barColour};border-radius:4px;transition:width 0.4s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="${overBudget ? 'roai-negative' : 'roai-positive'}" style="font-size:12px">
            ${overBudget ? '▼ ' + fmtGBP(Math.abs(remaining)) + ' over' : fmtGBP(remaining) + ' left'}
          </span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="number" class="form-input" style="width:80px;padding:4px 6px;font-size:12px"
              placeholder="Budget £" value="${env.targetGBP || ''}" step="any" min="0"
              data-env-target="${idx}" />
            <input type="number" class="form-input" style="width:80px;padding:4px 6px;font-size:12px"
              placeholder="Spent £" value="${env.spentGBP || ''}" step="any" min="0"
              data-env-spent="${idx}" />
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('env-content').innerHTML = `
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-header"><span class="panel-title">Summary — ${monthLabel}</span></div>
      <div class="grid-3" style="gap:16px;margin-top:8px">
        <div style="text-align:center">
          <div class="label-muted">Net Income</div>
          <div class="stat-value mono" style="margin-top:4px">${fmtGBP(totalIncome)}</div>
        </div>
        <div style="text-align:center">
          <div class="label-muted">Allocated</div>
          <div class="stat-value mono ${totalTarget > totalIncome ? 'roai-negative' : ''}" style="margin-top:4px">${fmtGBP(totalTarget)}</div>
        </div>
        <div style="text-align:center">
          <div class="label-muted">Unallocated</div>
          <div class="stat-value mono ${unallocated < 0 ? 'roai-negative' : 'roai-positive'}" style="margin-top:4px">${unallocated >= 0 ? '' : '-'}${fmtGBP(Math.abs(unallocated))}</div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:10px;overflow:hidden;margin-top:12px">
        <div style="width:${totalIncome > 0 ? Math.min((totalTarget/totalIncome)*100,100) : 0}%;height:100%;background:var(--color-info);border-radius:4px;transition:width 0.4s"></div>
      </div>
      <div class="label-muted" style="text-align:right;font-size:11px;margin-top:4px">${totalIncome > 0 ? ((totalTarget/totalIncome)*100).toFixed(1) : 0}% of income allocated</div>
    </div>

    ${envs.length ? `<div class="grid-3" style="gap:16px">${envCards}</div>`
      : '<div class="panel"><div class="label-muted" style="text-align:center;padding:24px">No envelopes yet. Click "+ Add Envelope" to create your first budget bucket.</div></div>'}

    <div class="panel mt-20">
      <div class="panel-header"><span class="panel-title">Spent vs Budget by Envelope</span></div>
      <table class="data-table">
        <thead><tr><th>Envelope</th><th class="td-right">Budget</th><th class="td-right">Spent</th><th class="td-right">Remaining</th><th class="td-right">Used %</th></tr></thead>
        <tbody>
          ${envs.map(e => {
            const rem = round2((e.targetGBP||0) - (e.spentGBP||0));
            const pct = e.targetGBP > 0 ? round2((e.spentGBP||0)/e.targetGBP*100) : 0;
            return `<tr>
              <td>${e.name}</td>
              <td class="td-right mono">${fmtGBP(e.targetGBP||0)}</td>
              <td class="td-right mono">${fmtGBP(e.spentGBP||0)}</td>
              <td class="td-right ${rem < 0 ? 'roai-negative' : 'roai-positive'}">${rem >= 0 ? '' : '-'}${fmtGBP(Math.abs(rem))}</td>
              <td class="td-right"><span class="${pct>=100?'roai-badge-red':pct>=80?'roai-badge-amber':'roai-badge-green'}">${pct.toFixed(0)}%</span></td>
            </tr>`;
          }).join('')}
          <tr class="total-row">
            <td><strong>Total</strong></td>
            <td class="td-right mono"><strong>${fmtGBP(totalTarget)}</strong></td>
            <td class="td-right mono"><strong>${fmtGBP(totalSpent)}</strong></td>
            <td class="td-right ${totalTarget-totalSpent < 0 ? 'roai-negative' : 'roai-positive'}"><strong>${fmtGBP(Math.abs(round2(totalTarget-totalSpent)))}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`;

  wireEvents();
}

function wireEvents() {
  function schedSave() {
    clearTimeout(_envSaveTimer);
    _envSaveTimer = setTimeout(async () => {
      await saveSec('fin_envelopes', state.envelopes);
      render();
    }, 500);
  }

  document.querySelectorAll('[data-env-target]').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.envTarget);
      state.envelopes.envelopes[idx].targetGBP = parseFloat(inp.value) || 0;
      schedSave();
    });
  });

  document.querySelectorAll('[data-env-spent]').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.envSpent);
      state.envelopes.envelopes[idx].spentGBP = parseFloat(inp.value) || 0;
      schedSave();
    });
  });

  document.querySelectorAll('[data-env-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.envDelete);
      state.envelopes.envelopes.splice(idx, 1);
      await saveSec('fin_envelopes', state.envelopes);
      render();
    });
  });
}
