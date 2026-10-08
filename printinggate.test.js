// printinggate.test.js — the reprint/language/year gate, on BOTH marketplaces.
//
//   node printinggate.test.js
//
// Why this file exists. Both fixes were correct and installed on one path
// each:
//
//   * The YEAR discriminator lived only in sourceEbay's matchCard, and even
//     there it was fed null, because resolveListingCard never SELECTed
//     set_release. `if (card.setYear)` therefore never passed on any live
//     route. CLAUDE.md's "22 rejected, zero Celebrations" was REPRINT_MARKERS
//     working alone.
//   * The LANGUAGE gate ran on eBay and on the frontend deep links, and not
//     on Yahoo JP — which is precisely where Korean prints appear, since they
//     share Japanese set codes and numbering.
//
// So this suite asserts three things, not one:
//   1. the gate BLOCKS what it should (test what a gate allows, not only what
//      it blocks — but a gate tested only on refusals passes by refusing
//      everything, so 2 matters more),
//   2. the gate ALLOWS the genuine article, in both languages,
//   3. the gate can actually REACH its inputs on the real code path — the
//      failure above was never about the gate's logic.

require('./testcount')(116);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}
function blocks(name, title, card, opts, wantWord) {
  const r = cm.printingConflict(title, card, opts);
  ok(name, !!r && (!wantWord || r.includes(wantWord)),
    r ? 'reason: ' + r : 'KEPT — the gate did not fire');
}
function allows(name, title, card, opts) {
  const r = cm.printingConflict(title, card, opts);
  ok(name, r === null, r ? 'REJECTED: ' + r : '');
}

// ── The two card shapes the two marketplaces build ───────────
// Kept deliberately as literal object shapes: if server.js stops supplying a
// field, these still pass and section 3 is what catches it.
const EN = { name: 'Charizard', number: '4', setTotal: 102,
             setName: 'Base Set', setYear: 1999, lang: 'en' };
const JA = { name: 'リザードンex', number: '201', setTotal: 165,
             setName: '151', setYear: 2023, lang: 'ja' };

// Yahoo JP is a Japanese-language marketplace, so script is not evidence.
const JP_OPTS = { cjkIsChinese: false, scriptIsLanguageEvidence: false };

console.log('\n1. BLOCKS — a different printing of the same numbering');

blocks('Celebrations reprint of a Base Set card (marker)',
  'Pokemon Charizard 4/102 Celebrations Classic Collection PSA 10', EN, {}, 'reprint');
blocks('a 2021 reprint that states only its YEAR, no marker word',
  'Pokemon Charizard 4/102 Base Set Holo 2021 PSA 10', EN, {}, '2021');
blocks('Korean print of an English card',
  'Korean Pokemon Charizard 4/102 Base Set PSA 10', EN, {}, 'ko');

// The Yahoo half — the side that had no gate at all.
blocks('Korean print on Yahoo, stated in Japanese (韓国版)',
  '韓国版 ポケモンカード リザードンex 201/165 PSA10', JA, JP_OPTS, 'ko');
blocks('Korean print on Yahoo, stated in hangul',
  '포켓몬 카드 리자몽 201/165 PSA10', JA, JP_OPTS, 'ko');
blocks('an English print sold on Yahoo (英語版) is not the Japanese card',
  '英語版 ポケモンカード リザードンex 201/165 PSA10', JA, JP_OPTS, 'en');
blocks('a year conflict on Yahoo',
  'ポケモンカード リザードンex 201/165 1999年 PSA10', JA, JP_OPTS, '1999');

console.log('\n2. ALLOWS — the genuine article, and silence');

allows('the real 1999 Base Set card',
  'Pokemon Charizard 4/102 Base Set Holo 1999 PSA 10', EN, {});
allows('graded later than printed — "1999 ... graded 2021" must survive',
  'Pokemon Charizard 4/102 Base Set 1999 holo, graded 2021 PSA 10', EN, {});
allows('a title stating no year and no language at all',
  'Pokemon Charizard 4/102 Base Set Holo PSA 10', EN, {});
allows('a Celebrations title WHEN the card really is Celebrations',
  'Pokemon Charizard 4/102 Celebrations Classic Collection PSA 10',
  { ...EN, setId: 'cel25cc', number: 'CC002', setTotal: 25,
    setName: 'Celebrations Classic Collection', setYear: 2021 }, {});

// ── Two anniversary sets, five years apart, sharing one word ──
// 30th Celebration and 30th Classic Collection arrived 2026-09-16 and
// reprint classics exactly as Celebrations (2021) did. "30th Celebration"
// satisfies the Celebrations marker's /celebrat/i, so ingesting them
// DISABLED that guard for all 188 of their cards and made every 30th
// listing exempt on a 2021 card.
//
// Measured on live eBay traffic before the fix: six real 2026 "30th
// Celebration" listings were kept against en-cel25cc-4. Both directions
// are asserted, because a marker that blocks everything passes any
// blocking test.
// Our side is identified by SET ID and catalogue number, exactly as the
// catalogue holds them — the gate no longer reads set names at all.
const TH30   = { ...EN, name: 'Dialga', number: '103', setTotal: 128, setId: '30th',
                 setName: '30th Celebration', setYear: 2026 };
const TH30C  = { ...EN, setId: '30th-c', setName: '30th Classic Collection',
                 number: '001', setTotal: 30, setYear: 2026 };
const CEL_CC = { ...EN, setId: 'cel25cc', number: 'CC002', setTotal: 25,
                 setName: 'Celebrations Classic Collection', setYear: 2021 };

blocks('a 2021 Celebrations title on a 2026 30th Celebration card',
  'Dialga 103/128 Celebrations Holo Pokemon TCG', TH30, {}, 'reprint');
blocks('a 2026 30th title on a 2021 Celebrations Classic Collection card',
  'Pokemon Charizard 4/102 30th Classic Collection Holo', CEL_CC, {}, '30th');
blocks('a 2026 30th title on a 1999 Base Set card',
  'Pokemon Charizard 4/102 30th Celebration Holo', EN, {}, '30th');
blocks('a 2021 Celebrations Classic Collection title on a 30th Classic card',
  'Pokemon Charizard 4/102 Celebrations Classic Collection', TH30C, {}, 'reprint');

// ...and the far more important direction: the genuine article survives.
// These are the real seller phrasings measured on eBay on 2026-09-22.
allows('a genuine 30th Celebration listing on its own card',
  'Dialga 103/128 Rare ME: 30th Celebration Pokemon Holo Near Mint', TH30, {});
allows('a genuine 30th listing where the seller ALSO wrote "Celebrations"',
  '30th anniversary Dialga 103/128 Celebrations Holo Pokemon TCG', TH30, {});
allows('a genuine 30th Classic Collection listing on its own card',
  'Charizard 4/102 30th Classic Collection Pokemon', TH30C, {});
allows('a genuine 2021 Celebrations CC listing is untouched by the 30th marker',
  'Pokemon Charizard 4/102 Celebrations Classic Collection PSA 10', CEL_CC, {});

// These four are the ones that matter most. A gate that rejects the whole
// Yahoo feed "works" by every blocking test above.
allows('an ordinary Japanese Yahoo title (katakana)',
  'ポケモンカード リザードンex 201/165 SAR 美品', JA, JP_OPTS);
allows('a KANJI-ONLY Japanese title — no kana to prove it is Japanese',
  '未使用 美品 初版 黒枠 遊戯 201/165 鑑定品', JA, JP_OPTS);
allows('a Japanese title stating its own year',
  'ポケモンカード リザードンex 201/165 2023年 PSA10', JA, JP_OPTS);
allows('a Japanese title naming the Japanese language',
  '日本語版 ポケモンカード リザードンex 201/165 PSA10', JA, JP_OPTS);

// The guard against the guard: with the JP options NOT passed, a kanji-only
// Japanese title is read as Chinese and rejected. This asserts the option is
// load-bearing — if someone deletes it, this test fails rather than the
// Yahoo feed silently emptying in production.
blocks('...and that same kanji-only title IS rejected without cjkIsChinese:false',
  '未使用 美品 初版 黒枠 遊戯 201/165 鑑定品', JA, {}, 'zh');

console.log('\n3. REACHABLE — the gate can get its inputs on the real path');

// The bug was never in the logic. It was a SELECT that did not return the
// column the logic reads, so this asserts the query itself.
// CRLF-tolerant: a Windows checkout (autocrlf) has CRLF on disk and the
// slices below end on a bare LF, so they found nothing and failed there only.
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\r\n/g, String.fromCharCode(10));
const resolver = serverSrc.slice(serverSrc.indexOf('async function resolveListingCard'));
// The SQL ONLY — between the backticks. Slicing the whole function body was
// the first attempt and it passed with the columns removed, because the
// comment above the query names them: the assertion was reading prose. It is
// the same failure as checking /.env 404s when there is no .env.
// Anchored on db.query( rather than the first backtick: the comment above the
// query quotes `if (card.setYear)` in backticks, and the first attempt sliced
// THAT. Twice now this assertion has read the wrong text — which is a fair
// warning about how easily a source-inspecting test measures nothing.
const qStart = resolver.indexOf('`', resolver.indexOf('db.query('));
const sql = resolver.slice(qStart + 1, resolver.indexOf('`', qStart + 1));
ok('found the resolveListingCard SQL to inspect', /SELECT/i.test(sql), JSON.stringify(sql.slice(0, 60)));
for (const col of ['set_release', 'set_name_en', 'api_card_id']) {
  ok(`resolveListingCard SELECTs ${col}`, new RegExp('\\b' + col + '\\b').test(sql),
    'without it the gate reads undefined and cannot fire');
}

// Both card builders must carry the gate's inputs. filterCard is the Yahoo
// one; it had neither field.
const filterCardSrc = serverSrc.slice(serverSrc.indexOf('function filterCard'),
                                      serverSrc.indexOf('async function sourceYahoo'));
ok('filterCard (Yahoo) carries lang', /\blang:/.test(filterCardSrc));
ok('filterCard (Yahoo) carries setYear', /\bsetYear:/.test(filterCardSrc));

// ── The eBay builder, which nothing here used to assert ───────
// Only filterCard was checked above, because it was the one that had been
// missing the fields. That is the inspection equivalent of testing a gate
// on refusals only: the path that happened to be right went unmeasured,
// and would have failed silently if it ever stopped being right.
// Since the grade-cost probe, the object is built by ebayMatchCard(card),
// shared by sourceEbay and the probes. Inspect the builder, AND require that
// sourceEbay calls it — a correct builder nothing calls is the dead gate.
const matchCardStart = serverSrc.indexOf('function ebayMatchCard(card) {');
const matchCardSrc = serverSrc.slice(matchCardStart,
                                     serverSrc.indexOf('};', matchCardStart));
ok('found the eBay matchCard object to inspect',
  matchCardStart > -1 && /number:/.test(matchCardSrc),
  JSON.stringify(matchCardSrc.slice(0, 60)));
{
  const se = serverSrc.slice(serverSrc.indexOf('async function sourceEbay'),
                             serverSrc.indexOf('async function sourceEbay') + 4000);
  ok('sourceEbay builds its matchCard with ebayMatchCard', /const matchCard = ebayMatchCard\(card\);/.test(se));
}
ok('matchCard (eBay) carries lang', /\blang:/.test(matchCardSrc));
ok('matchCard (eBay) carries setYear', /\bsetYear:/.test(matchCardSrc));

// ── One derivation, not one per builder ───────────────────────
// Both builders held their own copy of
//   String(card.api_card_id || '').split('-')[0] || null
// and cardmatch held a third as a regex inside cardLanguage. Three copies
// of "what language is this card" is how the year gate came to be
// installed on one path and dead on the other.
for (const [what, src] of [['filterCard', filterCardSrc], ['matchCard', matchCardSrc]]) {
  ok(`${what} derives the language through the shared helper`,
    /gateLanguage\(card\)/.test(src),
    'a private copy of the derivation is how two paths drift apart');
  ok(`${what} no longer splits the id itself`,
    !/split\(['"]-['"]\)/.test(src));
}
ok('...and the helper delegates to cardmatch rather than being a fourth copy',
  /function gateLanguage\(card\)\s*\{\s*return cm\.languageFromCardId/.test(serverSrc));

// ── The language actually ARRIVES ─────────────────────────────
// The point of the whole section. A source check proves a field is
// assigned; it cannot prove the assigned value is a language. `'base1-4'`
// split on '-' yields 'base1', which cardLanguage slices to 'ba' — a field
// that is present, non-null, and useless.
//
// So this runs the real derivation on the real id shapes the catalogue
// holds. en-swsh11-186 is the card that prompted it.
for (const [id, want] of [['en-swsh11-186', 'en'], ['ja-SV2a-201', 'ja'],
                          ['zh-tw-SV4a-001', 'zh'], ['ko-SV2a-201', 'ko']]) {
  const got = cm.languageFromCardId(id);
  ok(`${id} yields language ${JSON.stringify(want)}`, got === want, 'got ' + JSON.stringify(got));
}
for (const id of ['base1-4', 'sv3pt5-4', '', null]) {
  ok(`${JSON.stringify(id)} yields null, not a fake language`,
    cm.languageFromCardId(id) === null,
    'got ' + JSON.stringify(cm.languageFromCardId(id)) + ' — the gate would compare titles against it');
}

// ── A missing language is a REPORTED failure, not a skip ──────
// cardLanguage() returning null skips the language check entirely, which
// is correct — rejecting on absent data is the `looksLikeJunk` mistake.
// What was wrong is that the skip was invisible. verify() now states what
// it had, so "the check did not run" is a fact the response carries.
const EN_CARD = { cardId: 'en-swsh11-186', name: 'Giratina V', number: '186',
                  setTotal: 196, setName: 'Lost Origin', setYear: 2022 };
const NO_LANG = { name: 'Giratina V', number: '186', setTotal: 196,
                  setName: 'Lost Origin', setYear: 2022 };
const GOOD_TITLE = 'Pokemon Giratina V 186/196 Lost Origin Alt Art Ultra Rare';

// `ev()` rather than `.evidence` directly: with the field removed, every
// assertion below throws on the first one and the suite dies mid-run,
// reporting nothing about the rest. A test that cannot finish cannot tell
// you how much is broken — verified by deleting the field and watching it
// abort before this comment was written.
const ev = r => (r && r.evidence) || { language: undefined, unchecked: [] };

const fed = cm.verify(GOOD_TITLE, EN_CARD, 'Raw NM');
ok('verify() reports the evidence it had', !!fed.evidence);
ok('a real English card arrives at the gate with its language',
  ev(fed).language === 'en', JSON.stringify(fed.evidence));
ok('...and nothing is listed as unchecked',
  ev(fed).unchecked.length === 0, JSON.stringify(ev(fed).unchecked));

const unfed = cm.verify(GOOD_TITLE, NO_LANG, 'Raw NM');
ok('a card with no id reports language: null rather than pretending',
  ev(unfed).language === null, JSON.stringify(unfed.evidence));
ok('...and names the check that did NOT run',
  ev(unfed).unchecked.includes('language'), JSON.stringify(ev(unfed).unchecked));
ok('the missing input never empties the feed — it reports, it does not refuse',
  unfed.ok === true, 'a gate that refuses on absent data is the looksLikeJunk failure');

// The consequence, stated as a test: this is what the silent skip cost.
const ES = 'Pokemon Giratina V Alternative Art Lost Origin 186/196 Spanish';
ok('fed a language, a Spanish print of an English card is rejected',
  /different language printing/.test(cm.verify(ES, EN_CARD, 'Raw NM').reason || ''),
  cm.verify(ES, EN_CARD, 'Raw NM').reason || 'KEPT');
ok('unfed, the same title is kept — and the response now says why',
  cm.verify(ES, NO_LANG, 'Raw NM').ok === true &&
  ev(cm.verify(ES, NO_LANG, 'Raw NM')).unchecked.includes('language'));

// ── The server has to SURFACE it ──────────────────────────────
// Evidence nothing reports is the same non-event one layer along.
// Asserted against the REGISTRY, not against a count.
//
// This used to read `=== 2`, meaning "eBay and Yahoo both". Adding a third
// source turned it red while the third source was in fact reporting its
// evidence correctly — a test that measures how many sources exist rather
// than whether each one reports. The next person would have bumped the 2
// to a 3 and learned nothing.
//
// Every entry in LISTING_SOURCES must report, so the list itself is the
// expectation and a source added without gate reporting fails here.
const registry = serverSrc.slice(serverSrc.indexOf('const LISTING_SOURCES = ['),
                                 serverSrc.indexOf('async function gatherListings'));
const sourceFns = [...registry.matchAll(/fetch:\s*(source\w+)/g)].map(m => m[1]);
ok('found the source registry to inspect', sourceFns.length >= 2, sourceFns.join(', '));

// T1: the eBay entry is sourceEbayAll, which merges sourceEbay's answers
// per site and spreads the US one (gate included) through ebayStateResult.
// The evidence is checked where it is produced — sourceEbay — once the
// wrapper is shown to carry it through.
if (sourceFns.includes('sourceEbayAll')) {
  const i = serverSrc.indexOf('async function sourceEbayAll(');
  const allBody = serverSrc.slice(i, serverSrc.indexOf('\n}\n', i));
  const j = serverSrc.indexOf('function ebayStateResult(');
  const resBody = serverSrc.slice(j, serverSrc.indexOf('\n}\n', j));
  ok('sourceEbayAll carries sourceEbay\'s gate evidence through',
     /sourceEbay\(card, grade, limit/.test(allBody) && /return ebayStateResult\(st\)/.test(allBody)
     && /Object\.assign\(\{\}, f, \{/.test(resBody) && !/\bgate:/.test(resBody));
  sourceFns.splice(sourceFns.indexOf('sourceEbayAll'), 1, 'sourceEbay');
}
for (const fn of sourceFns) {
  // Slice the one function. Anchored on the declaration and stopped at the
  // next top-level declaration INCLUDING `async` — setlist.test.js's slicer
  // over-ran for exactly that reason and asserted about a different
  // function's body.
  const start = serverSrc.indexOf('async function ' + fn + '(');
  const after = serverSrc.slice(start + 10);
  const end = after.search(/\n(?:async )?function \w+\(/);
  const body = end > -1 ? after.slice(0, end) : after;
  ok(`${fn}: sliced a plausible function body (${body.length} bytes)`,
    start > -1 && body.length > 200 && body.includes(fn));
  ok(`${fn} returns the gate evidence`,
    /gate:\s*cm\.printingEvidence\(/.test(body),
    'a source that does not report what the gate had has the one-path problem again');
}
ok('gatherListings copies it onto the source block',
  /sources\[s\.id\]\.gate = r\.value\.gate/.test(serverSrc));
ok('a missing language raises a named warning in the response',
  /gateWarning/.test(serverSrc) &&
  /unchecked\.includes\('language'\)/.test(serverSrc));

const sourceYahooSrc = serverSrc.slice(serverSrc.indexOf('async function sourceYahoo'),
                                       serverSrc.indexOf('async function sourceEbay'));
ok('sourceYahoo actually calls the shared gate',
  /cm\.printingConflict\(/.test(sourceYahooSrc));
ok('sourceYahoo passes cjkIsChinese:false (or it rejects the whole JP feed)',
  /cjkIsChinese:\s*false/.test(sourceYahooSrc));
ok('sourceYahoo reports its rejections rather than dropping them silently',
  /printingRejected/.test(sourceYahooSrc));

// And the eBay path must still be wired to the same one implementation.
ok('verify() delegates to printingConflict — one gate, not two copies',
  /printingConflict\(/.test(fs.readFileSync(path.join(__dirname, 'cardmatch.js'), 'utf8')));

console.log('\n4. PARITY — one title, one card, two marketplaces, one verdict');

// Wherever two paths compute the same thing, assert they match.
const PARITY = [
  ['韓国版 ポケモンカード リザードンex 201/165 PSA10', false],
  ['ポケモンカード リザードンex 201/165 PSA10', true]
];
for (const [title, expectKept] of PARITY) {
  const viaGate = cm.printingConflict(title, JA, JP_OPTS) === null;
  const viaVerify = !/different language printing/.test(
    (cm.verify(title, JA, 'PSA 10', JP_OPTS) || {}).reason || '');
  ok(`parity on ${JSON.stringify(title.slice(0, 22))}`,
    viaGate === expectKept && viaVerify === expectKept,
    `gate kept=${viaGate}, verify kept=${viaVerify}, expected kept=${expectKept}`);
}

console.log('\n5. INDONESIAN PRINTS — the words sellers use (T1, 2026-09-30)');
// Four real eBay titles kept on ja-M2a-250 (Mega Dragonite ex 250/193) until
// "Indonesia" / "Bahasa" were read. Found by sitecheck.js's independent
// reader, not by any suite. Both directions: refused, and the same card's
// ordinary titles still kept.
{
  const M2A = { cardId: 'ja-M2a-250', name: 'Mega Dragonite ex', number: '250', setTotal: 193,
                setName: 'MEGA Dream ex', lang: 'ja', setYear: 2025 };
  const refuse = [
    'Pokemon TCG Indonesia Mega Dragonite EX MUR MA3 250/193 NM A',
    'Mega Dragonite ex MA3 250/193 MUR Mega Dream Ascended Heroes Pokemon Indonesia',
    'Pokémon TCG Bahasa Indonesia Language Mega Dragonite ex MUR Gold MA3 250/193',
    'Mega Dragonite ex MA3 250/193 MUR Mega Dream Ascended Heroes Pokemon Indonesia'
  ];
  const keep = [
    'Pokemon Card Japanese Mega Dragonite ex MUR 250/193 M2a MEGA Dream ex',
    'Mega Dragonite ex 250/193 MUR Gold Mega Dream ex Japanese Pokemon NM',
    'Mega Dragonite ex MUR 250/193 m2a Japanese'
  ];
  for (const t of refuse) {
    const v = cm.verify(t, M2A, 'Raw NM');
    ok(`refused: ${t.slice(0, 50)}`, !v.ok && /title says id/.test(v.reason || ''), v.reason);
  }
  for (const t of keep) {
    const v = cm.verify(t, M2A, 'Raw NM');
    ok(`kept: ${t.slice(0, 50)}`, v.ok, v.reason);
  }
  ok('English card: "Indonesia" is a different card there too',
     cm.languageOf('Charizard ex 199/165 Pokemon 151 Indonesia') === 'id');
  ok('"Japanese" still wins over a seller\'s location word on a JA title',
     cm.languageOf('Mega Dragonite ex 250/193 Japanese') === 'ja');
}

console.log('\n6. EUROPEAN SITES — a marketplace is where a card is sold, a language is what it is');
// Real titles eBay DE/FR/IT/ES returned for ENGLISH cards (T1, 2026-09-30,
// marketprobe ?rows=1). Every one below was KEPT by the English-only word
// list. Measured on the rows production keeps today (4,512 over US/GB/AU/CA
// and three Japanese cards): the new words change none of them.
{
  const ZARD = { cardId: 'en-base1-4', name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set', lang: 'en', setYear: 1999 };
  const refuse = [
    ['Charizard - 4/102 - Base Set - Holo Rare - Italienisch ITA', 'it'],
    ['CHARIZARD HOLO SET BASE 4/102 - POKEMON KARTE VINTAGE - ITA', 'it'],
    ['2000 Pokemon ITALIENISCH Unlimited Base Set Charizard Holo 4/102 GUT', 'it'],
    ['Pokémon TCG Charizard 4/102 Base Set Holo - Französisch (Dracaufeu)', 'fr'],
    ['Charizard Base Set Glurak 1999 Holo GER Pokemon 4/102', 'de'],
    ['Charizard bs4 Holo Base Set Holland 4/102', 'nl'],
    ['Charizard 4/102 Holo Base Set Unlimited Neo Genesis🇩🇪 POOR', 'de'],
    ['CARTE POKEMON 🇫🇷 Charizard Holo 4/102 - Base Set FR - VINTAGE', 'fr'],
    ['Carte Pokémon Charizard 4/102 Base Set VF FR', 'fr'],
    ['Pokemon Charizard 4/102 Base Set Holo Rare 1999 SPANISCH', 'es'],
    ['CPokémon Charizard Oro Holo Rare. Base Set 4/102. 1999, Esp.', 'es'],
    ['1999 Pokemon PORTUGIESISCH Unlimited Base Set Charizard Holo 4/102 EX-MT', 'pt'],
    ['Charizard 4/102 Holo Raro Set Base Ilimitado Pokemon LP (Portugués)', 'pt'],
    ['Charizard 4/102 Set Base Holo Raro 120 HP Olandese 1999', 'nl'],
    // read live on eBay ES once it went on
    ['Charizard bs4 holo set base Olanda 4/102', 'nl'],
    ['Charizard Moderadamente Jugado - 4/102 - Holo Raro Conjunto Base Unltd. Pokémon italianos', 'it'],
    ['Charizard base set pokemon card 4/102 holo Italia', 'it'],
    ['Juego de cartas coleccionables Pokémon alemanes ilimitado Charizard muy jugado - 4/102 - Holo raro', 'de']
  ];
  for (const [t, code] of refuse) {
    const v = cm.verify(t, ZARD, 'Raw');
    ok(`refused (${code}): ${t.slice(0, 52)}`, !v.ok && new RegExp('title says ' + code).test(v.reason || ''), v.reason);
  }
  // The words for ENGLISH are the right answer, in every language.
  const keep = [
    // Was "… Base Set Gold Holo Rare Englisch …" — the same seller's live
    // listing, looked at 2026-10-04 (getItem photo), is a gold METAL replica
    // at €65; goldBeforeGold refuses it now. The language words are the test.
    'Pokémon TCG Charizard 4/102 Base Set Holo Rare Englisch 120 KP 1999',
    'Charizard 4/102 Base Set Holo Rare Pokémon TCG 120 PS Englisch 1999',
    'Pokemon Charizard 4/102 Set Base Holo Raro Inglese Wizards',
    'Charizard 4/102 Set Base Holo Raro Inglés WOTC 1999',
    'Carte Pokémon Dracaufeu Charizard 4/102 Set de Base Holo Anglais',
    'Pokémon Charizard 4/102 Base Set Holo Rare EN 🇺🇸',
    'Charizard 4/102 Holo Base Set de 1999 es original'
  ];
  for (const t of keep) {
    const v = cm.verify(t, ZARD, 'Raw');
    ok(`kept: ${t.slice(0, 52)}`, v.ok, v.reason);
  }
  // Language CODES, case-sensitive — read live on eBay DE after it went on.
  for (const t of ['Pokémon TCG Pikachu & Zekrom-GX TAG TEAM GX Holo DE 33/181 240 KP'.replace('Pikachu & Zekrom-GX TAG TEAM GX Holo DE 33/181 240 KP', 'Charizard 4/102 Holo DE 120 KP'),
                   'Turtok # 2/102 (Blastoise) Rare Holo Base Set 1999 Pokemon DE Near Mint Vintage'.replace('Turtok # 2/102 (Blastoise)', 'Glurak # 4/102 (Charizard)'),
                   'Charizard 4/102 | BS | DE | RARE | POOR | Pokémon | TCG',
                   'Pokemon Karte DE Charizard 4/102 Base Set Wizards (Nr.4)']) {
    const v = cm.verify(t, ZARD, 'Raw');
    ok(`refused (de code): ${t.slice(0, 52)}`, !v.ok && /title says de/.test(v.reason || ''), v.reason);
  }
  for (const t of ['CHARIZARD HOLO - POKÉMON 4/102 SET DE BASE ÉDITION 2 FR', 'Carte Pokémon FR Charizard 4/102 Set De Base Wizards (N°4)']) {
    const v = cm.verify(t, ZARD, 'Raw');
    ok(`refused (fr code): ${t.slice(0, 52)}`, !v.ok && /title says fr/.test(v.reason || ''), v.reason);
  }
  // "de" the preposition, before its noun, is not German.
  for (const t of ['MEWTWO HOLO - POKEMON 4/102 SET DE BASE'.replace('MEWTWO', 'CHARIZARD'),
                   'JCC Pokémon Charizard 4/102 Base Set Holo WOTC DE COLECCIÓN',
                   'Charizard 4/102 Juego de cartas coleccionables Pokémon conjunto base holograma raro 1999 de colección',
                   'Pokemon Charizard 4/102 Base Set Holo Rare English EN']) {
    const v = cm.verify(t, ZARD, 'Raw');
    ok(`kept (preposition / English): ${t.slice(0, 52)}`, v.ok, v.reason);
  }
  ok('a Japanese card still refuses Korean, and keeps "Japanisch"',
     cm.languageOf('Glurak ex 201/165 Koreanisch') === 'ko' && cm.languageOf('Glurak ex 201/165 Japanisch') === 'ja');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
