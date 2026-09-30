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
//   const gate = await q.check(db, { origin: 'user' });
//   if (!gate.allowed) return { status:'quota', reason: gate.reason };
//   ... make the call ...
//   await q.record(db, { headers: res.headers, kind: 'search', origin: 'user' });
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

// ── An hourly ceiling, beside the daily one (TASK T1, 2026-09-30) ──
// The daily limit alone did not prevent the day it was built for. On
// 2026-09-30 the every-marketplace design spent 723 and 713 calls in two
// consecutive hours on card views alone, the probes added ~950 through the
// day, and the 5,000 was gone in twelve hours. Every guard held — the warn
// at 70%, the soft stop at 92%, the reserve — and every one of them spoke
// only to a server log, after the damage. A daily cap bounds a runaway to
// the whole day; this bounds it to one hour's worth (12% of the day), and
// the next hour the question "is this right?" gets asked again.
//
// 600, measured against `listing_views`: the heaviest hour of ordinary
// browsing after the on-demand fix was 195 calls (49 views, much of it
// deliberate measurement), so 600 is ~3x headroom over real use and trips
// both runaway hours. Clock hours, UTC: a burst straddling HH:00 can spend
// two ceilings in quick succession and still no more than 600 an hour on
// average — simple, and every refusal can say exactly when it lifts.
// Applies to EVERY origin, user included: a runaway looks like a user.
const HOURLY_LIMIT  = 600;

// ── A separate allowance for tooling (TASK T2) ──
// Probes, audits and rate checks spent ~950 calls on 2026-09-30 — a fifth
// of the day — drawing on the same pool as Roy's browsing. Tooling now has
// its own ceiling INSIDE the daily limit. When it is spent a tool is
// refused and stops; it never borrows from the user budget. Tooling also
// yields at SOFT_STOP like background work. The marketplace probe would have
// sampled 3 cards rather than 12 and answered the same question.
const TOOLING_DAILY = 300;

// Who is spending. Every call carries one; the count is kept per origin.
//   user       — someone pressed something in the app
//   background — automatic work nobody is waiting on (ingest, crawls)
//   tooling    — probes, audits, measurements, rate checks
const ORIGINS = ['user', 'background', 'tooling'];
function normOrigin(origin, background) {
  if (ORIGINS.indexOf(origin) >= 0) return origin;
  return background ? 'background' : 'user';
}

// The app shows the number from here (TASK T3). Below it the indicator is
// quiet; from it, always visible.
const VISIBLE_FROM  = 0.50;

// eBay's window resets at UTC midnight
function windowKey(now) {
  return (now || new Date()).toISOString().slice(0, 10);   // YYYY-MM-DD
}
function msUntilReset(now) {
  const d = now || new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next - d;
}
// The hourly window: the UTC clock hour.
function hourKey(now) {
  const d = now || new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                           d.getUTCHours())).toISOString();
}
function msUntilHourReset(now) {
  const d = now || new Date();
  return new Date(hourKey(d)).getTime() + 3600e3 - d.getTime();
}

// Created/altered once per pool per process, not on every call.
const ready = new WeakSet();
async function ensureTable(db) {
  if (ready.has(db)) return;
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
  // Per-origin counts (T2). calls_made + token_calls stays the total, so
  // every earlier reader keeps its meaning; these split the same calls.
  await db.query(`
    ALTER TABLE ebay_quota
      ADD COLUMN IF NOT EXISTS user_calls       INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS background_calls INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tooling_calls    INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  // The hourly window (T1) — in Supabase for the same reason as the daily
  // count: Render restarts on idle and a memory counter would reset.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ebay_quota_hour (
      window_hour      TIMESTAMPTZ PRIMARY KEY,
      calls            INTEGER NOT NULL DEFAULT 0,
      user_calls       INTEGER NOT NULL DEFAULT 0,
      background_calls INTEGER NOT NULL DEFAULT 0,
      tooling_calls    INTEGER NOT NULL DEFAULT 0
    )`).catch(() => {});
  ready.add(db);
}

async function state(db, now) {
  await ensureTable(db);
  const r = await db.query(
    `INSERT INTO ebay_quota (window_date) VALUES ($1)
     ON CONFLICT (window_date) DO UPDATE SET window_date = EXCLUDED.window_date
     RETURNING *`, [windowKey(now)]);
  const h = await db.query(
    `INSERT INTO ebay_quota_hour (window_hour) VALUES ($1)
     ON CONFLICT (window_hour) DO UPDATE SET window_hour = EXCLUDED.window_hour
     RETURNING *`, [hourKey(now)]);
  return { day: r.rows[0] || {}, hour: (h && h.rows && h.rows[0]) || {} };
}

const num = v => (Number.isFinite(+v) ? +v : 0);

// May we make a call? Background and tooling yield earlier than user
// requests; tooling also has its own allowance.
//   opts.origin          'user' | 'background' | 'tooling' (else from background)
//   opts.pending         calls allowed and not yet recorded, all origins
//   opts.pendingTooling  of those, tooling's
// Every refusal carries `limitHit` ('daily' | 'hourly' | 'tooling' |
// 'soft-stop'), a sentence, and when it lifts — never a bare "no".
async function check(db, opts) {
  opts = opts || {};
  const now = opts.now || new Date();
  const origin = normOrigin(opts.origin, opts.background);
  const yields = origin !== 'user';          // background AND tooling

  if (!db) {
    return { allowed: true, reason: 'no database — quota cannot be tracked',
             tracked: false, origin };
  }

  let st;
  try { st = await state(db, now); }
  catch (e) {
    // Never let a quota-table problem silently permit unlimited calls
    return { allowed: false, reason: 'quota state unreadable: ' + e.message,
             tracked: false, origin, limitHit: 'unreadable' };
  }
  const s = st.day, hr = st.hour;

  // eBay's own figure wins when we have a fresh one
  const ebayRemaining = (s.ebay_remaining !== null && s.ebay_remaining !== undefined &&
                         s.ebay_reset && new Date(s.ebay_reset) > now)
    ? s.ebay_remaining : null;

  const used      = num(s.calls_made) + num(s.token_calls);
  // `pending`: calls already allowed and not yet recorded (ebaycall runs
  // several at once). Counted as spent, or two slots can both be allowed
  // the same last call — per day, per hour and per tooling allowance alike.
  const pending   = Math.max(0, opts.pending | 0);
  const pendingT  = Math.max(0, opts.pendingTooling | 0);
  const remaining = (ebayRemaining !== null ? ebayRemaining : (DAILY_LIMIT - used)) - pending;
  const limit     = s.ebay_limit || DAILY_LIMIT;
  const ratio     = 1 - (remaining / limit);

  const hourUsed  = num(hr.calls) + pending;
  const toolUsed  = num(s.tooling_calls) + pendingT;
  const resetsInMin     = Math.round(msUntilReset(now) / 60000);
  const hourResetsInMin = Math.max(1, Math.round(msUntilHourReset(now) / 60000));
  const resetsAt        = new Date(now.getTime() + msUntilReset(now)).toISOString();
  const hourResetsAt    = new Date(new Date(hourKey(now)).getTime() + 3600e3).toISOString();

  const base = {
    origin, used, remaining, limit,
    percentUsed: +(ratio * 100).toFixed(1),
    source: ebayRemaining !== null ? 'ebay-headers' : 'local-count',
    resetsInMin, resetsAt,
    hour: { used: hourUsed, limit: HOURLY_LIMIT, remaining: HOURLY_LIMIT - hourUsed,
            resetsInMin: hourResetsInMin, resetsAt: hourResetsAt },
    tooling: { used: toolUsed, allowance: TOOLING_DAILY, remaining: TOOLING_DAILY - toolUsed },
    byOrigin: { user: num(s.user_calls), background: num(s.background_calls),
                tooling: num(s.tooling_calls) },
    tracked: true
  };
  const refuse = (limitHit, reason, inMin, at) => Object.assign(base, {
    allowed: false, limitHit, reason, liftsInMin: inMin, liftsAt: at
  });

  if (remaining <= RESERVE) {
    return refuse('daily',
      `${remaining} calls left of ${limit} — holding a ${RESERVE}-call reserve. ` +
      `Resets in ${resetsInMin} min.`, resetsInMin, resetsAt);
  }

  if (hourUsed >= HOURLY_LIMIT) {
    return refuse('hourly',
      `${hourUsed} eBay calls this hour — the hourly ceiling is ${HOURLY_LIMIT}, ` +
      `so a runaway cannot spend the whole day. Lifts in ${hourResetsInMin} min.`,
      hourResetsInMin, hourResetsAt);
  }

  if (origin === 'tooling' && toolUsed >= TOOLING_DAILY) {
    return refuse('tooling',
      `tooling allowance spent — ${toolUsed} of ${TOOLING_DAILY} calls today. ` +
      `Probes and audits stop here rather than borrow from the user budget. ` +
      `Resets in ${resetsInMin} min.`, resetsInMin, resetsAt);
  }

  if (yields && ratio >= SOFT_STOP) {
    return refuse('soft-stop',
      `${base.percentUsed}% of the daily quota used — ${origin} work ` +
      `paused so user requests keep working. Resets in ${resetsInMin} min.`,
      resetsInMin, resetsAt);
  }

  if (ratio >= WARN_AT) {
    console.warn(`[ebay-quota] ${base.percentUsed}% used, ${remaining} left, ` +
                 `resets in ${resetsInMin} min`);
  }

  return Object.assign(base, { allowed: true, reason: null, limitHit: null });
}

// Record a call. Pass the response headers and eBay's own count is adopted.
async function record(db, opts) {
  opts = opts || {};
  if (!db) return;
  const now = new Date();
  const key = windowKey(now);
  const isToken = opts.kind === 'token';
  // The column name comes from ORIGINS via normOrigin, never from input.
  const col = normOrigin(opts.origin, opts.background) + '_calls';

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
                              ebay_limit, ebay_remaining, ebay_reset, last_call_at, ${col})
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 1)
      ON CONFLICT (window_date) DO UPDATE SET
        calls_made     = ebay_quota.calls_made  + $2,
        token_calls    = ebay_quota.token_calls + $3,
        ${col}         = ebay_quota.${col} + 1,
        ebay_limit     = COALESCE($4, ebay_quota.ebay_limit),
        ebay_remaining = COALESCE($5, ebay_quota.ebay_remaining),
        ebay_reset     = COALESCE($6, ebay_quota.ebay_reset),
        last_call_at   = NOW(),
        updated_at     = NOW()`,
      [key, isToken ? 0 : 1, isToken ? 1 : 0, limit, remaining, reset]);
    await db.query(`
      INSERT INTO ebay_quota_hour (window_hour, calls, ${col}) VALUES ($1, 1, 1)
      ON CONFLICT (window_hour) DO UPDATE SET
        calls  = ebay_quota_hour.calls + 1,
        ${col} = ebay_quota_hour.${col} + 1`, [hourKey(now)]);
  } catch (e) {
    console.error('[ebay-quota] could not record a call:', e.message);
  }
}

// Ask eBay directly what our limits are. Costs one call — a TOOLING call:
// it is a measurement, and counts against the tooling allowance.
async function fetchRateLimits(db, token) {
  if (!token) return { ok: false, reason: 'no token' };
  const gate = await check(db, { origin: 'tooling' });
  if (!gate.allowed) return { ok: false, blocked: 'quota', reason: gate.reason };
  try {
    const r = await fetch(
      'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse&api_context=buy',
      { headers: { Authorization: 'Bearer ' + token } });
    await record(db, { headers: r.headers, kind: 'search', origin: 'tooling' });
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

// What the app shows (T3). `level` drives the indicator:
//   quiet    under VISIBLE_FROM of the day AND of the hour — may stay hidden
//   notice   from 50% of either — always visible
//   warn     from WARN_AT of either
//   stopped  a USER request would be refused right now; `reason` says why
//            and `liftsAt` says when listings return
function levelOf(c) {
  const worst = Math.max((c.percentUsed || 0) / 100, c.hour ? c.hour.used / HOURLY_LIMIT : 0);
  return !c.allowed ? 'stopped'
    : worst >= WARN_AT ? 'warn'
    : worst >= VISIBLE_FROM ? 'notice' : 'quiet';
}

async function status(db) {
  const c = await check(db, { origin: 'user' });
  const level = levelOf(c);
  return {
    allowed: c.allowed, used: c.used, remaining: c.remaining, limit: c.limit,
    percentUsed: c.percentUsed, countedBy: c.source,
    resetsInMinutes: c.resetsInMin, resetsAt: c.resetsAt, reserve: RESERVE,
    hour: c.hour, tooling: c.tooling, byOrigin: c.byOrigin,
    // Calls made before origins were counted (2026-09-30), or recorded by a
    // path that lost its tag: shown as such, never folded into "user".
    unattributed: c.byOrigin
      ? Math.max(0, (c.used || 0) - c.byOrigin.user - c.byOrigin.background - c.byOrigin.tooling)
      : null,
    level, visible: level !== 'quiet',
    limitHit: c.limitHit || null, liftsAt: c.liftsAt || null,
    liftsInMinutes: c.liftsInMin || null,
    reason: c.reason,
    policy: {
      dailyLimit: DAILY_LIMIT,
      hourlyLimit: `${HOURLY_LIMIT} per UTC clock hour, every origin — a runaway spends one hour's worth, not the day`,
      toolingAllowance: `${TOOLING_DAILY}/day for probes and audits — refused past it, never borrowed from the user budget`,
      reserve: `${RESERVE} calls held back — never spent`,
      backgroundStopsAt: `${SOFT_STOP * 100}% (background and tooling) so user requests keep working`,
      warnsFrom: `${WARN_AT * 100}%`,
      visibleInAppFrom: `${VISIBLE_FROM * 100}% of the day or of the hour`,
      resets: 'UTC midnight (daily and tooling), each UTC hour (hourly)',
      authority: "eBay's own X-eBay-C-RateLimit headers override the local daily count"
    }
  };
}

module.exports = {
  check, record, status, fetchRateLimits, normOrigin, levelOf,
  DAILY_LIMIT, RESERVE, WARN_AT, SOFT_STOP, HOURLY_LIMIT, TOOLING_DAILY,
  VISIBLE_FROM, ORIGINS, windowKey, msUntilReset, hourKey, msUntilHourReset
};
