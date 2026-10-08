// setlink.test.js — the set name on a card page is ONE working link
// (Roy, 2026-10-08, TASK-reports-and-pages T8).
//
// The card page showed the set twice: in the breadcrumb, as a link whose
// handler was onclick="SS('setdetail')" — a switch to the set screen that
// never said WHICH set, so it showed the last set opened or an empty page —
// and in the details row, as plain text. The breadcrumb is gone; the details
// row's set name opens the card's own set. This fails if a set name renders
// as a link without a working target, and, page-wide, if any handler calls
// a function nobody defines (pickGame and sortResults were two such).
//
//   node setlink.test.js [page.html]
'use strict';
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  setlink.test.js\n');
const H = fs.readFileSync(process.argv[2] || __dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const m = new RegExp('(?:async\\s+)?function ' + name + '\\(').exec(H); return m ? H.slice(m.index, H.indexOf('\n}', m.index) + 2) : ''; };
const card = H.slice(H.indexOf('<div id="screen-card"'), H.indexOf('<div id="screen-', H.indexOf('<div id="screen-card"') + 10));

console.log('  one set name on the card page, and it is the link');
ok('the card page has no breadcrumb set link (cd-set-lnk) and no breadcrumb', !/cd-set-lnk/.test(H) && !/class="bc"/.test(card));
ok('nothing in the page opens the set screen without a set: no handler is a bare SS(\'setdetail\')',
  !/on[a-z]+="[^"]*SS\(\\?'setdetail\\?'\)/.test(H) && !/on[a-z]+=\\?"[^"]*SS\(&quot;setdetail&quot;\)/.test(H));

const ctx = { liveEsc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  document: null, fetchArtist: () => ({ then() {} }), S: {} };
vm.createContext(ctx);
try { vm.runInContext(fn('cardSetTarget') + '\n' + fn('renderCardSub'), ctx); } catch (e) { ok('renderCardSub loads', false, e.message); }
const draw = c => { const host = { innerHTML: '' }; ctx.document = { getElementById: id => id === 'cd-sub' ? host : null }; ctx.renderCardSub(c); return host.innerHTML; };
const cases = [
  ['en-base1-4', { id: 'base1', name: 'Base Set', total: 102 }, 'en-base1', 'base1'],
  ['ja-SV2a-201', { id: 'SV2a', name: 'ポケモンカード151', nameEn: 'Pokémon Card 151', total: 165 }, 'ja-SV2a', 'SV2a'],
  ['zh-tw-SV2a-1', { id: 'SV2a', name: '寶可夢卡牌151' }, 'zh-tw-SV2a', 'SV2a'],
  ['zh-cn-CSV1C-1', { id: 'CSV1C', name: '朱&紫' }, 'zh-cn-CSV1C', 'CSV1C'],
];
for (const [id, set, want, aid] of cases) {
  let h = '';
  try { h = draw({ id, number: '1', rarity: 'Rare', set }); } catch (e) { h = 'ERROR ' + e.message; }
  const links = h.match(/<a [^>]*>/g) || [];
  ok(id + ': exactly one link in the details row', links.length === 1, links.length);
  ok(id + ': it opens the card\'s own set (data-set ' + want + ', data-aid ' + aid + ') through openCardSet',
    new RegExp('data-set="' + want + '" data-aid="' + aid + '" onclick="event\\.preventDefault\\(\\);openCardSet\\(this\\.dataset\\.set,this\\.dataset\\.aid\\)"').test(h), (links[0] || '').slice(0, 160));
  ok(id + ': the set name appears once (no second copy)', h.split(ctx.liveEsc(set.name)).length - 1 === 1);
}
let noSet = '';
try { noSet = draw({ id: 'en-x-1', number: '1', set: {} }); } catch (e) { noSet = 'ERROR'; }
ok('a card with no set id: plain text, never a link to nowhere', !/<a /.test(noSet));
ok('openCardSet loads the language\'s set list, then openSet', /await loadLangSets\(lang\)/.test(fn('openCardSet')) && /openSet\(setId, apiSetId\)/.test(fn('openCardSet')));
ok('openSet can find a set in any loaded language list (the heading names it)', /LANG_SETS\.ja \|\| \[\]/.test(fn('openSet')));
ok('the set screen keys sets as <lang>-<set id> (what the link sends)', /id: lang \+ '-' \+ x\.id,/.test(H));

console.log('\n  page-wide: no handler calls a function nobody defines');
const defined = new Set();
for (const m of H.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
for (const m of H.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
const skip = new Set(['if', 'event', 'setTimeout', 'alert', 'encodeURIComponent', 'String', 'Number', 'return', 'function', 'parseInt', 'parseFloat', 'confirm', 'var', 'translateY', 'translateX', 'rotate', 'scale']);
const dead = {};
for (const m of H.matchAll(/\bon(click|change|input|keydown|mousedown|blur|focus|error|load|mouseover|mouseout)=(\\?["'])(.*?)\2/g))
  for (const c of m[3].matchAll(/(?:^|[^.\w$-])([A-Za-z_$][\w$]*)\s*\(/g))
    if (!defined.has(c[1]) && !skip.has(c[1])) (dead[c[1]] = dead[c[1]] || []).push(H.slice(0, m.index).split('\n').length);
ok('every handler names a defined function', Object.keys(dead).length === 0, JSON.stringify(dead));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
