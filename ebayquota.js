// ══════════════════════════════════════════════════════════════
// ebayquota.js — stay inside eBay's limits, by their count not ours
//
// The free Browse tier is 5,000 calls/day. Going over risks the keyset
// being throttled or suspended, so this stops well short and treats
// eBay's own numbers as authoritative.
//
// Three things make a naive counter wrong here:
//
//  1. Render's free tier restarts on idle. An in-memory counter resets
//     to zero on every cold start, so the process could make 5,000 calls
//     several times in a day and believe it had made a few hundred.
//     The count therefore lives in Supabase.
//
//  2. eBay tells us the truth in response headers —
//     X-eBay-C-RateLimit-Remaining and -Reset. Whenever a header is
//     present it overrides our tally, because ours can drift.
//
//  3. Token exchanges count too. A bug where expires_in was missing made
//     every call re-authenticate, quietly spending quota on auth rather
//     than searches. Both are recorded.
//
//   const q = require('./ebayquota');
//   const gate = await q.check(db);
//   if (!gate.allowed) return { status:'quota', reason: gate.reason };
//   ... make the call ...
//   await q.record(db, { headers: res.headers, kind: 'search' });
// ══════════════════════════════════════════════════════════════

const DAILY_LIMIT   = 5000;   // free Browse tier
const RESERVE       = 100;    // never spent, by anything
const WARN_AT       = 0.70;   // log loudly from here
const SOFT_STOP     = 0.92;   // background jobs yield; user requests continue

// SOFT_STOP must leave real headroom above RESERVE or it can never fire.
// At 5,000 a 0.95 soft stop with a 250 reserve meant the soft stop triggered
// at exactly the reserve — the hard stop always won and background work never
// yielded early. 0.92 leaves 400, a 300-call band where user requests are
// still served and background jobs have already stopped.
// If either constant changes, re-check that DAILY_LIMIT * (1 - SOFT_STOP)
// is comfortably above RESERVE. ebayquota.test.js asserts this.

// eBay's window resets at UTC midnight
function windowKey(now) {
  return (now || new Date()).toISOString().slice(0, 10);   // YYYY-MM-DD
}
function msUntilReset(now) {
  const d = now || new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next - d;
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ebay_quota (
      window_date   DATE PRIMARY KEY,
      calls_made    INTEGER NOT NULL DEFAULT 0,
      token_calls   INTEGER NOT NULL DEFAULT 0,
      ebay_limit    INTEGER,
      ebay_remaining INTEGER,
      ebay_reset    TIMESTAMPTZ,
      last_call_at  TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch(() => {});
}

async function state(db, now) {
  await ensureTable(db);
  const key = windowKey(now);
  const r = await db.query(
    `INSERT INTO ebay_quota (window_date) VALUES ($1)
     ON CONFLICT (window_date) DO UPDATE SET window_date = EXCLUDED.window_date
     RETURNING *`, [key]);
  return r.rows[0];
}

// May we make a call? `background` jobs yield earlier than user requests.
async function check(db, opts) {
  opts = opts || {};
  const now = new Date();

  if (!db) {
    return { allowed: true, reason: 'no database — quota cannot be tracked',
             tracked: false };
  }

  let s;
  try { s = await state(db, now); }
  catch (e) {
    // Never let a quota-table problem silently permit unlimited calls
    return { allowed: false, reason: 'quota state unreadable: ' + e.message,
             tracked: false };
  }

  // eBay's own figure wins when we have a fresh one
  const ebayRemaining = (s.ebay_remaining !== null && s.ebay_reset &&
                         new Date(s.ebay_reset) > now)
    ? s.ebay_remaining : null;

  const used      = s.calls_made + s.token_calls;
  const remaining = ebayRemaining !== null ? ebayRemaining : (DAILY_LIMIT - used);
  const limit     = s.ebay_limit || DAILY_LIMIT;
  const ratio     = 1 - (remaining / limit);

  const base = {
    used, remaining, limit,
    percentUsed: +(ratio * 100).toFixed(1),
    source: ebayRemaining !== null ? 'ebay-headers' : 'local-count',
    resetsInMin: Math.round(msUntilReset(now) / 60000),
    tracked: true
  };

  if (remaining <= RESERVE) {
    return Object.assign(base, {
      allowed: false,
      reason: `${remaining} calls left of ${limit} — holding a ${RESERVE}-call reserve. ` +
              `Resets in ${base.resetsInMin} min.`
    });
  }

  if (opts.background && ratio >= SOFT_STOP) {
    return Object.assign(base, {
      allowed: false,
      reason: `${base.percentUsed}% of the daily quota used — background work ` +
              `paused so user requests keep working. Resets in ${base.resetsInMin} min.`
    });
  }

  if (ratio >= WARN_AT) {
    console.warn(`[ebay-quota] ${base.percentUsed}% used, ${remaining} left, ` +
                 `resets in ${base.resetsInMin} min`);
  }

  return Object.assign(base, { allowed: true, reason: null });
}

// Record a call. Pass the response headers and eBay's own count is adopted.
async function record(db, opts) {
  opts = opts || {};
  if (!db) return;
  const now = new Date();
  const key = windowKey(now);
  const isToken = opts.kind === 'token';

  let limit = null, remaining = null, reset = null;
  const h = opts.headers;
  if (h) {
    const get = n => (typeof h.get === 'function' ? h.get(n) : h[n]) || null;
    const l = get('x-ebay-c-ratelimit-limit');
    const r = get('x-ebay-c-ratelimit-remaining');
    const s = get('x-ebay-c-ratelimit-reset');
    if (l !== null && !isNaN(parseInt(l))) limit = parseInt(l);
    if (r !== null && !isNaN(parseInt(r))) remaining = parseInt(r);
    if (s) { const d = new Date(s); if (!isNaN(d)) reset = d.toISOString(); }
  }

  try {
    await ensureTable(db);
    await db.query(`
      INSERT INTO ebay_quota (window_date, calls_made, token_calls,
                              ebay_limit, ebay_remaining, ebay_reset, last_call_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (window_date) DO UPDATE SET
        calls_made     = ebay_quota.calls_made  + $2,
        token_calls    = ebay_quota.token_calls + $3,
        ebay_limit     = COALESCE($4, ebay_quota.ebay_limit),
        ebay_remaining = COALESCE($5, ebay_quota.ebay_remaining),
        ebay_reset     = COALESCE($6, ebay_quota.ebay_reset),
        last_call_at   = NOW(),
        updated_at     = NOW()`,
      [key, isToken ? 0 : 1, isToken ? 1 : 0, limit, remaining, reset]);
  } catch (e) {
    console.error('[ebay-quota] could not record a call:', e.message);
  }
}

// Ask eBay directly what our limits are. Costs one call.
async function fetchRateLimits(db, token) {
  if (!token) return { ok: false, reason: 'no token' };
  try {
    const r = await fetch(
      'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse&api_context=buy',
      { headers: { Authorization: 'Bearer ' + token } });
    await record(db, { headers: r.headers, kind: 'search' });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    const d = await r.json();
    const browse = (d.rateLimits || [])[0];
    const res = browse && (browse.resources || [])[0];
    const rate = res && (res.rates || [])[0];
    if (!rate) return { ok: true, reason: 'no rate data returned', raw: d };
    return {
      ok: true, limit: rate.limit, remaining: rate.remaining,
      reset: rate.reset, timeWindow: rate.timeWindow
    };
  } catch (e) { return { ok: false, reason: e.message }; }
}

async function status(db) {
  const c = await check(db);
  return {
    allowed: c.allowed, used: c.used, remaining: c.remaining, limit: c.limit,
    percentUsed: c.percentUsed, countedBy: c.source,
    resetsInMinutes: c.resetsInMin, reserve: RESERVE,
    reason: c.reason,
    policy: {
      dailyLimit: DAILY_LIMIT,
      reserve: `${RESERVE} calls held back — never spent`,
      backgroundStopsAt: `${SOFT_STOP * 100}% so user requests keep working`,
      warnsFrom: `${WARN_AT * 100}%`,
      resets: 'UTC midnight',
      authority: "eBay's own X-eBay-C-RateLimit headers override the local count"
    }
  };
}

module.exports = {
  check, record, status, fetchRateLimits,
  DAILY_LIMIT, RESERVE, WARN_AT, SOFT_STOP, windowKey, msUntilReset
};
