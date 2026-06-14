// Renders the sidebar and topbar into the page shell.
// Called once per page from page-init.js after auth is confirmed.

import { lock } from './sw-client.js';

const NAV = [
  { id: 'overview',     label: 'Overview',       href: 'dashboard.html',  icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  { id: 'income',       label: 'Income',          href: 'income.html',     icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { id: 'overtime',     label: 'OT Tracker',      href: 'overtime.html',   icon: '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>' },
  { id: 'expenses',     label: 'Expenses',        href: 'expenses.html',   icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
  { id: 'transactions', label: 'Transactions',    href: 'transactions.html', icon: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>' },
  { id: 'calendar',  label: 'Bill Calendar',  href: 'calendar.html',  icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { id: 'envelopes', label: 'Envelopes',       href: 'envelopes.html', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
  { id: 'debts',        label: 'Debts',           href: 'debts.html',      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>' },
  { id: 'assets',       label: 'Assets',          href: 'assets.html',     icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { id: 'networth',     label: 'Net Worth',       href: 'networth.html',   icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
  { id: 'goals',        label: 'Goals',           href: 'goals.html',      icon: '<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.69 12.06a.5.5 0 0 0 .62 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/>' },
  { id: 'tax',          label: 'Tax Tracker',     href: 'tax.html',        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
  { id: 'export',       label: 'Export',          href: 'export.html',     icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
];

const SECTION_TITLES = {
  overview:     'Overview',
  income:       'Income',
  overtime:     'OT Tracker',
  expenses:     'Expenses',
  transactions: 'Transactions',
  calendar:     'Bill Calendar',
  envelopes:    'Envelopes',
  debts:        'Debts',
  assets:       'Assets & Investments',
  networth:     'Net Worth Timeline',
  goals:        'Goals & Savings',
  tax:          'Tax Tracker',
  export:       'Export',
  settings:     'Preferences',
};

function svgIcon(path, extra = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ${extra}>${path}</svg>`;
}

export function renderSharedLayout(activeNav, state) {
  const firstName = (state?.profile?.name || '').split(' ')[0] || 'User';

  // ── Sidebar ──────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-logo">
        <svg class="sidebar-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <span class="sidebar-logo-text">Finance</span>
        <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">
          ${svgIcon('<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>', 'width="16" height="16"')}
        </button>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map(n => `
          <a class="nav-item${n.id === activeNav ? ' active' : ''}" href="${n.href}">
            ${svgIcon(n.icon)}
            <span class="nav-label">${n.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-profile">
          <div class="profile-avatar">${firstName.slice(0, 2).toUpperCase()}</div>
          <span class="nav-label sidebar-profile-name" id="sidebar-profile-name">${firstName}</span>
        </div>
        <a class="nav-item" href="settings.html">
          ${svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')}
          <span class="nav-label">Preferences</span>
        </a>
        <button class="nav-item" id="lock-btn" title="Lock dashboard">
          ${svgIcon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>')}
          <span class="nav-label">Lock</span>
        </button>
      </div>
    `;

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    });

    // Restore collapsed state
    if (localStorage.getItem('sidebar_collapsed') === '1') {
      sidebar.classList.add('collapsed');
    }

    // Lock button (auth removed — no-op, stay on dashboard)
    const lockBtn = document.getElementById('lock-btn');
    if (lockBtn) lockBtn.style.display = 'none';
  }

  // ── Topbar ────────────────────────────────────────────────
  const topbar = document.getElementById('topbar');
  if (topbar) {
    topbar.innerHTML = `
      <div>
        <div class="topbar-title">${SECTION_TITLES[activeNav] || activeNav}</div>
        <div class="label-muted" id="topbar-date"></div>
      </div>
      <div class="topbar-actions">
        <div class="topbar-rate" id="topbar-rate" style="display:${activeNav === 'overview' ? 'flex' : 'none'}">
          <span class="topbar-rate-value" id="topbar-rate-value">£1 = ₹—</span>
          <span class="topbar-rate-time" id="topbar-rate-time"></span>
          <button class="topbar-rate-refresh" id="topbar-rate-refresh" title="Refresh rate">↻</button>
        </div>
        <button class="btn btn-secondary btn-sm" id="privacy-toggle-btn" title="Toggle privacy mode" aria-label="Toggle privacy mode">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button id="oled-toggle" class="icon-btn" title="Toggle OLED dark mode" style="font-size:14px;cursor:pointer;background:none;border:none;color:var(--text-secondary);padding:4px 8px">⬛</button>
        <button class="btn btn-secondary btn-sm" id="export-pdf-btn">
          ${svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', 'style="width:13px;height:13px"')}
          PDF
        </button>
      </div>
    `;
    document.getElementById('topbar-date').textContent =
      new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    document.getElementById('export-pdf-btn').addEventListener('click', () => {
      if (window._exportCurrentPagePDF) window._exportCurrentPagePDF();
    });

    // Privacy mode toggle
    const privacyBtn = document.getElementById('privacy-toggle-btn');
    const eyeOpen = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    function applyPrivacyMode(active) {
      if (active) {
        document.body.classList.add('privacy-mode');
        privacyBtn.innerHTML = eyeClosed;
      } else {
        document.body.classList.remove('privacy-mode');
        privacyBtn.innerHTML = eyeOpen;
      }
    }

    // Restore from sessionStorage on page load
    if (sessionStorage.getItem('privacyMode') === '1') {
      applyPrivacyMode(true);
    }

    privacyBtn.addEventListener('click', () => {
      const nowActive = !document.body.classList.contains('privacy-mode');
      applyPrivacyMode(nowActive);
      sessionStorage.setItem('privacyMode', nowActive ? '1' : '0');
    });
  }

  // OLED mode — persist in localStorage, apply on load
  (function() {
    const btn = document.getElementById('oled-toggle');
    if (localStorage.getItem('oled_mode') === '1') document.body.classList.add('oled');
    if (btn) {
      btn.style.opacity = document.body.classList.contains('oled') ? '1' : '0.4';
      btn.addEventListener('click', () => {
        const on = document.body.classList.toggle('oled');
        localStorage.setItem('oled_mode', on ? '1' : '0');
        btn.style.opacity = on ? '1' : '0.4';
      });
    }
  })();

  // Keyboard navigation shortcuts — G+key chords and standalone shortcuts
  (function() {
    let _gPressed = false, _gTimer = null;
    let _chordToast = null;
    function showChordHint() {
      removeChordHint();
      _chordToast = document.createElement('div');
      _chordToast.id = 'kbd-chord-hint';
      _chordToast.style.cssText = 'position:fixed;bottom:60px;right:20px;background:var(--accent,#00bfff);color:#000;padding:6px 12px;border-radius:6px;font-family:monospace;font-size:14px;font-weight:600;z-index:9999;pointer-events:none;';
      _chordToast.textContent = 'G + ?';
      document.body.appendChild(_chordToast);
    }
    function removeChordHint() {
      if (_chordToast) { _chordToast.remove(); _chordToast = null; }
    }
    const NAV_MAP = {
      d: 'dashboard.html', e: 'expenses.html', i: 'income.html',
      a: 'assets.html',    t: 'transactions.html', n: 'networth.html',
      l: 'goals.html',     x: 'analytics.html',   c: 'calendar.html',
      v: 'envelopes.html',
    };
    document.addEventListener('keydown', (ev) => {
      // Ignore when typing in an input/textarea/select
      if (['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      if (key === 'g') {
        _gPressed = true;
        showChordHint();
        clearTimeout(_gTimer);
        _gTimer = setTimeout(() => { _gPressed = false; removeChordHint(); }, 1000);
        return;
      }
      if (_gPressed && NAV_MAP[key]) {
        ev.preventDefault();
        _gPressed = false;
        clearTimeout(_gTimer);
        removeChordHint();
        window.location.href = NAV_MAP[key];
        return;
      }
      // Standalone: ? = show help toast
      if (key === '?') {
        showKbHelp();
      }
      _gPressed = false;
      removeChordHint();
    });

    function showKbHelp() {
      let toast = document.getElementById('kb-help-toast');
      if (toast) { toast.remove(); return; }
      toast = document.createElement('div');
      toast.id = 'kb-help-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg-panel);border:1px solid var(--border-medium);border-radius:8px;padding:16px 20px;z-index:9999;font-size:13px;color:var(--text-secondary);max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
      toast.innerHTML = `
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:10px">Keyboard Shortcuts</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px">
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G D</kbd><span>Dashboard</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G E</kbd><span>Expenses</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G T</kbd><span>Transactions</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G A</kbd><span>Assets</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G X</kbd><span>Analytics</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G C</kbd><span>Calendar</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G V</kbd><span>Envelopes</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">G L</kbd><span>Goals</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">?</kbd><span>This help</span>
          <kbd style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;font-family:monospace">⬛</kbd><span>OLED mode</span>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text-muted)">Click anywhere or press ? to dismiss</div>`;
      document.body.appendChild(toast);
      toast.addEventListener('click', () => toast.remove());
      setTimeout(() => toast?.remove(), 8000);
    }
  })();

  // ── Mobile navigation ─────────────────────────────────────
  initMobileNav();
  injectMobileBottomNav(activeNav);
}

// ── Mobile bottom tab bar ─────────────────────────────────────

const MOBILE_NAV = [
  {
    id: 'overview',
    label: 'Dashboard',
    href: 'dashboard.html',
    icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    href: 'expenses.html',
    icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    href: 'transactions.html',
    icon: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: 'calendar.html',
    icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  },
  {
    id: 'envelopes',
    label: 'Envelopes',
    href: 'envelopes.html',
    icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  },
];

function injectMobileBottomNav(activeNav) {
  if (document.querySelector('.mobile-bottom-nav')) return;

  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.setAttribute('aria-label', 'Mobile navigation');

  nav.innerHTML = MOBILE_NAV.map(item => `
    <a class="mobile-bottom-nav-item${item.id === activeNav ? ' active' : ''}" href="${item.href}" aria-label="${item.label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
      <span>${item.label}</span>
    </a>
  `).join('');

  document.body.appendChild(nav);
}

// Mobile navigation
function initMobileNav() {
  // Avoid creating duplicate controls if layout re-renders
  if (document.querySelector('.mobile-nav-toggle')) return;

  // Create toggle button
  const toggle = document.createElement('button');
  toggle.className = 'mobile-nav-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation');
  toggle.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(toggle);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'mobile-overlay';
  document.body.appendChild(overlay);

  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  function openNav() {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('mobile-open');
    toggle.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeNav() {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('mobile-open');
    toggle.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('mobile-open') ? closeNav() : openNav();
  });
  overlay.addEventListener('click', closeNav);

  // Close on nav link click
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
}
