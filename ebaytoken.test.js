/**
 * ══════════════════════════════════════════════════════════════
 * ebaytoken.test.js — node ebaytoken.test.js
 *
 * The eBay token path, tested against every way it can fail.
 *
 * Why this exists: `getEbayToken()` returned a bare `null` for four
 * unrelated causes — credentials absent, eBay rejecting the exchange, an
 * unreachable host, and a malformed response — and `sourceEbay` reported
 * all four as "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set". The
 * deployed service therefore said `ready: true` on /ebay/status and
 * "not set" on /api/listings in the same process. Hours went into
 * checking environment variables that were correct.
 *
 * So the assertions that matter here are about WHICH REASON is reported,
 * not merely that a failure was detected. A test that only checked
 * "no token" would have passed against the broken version.
 *
 * Standalone, like jptest.js and sourcerank.test.js — tests inside a
 * file that gets replaced vanish exactly when they are needed.
 *
 * server.js is an express app that binds a port on require, so the token
 * logic is re-implemented here ONLY if it cannot be imported. It can be:
 * see loadTokenModule below.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) { pass++; return true; }
  fail++; failures.push(label + (detail ? `\n        ${detail}` : ''));
  return false;
}
function eq(a, b, label) {
  return ok(a === b, label, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function match(str, re, label) {
  return ok(re.test(String(str || '')), label, `expected /${re.source}/ to match ${JSON.stringify(str)}`);
}

// ── Extract the token function from server.js without starting it ──
// server.js calls app.listen() at the bottom. Requiring it would bind a
// port and hang the test run, so the function source is read out of the
// file and evaluated in isolation. This keeps the test honest: it runs
// THE SHIPPED CODE, not a copy that can drift from it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function extract(name, kind = 'async function') {
  const start = src.indexOf(`${kind} ${name}(`);
  if (start === -1) throw new Error(`${name} not found in server.js — did it get reverted?`);
  // Walk braces from the first { after the signature.
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`could not find the end of ${name}`);
}

const sandboxSrc = [
  extract('ebayCreds', 'function'),
  extract('ebayConfigured', 'function'),
  'let ebayToken = null, ebayTokenExp = 0, ebayTokenCredKey = "";',
  extract('getEbayTokenDetailed'),
  'return { getEbayTokenDetailed, ebayConfigured, reset: () => { ebayToken = null; ebayTokenExp = 0; ebayTokenCredKey = ""; } };'
].join('\n');

// getEbayTokenDetailed now routes the exchange through ebaycall so token
// calls are queued, paced, kill-switched and COUNTED — the expires_in bug
// spent the daily quota on authentication and nothing recorded it.
//
// So the sandbox needs `ebay` and `db` too. The REAL ebaycall module is
// used, with the test's fetch injected into it: that keeps the guards in
// the path being tested rather than stubbing them out, which would let a
// broken guard pass this suite.
const realEbayCall = require('./ebaycall');
const realQuota = require('./ebayquota');

const QUOTA_ROW = { calls_made: 0, token_calls: 0, ebay_limit: null,
                    ebay_remaining: null, ebay_reset: null };
function fakeDb() {
  return { query: async (sql) => {
    if (/CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO ebay_quota/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [QUOTA_ROW] };
    return { rows: [] };
  }};
}

function freshModule(fetchImpl) {
  realEbayCall.resetBreaker();
  realEbayCall._resetPacing();
  const ebayShim = {
    fetchEbay: (db, opts) => realEbayCall.fetchEbay(db, { ...opts, fetchImpl }),
    ebayEnabled: realEbayCall.ebayEnabled
  };
  // eslint-disable-next-line no-new-func
  return new Function('fetch', 'Buffer', 'process', 'ebay', 'db', 'quota',
    `${sandboxSrc}`)(
    fetchImpl, Buffer, { env: process.env }, ebayShim, fakeDb(), realQuota);
}

const okResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

function withEnv(id, secret, fn) {
  const oi = process.env.EBAY_CLIENT_ID, os = process.env.EBAY_CLIENT_SECRET;
  if (id === null) delete process.env.EBAY_CLIENT_ID; else process.env.EBAY_CLIENT_ID = id;
  if (secret === null) delete process.env.EBAY_CLIENT_SECRET; else process.env.EBAY_CLIENT_SECRET = secret;
  return Promise.resolve(fn()).finally(() => {
    if (oi === undefined) delete process.env.EBAY_CLIENT_ID; else process.env.EBAY_CLIENT_ID = oi;
    if (os === undefined) delete process.env.EBAY_CLIENT_SECRET; else process.env.EBAY_CLIENT_SECRET = os;
  });
}

(async () => {

// ══════════════════════════════════════════════════════════════
// 1. THE BUG THAT STARTED THIS
//    Credentials present + eBay rejects  =>  must NOT say "not set"
// ══════════════════════════════════════════════════════════════
await withEnv('realid', 'realsecret', async () => {
  const m = freshModule(async () => okResponse(
    { error: 'invalid_client', error_description: 'client authentication failed' }, 401));
  const r = await m.getEbayTokenDetailed();

  eq(r.token, null, 'rejected exchange yields no token');
  eq(!!r.unconfigured, false,
    'THE BUG: a rejected exchange must NOT be reported as unconfigured');
  ok(!/not set/i.test(r.error || ''),
    'the error must not claim the variables are unset', `got: ${r.error}`);
  match(r.error, /rejected the token exchange/i, 'it says the exchange was rejected');
  match(r.error, /401/, 'it carries the HTTP status');
  match(r.error, /invalid_client/, "it carries eBay's own error code");
  match(r.error, /client authentication failed/, "it carries eBay's description");
  eq(r.status, 401, 'the status is exposed for programmatic use');
});

// ══════════════════════════════════════════════════════════════
// 2. GENUINELY MISSING CREDENTIALS — and only this — is unconfigured
// ══════════════════════════════════════════════════════════════
await withEnv(null, null, async () => {
  const m = freshModule(async () => { throw new Error('must not be called'); });
  const r = await m.getEbayTokenDetailed();
  eq(r.unconfigured, true, 'both credentials absent is unconfigured');
  match(r.error, /EBAY_CLIENT_ID and EBAY_CLIENT_SECRET not set/, 'it names both');
  eq(m.ebayConfigured(), false, 'ebayConfigured() agrees');
});

await withEnv('id-only', null, async () => {
  const m = freshModule(async () => { throw new Error('must not be called'); });
  const r = await m.getEbayTokenDetailed();
  eq(r.unconfigured, true, 'one credential absent is still unconfigured');
  match(r.error, /EBAY_CLIENT_SECRET not set/, 'it names the MISSING one');
  ok(!/EBAY_CLIENT_ID not set/.test(r.error),
    'it does not blame the one that IS set', `got: ${r.error}`);
});

await withEnv('', '', async () => {
  const m = freshModule(async () => { throw new Error('must not be called'); });
  eq((await m.getEbayTokenDetailed()).unconfigured, true, 'empty strings count as absent');
});

// ══════════════════════════════════════════════════════════════
// 3. THE OTHER TWO NULL CAUSES, EACH DISTINGUISHABLE
// ══════════════════════════════════════════════════════════════
await withEnv('realid', 'realsecret', async () => {
  const m = freshModule(async () => { throw new Error('ENOTFOUND api.ebay.com'); });
  const r = await m.getEbayTokenDetailed();
  eq(!!r.unconfigured, false, 'a network failure is not "unconfigured"');
  match(r.error, /could not reach api\.ebay\.com/, 'a network failure says so');
  match(r.error, /ENOTFOUND/, 'and carries the underlying cause');
});

await withEnv('realid', 'realsecret', async () => {
  const m = freshModule(async () => okResponse('<html>gateway timeout</html>', 200));
  const r = await m.getEbayTokenDetailed();
  eq(r.token, null, 'a non-JSON 200 yields no token');
  match(r.error, /non-JSON/, 'a non-JSON body is reported as such, not as "not set"');
});

await withEnv('realid', 'realsecret', async () => {
  const m = freshModule(async () => okResponse({ token_type: 'Bearer' }, 200));
  const r = await m.getEbayTokenDetailed();
  eq(r.token, null, '200 without access_token yields no token');
  match(r.error, /no access_token/, 'and says exactly that');
});

// ══════════════════════════════════════════════════════════════
// 4. THE SUCCESS PATH — a gate tested only on refusals passes by
//    refusing everything. This is the half that proves it works.
// ══════════════════════════════════════════════════════════════
await withEnv('realid', 'realsecret', async () => {
  let calls = 0;
  const m = freshModule(async (url, opts) => {
    calls++;
    ok(url === 'https://api.ebay.com/identity/v1/oauth2/token', 'production OAuth endpoint');
    eq(opts.method, 'POST', 'POST');
    match(opts.headers['Content-Type'], /x-www-form-urlencoded/, 'form-encoded');
    const b64 = Buffer.from('realid:realsecret').toString('base64');
    eq(opts.headers.Authorization, `Basic ${b64}`, 'HTTP Basic of id:secret');
    match(opts.body, /grant_type=client_credentials/, 'client_credentials grant');
    match(decodeURIComponent(opts.body), /https:\/\/api\.ebay\.com\/oauth\/api_scope/, 'api_scope requested');
    return okResponse({ access_token: 'TOK-1', expires_in: 7200, token_type: 'Application' });
  });

  const r = await m.getEbayTokenDetailed();
  eq(r.token, 'TOK-1', 'ALLOW: a valid exchange returns the token');
  eq(r.error, undefined, 'no error on success');
  eq(r.expiresIn, 7200, 'ttl reported');

  const again = await m.getEbayTokenDetailed();
  eq(again.token, 'TOK-1', 'second call returns the token');
  eq(again.cached, true, 'and is served from cache');
  eq(calls, 1, 'the cache prevents a second network round trip');
});

// ══════════════════════════════════════════════════════════════
// 5. CACHE CORRECTNESS
// ══════════════════════════════════════════════════════════════
await withEnv('id-a', 'secret-a', async () => {
  const m = freshModule(async (url, opts) => {
    const which = opts.headers.Authorization.includes(
      Buffer.from('id-a:secret-a').toString('base64')) ? 'TOK-A' : 'TOK-B';
    return okResponse({ access_token: which, expires_in: 7200 });
  });
  eq((await m.getEbayTokenDetailed()).token, 'TOK-A', 'token minted for the first credentials');

  process.env.EBAY_CLIENT_ID = 'id-b';
  process.env.EBAY_CLIENT_SECRET = 'secret-bbbb';
  const r = await m.getEbayTokenDetailed();
  eq(r.token, 'TOK-B',
    'changing credentials re-authenticates rather than serving the old token');
});

await withEnv('realid', 'realsecret', async () => {
  // expires_in missing would make the expiry NaN; `Date.now() < NaN` is
  // false, so every call would re-fetch. Silent, and it would burn the
  // 5,000/day quota on token exchanges.
  let calls = 0;
  const m = freshModule(async () => { calls++; return okResponse({ access_token: 'TOK-N' }); });
  await m.getEbayTokenDetailed();
  const second = await m.getEbayTokenDetailed();
  eq(second.cached, true, 'a token with no expires_in is still cached');
  eq(calls, 1, 'it does not re-fetch on every call and burn the daily quota');
});

// ══════════════════════════════════════════════════════════════
// 6. CREDENTIALS ARE READ AT CALL TIME, NOT CAPTURED AT LOAD
//    This is the specific defect: /ebay/status read live and said
//    "present" while the listing path read a module-load snapshot.
// ══════════════════════════════════════════════════════════════
await withEnv(null, null, async () => {
  const m = freshModule(async () => okResponse({ access_token: 'TOK-LATE', expires_in: 7200 }));
  eq((await m.getEbayTokenDetailed()).unconfigured, true, 'starts unconfigured');
  eq(m.ebayConfigured(), false, 'and reports so');

  // Credentials appear AFTER the module was created.
  process.env.EBAY_CLIENT_ID = 'late-id';
  process.env.EBAY_CLIENT_SECRET = 'late-secret';

  eq(m.ebayConfigured(), true, 'ebayConfigured() sees a credential added later');
  const r = await m.getEbayTokenDetailed();
  eq(r.token, 'TOK-LATE',
    'THE FIX: credentials added after load are picked up, no restart needed');
});

// ══════════════════════════════════════════════════════════════
// 7. THE SHIPPED FILE STILL WIRES IT UP
//    Reverts have silently removed whole functions from this project
//    while the version banner still matched.
// ══════════════════════════════════════════════════════════════
ok(!/const EBAY_ID\s*=/.test(src),
  'the module-load credential const is gone, not merely shadowed');
ok(!/const EBAY_SECRET\s*=/.test(src), 'and so is its secret counterpart');
ok(!/EBAY_ID\b/.test(src.replace(/EBAY_IDENT\w*/g, '')),
  'no dangling EBAY_ID reference survives (it would be a ReferenceError)');
ok(src.includes('const auth = await getEbayTokenDetailed();'),
  'sourceEbay uses the detailed token path');
// scrEbayToken was the second token implementation; it delegated, and since
// 2026-09-29 it is gone with its only caller (ebayActive). Either way there
// must be ONE token exchange in the server.
ok((!/scrEbayToken/.test(src) || /scrEbayToken\(\)\s*\{\s*\n?\s*return \(await getEbayTokenDetailed\(\)\)/.test(src))
   && (src.match(/identity\/v1\/oauth2\/token/g) || []).length <= 1,
  'one token implementation: the duplicate delegates or is gone, one oauth2 exchange');
ok(src.includes('readyMeans'),
  '/ebay/status distinguishes "variables set" from "eBay accepted them"');
ok(src.includes("req.query.probe === '1'"),
  '/ebay/status can actually probe the exchange');

// ══════════════════════════════════════════════════════════════
console.log('');
console.log(`  ebaytoken.test.js — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('');
  failures.forEach(f => console.log('   FAIL  ' + f));
  console.log('');
  process.exit(1);
}
console.log('');
})();
