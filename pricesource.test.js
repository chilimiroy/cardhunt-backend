// pricesource.test.js — which stored English price source may be believed (TASK T1, 2026-09-29)
//   node pricesource.test.js
//
// Two defects, both measured on 2,767 English cards against TCGdex:
//  1. tcgPlayerSearch matched a collector number in ANY set. "Expedition Base
//     Set" ranked Base Set products first: Alakazam #1 held $55-71 (Base Set 2
//     and Base Set 001) for a $233.32 card. tcgsetname.js now decides the set.
//  2. TCGdex maps some cards to ANOTHER card's product: Trainer Gallery TG16
//     Mimikyu V -> main-set 068/172 ($3.62, the card is $86.55). A product id
//     claimed by two cards is trusted for neither (tcgdexprice.productConflicts).
// Each half asserts what it KEEPS as well as what it refuses.
'use strict';
require('./testcount')(56);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const S = require('./tcgsetname.js');
const T = require('./tcgdexprice.js');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

console.log('\nSET — the hit must be in OUR set (real TCGplayer set names, probed 2026-09-29)');
// Refused: the exact hits that produced the stored Expedition prices.
ok('Expedition Alakazam: Base Set 2 hit refused', !S.sameTcgSet('Base Set 2', 'ecard1', 'Expedition Base Set'));
ok('Expedition Alakazam: Base Set hit refused', !S.sameTcgSet('Base Set', 'ecard1', 'Expedition Base Set'));
ok('Expedition Butterfree: SM Base Set hit refused', !S.sameTcgSet('SM Base Set', 'ecard1', 'Expedition Base Set'));
ok('Base Set (Shadowless) is not Base Set', !S.sameTcgSet('Base Set (Shadowless)', 'base1', 'Base Set'));
ok('Brilliant Stars main set is not its Trainer Gallery',
  !S.sameTcgSet('SWSH09: Brilliant Stars', 'swsh9tg', 'Brilliant Stars Trainer Gallery'));
ok('EX Dragon Frontiers is not EX Dragon', !S.sameTcgSet('EX Dragon Frontiers', 'ex3', 'Dragon'));
ok('an empty set name is refused', !S.sameTcgSet('', 'base1', 'Base Set'));
// Kept: the names that differ only in form.
ok('Expedition hit accepted for Expedition Base Set (measured alias)', S.sameTcgSet('Expedition', 'ecard1', 'Expedition Base Set'));
ok('"Black and White" == "Black & White"', S.sameTcgSet('Black and White', 'bw1', 'Black & White'));
ok('"SWSH09: Brilliant Stars Trainer Gallery" == ours',
  S.sameTcgSet('SWSH09: Brilliant Stars Trainer Gallery', 'swsh9tg', 'Brilliant Stars Trainer Gallery'));
ok('"SV03: Obsidian Flames" == "Obsidian Flames"', S.sameTcgSet('SV03: Obsidian Flames', 'sv03', 'Obsidian Flames'));
ok('"EX Holon Phantoms" == "Holon Phantoms"', S.sameTcgSet('EX Holon Phantoms', 'ex13', 'Holon Phantoms'));
ok('"EX FireRed & LeafGreen" == "FireRed & LeafGreen"', S.sameTcgSet('EX FireRed & LeafGreen', 'ex6', 'FireRed & LeafGreen'));
ok('"SM Base Set" == "Sun & Moon" (measured alias)', S.sameTcgSet('SM Base Set', 'sm1', 'Sun & Moon'));
ok('"Base Set" == "Base Set"', S.sameTcgSet('Base Set', 'base1', 'Base Set'));
ok('"Base Set 2" == "Base Set 2"', S.sameTcgSet('Base Set 2', 'base4', 'Base Set 2'));
ok("McDonald's Promos 2011 (measured alias)", S.sameTcgSet("McDonald's Promos 2011", '2011bw', "McDonald's Collection 2011"));

ok('"Pokemon GO" == "Pokémon GO" by the normaliser alone', S.sameTcgSet('Pokemon GO', 'no-alias', 'Pokémon GO'));
ok('trainer kits are NOT aliased (both halves number from 1)',
  !S.sameTcgSet('BW Trainer Kit: Excadrill & Zoroark', 'tk-bw-e', 'BW trainer Kit (Excadrill)'));

console.log('\nYAHOO — a stated mirror never enters the base median (T4; real titles, 2026-09-29)');
const cm = require('./cardmatch.js');
const bulba = { name: 'フシギダネ', number: '001', printings: ['normal', 'reverse-pokeball', 'reverse-masterball'] };
// ja-SV2a-001: ALL three surviving sales were Master Ball mirrors — the old
// median stored ~$22 as a Common's base price.
for (const t of ['状態B トレカ ポケモンカードゲーム SV2a-001 フシギダネ ミラー(マスターボール) C',
                 'ポケモンカードゲーム　フシギダネ　151 マスターボールミラー　001/165　汚れ白かけなし',
                 'ポケモンカード フシギダネ sv2a 001/165 マスターボールミラー'])
  ok('set aside as reverse-masterball: ' + t.slice(0, 40), cm.printingClaim(t, bulba).key === 'reverse-masterball');
const pika = { name: 'ピカチュウ', number: '025', printings: ['normal', 'reverse-pokeball', 'reverse-masterball'] };
ok('set aside as reverse-pokeball: モンスターボールミラー',
  cm.printingClaim('ピカチュウ sv2a 025/165 モンスターボールミラー ポケモンカードゲーム 同梱OK 美品', pika).key === 'reverse-pokeball');
ok('KEPT in the base: a title that names no printing',
  !cm.printingClaim('ポケモンカード ピカチュウ SV2a 025/165 C自引きですので、すぐにスリーブ入れました。', pika).stated);
ok('KEPT in the base: the Master Ball CARD is not a mirror',
  !/^reverse/.test(String(cm.printingClaim('マスターボール ACE SPEC SV5a 153/167', { name: 'マスターボール', number: '153' }).key)));

console.log('\nPRODUCT — one product id claimed by two cards is trusted for neither');
const c1 = T.productConflicts([
  { cardId: 'en-swsh9tg-TG16', tcgplayer: 263784, cardmarket: null },
  { cardId: 'en-swsh9-68', tcgplayer: 263784, cardmarket: 612 },
  { cardId: 'en-ecard1-1', tcgplayer: 84100, cardmarket: 274876 },
  { cardId: 'en-ecard1-33', tcgplayer: 84133, cardmarket: 274876 },
  { cardId: 'en-base1-4', tcgplayer: 42382, cardmarket: 1 },
  { cardId: 'en-base1-4', tcgplayer: 42382, cardmarket: 1 },    // holo + reverse rows of ONE card
  { cardId: 'en-sv03-223', tcgplayer: null, cardmarket: null },
]);
ok('TG16 and 068 share 263784 -> conflict', c1.tcgplayer.has('263784'));
ok('...naming both cards', JSON.stringify(c1.tcgplayer.get('263784')) === '["en-swsh9-68","en-swsh9tg-TG16"]');
ok('Alakazam #1 and #33 share Cardmarket 274876 -> conflict', c1.cardmarket.has('274876'));
ok('Alakazam #1 and #33 keep their OWN TCGplayer products', !c1.tcgplayer.has('84100') && !c1.tcgplayer.has('84133'));
ok('two rows of ONE card are not a conflict', !c1.tcgplayer.has('42382') && !c1.cardmarket.has('1'));
ok('null ids are never a shared product', ![...c1.tcgplayer.keys(), ...c1.cardmarket.keys()].includes('null'));
ok('exactly 1 + 1 conflicts found', c1.tcgplayer.size === 1 && c1.cardmarket.size === 1,
  `${c1.tcgplayer.size} / ${c1.cardmarket.size}`);
ok('number and string ids compare equal', T.productConflicts([
  { cardId: 'a', tcgplayer: 5 }, { cardId: 'b', tcgplayer: '5' }]).tcgplayer.has('5'));

console.log('\nWIRING — the paths actually use both');
const H = fs.readFileSync(__dirname + '/tcgdexharvest.js', 'utf8');
ok('harvest records claims before writing', H.indexOf('recordProductClaims') > 0
  && H.indexOf('recordProductClaims') < H.indexOf('INSERT INTO price_history'));
ok('harvest skips a shared TCGplayer product', /p\.tcgplayerBase && !tpShared/.test(H));
ok('harvest skips a shared Cardmarket product', /p\.cardmarket && !cmShared/.test(H));
ok('harvest skips a shared product\'s printing rows', /tpShared \? \[\] :/.test(H));
if (fs.existsSync(__dirname + '/ingest.js')) {
  const I = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
  const spf = I.slice(I.indexOf('async function safePriceFor'), I.indexOf('async function safePrices('));
  ok('safePriceFor asks TCGdex first', spf.indexOf('tcgdexPriceFor(card)') > 0
    && spf.indexOf('tcgdexPriceFor(card)') < spf.lastIndexOf('tcgPlayerSearch('));
  ok('safePriceFor fallback passes the set id (and TCGdex\'s product ids, for the stamped-product rule)', /tcgPlayerSearch\(card\.name, card\.set_name, card\.number, card\.rarity,\s*\{ setId: card\.set_api_id, tcgdexIds: tcgdexProductIds\(card\.variants\) \}\)/.test(spf));
  const tps = I.slice(I.indexOf('async function tcgPlayerSearch'), I.indexOf('async function tcgPlayerSearch') + 3000);
  ok('tcgPlayerSearch filters hits by set', /opts\.setId && !sameTcgSet\(h\.setName, opts\.setId, setName\)/.test(tps));
  // 2026-10-02: our set name in the QUERY ranked TCGplayer's own card out of
  // the results for dpp and basep (88 cards unpriced); a second question in
  // TCGplayer's name for the set finds it. Only after the first finds nothing.
  const head = tps.slice(0, tps.indexOf("await hostDelay('tcgplayer'"));
  ok('asked in our set name FIRST, and returned if it matched', /const first = await tcgPlayerSearch\([^;]*queryAs: setName \|\| ''[^;]*;\s*if \(first\) return first;/.test(head));
  ok('the second question uses TCGplayer\'s own set name, and only when it differs',
     /TCG_SET_NAME\[opts\.setId\]/.test(head) && /normTcgSetName\(theirs\) === normTcgSetName\(setName\)\) return null/.test(head));
  ok('no recursion past one level (queryAs === undefined guard)', /opts\.queryAs === undefined/.test(head));
  ok('never for a reprint (its set is fixed by REPRINT_OF)', /if \(!opts\.reprint && opts\.setId && opts\.queryAs === undefined\)/.test(head));
  ok('the query is built from queryAs when given', /opts\.queryAs !== undefined \? opts\.queryAs : \(setName \|\| ''\)/.test(tps));
  const tsn = require('./tcgsetname');
  ok('dpp and basep are aliased to TCGplayer\'s names (probed 2026-10-02)',
     tsn.sameTcgSet('Diamond and Pearl Promos', 'dpp', 'DP Black Star Promos') && tsn.sameTcgSet('WoTC Promo', 'basep', 'Wizards Black Star Promos'));
  ok('...and the alias does not open "Jumbo Cards" for dpp', !tsn.sameTcgSet('Jumbo Cards', 'dpp', 'DP Black Star Promos'));
  const tpf = I.slice(I.indexOf('async function tcgdexPriceFor'), I.indexOf('async function tcgPlayerSearch'));
  ok('tcgdexPriceFor refuses without a recorded full harvest', /if \(!_tdxConflicts\.ready\)/.test(tpf));
  ok('tcgdexPriceFor refuses a shared product', /_tdxConflicts\.tcgplayer\.has\(String\(b\.productId\)\)/.test(tpf));
  const yjs = I.slice(I.indexOf('async function yahooJapanSearch'), I.indexOf('async function yahooJapanSearch') + 9000);
  ok('Yahoo base median excludes a stated reverse/mirror', /const priced = pricedAll\.filter\(x => !isOther\(x\)\)/.test(yjs));
  ok('Yahoo returns mirror medians even with no base sample', /if \(variantPrices\.length\) \{\s*return \{ price: null/.test(yjs));
  ok('jpCtx hands the card\'s printings to the gate', /printings: card\.variants && Array\.isArray\(card\.variants\.printings\)/.test(I));
  ok('both price runs write variant rows', (I.match(/const res = await safePriceFor\(card\);\s*await writeVariantPrices\(card, res\);/g) || []).length === 2);
  ok('both price runs SELECT variants for the gate', (I.match(/c\.set_total, (?:c\.set_release, )?c\.variants, c\.name_en/g) || []).length === 2);
  const wvp = I.slice(I.indexOf('async function writeVariantPrices'), I.indexOf('async function safePriceFor'));
  ok('variant rows are written WITH their variant, and only reverse keys', /variant, source_meta\)/.test(wvp) && /\^reverse/.test(wvp));
  ok('the writers record marketplace and source_meta',
    (I.match(/res\.marketplace \|\| res\.source\.split\('_'\)\[0\],\s*res\.meta/g) || []).length === 2);
} else console.log('  SKIP  ingest.js wiring — not in this checkout');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
