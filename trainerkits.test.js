// trainerkits.test.js — T5, 2026-10-05: the trainer kits are ONE entry in the
// set grid, a grouping in the UI only. Every card keeps its own set id and
// card id (prices, alerts, listings depend on them).
//
//   node trainerkits.test.js
'use strict';
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ok    ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }
console.log('\n  trainerkits.test.js\n');

const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}\n', i) + 2); };
const ctx = {}; vm.createContext(ctx);
vm.runInContext("var TK_GROUP_ID = 'en-group-trainer-kits';\n" + fn('isTrainerKit') + fn('groupTrainerKits'), ctx);

const sets = [
  { id: 'en-base1', aid: 'base1', n: 'Base', s: 'Base', lang: 'en', cardCount: 102 },
  { id: 'en-tk-ex-latia', aid: 'tk-ex-latia', n: 'EX trainer Kit (Latias)', s: 'Trainer kits', lang: 'en', cardCount: 10, d: '2004-06-01' },
  { id: 'en-tk-xy-p', aid: 'tk-xy-p', n: 'XY trainer Kit (Pikachu Libre)', s: 'Trainer kits', lang: 'en', cardCount: 30, d: '2015-11-01' },
  { id: 'ja-tk1', aid: 'tk1', n: 'a Japanese deck', s: 'Other', lang: 'ja', cardCount: 20 }
];
const out = ctx.groupTrainerKits(sets);
const g = out.find(x => x.id === 'en-group-trainer-kits');
ok(!!g && out.filter(x => /^en-tk-/.test(x.id)).length === 0, 'the English kits become one tile');
ok(g && g.cardCount === 40 && g.kits.length === 2, 'the tile counts every kit\'s cards and keeps the kits themselves');
ok(g && g.kits.every(k => /^tk-/.test(k.aid) && /^en-tk-/.test(k.id)), 'each kit keeps its own set id — nothing renamed or merged');
ok(out.some(x => x.id === 'en-base1') && out.some(x => x.id === 'ja-tk1'), 'KEPT: other sets, and other languages, untouched');
ok(ctx.groupTrainerKits([sets[0], sets[1]]).length === 2 && !ctx.groupTrainerKits([sets[0], sets[1]]).some(x => x.kits), 'a single kit is not grouped');

console.log('\n  the group page');
const okg = fn('openKitGroup');
ok(/\/api\/sets\/' \+ k\.aid \+ '\/cards/.test(okg), 'each kit\'s cards are fetched by its own set id, from the set page\'s endpoint');
ok(/_kit: k\.aid/.test(okg) && !/\bid:\s*/.test(okg.replace(/uiSetId/g, '')), 'cards are tagged with their kit, their ids left alone');
ok(/failed\.push\(k\.n\)/.test(okg) && /Did not load/.test(fn('renderKitChips')), 'a kit that fails to load is named');
ok(/setSourceNote\(null\)/.test(okg), 'the last set\'s source note is cleared');
ok(/if \(setId === TK_GROUP_ID\) return openKitGroup\(\)/.test(H), 'openSet routes the group tile');
ok(/if\(S\.kitFilter\) cards=cards\.filter\(c=>c\._kit===S\.kitFilter\)/.test(H), 'the kit filter narrows the grid');
ok(/data = groupWotcPromos\(groupTrainerKits\(data\)\)/.test(fn('renderSets')), 'the set grid uses it');

// ── Ancient Mew grouped with the Wizards promos (T4, 2026-10-06) ──
console.log('\n  Ancient Mew with the Wizards promos');
vm.runInContext("var WP_GROUP_ID = 'en-group-wotc-promos'; var WP_MEMBERS = ['basep', 'miscp'];\n" + fn('groupWotcPromos'), ctx);
const promos = [
  { id: 'en-basep', aid: 'basep', n: 'Wizards Black Star Promos', s: 'Base', lang: 'en', cardCount: 53, lo: 'L' },
  { id: 'en-miscp', aid: 'miscp', n: 'Miscellaneous Promos', s: 'Miscellaneous', lang: 'en', cardCount: 1 },
  { id: 'en-np', aid: 'np', n: 'Nintendo Black Star Promos', s: 'POP', lang: 'en', cardCount: 40 },
  { id: 'ja-basep', aid: 'basep', n: 'a Japanese set', s: 'Other', lang: 'ja', cardCount: 9 },
];
const wp = ctx.groupWotcPromos(promos), wg = wp.find(x => x.id === 'en-group-wotc-promos');
ok(!!wg && !wp.some(x => x.id === 'en-basep' || x.id === 'en-miscp'), 'basep and miscp become one tile');
ok(wg && wg.n === 'Wizards Black Star Promos' && wg.cardCount === 54 && wg.lo === 'L', 'the tile is the Black Star Promos tile, counting Ancient Mew');
ok(wg && wg.kits.map(k => k.id).join() === 'en-basep,en-miscp', 'each set keeps its own id — Ancient Mew is not moved');
ok(wg && /not a Black Star Promo/.test(wg.note), 'the page says Ancient Mew is not a Black Star Promo');
ok(wp.some(x => x.id === 'en-np') && wp.some(x => x.id === 'ja-basep'), 'KEPT: other promo sets and other languages untouched');
ok(ctx.groupWotcPromos([promos[0], promos[2]]).length === 2, 'without miscp nothing is grouped');
ok(/if \(setId === WP_GROUP_ID\) return openKitGroup\(WP_GROUP_ID\)/.test(H), 'openSet routes the promo tile to the group page');
ok(/groupWotcPromos\(groupTrainerKits\(getSetsData\(\)\)\)/.test(fn('openKitGroup')), 'the group page finds either group');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
