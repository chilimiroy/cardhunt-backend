// cardnumber.test.js — a lettered or prefixed number is a different card
// (TASK-product-matching, 2026-10-09). See cardnumber.js.
//
// The fixture is the measured cases the old matcher got wrong: Skyridge H09
// vs 10, Legendary Treasures RC6 vs 33, XY177a vs XY177, Aquapolis 50a/50b,
// Garchomp 146 vs 114. Each runs through the REAL tcgPlayerSearch, sliced out
// of ingest.js with a fake TCGplayer answer — and through the old one from
// git, to show the fixture catches the bug it is for.
//
//   node cardnumber.test.js
'use strict';
require('./testcount')(43);
const fs = require('fs'), { execSync } = require('child_process');
const cn = require('./cardnumber');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  cardnumber.test.js\n');

console.log('  the rule — compared whole, only padding and case folded');
ok('H09 is not 10, nor 9', !cn.sameNumber('H09', '10') && !cn.sameNumber('H09', '9'));
ok('RC6 is not 33, nor 6', !cn.sameNumber('RC6', '33') && !cn.sameNumber('RC6', '6'));
ok('XY177a is not XY177, nor 177', !cn.sameNumber('XY177a', 'XY177') && !cn.sameNumber('XY177a', '177'));
ok('50a is not 50b, nor 50', !cn.sameNumber('50a', '50b') && !cn.sameNumber('50a', '50') && !cn.sameNumber('50b', '50'));
ok('BW77 is not BW54; DP05 is not DP48', !cn.sameNumber('BW77', 'BW54') && !cn.sameNumber('DP05', 'DP48'));
ok('it KEEPS: H09 = H9, 002 = 2, TG07 = tg7, 50a = 50A, SWSH001 = SWSH1',
  cn.sameNumber('H09', 'H9') && cn.sameNumber('002', '2') && cn.sameNumber('TG07', 'tg7') && cn.sameNumber('50a', '50A') && cn.sameNumber('SWSH001', 'SWSH1'));
ok('it reads the number before a total: 125/094 = 125, H9/H32 = H9', cn.numberKey('125/094') === '125' && cn.numberKey('H9/H32') === 'H9');
ok('a number of another shape is compared as written, never reduced to digits', cn.numberKey('!') === '!' && cn.numberKey('?') === '?' && !cn.sameNumber('SV-P 2', '2'));
ok('no number is no match (null is never equal to null)', !cn.sameNumber(null, null) && cn.numberKey('') === null);

console.log('\n  what a TCGplayer hit states');
const hit = (productName, number) => ({ productName, customAttributes: number ? { number } : {} });
ok('its number attribute first', cn.tcgHitNumber(hit('Gengar', 'H9/H32')) === 'H9');
ok('"Gengar (10)" states 10; "Golduck (50a)" states 50A', cn.tcgHitNumber(hit('Gengar (10)')) === '10' && cn.tcgHitNumber(hit('Golduck (50a)')) === '50A');
ok('promo names: "Tropical Wind - DP48 (Worlds 09)" states DP48; "Pikachu - BW54" states BW54',
  cn.tcgHitNumber(hit('Tropical Wind - DP48 (Worlds 09)')) === 'DP48' && cn.tcgHitNumber(hit('Pikachu - BW54')) === 'BW54');
ok('a pair in the name: "Charizard ex (199/165)" states 199', cn.tcgHitNumber(hit('Charizard ex (199/165)')) === '199');
ok('it reads nothing from words or years: "Pikachu - 25th Anniversary", "Trophy (1999)", "Ralts" state none',
  cn.tcgHitNumber(hit('Pikachu - 25th Anniversary')) === null && cn.tcgHitNumber(hit('Trophy (1999)')) === null && cn.tcgHitNumber(hit('Ralts')) === null);

// ── The matcher itself, sliced out of ingest.js ──
const sliceFn = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const start = src.lastIndexOf('\n', i) + 1;
  return src.slice(start, src.indexOf('\n}\n', i) + 2);
};
function buildSearch(src, deps) {
  const body = sliceFn(src, 'tcgPlayerSearch');
  if (!/async function tcgPlayerSearch\(/.test(body)) throw new Error('tcgPlayerSearch not found');
  const extra = (deps.ownNumbers ? sliceFn(src, 'normNum') + sliceFn(src, 'tcgHitNumber') : '') + sliceFn(src, 'tcgSealedProduct');
  return answer => new Function('hostDelay', 'UA_SAFE', 'fetch', 'sameTcgSet', 'normTcgSetName', 'TCG_SET_NAME', 'numberKey', 'tcgHitNumber', 'cmatch',
    extra + body + '\nreturn tcgPlayerSearch;')(
    async () => {}, 'UA', async () => ({ ok: true, json: async () => ({ results: [{ results: answer }] }) }),
    () => true, s => String(s || '').toLowerCase(), {}, cn.numberKey, deps.ownNumbers ? undefined : cn.tcgHitNumber, require('./cardmatch'));
}
const SRC = fs.readFileSync(__dirname + '/ingest.js', 'utf8').replace(/\r/g, '');
let OLD = null;
try { OLD = execSync('git show a7366c9:ingest.js', { cwd: __dirname, maxBuffer: 1 << 26 }).toString().replace(/\r/g, ''); } catch (e) {}
const now = buildSearch(SRC, {}), before = OLD ? buildSearch(OLD, { ownNumbers: true }) : null;
const P = (productName, number, productId, marketPrice, setName) => ({ productName, setName: setName || 'Skyridge', marketPrice, productId, customAttributes: number ? { number } : {} });

// [label, card name, set name, our number, TCGplayer's answer, productId the card should get (null = none), productId the OLD matcher gave]
const CASES = [
  ['Skyridge Gengar H09, only Gengar 10 answered', 'Gengar', 'Skyridge', 'H09', [P('Gengar (10)', '10/144', 85669, 509.99)], null, 85669],
  ['Skyridge Gengar H09, both answered', 'Gengar', 'Skyridge', 'H09', [P('Gengar (10)', '10/144', 85669, 509.99), P('Gengar (H9)', 'H9/H32', 85670, 1300)], 85670, 85670],
  ['Legendary Treasures Piplup RC6 vs Piplup 33', 'Piplup', 'Legendary Treasures', 'RC6', [P('Piplup', '33/113', 88153, 4.41, 'Legendary Treasures')], null, 88153],
  ['XY promo Karen XY177a vs XY177', 'Karen', 'XY Black Star Promos', 'XY177a', [P('Karen', 'XY177', 123438, 11.38, 'XY Promos')], null, 123438],
  ['…and XY177 vs XY177a', 'Karen', 'XY Black Star Promos', 'XY177', [P('Karen (Alternate Art)', 'XY177a', 123439, 30, 'XY Promos')], null, null],
  ['Aquapolis Golduck 50a', 'Golduck', 'Aquapolis', '50a', [P('Golduck (50a)', '50a/147', 85813, 9, 'Aquapolis'), P('Golduck (50b)', '50b/147', 85814, 8, 'Aquapolis')], 85813, 85813],
  ['Aquapolis Golduck 50b', 'Golduck', 'Aquapolis', '50b', [P('Golduck (50a)', '50a/147', 85813, 9, 'Aquapolis'), P('Golduck (50b)', '50b/147', 85814, 8, 'Aquapolis')], 85814, 85813],
  ['Garchomp 146 vs Garchomp 114', 'Garchomp & Giratina GX', 'Unified Minds', '146', [P('Garchomp', '114/236', 195068, 3.06, 'Unified Minds')], null, 195068],
  // The sealed word list (2026-10-09): unbounded, "tin" read the card's own name.
  ['Dratini 147: its own product (the old list refused "tin" in Dratini)', 'Dratini', 'Scarlet & Violet 151', '147', [P('Dratini - 147/165', '147/165', 502001, 0.4, 'SV: Scarlet & Violet 151')], 502001, null],
  ['Fighting Energy 6: its own product ("tin" in Fighting)', 'Fighting Energy', 'Scarlet & Violet Energies', '6', [P('Basic Fighting Energy', '006', 502002, 0.2, 'SVE: Scarlet & Violet Energies')], 502002, null],
  ['Iron Bundle 56: its own product ("bundle" is its name)', 'Iron Bundle', 'Paradox Rift', '56', [P('Iron Bundle - 056/182', '056/182', 502003, 0.3, 'SV04: Paradox Rift')], 502003, null],
  ['Garchomp & Giratina GX 247: its own product ("tin" in Giratina)', 'Garchomp & Giratina GX', 'Unified Minds', '247', [P('Garchomp & Giratina GX (Secret)', '247/236', 502004, 126, 'Unified Minds')], 502004, null],
];
(async () => {
  console.log('\n  the matcher, on the measured cases');
  for (const [label, name, set, num, answer, want, oldGave] of CASES) {
    const r = await now(answer)(name, set, num, null, { setId: 'x', queryAs: set });
    ok(label + ': ' + (want === null ? 'no product' : 'product ' + want), (r ? r.productId : null) === want, r ? JSON.stringify({ productId: r.productId, matchedBy: r.matchedBy, matchedNumber: r.matchedNumber }) : 'null');
  }
  console.log('\n  what it still ALLOWS');
  let r = await now([P('Fuecoco - 002', '002/198', 477182, 1.2, 'SV Promos')])('Fuecoco', 'SV Black Star Promos', '2', null, { setId: 'x', queryAs: 'x' });
  ok('002 = 2: the padded number still matches', r && r.productId === 477182 && r.matchedBy === 'number');
  r = await now([P('Ralts', null, 1, 0.5, 'Legendary Treasures')])('Ralts', 'Legendary Treasures', 'RC8', null, { setId: 'x', queryAs: 'x' });
  ok('a single hit stating NO number is still taken by name (it states nothing to refuse it on)', r && r.productId === 1 && r.matchedBy === 'name_unique' && r.matchedNumber === null);
  r = await now([P('Zapdos ex', '29/165', 9, 30, 'Pokemon 151'), P('Zapdos ex', '192/165', 10, 60, 'Pokemon 151')])('Zapdos ex', '151', '192', null, { setId: 'x', queryAs: 'x' });
  ok('several same-name hits: the one stating our number', r && r.productId === 10);
  r = await now([P('Giratina VSTAR Premium Collection', null, 7, 40, 'Lost Origin'), P('Pikachu ex Box', null, 9, 30, 'Lost Origin')])('Giratina VSTAR', 'Lost Origin', '131', null, { setId: 'x', queryAs: 'x' });
  const r2 = await now([P('Victini Tin', null, 8, 20, 'Lost Origin')])('Victini', 'Lost Origin', '1', null, { setId: 'x', queryAs: 'x' });
  ok('…and it still REFUSES sealed product: a Premium Collection, a Box, a Tin — even one carrying the card\'s own name', r === null && r2 === null, JSON.stringify([r, r2]));

  console.log('\n  made to fire: the old matcher (a7366c9) on the same cases');
  ok('the old ingest.js is readable from git', !!before);
  for (const [label, name, set, num, answer, want, oldGave] of CASES) {
    if (oldGave === want) continue;
    const o = before ? await before(answer)(name, set, num, null, { setId: 'x', queryAs: set }) : null;
    ok('old: ' + label + ' -> took product ' + oldGave + ' (the bug)', (o ? o.productId : null) === oldGave, o ? JSON.stringify({ productId: o.productId, matchedBy: o.matchedBy }) : 'null');
  }

  console.log('\n  one definition');
  ok('ingest.js has no private normNum or tcgHitNumber left', !/function normNum\(|function tcgHitNumber\(/.test(SRC) && /require\('\.\/cardnumber'\)/.test(SRC));
  ok('every row the matcher writes carries the rule it was written under', /numberRule: NUMBER_RULE/.test(SRC) && cn.RULE === 'whole-number-2026-10-09');
  ok('collisionscan.js reads stored rows with the same rule', /require\('\.\/cardnumber'\)/.test(fs.readFileSync(__dirname + '/collisionscan.js', 'utf8')));
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
