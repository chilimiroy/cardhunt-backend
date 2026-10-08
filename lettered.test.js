// lettered.test.js — what querygap found, fixed by cause (T2, 2026-10-04)
//
// 1. A number with a LETTER is its own card. 31 English cards carry one
//    (Aquapolis 50a/50b, the XY alternate arts 24a, 55a…). normNum folded
//    "24a" to "24" and "24a/119" was not read as a pair, so the gate
//    matched either card's listings to the other. Both directions below.
// 2. Yellow A Alternate is written "24a/119 … Alternate Art Promos":
//    the original set's total, which we do not hold. 105 rows, 0 kept.
// 3. Futsal prints 002/005, and sellers do not write "Pokémon Futsal 2020".
// Titles are real (eBay US, marketprobe ?titles=1, 2026-10-04) where marked.

require('./testcount')(17);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !extra ? '' : '  — ' + extra)); };
const card = (id, name, number, setTotal, setName, year) =>
  ({ cardId: id, name, number, setTotal, setName, setId: id.split('-').slice(1, -1).join('-'), setYear: year, lang: 'en' });

const XYA = card('en-xya-24a', 'M Manectric-EX', '24a', 6, 'Yellow A Alternate', 2014);
const XY4A = card('en-xy4-24a', 'M Manectric EX', '24a', 119, 'Phantom Forces', 2014);
const XY4 = card('en-xy4-24', 'M Manectric EX', '24', 119, 'Phantom Forces', 2014);
const G50A = card('en-ecard2-50a', 'Golduck', '50a', 147, 'Aquapolis', 2003);
const FUT = card('en-fut2020-2', 'Eevee on the Ball', '2', 5, 'Pokémon Futsal 2020', 2020);

const CASES = [
  // [card, title, keep?, label]
  [XYA, 'M Manectric EX 24A/119 Holo Promo Alternate Art Promos Pokemon Near Mint', true, 'real: xya, as sellers write it'],
  [XYA, 'Pokemon M Manectric EX 24a/119 Alternate Art Promo NM', true, 'real: xya, lower-case letter'],
  [XYA, 'M Manectric EX 24/119 Phantom Forces Holo', false, 'xya: the regular 24 is another card'],
  [XY4A, 'Pokémon M Manectric EX 24a/119 Phantom Forces Alternate Art Promo Holo NM', true, 'real: the parent-set 24a'],
  [XY4A, 'M Manectric EX 24/119 Phantom Forces', false, 'parent-set 24a: the regular 24 refused'],
  [XY4, 'M Manectric EX 24/119 Phantom Forces Holo', true, 'the regular 24: kept'],
  [XY4, 'M Manectric EX 24A/119 Holo Promo Alternate Art Promos', false, 'the regular 24: the alt art 24a refused'],
  [G50A, 'Golduck 50a/147 Aquapolis Holo', true, 'Aquapolis 50a kept'],
  [G50A, 'Golduck 50b/147 Aquapolis', false, 'Aquapolis 50a: 50b refused'],
  [G50A, 'Golduck 50/147 Aquapolis', false, 'Aquapolis 50a: no letter refused'],
  [FUT, 'The Pokémon Company Eevee on the Ball 002/005 Promo Card English 2020', true, 'real: Futsal, no set name'],
  [FUT, 'Eevee on the Ball 2/5 Pokemon Futsal Promo', true, 'Futsal unpadded'],
  [FUT, 'Eevee 2/64 Jungle Pokemon', false, 'Futsal: another card'],
];
for (const [c, t, keep, label] of CASES) {
  const v = cm.verify(t, c, 'Raw');
  ok(label, !!v.ok === keep, v.reason);
}

console.log('\n  what is asked');
ok('xya asks the number with its letter and "Alternate Art", no "/06"',
   cm.buildQuery(XYA, 'Raw') === 'M Manectric-EX 24a Alternate Art pokemon', cm.buildQuery(XYA, 'Raw'));
ok('the parent-set 24a still asks its own pair', /24a\/119 Phantom Forces/.test(cm.buildQuery(XY4A, 'Raw')));
ok('Futsal asks 002/005 and no set name', cm.buildQuery(FUT, 'Raw') === 'Eevee on the Ball 002/005 pokemon', cm.buildQuery(FUT, 'Raw'));
ok('an ordinary set still asks its name', /Phantom Forces/.test(cm.buildQuery(XY4, 'Raw')));

console.log(`\n  lettered.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
