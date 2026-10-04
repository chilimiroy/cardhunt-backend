// pslabel.test.js — PSA-label titles reach the card (T0, 2026-10-04)
//
// Most graded titles copy PSA's label: "2002 POKEMON EXPEDITION #28
// TYPHLOSION-HOLO PSA 1". The label prints no set total and its own set
// name. Roy's Typhlosion PSA 1 and 9 of Umbreon #32's ~14 PSA listings were
// titled this way and never shown: the query asked "28/165", which no label
// title carries, and the gate wanted "Expedition Base Set", which no title
// says at all. Titles below are real eBay US titles (2026-10-04) unless
// marked.
//
//   node pslabel.test.js            the shipped cardmatch.js
//   CARDMATCH=path node pslabel.test.js   another copy (e.g. git show HEAD~1:)

const cm = require(process.env.CARDMATCH || './cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name); };

const card = (id, name, number, setTotal, setName, setYear, extra) =>
  Object.assign({ cardId: 'en-' + id + '-' + number, name, number, setTotal, setName,
                  setId: id, setYear, lang: 'en' }, extra || {});
const TY   = card('ecard1', 'Typhlosion', '28', 165, 'Expedition Base Set', 2002);
const UM   = card('neo2', 'Umbreon', '32', 75, 'Neo Discovery', 2001);
const CZ   = card('base1', 'Charizard', '4', 102, 'Base Set', 1999);
const C199 = card('sv03.5', 'Charizard ex', '199', 165, '151', 2023);
const MTGO = card('swsh10.5', 'Mewtwo VSTAR', '31', 78, 'Pokémon GO', 2022);
const DG   = card('base5', 'Dark Gyarados', '8', 82, 'Team Rocket', 2000);

const keep = (c, title, grade) => {
  const v = cm.verify(title, c, grade || 'PSA *');
  ok('KEEP  ' + title + (v.ok ? '' : '   <- ' + v.reason), v.ok);
};
const drop = (c, title, grade) => {
  const v = cm.verify(title, c, grade || 'PSA *');
  ok('DROP  ' + title + (v.ok ? '   <- kept' : ''), !v.ok);
};

console.log('\n  label titles of the right card — kept');
keep(TY, '2002 POKEMON EXPEDITION #28 TYPHLOSION-HOLO PSA 1', 'PSA 1');
keep(TY, '2002 POKEMON EXPEDITION #28 TYPHLOSION-HOLO PSA 1');
keep(UM, '2001 POKEMON NEO DISCOVERY #32 UMBREON PSA 9', 'PSA 9');
keep(UM, '2001 POKEMON NEO DISCOVERY 1ST EDITION #32 UMBREON PSA 7');
keep(CZ, '1999 POKEMON GAME #4 CHARIZARD-HOLO PSA 9');                 // constructed from the GAME label
keep(CZ, '1999 POKEMON GAME SHADOWLESS #4 CHARIZARD-HOLO PSA 9');
keep(C199, '2023 POKEMON MEW EN-151 #199 CHARIZARD EX SPECIAL ILLUSTRATION RARE PSA 10');
keep(DG, '2000 POKEMON ROCKET #8 DARK GYARADOS-HOLO PSA 8');
keep(MTGO, '2022 POKEMON GO #31 MEWTWO VSTAR PSA 10');                 // the accent fold
// and the ordinary seller titles, unchanged
keep(TY, 'Pokemon Expedition (2002): Typhlosion HOLO 28/165 PSA 8');
keep(CZ, 'Charizard 4/102 Base Set Holo PSA 9');

console.log('\n  label titles of ANOTHER card — still refused');
drop(CZ, '2000 POKEMON GAME BASE II #4 CHARIZARD-HOLO PSA 9');         // Base Set 2's label
drop(CZ, '1999 POKEMON GAME MOVIE PROMO #4 CHARIZARD PSA 9');
drop(C199, '2023 POKEMON SV2A JAPANESE #199 CHARIZARD EX PSA 10');
drop(UM, 'Pokemon PSA 7 Umbreon #32 1st Edition Neo Discovery 2001 Italian');
drop(TY, '2002 POKEMON AQUAPOLIS #28 TYPHLOSION PSA 9');               // another e-Card set
drop(TY, 'Typhlosion #28 PSA 9');                                       // number, no set
drop(DG, '2004 POKEMON EX TEAM ROCKET RETURNS #8 DARK GYARADOS PSA 9');  // "rocket", not the label
drop(TY, '2002 POKEMON EXPEDITION #28 TYPHLOSION-HOLO PSA 1', 'Raw');

console.log('\n  a grade is not a quantity ("PSA 8 Card")');
const BL = card('base1', 'Blastoise', '2', 102, 'Base Set', 1999);
keep(BL, '1999 Pokemon Game # 2 Blastoise Holo PSA 8 Card NM-MINT Base Set Trusted Seller!', 'PSA 8');
keep(BL, 'Blastoise 2/102 Base Set PSA10 Card', 'PSA 10');
drop(BL, 'Blastoise 2/102 Base Set PSA 8 lot of 3 cards', 'PSA 8');
drop(BL, 'PSA 8 Blastoise 2/102 Base Set + 5 cards bundle', 'PSA 8');
drop(BL, 'Blastoise 2/102 Base Set 10 card lot', 'Raw');

console.log('\n  the query asks what the label says');
ok('Expedition is asked as "Expedition", not "Expedition Base Set"',
   /Typhlosion \S+ Expedition PSA/.test(cm.buildQuery(TY, 'PSA 1')) && !/Base Set/.test(cm.buildQuery(TY, 'PSA 1')));
ok('a slab asks the bare number ("28"), which matches "#28" and "28/165" alike',
   cm.buildQuery(TY, 'PSA 1') === 'Typhlosion 28 Expedition PSA 1 pokemon');
ok('grader-wide asks the bare number too', cm.buildQuery(UM, 'PSA *') === 'Umbreon 32 Neo Discovery PSA pokemon');
ok('a raw search still asks the pair (bare kept 0 of 225 on Base Charizard Raw)',
   cm.buildQuery(CZ, 'Raw NM').includes('4/102') && cm.buildQuery(TY, 'Raw').includes('28/165'));
ok('a prefixed number keeps its pair on a slab (TG16/TG30 not measured bare)',
   /TG03\/TG30/.test(cm.buildQuery(card('swsh9tg', 'Charizard', 'TG03', 30, 'Brilliant Stars Trainer Gallery', 2022), 'PSA 10')));

console.log(`\n  pslabel.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
