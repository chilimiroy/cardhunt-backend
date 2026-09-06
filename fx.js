/**
 * ══════════════════════════════════════════════════════════════
 * fx.js — currency conversion, with the rate RECORDED not buried
 *
 * TCGdex prices Cardmarket in EUR. Storing a USD number without
 * storing the rate that produced it makes the number unauditable:
 * a €400 card converted at 1.09 and the same card converted at 1.16
 * differ by 6.6%, and nothing downstream can tell which happened or
 * that anything changed.
 *
 * ── Why this file exists at all ──
 * The rate was already hardcoded in two places at two different
 * vintages: `JPY_PER_USD = 157` in jpfilter.js, and a bare `* 1.09`
 * inline in ingest.js's cardmarket path. The ECB reference rate on
 * 2026-09-03 was 1.1615, so that 1.09 understated every Cardmarket
 * price by 6.6% — silently, for as long as it has been there.
 *
 * This is the CLAUDE.md "documentation is not implementation" shape:
 * a constant that reads as a fact, drifts, and is never revisited
 * because nothing ever prints it. So conversions here always return
 * the rate alongside the amount, and callers are expected to store it.
 *
 * ── Source ──
 * api.frankfurter.dev — European Central Bank reference rates, free,
 * no key, no registration. Probed 2026-09-03: returned 1.1615 against
 * the ECB's own daily XML at 1.1622, agreeing to 0.06%. Two paths that
 * should agree, and do.
 *
 * NOTE: frankfurter.app 301s without a redirect follow; use .dev.
 *
 * ECB publishes once per working day, so the rate is a daily
 * reference, not a live quote. That is the right granularity for card
 * prices, which update hourly at best.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const FX_API = 'https://api.frankfurter.dev/v1/latest';

// Pinned fallbacks, used only when the API cannot be reached. Stamped
// so a stale rate is visible as stale rather than passing for current.
// ECB reference rates, 2026-09-03.
const PINNED = {
  EUR: 1.1615,        // USD per 1 EUR
  JPY: 1 / 157        // USD per 1 JPY — matches jpfilter.js JPY_PER_USD
};
const PINNED_AT = '2026-09-03';

// A rate this far from the pin means either a genuine currency event or
// a malformed response. Either way it should be seen, not silently used.
const SANITY_LO = 0.5, SANITY_HI = 2.0;

const cache = new Map();   // currency -> { rate, date, source }

/**
 * USD per one unit of `currency`.
 *
 * Returns { rate, date, source, stale } — never a bare number, so a
 * caller cannot store a converted price without also having the rate
 * available to store next to it.
 *
 *   source: 'ecb'    live reference rate
 *           'pinned' the API was unreachable; PINNED used
 *           'cache'  already fetched this run
 */
async function usdPer(currency, fetchImpl) {
  const cur = String(currency || '').toUpperCase();
  if (cur === 'USD') return { rate: 1, date: null, source: 'identity', stale: false };
  if (!(cur in PINNED)) throw new Error(`fx: no pinned fallback for ${cur} — add one before converting it`);

  // A cache hit must keep the RATE's provenance. Returning source:'cache'
  // records where in this process the number came from, not where the rate
  // came from — so a stored row would say "cache" and lose the only fact
  // worth auditing: whether the rate was a live ECB reference or a stale
  // pin. `cached` is carried separately for anyone who wants it.
  if (cache.has(cur)) return { ...cache.get(cur), cached: true };

  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const pinned = { rate: PINNED[cur], date: PINNED_AT, source: 'pinned', stale: true };

  if (!doFetch) return pinned;

  try {
    const r = await doFetch(`${FX_API}?base=${cur}&symbols=USD`);
    if (!r || !r.ok) return pinned;
    const d = await r.json();
    const rate = d && d.rates && d.rates.USD;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return pinned;

    // Guard against a malformed or inverted response. A rate that has
    // moved 2x against the pin is not a normal FX move.
    const drift = rate / PINNED[cur];
    if (drift < SANITY_LO || drift > SANITY_HI) {
      console.log(`  fx: ${cur} rate ${rate} is ${drift.toFixed(2)}x the pinned ${PINNED[cur]} — using pinned`);
      return pinned;
    }

    const got = { rate, date: d.date || null, source: 'ecb', stale: false };
    cache.set(cur, got);
    return got;
  } catch (e) {
    return pinned;
  }
}

/**
 * Convert to USD, returning the amount AND the rate that produced it.
 * Returns null for a non-positive or non-finite amount — 0 is never a
 * price, and converting it would launder "no data" into "$0.00".
 */
async function toUsd(amount, currency, fetchImpl) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  const fx = await usdPer(currency, fetchImpl);
  return {
    usd: +(amount * fx.rate).toFixed(2),
    original: amount,
    currency: String(currency || '').toUpperCase(),
    rate: fx.rate,
    rateDate: fx.date,
    rateSource: fx.source,
    stale: fx.stale
  };
}

/** Human-readable provenance, e.g. "EUR->USD @1.1615 (ecb 2026-09-03)". */
function describe(conv) {
  if (!conv) return '';
  return `${conv.currency}->USD @${conv.rate} (${conv.rateSource}${conv.rateDate ? ' ' + conv.rateDate : ''})`;
}

/** Test seam — drop cached rates. */
function _reset() { cache.clear(); }

module.exports = { usdPer, toUsd, describe, PINNED, PINNED_AT, FX_API, _reset };
