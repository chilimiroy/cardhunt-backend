// testauth.test.js — the live suites' test session, offline (2026-10-07)
//
// testauth.js mints a session for ONE approved test account so the checks the
// door hid run again. Against a stand-in Supabase and server: it names what is
// missing, never creates a user, accepts only an APPROVED account (our
// /api/me decides), and never puts the token in a `why`.

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const fresh = () => { delete require.cache[require.resolve('./testauth.js')]; return require('./testauth.js'); };
const TOKEN = 'eyJ.SECRET-SESSION.sig';
function stand(opts) {
  const calls = [];
  global.fetch = async (url, init) => {
    init = init || {}; calls.push({ url: String(url), method: init.method || 'GET' });
    const j = b => ({ ok: true, status: 200, json: async () => b });
    if (/\/api\/auth\/config$/.test(url)) return j({ enabled: true, url: 'https://x.supabase.co', anonKey: 'anon' });
    if (/\/auth\/v1\/admin\/users/.test(url)) return j({ users: opts.users || [] });
    if (/\/auth\/v1\/admin\/generate_link$/.test(url)) return j({ properties: { hashed_token: 'h' } });
    if (/\/auth\/v1\/verify$/.test(url)) return j({ access_token: TOKEN });
    if (/\/api\/me$/.test(url)) return j(opts.me || { signedIn: true, state: 'approved', role: 'user' });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return calls;
}
const set = (e, k) => { process.env.CARDZON_TEST_EMAIL = e || ''; process.env.CARDZON_SUPABASE_SERVICE_KEY = k || ''; };

(async () => {
  // The process environment only: the answers must not depend on this machine's registry.
  process.env.CARDZON_TESTAUTH_NO_REGISTRY = '1';
  set('', ''); stand({});
  let t = fresh(), s = await t.testSession();
  ok('nothing set: no token, and names both missing variables', !s.token && /CARDZON_TEST_EMAIL/.test(s.why) && /CARDZON_SUPABASE_SERVICE_KEY/.test(s.why), s.why);

  set('tests@cardzon.example', 'service');
  let calls = stand({ users: [] }); t = fresh(); s = await t.testSession();
  ok('the test user does not exist: no token, says so', !s.token && /no Supabase user/.test(s.why), s.why);
  ok('...and NEVER creates one (no POST to admin/users)', !calls.some(c => /admin\/users/.test(c.url) && c.method !== 'GET'));

  calls = stand({ users: [{ email: 'tests@cardzon.example' }], me: { signedIn: true, state: 'pending', role: 'user' } });
  t = fresh(); s = await t.testSession();
  ok('a PENDING account: no token — a master must approve it', !s.token && /pending/.test(s.why) && /approve/.test(s.why), s.why);
  ok('...the token never appears in why', !String(s.why).includes(TOKEN));
  ok('...and nothing approves it (no write to our server)', !calls.some(c => /cardhunt|onrender/.test(c.url) && c.method !== 'GET'));

  stand({ users: [{ email: 'tests@cardzon.example' }], me: { signedIn: false, reason: 'bad signature' } });
  t = fresh(); s = await t.testSession();
  ok('our server refuses the session: no token, its reason', !s.token && /bad signature/.test(s.why), s.why);

  calls = stand({ users: [{ email: 'Tests@CardZon.example' }] });
  t = fresh(); s = await t.testSession();
  ok('an APPROVED account: a token, checked by our /api/me', s.token === TOKEN && calls.some(c => /\/api\/me$/.test(c.url)));
  ok('authed() sends it as a bearer header', t.authed(s).headers.Authorization === 'Bearer ' + TOKEN && JSON.stringify(t.authed({ token: null })) === '{}');
  ok('minted without sending an email (generate_link -> verify, no /otp or /magiclink send)', !calls.some(c => /\/auth\/v1\/(otp|magiclink)$/.test(c.url)));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
