// gradedim.test.js — the three grade dimensions TASK.md Phase 1b needed and
// the gate did not have:
//
//   1. BGS 10 Black Label and CGC 10 Pristine as DISTINCT grades
//   2. "PSA *" — one grader-wide query instead of ten
//   3. raw sub-conditions, from seller prose, with an "unstated" group
//
//   node gradedim.test.js
//
// Every section asserts BOTH directions. A gate tested only on refusals
// passes by refusing everything — that is how looksLikeJunk destroyed ~80
// valid prices per set, how SLAB_WORDS made every TAG TEAM card
// unsearchable, and how a probe classifier reported a working source as
// blocked. Here it would mean a Black Label search that returns nothing at
// all and looks like a working filter.

require('./testcount')(68);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const CARD = { name: 'Charizard', number: '4', setTotal: 102,
               setName: 'Base Set', setYear: 1999, api_card_id: 'en-base1-4' };
const GIRA = { name: 'Giratina V', number: '186', setTotal: 196,
               setName: 'Lost Origin', setYear: 2022, api_card_id: 'en-swsh11-186' };

const keeps = (name, title, grade, card) => {
  const r = cm.verify(title, card || CARD, grade, {});
  ok(name, !!r.ok, r.reason);
};
const drops = (name, title, grade, card, wantWord) => {
  const r = cm.verify(title, card || CARD, grade, {});
  ok(name, !r.ok && (!wantWord || String(r.reason).toLowerCase().includes(wantWord.toLowerCase())),
    r.ok ? 'KEPT — the gate did not fire' : 'reason: ' + r.reason);
};

// ══════════════════════════════════════════════════════════════
console.log('\n1. parseGrade understands the new forms');
const pg = cm.parseGrade;
ok('PSA * is grader-wide', pg('PSA *').anyGrade === true && pg('PSA *').grader === 'PSA');
ok('PSA All is the same thing', pg('PSA All').anyGrade === true);
ok('PSA any is the same thing', pg('PSA any').anyGrade === true);
ok('a grader-wide grade carries NO number', pg('PSA *').grade === null);
ok('BGS 10 Black Label is a qualified ten',
  pg('BGS 10 Black Label').qualifier === 'BLACK LABEL' && pg('BGS 10 Black Label').grade === '10');
ok('CGC 10 Pristine is a qualified ten', pg('CGC 10 Pristine').qualifier === 'PRISTINE');
ok('CGC 10 Gem Mint is the ORDINARY ten, named', pg('CGC 10 Gem Mint').qualifier === 'GEM MINT');
ok('a plain BGS 10 carries no qualifier', pg('BGS 10').qualifier === undefined);
ok('PSA 10 still parses as it always did',
  pg('PSA 10').kind === 'graded' && pg('PSA 10').grader === 'PSA' && pg('PSA 10').grade === '10');
ok('Raw NM still parses as it always did',
  pg('Raw NM').kind === 'raw' && pg('Raw NM').condition === 'NM');
// The fallthrough that returned kind:'raw' for an explicitly graded string.
// Asking for a slab and being handed a raw search is the worst answer, and
// it is silent.
ok('BGS 9.5 Black Label is still GRADED (no such qualifier, grade survives)',
  pg('BGS 9.5 Black Label').kind === 'graded' && pg('BGS 9.5 Black Label').grade === '9.5',
  JSON.stringify(pg('BGS 9.5 Black Label')));
ok('PSA 10 Gem Mint is still a PSA 10',
  pg('PSA 10 Gem Mint').kind === 'graded' && pg('PSA 10 Gem Mint').grade === '10',
  JSON.stringify(pg('PSA 10 Gem Mint')));

// ══════════════════════════════════════════════════════════════
console.log('\n2. BLACK LABEL / PRISTINE — blocked in both directions');
drops('an ordinary BGS 10 is refused from a Black Label search',
  'Pokemon Charizard 4/102 Base Set BGS 10 1999', 'BGS 10 Black Label', CARD, 'black label');
keeps('a genuine Black Label is kept',
  'Pokemon Charizard 4/102 Base Set BGS 10 Black Label 1999', 'BGS 10 Black Label');
keeps('...however the seller spaces it',
  'Pokemon Charizard 4/102 Base Set BGS 10 BlackLabel 1999', 'BGS 10 Black Label');
drops('a Black Label is refused from an ORDINARY BGS 10 search',
  'Pokemon Charizard 4/102 Base Set BGS 10 Black Label 1999', 'BGS 10', CARD, 'black label');
keeps('an ordinary BGS 10 is kept by an ordinary BGS 10 search',
  'Pokemon Charizard 4/102 Base Set BGS 10 1999', 'BGS 10');

drops('an ordinary CGC 10 is refused from a Pristine search',
  'Pokemon Charizard 4/102 Base Set CGC 10 Gem Mint 1999', 'CGC 10 Pristine', CARD, 'pristine');
keeps('a genuine CGC 10 Pristine is kept',
  'Pokemon Charizard 4/102 Base Set CGC 10 Pristine 1999', 'CGC 10 Pristine');
drops('a Pristine is refused from an ordinary CGC 10 search',
  'Pokemon Charizard 4/102 Base Set CGC 10 Pristine 1999', 'CGC 10', CARD, 'pristine');

// CGC brands its ordinary ten "Gem Mint". If that counted as a premium
// qualifier, an ordinary CGC 10 search would refuse the very listings it is
// looking for — the filter would look like it worked and return nothing.
keeps('"CGC 10 Gem Mint" is kept by a plain CGC 10 search (Gem Mint is the ordinary one)',
  'Pokemon Charizard 4/102 Base Set CGC 10 Gem Mint 1999', 'CGC 10');
keeps('...and by an explicit CGC 10 Gem Mint search',
  'Pokemon Charizard 4/102 Base Set CGC 10 Gem Mint 1999', 'CGC 10 Gem Mint');

// A qualifier belongs to its own company.
keeps('a PSA 10 is unaffected by the word Pristine belonging to CGC',
  'Pokemon Charizard 4/102 Base Set PSA 10 1999', 'PSA 10');

// ══════════════════════════════════════════════════════════════
console.log('\n3. "PSA *" — one query, any PSA grade, nothing else');
console.log('   (the ALLOW half matters more: this must not return an empty list)');
for (const g of ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '9.5']) {
  keeps('PSA * keeps a PSA ' + g,
    'Pokemon Charizard 4/102 Base Set PSA ' + g + ' 1999', 'PSA *');
}
drops('PSA * refuses a BGS slab',
  'Pokemon Charizard 4/102 Base Set BGS 9.5 1999', 'PSA *', CARD, 'psa');
drops('PSA * refuses a CGC slab',
  'Pokemon Charizard 4/102 Base Set CGC 9 1999', 'PSA *', CARD, 'psa');
drops('PSA * refuses a SGC slab',
  'Pokemon Charizard 4/102 Base Set SGC 8 1999', 'PSA *', CARD, 'psa');
drops('PSA * refuses a RAW card (no grade stated)',
  'Pokemon Charizard 4/102 Base Set Holo Rare 1999 NM', 'PSA *', CARD, 'no grade');
drops('PSA * refuses a title naming two COMPANIES',
  'Pokemon Charizard 4/102 Base Set PSA 10 BGS 9.5 1999', 'PSA *', CARD, 'more than one');
keeps('BGS * keeps a BGS 9.5',
  'Pokemon Charizard 4/102 Base Set BGS 9.5 1999', 'BGS *');
keeps('PSA * keeps a Black Label-free PSA 10 without caring about qualifiers',
  'Pokemon Charizard 4/102 Base Set PSA 10 Gem Mint 1999', 'PSA *');
// A speculative grade is not a grade, and grader-wide must not weaken that.
drops('PSA * still refuses a hoped-for grade on a raw card',
  'Pokemon Charizard 4/102 Base Set 1999 (PSA 10 Contender)', 'PSA *', CARD, 'no grade');

// ONE query, not ten — the whole point of the mode.
console.log('\n   ...and it asks eBay ONCE, without a grade number');
const qAny = cm.buildQuery(CARD, 'PSA *');
ok('the grader-wide query names the company', /\bPSA\b/.test(qAny), qAny);
ok('...and states NO grade number', !/\bPSA\s*\d/.test(qAny), qAny);
const q10 = cm.buildQuery(CARD, 'PSA 10');
ok('a specific grade still asks for that number', /\bPSA 10\b/.test(q10), q10);
const qBL = cm.buildQuery(CARD, 'BGS 10 Black Label');
ok('a Black Label query asks for the qualifier (sellers always write it)',
  /black label/i.test(qBL), qBL);

// ══════════════════════════════════════════════════════════════
console.log('\n4. RAW SUB-CONDITIONS — seller-stated, and the traps');
// Measured 2026-09-22 on 447 live rows: eBay's structured condition field
// is binary (441 "Ungraded" + 6 localisations), so this reads prose.
const sc = cm.sellerCondition;
ok('Near Mint is read as NM', sc('Charizard 4/102 Base Set Near Mint').code === 'NM');
ok('bare NM is read as NM', sc('Charizard 4/102 Base Set NM').code === 'NM');
ok('Lightly Played is read as LP', sc('Charizard 4/102 Lightly Played').code === 'LP');
ok('bare LP is read as LP', sc('LP Charizard ex 199/165').code === 'LP');
ok('Moderately Played is read as MP', sc('Charizard 4/102 Moderately Played').code === 'MP');
ok('Heavily Played is read as HP', sc('Charizard 4/102 Heavily Played').code === 'HP');
ok('Heavy Played is read as HP too (sellers write both)',
  sc('Charizard 1999 Holo Rare 4/102 Base Set HP Heavy Played').code === 'HP');
ok('Damaged is read as DMG', sc('Charizard 4/102 Damaged').code === 'DMG');
ok('Mint alone is read as M, not NM', sc('Charizard 4/102 Mint Condition').code === 'M');
ok('Near Mint is NOT read as Mint', sc('Charizard 4/102 Near Mint').code === 'NM');

console.log('\n   the two traps, measured before they were coded around');
// 8 of 9 live titles containing "HP" meant Hit Points.
ok('"120 HP" is Hit Points, NOT Heavily Played',
  sc('Pokemon Charizard Base Set 4/102 Holo Rare 120 HP Mitsuhiro Arita').stated === false,
  JSON.stringify(sc('Pokemon Charizard Base Set 4/102 Holo Rare 120 HP Mitsuhiro Arita')));
ok('"130 HP" likewise', sc('Dialga 103/128 130 HP Holo').stated === false);
ok('a real "HP" with no number beside it still reads as Heavily Played',
  sc('Charizard 4/102 Base Set HP').code === 'HP');
ok('a title with BOTH is read on the condition word, not the stat',
  sc('Charizard 4/102 Base Set 120 HP Heavily Played').code === 'HP');
// 24 of 25 live titles containing "EX" meant the card mechanic.
ok('"Charizard ex" is NOT read as Excellent',
  sc('Charizard ex 199/165 SV 151 Special Illustration Rare').stated === false,
  JSON.stringify(sc('Charizard ex 199/165 SV 151 Special Illustration Rare')));
ok('"Charizard EX" capitalised is not read as a condition either',
  sc('Pokemon TCG Charizard EX 199/165 S&V 151').stated === false);

console.log('\n   the unstated group — 49.7% of live titles say nothing');
const silent = 'The Pokemon Company Charizard Base Set 4/102 Holo Rare Stage 2 EN Arita';
ok('a title stating no condition returns stated:false', sc(silent).stated === false);
ok('...and a null code, never a guessed one', sc(silent).code === null);
ok('those rows are identifiable so they can be GROUPED, not dropped',
  sc(silent).code === null && sc(silent).stated === false,
  'a filter that dropped them would hide half the market');

console.log('\n   the raw gate itself is unchanged by any of this');
keeps('an ordinary raw NM listing still passes a Raw NM search',
  'Charizard 4/102 Base Set Holo Rare English Near Mint', 'Raw NM');
drops('a slab is still refused from a raw search',
  'Charizard 4/102 Base Set PSA 10', 'Raw NM', CARD, 'slab');
keeps('a raw Giratina V alt art still passes',
  'Giratina V 186/196 Lost Origin Alt Art Ultra Rare NM', 'Raw NM', GIRA);

// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(64));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\n  FAILED:'); fails.forEach(f => console.log('    - ' + f)); }
console.log('='.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
