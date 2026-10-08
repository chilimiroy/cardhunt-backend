// door.test.js — the door (T6 step 2, 2026-10-06; changed T1, 2026-10-07)
//
// Roy's door now: the CATALOGUE is public to everyone, signed in or not;
// PRICES, LISTINGS and LINKS are for approved accounts. The server
// withholds them (access.test.js, pricegate.test.js). The page only lays
// out: it starts with prices closed, opens them on /api/me's word, puts one
// plain note where each price block would be, and gives a pending or
// rejected account its waiting screen in the account panel — no longer a
// screen over the whole site.
//
// Executed here (vm), not only read: the head script, the role mapping,
// pricesOpen, the note's words, and the tiles both ways.

const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const m = new RegExp('(async )?function ' + name + '\\(').exec(H); return m ? H.slice(m.index, H.indexOf('\n}', m.index) + 2) : ''; };

console.log('\n  the head script: prices start closed, for everyone, before the first paint');
const head = H.slice(0, H.indexOf('</head>'));
const line = head.split('\n').find(l => l.includes("classList.add('ch-noprice')")) || '';
ok('a head script sets ch-noprice', !!line);
const runHead = () => { const cls = new Set(); vm.runInNewContext(line, { document: { documentElement: { classList: { add: c => cls.add(c) } } } }); return cls; };
ok('closed at first paint (no session, a session, file://: all the same — the server decides)', runHead().has('ch-noprice'));
ok('nothing holds the page any more: no ch-door, no #door, no "hide everything" rule',
   !/ch-door/.test(H) && !/id="door"/.test(H) && !/body > \*:not\(/.test(H));

console.log('\n  the role -> door mapping, executed');
const ar = vm.runInNewContext(fn('authRole') + '; authRole');
ok('master and approved: no door', ar('master') === null && ar('approved') === null);
ok('pending, rejected: their own door', ar('pending') === 'pending' && ar('rejected') === 'rejected');
ok('anything else (null, undefined, a new word): unconfirmed', ar(null) === 'unconfirmed' && ar(undefined) === 'unconfirmed' && ar('admin') === 'unconfirmed');
const po = r => vm.runInNewContext(fn('pricesOpen') + '; pricesOpen()', { AUTH: { role: r } });
ok('prices open for master and approved — ALLOWS', po('master') === true && po('approved') === true);
ok('prices closed for pending, rejected, signed out, unknown', [ 'pending', 'rejected', null, undefined, 'tooling', 'admin' ].every(r => po(r) === false));

console.log('\n  the CSS: one switch');
ok('html.ch-noprice hides every .price-only', /html\.ch-noprice \.price-only \{ display: none !important; \}/.test(H));
ok('the .price-door note shows only while prices are closed', /html:not\(\.ch-noprice\) \.price-door \{ display: none !important; \}/.test(H));
ok('doorSet sets the switch from pricesOpen(), and fills every note', /classList\.toggle\('ch-noprice', !pricesOpen\(\)\)/.test(fn('doorSet')) && /renderPriceDoors\(\)/.test(fn('doorSet')));

console.log('\n  the note: words, never a price-shaped placeholder');
const pdh = kind => vm.runInNewContext(fn('priceDoorHtml') + '; priceDoorHtml()', { DOOR: { kind }, AUTH: { sb: {} },
  DOOR_TEXT: vm.runInNewContext('(' + H.slice(H.indexOf('var DOOR_TEXT = ') + 16, H.indexOf('};', H.indexOf('var DOOR_TEXT = ')) + 1) + ')') });
for (const k of [null, 'checking', 'pending', 'rejected', 'unconfirmed']) {
  const h = pdh(k);
  ok(`note for ${k || 'signed out'}: says something, carries no digit, currency sign or dash`, h.length > 10 && !/[0-9$¥€£—–]|&#8212;|&mdash;|\\u2014/.test(h.replace(/<[^>]+>/g, '')), h.replace(/<[^>]+>/g, '').slice(0, 70));
}
ok('signed out: says prices are for approved accounts and offers Sign in', /approved accounts/.test(pdh(null)) && /authOpen\(\)/.test(pdh(null)));
ok('pending: says the account is waiting for approval', /waiting/.test(pdh('pending')));

console.log('\n  the page: where the prices would be');
const blk = id => { const i = H.indexOf(id); return i < 0 ? '' : H.slice(H.lastIndexOf('<', i), H.indexOf('>', i) + 1); };
// TASK-ui T1: one price column — the view area (boxes | history), its
// toggle and the selector — inside ONE .price-only, with a note beside it.
ok('card page: the price column sits inside .price-only, with a note beside it',
   /<div class="cdtop-r">\s*<div class="price-door" role="note"><\/div>\s*<div class="price-only cd-pricecol">\s*<div class="cd-viewwrap"/.test(H));
const col = H.slice(H.indexOf('<div class="price-only cd-pricecol">'), H.indexOf('<!-- /.price-only (price column) -->'));
ok('card page: boxes, history, the view toggle and the grade selector are all inside it',
   ['id="cd-mkt"', 'id="cd-chart"', 'id="cd-vtog"', 'id="cd-selector"'].every(s => col.includes(s)));
ok('card page: the listings are .price-only', /<div class="lbox price-only">/.test(H));
ok('the view toggle exists nowhere else, and does nothing with prices closed',
   (H.match(/id="cd-vtog"/g) || []).length === 1 && /function toggleCardView\(\)\{\s*if \(!pricesOpen\(\)\) return;/.test(H));
ok('card page: Set Alert and Watch are .price-only (Compare is parked: compare-disabled.js)', /class="btn price-only" onclick="addAlertFromCard\(\)"/.test(H) && /class="btn price-only" id="watch-btn"/.test(H));
const home = H.slice(H.indexOf('<div id="screen-home"'), H.indexOf('<div id="screen-pokemon"'));
// TASK-ui T8: search, best deals, browse by game, movers, alerts last.
ok('home: best deals is its own .price-only section, hidden until /api/deals says enabled',
   /<section id="home-deals-sec" class="price-only" hidden>\s*<div class="sec-h"[^>]*><div><div class="sec-t">💎 Best deals/.test(home) && /<div class="cg" id="home-deals"><\/div>/.test(home));
ok('home: movers then alerts inside one .price-only, a note before it',
   /<div class="price-door"[^>]*><\/div>\s*<div class="price-only">\s*<div class="sec-h"><div><div class="sec-t">📊 Biggest movers/.test(home)
   && home.indexOf('id="alerts-bar-items"') > home.indexOf('id="mv-gain-pct"')
   && home.indexOf('<!-- /.price-only (movers, alerts) -->') > home.indexOf('id="alerts-bar-items"'));
const at = s => home.indexOf(s);
ok('home order: search, deals, browse by game, movers, alerts',
   at('id="hero-q"') > 0 && at('id="hero-q"') < at('id="home-deals-sec"') && at('id="home-deals-sec"') < at('id="game-grid"')
   && at('id="game-grid"') < at('id="mv-gain-pct"') && at('id="mv-gain-pct"') < at('id="alerts-bar-items"'));
const pk = H.slice(H.indexOf('<div id="screen-pokemon"'), H.indexOf('<div id="screen-search"'));
ok('trending: inside .price-only, a note before it', /<div class="price-door"[^>]*><\/div>\s*<div class="price-only">\s*<div class="sec-h"/.test(pk) && pk.indexOf('/.price-only (trending)') > pk.indexOf('id="home-trending"'));
// The results screen's sort called sortResults(), which was never defined; it
// went with the results screen (T2, 2026-10-08). The set page's remain.
ok('set page: the price sorts are .price-only', /<option class="price-only" value="price-d">/.test(H) && /<option class="price-only" value="price">/.test(H)
   && !/sortResults/.test(H));

console.log('\n  the loaders: nothing is asked of a price endpoint while prices are closed');
for (const f of ['loadHomeMovers', 'loadHomeDeals', 'loadTrending', 'updateAlertsBar', 'renderLiveListings', 'renderListingFinder', 'loadHistory']) {
  const src = fn(f);
  ok(`${f} begins with whenPrices`, src.split('\n')[1] && /if \(!whenPrices\(function \(\) \{ \w+\.apply\(null, _a\); \}\)\) return/.test(src.split('\n')[1]), (src.split('\n')[1] || '').slice(0, 60));
}
const wp = (kind, role) => { let later = 0; const r = vm.runInNewContext(fn('pricesOpen') + fn('whenPrices') + '; whenPrices(function(){})',
  { DOOR: { kind }, AUTH: { role, ready: { then: () => { later++; } } } }); return { r, later }; };
ok('whenPrices: approved -> run now', wp(null, 'approved').r === true);
ok('whenPrices: closed -> not now, not later', wp(null, null).r === false && wp(null, null).later === 0);
ok('whenPrices: check still running -> not now, once it settles', wp('checking', null).r === false && wp('checking', null).later === 1);

console.log('\n  the tiles, executed both ways');
const tileCtx = open => ({ pricesOpen: () => open, getBase: c => c._price || 0, fmtCurrency: v => '$' + v.toFixed(2), imgOrSk: () => '<img>',
  nameWithEn: n => n, priceMarksHtml: () => '' });
const ct = (open, c) => vm.runInNewContext(fn('cardTile') + '; cardTile(c)', Object.assign(tileCtx(open), { c }));
const closed = ct(false, { id: 'en-base1-4', name: 'Charizard', number: '4', set: { name: 'Base' } });
ok('closed: a tile shows the card (name, set, number) and NO price row — no dash, no $0', /Charizard/.test(closed) && /Base/.test(closed) && /#4/.test(closed)
   && !/class="cr"/.test(closed) && !/&#8212;|\$/.test(closed), closed.replace(/<[^>]+>/g, '|').slice(0, 80));
const openT = ct(true, { id: 'en-base1-4', name: 'Charizard', number: '4', set: { name: 'Base' }, _price: 412.35 });
ok('open: the same tile shows its price — ALLOWS', /\$412\.35/.test(openT) && /class="cr"/.test(openT));
ok('getBase — every renderer\'s price — is 0 while closed (no withheld figure, no estimate, no third-party price)',
   /^function getBase\(c\) \{\n  if \(!c\) return 0;\n(  \/\/.*\n)*  if \(!pricesOpen\(\)\) return 0;/.test(fn('getBase')));
ok('mockP — the page\'s own estimator — returns nothing while closed', /^function mockP\([^)]*\) \{\n  if \(!pricesOpen\(\)\) return 0;/.test(fn('mockP')));
ok('set page tiles: no price row without prices', /\+\(pricesOpen\(\) \? '<div class="cr"><span class="cp">'\+priceStr\+estMark/.test(H));
ok('set page: the "where prices come from" note is not drawn while closed', /if \(!pricesOpen\(\)\) return;/.test(fn('setSourceNote')));
ok('search candidates: no price slot without prices', /pricesOpen\(\) \? '<span style="font-size:14px;font-weight:800">' \+ price \+ '<\/span>' : '<span><\/span>'/.test(H));
// (the tile's listing line — an eBay median — was removed 2026-10-08, API licence §9.5)
ok('summary tiles: no price line without prices, and no listing line at all', /\(pricesOpen\(\) \? '<div class="cr" style="margin-top:4px">' \+ price/.test(fn('cardSummaryTile')) && !/avg listing|noAvg/.test(fn('cardSummaryTile')));

console.log('\n  wired: the account, the waiting screen, the token');
const ac = fn('authCheck');
ok('the door is set only in authCheck, from /api/me', (H.match(/doorSet\(door/g) || []).length === 1 && /doorSet\(door, email\)/.test(ac) && /\/api\/me'/.test(ac));
ok('/api/me unreachable or 503: unconfirmed (closed)', /catch \(e\) \{ door = 'unconfirmed'/.test(ac) && /else if \(j\.signedIn\) door = 'unconfirmed'/.test(ac));
ok('not approved: no signed-in user on the page', /if \(door\) \{ user = null; role = null; \}/.test(ac));
ok('the level changing after the page settled reloads (never mixes the two)', /if \(AUTH\.settled && AUTH\.openSeen !== pricesOpen\(\)\) \{ location\.reload\(\); return; \}/.test(ac));
const ai = fn('authInit');
ok('config or library failing with a held session: closed', (ai.match(/return closed\(\)/g) || []).length === 3);
const rd = fn('authRender');
ok('the waiting screen is in the account panel: title, the email, the words, Sign out', /DOOR_TEXT\[DOOR\.kind\]/.test(rd) && /liveEsc\(DOOR\.email\)/.test(rd) && /doorSignOut\(\)/.test(rd) && /browse every set and card/.test(rd));
ok('... and opens by itself once a visit for pending / rejected', /\(DOOR\.kind === 'pending' \|\| DOOR\.kind === 'rejected'\) && !DOOR\.shown/.test(fn('doorSet')));
ok('the account button names the state', /'Awaiting approval'/.test(fn('authButtons')) && /'Not approved'/.test(fn('authButtons')));
ok('Sign out works even without the library', /localStorage\.removeItem\(k\)/.test(fn('doorSignOut')));
const wr = H.slice(H.indexOf('// ── The door: our API sees who is asking'), H.indexOf('})();', H.indexOf('// ── The door: our API sees who is asking')));
ok('every call to our API carries the session token; /api/me and /api/auth/config never wait', /h\.set\('Authorization', 'Bearer ' \+ t\)/.test(wr)
   && /\\\/api\\\/\(me\|auth\\\/config\)/.test(wr) && /await AUTH\.ready/.test(wr));
ok('a page never reads a role from the token itself', !/access_token\.split|atob\(/.test(H));

console.log('\n  door.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
