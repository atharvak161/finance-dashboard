// Authentication — validates against pre-computed credential hashes.
// Password and username are NEVER stored in plaintext anywhere.
// Only PBKDF2+SHA256 hashes are present below — the raw password cannot
// be recovered from these values (600k-iteration PBKDF2 + 28-char password).

const CRED = {
  authSalt: 'rREAlvlrl2v+s3UA3tqG8w==',
  authHash: 'rte+/usAJSLPVmN7AEiVoDsv9zMGcO+OqmMvjOGiDUc=',
  encSalt:  'qcHklLnb/O1MFrsXfJnY3Q==',
  userSalt: 'RU9ik40TZv5n7apkPS2Cfw==',
  userHash: 'awO/ci+YBv16iPurlztDo9HQHIejyBtPCwg8a0xgpaA=',
};

const ITERATIONS = 600_000;

// ── Helpers ──────────────────────────────────────────────────

function _toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _fromB64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ── Hash functions ───────────────────────────────────────────

async function _computeAuthHash(password) {
  const salt = _fromB64(CRED.authSalt);
  const km   = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    km, 256
  );
  const hash = await crypto.subtle.digest('SHA-256', bits);
  return _toB64(hash);
}

async function _computeUserHash(username) {
  const saltBytes = _fromB64(CRED.userSalt);
  const userBytes = new TextEncoder().encode(username);
  const combined  = new Uint8Array(saltBytes.length + userBytes.length);
  combined.set(saltBytes);
  combined.set(userBytes, saltBytes.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return _toB64(hash);
}

async function _deriveEncKey(password) {
  const salt = _fromB64(CRED.encSalt);
  const km   = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,           // NOT extractable — raw bytes never accessible
    ['encrypt', 'decrypt']
  );
}

// ── Brute-force protection ───────────────────────────────────

const K = {
  attempts:     'auth_attempts',
  lockoutUntil: 'auth_lockout_until',
  lockoutCount: 'auth_lockout_count',
};

export function checkLockout() {
  const until = parseInt(localStorage.getItem(K.lockoutUntil) || '0');
  const now   = Date.now();
  if (until > now) return { locked: true, remainingMs: until - now };
  return { locked: false, remainingMs: 0 };
}

function _recordFail() {
  const attempts = parseInt(localStorage.getItem(K.attempts) || '0') + 1;
  localStorage.setItem(K.attempts, String(attempts));
  if (attempts >= 3) {
    const count    = parseInt(localStorage.getItem(K.lockoutCount) || '0') + 1;
    const duration = 30_000 * Math.pow(2, count - 1); // 30s, 60s, 120s, …
    localStorage.setItem(K.lockoutUntil, String(Date.now() + duration));
    localStorage.setItem(K.lockoutCount, String(count));
    localStorage.setItem(K.attempts,     '0');
  }
}

function _clearAttempts() {
  localStorage.removeItem(K.attempts);
  localStorage.removeItem(K.lockoutUntil);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Validate credentials against pre-computed hashes.
 * Returns the derived CryptoKey on success.
 * Throws with structured message on failure:
 *   "locked:<seconds>"  — account is locked
 *   "invalid:<remaining>" — wrong credentials, N attempts left
 */
export async function authenticate(username, password) {
  const ls = checkLockout();
  if (ls.locked) {
    throw new Error('locked:' + Math.ceil(ls.remainingMs / 1000));
  }

  // Compute both hashes in parallel (PBKDF2 dominates timing either way)
  const [computedUser, computedAuth] = await Promise.all([
    _computeUserHash(username),
    _computeAuthHash(password),
  ]);

  // Both must match — never reveal which field failed
  if (computedUser !== CRED.userHash || computedAuth !== CRED.authHash) {
    _recordFail();
    const newLs    = checkLockout();
    if (newLs.locked) {
      throw new Error('locked:' + Math.ceil(newLs.remainingMs / 1000));
    }
    const remaining = 3 - parseInt(localStorage.getItem(K.attempts) || '0');
    throw new Error('invalid:' + Math.max(0, remaining));
  }

  _clearAttempts();
  return _deriveEncKey(password);
}
