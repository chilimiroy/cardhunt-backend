// ══════════════════════════════════════════════════════════════
// matchparity.test.js — node matchparity.test.js
//
// Two things that must agree, asserted rather than assumed:
//
//  1. THE DEEP LINK AND THE API CALL ask eBay the same question.
//     They did not. The server sent "Charizard VMAX 74 PSA 10 pokemon
//     card" while holding setTotal:73 and setName:"Champion's Path" in a
//     gate object beside it — so eBay was asked for any Charizard VMAX
//     and whatever came back was shown. Same shape as the estimator
//     split: two implementations of one thing, drifting.
//
//  2. cardmatch.verify() AND listingparse.compare() agree on a title.
//     They read the same string by different routes — one from the raw
//     text, one from a parsed structure. Where they disagree, one of
//     them is wrong. Cross-checking two paths that should agree has
//     found more in this project than any other technique.
//
// Standalone: server.js is deployed and the frontend is a single HTML
// file. A test living inside either vanishes exactly when needed.
// ══════════════════════════════════════════════════════════════

'use strict';

const cm = require('./cardmatch');
const lp = require('./listingparse');

let pass = 0, fail = 0;
const failures = [];
function chk(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); return true; }
  fail++; failures.push(label + (detail ? '\n        ' + detail : ''));
  console.log('  FAIL  ' + label);
  return false;
}

// ── The frontend's adapter, mirrored from cardhunt_preview.html ──
// The frontend card is nested; cardmatch takes a flat shape. If this
// adapter drifts from the one in the HTML the parity assertion below
// stops meaning anything, so it is written out in full here on purpose.
function toMatchCard(card, opts) {
  opts = opts || {};
  return {
    name: (opts.useLocalName && card.name) ? card.name : (card.nameEn || card.name || ''),
    nameEn: null,
    number: card.number,
    setTotal: (card.set && card.set.total) || null,
    setName: opts.includeSet ? ((card.set && (card.set.nameEn || card.set.name)) || null) : null
  };
}

// The server's shape, mirrored from sourceEbay in server.js.
function serverMatchCard(row) {
  return {
    name: row.name_en || row.name,
    nameEn: row.name_en || null,
    number: row.number,
    setTotal: row.set_total,
    setName: row.set_name_en || row.set_name
  };
}

// ══════════════════════════════════════════════════════════════
console.log('\n1. THE DEEP LINK AND THE API ASK ONE QUESTION\n');
// ══════════════════════════════════════════════════════════════
const CARDS = [
  { label: "Champion's Path Charizard VMAX",
    db: { name: 'Charizard VMAX', name_en: null, number: '74', set_total: 73,
          set_name: "Champion's Path", set_name_en: null },
    fe: { name: 'Charizard VMAX', nameEn: 'Charizard VMAX', number: '74',
          set: { total: 73, nameEn: "Champion's Path" } } },
  { label: 'Base Set Charizard',
    db: { name: 'Charizard', name_en: null, number: '004', set_total: 102,
          set_name: 'Base Set', set_name_en: null },
    fe: { name: 'Charizard', nameEn: 'Charizard', number: '004',
          set: { total: 102, nameEn: 'Base Set' } } },
  { label: 'Mega Hawlucha ex #268',
    db: { name: 'Mega Hawlucha ex', name_en: null, number: '268', set_total: 267,
          set_name: 'Mega Evolution', set_name_en: null },
    fe: { name: 'Mega Hawlucha ex', nameEn: 'Mega Hawlucha ex', number: '268',
          set: { total: 267, nameEn: 'Mega Evolution' } } },
  { label: 'a Japanese card searched in English',
    db: { name: 'リザードンex', name_en: 'Charizard ex', number: '201', set_total: 165,
          set_name: 'ポケモンカード151', set_name_en: 'Pokemon 151' },
    fe: { name: 'リザードンex', nameEn: 'Charizard ex', number: '201',
          set: { total: 165, nameEn: 'Pokemon 151' } } }
];

for (const g of ['Raw NM', 'PSA 10', 'BGS 9.5', 'CGC 10']) {
  for (const c of CARDS) {
    const api = cm.buildQuery(serverMatchCard(c.db), g);
    const link = cm.buildQuery(toMatchCard(c.fe, { includeSet: true }), g, { suffix: true });
    chk(`${g.padEnd(7)} ${c.label}`, api === link,
        `api  = ${JSON.stringify(api)}\n        link = ${JSON.stringify(link)}`);
  }
}

// The query must actually CARRY the set size and set name — the whole bug.
{
  const q = cm.buildQuery(serverMatchCard(CARDS[0].db), 'PSA 10');
  // A slab asks the bare number (T0: PSA labels print "#74"); raw asks the pair.
  chk('the query carries the N/M pair', /74\/73/.test(cm.buildQuery(serverMatchCard(CARDS[0].db), 'Raw NM')) && /\b0?74\b/.test(q), q);
  chk('the query carries the set name', /Champion's Path/.test(q), q);
  chk('the query carries the grade', /PSA 10/.test(q), q);
  chk('it is NOT the old bare-number query', q !== 'Charizard VMAX 74 PSA 10 pokemon card', q);
}

// ══════════════════════════════════════════════════════════════
console.log('\n2. THE GATE ALLOWS THE RIGHT CARD  (not merely rejects)\n');
// ══════════════════════════════════════════════════════════════
// TASK.md: "Base Set Charizard 004/102 at PSA 10 must return only that
// card at that grade." A gate tested only on refusals passes by refusing
// everything, which is how looksLikeJunk destroyed ~80 valid prices a set.
const BASE_CHARIZARD = { name: 'Charizard', number: '004', setTotal: 102, setName: 'Base Set' };

const MUST_KEEP = [
  '1999 Pokemon Base Set Charizard 4/102 Holo Rare PSA 10 GEM MINT',
  'Pokemon Charizard 004/102 Base Set Unlimited PSA 10',
  'PSA 10 Charizard Base Set 4/102 Holo 1999',
  'Charizard 4/102 Base Set Shadowless PSA 10 Gem Mint',
  '1999 Pokemon Game Charizard #4 Base Set Holo PSA 10'   // bare number + set name
];
for (const t of MUST_KEEP) {
  const v = cm.verify(t, BASE_CHARIZARD, 'PSA 10');
  chk('KEEP  ' + t.slice(0, 58), v.ok, v.reason);
}

const MUST_DROP = [
  ['1999 Pokemon Base Set Charizard 4/102 PSA 9', 'wrong grade'],
  ['Pokemon Charizard 4/130 Base Set 2 Holo PSA 10', 'wrong set size'],
  ['Pokemon Charizard 4/102 Base Set CGC 10', 'wrong grader'],
  ['Pokemon Base Set Blastoise 2/102 PSA 10', 'wrong card'],
  ['Pokemon Base Set Charizard 4/102 PSA 10 Lot of 3', 'a lot'],
  ['Pokemon Base Set Booster Box Charizard 4/102 PSA 10', 'sealed'],
  ['Charizard 4/102 Custom Orica Proxy PSA 10', 'custom'],
  ['Pokemon Charizard PSA 10 Base Set', 'no number'],
  ['Pokemon Charizard #4 PSA 10 Holo', 'number but no set'],
  ['Charizard 4/102 Base Set PSA 10 BGS 9.5', 'two grades named']
];
for (const [t, why] of MUST_DROP) {
  const v = cm.verify(t, BASE_CHARIZARD, 'PSA 10');
  chk(`DROP  ${why.padEnd(18)} ${t.slice(0, 44)}`, !v.ok, 'was kept');
}

// ── The Mega Hawlucha case TASK.md names explicitly ──
// "the same set holds #283, and returning #283 is a failure"
{
  const hawlucha = { name: 'Mega Hawlucha ex', number: '268', setTotal: 267,
                     setName: 'Mega Evolution' };
  const v268 = cm.verify('Pokemon Mega Hawlucha ex 268/267 Mega Evolution PSA 10', hawlucha, 'PSA 10');
  chk('Mega Hawlucha #268 is kept', v268.ok, v268.reason);
  const v283 = cm.verify('Pokemon Mega Hawlucha ex 283/267 Mega Evolution PSA 10', hawlucha, 'PSA 10');
  chk('  and #283 from the SAME set is rejected', !v283.ok, 'was kept');
  chk('  with a reason naming the number', /283|number/.test(v283.reason || ''), v283.reason);
}

// ── Raw must exclude slabs, and keep genuinely raw cards ──
{
  const raw = cm.verify('Pokemon Base Set Charizard 4/102 Holo Near Mint', BASE_CHARIZARD, 'Raw NM');
  chk('RAW keeps an ungraded card', raw.ok, raw.reason);
  const slab = cm.verify('Pokemon Base Set Charizard 4/102 PSA 10', BASE_CHARIZARD, 'Raw NM');
  chk('RAW rejects a slab', !slab.ok, 'was kept');
}

// ══════════════════════════════════════════════════════════════
console.log('\n3. EDITION AND VARIANT ARE LABELS, NEVER GATES\n');
// ══════════════════════════════════════════════════════════════
// 1st Edition, Shadowless and Unlimited Base Set Charizards all read
// 4/102 and sell at wildly different prices. All three must be KEPT —
// a variant is information the user wants, not a mismatch.
const EDITIONS = [
  ['1999 Pokemon Base Set Charizard 4/102 1st Edition PSA 10', '1st Edition'],
  ['1999 Pokemon Base Set Charizard 4/102 Shadowless PSA 10', 'Shadowless'],
  ['1999 Pokemon Base Set Charizard 4/102 Unlimited PSA 10', 'Unlimited']
];
for (const [t, want] of EDITIONS) {
  const v = cm.verify(t, BASE_CHARIZARD, 'PSA 10');
  chk(`${want.padEnd(12)} is KEPT, not rejected`, v.ok, v.reason);
  const p = lp.parseListingTitle(t);
  chk(`  and labelled: edition=${p && p.edition}`,
      !!(p && p.edition && String(p.edition).toLowerCase().includes(want.split(' ')[0].toLowerCase())),
      JSON.stringify(p && p.edition));
}

// ══════════════════════════════════════════════════════════════
console.log('\n4. cardmatch AND listingparse AGREE\n');
// ══════════════════════════════════════════════════════════════
// Where these two disagree about the same title, one of them is wrong.
const CROSS = [
  ['1999 Pokemon Base Set Charizard 4/102 Holo PSA 10 GEM MINT', true],
  ['Pokemon Base Set Charizard 4/102 PSA 9', false],
  ['Pokemon Base Set Charizard 4/130 PSA 10', false],
  ['Pokemon Base Set Charizard 4/102 CGC 10', false],
  ['Pokemon Base Set Charizard 4/102 PSA 10 Lot', false],
  ['Pokemon Base Set Charizard 4/102 1st Edition PSA 10', true],
  ['2020 Pokemon Base Set Charizard 004/102 PSA 10 Shadowless Holo', true]
];
let agreed = 0;
for (const [t, expected] of CROSS) {
  const v = cm.verify(t, BASE_CHARIZARD, 'PSA 10');
  const p = lp.parseListingTitle(t);
  const c = lp.compare(p, BASE_CHARIZARD, 'PSA 10');
  const same = (v.ok === c.match);
  if (same) agreed++;
  chk(`both ${v.ok ? 'keep  ' : 'reject'} ${t.slice(0, 46)}`, same,
      `cardmatch=${v.ok} (${v.reason || 'ok'})  listingparse=${c.match} (${(c.disagree || []).join('; ')})`);
  chk(`  and it is the expected verdict (${expected ? 'keep' : 'reject'})`, v.ok === expected,
      v.reason || 'kept');
}
chk(`the two readers agreed on ${agreed}/${CROSS.length} titles`, agreed === CROSS.length);

// ══════════════════════════════════════════════════════════════
console.log('\n4b. REPRINTS THAT REUSE THE ORIGINAL NUMBERING\n');
// ══════════════════════════════════════════════════════════════
// Every title below is REAL, taken from a live eBay search for
// "Charizard 4/102 Base Set PSA 10" on 2026-09-07. That search kept 24
// listings spanning $536.75 to $249,999.95 — a 465x range — because
// Celebrations Classic Collection (2021) reprints Base Set cards with the
// ORIGINAL 4/102 numbering and the words "Base Set" in the title. Number,
// set size and set name all matched. This is the master-ball mirror in
// English, and the price gap makes it worse.
const BASE_1999 = { name: 'Charizard', number: '4', setTotal: 102,
                    setName: 'Base Set', setYear: 1999 };

const REAL_KEEP = [
  '1999 pokemon base set charizard holo 4/102 psa 10',
  'PSA 10 GEM MINT Shadowless Base Set Charizard 4/102 Pokemon TCG',
  'PSA 10 GEM MINT Pokemon CHARIZARD Holo Rare Base Set 4/102 Unlimited',
  // A grading year alongside the print year must NOT reject the card.
  '1999 Pokemon Base Set Charizard 4/102 PSA 10 graded 2021'
];
for (const t of REAL_KEEP) {
  const v = cm.verify(t, BASE_1999, 'PSA 10');
  chk('KEEP  ' + t.slice(0, 58), v.ok, v.reason);
}

const REAL_DROP = [
  'PSA 10 Charizard Celebrations Classic 4/102 Holo Base Set Pokemon Card',
  '2021 Pokemon Celebrations Charizard #4 102 Classic Base Set Holo PSA 10',
  '2021 Pokemon Celebrations Base Set Classic Collection Charizard 4/102 PSA 10',
  'Pokemon TCG: Charizard Holo 4/102 Celebrations Base Set PSA 10 GEM MINT'
];
for (const t of REAL_DROP) {
  const v = cm.verify(t, BASE_1999, 'PSA 10');
  chk('DROP reprint  ' + t.slice(0, 50), !v.ok, 'was kept');
}

// The reprint gate must not fire when the card IS from that set.
{
  const celeb = { name: 'Charizard', number: 'CC002', setTotal: 25, setId: 'cel25cc',
                  setName: 'Celebrations Classic Collection', setYear: 2021 };
  const v = cm.verify('2021 Pokemon Celebrations Classic Collection Charizard 4/102 PSA 10',
                      celeb, 'PSA 10');
  chk('a Celebrations card DOES match a Celebrations listing', v.ok, v.reason);
}

// A year is rejected only on stated evidence. No year in the title is not
// a mismatch — most titles have none, and rejecting them would empty the
// results the way looksLikeJunk emptied the price table.
{
  const v = cm.verify('Pokemon Base Set Charizard 4/102 Holo PSA 10', BASE_1999, 'PSA 10');
  chk('a title with NO year is kept, not rejected', v.ok, v.reason);
  const noYearCard = { name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set' };
  const v2 = cm.verify('2021 Pokemon Charizard 4/102 Base Set PSA 10', noYearCard, 'PSA 10');
  chk('no setYear on our side means no year rejection', v2.ok, v2.reason);
}

// ── "Classic Collection" is a set name, not a bundle ──
// `collection` in NOT_A_SINGLE_CARD rejected these as lots. That is the
// looksLikeJunk shape: a guard against bad data eating good data.
{
  const celeb = { name: 'Charizard', number: 'CC002', setTotal: 25, setId: 'cel25cc',
                  setName: 'Celebrations Classic Collection', setYear: 2021 };
  const v = cm.verify('2021 Pokemon Celebrations Classic Collection Charizard 4/102 PSA 10',
                      celeb, 'PSA 10');
  chk('"Classic Collection" is not read as a lot', v.ok,
      v.reason || 'kept');
  chk('  but a genuine lot is still rejected',
      !cm.verify('Pokemon Charizard 4/102 PSA 10 Lot of 3 Cards', BASE_1999, 'PSA 10').ok);
  chk('  and sealed product is still rejected',
      !cm.verify('Pokemon Base Set Booster Box Charizard 4/102', BASE_1999, 'Raw NM').ok);
}

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
console.log('\n4c. A HOPED-FOR GRADE IS NOT A GRADE\n');
// ══════════════════════════════════════════════════════════════
// Real title from the live search:
//   "1999 Pokemon TCG Base Set Charizard Holo Rare 4/102 (PSA 10 Contender)"
// at $8,000. That card is UNGRADED — the seller is advertising what they
// think it would earn. It was originally asserted here as a PSA 10 keep,
// which was wrong: reading the hoped-for grade as the actual grade puts an
// $8,000 raw card in a list where the real article is $250,000.
//
// It belongs in the RAW results and nowhere else, so BOTH directions are
// asserted — a title findable in neither search would be a worse bug than
// the one being fixed.
{
  const CONTENDER = '1999 Pokemon TCG Base Set Charizard Holo Rare 4/102 (PSA 10 Contender)';
  chk('a "PSA 10 Contender" is NOT a PSA 10',
      !cm.verify(CONTENDER, BASE_1999, 'PSA 10').ok, 'was kept as PSA 10');
  chk('  but IS findable as a raw card',
      cm.verify(CONTENDER, BASE_1999, 'Raw NM').ok,
      cm.verify(CONTENDER, BASE_1999, 'Raw NM').reason);

  const POT = 'BGS 9.5 CHARIZARD 1999 Pokemon Base #4/102 Holo QUAD TRUE GEM MINT (PSA 10 Pot?)';
  chk('"(PSA 10 Pot?)" on a BGS 9.5 does not read as PSA 10',
      !cm.verify(POT, BASE_1999, 'PSA 10').ok);
  chk('  and the BGS 9.5 it really is still matches BGS 9.5',
      cm.verify(POT, BASE_1999, 'BGS 9.5').ok,
      cm.verify(POT, BASE_1999, 'BGS 9.5').reason);

  for (const t of ['1999 pokemon base set charizard holo 4/102 psa 10',
                   'PSA 10 GEM MINT Shadowless Base Set Charizard 4/102',
                   '1999 Pokemon Base Set Charizard 4/102 PSA 10 (Gem Mint)']) {
    chk('  genuine slab still kept: ' + t.slice(0, 42),
        cm.verify(t, BASE_1999, 'PSA 10').ok, cm.verify(t, BASE_1999, 'PSA 10').reason);
  }
  chk('  and a genuine slab is still excluded from RAW',
      !cm.verify('1999 pokemon base set charizard holo 4/102 psa 10', BASE_1999, 'Raw NM').ok);
}

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
console.log('\n4d. A QUERY eBay CAN ACTUALLY ANSWER\n');
// ══════════════════════════════════════════════════════════════
// ja-SV2a-201 has name_en "Charizard ex" but set_name_en NULL, so the set
// name fell back to Japanese and the query became
//   "Charizard ex 201/165 ポケモンカード151 PSA 10 pokemon"
// which returned ZERO results from eBay US. Measured live, not assumed:
// the response read "0 kept, 0 rejected" — nothing was filtered, nothing
// came back.
//
// Under "broad query, strict gate" an unusable term is worse than a missing
// one: it guarantees an empty result, while the gate can always reject
// whatever a broader search returns.
{
  const jp = { name: 'Charizard ex', nameEn: 'Charizard ex', number: '201',
               setTotal: 165, setName: 'ポケモンカード151', setYear: 2023 };
  const q = cm.buildQuery(jp, 'PSA 10');
  chk('a Japanese set name is left OUT of the query', !/[^ -~\s]/.test(q), q);
  chk('  the English card name is still sent', /Charizard ex/.test(q), q);
  chk('  and the number survives', /\b201\b/.test(q) && /201\/165/.test(cm.buildQuery(jp, 'Raw NM')), q);

  // The GATE keeps the set name — this only changes what is ASKED.
  chk('  the gate still accepts the right card',
      cm.verify('Pokemon Charizard ex 201/165 PSA 10', jp, 'PSA 10').ok);
  chk('  and still rejects the wrong number',
      !cm.verify('Pokemon Charizard ex 200/165 PSA 10', jp, 'PSA 10').ok);

  // An English set name must still be sent.
  const en = { name: 'Charizard', number: '4', setTotal: 102,
               setName: 'Base Set', setYear: 1999 };
  chk('  an English set name IS still included',
      /Base Set/.test(cm.buildQuery(en, 'PSA 10')));
}

// ==============================================================
// ==============================================================
console.log('\n4e. A DIFFERENT LANGUAGE IS A DIFFERENT CARD\n');
// ==============================================================
// Korean prints share Japanese set codes AND numbering: a Korean Charizard
// ex is genuinely 201/165 from SV2a, so number, set size and grade all
// agree. A live search for the JAPANESE card kept 25 listings of which 6
// were Korean, $459-$632 against $620-$715 for the Japanese ones.
//
// CLAUDE.md: cross-language matching is for FINDING equivalents, never for
// DISPLAYING them. Rejects only on a STATED language — most titles say
// nothing and those are kept, because inference is for absent data.
{
  const JP = { name: 'Charizard ex', nameEn: 'Charizard ex', number: '201',
               setTotal: 165, setName: 'ポケモンカード151', setYear: 2023, lang: 'ja' };
  const EN = { name: 'Charizard', number: '4', setTotal: 102,
               setName: 'Base Set', setYear: 1999, lang: 'en' };

  chk('a Korean print is rejected for a Japanese card',
      !cm.verify('Charizard ex 201/165 Sv2a Pokemon 151 Holo (Korean) PSA 10', JP, 'PSA 10').ok);
  chk('  "Korea" too, not just "Korean"',
      !cm.verify('PSA 10 Charizard ex Alt Art 201/165 Sv2a Pokemon Korea 151', JP, 'PSA 10').ok);
  chk('  a Japanese print IS kept',
      cm.verify('Pokemon 2023 SV2a Charizard ex 201/165 SAR Japanese PSA 10', JP, 'PSA 10').ok);
  chk('  a title stating NO language is kept',
      cm.verify('PSA 10 Charizard ex Alt Art 201/165 Sv2a Pokemon 151', JP, 'PSA 10').ok);
  chk('  a Japanese print is rejected for an ENGLISH card',
      !cm.verify('1999 Japanese Pokemon Base Set Charizard 4/102 PSA 10', EN, 'PSA 10').ok);
  chk('  and an English one is kept',
      cm.verify('1999 Pokemon Base Set Charizard 4/102 PSA 10 English', EN, 'PSA 10').ok);
  chk('  no lang on our side means no language rejection',
      cm.verify('Korean Pokemon Base Set Charizard 4/102 PSA 10',
                { name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set' }, 'PSA 10').ok);

  // The query must stay searchable: a CJK set name is dropped, a numeric
  // English one like "151" is NOT.
  chk('  a CJK set name is left out of the query',
      !/[^ -~]/.test(cm.buildQuery(JP, 'PSA 10')), cm.buildQuery(JP, 'PSA 10'));
  chk('  but the numeric English set name "151" is kept',
      /151/.test(cm.buildQuery({ name: 'Charmander', number: '004', setTotal: 165,
                                 setName: '151' }, 'Raw NM')));
}

// ==============================================================
console.log('\n5. filterListings REPORTS BOTH NUMBERS\n');
// ══════════════════════════════════════════════════════════════
// "no listings" and "everything was filtered out" must never look alike.
{
  const rows = MUST_KEEP.concat(MUST_DROP.map(x => x[0])).map(t => ({ title: t, price: 10 }));
  const { kept, dropped } = cm.filterListings(rows, BASE_CHARIZARD, 'PSA 10');
  chk(`kept ${kept.length}, dropped ${dropped.length} — both reported`,
      kept.length === MUST_KEEP.length && dropped.length === MUST_DROP.length,
      `expected ${MUST_KEEP.length}/${MUST_DROP.length}`);
  chk('every drop carries a reason',
      dropped.every(d => typeof d.reason === 'string' && d.reason.length > 3));
  chk('no drop is silent', dropped.every(d => d.title));

  const none = cm.filterListings([], BASE_CHARIZARD, 'PSA 10');
  chk('an empty source yields 0 kept AND 0 dropped — distinguishable from filtering',
      none.kept.length === 0 && none.dropped.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) { failures.forEach(f => console.log('   FAIL  ' + f)); console.log(''); }
process.exit(fail ? 1 : 0);
