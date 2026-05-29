// PBKDF2-SHA256 (600k iterations) + AES-256-GCM encryption
// Session key held in memory only — never written to any storage

const ITERATIONS = 600_000;
const KEY_LEN    = 256;

const K = {
  authHash:    'auth_hash',
  authSalt:    'auth_salt',
  encSalt:     'enc_salt',
  attempts:    'login_attempts',
  lockoutUntil:'lockout_until',
  lockoutCount:'lockout_count',
};

// Module-level session key — never exported, never stored
let _encKey = null;
let _inactivityTimer = null;
let _onLockCallback = null;

// ── Helpers ──────────────────────────────────────────────────

function randBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function deriveAuthBits(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    km, KEY_LEN
  );
}

async function deriveEncKey(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: KEY_LEN },
    false, // NOT extractable
    ['encrypt', 'decrypt']
  );
}

async function computeAuthHash(password, authSalt) {
  const bits = await deriveAuthBits(password, authSalt);
  const hash = await crypto.subtle.digest('SHA-256', bits);
  return toB64(hash);
}

// ── Public API ───────────────────────────────────────────────

export function isFirstRun() {
  return !localStorage.getItem(K.authHash);
}

export function isAuthenticated() {
  return _encKey !== null && sessionStorage.getItem('session_active') === 'true';
}

export function getEncKey() {
  return _encKey;
}

/** First-time password setup. Generates two independent random salts. */
export async function setupPassword(password) {
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  // Two independently random salts — NEVER the same value
  const authSalt = randBytes(16);
  const encSalt  = randBytes(16);

  // Verify they are different (astronomically unlikely to collide but defensive)
  if (toB64(authSalt) === toB64(encSalt)) {
    throw new Error('Salt collision — please retry.');
  }

  const authHash = await computeAuthHash(password, authSalt);
  const encKey   = await deriveEncKey(password, encSalt);

  localStorage.setItem(K.authSalt, toB64(authSalt));
  localStorage.setItem(K.encSalt,  toB64(encSalt));
  localStorage.setItem(K.authHash, authHash);

  _encKey = encKey;
  sessionStorage.setItem('session_active', 'true');
  clearAttempts();
}

/** Login. Throws on wrong password or lockout. */
export async function login(password) {
  const lockStatus = checkLockout();
  if (lockStatus.locked) {
    throw new Error(`Too many failed attempts. Wait ${Math.ceil(lockStatus.remainingMs / 1000)}s.`);
  }

  const storedHash = localStorage.getItem(K.authHash);
  const authSalt   = fromB64(localStorage.getItem(K.authSalt));
  const encSalt    = fromB64(localStorage.getItem(K.encSalt));

  if (!storedHash || !authSalt || !encSalt) {
    throw new Error('No account found. Please set up a password first.');
  }

  const computedHash = await computeAuthHash(password, authSalt);

  if (computedHash !== storedHash) {
    recordFailedAttempt();
    const newStatus = checkLockout();
    if (newStatus.locked) {
      throw new Error(`Too many failed attempts. Wait ${Math.ceil(newStatus.remainingMs / 1000)}s.`);
    }
    const remaining = 5 - parseInt(localStorage.getItem(K.attempts) || '0');
    throw new Error(`Wrong password. ${remaining} attempt(s) remaining.`);
  }

  const encKey = await deriveEncKey(password, encSalt);
  _encKey = encKey;
  sessionStorage.setItem('session_active', 'true');
  clearAttempts();
  return encKey;
}

/** Change password — re-encrypts all data keys under new key. */
export async function changePassword(currentPassword, newPassword, reEncryptFn) {
  // Verify current password first
  const storedHash = localStorage.getItem(K.authHash);
  const authSalt   = fromB64(localStorage.getItem(K.authSalt));
  const encSalt    = fromB64(localStorage.getItem(K.encSalt));

  const computedHash = await computeAuthHash(currentPassword, authSalt);
  if (computedHash !== storedHash) throw new Error('Current password is incorrect.');

  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

  const newAuthSalt = randBytes(16);
  const newEncSalt  = randBytes(16);
  const newAuthHash = await computeAuthHash(newPassword, newAuthSalt);
  const newEncKey   = await deriveEncKey(newPassword, newEncSalt);

  // Re-encrypt all data under new key (caller provides the re-encrypt function)
  await reEncryptFn(_encKey, newEncKey);

  localStorage.setItem(K.authSalt, toB64(newAuthSalt));
  localStorage.setItem(K.encSalt,  toB64(newEncSalt));
  localStorage.setItem(K.authHash, newAuthHash);

  _encKey = newEncKey;
}

export function logout() {
  _encKey = null;
  sessionStorage.removeItem('session_active');
  clearInactivityTimer();
}

// ── Inactivity timer ─────────────────────────────────────────

export function startInactivityTimer(timeoutMinutes, onLock) {
  _onLockCallback = onLock;
  resetInactivityTimer(timeoutMinutes);

  const events = ['mousemove', 'keypress', 'touchstart', 'click', 'scroll'];
  const reset = () => resetInactivityTimer(timeoutMinutes);
  events.forEach(e => document.addEventListener(e, reset, { passive: true }));
}

export function resetInactivityTimer(timeoutMinutes) {
  clearInactivityTimer();
  const ms = (timeoutMinutes || 15) * 60 * 1000;
  _inactivityTimer = setTimeout(() => {
    _encKey = null;
    sessionStorage.removeItem('session_active');
    if (_onLockCallback) _onLockCallback();
  }, ms);
}

function clearInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
}

// ── Brute force protection ───────────────────────────────────

export function checkLockout() {
  const until = parseInt(localStorage.getItem(K.lockoutUntil) || '0');
  const now   = Date.now();
  if (until > now) {
    return { locked: true, remainingMs: until - now };
  }
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt() {
  const attempts = parseInt(localStorage.getItem(K.attempts) || '0') + 1;
  localStorage.setItem(K.attempts, String(attempts));

  if (attempts >= 5) {
    const count   = parseInt(localStorage.getItem(K.lockoutCount) || '0') + 1;
    const duration = 30_000 * Math.pow(2, count - 1); // 30s, 60s, 120s, 240s…
    localStorage.setItem(K.lockoutUntil, String(Date.now() + duration));
    localStorage.setItem(K.lockoutCount, String(count));
    localStorage.setItem(K.attempts, '0');
  }
}

export function clearAttempts() {
  localStorage.removeItem(K.attempts);
  localStorage.removeItem(K.lockoutUntil);
}

// ── Encrypt / Decrypt (used by store.js) ─────────────────────

export async function encryptData(data, encKey) {
  const iv       = randBytes(12); // fresh IV every call
  const encoded  = new TextEncoder().encode(JSON.stringify(data));
  const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, encoded);
  return toB64(iv) + ':' + toB64(cipher);
}

export async function decryptData(stored, encKey) {
  const [ivB64, cipherB64] = stored.split(':');
  const iv        = fromB64(ivB64);
  const ciphertext= fromB64(cipherB64);
  const plain     = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain));
}
