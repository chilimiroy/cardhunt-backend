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
ok(/data = groupTrainerKits\(data\)/.test(fn('renderSets')), 'the set grid uses it');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
