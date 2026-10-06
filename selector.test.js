// selector.test.js — the card page's status/condition selector and the gate
// must agree about what a grade IS.
//
//   node selector.test.js
//
// ── Why this file exists ──
// The selector is a second place that names grades. Every second list of one
// thing in this project has drifted: SLAB_WORDS from GRADERS (a $987 AiGrade
// slab passed a raw search), the frontend estimator from ingest's (9x apart
// on one card), /api/sets from /api/sets/lang/en (33 sets lost their prices
// or their links).
//
// So this does not test the selector's own opinion of itself. It extracts the
// REAL functions from the shipped page, runs them, and feeds every string
// they can produce into the REAL cardmatch. A grade the box can offer but the
// gate cannot parse would return an empty list and look like "no listings".

const fs = require('fs');
const path = require('path');
const cm = require('./cardmatch.js');

const html = fs.readFileSync(path.join(__dirname, 'cardhunt_preview.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// ── Lift the selector out of the page and run it for real ─────
// Bounded by the next top-level declaration, never by a byte count — the
// over-slicing failure this project has had three times.
const FN_DECL = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/g;
function sliceFn(name) {
  const decl = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = decl.exec(html);
  if (!m) return '';
  FN_DECL.lastIndex = m.index + 1;
  const next = FN_DECL.exec(html);
  return html.slice(m.index, next ? next.index : m.index + 6000);
}

// The two data structures the box is built from.
function sliceVar(name) {
  const i = html.indexOf('var ' + name + ' = {');
  if (i < 0) return '';
  let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1) + ';'; }
  }
  return '';
}

const src = [
  'var CM = cm; function liveCM() { return cm; }',
  sliceVar('STATUS_CONDITIONS'),
  sliceVar('TITLE_ONLY_RAW'),
  'var SEL = { status: "Raw", condition: "All", otherGrader: null };',
  (html.match(/var VERIFIED_OTHER = \[[^\]]*\];/) || [''])[0],
  sliceFn('otherGraders'),
  sliceFn('selectorGrade'),
  'return { STATUS_CONDITIONS: STATUS_CONDITIONS, TITLE_ONLY_RAW: TITLE_ONLY_RAW, SEL: SEL, selectorGrade: selectorGrade, otherGraders: otherGraders,',
  '         VERIFIED_OTHER: typeof VERIFIED_OTHER !== "undefined" ? VERIFIED_OTHER : null };'
].join('\n');

let box;
try { box = new Function('cm', src)(cm); }
catch (e) { console.log('\n  COULD NOT LIFT THE SELECTOR: ' + e.message + '\n'); process.exit(1); }

console.log('\nselector.test.js — the box and the gate, on the shipped page');

// ══════════════════════════════════════════════════════════════
console.log('\n1. THE BOX WAS ACTUALLY FOUND (or everything below is vacuous)');
ok('STATUS_CONDITIONS lifted from the page', !!box.STATUS_CONDITIONS
  && Object.keys(box.STATUS_CONDITIONS).length >= 7,
  Object.keys(box.STATUS_CONDITIONS || {}).join(', '));
ok('selectorGrade lifted and callable', typeof box.selectorGrade === 'function');
ok('otherGraders lifted and callable', typeof box.otherGraders === 'function');
ok('otherGraders returns graders cardmatch knows',
  box.otherGraders().every(function (g) { return cm.GRADERS_UNAMBIGUOUS.indexOf(g) >= 0 || cm.GRADERS_AMBIGUOUS.indexOf(g) >= 0; }),
  box.otherGraders().join(', '));
// Roy's status row (T4) is Raw · PSA · BGS · CGC · Other. SGC and TAG lost
// their own buttons and lead the Other list instead.
ok('...and does not re-offer the ones with their own status',
  ['PSA', 'BGS', 'CGC'].every(function (g) { return box.otherGraders().indexOf(g) < 0; }),
  box.otherGraders().join(', '));
ok('SGC and TAG lead Other, in that order',
  box.otherGraders()[0] === 'SGC' && box.otherGraders()[1] === 'TAG',
  box.otherGraders().join(', '));
// T4: ACE was in cardmatch all along (GRADERS_AMBIGUOUS) and missing only
// from the UI, which read GRADERS_UNAMBIGUOUS alone.
ok('ACE is offered under Other', box.otherGraders().indexOf('ACE') >= 0, box.otherGraders().join(', '));
ok('...and cardmatch still counts bare ACE as ambiguous (ACE SPEC stays raw)',
  cm.GRADERS_AMBIGUOUS.indexOf('ACE') >= 0 && cm.GRADERS_UNAMBIGUOUS.indexOf('ACE') < 0);
ok('the verified graders are exactly SGC, TAG, ACE, AGS, ISA',
  JSON.stringify(box.VERIFIED_OTHER) === JSON.stringify(['SGC', 'TAG', 'ACE', 'AGS', 'ISA']),
  JSON.stringify(box.VERIFIED_OTHER));
ok('the status row is exactly Raw · PSA · BGS · CGC · Other',
  html.indexOf("var TOP_STATUSES = ['Raw', 'PSA', 'BGS', 'CGC', 'Other'];") >= 0);
ok('each grader under Other keeps its own scale',
  html.indexOf('if (status === ' + String.fromCharCode(39) + 'Other' + String.fromCharCode(39) + ') return STATUS_CONDITIONS[otherGrader] || STATUS_CONDITIONS.Other;') >= 0);

// ══════════════════════════════════════════════════════════════
console.log('\n2. EVERY COMPANY\'S PUBLISHED SCALE, EXACTLY');
// T4, 2026-09-27: each checked against the company's own scale page (see
// the comment above STATUS_CONDITIONS for URLs and the two that could only
// be read via search). No "lower" bucket — Roy wanted every grade shown.
const halves = function (top, bottom) {           // '9.5' .. '1' in halves
  const out = [];
  for (let g = top * 2; g >= bottom * 2; g--) out.push(String(g / 2));
  return out;
};
const WANT = {
  // eBay's Card Condition has four values (its own policy, 2026-09-27). M and
  // DMG are offered anyway, answered from the seller's title and marked
  // seller-stated — an option eBay cannot filter is not an option removed.
  Raw:   ['All', 'M', 'NM', 'LP', 'MP', 'HP', 'DMG'],
  // PSA: half-points "between PSA 2 and PSA 9" — so no 9.5 — plus FR 1.5.
  PSA:   ['All', '10', '9'].concat(halves(8.5, 1)),
  BGS:   ['All', '10 Black Label', '10 Pristine'].concat(halves(9.5, 1)),
  CGC:   ['All', '10 Pristine', '10 Gem Mint'].concat(halves(9.5, 1)),
  SGC:   ['All', '10 Pristine', '10 Gem Mint'].concat(halves(9.5, 1)),
  // TAG: "half points on every grade level except for between 9 and 10".
  TAG:   ['All', '10 Pristine', '10 Gem Mint', '9'].concat(halves(8.5, 1)),
  // ACE: whole grades only, no Pristine.
  ACE:   ['All', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
  // AGS: Legendary and Gem Mint tens, whole grades, 1.5 the only half.
  AGS:   ['All', '10 Legendary', '10 Gem Mint', '9', '8', '7', '6', '5', '4', '3', '2', '1.5', '1'],
  // ISA: half-points "from ISA 1 to ISA 8".
  ISA:   ['All', '10', '9'].concat(halves(8.5, 1)),
  // Unchecked graders: grader-wide only, never a guessed grade.
  Other: ['All']
};
ok('no status offers "lower" any more', Object.keys(box.STATUS_CONDITIONS).every(function (k) {
  return box.STATUS_CONDITIONS[k].indexOf('lower') < 0;
}));
ok('no status offers a 9.5 that its company does not issue (PSA, TAG, ACE, AGS, ISA)',
  ['PSA', 'TAG', 'ACE', 'AGS', 'ISA'].every(function (k) { return box.STATUS_CONDITIONS[k].indexOf('9.5') < 0; }));
Object.keys(WANT).forEach(function (st) {
  ok(st + ' offers exactly ' + WANT[st].join(' / '),
    JSON.stringify(box.STATUS_CONDITIONS[st]) === JSON.stringify(WANT[st]),
    JSON.stringify(box.STATUS_CONDITIONS[st]));
});
ok('every status leads with All', Object.keys(box.STATUS_CONDITIONS).every(function (k) {
  return box.STATUS_CONDITIONS[k][0] === 'All';
}));

// ══════════════════════════════════════════════════════════════
console.log('\n3. EVERY OPTION THE BOX CAN OFFER PARSES AS THE GATE EXPECTS');
// This is the whole point. A grade the box offers but cardmatch reads as
// something else returns an empty list and looks like "no listings".
function gradeFor(status, cond, other) {
  box.SEL.status = status; box.SEL.condition = cond; box.SEL.otherGrader = other || null;
  return box.selectorGrade();
}

let checked = 0;
Object.keys(box.STATUS_CONDITIONS).forEach(function (st) {
  box.STATUS_CONDITIONS[st].forEach(function (cond) {
    const g = gradeFor(st, cond);
    const p = cm.parseGrade(g);
    checked++;
    if (st === 'Raw') {
      ok('Raw + ' + cond + ' -> "' + g + '" parses as RAW',
        p.kind === 'raw', JSON.stringify(p));
    } else {
      const grader = st === 'Other' ? box.otherGraders()[0] : st;
      ok(st + ' + ' + cond + ' -> "' + g + '" parses as GRADED ' + grader,
        p.kind === 'graded' && p.grader === grader,
        JSON.stringify(p));
    }
  });
});
ok('a meaningful number of combinations were checked', checked >= 40, checked + ' combinations');

// ── The path the UI actually takes: status Other, then a grader ──
// Every grader Other offers, with the scale conditionsFor() would give it.
console.log('\n3b. EVERY GRADER UNDER OTHER, EVERY GRADE IT OFFERS, THROUGH THE REAL GATE');
const CARD3 = { name: 'Charizard', number: '4', setTotal: 102, setId: 'base1',
                setName: 'Base Set', setYear: 1999, api_card_id: 'en-base1-4' };
// What a seller writes for this option, e.g. "SGC 10 Pristine", "PSA 8.5".
function titleFor(grader, cond) {
  return 'Pokemon Charizard 4/102 Base Set Holo ' + grader + ' ' + cond + ' 1999';
}
let everyOption = 0, allOptions = [];
['PSA', 'BGS', 'CGC'].map(function (g) { return [g, g, null]; })
  .concat(box.otherGraders().map(function (g) { return ['Other', g, g]; }))
  .forEach(function (row) {
    const status = row[0], grader = row[1], other = row[2];
    const scale = box.STATUS_CONDITIONS[status === 'Other' ? grader : status] || box.STATUS_CONDITIONS.Other;
    scale.forEach(function (cond) {
      const g = gradeFor(status, cond, other);
      const p = cm.parseGrade(g);
      everyOption++;
      allOptions.push(grader + ' ' + cond);
      if (cond === 'All') {
        ok(grader + ' + All -> "' + g + '" is grader-wide', p.kind === 'graded' && p.anyGrade && p.grader === grader, JSON.stringify(p));
        return;
      }
      const num = cond.split(' ')[0];
      const qual = cond.split(' ').slice(1).join(' ').toUpperCase() || null;
      // BGS "10 Pristine" is Beckett's ORDINARY ten, sent unqualified.
      const wantQual = (grader === 'BGS' && qual === 'PRISTINE') ? undefined : (qual || undefined);
      ok(grader + ' + ' + cond + ' -> "' + g + '" parses as ' + grader + ' ' + num + (wantQual ? ' ' + wantQual : ''),
        p.kind === 'graded' && p.grader === grader && p.grade === num && p.qualifier === wantQual,
        JSON.stringify(p));
      const v = cm.verify(titleFor(grader, cond), CARD3, g, {});
      ok('   ...and the gate KEEPS "' + grader + ' ' + cond + '"', !!v.ok, v.reason);
    });
  });
ok('every option of every grader was driven through the gate', everyOption >= 140, everyOption + ' options');

console.log('\n3c. NEIGHBOURING GRADES ARE REFUSED — an option is not a synonym');
[['PSA', '8.5', 'PSA 8'], ['PSA', '8', 'PSA 8.5'], ['ISA', '1.5', 'ISA 1'],
 ['TAG', '10 Pristine', 'TAG 10 Gem Mint'], ['TAG', '10 Gem Mint', 'TAG 10 Pristine'],
 ['SGC', '10 Pristine', 'SGC 10'], ['SGC', '10 Gem Mint', 'SGC 10 Pristine'],
 ['AGS', '10 Legendary', 'AGS 10 Gem Mint'], ['AGS', '10 Gem Mint', 'AGS 10 Legendary'],
 ['ACE', '10', 'ACE 9']].forEach(function (c) {
  const status = ['PSA', 'BGS', 'CGC'].indexOf(c[0]) >= 0 ? c[0] : 'Other';
  const g = gradeFor(status, c[1], status === 'Other' ? c[0] : null);
  const v = cm.verify('Pokemon Charizard 4/102 Base Set Holo ' + c[2] + ' 1999', CARD3, g, {});
  ok(c[0] + ' ' + c[1] + ' refuses a "' + c[2] + '" title', !v.ok, 'KEPT');
});
// The two words that are ALSO card vocabulary must not become grades.
ok('"Legendary Collection" in an AGS 10 Gem Mint title is not the Legendary grade',
  cm.verify('Pokemon Charizard 3/110 Legendary Collection AGS 10 Gem Mint 2002',
    { name: 'Charizard', number: '3', setTotal: 110, setId: 'lc', setName: 'Legendary Collection',
      setYear: 2002, api_card_id: 'en-lc-3' }, 'AGS 10 Gem Mint', {}).ok);
ok('an ACE SPEC card is still kept in a raw search',
  cm.verify('Pokemon Prime Catcher ACE SPEC 157/162 Temporal Forces NM',
    { name: 'Prime Catcher', number: '157', setTotal: 162, setId: 'sv05', setName: 'Temporal Forces',
      setYear: 2024, api_card_id: 'en-sv05-157' }, 'Raw', {}).ok);

// ══════════════════════════════════════════════════════════════
console.log('\n4. "ALL" IS ONE QUERY, AND THE QUALIFIED TENS ARE DISTINCT');
ok('PSA + All is the grader-wide mode, not a grade',
  cm.parseGrade(gradeFor('PSA', 'All')).anyGrade === true,
  gradeFor('PSA', 'All'));
ok('...and carries no grade number',
  cm.parseGrade(gradeFor('PSA', 'All')).grade === null);
ok('BGS + 10 Black Label carries the qualifier',
  cm.parseGrade(gradeFor('BGS', '10 Black Label')).qualifier === 'BLACK LABEL',
  gradeFor('BGS', '10 Black Label'));
ok('CGC + 10 Pristine carries the qualifier',
  cm.parseGrade(gradeFor('CGC', '10 Pristine')).qualifier === 'PRISTINE',
  gradeFor('CGC', '10 Pristine'));
ok('CGC + 10 Gem Mint is the ORDINARY ten',
  cm.parseGrade(gradeFor('CGC', '10 Gem Mint')).qualifier === 'GEM MINT',
  gradeFor('CGC', '10 Gem Mint'));
// '10 Pristine' is Beckett's label for its ORDINARY 10, and is sent as
// plain 'BGS 10' so it cannot be mistaken for a qualifier.
ok('BGS + 10 Pristine is sent as the ordinary ten',
  gradeFor('BGS', '10 Pristine') === 'BGS 10'
  && cm.parseGrade(gradeFor('BGS', '10 Pristine')).qualifier === undefined,
  gradeFor('BGS', '10 Pristine'));

// ══════════════════════════════════════════════════════════════
console.log('\n5. THE GATE AGREES, ON REAL TITLE SHAPES');
// The ALLOW half matters more than the block half: a selector whose every
// option returns nothing looks exactly like a working filter.
const CARD = { name: 'Charizard', number: '4', setTotal: 102,
               setName: 'Base Set', setYear: 1999, api_card_id: 'en-base1-4' };
const T = function (s) { return 'Pokemon Charizard 4/102 Base Set ' + s + ' 1999'; };

function keeps(label, title, grade) {
  const r = cm.verify(title, CARD, grade, {});
  ok(label, !!r.ok, r.reason);
}
function drops(label, title, grade) {
  const r = cm.verify(title, CARD, grade, {});
  ok(label, !r.ok, 'KEPT — the gate did not fire');
}

keeps('Raw + All keeps an ungraded listing', T('Holo Rare NM'), gradeFor('Raw', 'All'));
keeps('Raw + NM keeps an ungraded listing',  T('Holo Rare NM'), gradeFor('Raw', 'NM'));
drops('Raw + All refuses a slab',            T('PSA 10'),       gradeFor('Raw', 'All'));

keeps('PSA + All keeps a PSA 4',  T('PSA 4'),  gradeFor('PSA', 'All'));
keeps('PSA + All keeps a PSA 10', T('PSA 10'), gradeFor('PSA', 'All'));
drops('PSA + All refuses a BGS',  T('BGS 9.5'), gradeFor('PSA', 'All'));
drops('PSA + All refuses a CGC',  T('CGC 9'),   gradeFor('PSA', 'All'));
drops('PSA + All refuses a raw card', T('Holo Rare NM'), gradeFor('PSA', 'All'));

keeps('PSA + 9 keeps a PSA 9',    T('PSA 9'),  gradeFor('PSA', '9'));
drops('PSA + 9 refuses a PSA 10', T('PSA 10'), gradeFor('PSA', '9'));

keeps('BGS + 10 Black Label keeps a Black Label', T('BGS 10 Black Label'), gradeFor('BGS', '10 Black Label'));
drops('BGS + 10 Black Label refuses an ordinary 10', T('BGS 10'), gradeFor('BGS', '10 Black Label'));
keeps('BGS + 10 Pristine keeps an ordinary 10', T('BGS 10'), gradeFor('BGS', '10 Pristine'));
drops('BGS + 10 Pristine refuses a Black Label', T('BGS 10 Black Label'), gradeFor('BGS', '10 Pristine'));

keeps('CGC + 10 Pristine keeps a Pristine', T('CGC 10 Pristine'), gradeFor('CGC', '10 Pristine'));
drops('CGC + 10 Pristine refuses a Gem Mint', T('CGC 10 Gem Mint'), gradeFor('CGC', '10 Pristine'));
keeps('CGC + 10 Gem Mint keeps a Gem Mint', T('CGC 10 Gem Mint'), gradeFor('CGC', '10 Gem Mint'));

// ══════════════════════════════════════════════════════════════
console.log('\n6. RAW CONDITIONS ARE ASKED OF eBAY\'S OWN CARD CONDITION');
// The aspect values are eBay's, exactly as its refinement returned them on
// 2026-09-27. A misspelt value is not an error at eBay — it is ignored, the
// way "Not Specified" is — so the list would come back UNFILTERED and look
// like it worked.
const MEASURED = { NM: 'Near Mint or Better', LP: 'Lightly Played (Excellent)',
                   MP: 'Moderately Played (Very Good)', HP: 'Heavily Played (Poor)' };
// Every Raw chip is EITHER one of eBay's four (a real filter) OR a
// seller-stated condition eBay has no value for (M, DMG — asked of the title,
// searched for by word). None may be neither, and none may be removed: M and
// DMG were once dropped outright because eBay lacks them (2026-09-27).
box.STATUS_CONDITIONS.Raw.filter(function (c) { return c !== 'All'; }).forEach(function (c) {
  const f = cm.ebayConditionFilter(gradeFor('Raw', c));
  const t = cm.titleOnlyCondition(gradeFor('Raw', c));
  if (MEASURED[c]) {
    ok('Raw + ' + c + ' filters on "' + MEASURED[c] + '"',
      f && f.value === MEASURED[c] && f.code === c && !t &&
      f.aspectFilter === 'categoryId:183454,Card Condition:{' + MEASURED[c] + '}', JSON.stringify(f));
  } else {
    ok('Raw + ' + c + ' is seller-stated: no eBay filter, the word is searched for',
      f === null && t && t.code === c && cm.buildQuery({ name: 'Charizard', number: '4', setTotal: 102 },
        gradeFor('Raw', c)).split(' ').indexOf(t.term) >= 0, JSON.stringify({ f, t }));
  }
});
ok('the Raw chips are M + cardmatch\'s EBAY_CONDITION_CODES + DMG',
  JSON.stringify(box.STATUS_CONDITIONS.Raw.slice(1)) === JSON.stringify(['M'].concat(cm.EBAY_CONDITION_CODES, ['DMG'])));
ok('the page\'s seller-stated reasons are cardmatch\'s, word for word',
  box.TITLE_ONLY_RAW && Object.keys(cm.TITLE_ONLY_CONDITIONS).every(function (k) {
    return box.TITLE_ONLY_RAW[k] === cm.TITLE_ONLY_CONDITIONS[k].why; }));
ok('a seller-stated chip is marked on screen (dashed chip, reason on hover)',
  /tOnly \? ' ss' : ''/.test(html) && /\.selchip\.ss\{border-style:dashed\}/.test(html));
ok('the page reads cardmatch LIVE where it matters (async module)',
  /function liveCM\(\)/.test(html) && !/\(CM && CM\./.test(html));
ok('Raw + All is NOT filtered (every raw listing)', cm.ebayConditionFilter(gradeFor('Raw', 'All')) === null);
ok('a graded search is never condition-filtered', cm.ebayConditionFilter('PSA 10') === null);
// These two asserted the old SILENT SUBSTITUTION — M answered with Near Mint
// rows, DMG with Heavily Played ones. The reverse is now required.
ok('M is never answered with eBay\'s Near Mint rows', cm.ebayConditionFilter('Raw M') === null);
ok('DMG is never answered with eBay\'s Heavily Played rows', cm.ebayConditionFilter('Raw DMG') === null);
ok('the title reader tells Mint from Near Mint',
  cm.sellerCondition('Charizard 4/102 Base Set Holo Mint').code === 'M' &&
  cm.sellerCondition('Charizard 4/102 Base Set Holo Near Mint').code === 'NM');
// Live, Raw M kept "Blastoise … EX MT Excellent-Mint" as Mint. It is the grade below NM.
ok('"Excellent-Mint" / "EX-MT" is not Mint',
  cm.sellerCondition('POKEMON 1999 Blastoise - BASE SET HOLO 2/102 - EX MT Excellent-Mint').code === 'LP' &&
  cm.sellerCondition('Charizard 4/102 EX-MT').code === 'LP');
ok('...and the card mechanic "ex" beside "Mint" still claims Mint',
  cm.sellerCondition('Charizard ex 199/165 Mint').code === 'M');
ok('"Not Specified" is never sent — eBay ignores it',
  Object.values(cm.EBAY_CARD_CONDITION).indexOf('Not Specified') < 0);
{
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  // Since T3 (grade aspects) the condition and grade filters share one
  // variable; both links of the chain must hold for condition to reach eBay.
  ok('sourceEbay sends the aspect_filter',
    /const aspectFilter = condFilter \? condFilter\.aspectFilter :/.test(srv) &&
    // aspectAsk = aspectFilter, plus the language aspect only when that
    // exclusion is on (2026-10-07) — the condition still reaches eBay.
    /const aspectAsk = langEx\.aspect \? \(aspectFilter \? aspectFilter \+ ',' \+ langEx\.aspect : [^)]*\) : aspectFilter;/.test(srv) &&
    /aspect_filter=' \+ encodeURIComponent\(aspectAsk\)/.test(srv));
  const norm = srv.slice(srv.indexOf('function normaliseListing('), srv.indexOf('function normaliseListing(') + 6000);
  ok('normaliseListing carries conditionSource — a fixed shape drops what it does not name',
    /conditionSource: o\.conditionSource/.test(norm));
  ok('the source block reports which condition eBay was asked for',
    /sources\[s\.id\]\.conditionFilter = r\.value\.conditionFilter/.test(srv));
}

// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(64));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\n  FAILED:'); fails.forEach(function (f) { console.log('    - ' + f); }); }
console.log('='.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
