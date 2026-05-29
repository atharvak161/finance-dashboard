# Finance Dashboard

Personal finance tracker. Grafana-inspired. All data encrypted in browser.

## Access

Visit the GitHub Pages URL. The page shows only "Finance Dashboard" — press **Ctrl+Alt+A** to reveal the authentication interface. Enter your username and password.

Authentication is pre-configured. No setup flow. No password creation.

## Security

- PBKDF2-SHA256 (600,000 iterations) + SHA-256 double-hash for credential verification
- AES-256-GCM encryption for all stored financial data
- Encryption key held in Service Worker memory only — never written to any storage
- No data sent to any server — fully offline capable
- Auto-locks after 15 minutes inactivity
- Credentials stored as hashes only (in gitignored `js/auth-config.js`)

## Architecture

Multi-page app backed by a Service Worker crypto vault:
- `login.html` → hidden CTRL+ALT+A authentication
- `dashboard.html` → financial overview and KPIs
- Separate pages for income, expenses, debts, assets, goals, tax, analytics
- Service Worker holds the AES key in memory across page navigations
- All pages share encrypted localStorage — changes persist automatically

## Deployment

GitHub Pages — push to main branch, enable Pages in repository Settings.

## Password reset

Open browser DevTools → Application → Local Storage → delete all keys matching `fin_*`, `auth_*`, and `auth_version`. All data will be lost.

## Credential regeneration

If credentials need to change, open `keygen.html` locally (gitignored) and copy the output into `js/auth-config.js` (also gitignored, never committed).
