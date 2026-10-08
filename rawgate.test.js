// ══════════════════════════════════════════════════════════════
// rawgate.test.js — the raw/slab gate, and fan art
//
// Two gaps found by `linkaudit.js --kept`, which prints the SURVIVORS
// rather than the rejections. 163 of 164 kept listings were correct; both
// failures below were in the one percent that got through:
//
//   "Giratina V 186/196 Lost Origin AiGrade 9.5"        $987, in a RAW search
//   "Giratina V 186/196 Shiny Holo Lost Origin Fan Art" $8.50, a fan drawing
//
// AiGrade was missing from GRADERS, so the slab was not recognised as one.
// The fix derives the slab word list from the grader list, which means a
// company can no longer be added to one and not the other.
//
// That derivation also EXPANDS what the raw search rejects, which is the
// dangerous direction. `looksLikeJunk` destroyed ~80 valid prices a set,
// and bare `tag`/`ace` in the old hand-typed list were already doing the
// same thing to TAG TEAM and ACE SPEC cards. So every assertion here comes
// in both directions: a slab must be refused from a raw search, and an
// ordinary raw card must survive it.
// ══════════════════════════════════════════════════════════════

require('./testcount')(74);   // assertions in a plain run — fewer fails the file (testcount.js)
const m = require('./cardmatch');
let pass = 0, fail = 0;
const chk = (l, c) => { c ? pass++ : fail++;
  console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l); };

const gira = { cardId: 'en-swsh11-186', name: 'Giratina V', number: '186',
               setTotal: 196, setName: 'Lost Origin', setYear: 2022 };

function raw(title) { return m.verify(title, gira, 'Raw NM'); }

// ── Every grading company's slab must be refused from a raw search ──
console.log('\nA RAW SEARCH REJECTS A SLAB, WHOEVER GRADED IT\n');
m.GRADERS.forEach(co => {
  const title = 'Pokemon Giratina V 186/196 Lost Origin ' + co + ' 9.5';
  const v = raw(title);
  chk(co.padEnd(9) + (v.ok ? 'KEPT — the slab got through' : 'rejected: ' + v.reason), !v.ok);
});

// The one that started it, spelled the way the seller spelled it.
[ 'Giratina V 186/196 Lost Origin AiGrade 9.5',
  'Giratina V 186/196 Lost Origin AI Grade 9.5',
  'Pokemon Giratina V 186/196 Lost Origin GRADED SLAB',
  'Giratina V 186/196 Lost Origin ISA 8 Mint' ].forEach(t => {
  const v = raw(t);
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'KEPT' : 'rejected'), !v.ok);
});

// ── And the direction that a blocking-only test cannot see ──
console.log('\nA RAW SEARCH KEEPS AN ORDINARY RAW CARD\n');
[ 'Pokemon Giratina V 186/196 Lost Origin Alt Art Ultra Rare NM',
  'Giratina V 186/196 Lost Origin Alternate Art Card Ultra Rare',
  'POKEMON Giratina V 186/196 ULTRA RARE Lost Origin M/NM Never Played',
  'Giratina V 186/196 Lost Origin NM-MNT Near Mint',
  'Giratina V 186/196 Lost Origin Full Art Holo 2022'
].forEach(t => {
  const v = raw(t);
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'kept' : 'REJECTED: ' + v.reason), v.ok);
});

// TAG TEAM and ACE SPEC are card vocabulary, not grading companies. Bare
// `tag` and `ace` in the old slab list rejected every one of them from
// every raw search — measured before the fix:
//   "Pikachu & Zekrom GX TAG TEAM 33/181" ->
//   "wants raw, title indicates a graded slab: TAG"
console.log('\nCARD VOCABULARY THAT LOOKS LIKE A GRADER\n');
const tagTeam = { cardId: 'en-sm9-33', name: 'Pikachu & Zekrom GX', number: '33',
                  setTotal: 181, setName: 'Team Up', setYear: 2019 };
const aceSpec = { cardId: 'en-sv06-086', name: 'Master Ball', number: '86',
                  setTotal: 64, setName: 'Twilight Masquerade', setYear: 2024 };
[ [tagTeam, 'Pokemon Pikachu & Zekrom GX TAG TEAM 33/181 Team Up Ultra Rare NM'],
  [tagTeam, 'Pikachu & Zekrom GX TAG TEAM 33/181 Team Up 2019 Near Mint'],
  [aceSpec, 'Master Ball ACE SPEC 086/064 Twilight Masquerade Secret Rare NM']
].forEach(([card, t]) => {
  const v = m.verify(t, card, 'Raw NM');
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'kept' : 'REJECTED: ' + v.reason), v.ok);
});

// ...and the same words WITH a grade beside them are still slabs.
[ [tagTeam, 'Pikachu & Zekrom GX TAG TEAM 33/181 TAG 10 Team Up'],
  [aceSpec, 'Master Ball ACE SPEC 086/064 ACE 9 Twilight Masquerade']
].forEach(([card, t]) => {
  const v = m.verify(t, card, 'Raw NM');
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'KEPT — a graded slab got through' : 'rejected: ' + v.reason), !v.ok);
});

// ── Fan art ───────────────────────────────────────────────────
console.log('\nFAN ART IS NOT A CARD\n');
[ 'Giratina V 186/196 Shiny Holo Lost Origin *Fan Art*',
  'Giratina V 186/196 Lost Origin Fanart Holo',
  'Giratina V 186/196 Lost Origin Art Card handmade',
  'Giratina V 186/196 Lost Origin homemade card',
  'Giratina V 186/196 unofficial Lost Origin',
  'Giratina V 186/196 Lost Origin card inspired by Pokemon',
  'Giratina V 186/196 Lost Origin fan made holo card'
].forEach(t => {
  const v = raw(t);
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'KEPT' : 'rejected: ' + v.reason), !v.ok);
});

// `art` alone must never be a term: Alt Art, Full Art and Illustration
// Rare are the genuine chase cards. This card IS one of them.
console.log('\nGENUINE ART IS A CARD — the direction that costs money\n');
const artCards = [
  [gira, 'Pokemon TCG Giratina V 186/196 Lost Origin Alt Art Full Art Holo UR'],
  [gira, 'Pokemon 2022 Giratina V 186/196 Alternate Art Ultra Rare Lost Origin'],
  [gira, 'Giratina V 186/196 Alternate Art Card Lost Origin 2022'],
  [{ cardId: 'en-sv10-184', name: "Cynthia's Roserade", number: '184',
     setTotal: 182, setName: 'Destined Rivals', setYear: 2025 },
   "CYNTHIA'S ROSERADE 184/182 ILLUSTRATION RARE DESTINED RIVALS POKEMON HOLO"],
  [{ cardId: 'en-sv151-205', name: 'Mew ex', number: '205',
     setTotal: 165, setName: '151', setYear: 2023 },
   'Pokemon Mew ex 205/165 Special Art Rare 151 SAR'],
  [{ cardId: 'en-sv02-237', name: 'Iono', number: '237',
     setTotal: 193, setName: 'Paldea Evolved', setYear: 2023 },
   'Iono 237/193 Special Illustration Rare Paldea Evolved']
];
artCards.forEach(([card, t]) => {
  const v = m.verify(t, card, 'Raw NM');
  chk(('"' + t.slice(0, 46) + '"').padEnd(50) +
      (v.ok ? 'kept' : 'REJECTED: ' + v.reason), v.ok);
});

// ── The marketplace's own condition field ─────────────────────
// Found in the browser while verifying the above: a $1,114.99 slab in a
// Raw NM list, titled "... Lost Origin PCG 9" and labelled Graded by eBay
// itself. The title could not be gated — PCG is "Pokémon Card Game" as
// often as anything else — and the structured field was never read.
console.log('\nEBAY SAYS GRADED, THE USER ASKED RAW\n');
[['Graded', true], ['graded', true], ['Gradata', true], ['Gradée', true],
 ['Ungraded', false], ['ungraded', false], ['Non gradée', false],
 ['Non gradata', false], ['Not graded', false], ['New', false],
 ['Like New', false], ['', false], [null, false], ['Used', false]
].forEach(([c, want]) => {
  const got = m.conditionSaysGraded(c);
  chk(('condition ' + JSON.stringify(c)).padEnd(26) +
      (got ? 'reads as a slab' : 'not a slab'), got === want);
});

// ── The lists themselves ──────────────────────────────────────
console.log('\nTHE LISTS\n');
// Compared through boundedTerm rather than against the raw name, because
// a multi-word company ("AI GRADE") is spelled `AI\s+GRADE` in the pattern
// — and a test that retyped the expected form would be the second copy all
// over again.
chk('the slab pattern is derived from the grader list, not retyped',
    m.GRADERS_UNAMBIGUOUS.every(co => m.SLAB_WORDS.source.includes(m.boundedTerm(co))));
chk('an ambiguous grader appears only WITH a grade number',
    m.GRADERS_AMBIGUOUS.every(co => {
      const at = m.SLAB_WORDS.source.indexOf(co);
      return at > -1 && /\\s\*\[-:\]\?/.test(m.SLAB_WORDS.source.slice(at, at + 40));
    }));
chk('AiGrade is in GRADERS', m.GRADERS.includes('AIGRADE'));
[['GEM', 'every "Gem Mint" title'], ['RARE', 'a rarity, not a company'],
 ['MINT', 'a condition'], ['TCG', 'in half of all titles']].forEach(([w, why]) => {
  chk(w.padEnd(6) + 'is NOT treated as a grading company — ' + why,
      !m.GRADERS.includes(w));
});

// listingparse reads the same titles for the cross-check. Two sides
// holding different company lists measure the lists, not the titles.
const lp = require('./listingparse');
const p = lp.parseListingTitle('Giratina V 186/196 Lost Origin AiGrade 9.5');
chk('the cross-check parser reads AiGrade too: ' + p.grader + ' ' + p.grade,
    p.grader === 'AIGRADE' && p.grade === '9.5');
const p2 = lp.parseListingTitle('Master Ball ACE SPEC 086/064 Twilight Masquerade');
chk('...and does not read ACE SPEC as an ACE-graded slab: ' + (p2.grader || 'none'),
    !p2.grader);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
