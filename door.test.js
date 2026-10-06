// door.test.js — the closed door (T6 step 2, 2026-10-06)
//
// A signed-in account that is not approved sees a waiting screen and
// nothing else; a signed-out visitor never sees it. Decided only by
// /api/me's answer; a session that cannot be confirmed is CLOSED.
//
// The head script and the role mapping are EXECUTED here (vm), not only
// read: both directions — who gets the door and who must not.

const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };

console.log('\n  the head script: who is held at the door before the first paint');
const head = H.slice(0, H.indexOf('</head>'));
const doorLine = head.split('\n').find(l => l.includes("classList.add('ch-door')")) || '';
ok('a head script sets ch-door', !!doorLine);
function runHead(protocol, keys, search) {
  const cls = new Set();
  const store = Object.assign({}, keys);
  const ctx = { location: { protocol, search: search || '' },
    localStorage: { get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i], getItem: k => store[k] },
    document: { documentElement: { classList: { add: c => cls.add(c) } } } };
  vm.runInNewContext(doorLine, ctx);
  return cls.has('ch-door');
}
ok('ALLOWS: a signed-out visitor (empty storage) is not held', !runHead('https:', {}));
ok('ALLOWS: unrelated storage (theme, lang, old anon id) is not a session', !runHead('https:', { ch_theme: 'dark', ch_lang: 'ja', ch_user: 'anon-x' }));
ok('ALLOWS: a half-finished sign-in (code verifier only) is not a session', !runHead('https:', { 'sb-ref-auth-token-code-verifier': 'v' }));
ok('ALLOWS: the file:// fallback is never held (no sign-in there)', !runHead('file:', { 'sb-ref-auth-token': '{}' }));
ok('HOLDS: a stored Supabase session', runHead('https:', { 'sb-opztouqaetxyfyhcwvwa-auth-token': '{}' }));
ok('HOLDS: returning from Google with ?code= (the session is being made)', runHead('https:', {}, '?code=abc'));

console.log('\n  the role -> door mapping, executed');
const ar = vm.runInNewContext(fn('authRole') + '; authRole');
ok('master: open', ar('master') === null);
ok('approved: open', ar('approved') === null);
ok('pending: the door', ar('pending') === 'pending');
ok('rejected: the door', ar('rejected') === 'rejected');
ok('anything else (null, undefined, a new word): closed, unconfirmed', ar(null) === 'unconfirmed' && ar(undefined) === 'unconfirmed' && ar('admin') === 'unconfirmed');

console.log('\n  wired');
ok('CSS: under ch-door everything but #door is hidden', /html\.ch-door body > \*:not\(#door\) \{ display: none !important; \}/.test(H));
ok('#door is the first thing in <body>', /<body>\n<div id="door"/.test(H));
const ac = fn('authCheck');
ok('the door is set only in authCheck, from /api/me', (H.match(/doorSet\(door/g) || []).length === 1 && /doorSet\(door, email\)/.test(ac) && /\/api\/me'/.test(ac));
ok('/api/me unreachable: closed (unconfirmed)', /catch \(e\) \{ door = 'unconfirmed'/.test(ac));
ok('/api/me 503 (state unreadable): closed', /else if \(j\.signedIn\) door = 'unconfirmed'/.test(ac));
ok('behind the door there is no signed-in user on the page', /if \(door\) \{ user = null; role = null; \}/.test(ac));
const ai = fn('authInit');
ok('config, sign-in library: each failure with a held session closes the door', (ai.match(/return closed\(\)/g) || []).length === 3);
ok('the door offers Sign out, which works even without the library', /doorSignOut\(\)/.test(fn('doorSet')) && /localStorage\.removeItem\(k\)/.test(fn('doorSignOut')));
ok('the door states the email, as /api/me returned it', /liveEsc\(DOOR\.email\)/.test(fn('doorSet')));
ok('a page never reads a role from the token itself', !/access_token\.split|atob\(/.test(H));

console.log('\n  door.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
