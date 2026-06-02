// fx-rate.js — Live GBP/INR exchange rate via Frankfurter API
const FX_CACHE_KEY = 'fx_rate_cache';
const FX_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

export async function fetchLiveRate() {
  // Check cache first
  try {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) {
      const { rate, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < FX_CACHE_TTL) return { rate, source: 'cache' };
    }
  } catch {}

  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=GBP&to=INR', {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const rate = Math.round(data.rates.INR * 100) / 100;
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, timestamp: Date.now() }));
    return { rate, source: 'live', date: data.date };
  } catch (err) {
    return { rate: null, source: 'error', error: err.message };
  }
}

export function clearFxCache() {
  localStorage.removeItem(FX_CACHE_KEY);
}
