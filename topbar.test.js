// topbar.test.js — ONE top bar for every screen (Roy, 2026-10-08,
// TASK-reports-and-pages T7).
//
// There were nine copies of the bar, one per screen. The logo change had to
// be made nine times, and only Home carried account, theme, currency and
// language. One bar, defined once, outside the screens; what differs per
// screen is the TOPBAR table, applied by topbarFor(), which SS() calls.
//
//   node topbar.test.js
'use strict';
require('./testcount')(39);   // 36 -> 35 2026-10-10: theme / currency / language 'once' checks became one menu check (T1). Assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  topbar.test.js\n');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const body = H.slice(H.indexOf('<body'));
const markup = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');

const navs = markup.match(/<nav\b[\s\S]*?<\/nav>/g) || [];
ok('one <nav> in the page', navs.length === 1, navs.length);
const bar = navs[0] || '';
ok('it is #topbar', /<nav class="nav" id="topbar"/.test(bar));
const screens = [...markup.matchAll(/<div id="screen-([a-z]+)" class="screen/g)].map(m => m[1]);
ok('it sits outside every screen (before the first)', markup.indexOf('id="topbar"') < markup.indexOf('id="screen-'));
ok('no screen carries a nav of its own', !screens.some(s => { const i = markup.indexOf('id="screen-' + s + '"'); return /^[^]*?<nav/.test(markup.slice(i, i + 400)) && markup.slice(i, i + 400).includes('<nav'); }));

console.log('\n  the shared controls, once each, in the one bar');
const once = (re, what) => { const n = (markup.match(re) || []).length; ok(what + ': exactly one, in the bar', n === 1 && re.test(bar), n); };
once(/<use href="#cz-mark"\/><\/svg><span class="wm">Card<em>Zon<\/em><\/span>/g, 'logo + wordmark');
once(/id="acct-pick"/g, 'the account menu (theme, currency, language — TASK-account-and-bars T1)');
once(/id="auth-btn"/g, 'account / sign in');
once(/class="btn notif-bell"/g, 'alerts bell');
ok('theme, currency and language are no longer bar controls of their own', !/id="(theme-btn|cur-pick|lang-pick|currency-btn|lang-btn)"/.test(markup));
ok('currency is written into the menu only when prices are open — not .price-only CSS, not in the markup at all',
   /if \(pricesOpen\(\)\) h \+= '<div class="npick-h">Currency<\/div>' \+ pickItems\('cur'\);/.test(H) && !/Currency<\/div>/.test(markup.replace(/<script[\s\S]*?<\/script>/g, '')));
// Laptop widths (Roy, 2026-10-10): measured on the card screen with a 20-character email, the bar was
// 1,108-1,125 px wide at 641-1100 px. After: never wider than the window (641-1366), one row from 921.
ok('641-1180 px: a compact row — the search box shrinks, the account label is capped with an ellipsis',
  /@media\(min-width:641px\) and \(max-width:1180px\)\{[^]*?\.nav-r \.nsearch\{flex:0 1 150px;min-width:90px\}[^]*?\.auth-btn \.npick-v\{display:inline-block;max-width:120px;overflow:hidden;text-overflow:ellipsis/.test(H));
ok('641-920 px: the bar wraps into two rows, as on a phone',
  /@media\(min-width:641px\) and \(max-width:920px\)\{\s*\.nav\{height:auto;min-height:52px;flex-wrap:wrap;/.test(H));
ok('nav items in order: Home, Search, Sets — Search between Home and Sets',
  /data-nav="home"[^]*?data-nav="search"[^]*?data-nav="sets"/.test(bar));
// Roy, 2026-10-10: Portfolio is a page of the account screen, not a top-level screen.
ok('Portfolio has no top-bar item; the account menu carries it for accounts with prices',
  !/data-nav="portfolio"/.test(bar) && /\(pricesOpen\(\) \? acctItem\('Portfolio', "SS\(&quot;portfolio&quot;\)"\) : ''\)/.test(H));
ok('the portfolio route still works: SS(\'portfolio\') opens the account screen on its Portfolio page',
  /if\(id==='portfolio'\)\{ ACCT\.tab='portfolio'; id='account'; \}/.test(H) && /if\(id==='account'\) acctTab\(ACCT\.tab\);/.test(H)
  && !/id="screen-portfolio"/.test(H) && /<div id="acct-panel-portfolio" class="price-only" hidden>[\s\S]*?id="portfolio-rows"/.test(H));
ok('no second copy of any control (…2 ids)', !/id="(cur-pick2|lang-pick2|currency-btn2|lang-btn2|auth-btn2)"/.test(markup));

console.log('\n  per screen: data, applied by topbarFor');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('SS() calls topbarFor(id)', /topbarFor\(id\)/.test(fn('SS')));
const tb = H.slice(H.indexOf('var TOPBAR = {'), H.indexOf('\n};', H.indexOf('var TOPBAR = {')) + 3);
let TOPBAR = {};
try { TOPBAR = new Function(tb + '; return TOPBAR;')(); } catch (e) { ok('TOPBAR parses', false, e.message); }
ok('TOPBAR names every screen', screens.every(s => s in TOPBAR), screens.filter(s => !(s in TOPBAR)).join(', '));
ok('TOPBAR names no screen that does not exist', Object.keys(TOPBAR).every(s => screens.includes(s)), Object.keys(TOPBAR).filter(s => !screens.includes(s)).join(', '));
const navIds = [...bar.matchAll(/data-nav="([a-z]+)"/g)].map(m => m[1]);
ok('every active item TOPBAR names is in the bar', Object.values(TOPBAR).every(c => c.nav == null || navIds.includes(c.nav)));
const dataOn = [...bar.matchAll(/data-on="([^"]+)"/g)].map(m => m[1].split(' ')).flat();
ok('every per-screen extra names a real screen', dataOn.every(s => screens.includes(s)), dataOn.join(' '));
ok('every extra starts hidden (no flash of the card buttons on Home)', (bar.match(/data-on="[^"]+"/g) || []).length === (bar.match(/data-on="[^"]+" hidden/g) || []).length);
ok('hidden wins over .btn display', /#topbar \[hidden\]\{display:none!important\}/.test(H));

// Run topbarFor against a fake bar for every screen.
function fake() {
  const el = (attrs) => ({ dataset: Object.assign({}, attrs), hidden: !!attrs._hidden, cls: new Set(attrs._on ? ['on'] : []), attrs: {},
    classList: { toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
  const items = navIds.map(n => el({ nav: n })); items.forEach(i => i.classList._s = i.cls);
  const extras = [...bar.matchAll(/data-on="([^"]+)"/g)].map(m => { const e = el({ on: m[1], _hidden: true }); e.classList._s = e.cls; return e; });
  const back = el({}), search = el({}), bell = el({}); [back, search, bell].forEach(e => e.classList._s = e.cls);
  const barEl = { dataset: {}, querySelectorAll: s => s === '[data-nav]' ? items : s === '[data-on]' ? extras : [], querySelector: s => s === '.notif-bell' ? bell : null };
  return { items, extras, back, search, bell, barEl };
}
const ctx = { document: null }; vm.createContext(ctx);
vm.runInContext(tb + '\n' + fn('topbarFor'), ctx);
const rows = [];
for (const s of screens) {
  const f = fake();
  ctx.document = { getElementById: id => id === 'topbar' ? f.barEl : id === 'nav-back' ? f.back : id === 'nav-search' ? f.search : null };
  ctx.topbarFor(s);
  const lit = f.items.filter(i => i.cls.has('on')).map(i => i.dataset.nav);
  const shown = f.extras.filter(e => !e.hidden).map(e => e.dataset.on);
  rows.push(s.padEnd(10) + ' lit:' + (lit.join(',') || '-').padEnd(10) + ' back:' + (f.back.hidden ? 'no ' : 'yes') + ' search:' + (f.search.hidden ? 'no ' : 'yes') + ' extras:' + (shown.join(',') || '-'));
  ok(s + ': at most one item lit, and it is TOPBAR\'s', lit.length <= 1 && (lit[0] || null) === (TOPBAR[s].nav || null));
  ok(s + ': only its own extras show', shown.every(o => o.split(' ').includes(s)) && f.extras.filter(e => e.dataset.on.split(' ').includes(s)).every(e => !e.hidden));
}
console.log('\n' + rows.map(r => '    ' + r).join('\n'));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
