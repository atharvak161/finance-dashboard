// fx-rate.js — Live GBP/INR exchange rate
// Primary: Frankfurter (ECB data, free, no key)
// Fallback: Open Exchange Rates (free endpoint)
const FX_CACHE_KEY = 'fx_rate_cache';
const FX_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function tryFrankfurter() {
  const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=GBP&to=INR');
  if (!res.ok) throw new Error(`Frankfurter: ${res.status}`);
  const data = await res.json();
  return { rate: Math.round(data.rates.INR * 100) / 100, date: data.date };
}

async function tryExchangeRateHost() {
  // exchange-api.com free tier — no key needed
  const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/GBP');
  if (!res.ok) throw new Error(`ExchangeRateHost: ${res.status}`);
  const data = await res.json();
  if (!data.rates?.INR) throw new Error('INR rate missing');
  return { rate: Math.round(data.rates.INR * 100) / 100, date: data.time_last_update_utc?.slice(0, 10) || 'today' };
}

export async function fetchLiveRate() {
  // Always fetch live — no cache returned to the caller.
  // Cache is still written after a successful fetch so the fallback
  // is available if the network is temporarily unavailable on the next call.

  // Try primary then fallback
  let result = null;
  let lastError = '';

  try {
    result = await tryFrankfurter();
  } catch (e) {
    lastError = e.message;
    try {
      result = await tryExchangeRateHost();
    } catch (e2) {
      lastError += ' | ' + e2.message;
    }
  }

  if (result) {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
      rate: result.rate,
      date: result.date,
      timestamp: Date.now()
    }));
    return { rate: result.rate, source: 'live', date: result.date };
  }

  return { rate: null, source: 'error', error: lastError };
}

export function clearFxCache() {
  localStorage.removeItem(FX_CACHE_KEY);
}
