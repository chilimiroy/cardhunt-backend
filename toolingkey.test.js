// toolingkey.test.js — the eBay tooling probes refuse without the shared
// secret, and a refused request SPENDS NOTHING (security follow-up T1,
// 2026-10-06)
//
// Boots the real server.js under costmeter.js (eBay stubbed, every eBay
// HTTP request and every quota check/record counted, nothing sent), with
// eBay switched ON and dummy credentials, so a probe that got past the
// gate WOULD spend. Then, for each of the seven probes and quota?probe=1:
//   no header      -> 401, and the meter has not moved
//   wrong key      -> 401, and the meter has not moved
// and, so the meter is shown able to see a spend at all:
//   right key      -> past the gate, and the meter moves
// Last, a server with no key configured refuses even the right header
// (503): there is no fallback to open.
//
//   node toolingkey.test.js
'use strict';
require('./testcount')(49);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const tk = require('./toolingkey');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const PROBES = ['/api/ebay/conditions/en-base1-4', '/api/ebay/conditionvalues', '/api/ebay/certprobe/en-base1-4',
  '/api/ebay/setprobe/en-base1-4', '/api/ebay/gradecost/en-base1-4?grade=PSA%208', '/api/ebay/marketprobe/en-base1-4',
  '/api/ebay/aspects/en-base1-4', '/api/ebay/quota?probe=1'];
const KEY = crypto.randomBytes(24).toString('base64url');   // made here, never written anywhere
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolingkey-test-'));
const OUT = path.join(tmp, 'meter.json');
const meter = () => { try { const m = JSON.parse(fs.readFileSync(OUT, 'utf8')); return { http: m.ebayHttp.total, guarded: m.guarded.total }; } catch (e) { return { http: -1, guarded: -1 }; } };

console.log('\n  unit: the comparison');
process.env[tk.ENV] = KEY;
const fake = h => ({ get: n => h[n.toLowerCase()] });
ok('right key matches', tk.check(fake({ 'x-cardhunt-key': KEY })).ok === true);
ok('no header: 401', tk.check(fake({})).status === 401);
ok('wrong key: 401', tk.check(fake({ 'x-cardhunt-key': KEY + 'x' })).status === 401);
ok('a prefix of the key: 401', tk.check(fake({ 'x-cardhunt-key': KEY.slice(0, 10) })).status === 401);
ok('the refusal body never carries the key', !JSON.stringify(tk.check(fake({ 'x-cardhunt-key': 'nope' }))).includes(KEY));
process.env[tk.ENV] = 'short';
ok('a key shorter than ' + tk.MIN_LENGTH + ' on the server: closed (503), even if sent exactly', tk.check(fake({ 'x-cardhunt-key': 'short' })).status === 503);
delete process.env[tk.ENV];
ok('no key on the server: closed (503)', tk.check(fake({ 'x-cardhunt-key': KEY })).status === 503);
ok('headers() with nothing set sends no key', !('X-CardHunt-Key' in tk.headers()));

const S = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\r/g, '');
ok('the key is read from the header only — no query parameter carries it', !/req\.query\.(key|toolingKey|tooling_key)/i.test(S) && !/req\.query\[.?key/i.test(S));
const q = S.slice(S.indexOf("app.get('/api/ebay/quota'"), S.indexOf("app.get('/api/ebay/quota'") + 600);
ok('quota: the ?probe=1 key check is the first thing the handler does', /^app\.get\('\/api\/ebay\/quota', async \(req, res\) => \{\n(\s*\/\/.*\n)*\s*if \(req\.query\.probe === '1'[^\n]*\n\s*const k = toolingKey\.check\(req\);/.test(q));

async function boot(port, env) {
  const srv = spawn(process.execPath, ['-r', path.join(__dirname, 'costmeter.js'), path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    env: Object.assign({}, process.env, { PORT: String(port), DATABASE_URL: '', EBAY_ENABLED: 'true',
      EBAY_CLIENT_ID: 'dummy', EBAY_CLIENT_SECRET: 'dummy', COSTMETER_OUT: OUT, COSTMETER_CTRL: path.join(tmp, 'none.json') }, env),
    stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/auth/config`); return { srv, log: () => log }; }
    catch (e) { await new Promise(r => setTimeout(r, 200)); }
  }
  srv.kill(); throw new Error('server did not boot');
}
const get = (port, p, h) => fetch(`http://127.0.0.1:${port}` + p, { headers: h || {} })
  .then(async r => ({ status: r.status, text: await r.text() }));

(async () => {
  const PORT = +(process.env.TEST_PORT || 3996);
  let b;
  try {
    b = await boot(PORT, { [tk.ENV]: KEY });
    console.log('\n  live, eBay ON (stubbed), key set on the server');
    const m0 = meter();
    ok('the meter is running and starts at zero', m0.http === 0 && m0.guarded === 0, JSON.stringify(m0));
    for (const p of PROBES) {
      let r = await get(PORT, p);
      ok(`${p}  no key -> 401`, r.status === 401 && /tooling key required/.test(r.text), r.status + ' ' + r.text.slice(0, 70));
      r = await get(PORT, p, { 'X-CardHunt-Key': 'not-the-key-' + crypto.randomBytes(8).toString('hex') });
      ok(`${p}  wrong key -> 401, and the response does not echo the key`, r.status === 401 && !r.text.includes(KEY), String(r.status));
      r = await get(PORT, p, { 'X-CardHunt-Key': 'x', 'X-CardHunt-Origin': 'tooling' });
      ok(`${p}  claiming tooling origin is not a key -> 401`, r.status === 401, String(r.status));
    }
    const m1 = meter();
    ok(`NO QUOTA SPENT by ${PROBES.length * 3} refused requests: 0 eBay HTTP, 0 quota checks`, m1.http === 0 && m1.guarded === 0, JSON.stringify(m1));
    ok('the quota ledger read (no probe) stays open', [200, 500, 503].includes((await get(PORT, '/api/ebay/quota')).status)
       && (await get(PORT, '/api/ebay/quota')).status !== 401);

    console.log('\n  live, the right key — the guard is shown able to let a spend through');
    const r = await get(PORT, '/api/ebay/conditionvalues', { 'X-CardHunt-Key': KEY });
    const m2 = meter();
    ok('conditionvalues with the key: past the gate (not 401/503-closed)', r.status !== 401 && !/tooling probes are closed/.test(r.text), r.status + ' ' + r.text.slice(0, 70));
    ok('... and the meter saw it spend (so the 0 above is a real 0)', m2.http > 0, JSON.stringify(m2));
    ok('the server log never contains the key', !b.log().includes(KEY));
    b.srv.kill(); b = null;

    console.log('\n  live, no key configured on the server: no fallback to open');
    b = await boot(PORT, { [tk.ENV]: '' });
    const before = meter().http;
    for (const p of PROBES) {
      const x = await get(PORT, p, { 'X-CardHunt-Key': KEY });
      ok(`${p}  -> 503 closed, even with a key sent`, x.status === 503 && /tooling probes are closed/.test(x.text), x.status + ' ' + x.text.slice(0, 60));
    }
    ok('... and nothing spent', meter().http === before);
  } catch (e) { ok('ran to the end', false, e.message); }
  finally { if (b) b.srv.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n  toolingkey.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
