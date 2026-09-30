// ══════════════════════════════════════════════════════════════
// ebaycall.js — the ONLY way this codebase talks to eBay
//
// ebayquota.js answers "may we spend a call?". This answers everything
// else that can go wrong while making one: concurrency, pacing, a 429,
// a flaky 5xx, a kill switch, and leaving a record of what was sent.
//
// Standalone on purpose. server.js is deployed and ingest.js has lost
// whole subsystems to a downloaded file landing on local work — twice,
// with the version banner still matching. Logic that lives here cannot
// be taken by either.
//
//   const ebay = require('./ebaycall');
//   const r = await ebay.fetchEbay(db, {
//     url, token, kind: 'search', background: false,
//     meta: { cardId, grade, query }, countFrom: d => (d.itemSummaries||[]).length
//   });
//   if (!r.ok) return { status: r.status503 || 'error', reason: r.reason };
//
// ── Why the quota check is INSIDE the queue ──
// Checking before joining the queue is the classic time-of-check bug:
// three jobs at 99 remaining each check, each sees "allowed", and all
// three then spend. The check has to happen at the moment of spending,
// which means after acquiring the lock, not before.
// ══════════════════════════════════════════════════════════════

'use strict';

const quota = require('./ebayquota');
const { AsyncLocalStorage } = require('async_hooks');
// ?debug=1 only; every call below is a no-op outside a debug request.
const timing = require('./timing');

// Minimum spacing between two eBay calls. eBay publishes a daily figure
// for Browse but no per-second one, so this is deliberately conservative:
// discovering the real limit by being throttled is the outcome we are
// paying 200ms to avoid.
const MIN_INTERVAL_MS = 200;

// 5xx is usually transient. Two retries, then report — a loop that keeps
// retrying a persistent fault spends the daily quota on an outage.
const MAX_5XX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;

// ── Kill switch ───────────────────────────────────────────────
// Read at CALL time, never captured at module load. A credential
// captured at import is exactly how /ebay/status and /api/listings came
// to disagree in one process; the same applies to a switch that has to
// work at 2am without a code change.
//
// Default ON: absent means enabled, so a missing variable never silently
// disables a working integration. Only an explicit false disables.
function ebayEnabled() {
  const v = process.env.EBAY_ENABLED;
  if (v === undefined || v === null || v === '') return true;
  return !/^(false|0|no|off)$/i.test(String(v).trim());
}

// ── Two lanes, a few slots (TASK T1, 2026-09-30) ──────────────
// This was ONE call at a time, process-wide. Right while a card view cost
// 1-3 calls; once a view paged 8 marketplaces to exhaustion, one Charizard
// held the lane for 40+ paced calls, background paging shared it, and a
// user's request sat 75,038ms in the queue and returned zero listings with
// `calls: 0` — quota fine, eBay never asked. Completeness plus a single
// lane is starvation.
//
// eBay's limit is per DAY, not per concurrent request, and each marketplace
// is its own endpoint. So:
//   - MAX_CONCURRENT slots in total;
//   - background may hold at most MAX_BACKGROUND of them, so a foreground
//     call always has a free slot unless other FOREGROUND calls fill them;
//   - a free slot goes to the foreground queue first, always;
//   - a foreground call waits at most FOREGROUND_MAX_WAIT_MS for a slot and
//     is then refused as `busy` — never sent, never a silent empty list;
//   - pacing is per endpoint (marketplace, or the token host): 200ms
//     between call STARTS on one endpoint, reserved at acquisition so two
//     slots cannot both start on the same site at once.
function envInt(name, dflt, min, max) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : dflt;
}
const MAX_CONCURRENT = envInt('EBAY_CONCURRENCY', 5, 1, 8);
const MAX_BACKGROUND = Math.min(envInt('EBAY_BACKGROUND_SLOTS', 2, 1, 8), Math.max(1, MAX_CONCURRENT - 1));
const FOREGROUND_MAX_WAIT_MS = 4000;

const lanes = { fg: [], bg: [] };
const running = { fg: 0, bg: 0 };
const nextStartAt = new Map();          // endpoint -> earliest next start (ms)

function pump() {
  while (running.fg + running.bg < MAX_CONCURRENT) {
    let lane = null;
    if (lanes.fg.length) lane = 'fg';
    else if (lanes.bg.length && running.bg < MAX_BACKGROUND) lane = 'bg';
    if (!lane) return;
    const w = lanes[lane].shift();
    if (w.timer) clearTimeout(w.timer);
    running[lane]++;
    w.resolve(lane);
  }
}
function release(lane) { running[lane]--; pump(); }

// Resolves to the lane once a slot is held, or null if maxWaitMs passed first
// (the waiter is removed from the queue: nothing is sent later behind the
// caller's back).
function acquire(background, maxWaitMs) {
  const lane = background ? 'bg' : 'fg';
  return new Promise(resolve => {
    const w = { resolve };
    lanes[lane].push(w);
    if (Number.isFinite(maxWaitMs)) {
      w.timer = setTimeout(() => {
        const i = lanes[lane].indexOf(w);
        if (i >= 0) { lanes[lane].splice(i, 1); resolve(null); }
      }, Math.max(0, maxWaitMs));
    }
    pump();
  });
}

// Reserve this endpoint's next start time and return how long to wait.
function paceDelay(endpoint) {
  const now = Date.now();
  const at = Math.max(now, nextStartAt.get(endpoint) || 0);
  nextStartAt.set(endpoint, at + MIN_INTERVAL_MS);
  return at - now;
}

function queueState() {
  return { maxConcurrent: MAX_CONCURRENT, maxBackground: MAX_BACKGROUND,
           foregroundMaxWaitMs: FOREGROUND_MAX_WAIT_MS,
           running: { foreground: running.fg, background: running.bg },
           waiting: { foreground: lanes.fg.length, background: lanes.bg.length },
           reservedQuota: reserved, reservedTooling };
}

// ── Quota, still checked at the moment of spending ──
// With several slots the check can no longer rely on being alone, so it
// runs under its own short lock and counts calls already allowed but not yet
// recorded (`reserved`): three jobs at RESERVE+1 cannot all see "allowed".
let quotaLock = Promise.resolve();
let reserved = 0, reservedTooling = 0;
function quotaGate(db, background, origin) {
  const run = quotaLock.then(async () => {
    const g = await quota.check(db, { background, origin, pending: reserved,
                                      pendingTooling: reservedTooling });
    if (g.allowed) { reserved++; if (origin === 'tooling') reservedTooling++; }
    return g;
  });
  quotaLock = run.then(() => {}, () => {});
  return run;
}
function unreserve(origin) {
  if (reserved > 0) reserved--;
  if (origin === 'tooling' && reservedTooling > 0) reservedTooling--;
}

// ── Who is spending (TASK T2, 2026-09-30) ─────────────────────
// Every call is user, background or tooling; ebayquota counts and caps them
// apart. An explicit `origin` wins. Otherwise the REQUEST that caused the
// call decides — server.js runs each request inside withOrigin(): /api/ebay/*
// probes, and anything sent `X-CardHunt-Origin: tooling`, are tooling — so a
// probe's token exchange and every page it fetches are tooling without each
// of twenty call sites having to remember to say so. Outside any request,
// `background` decides, as before.
const originCtx = new AsyncLocalStorage();
function withOrigin(origin, fn) { return originCtx.run({ origin }, fn); }
function currentOrigin() { const s = originCtx.getStore(); return s ? s.origin : null; }
// Only a TOOLING context overrides the call's own background flag: a
// background:true call made while serving a user request is still
// background work, and must still yield at the soft stop.
function originFor(opts) {
  opts = opts || {};
  if (quota.ORIGINS.indexOf(opts.origin) >= 0) return opts.origin;
  if (currentOrigin() === 'tooling') return 'tooling';
  return opts.background ? 'background' : 'user';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 429 circuit breaker ───────────────────────────────────────
// A 429 means we are already over something eBay counts. Retrying inside
// the same run is how a soft throttle becomes a suspended keyset, so the
// whole process stops calling until the window resets.
let tripped = null;   // { until: Date, reason: string }

function breakerState() {
  if (!tripped) return null;
  if (tripped.until && Date.now() >= tripped.until.getTime()) { tripped = null; return null; }
  return tripped;
}
function tripBreaker(reason, until) { tripped = { reason, until: until || null }; }
function resetBreaker() { tripped = null; }          // tests and manual recovery

// ── Logging ───────────────────────────────────────────────────
// One line per call. "What was actually sent" is the first question every
// time something behaves oddly, and nothing recorded it before.
function logCall(o) {
  const bits = [
    '[ebay]',
    (o.kind || 'search').padEnd(6),
    o.cardId ? String(o.cardId).padEnd(18) : '-'.padEnd(18),
    o.grade ? String(o.grade).padEnd(8) : '-'.padEnd(8),
    o.origin && o.origin !== 'user' ? '[' + o.origin + ']' : '',
    'status=' + (o.status === undefined ? '-' : o.status),
    'n=' + (o.count === undefined || o.count === null ? '-' : o.count),
    'left=' + (o.remaining === undefined || o.remaining === null ? '?' : o.remaining),
    o.ms !== undefined ? o.ms + 'ms' : '',
    o.note ? '(' + o.note + ')' : '',
    o.query ? 'q=' + JSON.stringify(String(o.query).slice(0, 80)) : ''
  ].filter(Boolean);
  console.log(bits.join(' '));
}

// Headers minus the bearer token, for dry runs and logs. The token is a
// live credential; it must never reach a response body or a log line.
function redactHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    out[k] = /^authorization$/i.test(k) ? '<redacted>' : v;
  }
  return out;
}

/**
 * Make one eBay call, guarded.
 *
 * Returns, in every case, an object that SAYS WHAT HAPPENED — never a
 * bare null and never an empty list that reads as "no stock":
 *
 *   { ok:true,  data, status, remaining }
 *   { ok:false, blocked:'disabled'  , reason }   kill switch
 *   { ok:false, blocked:'quota'     , reason, limitHit, liftsAt, remaining, resetsInMinutes }
 *   { ok:false, blocked:'rate-limit', reason }   429 breaker open
 *   { ok:false, error:true, status, reason }     HTTP or network failure
 *   { ok:true,  dryRun:true, request }           nothing was sent
 */
async function fetchEbay(db, opts) {
  opts = opts || {};
  const { url, token, kind = 'search', background = false, dryRun = false,
          countFrom, fetchImpl, method = 'GET', body = null,
          basic = null } = opts;
  const origin = originFor(opts);
  const meta = Object.assign({}, opts.meta || {}, { origin });
  // The token exchange is a POST with HTTP Basic and a form body; searches
  // are GETs with a bearer. Both must pass through here or token calls go
  // uncounted — which is precisely how the expires_in bug spent the daily
  // quota on authentication and left no trace.
  const headers = Object.assign(
    kind === 'token' ? {} : { 'X-EBAY-C-MARKETPLACE-ID': meta.marketplace || 'EBAY_US' },
    opts.headers || {},
    token ? { Authorization: 'Bearer ' + token } : {},
    basic ? { Authorization: 'Basic ' + basic } : {}
  );

  // ── kill switch, before anything else ──
  if (!ebayEnabled()) {
    const reason = 'EBAY_ENABLED=false — all eBay calls are switched off';
    logCall({ ...meta, kind, status: 'off', note: 'kill switch' });
    return { ok: false, blocked: 'disabled', reason };
  }

  // ── dry run: return exactly what WOULD be sent, spend nothing ──
  if (dryRun) {
    return {
      ok: true, dryRun: true,
      request: { method, url, headers: redactHeaders(headers),
                 body: body === null ? null : String(body) },
      meta: { ...meta, kind, background }
    };
  }

  const br = breakerState();
  if (br) {
    logCall({ ...meta, kind, status: '429-open', note: 'breaker' });
    return { ok: false, blocked: 'rate-limit', reason: br.reason };
  }

  // A slot, foreground first. A foreground call that cannot get one within
  // FOREGROUND_MAX_WAIT_MS is refused as `busy` rather than left queued.
  const tQueued = timing.now();
  const waitFrom = Date.now();
  const maxWait = opts.maxWaitMs !== undefined ? opts.maxWaitMs
    : (background ? Infinity : FOREGROUND_MAX_WAIT_MS);
  const lane = await acquire(background, maxWait);
  timing.span('ebay:queue-wait', tQueued, timing.now(), { kind });
  if (!lane) {
    const waited = Date.now() - waitFrom;
    logCall({ ...meta, kind, status: 'busy', note: `no slot in ${waited}ms — not sent` });
    return { ok: false, blocked: 'busy', waitedMs: waited,
             reason: `eBay queue busy — waited ${waited}ms for a free slot (${running.fg} foreground, `
               + `${running.bg} background in flight); not sent, no quota spent` };
  }
  try { return await sendOne(); } finally { release(lane); }

  async function sendOne() {
    // Re-check the breaker once a slot is held: a call ahead of us may
    // have tripped it while we waited.
    const b2 = breakerState();
    if (b2) return { ok: false, blocked: 'rate-limit', reason: b2.reason };

    // THE quota check, at the moment of spending, counting calls already
    // allowed and not yet recorded, so two callers cannot both see the same
    // "allowed" for the same last remaining call.
    const gate = await timing.time('ebay:quota-check', () => quotaGate(db, background, origin), { kind });
    if (!gate.allowed) {
      logCall({ ...meta, kind, status: 'quota', remaining: gate.remaining,
                note: 'gate refused: ' + (gate.limitHit || '?') });
      // resetsInMinutes is when THIS refusal lifts — the hour for the
      // hourly ceiling, midnight for the rest.
      const lifts = gate.liftsInMin != null ? gate.liftsInMin : gate.resetsInMin;
      return { ok: false, blocked: 'quota', reason: gate.reason, origin,
               limitHit: gate.limitHit || null, liftsAt: gate.liftsAt || null,
               remaining: gate.remaining, resetsInMinutes: lifts };
    }
    let unreserved = false;
    const done = () => { if (!unreserved) { unreserved = true; unreserve(origin); } };
    try { return await spend(); } finally { done(); }

  async function spend() {
    // Pace, per endpoint.
    const wait = paceDelay(kind === 'token' ? 'token' : (meta.marketplace || 'EBAY_US'));
    if (wait > 0) await timing.time('ebay:pace', () => sleep(wait));

    const doFetch = fetchImpl || fetch;
    let attempt = 0;

    for (;;) {
      const t0 = Date.now();
      const tHttp = timing.now();
      let r;
      try {
        r = await doFetch(url, body === null ? { method, headers } : { method, headers, body });
      } catch (e) {
        // A network failure never reached eBay, so it spends no quota and
        // is not recorded as a call.
        logCall({ ...meta, kind, status: 'net', note: e.message, ms: Date.now() - t0 });
        return { ok: false, error: true, transport: true,
                 reason: 'could not reach api.ebay.com: ' + e.message };
      }
      const ms = Date.now() - t0;

      // The call happened, so it counts — whatever the status.
      await timing.time('ebay:quota-record', () => quota.record(db, { headers: r.headers, kind, origin }), { kind });
      done();            // recorded: the table carries it now, not the reservation

      const remaining = headerInt(r.headers, 'x-ebay-c-ratelimit-remaining');

      // ── 429: stop, do not retry in this run ──
      if (r.status === 429) {
        const resetRaw = headerStr(r.headers, 'x-ebay-c-ratelimit-reset');
        const until = resetRaw && !isNaN(new Date(resetRaw)) ? new Date(resetRaw) : null;
        const reason = 'eBay returned 429 — rate limited. '
          + (remaining !== null ? `${remaining} reported remaining. ` : '')
          + (until ? `Not calling again until ${until.toISOString()}.`
                   : 'Not calling again in this run.');
        tripBreaker(reason, until);
        logCall({ ...meta, kind, status: 429, remaining, ms, note: 'BREAKER TRIPPED' });
        return { ok: false, blocked: 'rate-limit', reason, remaining };
      }

      // ── 5xx: two retries, then give up ──
      if (r.status >= 500 && attempt < MAX_5XX_RETRIES) {
        attempt++;
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        logCall({ ...meta, kind, status: r.status, remaining, ms,
                  note: `5xx retry ${attempt}/${MAX_5XX_RETRIES} in ${wait}ms` });
        await sleep(wait);
        continue;
      }

      // NOT `body` — that is the request body destructured from opts above,
      // and a `const body` here puts it in a temporal dead zone for this
      // whole block, so the doFetch call above throws
      // "Cannot access 'body' before initialization" on every single call.
      // The unit tests missed it because they were written before POST
      // support existed and were not re-run after; a live stub found it
      // immediately.
      const responseText = await r.text().catch(() => '');
      timing.span('ebay:http', tHttp, timing.now(), { kind, status: r.status });
      let data = null;
      try { data = responseText ? JSON.parse(responseText) : null; } catch (e) { /* not json */ }

      if (!r.ok) {
        const detail = shortDetail(data, responseText);
        logCall({ ...meta, kind, status: r.status, remaining, ms,
                  note: attempt ? `gave up after ${attempt} retries` : detail });
        return { ok: false, error: true, status: r.status, remaining,
                 reason: `eBay returned HTTP ${r.status}${detail ? ' — ' + detail : ''}` };
      }

      let count = null;
      if (typeof countFrom === 'function') { try { count = countFrom(data); } catch (e) {} }
      logCall({ ...meta, kind, status: r.status, count, remaining, ms });
      // `nonJson` lets a caller distinguish "eBay sent something unparseable"
      // from "eBay sent valid JSON that lacked the field I wanted". Collapsing
      // the two costs a real diagnosis: a proxy returning an HTML error page
      // and eBay returning {} are different problems.
      return { ok: true, status: r.status, data, remaining, headers: r.headers,
               nonJson: data === null && !!responseText };
    }
  }
  }
}

function headerStr(h, n) {
  if (!h) return null;
  return (typeof h.get === 'function' ? h.get(n) : h[n]) ?? null;
}
function headerInt(h, n) {
  const v = headerStr(h, n);
  const i = v === null ? NaN : parseInt(v, 10);
  return isNaN(i) ? null : i;
}
// eBay speaks two error dialects and both must be readable, or a caller is
// left dumping raw JSON at the user:
//   Browse : {"errors":[{"errorId":1001,"message":"..."}]}
//   OAuth  : {"error":"invalid_client","error_description":"..."}
// The OAuth shape is the one that matters most — it is what a wrong keyset
// returns, and "invalid_client: client authentication failed" is the single
// most useful string in this whole integration.
function shortDetail(data, body) {
  if (data && (data.errors || [])[0]) {
    const e = data.errors[0];
    return [e.errorId, e.message].filter(Boolean).join(': ').slice(0, 160);
  }
  if (data && (data.error || data.error_description)) {
    return [data.error, data.error_description].filter(Boolean).join(': ').slice(0, 160);
  }
  return String(body || '').slice(0, 160);
}

module.exports = {
  fetchEbay, ebayEnabled, logCall, redactHeaders,
  withOrigin, currentOrigin, originFor,
  breakerState, tripBreaker, resetBreaker,
  MIN_INTERVAL_MS, MAX_5XX_RETRIES,
  MAX_CONCURRENT, MAX_BACKGROUND, FOREGROUND_MAX_WAIT_MS, queueState,
  // test seam
  _resetPacing: () => { nextStartAt.clear(); }
};
