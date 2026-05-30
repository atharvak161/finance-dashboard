// Renders the sidebar and topbar into the page shell.
// Called once per page from page-init.js after auth is confirmed.

import { lock } from './sw-client.js';

const NAV = [
  { id: 'overview',     label: 'Overview',       href: 'dashboard.html',  icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  { id: 'income',       label: 'Income',          href: 'income.html',     icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { id: 'expenses',     label: 'Expenses',        href: 'expenses.html',   icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
  { id: 'debts',        label: 'Debts',           href: 'debts.html',      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>' },
  { id: 'assets',       label: 'Assets',          href: 'assets.html',     icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { id: 'networth',     label: 'Net Worth',       href: 'networth.html',   icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
  { id: 'goals',        label: 'Goals',           href: 'goals.html',      icon: '<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.69 12.06a.5.5 0 0 0 .62 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/>' },
  { id: 'tax',          label: 'Tax Tracker',     href: 'tax.html',        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
  { id: 'analytics',    label: 'Analytics',       href: 'analytics.html',  icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  { id: 'export',       label: 'Export',          href: 'export.html',     icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
];

const SECTION_TITLES = {
  overview: 'Overview',
  income:   'Income',
  expenses: 'Expenses',
  debts:    'Debts',
  assets:   'Assets & Investments',
  networth: 'Net Worth Timeline',
  goals:    'Goals & Savings',
  tax:      'Tax Tracker',
  analytics:'Analytics',
  export:   'Export',
  settings: 'Settings',
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
          <span class="nav-label">Settings</span>
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

    // Lock button
    document.getElementById('lock-btn').addEventListener('click', async () => {
      sessionStorage.removeItem('_ek');
      await lock();
      window.location.replace('login.html');
    });
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
  }
}
