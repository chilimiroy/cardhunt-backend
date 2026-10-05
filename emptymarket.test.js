// emptymarket.test.js — T2, 2026-10-05: "eBay has nothing" and "we asked
// wrongly" must look different. The query vocabulary for two sets that were
// asked wrongly, the "?" Unown, and the empty panel's three sentences.
//
//   node emptymarket.test.js
'use strict';
const fs = require('fs');
const m = require('./cardmatch.js');
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ok    ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }
console.log('\n  emptymarket.test.js\n');

const tre = { name: 'Treecko', number: '1', setTotal: 5, setName: 'Poké Card Creator Pack', setId: 'ex5.5' };
const ua = { name: 'Unown', number: 'A', setTotal: 28, setName: 'Unseen Forces Unown Collection', setId: 'exu' };
const uq = { name: 'Unown', number: '?', setTotal: 28, setName: 'Unseen Forces Unown Collection', setId: 'exu' };
const lugia = { name: 'Lugia ex', number: '105', setTotal: 115, setName: 'Unseen Forces', setId: 'ex10' };
const keep = (t, c) => m.verify(t, c, 'Raw').ok;

console.log('  Poké Card Creator Pack: asked as sellers write it');
ok(!/\bPack\b/.test(m.buildQuery(tre, 'Raw')) && /Creator/.test(m.buildQuery(tre, 'Raw')), 'the query asks "Creator", not "Pack" (no title says Pack; US returned 0)');
ok(keep("Pokemon 2004 Treecko 1/5 Promo Kids' WB Poke Card Creator", tre), "KEPT: \"Kids' WB Poke Card Creator 1/5\"");
ok(keep("2004 Pokemon Kids' WB! Poke Creator 1/5 Treecko", tre), 'KEPT: "Poke Creator 1/5"');
ok(!keep('Water Energy (5) 5/30 Common XY Trainer Kit', tre), 'refused: another card');

console.log('\n  Unown Collection: sold as "Unseen Forces" with a letter number');
ok(/Unseen Forces pokemon$/.test(m.buildQuery(ua, 'Raw')) && !/Collection/.test(m.buildQuery(ua, 'Raw')), 'the query asks "Unseen Forces"');
ok(keep('Unown (A) A/28 - Holo - Unseen Forces - Pokemon TCG - LP', ua), 'KEPT: "Unown (A) A/28 Unseen Forces" (refused before)');
ok(!keep('Unown (A) 2/28 Unseen Forces', ua), 'refused: a different number');
ok(keep('Lugia ex 105/115 Unseen Forces Holo', lugia), 'KEPT: Unseen Forces (ex10) cards still keep their own titles');
ok(!keep('Unown (A) A/28 Unseen Forces Holo', lugia), 'refused: an Unown Collection title under an Unseen Forces card');
ok(keep('Unown (?) ?/28 Unseen Forces Holo Pokemon', uq), 'KEPT: the "?" Unown under its own title');
ok(!keep('Unown (A) A/28 Unseen Forces', uq), 'refused: "?" is not a wildcard — before the escape it kept ANY title');

console.log('\n  where eBay has nothing (measured)');
ok(!!m.noEbayMarket({ setId: 'mfb' }) && /2026-10-05/.test(m.noEbayMarket({ setId: 'mfb' }).measured), 'My First Battle: measured, dated');
ok(!m.noEbayMarket({ setId: 'ex5.5' }) && !m.noEbayMarket({ setId: 'exu' }), 'NOT the two sets that were asked wrongly');
ok(!m.noEbayMarket({ setId: 'base1' }), 'not an ordinary set');

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok(/'none-returned'/.test(src) && /'all-refused'/.test(src) && /noMarket: cm\.noEbayMarket\(card\)/.test(src), 'the payload says which kind of empty it is');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
const f = page.slice(page.indexOf('function emptyMarketNote'), page.indexOf('function liveSourceNote'));
ok(/m\.noMarket/.test(f) && /none-returned/.test(f) && /all-refused/.test(f), 'the page draws three different sentences');
ok(/not a broken search/.test(f), 'a measured empty set says it is the right answer');
ok(/: emptyMarketNote\(d\)\)/.test(page), 'the empty panel uses it');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
