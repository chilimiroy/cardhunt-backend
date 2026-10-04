// ══════════════════════════════════════════════════════════════
// ebaycall.test.js — node ebaycall.test.js
//
// The guards around every eBay call: kill switch, serialisation,
// pacing, quota-inside-the-lock, 429 breaker, 5xx backoff, dry run,
// logging, token redaction.
//
// "A guard that has never fired is indistinguishable from one that
// cannot." Every guard here is TRIPPED, not merely present — and the
// allow cases are asserted just as hard, because a gate tested only on
// refusals passes by refusing everything. That is the failure that let
// looksLikeJunk destroy ~80 valid prices per set.
//
// Standalone: server.js is deployed, and logic inside a replaced file
// vanishes exactly when it is needed.
// ══════════════════════════════════════════════════════════════

'use strict';

const ebay = require('./ebaycall');
const quota = require('./ebayquota');
// One-day lifts (TOOLING_OVERRIDES, HOURLY_OVERRIDES) are keyed on the real
// UTC day; the suite tests the standing limits, so clear them here.
for (const o of [quota.TOOLING_OVERRIDES, quota.HOURLY_OVERRIDES]) for (const k in o || {}) delete o[k];

let pass = 0, fail = 0;
const failures = [];
function chk(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); return true; }
  fail++; failures.push(label + (detail ? '\n        ' + detail : ''));
  console.log('  FAIL  ' + label);
  return false;
}

// ── fakes ─────────────────────────────────────────────────────
const QUOTA_ROW = { calls_made: 0, token_calls: 0, ebay_limit: null,
                    ebay_remaining: null, ebay_reset: null };

function fakeDb(row) {
  const r = Object.assign({}, QUOTA_ROW, row || {});
  return { query: async (sql) => {
    if (/CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO ebay_quota/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [r] };
    return { rows: [] };
  }};
}

function resp(status, body, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers || {},
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body || {}))
  };
}

// Capture the module's own "[ebay] ..." lines so they do not bury the
// assertions, while letting PASS/FAIL through.
//
// The first version captured EVERYTHING, which hid every assertion inside
// these blocks — whole sections printed empty and read as skipped — and
// fed the captured PASS lines back into the logging test's buffer, so it
// was asserting against its own output. A test harness that cannot show
// what ran has the same defect as a guard that never fires.
function quiet(fn) {
  const orig = console.log, warn = console.warn;
  const lines = [];
  console.log = (...a) => {
    const s = a.join(' ');
    if (s.startsWith('[ebay]')) lines.push(s); else orig(s);
  };
  console.warn = () => {};
  return Promise.resolve(fn(lines)).finally(() => { console.log = orig; console.warn = warn; });
}

function withEnv(k, v, fn) {
  const old = process.env[k];
  if (v === null) delete process.env[k]; else process.env[k] = v;
  return Promise.resolve(fn()).finally(() => {
    if (old === undefined) delete process.env[k]; else process.env[k] = old;
  });
}

const URL_ = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=test';

(async () => {

// ══════════════════════════════════════════════════════════════
console.log('\nWHAT IT ALLOWS  (the half that proves it is not just refusing)\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'TOK', kind: 'search',
    fetchImpl: async () => resp(200, { itemSummaries: [{ title: 'a' }, { title: 'b' }] },
                                { 'x-ebay-c-ratelimit-remaining': '4321' }),
    countFrom: d => (d.itemSummaries || []).length
  });
  chk('a normal call succeeds', r.ok === true);
  chk('  it returns parsed data', !!(r.data && r.data.itemSummaries.length === 2));
  chk('  it reports remaining from eBay headers', r.remaining === 4321);
  chk('  it is not marked blocked', !r.blocked);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb({ calls_made: Math.floor(quota.DAILY_LIMIT * 0.5) }), {
    url: URL_, token: 'TOK', background: true,
    fetchImpl: async () => resp(200, { itemSummaries: [] })
  });
  chk('a BACKGROUND call at half quota is allowed', r.ok === true);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb({ calls_made: quota.DAILY_LIMIT - quota.RESERVE - 300 }), {
    url: URL_, token: 'TOK', background: false,
    fetchImpl: async () => resp(200, {})
  });
  chk('a USER call just above the reserve is allowed', r.ok === true);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'TOK', kind: 'token',
    fetchImpl: async () => resp(200, { access_token: 'x', expires_in: 7200 })
  });
  chk('a TOKEN exchange is allowed and goes through the same path', r.ok === true);
});

// ══════════════════════════════════════════════════════════════
console.log('\nKILL SWITCH\n');
// ══════════════════════════════════════════════════════════════
for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
  await withEnv('EBAY_ENABLED', v, () => quiet(async () => {
    let called = false;
    const r = await ebay.fetchEbay(fakeDb(), {
      url: URL_, token: 'TOK',
      fetchImpl: async () => { called = true; return resp(200, {}); }
    });
    chk(`EBAY_ENABLED=${v} blocks the call`, r.blocked === 'disabled');
    chk(`  and eBay was never contacted`, called === false);
  }));
}
await withEnv('EBAY_ENABLED', 'true', () => quiet(async () => {
  ebay.resetBreaker(); ebay._resetPacing();
  const r = await ebay.fetchEbay(fakeDb(), { url: URL_, token: 'T',
    fetchImpl: async () => resp(200, {}) });
  chk('EBAY_ENABLED=true ALLOWS the call', r.ok === true);
}));
await withEnv('EBAY_ENABLED', null, () => quiet(async () => {
  ebay.resetBreaker(); ebay._resetPacing();
  const r = await ebay.fetchEbay(fakeDb(), { url: URL_, token: 'T',
    fetchImpl: async () => resp(200, {}) });
  chk('an ABSENT EBAY_ENABLED allows calls — a missing var never disables silently',
      r.ok === true);
}));
chk('ebayEnabled() is read live, not captured at import',
    (() => { process.env.EBAY_ENABLED = 'false'; const a = ebay.ebayEnabled();
             delete process.env.EBAY_ENABLED; const b = ebay.ebayEnabled();
             return a === false && b === true; })());

// ══════════════════════════════════════════════════════════════
console.log('\nQUOTA IS CHECKED INSIDE THE LOCK\n');
// ══════════════════════════════════════════════════════════════
// The bug this prevents: three jobs at 99 remaining each check before
// joining the queue, all three see "allowed", all three spend.
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const db = fakeDb({ calls_made: quota.DAILY_LIMIT - quota.RESERVE });   // at the reserve
  let calls = 0;
  const rs = await Promise.all([1, 2, 3].map(() => ebay.fetchEbay(db, {
    url: URL_, token: 'T',
    fetchImpl: async () => { calls++; return resp(200, {}); }
  })));
  chk('three concurrent calls at the reserve are ALL refused',
      rs.every(r => r.blocked === 'quota'), JSON.stringify(rs.map(r => r.blocked)));
  chk('  and none of them reached eBay', calls === 0, 'calls=' + calls);
  chk('  each refusal carries a reason, not an empty result',
      rs.every(r => typeof r.reason === 'string' && r.reason.length > 20));
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb({ calls_made: quota.DAILY_LIMIT - 200 }), {
    url: URL_, token: 'T', background: true,
    fetchImpl: async () => resp(200, {})
  });
  chk('background work yields at the soft stop while user requests would not',
      r.blocked === 'quota');
});

// ══════════════════════════════════════════════════════════════
console.log('\nSERIALISATION AND PACING\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let inFlight = 0, maxInFlight = 0;
  const order = [];
  const mk = (id) => ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T', meta: { cardId: 'c' + id },
    fetchImpl: async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 30));
      inFlight--; order.push(id);
      return resp(200, {});
    }
  });
  const t0 = Date.now();
  await Promise.all([mk(1), mk(2), mk(3)]);
  const took = Date.now() - t0;

  chk('one endpoint: never two calls in flight at once (paced 200ms apart)', maxInFlight === 1, 'max=' + maxInFlight);
  chk('  calls complete in submission order', order.join(',') === '1,2,3', order.join(','));
  chk(`  three calls take >= 2x${ebay.MIN_INTERVAL_MS}ms of pacing`,
      took >= ebay.MIN_INTERVAL_MS * 2, took + 'ms');
});

// ══════════════════════════════════════════════════════════════
console.log('\nSLOTS AND LANES  (TASK T1: a user sat 75s behind a background crawl)\n');
// ══════════════════════════════════════════════════════════════
const SITES = ['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES'];
function slowCall(db, o) {
  return ebay.fetchEbay(db, Object.assign({ url: URL_, token: 'T' }, o, {
    fetchImpl: async () => { o.track.now++; o.track.max = Math.max(o.track.max, o.track.now);
      await new Promise(r => setTimeout(r, o.ms || 300)); o.track.now--; o.track.done.push(o.tag);
      return resp(200, {}); } }));
}
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const track = { now: 0, max: 0, done: [] };
  const db = fakeDb();
  await Promise.all(SITES.map(mp => slowCall(db, { meta: { marketplace: mp }, track, tag: mp })));
  chk(`different marketplaces run concurrently, up to ${ebay.MAX_CONCURRENT}`,
      track.max > 1 && track.max <= ebay.MAX_CONCURRENT, 'max=' + track.max);
  chk('  concurrency is at least 4 (T1: 4-6)', ebay.MAX_CONCURRENT >= 4 && ebay.MAX_CONCURRENT <= 6,
      'MAX_CONCURRENT=' + ebay.MAX_CONCURRENT);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // A background crawl already running: 12 queued background calls.
  const bgT = { now: 0, max: 0, done: [] }, fgT = { now: 0, max: 0, done: [] };
  const db = fakeDb();
  const bg = SITES.concat(SITES.slice(0, 4)).map((mp, i) =>
    slowCall(db, { background: true, meta: { marketplace: mp }, track: bgT, tag: 'bg' + i, ms: 400 }));
  await new Promise(r => setTimeout(r, 30));
  const tFg = Date.now();
  const fg = await slowCall(db, { meta: { marketplace: 'EBAY_US' }, track: fgT, tag: 'fg', ms: 50 });
  const fgMs = Date.now() - tFg;
  chk(`background never holds more than ${ebay.MAX_BACKGROUND} slots`, bgT.max <= ebay.MAX_BACKGROUND, 'max=' + bgT.max);
  chk('  a foreground call during a crawl is served, not queued behind it', fg.ok, JSON.stringify(fg).slice(0, 120));
  chk('  and it finished before most of the crawl', bgT.done.length < 6, 'bg done first: ' + bgT.done.length);
  chk('  within ~1s (pacing on its own site only)', fgMs < 1000, fgMs + 'ms');
  const rs = await Promise.all(bg);
  chk('  the crawl still completes afterwards', rs.every(r => r.ok));
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // Foreground first: fill every slot, queue a background then a foreground;
  // the foreground must get the next free slot.
  const t = { now: 0, max: 0, done: [] };
  const db = fakeDb();
  const fill = SITES.slice(0, ebay.MAX_CONCURRENT).map(mp =>
    slowCall(db, { meta: { marketplace: mp }, track: t, tag: 'fill-' + mp, ms: 250 }));
  await new Promise(r => setTimeout(r, 20));
  const b = slowCall(db, { background: true, meta: { marketplace: 'EBAY_ES' }, track: t, tag: 'BG', ms: 50 });
  const f = slowCall(db, { meta: { marketplace: 'EBAY_IT' }, track: t, tag: 'FG', ms: 50 });
  await Promise.all(fill.concat([b, f]));
  chk('a free slot goes to the foreground queue before the background one',
      t.done.indexOf('FG') < t.done.indexOf('BG'), t.done.join(','));
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // Never wait 75 seconds: every slot busy far longer than the cap.
  const t = { now: 0, max: 0, done: [] };
  const db = fakeDb();
  let reached = 0;
  const fill = SITES.slice(0, ebay.MAX_CONCURRENT).map(mp =>
    slowCall(db, { meta: { marketplace: mp }, track: t, tag: mp, ms: 1500 }));
  await new Promise(r => setTimeout(r, 20));
  const t0 = Date.now();
  const r = await ebay.fetchEbay(db, { url: URL_, token: 'T', maxWaitMs: 300, meta: { marketplace: 'EBAY_ES' },
    fetchImpl: async () => { reached++; return resp(200, {}); } });
  const waited = Date.now() - t0;
  chk('a foreground call that cannot get a slot is refused as busy', r.blocked === 'busy', JSON.stringify(r));
  chk('  after the cap, not after the crawl', waited < 700, waited + 'ms');
  chk('  it says so, and that nothing was sent', /not sent/.test(r.reason || ''), r.reason);
  await Promise.all(fill);
  await new Promise(r => setTimeout(r, 50));
  chk('  and it is NOT sent later behind the caller\'s back', reached === 0, 'reached=' + reached);
  chk('  the default foreground cap is a few seconds', ebay.FOREGROUND_MAX_WAIT_MS >= 2000 && ebay.FOREGROUND_MAX_WAIT_MS <= 6000);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // Quota with several slots: RESERVE + 2 left, eight concurrent calls on
  // eight sites. A DB whose count really moves on record.
  const row = Object.assign({}, QUOTA_ROW, { calls_made: quota.DAILY_LIMIT - quota.RESERVE - 2 });
  const db = { query: async (sql) => {
    if (/RETURNING/i.test(sql)) { await new Promise(r => setTimeout(r, 5)); return { rows: [Object.assign({}, row)] }; }
    if (/INSERT INTO ebay_quota/i.test(sql)) { await new Promise(r => setTimeout(r, 40)); row.calls_made++; }
    return { rows: [] };
  }};
  let sent = 0;
  const rs = await Promise.all(SITES.map(mp => ebay.fetchEbay(db, { url: URL_, token: 'T', meta: { marketplace: mp },
    fetchImpl: async () => { sent++; await new Promise(r => setTimeout(r, 60)); return resp(200, {}); } })));
  chk('two calls left above the reserve: exactly two of eight concurrent calls are sent',
      sent === 2 && rs.filter(r => r.ok).length === 2, 'sent=' + sent + ' ' + rs.map(r => r.ok ? 'ok' : r.blocked).join(','));
  chk('  the rest are refused as quota, with a reason', rs.filter(r => r.blocked === 'quota').length === 6);
  chk('  no reservation leaks', ebay.queueState().reservedQuota === 0, JSON.stringify(ebay.queueState()));
});

// ══════════════════════════════════════════════════════════════
console.log('\n429 STOPS THE JOB AND DOES NOT RETRY\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let calls = 0;
  const future = new Date(Date.now() + 3600e3).toISOString();
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T',
    fetchImpl: async () => { calls++; return resp(429, { errors: [{ message: 'too many' }] },
      { 'x-ebay-c-ratelimit-remaining': '0', 'x-ebay-c-ratelimit-reset': future }); }
  });
  chk('a 429 is reported as rate-limit, not a generic error', r.blocked === 'rate-limit');
  chk('  it is NOT retried inside the run', calls === 1, 'calls=' + calls);
  chk('  the reason carries eBay\'s remaining count', /0 reported remaining/.test(r.reason || ''),
      r.reason);
  chk('  the breaker is now open', !!ebay.breakerState());

  // A second call must be refused without touching the network.
  let calls2 = 0;
  const r2 = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T', fetchImpl: async () => { calls2++; return resp(200, {}); }
  });
  chk('  a subsequent call is refused while the breaker is open',
      r2.blocked === 'rate-limit');
  chk('  and it never reached eBay', calls2 === 0);
});
chk('the breaker can be reset once the window passes',
    (() => { ebay.resetBreaker(); return ebay.breakerState() === null; })());

// ══════════════════════════════════════════════════════════════
console.log('\n5xx RETRIES TWICE, THEN GIVES UP\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let calls = 0;
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T',
    fetchImpl: async () => { calls++; return resp(503, 'upstream down'); }
  });
  chk('a persistent 5xx gives up rather than looping',
      r.ok === false && r.error === true);
  chk(`  it tried exactly ${ebay.MAX_5XX_RETRIES + 1} times`,
      calls === ebay.MAX_5XX_RETRIES + 1, 'calls=' + calls);
  chk('  and reports the status', /503/.test(r.reason || ''), r.reason);
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let calls = 0;
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T',
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? resp(500, 'blip') : resp(200, { itemSummaries: [{ t: 1 }] });
    }
  });
  chk('a TRANSIENT 5xx recovers on retry — the retry actually works', r.ok === true);
  chk('  it stopped as soon as it succeeded', calls === 2, 'calls=' + calls);
});

// ══════════════════════════════════════════════════════════════
console.log('\nNETWORK FAILURE\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T',
    fetchImpl: async () => { throw new Error('ENOTFOUND api.ebay.com'); }
  });
  chk('an unreachable host is an error, not "no results"', r.ok === false && r.error === true);
  chk('  and names the cause', /ENOTFOUND/.test(r.reason || ''), r.reason);
});

// ══════════════════════════════════════════════════════════════
console.log('\nPOST WITH A BODY  (the token-exchange shape)\n');
// ══════════════════════════════════════════════════════════════
// Regression: `const body = await r.text()` inside the retry loop put the
// destructured request `body` into a temporal dead zone, so EVERY call —
// including every token exchange — threw "Cannot access 'body' before
// initialization" and was reported as an unreachable host. The unit tests
// were written before POST support and were not re-run after it landed; a
// live stub found it in one call. Hence this test.
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let seen = null;
  const r = await ebay.fetchEbay(fakeDb(), {
    url: 'https://api.ebay.com/identity/v1/oauth2/token',
    method: 'POST',
    basic: 'YWJjOmRlZg==',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    kind: 'token',
    fetchImpl: async (url, init) => { seen = init; return resp(200, { access_token: 'TOK', expires_in: 7200 }); }
  });
  chk('a POST with a body succeeds', r.ok === true, JSON.stringify(r));
  chk('  the body is actually sent', /grant_type=client_credentials/.test(seen && seen.body || ''));
  chk('  the method is POST', seen && seen.method === 'POST');
  chk('  Basic auth is used, not Bearer', /^Basic /.test(seen.headers.Authorization || ''));
  chk('  the token exchange sends no marketplace header',
      !seen.headers['X-EBAY-C-MARKETPLACE-ID']);
  chk('  the access token is parsed out', r.data && r.data.access_token === 'TOK');
});

ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  const r = await ebay.fetchEbay(fakeDb(), {
    url: 'https://api.ebay.com/identity/v1/oauth2/token', method: 'POST',
    basic: 'x', body: 'grant_type=client_credentials', kind: 'token', dryRun: true,
    fetchImpl: async () => resp(200, {})
  });
  chk('a dry-run POST shows the body it would send',
      /grant_type=client_credentials/.test(r.request.body || ''));
  chk('  and still redacts the credential', r.request.headers.Authorization === '<redacted>');
});

// A GET must keep sending no body at all.
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let seen = null;
  await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T',
    fetchImpl: async (url, init) => { seen = init; return resp(200, {}); }
  });
  chk('a GET sends no body', seen && !('body' in seen), JSON.stringify(seen && Object.keys(seen)));
  chk('  and defaults to GET', seen.method === 'GET');
});

// ══════════════════════════════════════════════════════════════
console.log('\nDRY RUN SPENDS NOTHING\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let called = false;
  const r = await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'SECRET-TOKEN', dryRun: true,
    meta: { cardId: 'en-swsh3.5-74', grade: 'PSA 10' },
    fetchImpl: async () => { called = true; return resp(200, {}); }
  });
  chk('dryRun returns the request', r.dryRun === true && !!r.request);
  chk('  it never calls eBay', called === false);
  chk('  the URL is exactly what would be sent', r.request.url === URL_);
  chk('  the token is REDACTED', r.request.headers.Authorization === '<redacted>');
  chk('  no header leaks the secret',
      !JSON.stringify(r.request.headers).includes('SECRET-TOKEN'));
  chk('  the marketplace header is shown', !!r.request.headers['X-EBAY-C-MARKETPLACE-ID']);
});

// ══════════════════════════════════════════════════════════════
console.log('\nEVERY CALL IS LOGGED\n');
// ══════════════════════════════════════════════════════════════
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async (lines) => {
  await ebay.fetchEbay(fakeDb(), {
    url: URL_, token: 'T', kind: 'search',
    meta: { cardId: 'en-swsh3.5-74', grade: 'PSA 10', query: 'Charizard VMAX 74 PSA 10' },
    fetchImpl: async () => resp(200, { itemSummaries: [{ a: 1 }, { a: 2 }, { a: 3 }] },
                                { 'x-ebay-c-ratelimit-remaining': '4990' }),
    countFrom: d => (d.itemSummaries || []).length
  });
  const line = lines.find(l => l.startsWith('[ebay]')) || '';
  chk('one [ebay] line is emitted', !!line, JSON.stringify(lines));
  chk('  it names the card', line.includes('en-swsh3.5-74'), line);
  chk('  it names the grade', line.includes('PSA 10'), line);
  chk('  it records the HTTP status', /status=200/.test(line), line);
  chk('  it records the result count', /n=3/.test(line), line);
  chk('  it records remaining quota', /left=4990/.test(line), line);
  chk('  it records the query sent', line.includes('Charizard VMAX 74 PSA 10'), line);
  chk('  it does NOT leak the token', !line.includes('Bearer') && !/\bT\b(?!CG)/.test(line.replace(/q=.*/, '')), line);
});

// ══════════════════════════════════════════════════════════════
console.log('\nREDACTION\n');
// ══════════════════════════════════════════════════════════════
{
  const h = ebay.redactHeaders({ Authorization: 'Bearer abc123', 'X-Other': 'keep' });
  chk('Authorization is redacted', h.Authorization === '<redacted>');
  chk('  other headers survive', h['X-Other'] === 'keep');
  const h2 = ebay.redactHeaders({ authorization: 'Bearer abc123' });
  chk('  lowercase authorization is redacted too', h2.authorization === '<redacted>');
}

// ══════════════════════════════════════════════════════════════
console.log('\nHOURLY CEILING AND TOOLING ALLOWANCE, THROUGH fetchEbay (T1/T2)\n');
// ══════════════════════════════════════════════════════════════
// The day row and the hour row separately, and a log of what was recorded.
function splitDb(day, hour) {
  const writes = [];
  return { writes, query: async (sql) => {
    if (/CREATE TABLE|ALTER TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO ebay_quota_hour/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [hour || { calls: 0 }] };
    if (/INSERT INTO ebay_quota\b/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [Object.assign({}, QUOTA_ROW, day || {})] };
    if (/INSERT INTO/i.test(sql)) writes.push(sql);
    return { rows: [] };
  }};
}
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let calls = 0;
  const r = await ebay.fetchEbay(splitDb({ calls_made: 50 }, { calls: quota.HOURLY_LIMIT }), {
    url: URL_, token: 'T', fetchImpl: async () => { calls++; return resp(200, {}); } });
  chk('hourly ceiling reached — a USER call is refused', r.blocked === 'quota', JSON.stringify(r));
  chk('  and never reached eBay', calls === 0);
  chk('  limitHit says hourly', r.limitHit === 'hourly', r.limitHit);
  chk('  resetsInMinutes is the HOUR, not midnight', r.resetsInMinutes <= 60, r.resetsInMinutes);
  chk('  liftsAt given', /Z$/.test(r.liftsAt || ''), r.liftsAt);
});
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  let calls = 0;
  const db = splitDb({ calls_made: 500, tooling_calls: quota.toolingAllowance() });
  const t = await ebay.fetchEbay(db, { url: URL_, token: 'T', origin: 'tooling',
    fetchImpl: async () => { calls++; return resp(200, {}); } });
  chk('tooling past its allowance — refused', t.blocked === 'quota' && t.limitHit === 'tooling', JSON.stringify(t));
  chk('  and never reached eBay (it stops, it does not borrow)', calls === 0);
  const u = await ebay.fetchEbay(db, { url: URL_, token: 'T',
    fetchImpl: async () => { calls++; return resp(200, {}); } });
  chk('the same moment, a user call goes through', u.ok && calls === 1, JSON.stringify(u).slice(0, 120));
});
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // Request-scoped origin: a probe route's calls are tooling without saying so.
  const db = splitDb({ calls_made: 500, tooling_calls: quota.toolingAllowance() });
  let calls = 0;
  const r = await ebay.withOrigin('tooling', () => ebay.fetchEbay(db, { url: URL_, token: 'T',
    fetchImpl: async () => { calls++; return resp(200, {}); } }));
  chk('inside withOrigin("tooling") an untagged call IS tooling', r.limitHit === 'tooling' && calls === 0, JSON.stringify(r));
  const k = await ebay.withOrigin('tooling', () => ebay.fetchEbay(db, { url: URL_, token: 'T', kind: 'token',
    fetchImpl: async () => { calls++; return resp(200, {}); } }));
  chk('  including its token exchange', k.limitHit === 'tooling' && calls === 0);
  chk('  outside it, the default is user', ebay.originFor({}) === 'user');
  chk('  and background: true is background', ebay.originFor({ background: true }) === 'background');
  chk('  background: true inside a USER request stays background (still yields)',
      ebay.withOrigin('user', () => ebay.originFor({ background: true })) === 'background');
  chk('  background: true inside a TOOLING request is tooling (its allowance)',
      ebay.withOrigin('tooling', () => ebay.originFor({ background: true })) === 'tooling');
  const db2 = splitDb({ calls_made: 10 });
  await ebay.withOrigin('tooling', () => ebay.fetchEbay(db2, { url: URL_, token: 'T',
    fetchImpl: async () => resp(200, {}) }));
  chk('  the call is RECORDED as tooling, day row and hour row',
      db2.writes.length === 2 && db2.writes.every(w => w.includes('tooling_calls')), db2.writes.length);
});
ebay.resetBreaker(); ebay._resetPacing();
await quiet(async () => {
  // Four tooling calls in flight at once, one under the allowance: only one goes.
  const db = splitDb({ calls_made: 500, tooling_calls: quota.toolingAllowance() - 1 });
  let calls = 0;
  const rs = await Promise.all([1, 2, 3, 4].map(() => ebay.fetchEbay(db, { url: URL_, token: 'T',
    origin: 'tooling', meta: { marketplace: 'EBAY_US' },
    fetchImpl: async () => { calls++; await new Promise(z => setTimeout(z, 30)); return resp(200, {}); } })));
  chk('four concurrent tooling calls, one left — exactly one sent', calls === 1, 'calls=' + calls);
  chk('  the other three say tooling', rs.filter(r => r.limitHit === 'tooling').length === 3);
});

// ══════════════════════════════════════════════════════════════
console.log('\nTHRESHOLDS STILL COHERENT\n');
// ══════════════════════════════════════════════════════════════
{
  const leaves = quota.DAILY_LIMIT * (1 - quota.SOFT_STOP);
  chk(`soft stop leaves ${Math.round(leaves)}, above the ${quota.RESERVE} reserve`,
      leaves > quota.RESERVE);
  chk('warn fires before the soft stop', quota.WARN_AT < quota.SOFT_STOP);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) { failures.forEach(f => console.log('   FAIL  ' + f)); console.log(''); }
process.exit(fail ? 1 : 0);
})();
