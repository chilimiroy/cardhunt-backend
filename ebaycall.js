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

// ── Serialisation ─────────────────────────────────────────────
// One eBay call at a time, process-wide. `refresh`, a user request and a
// manual probe can otherwise overlap freely.
let chain = Promise.resolve();
let lastCallAt = 0;

function enqueue(task) {
  const run = chain.then(task, task);       // a rejection must not break the chain
  chain = run.then(() => {}, () => {});
  return run;
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
 *   { ok:false, blocked:'quota'     , reason, remaining, resetsInMinutes }
 *   { ok:false, blocked:'rate-limit', reason }   429 breaker open
 *   { ok:false, error:true, status, reason }     HTTP or network failure
 *   { ok:true,  dryRun:true, request }           nothing was sent
 */
async function fetchEbay(db, opts) {
  opts = opts || {};
  const { url, token, kind = 'search', background = false, dryRun = false,
          meta = {}, countFrom, fetchImpl, method = 'GET', body = null,
          basic = null } = opts;
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

  // Everything below happens one at a time, process-wide.
  return enqueue(async () => {
    // Re-check the breaker inside the lock: a call ahead of us in the
    // queue may have tripped it while we waited.
    const b2 = breakerState();
    if (b2) return { ok: false, blocked: 'rate-limit', reason: b2.reason };

    // THE quota check. Inside the lock, so two callers cannot both see
    // the same "allowed" for the same last remaining call.
    const gate = await quota.check(db, { background });
    if (!gate.allowed) {
      logCall({ ...meta, kind, status: 'quota', remaining: gate.remaining,
                note: 'gate refused' });
      return { ok: false, blocked: 'quota', reason: gate.reason,
               remaining: gate.remaining, resetsInMinutes: gate.resetsInMin };
    }

    // Pace. Measured from the last call actually made.
    const since = Date.now() - lastCallAt;
    if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);

    const doFetch = fetchImpl || fetch;
    let attempt = 0;

    for (;;) {
      const t0 = Date.now();
      let r;
      try {
        r = await doFetch(url, body === null ? { method, headers } : { method, headers, body });
      } catch (e) {
        lastCallAt = Date.now();
        // A network failure never reached eBay, so it spends no quota and
        // is not recorded as a call.
        logCall({ ...meta, kind, status: 'net', note: e.message, ms: Date.now() - t0 });
        return { ok: false, error: true, transport: true,
                 reason: 'could not reach api.ebay.com: ' + e.message };
      }
      lastCallAt = Date.now();
      const ms = lastCallAt - t0;

      // The call happened, so it counts — whatever the status.
      await quota.record(db, { headers: r.headers, kind });

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
  });
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
  breakerState, tripBreaker, resetBreaker,
  MIN_INTERVAL_MS, MAX_5XX_RETRIES,
  // test seam
  _resetPacing: () => { lastCallAt = 0; }
};
