# Finance Dashboard

Personal finance tracker. Grafana-inspired. All data encrypted in browser.

## First use
1. Visit the GitHub Pages URL
2. Set your password on first visit — minimum 6 characters
3. Your financial data is pre-loaded — update values in Settings

## Security
- PBKDF2-SHA256 (600,000 iterations) for password hashing
- AES-256-GCM encryption for all stored data
- No data sent to any server — fully offline capable
- Auto-locks after 15 minutes inactivity

## Password reset
Forgot your password? Open browser DevTools → Application → Local Storage →
delete all keys starting with `fin_` and `auth_`. All data will be lost and
you will be prompted to set a new password.

## Deployment
GitHub Pages — push to main branch, enable Pages in repository Settings.
