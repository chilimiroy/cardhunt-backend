// anygrade.test.js — "PSA + All" still has to be the right CARD
//
//   node anygrade.test.js
//
// Found 2026-09-27: in grader-wide mode ("PSA *") cardmatch.verify returned
// ok as soon as the title named a PSA grade — before the name, number, set
// and printing checks ever ran. "Pikachu 58/102 Base Set PSA 9" was kept as
// Base Set Charizard. Every suite passed, because none asked grader-wide
// mode anything but grades. Each case below is asked of BOTH a specific
// grade and the grader-wide mode: the two must agree about the card.
'use strict';
require('./testcount')(27);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

const ZARD = { name: 'Charizard', number: '4', setTotal: 102, setName: 'Base', setId: 'base1',
               lang: 'en', cardId: 'en-base1-4', setYear: 1999 };
const GIRA = { name: 'Giratina V', number: '186', setTotal: 196, setName: 'Lost Origin', setId: 'swsh11',
               lang: 'en', cardId: 'en-swsh11-186', setYear: 2022 };

// Wrong CARD, right grader: must be refused in both modes, for the same kind of reason.
const WRONG = [
  [ZARD, 'Pikachu 58/102 Base Set PSA 9', 'PSA 9'],
  [ZARD, 'Charizard 4/130 Base Set 2 PSA 9', 'PSA 9'],
  [ZARD, 'Pokemon Celebrations Charizard 4/102 Classic Collection PSA 9', 'PSA 9'],
  [ZARD, 'Charizard 4/102 Base Set Lot of 3 PSA 9', 'PSA 9'],
  [GIRA, 'Giratina V 130/196 Lost Origin PSA 10', 'PSA 10'],
  [GIRA, 'Giratina V 186/196 Lost Origin PSA 10 Japanese', 'PSA 10'],
  [ZARD, 'Blastoise 2/102 Base Set BGS 9', 'BGS 9'],
];
for (const [card, title, g] of WRONG) {
  const specific = cm.verify(title, card, g);
  const any = cm.verify(title, card, g.split(' ')[0] + ' *');
  ok(!specific.ok, `specific ${g} refuses: ${title}`);
  ok(!any.ok, `grader-wide ${g.split(' ')[0]} * refuses: ${title} (got ok, grade ${any.grade})`);
}

// Right card, right grader: kept in both modes, and grader-wide reports the grade it read.
const RIGHT = [
  [ZARD, 'Charizard 4/102 Base Set Holo PSA 9 Mint', 'PSA 9'],
  [ZARD, '1999 Pokemon Base Set Charizard #4/102 Holo PSA 8 NM-MT Unlimited', 'PSA 8'],
  [ZARD, 'BGS 8 CHARIZARD 1999 Pokemon Base Unlimited #4/102 Holo NM-MINT', 'BGS 8'],
  [GIRA, 'Giratina V 186/196 Alternate Art Lost Origin PSA 10 Gem Mint', 'PSA 10'],
  [ZARD, 'Pokemon TAG 8 Charizard 4/102 Base Set Unlimited Holo', 'TAG 8'],
];
for (const [card, title, g] of RIGHT) {
  const grader = g.split(' ')[0];
  const specific = cm.verify(title, card, g);
  const any = cm.verify(title, card, grader + ' *');
  ok(specific.ok, `specific ${g} keeps: ${title} (${specific.reason})`);
  ok(any.ok && any.grade === g, `grader-wide ${grader} * keeps and reads ${g}: ${title} (got ${any.ok} ${any.grade || any.reason})`);
}

// Grader-wide still refuses other companies, and raw.
ok(!cm.verify('Charizard 4/102 Base Set BGS 9', ZARD, 'PSA *').ok, 'PSA * refuses a BGS slab');
ok(!cm.verify('Charizard 4/102 Base Set PSA 9 BGS 9.5', ZARD, 'PSA *').ok, 'PSA * refuses a two-company title');
ok(!cm.verify('Charizard 4/102 Base Set Holo NM', ZARD, 'PSA *').ok, 'PSA * refuses raw');

console.log(`\nanygrade.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
