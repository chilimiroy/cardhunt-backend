// gradefilter.test.js — eBay's grader + grade fields, and refusal where they disagree
//
//   node gradefilter.test.js
//
// Measured 2026-09-27 (/api/ebay/conditions/en-base1-4?combo=3&verify=3):
// the combined `Professional Grader` + `Grade` filter narrows correctly; of
// 25 filtered items checked against their own descriptor 22 agreed, and all
// 3 misses were a different GRADE that the title stated. Titles below are
// those live rows unless marked (constructed).
//
// The rule: the filter narrows; the title is checked against it; where they
// disagree the row is refused, because neither is authoritative. Where the
// title is silent, the field answers.
'use strict';
const fs = require('fs');
const cm = require('./cardmatch');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

const ZARD = { name: 'Charizard', number: '4', setTotal: 102, setName: 'Base', setId: 'base1',
               lang: 'en', cardId: 'en-base1-4', setYear: 1999 };
const sgOf = g => { const f = cm.ebayGradeFilter(g); return { structuredGrade: { grader: f.grader, grade: f.grade } }; };
const V = (title, g, opts) => cm.verify(title, ZARD, g, opts === undefined ? sgOf(g) : opts);

// ── the filter we ask for ──
{
  const f = cm.ebayGradeFilter('TAG 8');
  ok(f && f.aspectFilter === 'categoryId:183454,Professional Grader:{Technical Authentication & Grading (TAG)},Grade:{8}',
     'TAG 8 -> both aspects, eBay\'s own names: ' + (f && f.aspectFilter));
  ok(cm.ebayGradeFilter('PSA 9.5') && cm.ebayGradeFilter('PSA 9.5').grade === '9.5', 'half grades are eBay Grade values');
  ok(cm.ebayGradeFilter('BGS 10 Black Label').grade === '10', 'a qualified ten filters on Grade 10; the title must state the qualifier');
  ok(/Professional Grader:\{Professional Sports Authenticator \(PSA\)\}$/.test(cm.ebayGradeFilter('PSA *').aspectFilter),
     'grader-wide filters the grader only');
  ok(cm.ebayGradeFilter('Raw NM') === null && cm.ebayGradeFilter('Raw') === null, 'raw is the condition filter\'s job');
  ok(cm.ebayGradeFilter('KSA 9') === null, 'a grader eBay was never seen naming gets no filter (title gate as before)');
  ok(cm.ebayGradeFilter('SGC 8').graderValue === 'Sportscard Guaranty Corporation (SGC)', 'SGC by eBay\'s name');
}

// ── the loose title reader: what a title CLAIMS ──
const claims = t => cm.titleGradeClaims(t).map(c => c.grader + ' ' + c.grade).join(',');
ok(claims('Pokemon 1999 Base Set Charizard 4/102 Holo Rare TAG Graded 8') === 'TAG 8', '"TAG Graded 8" is read');
ok(claims('Charizard 4/102 Base Set (Shadowless) Holo TAG graded 5.5 population 10') === 'TAG 5.5', 'the pop count is not the grade');
ok(claims('Pikachu & Zekrom GX TAG TEAM 33/181 PSA 10') === 'PSA 10', 'TAG TEAM is not TAG, 33/181 is not a grade');
ok(claims('Charizard 4/102 Base Set Holo 1999 WOTC Pokemon Card BGS 7 NM NEAR MINT') === 'BGS 7', 'strict reads survive');
ok(claims('1999 Pokemon Base Set Charizard Holo 4/102 (PSA 10 Contender)') === '', 'speculation is not a claim');

// ── KEPT: title and field agree, or the title is silent ──
const KEEP = [
  ['Pokemon 1999 Base Set Charizard 4/102 Holo Rare TAG Graded 8', 'TAG 8', 'title+ebay'],
  ['Wizards of the Coast 1999 Charizard 4/102 Base Set Holo Rare TAG 8 Graded', 'TAG 8', 'title+ebay'],
  ['Pokemon TAG 8 Charizard 4/102 Base Set Unlimited Holo', 'TAG 8', 'title+ebay'],
  ['Charizard 4/102 Base Set Holo Rare 1999 TAG Graded English WOTC', 'TAG 8', 'ebay'],        // (constructed) no number at all
  ['1999 Pokemon Base Set Charizard #4/102 Holo PSA 8 NM-MT Unlimited', 'PSA 8', 'title+ebay'],
  ['Pokemon Charizard Base Set Unlimited 4/102 Holo CGC 10 Gem Mint', 'CGC 10', 'title+ebay'],
  ['Charizard Holo #4 Pokemon Base SGC 8', 'SGC 8', 'title+ebay'],
  ['BGS 8 CHARIZARD 1999 Pokemon Base Unlimited #4/102 Holo Non-Shadowless NM-MINT', 'BGS 8', 'title+ebay'],
];
for (const [t, g, src] of KEEP) {
  const v = V(t, g);
  ok(v.ok && v.gradeSource === src, `keeps [${g}] ${t} -> ${v.ok ? v.gradeSource : v.reason}`);
}

// ── REFUSED: they disagree, or the field cannot be trusted alone ──
const REFUSE = [
  ['Charizard 4/102 Base Set (Shadowless) Holo TAG graded 5.5 population 10', 'TAG 10', /disagree/],   // filter said 10, descriptor 5.5
  ['BGS 9.5 CHARIZARD 1999 Pokemon Base #4/102 Holo QUAD TRUE GEM MINT (PSA 10 Pot?)', 'BGS 10', /disagree/], // filter 10, descriptor 9.5
  ['1999 Pokémon Tag 8 Charizard Base Set Holo Card 4/102 Charizard Trading Card', 'TAG 10', /disagree/],
  ['1999 Charizard 4/102 Base Set Shadowless Holo PSA 6', 'PSA 5.5', /disagree/],   // descriptor 5.5, title 6
  ['1999 Pokemon Base Set Charizard Holo 4/102 PSA/DNA Auto 10 Mitsuhiro AritaSIGNED', 'PSA 10', /autograph/],
  ['Charizard 4/102 Base Set Holo Rare 1999 PSA Slab', 'TAG 8', /names PSA/],                       // (constructed)
  ['Charizard 4/102 Base Set Holo Rare 1999 Graded', 'BGS 10 Black Label', /BLACK LABEL/],        // (constructed) qualifier unstated
  ['Pikachu 58/102 Base Set TAG Graded 8', 'TAG 8', /does not name/],                            // (constructed) card checks still run
  ['Pokemon Celebrations Base Set Charizard 4/102 - Holo Tag 10 Gem Mint', 'TAG 10', /./],        // a 2021 reprint, still refused
  // Found LIVE after the first deploy: a raw card under the PSA | 10 filter,
  // kept on the field alone at $6,100. A hoped-for grade says "ungraded".
  ['1999 Pokemon TCG Base Set Charizard Holo Rare 4/102 (PSA 10 Contender)', 'PSA 10', /ungraded/],
];
// A three-card lot, kept LIVE as one PSA 10 Charizard ($1,289 / $1,699.99) —
// on the field alone, and (older hole) with the grade stated too.
{
  const J = { name: 'リザードンex', nameEn: 'Charizard ex', number: '201', setTotal: 165, setName: 'ポケモンカード151',
              setId: 'SV2a', lang: 'ja', cardId: 'ja-SV2a-201', setYear: 2023 };
  for (const [t, o] of [['PSA10 Charizard Venusaur Blastoise ex SAR Set 201/165 Pokemon Card 151', { structuredGrade: { grader: 'PSA', grade: '10' } }],
                        ['PSA 10 Charizard Venusaur Blastoise ex SAR Set 201/165 Pokemon Card 151', undefined]]) {
    const v = cm.verify(t, J, 'PSA 10', o);
    ok(!v.ok && /not a single card/.test(v.reason), 'a "SAR Set" lot is refused: ' + (v.ok ? 'KEPT' : v.reason));
  }
  // ...and "set" in a genuine single's title is not a lot.
  const fr = cm.verify('Carte Pokémon - Dracaufeu Charizard - 4/102 - Set de Base - PSA 8', ZARD, 'PSA 8', null);
  ok(fr.ok, 'the French "Set de Base" single is kept: ' + (fr.reason || ''));
}
// ...and the real slab that merely speculates about ANOTHER grader stays.
{
  const v = V('BGS 9.5 CHARIZARD 1999 Pokemon Base #4/102 Holo QUAD TRUE GEM MINT (PSA 10 Pot?)', 'BGS 9.5');
  ok(v.ok && v.gradeSource === 'title+ebay', 'a BGS 9.5 with "(PSA 10 Pot?)" is still a BGS 9.5: ' + (v.reason || ''));
}
// Gained live, on the field alone — titles naming the grader but no grade.
for (const [t, g, card] of [
  ['Pokemon Charizard Base Set Holo Rare 4/102 WOTC 1999 CGC NM Mint', 'CGC 8', ZARD],
]) {
  const f = cm.ebayGradeFilter(g);
  const v = cm.verify(t, card, g, { structuredGrade: { grader: f.grader, grade: f.grade } });
  ok(v.ok && v.gradeSource === 'ebay', `gained on the field: [${g}] ${t} -> ${v.ok ? v.gradeSource : v.reason}`);
}
// "PSA10" was kept on the field alone until the unspaced form was read
// (2026-09-28, graderToken). Now the title states it, and the two agree.
{
  const JZ = { name: 'リザードンex', nameEn: 'Charizard ex', number: '201', setTotal: 165, setName: 'ポケモンカード151',
               setId: 'SV2a', lang: 'ja', cardId: 'ja-SV2a-201', setYear: 2023 };
  const t = 'PSA10 Charizard ex SAR 201/165 SV2a 151 Pokemon Card Japanese';
  const v = cm.verify(t, JZ, 'PSA 10', sgOf('PSA 10'));
  ok(v.ok && v.gradeSource === 'title+ebay', `"PSA10" is read from the title and agrees: ${v.ok ? v.gradeSource : v.reason}`);
  const w = cm.verify(t, JZ, 'PSA 9', sgOf('PSA 9'));
  ok(!w.ok && w.gradeConflict, `"PSA10" under a PSA 9 filter is now a disagreement, refused: ${w.ok ? 'KEPT' : w.reason}`);
}
for (const [t, g, why] of REFUSE) {
  const v = V(t, g);
  ok(!v.ok && why.test(v.reason || ''), `refuses [${g}] ${t} -> ${v.ok ? 'KEPT' : v.reason}`);
}

// ── the gain comes ONLY from the filter ──
ok(!V('Pokemon 1999 Base Set Charizard 4/102 Holo Rare TAG Graded 8', 'TAG 8', null).ok,
   'without the filter, "TAG Graded 8" is refused exactly as before');
ok(!V('Charizard 4/102 Base Set Holo Rare 1999 TAG Graded English WOTC', 'TAG 8', { structuredGrade: { grader: 'TAG', grade: '10' } }).ok,
   'a structured grade that is not what was asked is ignored, not trusted');
ok(!V('Charizard 4/102 Base Set Holo Rare 1999 TAG Graded English WOTC', 'PSA *', { structuredGrade: { grader: 'PSA', grade: null } }).ok,
   'grader-wide: a title with no grade number is not rescued (the grade would be unknown)');
ok(V('Charizard 4/102 Base Set Holo PSA 9', 'PSA 9', null).gradeSource === 'title', 'no filter: gradeSource says title');

// ── wired, and reported ──
const server = fs.readFileSync('server.js', 'utf8');
ok(/const gradeFilter = condFilter \? null : cm\.ebayGradeFilter\(grade\);/.test(server), 'sourceEbay builds the grade filter');
ok(/cm\.verify\(title, matchCard, grade, gateOpts\)/.test(server), 'the gate receives the structured grade');
ok(/aspectFilter \? '&aspect_filter='/.test(server), 'the filter reaches the request');
ok(/gradeSource: v\.gradeSource \|\| null/.test(server) && /gradeSource: o\.gradeSource \|\| null/.test(server), 'rows carry gradeSource');
ok(/refusedOnDisagreement/.test(server) && /keptOnEbayFieldAlone/.test(server), 'the source block reports both effects');
const page = fs.readFileSync('cardhunt_preview.html', 'utf8');
ok(/l\.gradeSource === 'ebay'/.test(page), 'the panel says when a grade came from eBay\'s fields alone');

console.log(`\ngradefilter.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
