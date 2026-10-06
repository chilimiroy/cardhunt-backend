// access.test.js — the gate is REACHED by every route that needs it
// (T6 step 2, 2026-10-06)
//
// The earlier bug in this project was a correct gate that one route
// bypassed. So this reads EVERY app.METHOD(...) in server.js and fails on:
//   * a route not in ROUTES below (a new route must be classified);
//   * a gated route whose declaration line does not name its middleware;
//   * a public route that has no reason.
// Then it boots the real server and asks every gated route with no token, a
// bad token, a pending, a rejected, an approved and a master token, and
// checks each answer's shape — what the gate ALLOWS as well as what it
// refuses.
//
//   node access.test.js           structure + live server (memory store)
//   node access.test.js --table   also print the route table (markdown)
//
// The live server runs with no DATABASE_URL and a memory approval store
// preloaded with -r (the costmeter.js pattern) — nothing in server.js
// knows about tests. Tokens are HS256, minted with a test secret.

const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

// [method, path, level, reason]. level: public | approved | master.
// A public route's reason says why it may answer anyone.
const CATALOGUE = 'the public catalogue: browsing cards, sets, prices and listings is not gated';
const ROUTES = [
  ['get', '/api/auth/config', 'public', 'what a signed-out page needs to START a sign-in: URL + anon key (public by design)'],
  ['get', '/api/me', 'public', 'verifies the caller\'s own token itself and answers only about that token (401 without one)'],
  ['get', '/api/back/:cardId', 'public', CATALOGUE + ' (card-back check of a public listing; the verdict stored is hashed, no user)'],
  ['get', '/', 'public', 'service banner and version'],
  ['get', '/api/db/check', 'public', 'catalogue counts; no user rows'],
  ['get', '/api/sets', 'public', CATALOGUE],
  ['get', '/api/sets/:setId/cards', 'public', CATALOGUE],
  ['get', '/api/cards/:cardId', 'public', CATALOGUE],
  ['get', '/api/trending', 'public', CATALOGUE],
  ['get', '/api/deals', 'public', CATALOGUE],
  ['get', '/api/cards', 'public', CATALOGUE + ' (search)'],
  ['get', '/api/price/:cardId', 'public', CATALOGUE],
  ['get', '/api/alerts', 'approved', null],
  ['post', '/api/alerts', 'approved', null],
  ['get', '/api/alerts/triggered', 'approved', null],
  ['patch', '/api/alerts/:id', 'approved', null],
  ['get', '/api/portfolio', 'approved', null],
  ['post', '/api/portfolio', 'approved', null],
  ['get', '/api/admin/users', 'master', null],
  ['post', '/api/admin/users/:userId/approve', 'master', null],
  ['post', '/api/admin/users/:userId/reject', 'master', null],
  ['get', '/api/history/:cardId', 'public', CATALOGUE],
  ['get', '/api/listings-log', 'public', 'calls per card view, aggregated; listing_views holds no user id'],
  ['get', '/api/listings/:cardId', 'public', CATALOGUE + ' (records a view row: card, grade, calls — no user)'],
  ['get', '/api/search', 'public', CATALOGUE],
  ['get', '/api/listings/:cardName', 'public', 'refuses: an unidentifiable card gets no listings'],
  ['get', '/api/graded/:cardName', 'public', CATALOGUE],
  ['get', '/api/diagnostic', 'public', 'which sources answer; no user data'],
  ['get', '/api/market/:cardName', 'public', CATALOGUE],
  ['get', '/api/market/:cardName/sold', 'public', 'answers 410 Gone'],
  ['get', '/api/market/:cardName/active', 'public', 'answers 410 Gone'],
  ['get', '/api/scraper/test', 'public', 'reports what the market block does; no user data'],
  ['get', '/api/sets/lang/:lang', 'public', CATALOGUE],
  ['get', '/api/health/full', 'public', 'operational check; no user data'],
  ['get', '/ebay/deletion', 'public', 'eBay\'s ownership challenge — eBay must reach it unauthenticated'],
  ['post', '/ebay/deletion', 'public', 'eBay\'s account-deletion notification — called by eBay, answered with the verification token; stores nothing'],
  ['get', '/api/ebay/conditions/:cardId', 'public', 'tooling probe, catalogue id only; spends TOOLING quota (capped 300/day by ebayquota); no user data'],
  ['get', '/api/ebay/conditionvalues', 'public', 'tooling probe, as above'],
  ['get', '/api/ebay/certprobe/:cardId', 'public', 'tooling probe, as above'],
  ['get', '/api/ebay/setprobe/:cardId', 'public', 'tooling probe, as above'],
  ['get', '/api/cert/:cardId', 'public', CATALOGUE + ' (cert number of a public listing)'],
  ['get', '/api/photos/:cardId', 'public', CATALOGUE + ' (photos of a public listing)'],
  ['get', '/api/stamp/:cardId', 'public', CATALOGUE + ' (photo check of a public listing)'],
  ['get', '/api/ebay/gradecost/:cardId', 'public', 'tooling probe, as above'],
  ['get', '/api/ebay/marketprobe/:cardId', 'public', 'tooling probe, as above'],
  ['get', '/api/ebay/aspects/:cardId', 'public', 'tooling probe, as above'],
  ['get', '/api/ebay/quota', 'public', 'eBay spend so far; no user data'],
  ['get', '/app', 'public', 'the page itself — anonymous visitors browse it'],
  ['get', '/gradeprice.js', 'public', 'a module the page loads'],
  ['get', '/estimator.js', 'public', 'a module the page loads'],
  ['get', '/cardmatch.js', 'public', 'a module the page loads'],
  ['get', '/api/probe/sources', 'public', 'which sources answer from Render; registered ids only, no URL; no user data'],
  ['get', '/ebay/status', 'public', 'eBay credential check; no user data'],
];
// Middleware mounted for every request. None of them is a router: a
// mounted router would hide routes from the table above.
const USES = ['cors(', 'express.json()', '(req, res, next) => {', '(req, res, next) => ebay0.withOrigin('];

const S = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\r/g, '');
const lines = S.split('\n');
const found = [];
lines.forEach((l, i) => {
  const m = /^app\.(get|post|put|patch|delete|all)\('([^']+)'/.exec(l);
  if (m) found.push({ method: m[1], path: m[2], line: i + 1, text: l });
});

console.log('\n  every route in server.js is classified, and a gated route names its gate');
const key = r => r[0] + ' ' + r[1];
const table = new Map(ROUTES.map(r => [key(r), r]));
const seen = new Set();
for (const f of found) {
  const k = f.method + ' ' + f.path, r = table.get(k);
  if (seen.has(k)) { ok('declared once: ' + k, false, 'line ' + f.line); continue; }
  seen.add(k);
  if (!r) { ok('classified: ' + k, false, 'line ' + f.line + ' — add it to ROUTES with a level'); continue; }
  const lvl = r[2];
  if (lvl === 'public') ok(`public with a reason, no gate: ${k}`, !!r[3] && !/access\./.test(f.text), 'line ' + f.line);
  else ok(`${lvl}: ${k} calls access.${lvl} on its declaration line`, f.text.includes(`, access.${lvl}, `), 'line ' + f.line);
  f.level = lvl; f.reason = r[3];
}
for (const r of ROUTES) if (!seen.has(key(r))) ok('still in server.js: ' + key(r), false, 'listed here but not declared');
ok('found routes in server.js at all (' + found.length + ')', found.length >= 40);
// A route declared any other way (indented, in a loop, a computed path)
// would be invisible to everything above.
const anyDecl = (S.match(/\bapp\.(get|post|put|patch|delete|all)\(/g) || []).length;
ok('every app.METHOD( in server.js is a readable one-line declaration', anyDecl === found.length, anyDecl + ' calls, ' + found.length + ' readable');
const uses = lines.map((l, i) => [l, i + 1]).filter(([l]) => /^app\.use\(/.test(l));
ok('app.use: only the known middleware, no mounted router', uses.length === USES.length && uses.every(([l]) => USES.some(u => l.includes(u))),
   uses.map(([l, n]) => n + ': ' + l.slice(0, 50)).join(' | '));
ok('no express.Router anywhere in server.js', !/express\.Router|Router\(\)/.test(S));
// The one URL user id allowed is the TARGET of a master's decision.
ok('every gated route takes the user from req.account, never the URL or body',
   !/b\.user_id|req\.body\.user_id/.test(S) && (S.match(/req\.params\.userId/g) || []).length === 1
   && /function decideAccount[\s\S]{0,80}const id = req\.params\.userId;/.test(S) && /\[req\.account\.userId, b\.card_api_id/.test(S));
ok('ONE helper: access.js resolves the request; server.js builds no second check',
   (S.match(/auth\.verify\(/g) || []).length === 1);   // the one in /api/me

const H = fs.readFileSync(path.join(__dirname, 'cardhunt_preview.html'), 'utf8').replace(/\r/g, '');
const pfn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('page: "Approve accounts" is offered only when /api/me said master', /AUTH\.role === 'master' \? '<button[^']*onclick="adminOpen\(\)">Approve accounts/.test(pfn('authRender')));
ok('page: the masters’ list and each decision send the session token', /Authorization: 'Bearer ' \+ token/.test(pfn('adminLoad')) && /Authorization: 'Bearer ' \+ token/.test(pfn('adminDecide')));
ok('page: reject says, before the click, what it does and that it can be undone', /cannot use the site[\s\S]{0,160}can be undone/.test(pfn('adminRender')));
ok('page: the alerts calls send the token and no user id', /'\/api\/alerts', \{ headers: \{ Authorization: 'Bearer ' \+ token/.test(pfn('loadAlerts')) && !/user_id: CH_USER/.test(H));

if (process.argv.includes('--table')) {
  console.log('\n| route | method | level | where it checks / why public |\n|---|---|---|---|');
  for (const f of found) console.log(`| \`${f.path}\` | ${f.method.toUpperCase()} | ${f.level || '?'} | ${f.level === 'public' ? f.reason : 'server.js:' + f.line + ' `access.' + f.level + '`'} |`);
}

// ── live: boot the server and ask ──────────────────────────────
const PORT = process.env.TEST_PORT || 3997, BASE = 'http://127.0.0.1:' + PORT;
const SECRET = 'access-test-secret', SUPA = 'https://access-test.supabase.co';
const ID = { approved: '11111111-1111-4111-8111-111111111111', pending: '22222222-2222-4222-8222-222222222222',
             rejected: '33333333-3333-4333-8333-333333333333', master: '44444444-4444-4444-8444-444444444444' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(id, email, over) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(Object.assign({ sub: id, email, aud: 'authenticated', iss: SUPA + '/auth/v1', exp: Math.floor(Date.now() / 1000) + 600 }, over || {}));
  return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
}
const TOK = {
  approved: token(ID.approved, 'approved@example.com'),
  pending: token(ID.pending, 'pending@example.com'),
  rejected: token(ID.rejected, 'rejected@example.com'),
  master: token(ID.master, 'Master@Example.com'),
  // A pending user's token with a forged role claim: the token's own fields are not a role.
  forged: token(ID.pending, 'pending@example.com', { role: 'master', app_metadata: { role: 'master' }, user_metadata: { role: 'master', approved: true } }),
  wrongKey: (() => { const t = token(ID.master, 'master@example.com').split('.'); t[2] = 'AAAA'; return t.join('.'); })(),
};
const preload = path.join(os.tmpdir(), 'access-test-store-' + process.pid + '.js');
fs.writeFileSync(preload, `const roles = require(${JSON.stringify(path.join(__dirname, 'roles.js'))});
const m = new Map(${JSON.stringify([[ID.approved, 'approved'], [ID.rejected, 'rejected'], [ID.master, 'rejected']])});
roles.setStore({ get: async id => m.get(id) || null, touch: async id => { if (!m.has(id)) m.set(id, 'pending'); },
  decide: async (id, s, by) => { if (!m.has(id)) return null; m.set(id, s); return { user_id: id, state: s, decided_by: by }; },
  list: async () => [...m].map(([user_id, state]) => ({ user_id, state, email: null })) });`);

const sample = p => p.replace(/:cardId|:id|:userId/g, m => m === ':cardId' ? 'en-base1-4' : m === ':userId' ? ID.pending : '1');
async function ask(method, p, tok, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const r = await fetch(BASE + p, { method: method.toUpperCase(), headers, body: method === 'get' ? undefined : JSON.stringify(body || { status: 'paused', card_api_id: 'en-base1-4', alert_type: 'below' }) });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, body: j, text: t };
}

(async () => {
  const server = spawn(process.execPath, ['-r', preload, path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '', EBAY_ENABLED: 'false', SUPABASE_URL: SUPA,
           SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: SECRET, CARDZON_MASTER_EMAILS: 'master@example.com, roy@cardzon.com' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; server.stderr.on('data', d => { err += d; }); server.stdout.on('data', () => {});
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { try { await fetch(BASE + '/api/auth/config'); up = true; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  if (!up) { console.log('\nCOULD NOT BOOT server.js — the live half was not tested.\n' + err); fs.unlinkSync(preload); process.exit(2); }

  try {
    const gated = found.filter(f => f.level && f.level !== 'public');
    console.log('\n  live: every gated route (' + gated.length + '), every kind of caller');
    for (const f of gated) {
      const p = sample(f.path), k = f.method.toUpperCase() + ' ' + f.path;
      let r = await ask(f.method, p, null);
      ok(`${k}  no token -> 401 sign-in required`, r.status === 401 && r.body && r.body.error === 'sign-in required', r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.wrongKey);
      ok(`${k}  bad signature -> 401`, r.status === 401, String(r.status));
      r = await ask(f.method, p, TOK.pending);
      ok(`${k}  pending -> 403 approval pending`, r.status === 403 && r.body.error === 'approval pending' && r.body.state === 'pending', r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.forged);
      ok(`${k}  pending with role claims forged into the token -> still 403 pending`, r.status === 403 && r.body.state === 'pending', r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.rejected);
      ok(`${k}  rejected -> 403, state rejected`, r.status === 403 && r.body.state === 'rejected', r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.approved);
      if (f.level === 'master') ok(`${k}  approved non-master -> 403 masters only`, r.status === 403 && r.body.error === 'masters only', r.status + ' ' + r.text.slice(0, 80));
      else ok(`${k}  approved -> past the gate (503: no database in this test)`, r.status === 503 && /database/.test(r.text), r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.master);
      ok(`${k}  master (stored row says rejected; the list wins) -> past the gate`, r.status !== 401 && r.status !== 403, r.status + ' ' + r.text.slice(0, 80));
    }

    console.log('\n  live: /api/me says the role; public routes stay public');
    let r = await ask('get', '/api/me', TOK.pending);
    ok('/api/me, a new sign-in: 200, role pending', r.status === 200 && r.body.role === 'pending' && r.body.signedIn === true, r.text.slice(0, 120));
    r = await ask('get', '/api/me', TOK.forged);
    ok('/api/me ignores role claims in the token', r.body && r.body.role === 'pending', r.text.slice(0, 120));
    r = await ask('get', '/api/me', TOK.master);
    ok('/api/me, a listed email (any case): master', r.body && r.body.role === 'master', r.text.slice(0, 120));
    r = await ask('get', '/api/me', TOK.approved);
    ok('/api/me, approved', r.body && r.body.role === 'approved', r.text.slice(0, 120));
    r = await ask('get', '/api/me', null);
    ok('/api/me with no token: 401, signed out', r.status === 401 && r.body.signedIn === false);
    for (const p of ['/app', '/api/auth/config', '/cardmatch.js', '/']) {
      r = await ask('get', p, null);
      ok(`anonymous ${p}: 200, not gated`, r.status === 200, String(r.status));
    }
    console.log('\n  live: approval');
    r = await ask('post', '/api/admin/users/' + ID.pending + '/approve', TOK.approved);
    ok('an APPROVED non-master approving someone: 403 masters only', r.status === 403 && r.body.error === 'masters only', r.status + ' ' + r.text);
    r = await ask('post', '/api/admin/users/' + ID.pending + '/approve', TOK.pending);
    ok('a pending user approving themselves: 403 approval pending', r.status === 403 && r.body.error === 'approval pending', r.status + ' ' + r.text);
    r = await ask('get', '/api/me', TOK.pending);
    ok('... and they are still pending', r.body.role === 'pending');
    r = await ask('post', '/api/admin/users/' + ID.pending + '/approve', TOK.master);
    ok("a master approves: 200, recorded with the master's user id", r.status === 200 && r.body.state === 'approved' && r.body.decidedBy === ID.master, r.text);
    r = await ask('get', '/api/me', TOK.pending);
    ok('the approved user is approved on their next request', r.body.role === 'approved', r.text.slice(0, 100));
    r = await ask('post', '/api/admin/users/' + ID.pending + '/reject', TOK.master);
    r = await ask('get', '/api/alerts', TOK.pending);
    ok('rejected: refused on the next request (403, state rejected)', r.status === 403 && r.body.state === 'rejected', r.text);
    r = await ask('post', '/api/admin/users/' + ID.master + '/reject', TOK.master);
    ok('a master cannot reject (or approve) their own access', r.status === 400, r.text);
    r = await ask('post', '/api/admin/users/not-a-uuid/approve', TOK.master);
    ok('a malformed id: 400', r.status === 400);
    r = await ask('post', '/api/admin/users/99999999-9999-4999-8999-999999999999/approve', TOK.master);
    ok('an id that never signed in: 404, nothing created', r.status === 404, r.text);
    r = await ask('get', '/api/admin/users', TOK.master);
    ok("the masters' list answers for a master", r.status === 200 && Array.isArray(r.body.pending), r.text.slice(0, 120));
    r = await ask('get', '/api/alerts/anon-abc12345', null);
    ok('the old /api/alerts/:userId read is gone (404), not silently public', r.status === 404, String(r.status));
  } finally { server.kill(); try { fs.unlinkSync(preload); } catch (e) {} }

  console.log('\n  access.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
