// variants.test.js — printing is a dimension of the COPY, rarity of the CARD (TASK T10)
//   node variants.test.js          fixtures + the real gate + structure
//   node variants.test.js --db     also the stored cards.variants for the spot-check cards
//
// Built on a REAL TCGdex response (variants.fixture.json, captured
// 2026-09-29), not the documented shape — which hid the Poké Ball and Master
// Ball mirrors behind a bare `reverse: true`.
'use strict';
const fs = require('fs');
const cm = require('./cardmatch');
const tdx = require('./tcgdexprice');
let pass = 0, fail = 0, keeps = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

// ── 1. What a card exists in, read from TCGdex ────────────────
console.log('\n  1. printingsFromTcgdex — the real response');
const FX = JSON.parse(fs.readFileSync('variants.fixture.json', 'utf8'));
const WANT = {
  'en/ecard1-1':   ['holo', 'reverse'],                 // Roy: Holo Rare, holo + reverse
  'en/ecard1-33':  ['normal', 'reverse'],               // Roy: Rare, normal + reverse
  'en/sv03.5-001': ['normal', 'reverse', 'reverse-cosmos'],   // set-logo stamp excluded
  'en/sv03.5-199': ['holo'],                            // SIR: one printing, no selector
  'en/sv08.5-001': ['normal', 'reverse', 'reverse-pokeball', 'reverse-masterball'],
  'en/sv08.5-161': ['holo'],
  'en/base1-4':    ['holo'],                            // print runs are NOT printings
  'en/base1-58':   ['normal'],                          // jumbo excluded
  'en/svp-085':    ['normal'],
  'en/swsh1-1':    ['holo'],
  'ja/SV2a-001':   ['normal', 'reverse-pokeball', 'reverse-masterball'],   // booleans said only "reverse"
  'ja/SV2a-201':   ['holo'],
  'ja/SV8a-002':   ['normal', 'reverse-masterball', 'reverse'],
  'ja/M2a-001':    ['normal', 'reverse-energy', 'reverse']
};
for (const [id, want] of Object.entries(WANT)) {
  const got = tdx.printingsFromTcgdex(FX[id]);
  ok(`${id.padEnd(15)} -> ${want.join(', ')}`, JSON.stringify(got.printings.map(p => p.key)) === JSON.stringify(want)
    && got.from === 'variants_detailed', JSON.stringify(got.printings.map(p => p.key)));
}
ok('the booleans alone could NOT have seen the SV2a mirrors (why variants_detailed)',
  FX['ja/SV2a-001'].variants.reverse === true && !('pokeball' in FX['ja/SV2a-001'].variants));
{
  const b = tdx.printingsFromTcgdex({ variants: { normal: true, reverse: true, holo: false } });
  ok('with no variants_detailed, the booleans answer — and say that is where it came from',
    b.from === 'booleans' && JSON.stringify(b.printings.map(p => p.key)) === '["normal","reverse"]');
  ok('nothing at all -> nothing, from null (never invented)', tdx.printingsFromTcgdex({}).from === null);
}
ok('the Poké Ball mirror carries its OWN TCGplayer product (priceable apart)',
  tdx.printingsFromTcgdex(FX['en/sv08.5-001']).printings.find(p => p.key === 'reverse-pokeball').tcgplayer === 610536);

// ── 2. What a title says, and what the gate does with it ──────
console.log('\n  2. the gate — refuses a STATED other printing, keeps silence');
const A1  = { name: 'Alakazam', number: '1', setTotal: '165', setId: 'ecard1', setName: 'Expedition', lang: 'en', printings: ['holo', 'reverse'] };
const A33 = { name: 'Alakazam', number: '33', setTotal: '165', setId: 'ecard1', setName: 'Expedition', lang: 'en', printings: ['normal', 'reverse'] };
const EX  = { name: 'Exeggcute', number: '001', setTotal: '131', setId: 'sv08.5', setName: 'Prismatic Evolutions', lang: 'en',
              printings: ['normal', 'reverse', 'reverse-pokeball', 'reverse-masterball'] };
const MB  = { name: 'Master Ball', number: '153', setTotal: '167', setId: 'sv06', setName: 'Twilight Masquerade', lang: 'en', printings: ['holo'] };
const PB  = { name: 'Poké Ball', number: '185', setTotal: '198', setId: 'sv01', setName: 'Scarlet & Violet', lang: 'en', printings: ['normal', 'reverse'] };
const FS  = { name: 'フシギダネ', number: '001', setTotal: '165', setId: 'SV2a', setName: 'ポケモンカード151', lang: 'ja',
              printings: ['normal', 'reverse-pokeball', 'reverse-masterball'] };
const MBJ = { name: 'マスターボール', number: '091', setTotal: '100', setId: 'SV4K', lang: 'ja', printings: ['holo'] };
const CASES = [
  // [card, title, printing asked, keep?, why]
  [A1, 'Alakazam 1/165 Expedition Holo Rare NM', 'holo', true, 'holo asked, holo stated'],
  [A1, 'Alakazam 1/165 Expedition Reverse Holo', 'reverse', true, 'reverse asked, reverse stated'],
  [A1, 'Alakazam 1/165 Expedition NM', 'reverse', true, 'silence is KEPT (unstated group), never assumed'],
  [A1, 'Alakazam 1/165 Expedition NM', 'holo', true, '...either way'],
  [A1, 'Alakazam 1/165 Expedition Reverse Holo', 'holo', false, 'a Holo search returns no Reverse Holo'],
  [A1, 'Alakazam 1/165 Expedition Holo', 'reverse', false, 'a Reverse search returns no plain Holo'],
  [A33, 'Alakazam 33/165 Expedition Non-Holo', 'normal', true, 'non-holo is the normal printing'],
  [A33, 'Alakazam 33/165 Expedition Holo', 'reverse', true, '#33 has no holo — "Holo" there is the reverse'],
  [A33, 'Alakazam 33/165 Expedition Holo', 'normal', false, '...so it is not the normal'],
  [EX, 'Exeggcute 001/131 Prismatic Evolutions Master Ball Reverse', 'reverse-masterball', true, 'the mirror asked for'],
  [EX, 'Exeggcute 001/131 Prismatic Evolutions Poke Ball Reverse Holo', 'reverse-masterball', false, 'Poké Ball is not Master Ball'],
  [EX, 'Exeggcute 001/131 Prismatic Evolutions Pokéball', 'reverse', false, 'a patterned reverse is not the plain reverse'],
  [EX, 'Exeggcute 001/131 Prismatic Evolutions Reverse Holo', 'reverse', true, 'plain reverse'],
  // THE MASTER BALL TRAP — the card's own name is not a pattern claim
  [MB, 'Master Ball ACE SPEC 153/167 Twilight Masquerade', 'holo', true, 'the Master Ball CARD, not a mirror'],
  [MB, 'Pokemon Masterball 153/167 Twilight Masquerade ACE SPEC Holo', 'holo', true, '...spelled as one word too'],
  [PB, 'Poke Ball 185/198 Scarlet & Violet Reverse Holo', 'reverse', true, 'the Poké Ball CARD in reverse is a plain reverse'],
  [PB, 'Poké Ball 185/198 Scarlet & Violet', 'normal', true, 'the Poké Ball card, unstated'],
  // Japanese mirrors — where the 119x errors came from
  [FS, 'ポケモンカード フシギダネ 001/165 マスターボールミラー', 'reverse-masterball', true, 'マスターボールミラー'],
  [FS, 'ポケモンカード フシギダネ 001/165 モンスターボールミラー', 'reverse-masterball', false, 'モンスターボール is the Poké Ball mirror'],
  [FS, 'ポケモンカード フシギダネ 001/165 ミラー', 'reverse-masterball', true, 'a bare ミラー on a card whose reverses are all mirrors is ambiguous, kept unstated-ish'],
  [FS, 'ポケモンカード フシギダネ 001/165 マスターボールミラー', 'normal', false, 'a mirror is not the base card'],
  [MBJ, 'ポケモンカード マスターボール ACE SPEC 091/100', 'holo', true, 'the JP Master Ball card itself']
];
for (const [card, title, want, keep, why] of CASES) {
  const v = cm.verify(title, card, 'Raw', { printing: want });
  if (keep) keeps++;
  ok(`${keep ? 'KEEP' : 'DROP'} [${want}] ${why}`, v.ok === keep, v.reason || ('kept, claim ' + v.printing));
}
{
  const v = cm.verify('Master Ball ACE SPEC 153/167 Twilight Masquerade', MB, 'Raw');
  ok('the Master Ball card claims NO printing (not reverse-masterball)', v.ok && v.printing === null && v.printingStated === false);
  const w = cm.verify('Alakazam 1/165 Expedition Reverse Holo', A1, 'Raw');
  ok('with no printing asked (All), nothing is refused — the row is only labelled', w.ok && w.printing === 'reverse');
}
ok('parsePrintingParam: known keys, reverse-<word>, and "all" -> null',
  cm.parsePrintingParam('reverse') === 'reverse' && cm.parsePrintingParam('reverse-masterball') === 'reverse-masterball'
  && cm.parsePrintingParam('all') === null && cm.parsePrintingParam('<script>') === null);
ok('buildQuery asks eBay for a reverse / a mirror, and adds nothing for holo or normal',
  /reverse holo/.test(cm.buildQuery(A1, 'Raw', { printing: 'reverse' }))
  && /master ball/.test(cm.buildQuery(EX, 'Raw', { printing: 'reverse-masterball' }))
  && cm.buildQuery(A1, 'Raw', { printing: 'holo' }) === cm.buildQuery(A1, 'Raw'));

// ── 3. Reachable — every path that needs it HAS it ────────────
console.log('\n  3. reachable — the gate is fed and called on every source');
const strip = s => s.replace(/\r\n/g, '\n').split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const server = strip(fs.readFileSync('server.js', 'utf8'));
const fnOf = name => { const i = server.search(new RegExp('\\n(?:async\\s+)?function\\s+' + name + '\\s*\\(')); if (i < 0) return '';
  const j = server.slice(i + 5).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|\napp\./); return server.slice(i, j < 0 ? undefined : i + 5 + j); };
ok('resolveListingCard SELECTs variants (else printings are always null)', /set_release, image_small, variants/.test(fnOf('resolveListingCard')));
ok('ebayMatchCard carries printings', /printings: printingsOf\(card\)/.test(fnOf('ebayMatchCard')));
ok('filterCard carries printings (Yahoo, Yuyu-tei)', /printings: printingsOf\(card\)/.test(fnOf('filterCard')));
ok('sourceEbay gates on the printing', /printing \? \{ printing \}/.test(fnOf('sourceEbay')) && /buildQuery\(matchCard, grade, printing/.test(fnOf('sourceEbay')));
ok('sourceYahoo gates on the printing', /cm\.printingRefusal\(pclaim, opts\.printing, fc\)/.test(fnOf('sourceYahoo')));
ok('sourceYuyutei serves the asked mirror, else the base rule', /wantMirror/.test(fnOf('sourceYuyutei')) && /pickVariants/.test(fnOf('sourceYuyutei')));
ok('every source reports printing', ['sourceEbay', 'sourceYahoo', 'sourceYuyutei'].every(f => /printingReport\(/.test(fnOf(f))));
ok('gatherListings copies the printing report into sources', /sources\[s\.id\]\.printing = r\.value\.printing/.test(fnOf('gatherListings')));
{
  const i = server.indexOf("app.get('/api/listings/:cardId'");
  const route = server.slice(i, server.indexOf('\napp.', i + 5));
  ok('/api/listings keys its cache on the printing too', /listingCacheGet\(key, cacheGrade\)/.test(route) && /listingCacheSet\(key, cacheGrade/.test(route));
  ok('/api/listings passes printing to gatherListings', /gatherListings\(card, grade, limit,\s*\{[^}]*printing/.test(route));
  ok('/api/listings refuses an unknown printing (400), not silently All', /status\(400\)/.test(route));
}

// ── 4. Nothing changes under All — measured on real kept titles ──
console.log('\n  4. All changes nothing');
{
  const corpus = 'C:/Users/chili/AppData/Local/Temp/claude/C--Users-chili-cardhunt/417174f5-7047-4211-9782-e2008a021ff7/scratchpad/keptcorpus.json';
  if (fs.existsSync(corpus)) {
    const { kept } = JSON.parse(fs.readFileSync(corpus, 'utf8'));
    const refused = kept.filter(k => !cm.verify(k.title, { name: '', number: '0' }, 'Raw').printingConflict);
    ok(`no kept production title refused on printing with none asked (${kept.length})`, refused.length === kept.length);
  } else console.log('  skip  the kept-title corpus is scratch, not shipped');
}

(async () => {
  if (process.argv.includes('--db')) {
    console.log('\n  --db: stored printings for the spot-check cards');
    const { Pool } = require('pg');
    const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const ids = { 'en-ecard1-1': ['holo', 'reverse'], 'en-ecard1-33': ['normal', 'reverse'],
                  'en-sv03.5-199': ['holo'], 'en-sv08.5-001': ['normal', 'reverse', 'reverse-pokeball', 'reverse-masterball'],
                  'ja-SV2a-001': ['normal', 'reverse-pokeball', 'reverse-masterball'] };
    const r = await db.query('SELECT api_card_id, rarity, variants FROM cards WHERE api_card_id = ANY($1)', [Object.keys(ids)]);
    for (const row of r.rows) {
      const got = row.variants && row.variants.printings ? row.variants.printings.map(p => p.key) : null;
      ok(`${row.api_card_id} stored as ${JSON.stringify(got)} (rarity ${row.rarity})`, JSON.stringify(got) === JSON.stringify(ids[row.api_card_id]));
    }
    const a = r.rows.find(x => x.api_card_id === 'en-ecard1-1'), b = r.rows.find(x => x.api_card_id === 'en-ecard1-33');
    ok('Alakazam #1 and #33 are separate cards with separate rarities (Holo Rare / Rare)',
      a && b && a.rarity === 'Rare Holo' && b.rarity === 'Rare', (a && a.rarity) + ' / ' + (b && b.rarity));
    await db.end();
  }
  console.log(`\n  variants.test.js — ${pass} passed, ${fail} failed  (${keeps} gate cases assert a KEEP)\n`);
  process.exitCode = fail ? 1 : 0;
})();
