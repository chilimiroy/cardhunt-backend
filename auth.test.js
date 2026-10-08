// auth.test.js — sign-in, T6 step 1 (2026-10-06)
//
// The server decides who is signed in (auth.js verify), from the Supabase
// access token; the page shows a signed-in state only from /api/me's answer.
// Tested both ways: what it ACCEPTS (a real ES256 token, a legacy HS256
// token) and what it refuses. Offline: keys are generated here and the
// JWKS fetch is stubbed.

const crypto = require('crypto');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const URL_ = 'https://example-ref.supabase.co';
process.env.SUPABASE_URL = URL_;
process.env.SUPABASE_ANON_KEY = 'anon-public-key';
process.env.SUPABASE_JWT_SECRET = 'legacy-secret-for-tests';
const auth = require('./auth.js');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'kid-1', alg: 'ES256', use: 'sig' });
let jwksCalls = 0;
auth._setFetch(async u => { jwksCalls++; return { ok: u === URL_ + '/auth/v1/.well-known/jwks.json', status: 200, json: async () => ({ keys: [jwk] }) }; });

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const claims = (over) => Object.assign({ sub: 'user-uuid-1', email: 'a@example.com', aud: 'authenticated', iss: URL_ + '/auth/v1',
  exp: now + 3600, app_metadata: { provider: 'google' } }, over || {});
function es256(payload, header, key) {
  const h = b64(Object.assign({ alg: 'ES256', typ: 'JWT', kid: 'kid-1' }, header || {})), p = b64(payload);
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: key || privateKey, dsaEncoding: 'ieee-p1363' });
  return h + '.' + p + '.' + sig.toString('base64url');
}
function hs256(payload, secret) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload);
  return h + '.' + p + '.' + crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
}

(async () => {
  console.log('\n  what it ACCEPTS');
  let v = await auth.verify(es256(claims()));
  ok('a real ES256 token from this project: signed in, id + email + provider', v.ok && v.user.id === 'user-uuid-1' && v.user.email === 'a@example.com' && v.user.provider === 'google', JSON.stringify(v));
  v = await auth.verify(hs256(claims({ app_metadata: { provider: 'email' } }), 'legacy-secret-for-tests'));
  ok('a legacy HS256 token signed with SUPABASE_JWT_SECRET: signed in', v.ok && v.user.provider === 'email', JSON.stringify(v));
  ok('the signing keys are fetched once and cached', jwksCalls === 1, jwksCalls + ' fetches');

  console.log('\n  what it REFUSES — each with a reason');
  const bad = [
    ['tampered payload (another user id)', (() => { const t = es256(claims()).split('.'); t[1] = b64(claims({ sub: 'someone-else' })); return t.join('.'); })(), /signature/],
    ['signed by another key', es256(claims(), null, crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey), /signature/],
    ['expired', es256(claims({ exp: now - 10 })), /expired/],
    ['issued by another Supabase project', es256(claims({ iss: 'https://other.supabase.co/auth/v1' })), /another project/],
    ['the anon key itself (role anon, not a user)', es256(claims({ aud: 'anon' })), /not a signed-in user/],
    ['no user id', es256(claims({ sub: undefined })), /no user id/],
    ['an unknown key id', es256(claims(), { kid: 'kid-unknown' }), /unknown signing key/],
    ['alg "none"', b64({ alg: 'none' }) + '.' + b64(claims()) + '.', /not accepted/],
    ['HS256 with the wrong secret', hs256(claims(), 'guessed-secret'), /signature/],
    ['not a token', 'hello', /not a token/],
  ];
  for (const [name, tok, why] of bad) { const r = await auth.verify(tok); ok('refused: ' + name, !r.ok && why.test(r.reason || ''), r.reason || 'ACCEPTED'); }
  delete process.env.SUPABASE_JWT_SECRET;
  v = await auth.verify(hs256(claims(), 'legacy-secret-for-tests'));
  ok('a legacy token with no secret set is refused, and says so', !v.ok && /SUPABASE_JWT_SECRET/.test(v.reason), v.reason);
  process.env.SUPABASE_JWT_SECRET = 'legacy-secret-for-tests';

  console.log('\n  configuration is read at call time; the secret is never published');
  let pc = auth.publicConfig();
  ok('public config: url and anon key, nothing else', pc.enabled && pc.url === URL_ && pc.anonKey === 'anon-public-key' && Object.keys(pc).length === 3);
  ok('the JWT secret never appears in the public config', !JSON.stringify(pc).includes('legacy-secret'));
  const saved = process.env.SUPABASE_ANON_KEY; delete process.env.SUPABASE_ANON_KEY;
  pc = auth.publicConfig();
  ok('unset key: sign-in off, and it says which variable', !pc.enabled && /SUPABASE_ANON_KEY/.test(pc.reason), pc.reason);
  ok('unset key: every token refused', !(await auth.verify(es256(claims()))).ok);
  process.env.SUPABASE_ANON_KEY = saved;
  ok('bearer() reads "Authorization: Bearer x" only', auth.bearer({ headers: { authorization: 'Bearer abc.def.ghi' } }) === 'abc.def.ghi'
     && auth.bearer({ headers: { authorization: 'Basic abc' } }) === null && auth.bearer({ headers: {} }) === null);

  console.log('\n  wired: server and page');
  const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
  ok('server requires auth.js', /const auth = require\('\.\/auth'\);/.test(S));
  const meAt = S.indexOf("app.get('/api/me'"), me = S.slice(meAt, S.indexOf('\n});', meAt) + 4);
  ok('/api/me answers signedIn:true only after auth.verify succeeds', /const v = await auth\.verify\(token\);\n\s*if \(!v\.ok\) return res\.status\(401\)/.test(me) && /signedIn: true, user: v\.user/.test(me));
  ok('/api/auth/config publishes auth.publicConfig() only', /app\.get\('\/api\/auth\/config'[\s\S]{0,120}auth\.publicConfig\(\)/.test(S));
  const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
  const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
  const writers = (H.match(/AUTH\.user = /g) || []).length;
  ok('ONE writer of the signed-in user: authCheck, from /api/me', writers === 1 && /AUTH\.user = user;/.test(fn('authCheck'))
     && /\/api\/me', \{ headers: \{ Authorization: 'Bearer ' \+ session\.access_token/.test(fn('authCheck')) && /j\.signedIn\) user = j\.user/.test(fn('authCheck')));
  ok('no password field: the emailed link is the credential', !/type=["']?password/i.test(H));
  ok('"link sent" is said only after Supabase accepts the request', /if \(r\.error\) authSay\(r\.error\.message, true\);\n\s*else authSay\('Supabase accepted/.test(fn('authEmail')));
  ok('the sign-in library is pinned by version and integrity hash', /supabase-js@2\.\d+\.\d+\/dist\/umd\/supabase\.js/.test(H) && /integrity: 'sha384-[A-Za-z0-9+/=]{64}'/.test(H)
     && /s\.integrity = SUPABASE_JS\.integrity/.test(fn('authLoadLib')));
  ok('offered only over http(s), never on the file:// fallback', /if \(!\/\^https\?:\$\/\.test\(location\.protocol\)\) return;/.test(fn('authInit')));
  ok('the button is hidden until sign-in is configured', /b\.style\.display = AUTH\.sb \? '' : 'none'/.test(fn('authButtons')) && /id="auth-btn" style="display:none"/.test(H) && !/id="auth-btn2"/.test(H));   // one bar (T7, 2026-10-08): one button
  // Step 2 (roles, gate, door, approval, RLS, alerts) is tested in roles / access / door / rls .test.js.
  ok('the env name is CARDZON_MASTER_EMAILS, never CARDHUNT_', !/CARDHUNT_MASTER_EMAILS/.test(S + H));

  console.log('\n  auth.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
