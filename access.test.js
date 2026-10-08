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

// [method, path, level, reason]. level: public | approved | master | tooling.
// tooling = the eBay probes: a shared secret (toolingkey.js), not a sign-in.
// priced = prices / listings / links (the door, 2026-10-07): an approved
//   account or the tooling key; refuses everyone else (access.priced).
// catalogue = public, never refuses, but a caller without an approved
//   account gets the body with every price key stripped (access.optional,
//   pricegate.js; pricegate.test.js proves it against real responses).
// A public route's reason says why it may answer anyone.
const CATALOGUE = 'the public catalogue: browsing cards, sets, prices and listings is not gated';
const ROUTES = [
  ['get', '/api/auth/config', 'public', 'what a signed-out page needs to START a sign-in: URL + anon key (public by design)'],
  ['get', '/api/me', 'public', 'verifies the caller\'s own token itself and answers only about that token (401 without one)'],
  ['get', '/api/back/:cardId', 'priced', null],
  ['get', '/', 'public', 'service banner and version'],
  ['get', '/api/db/check', 'public', 'catalogue counts; no user rows'],
  ['get', '/api/sets', 'catalogue', null],
  ['get', '/api/sets/:setId/cards', 'catalogue', null],
  ['get', '/api/cards/:cardId', 'catalogue', null],
  ['get', '/api/trending', 'priced', null],
  ['get', '/api/deals', 'priced', null],
  ['get', '/api/deals/:cardId/live', 'priced', null],
  ['post', '/api/deals/refresh', 'tooling', null],
  ['get', '/api/deals/refresh/status', 'tooling', null],
  ['get', '/api/cards', 'public', CATALOGUE + ' (search)'],
  ['get', '/api/price/:cardId', 'priced', null],
  ['get', '/api/alerts', 'approved', null],
  ['post', '/api/alerts', 'approved', null],
  ['get', '/api/alerts/triggered', 'approved', null],
  ['patch', '/api/alerts/:id', 'approved', null],
  ['post', '/api/alerts/claim', 'approved', null],
  ['get', '/api/portfolio', 'approved', null],
  ['post', '/api/portfolio', 'approved', null],
  ['get', '/api/admin/users', 'master', null],
  ['post', '/api/admin/users/:userId/approve', 'master', null],
  ['post', '/api/admin/users/:userId/reject', 'master', null],
  ['get', '/api/admin/users/:userId/record', 'master', null],
  ['post', '/api/reports', 'approved', null],
  ['get', '/api/admin/reports', 'master', null],
  ['post', '/api/admin/reports/:id/state', 'master', null],
  ['get', '/api/history/:cardId', 'priced', null],
  ['get', '/api/listings-log', 'public', 'calls per card view, aggregated; listing_views holds no user id'],
  ['get', '/api/listings/:cardId', 'priced', null],
  ['post', '/api/listings/:cardId/compare', 'priced', null],
  ['get', '/api/search', 'catalogue', null],
  ['get', '/api/search/popular', 'catalogue', null],
  ['get', '/api/trending/catalogue', 'catalogue', null],
  ['get', '/api/listings/:cardName', 'public', 'refuses: an unidentifiable card gets no listings'],
  ['get', '/api/graded/:cardName', 'priced', null],
  ['get', '/api/diagnostic', 'catalogue', null],
  ['get', '/api/market/:cardName', 'priced', null],
  ['get', '/api/market/:cardName/sold', 'public', 'answers 410 Gone'],
  ['get', '/api/market/:cardName/active', 'public', 'answers 410 Gone'],
  ['get', '/api/scraper/test', 'public', 'reports what the market block does; no user data'],
  ['get', '/api/sets/lang/:lang', 'catalogue', null],
  ['get', '/api/health/full', 'public', 'operational check; no user data'],
  ['get', '/ebay/deletion', 'public', 'eBay\'s ownership challenge — eBay must reach it unauthenticated'],
  ['post', '/ebay/deletion', 'public', 'eBay\'s account-deletion notification — called by eBay, answered with the verification token; stores nothing'],
  ['get', '/api/ebay/conditions/:cardId', 'tooling', null],
  ['get', '/api/ebay/conditionvalues', 'tooling', null],
  ['get', '/api/ebay/certprobe/:cardId', 'tooling', null],
  ['get', '/api/ebay/setprobe/:cardId', 'tooling', null],
  ['get', '/api/ebay/statusprobe/:cardId', 'tooling', null],
  ['get', '/api/cert/:cardId', 'priced', null],
  ['get', '/api/photos/:cardId', 'priced', null],
  ['get', '/api/stamp/:cardId', 'priced', null],
  ['get', '/api/ebay/gradecost/:cardId', 'tooling', null],
  ['get', '/api/ebay/marketprobe/:cardId', 'tooling', null],
  ['get', '/api/ebay/dealsprobe/:cardId', 'tooling', null],
  ['get', '/api/ebay/aspects/:cardId', 'tooling', null],
  ['get', '/api/ebay/quota', 'public', 'eBay spend so far, read from the ledger (spends nothing); no user data. ?probe=1 asks eBay and needs the tooling key (toolingkey.test.js)'],
  ['get', '/app', 'public', 'the page itself — anonymous visitors browse it'],
  ['get', '/set-logos/:file', 'public', 'set logo images for the catalogue, each file named in SET_LOGOS'],
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
  if (lvl === 'tooling') ok(`tooling: ${k} names toolingKey.require on its declaration line, and no user gate`, f.text.includes(', toolingKey.require, ') && !/access./.test(f.text), 'line ' + f.line);
  else if (lvl === 'priced' || lvl === 'catalogue') { const mw = lvl === 'priced' ? 'access.priced' : 'access.optional';
    ok(`${lvl}: ${k} calls ${mw} on its declaration line`, f.text.includes(`, ${mw}, `), 'line ' + f.line); }
  else if (lvl === 'public') ok(`public with a reason, no gate: ${k}`, !!r[3] && !/access\./.test(f.text), 'line ' + f.line);
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
// The two URL user ids allowed are the TARGET of a master: a decision, and
// the read-only record (T2, 2026-10-07). Both behind access.master.
ok('every gated route takes the user from req.account, never the URL or body',
   !/b\.user_id|req\.body\.user_id/.test(S) && (S.match(/req\.params\.userId/g) || []).length === 2
   && /function decideAccount[\s\S]{0,80}const id = req\.params\.userId;/.test(S) && /async function userRecord\(req, res\) \{\n  const id = req\.params\.userId;/.test(S)
   && /app\.get\('\/api\/admin\/users\/:userId\/record', access\.master, userRecord\);/.test(S) && /\[req\.account\.userId, b\.card_api_id/.test(S));
const rec = S.slice(S.indexOf('async function userRecord('), S.indexOf("app.get('/api/admin/users/:userId/record'"));
ok('the record is read-only: SELECTs only, no INSERT / UPDATE / DELETE', /SELECT/.test(rec) && !/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/.test(rec));
ok('the record reads only the listed tables (user_access, alerts, portfolio) — no auth schema, no other source',
   (rec.match(/FROM (\w+)/g) || []).every(f => /FROM (user_access|alerts|portfolio)$/.test(f)) && !/auth\./.test(rec.replace(/\/\/.*$/gm, '')) && !/listing_views|users\b(?!_)/.test(rec.replace(/user_access|\/\/.*$/gm, '')));
ok('the record says the claimed browser ids are NOT recorded, rather than inventing them', /claimedBrowserIds: \{ recorded: false,/.test(rec));
ok('ONE helper: access.js resolves the request; server.js builds no second check',
   (S.match(/auth\.verify\(/g) || []).length === 1);   // the one in /api/me

const H = fs.readFileSync(path.join(__dirname, 'cardhunt_preview.html'), 'utf8').replace(/\r/g, '');
const pfn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('page: "Approve accounts" is offered only when /api/me said master', /AUTH\.role === 'master' \? '<button[^']*onclick="adminOpen\(\)">Approve accounts/.test(pfn('authRender')));
ok('page: the masters’ list and each decision send the session token', /Authorization: 'Bearer ' \+ token/.test(pfn('adminLoad')) && /Authorization: 'Bearer ' \+ token/.test(pfn('adminDecide')));
ok('page: reject says, before the click, what it does and that it can be undone', /cannot use the site[\s\S]{0,160}can be undone/.test(pfn('adminRender')));
ok("page: every row in the masters' list offers its record; the record view sends the token and only GETs",
   /recBtn\(u\) \+ buttons/.test(pfn('adminRender')) && /'\/record', \{ headers: \{ Authorization: 'Bearer ' \+ token \} \}/.test(pfn('adminRecord'))
   && !/method: '(POST|PATCH|DELETE)'/.test(pfn('adminRecord')));
console.log('\n  the alerts made before sign-in (anon ids)');
const claim = S.slice(S.indexOf("app.post('/api/alerts/claim'"), S.indexOf('\n});', S.indexOf("app.post('/api/alerts/claim'")) + 4);
ok('claim moves rows to the CALLER (req.account), only rows on the anon id sent', /SET user_id = \$1, updated_at = NOW\(\) WHERE user_id = \$2/.test(claim) && /\[req\.account\.userId, anonId\]/.test(claim));
ok('claim accepts only the anon-id shape (not "anon", not a uuid, not another user)', /const ANON_ID_RE = \/\^anon-\[a-z0-9\]\{4,16\}\$\/;/.test(S) && /ANON_ID_RE\.test\(anonId\)/.test(claim));
ok('claim never deletes', !/DELETE/.test(claim));
const ANON_RE = /^anon-[a-z0-9]{4,16}$/;
ok('the shape: the ids the page made pass; "anon", a uuid, SQL do not', ['anon-t0abc123', 'anon-5a9zz1xq'].every(x => ANON_RE.test(x))
   && ['anon', 'anon-', '11111111-1111-4111-8111-111111111111', "anon-x' OR '1'='1", 'ANON-ABCDEFGH'].every(x => !ANON_RE.test(x)));
ok('page: no new anon id is ever made', !/'anon-' \+ Math\.random/.test(H));
ok('page: the claim runs only for a user past the door, and forgets the id only on the server’s answer',
   /if \(user\) alertsClaim\(\);/.test(pfn('authCheck')) && /if \(r\.ok\) \{\s*try \{ localStorage\.removeItem\('ch_user'\)/.test(pfn('alertsClaim')));
ok('page: the alerts calls send the token and no user id', /'\/api\/alerts', \{ headers: \{ Authorization: 'Bearer ' \+ token/.test(pfn('loadAlerts')) && !/user_id: CH_USER/.test(H));

if (process.argv.includes('--table')) {
  console.log('\n| route | method | level | where it checks / why public |\n|---|---|---|---|');
  for (const f of found) console.log(`| \`${f.path}\` | ${f.method.toUpperCase()} | ${f.level || '?'} | ${f.level === 'public' ? f.reason : f.level === 'tooling' ? 'server.js:' + f.line + ' `toolingKey.require` (X-CardHunt-Key)' : f.level === 'catalogue' ? 'server.js:' + f.line + ' `access.optional` (prices stripped unless approved)' : 'server.js:' + f.line + ' `access.' + f.level + '`'} |`);
}

// ── live: boot the server and ask ──────────────────────────────
const PORT = process.env.TEST_PORT || 3997, BASE = 'http://127.0.0.1:' + PORT;
const SECRET = 'access-test-secret', SUPA = 'https://access-test.supabase.co';
const TKEY = crypto.randomBytes(24).toString('base64url');   // the tooling key, this run only
const ID = { approved: '11111111-1111-4111-8111-111111111111', pending: '22222222-2222-4222-8222-222222222222',
             rejected: '33333333-3333-4333-8333-333333333333', master: '44444444-4444-4444-8444-444444444444',
             master2: '55555555-5555-4555-8555-555555555555' };
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
const m = new Map(${JSON.stringify([[ID.approved, 'approved'], [ID.rejected, 'rejected'], [ID.master, 'rejected'], [ID.master2, 'pending']])});
// Emails as touch() captures them. master2 is a listed address whose row says pending.
const em = new Map(${JSON.stringify([[ID.approved, 'approved@example.com'], [ID.master, 'master@example.com'], [ID.master2, 'roy@cardzon.com']])});
roles.setStore({ get: async id => m.get(id) || null, emailFor: async id => em.get(id) || null,
  touch: async (id, e) => { if (!m.has(id)) m.set(id, 'pending'); if (e) em.set(id, String(e).toLowerCase()); },
  decide: async (id, s, by) => { if (!m.has(id)) return null; m.set(id, s); return { user_id: id, state: s, decided_by: by }; },
  list: async () => [...m].map(([user_id, state]) => ({ user_id, state, email: em.get(user_id) || null })) });`);

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
           SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: SECRET, CARDZON_MASTER_EMAILS: 'master@example.com, roy@cardzon.com',
           CARDZON_TOOLING_KEY: TKEY },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; server.stderr.on('data', d => { err += d; }); server.stdout.on('data', () => {});
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { try { await fetch(BASE + '/api/auth/config'); up = true; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  if (!up) { console.log('\nCOULD NOT BOOT server.js — the live half was not tested.\n' + err); fs.unlinkSync(preload); process.exit(2); }

  try {
    const gated = found.filter(f => f.level === 'approved' || f.level === 'master');   // tooling: toolingkey.test.js
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

    const pricedR = found.filter(f => f.level === 'priced');
    console.log('\n  live: every priced route (' + pricedR.length + ') — prices, listings, links — every kind of caller');
    for (const f of pricedR) {
      const p = sample(f.path), k = f.method.toUpperCase() + ' ' + f.path;   // a priced POST is probed as a POST
      let r = await ask(f.method, p, null);
      ok(`${k}  no token -> 401, nothing but the refusal`, r.status === 401 && r.body && r.body.error === 'sign-in required' && Object.keys(r.body).length <= 2, r.status + ' ' + r.text.slice(0, 80));
      r = await ask(f.method, p, TOK.pending);
      ok(`${k}  pending -> 403`, r.status === 403 && r.body.state === 'pending', r.status + ' ' + r.text.slice(0, 60));
      r = await ask(f.method, p, TOK.forged);
      ok(`${k}  pending with forged role claims -> 403`, r.status === 403, String(r.status));
      r = await ask(f.method, p, TOK.rejected);
      ok(`${k}  rejected -> 403`, r.status === 403 && r.body.state === 'rejected', String(r.status));
      r = await ask(f.method, p, TOK.approved);
      ok(`${k}  approved -> past the gate`, r.status !== 401 && r.status !== 403, r.status + ' ' + r.text.slice(0, 60));
      r = await fetch(BASE + p, { method: f.method.toUpperCase(), headers: { 'X-CardHunt-Key': TKEY, 'Content-Type': 'application/json' }, body: f.method === 'get' ? undefined : '{}' }).then(x => x.status);
      ok(`${k}  tooling key -> past the gate`, r !== 401 && r !== 403, String(r));
      r = await fetch(BASE + p, { method: f.method.toUpperCase(), headers: { 'X-CardHunt-Key': TKEY + 'x', 'X-CardHunt-Origin': 'tooling', 'Content-Type': 'application/json' }, body: f.method === 'get' ? undefined : '{}' }).then(x => x.status);
      ok(`${k}  wrong tooling key with the origin claim -> 401`, r === 401, String(r));
    }
    let tr = await fetch(BASE + '/api/alerts', { headers: { 'X-CardHunt-Key': TKEY } });
    ok('the tooling key is NOT a user: /api/alerts with it -> 401', tr.status === 401, String(tr.status));
    tr = await fetch(BASE + '/api/admin/users', { headers: { 'X-CardHunt-Key': TKEY } });
    ok('... nor a master: /api/admin/users with it -> 401', tr.status === 401, String(tr.status));

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
    const all = b => [].concat(b.pending, b.approved, b.rejected, b.masters);
    const where = (b, id) => ['pending', 'approved', 'rejected', 'masters'].filter(k => b[k].some(u => u.userId === id));
    ok('a master whose stored row says pending is listed under masters only, never in the waiting queue',
       JSON.stringify(where(r.body, ID.master2)) === '["masters"]', JSON.stringify(where(r.body, ID.master2)));
    ok('a master whose stored row says rejected: masters only', JSON.stringify(where(r.body, ID.master)) === '["masters"]', JSON.stringify(where(r.body, ID.master)));
    ok("every master's row says role master, not its stored state", r.body.masters.length >= 2 && r.body.masters.every(u => u.role === 'master'), JSON.stringify(r.body.masters.map(u => u.role)));
    ok('a non-master keeps its stored state as its role', all(r.body).filter(u => u.userId === ID.approved).every(u => u.role === 'approved'));
    r = await ask('post', '/api/admin/users/' + ID.master2 + '/reject', TOK.master);
    ok('rejecting another master: 409, refused', r.status === 409 && /master/.test(r.body.error), r.status + ' ' + r.text);
    r = await ask('post', '/api/admin/users/' + ID.master2 + '/approve', TOK.master);
    ok('approving another master: 409 too (nothing to decide)', r.status === 409, r.status + ' ' + r.text);
    r = await ask('get', '/api/admin/users', TOK.master);
    ok('... and nothing was recorded: still listed under masters', JSON.stringify(where(r.body, ID.master2)) === '["masters"]');
    r = await ask('get', '/api/alerts/anon-abc12345', null);
    ok('the old /api/alerts/:userId read is gone (404), not silently public', r.status === 404, String(r.status));
  } finally { server.kill(); try { fs.unlinkSync(preload); } catch (e) {} }

  // --db: the claim against the real alerts table, as a throwaway master
  // (a listed email — no user_access row is needed or made). One row on a
  // throwaway anon id, status 'deleted' so nothing evaluates it, removed
  // at the end whatever happened.
  if (process.argv.includes('--db')) {
    console.log('\n  --db: claiming alerts made before sign-in, against Supabase');
    const db = require('./schemaguard').testPool();   // refuses schema changes
    let subj = '00000000-0000-4000-8000-000000000000';   // the record test's throwaway account, removed in finally
    const who = crypto.randomUUID(), anon = 'anon-zz' + crypto.randomBytes(4).toString('hex'), other = 'anon-zy' + crypto.randomBytes(4).toString('hex');
    const tm = token(who, 'claimtest@example.com');
    const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), EBAY_ENABLED: 'false', SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', CARDZON_SCHEMA_GUARD: '1',
             SUPABASE_JWT_SECRET: SECRET, CARDZON_MASTER_EMAILS: 'claimtest@example.com' }, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
    try {
      for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/auth/config'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
      const mk = id => db.query(`INSERT INTO alerts (user_id, card_api_id, card_name, alert_type, target_price, status)
        VALUES ($1, 'en-base1-4', 'access.test claim', 'below', 5, 'deleted') RETURNING id`, [id]).then(x => x.rows[0].id);
      const mine = await mk(anon), notMine = await mk(other);
      let r = await ask('post', '/api/alerts/claim', tm, { anonId: anon });
      ok('claim: 200, moved 1', r.status === 200 && r.body.moved === 1, r.text);
      let row = (await db.query('SELECT user_id FROM alerts WHERE id = $1', [mine])).rows[0];
      ok('the row now belongs to the caller\'s user id', row && row.user_id === who, JSON.stringify(row));
      row = (await db.query('SELECT user_id FROM alerts WHERE id = $1', [notMine])).rows[0];
      ok('another anon id\'s row is untouched', row && row.user_id === other, JSON.stringify(row));
      r = await ask('post', '/api/alerts/claim', tm, { anonId: anon });
      ok('claiming again moves nothing (0), and refuses nothing', r.status === 200 && r.body.moved === 0, r.text);
      r = await ask('post', '/api/alerts/claim', tm, { anonId: 'anon' });
      ok('the shared private-window id "anon" is refused (400)', r.status === 400, r.text);
      r = await ask('post', '/api/alerts/claim', null, { anonId: other });
      ok('no token: 401, and the row stays where it was', r.status === 401
         && (await db.query('SELECT user_id FROM alerts WHERE id = $1', [notMine])).rows[0].user_id === other);

      console.log('\n  --db: one user\'s record (T2), a throwaway account');
      subj = crypto.randomUUID();
      await db.query(`INSERT INTO user_access (user_id, state, email, decided_by, decided_at) VALUES ($1, 'approved', 'record.test@example.com', $2, now())`, [subj, who]);
      await db.query(`INSERT INTO alerts (user_id, card_api_id, card_name, alert_type, target_price, status) VALUES ($1, 'en-base1-4', 'Charizard', 'below', 250, 'deleted')`, [subj]);
      await db.query(`INSERT INTO portfolio (user_id, card_api_id, card_name, grade, quantity, purchase_price) VALUES ($1, 'en-base1-4', 'Charizard', 'PSA 8', 1, 300)`, [subj]);
      r = await ask('get', '/api/admin/users/' + subj + '/record', tm);
      const b = r.body || {};
      ok('record: 200 for a master', r.status === 200, r.status + ' ' + r.text.slice(0, 100));
      ok('record: email, id, first and last seen', b.account && b.account.email === 'record.test@example.com' && b.account.userId === subj && !!b.account.firstSignedInAt && !!b.account.lastSeenAt);
      ok('record: state approved, with its date', b.state && b.state.state === 'approved' && !!b.state.since && b.state.sinceIs === 'decided');
      ok('record: their alert — card, target, state, created, last triggered (null = never)', b.alerts && b.alerts.length === 1 && b.alerts[0].card === 'Charizard'
         && b.alerts[0].target.price === 250 && b.alerts[0].state === 'deleted' && !!b.alerts[0].createdAt && b.alerts[0].lastTriggeredAt === null, JSON.stringify(b.alerts));
      ok('record: their portfolio row, with its date', b.portfolio && b.portfolio.length === 1 && b.portfolio[0].grade === 'PSA 8' && !!b.portfolio[0].createdAt, JSON.stringify(b.portfolio));
      ok('record: claimed browser ids said to be NOT recorded', b.claimedBrowserIds && b.claimedBrowserIds.recorded === false);
      ok('record: nothing beyond the listed fields (no token, IP, agent, session)', !/token|ip_?addr|user_?agent|session/i.test(JSON.stringify(Object.keys(b)) + JSON.stringify(Object.keys(b.account || {}))));
      const before = JSON.stringify((await db.query('SELECT * FROM alerts WHERE user_id = $1', [subj])).rows);
      await ask('get', '/api/admin/users/' + subj + '/record', tm);
      ok('record: reading it changed nothing', JSON.stringify((await db.query('SELECT * FROM alerts WHERE user_id = $1', [subj])).rows) === before);
      r = await ask('get', '/api/admin/users/99999999-9999-4999-8999-999999999999/record', tm);
      ok('record: an id that never signed in -> 404', r.status === 404, r.text);
    } finally {
      srv.kill();
      await db.query('DELETE FROM alerts WHERE user_id = ANY($1)', [[who, anon, other, subj]]);
      await db.query('DELETE FROM portfolio WHERE user_id = $1', [subj]);
      await db.query('DELETE FROM user_access WHERE user_id = $1::uuid', [subj]);
      await db.end();
    }
  }

  console.log('\n  access.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
