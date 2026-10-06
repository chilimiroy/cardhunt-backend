// ══════════════════════════════════════════════════════════════
// toolingkey.js — the shared secret for the eBay tooling probes
// (security follow-up T1, 2026-10-06)
//
// The seven /api/ebay/* probes spend the 300/day TOOLING quota, and quota
// exhaustion is what gets an eBay app flagged. They were public. A master
// sign-in is the wrong lock — the scripts that drive them hold no token —
// so they take a shared secret instead:
//
//   env   CARDZON_TOOLING_KEY   on Render, and in the local environment
//   head  X-CardHunt-Key         sent by the caller; never a query param
//                                (a URL lands in access logs and history)
//
// `require` is named on each probe's own app.get(...) line, so it runs
// BEFORE the handler — a refused request reaches no cache, no token
// exchange and no quota check. access.test.js pins that it is on the line.
//
// No fallback to open: a server with no key configured refuses every probe
// (503). A missing or wrong key is 401. The key never appears in a response,
// a log line or an error message — only whether one was sent.
//
//   node toolingkey.js /api/ebay/quota?probe=1      call a probe on Render
//   CARDHUNT_API=http://localhost:3001 node toolingkey.js /api/ebay/...
// ══════════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');

const ENV = 'CARDZON_TOOLING_KEY';
const HEADER = 'x-cardhunt-key';
const MIN_LENGTH = 24;

// Read per request, like the master list: a changed Render env var needs no
// code change, and a test can set it per process.
const configured = () => String(process.env[ENV] || '');

// Compare digests so the comparison takes the same time whatever the length.
const digest = s => crypto.createHash('sha256').update(String(s)).digest();
function matches(sent) {
  const want = configured();
  if (!want || !sent) return false;
  return crypto.timingSafeEqual(digest(sent), digest(want));
}

// { ok } or { status, body }. Body says what was wrong, never the value.
function check(req) {
  const want = configured();
  if (!want || want.length < MIN_LENGTH)
    return { ok: false, status: 503, body: { error: 'tooling probes are closed',
      reason: ENV + ' is not set on this server (or is shorter than ' + MIN_LENGTH + ' characters)' } };
  const sent = req.get(HEADER);
  if (!sent) return { ok: false, status: 401, body: { error: 'tooling key required', reason: 'no ' + HEADER + ' header' } };
  if (!matches(sent)) return { ok: false, status: 401, body: { error: 'tooling key required', reason: 'key does not match' } };
  return { ok: true };
}

function require_(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const r = check(req);
  if (!r.ok) return res.status(r.status).json(r.body);
  next();
}

// The header a local script sends, from the same variable. Empty when
// unset — the server then says 401, which is the honest answer.
function headers() {
  const k = configured();
  return k ? { 'X-CardHunt-Key': k, 'X-CardHunt-Origin': 'tooling' } : { 'X-CardHunt-Origin': 'tooling' };
}

module.exports = { ENV, HEADER, MIN_LENGTH, check, matches, headers, require: require_ };

if (require.main === module) {
  const p = process.argv[2];
  if (!p || !p.startsWith('/')) { console.error('usage: node toolingkey.js /api/ebay/<probe>[?query]'); process.exit(2); }
  if (!configured()) console.error('note: ' + ENV + ' is not set here — the server will refuse (401).');
  const base = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
  // process.exitCode, never process.exit(), once fetch has run: exiting while
  // its socket is still closing aborts Node on Windows ("Assertion failed:
  // !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c") with exit 127,
  // after the output — every local tooling probe looked broken (2026-10-07).
  fetch(base + p, { headers: Object.assign({ Accept: 'application/json' }, headers()) })
    .then(async r => { console.log(r.status); console.log(await r.text()); process.exitCode = r.ok ? 0 : 1; })
    .catch(e => { console.error('request failed: ' + e.message); process.exitCode = 1; });
}
