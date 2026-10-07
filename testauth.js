// testauth.js — an APPROVED test account's session, for the live checks (2026-10-07)
//
// Since the door (prices, listings and links need an approved account),
// every live check that reads a price ran signed out, saw nothing, and
// either skipped or — worse — passed on nothing ("agree on price (0 cards)").
// The suite's live count fell 29 -> 24 the day the door shipped. This mints a
// short-lived session for ONE dedicated test account so those checks run
// again, through the same server-side verification a real sign-in gets.
//
// Needs (Windows user variables, or the process environment):
//   CARDZON_TEST_EMAIL            the test account's email — a real Supabase
//                                 user, APPROVED by a master in the masters'
//                                 list. This file never creates or approves one.
//   CARDZON_SUPABASE_SERVICE_KEY  the project's service-role key (secret; it
//                                 can mint a session for any user — local only,
//                                 never on Render, never printed).
// The Supabase URL and anon key are public: read from SUPABASE_URL /
// SUPABASE_ANON_KEY, else from the server's /api/auth/config.
//
// How: admin generate_link (magiclink, no email is sent) -> verify its
// token_hash -> a session's access token -> OUR /api/me must say signed in
// AND approved. Anything less: no token, and `why` says exactly what is
// missing, so a check that cannot run says so instead of passing on nothing.
// The token is held in memory for this process only and never logged.

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const ENV_EMAIL = 'CARDZON_TEST_EMAIL', ENV_SERVICE = 'CARDZON_SUPABASE_SERVICE_KEY';

// A Windows user variable set after this shell started is not in
// process.env; read it from the registry. The value is never printed.
function readVar(name) {
  if (process.env[name]) return process.env[name];
  // testauth.test.js reads the process environment only, so its answers do
  // not depend on what this machine's registry holds.
  if (process.platform !== 'win32' || process.env.CARDZON_TESTAUTH_NO_REGISTRY === '1') return '';
  try {
    const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(new RegExp('^\\s*' + name + '\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$', 'm'));
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

let _session = null;
async function testSession() {
  if (_session) return _session;
  const email = readVar(ENV_EMAIL), service = readVar(ENV_SERVICE);
  const missing = [!email && ENV_EMAIL, !service && ENV_SERVICE].filter(Boolean);
  if (missing.length) return (_session = { token: null, why: 'not set: ' + missing.join(', ') });
  try {
    let url = readVar('SUPABASE_URL'), anon = readVar('SUPABASE_ANON_KEY');
    if (!url || !anon) {
      const c = await (await fetch(BASE + '/api/auth/config')).json();
      url = url || c.url; anon = anon || c.anonKey;
    }
    if (!url || !anon) return (_session = { token: null, why: 'no Supabase URL / anon key (env or /api/auth/config)' });
    const admin = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
    // The account must already exist: never create one here.
    const list = await fetch(url + '/auth/v1/admin/users?page=1&per_page=1000', { headers: admin });
    if (!list.ok) return (_session = { token: null, why: 'admin users list refused (HTTP ' + list.status + ') — is ' + ENV_SERVICE + ' the service-role key?' });
    const users = ((await list.json()).users) || [];
    if (!users.some(u => String(u.email || '').toLowerCase() === email.toLowerCase()))
      return (_session = { token: null, why: 'no Supabase user ' + email + ' — create it and have a master approve it' });
    const gl = await fetch(url + '/auth/v1/admin/generate_link', { method: 'POST', headers: admin,
      body: JSON.stringify({ type: 'magiclink', email }) });
    if (!gl.ok) return (_session = { token: null, why: 'generate_link refused (HTTP ' + gl.status + ')' });
    const g = await gl.json();
    const hash = g.hashed_token || (g.properties && g.properties.hashed_token);
    if (!hash) return (_session = { token: null, why: 'generate_link returned no hashed_token' });
    const vr = await fetch(url + '/auth/v1/verify', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: hash }) });
    if (!vr.ok) return (_session = { token: null, why: 'verify refused (HTTP ' + vr.status + ')' });
    const token = (await vr.json()).access_token;
    if (!token) return (_session = { token: null, why: 'verify returned no access_token' });
    // Our server decides, as it does for a person.
    const me = await (await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + token } })).json();
    if (!me.signedIn) return (_session = { token: null, why: 'our /api/me refused the session: ' + (me.reason || '?') });
    if (me.state !== 'approved' && me.role !== 'master')
      return (_session = { token: null, why: 'the test account is ' + (me.state || me.role || 'not approved') + ' — a master must approve it' });
    return (_session = { token, why: null, email, role: me.role, state: me.state });
  } catch (e) { return (_session = { token: null, why: 'session not minted: ' + String(e && e.message || e).slice(0, 100) }); }
}

// fetch options for a live check: the session when there is one.
function authed(session) {
  return session && session.token ? { headers: { Authorization: 'Bearer ' + session.token } } : {};
}

module.exports = { testSession, authed, readVar, ENV_EMAIL, ENV_SERVICE };

// `node testauth.js` — does a session mint? Prints the outcome, never the token.
if (require.main === module) {
  testSession().then(s => {
    console.log(s.token ? 'test session: OK (' + s.email + ', ' + (s.state || s.role) + ')' : 'test session: none — ' + s.why);
    process.exitCode = s.token ? 0 : 1;
  });
}
