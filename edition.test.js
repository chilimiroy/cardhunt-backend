// edition.test.js — 1st Edition / Shadowless / Unlimited as a dimension (TASK T3)
//
//   node edition.test.js          offline
//   node edition.test.js --db     + the stored-price rule on the real table
//
// A 1st Edition Base Set Charizard and an Unlimited one are different
// products at very different prices; averaging them describes neither.
// Edition sits BESIDE printing, never inside it: a card can be 1st Edition
// and holo, or Unlimited and reverse.
//
// Where it exists: gradeprice.printRunsFor — the ten English sets TCGdex
// counts first-edition cards in (Base Set to Neo Destiny), Shadowless on
// Base Set only. What a title states: cardmatch.editionClaim, the ONE reader
// (listingparse labels rows with it). Measured on 5,000 real titles from
// those sets: the old listingparse reader missed every European form.
'use strict';
require('./testcount')(76);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const cm = require('./cardmatch');
const lp = require('./listingparse');
const gp = require('./gradeprice');
const printsql = require('./printsql');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('\n1. WHAT A TITLE STATES — real titles, five languages');
for (const [t, want] of [
  ['1999 Pokemon Base Set Charizard 4/102 1st Edition Holo', '1st-edition'],
  ['Charizard 4/102 Base Set Shadowless 1st Edition Holo Rare', '1st-edition'],   // every 1st Ed Base is shadowless
  ['Set Base Personalizzato Tipo Foglia 1° Edizione Shadowless Charizard 4/102 Holo', '1st-edition'],
  ['1. Edition Charizard 4/102 Base Holo Vintage 1999 Pokemon Karte', '1st-edition'],
  ['Lugia Holo 9/111 Neo Genesis 1 Edition ERSTE EDITION ITA Pokemon', '1st-edition'],
  ['Pokémon CHARIZARD 4/102 - Set Base - ITA - PRIMA EDIZIONE', '1st-edition'],
  ['Typhlosion 17/111 Neo Genesis 1ª Edición Raro Holo Carta Pokémon TCG LP', '1st-edition'],
  ['NM+ Typhlosion 17/111 Neo Genesis Holo 1a edizione', '1st-edition'],
  ['Carte Pokémon Typhlosion 17/111 FR Édition 1 Holo Néo Genesis exc/nm', '1st-edition'],
  ['Pokemon Charizard 4/102 Base Set 1st Ed Holo', '1st-edition'],
  ['🔥 Shadowless Charizard 4/102 - Base Set Near Mint', 'shadowless'],
  ['Pokémon TCG Charizard Base Set Holo Unlimited Rare Karte 4/102', 'unlimited'],
  ['CHARIZARD 4/102 - BASE SET "4TH PRINT" (1999-2000) - HOLO - Near Mint - RAW', 'unlimited'],
  ['Pokemon Card Charizard 4/102 Base Set Holo Rare Unlimited Non Shadowless MINT', 'unlimited'],
  ['Shining Charizard 107/105 Neo Destiny Secret Rara Holo Inglese 100 HP Illimitato', 'unlimited'],
  ['Typhlosion 17/111 Neo Genesis Edición Ilimitada Holo Raro Inglés 2000 HP 100', 'unlimited'],
  ['PIKACHU COMMUNE - POKÉMON 58/102 SET DE BASE ÉDITION 2 FR', 'unlimited'],             // French "Édition 2" = Unlimited
  ['Pokemon Karte Mewtwo 10/102 HOLO Ed2 Base Set Edition 2 Wizards DE', 'unlimited'],
  ['Pokemon Karte Lugia SWIRL 9/111 Neo Genesis Unlimitiert Holo Rare  Mint NM', 'unlimited'],
  ['Charizard 4/102 Base Set not 1st edition, unlimited', 'unlimited'],
  ['Charizard 4/102 Base Set Holo Rare WOTC 1999 120 HP', null],
  ['Charizard 4/102 Holo 120 HP Stage 2 Base Set 1999 Near Mint 1st Place', null]
]) {
  const c = cm.editionClaim(t);
  ok(`${String(want).padEnd(11)} ${t.slice(0, 64)}`, c.key === want && c.stated === (want !== null), JSON.stringify(c));
}
ok('listingparse labels rows from the same reader', lp.parseListingTitle('Charizard 4/102 Base 1ª Edición Holo').edition === '1st Edition'
   && lp.parseListingTitle('Charizard 4/102 Base Holo Ilimitado').edition === 'Unlimited');
ok('listingparse still labels the stamps cardmatch does not read', lp.parseListingTitle('Pikachu Staff Promo 26 Holo').edition === 'Staff');

console.log('\n2. THE GATE — refuses only a STATED other edition, both directions');
const ZARD = { cardId: 'en-base1-4', name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set', lang: 'en', setYear: 1999 };
const V = (t, ed) => cm.verify(t, ZARD, 'Raw', ed ? { edition: ed } : undefined);
ok('1st Edition asked: an Unlimited title is refused', !V('Charizard 4/102 Base Set Unlimited Holo', '1st-edition').ok
   && V('Charizard 4/102 Base Set Unlimited Holo', '1st-edition').editionConflict === true);
ok('1st Edition asked: a Shadowless title is refused', !V('Charizard 4/102 Base Set Shadowless Holo', '1st-edition').ok);
ok('1st Edition asked: a 1st Edition title is kept, stated', V('Charizard 4/102 Base Set 1st Edition Holo', '1st-edition').ok
   && V('Charizard 4/102 Base Set 1st Edition Holo', '1st-edition').editionStated === true);
ok('1st Edition asked: a silent title is KEPT, unstated — never assumed', V('Charizard 4/102 Base Set Holo', '1st-edition').ok
   && V('Charizard 4/102 Base Set Holo', '1st-edition').editionStated === false);
ok('Unlimited asked: a 1st Edition title is refused', !V('Charizard 4/102 Base 1. Edition Holo', 'unlimited').ok);
ok('Unlimited asked: "not 1st edition" is not a 1st Edition claim', V('Charizard 4/102 Base Set Holo not 1st edition', 'unlimited').ok);
ok('Shadowless asked: a 1st Edition Shadowless title is refused (it is the 1st Edition)',
   !V('Charizard 4/102 Base Set 1st Edition Shadowless Holo', 'shadowless').ok);
ok('no edition asked: every edition kept, each labelled', ['1st Edition', 'Shadowless', 'Unlimited'].every(e =>
   V('Charizard 4/102 Base Set ' + e + ' Holo').ok));
// Independent of printing: a 1st Edition reverse is both.
const EXP = { cardId: 'en-ecard1-1', name: 'Alakazam', number: '1', setTotal: 165, setName: 'Expedition Base Set', lang: 'en', setYear: 2002,
              printings: ['holo', 'reverse'] };
const both = cm.verify('Alakazam 1/165 Expedition Reverse Holo', EXP, 'Raw', { printing: 'reverse' });
ok('printing still works alone, and reports no edition when none is stated', both.ok && both.printing === 'reverse' && both.edition === null);

console.log('\n3. THE QUESTION ASKED');
ok('1st Edition is asked of eBay', / 1st edition /.test(cm.buildQuery(ZARD, 'Raw', { edition: '1st-edition' }) + ' '));
ok('Shadowless is asked', /shadowless/.test(cm.buildQuery(ZARD, 'Raw', { edition: 'shadowless' })));
ok('Unlimited adds nothing — asking it would drop every silent title',
   cm.buildQuery(ZARD, 'Raw', { edition: 'unlimited' }) === cm.buildQuery(ZARD, 'Raw'));
ok('edition and printing both reach the query', /reverse holo/.test(cm.buildQuery(ZARD, 'Raw', { printing: 'reverse', edition: '1st-edition' }))
   && /1st edition/.test(cm.buildQuery(ZARD, 'Raw', { printing: 'reverse', edition: '1st-edition' })));
ok('parseEditionParam: known keys only', cm.parseEditionParam('1st-edition') === '1st-edition'
   && cm.parseEditionParam('all') === null && cm.parseEditionParam('first') === null);

console.log('\n4. WHERE IT EXISTS — and nowhere else');
ok('Base Set: 1st Edition, Shadowless, Unlimited', JSON.stringify(gp.printRunsFor('base1', 'en')) === JSON.stringify(['1st Edition', 'Shadowless', 'Unlimited']));
ok('Neo Genesis: 1st Edition and Unlimited', JSON.stringify(gp.printRunsFor('neo1', 'en')) === JSON.stringify(['1st Edition', 'Unlimited']));
ok('a 2026 set: none', gp.printRunsFor('sv10', 'en').length === 0 && gp.printRunsFor('me02.5', 'en').length === 0);
ok('Expedition (2002, e-Card): none — it never had a 1st Edition', gp.printRunsFor('ecard1', 'en').length === 0);
ok('Legendary Collection / Base Set 2: none', gp.printRunsFor('base4', 'en').length === 0 && gp.printRunsFor('lc', 'en').length === 0);

console.log('\n5. STORED PRICES — a 1st Edition price is never the headline');
ok('editionOfRow reads the source name the rows carry', printsql.editionOfRow({ source: 'tcgplayer_1stEditionHolofoil' }) === '1st-edition'
   && printsql.editionOfRow({ source: 'tcgplayer_holofoil' }) === null && printsql.editionOfRow({ edition: 'shadowless' }) === 'shadowless');
ok('editionOfRow reads the harvest\'s spelling and its source_meta',
   printsql.editionOfRow({ source: 'tcgdex_tcgplayer_1st-edition-holofoil' }) === '1st-edition'
   && printsql.editionOfRow({ source: 'tcgdex_tcgplayer_normal', source_meta: { printing: '1st-edition-holofoil' } }) === '1st-edition'
   && printsql.editionOfRow({ source: 'tcgdex_tcgplayer_unlimited-holofoil', source_meta: { printing: 'unlimited-holofoil' } }) === null);
ok('editionOfSql reads all three spellings', /1stedition/i.test(printsql.editionOfSql('ph')) && /1st-edition/.test(printsql.editionOfSql('ph'))
   && /source_meta->>'printing'/.test(printsql.editionOfSql('ph')));
// The REAL TCGdex shape on a WOTC holo (neo1-9 Lugia, read 2026-09-30): no
// plain holofoil — the 1st Edition key came first and became the "base".
{
  const tp = require('./tcgdexprice');
  const lugia = { '1st-edition-holofoil': { marketPrice: 164.8, productId: 1 }, 'unlimited-holofoil': { marketPrice: 531.39, productId: 2 } };
  const split = tp.splitTcgplayer(lugia);
  ok('TCGdex base on a WOTC holo is the UNLIMITED price, not the 1st Edition one',
     split.base && split.base.printing === 'unlimited-holofoil' && split.base.price === 531.39, JSON.stringify(split.base));
  ok('...and a card TCGdex lists ONLY in 1st Edition still has a price to show',
     tp.splitTcgplayer({ '1st-edition-holofoil': { marketPrice: 50 } }).base.printing === '1st-edition-holofoil');
  ok('...where plain holofoil exists (Base Set), it is still the base',
     tp.splitTcgplayer({ holofoil: { marketPrice: 944.53 } }).base.price === 944.53);
}
ok('basePrintingSql carries the edition rule (every headline reader calls it)',
   printsql.basePrintingSql('ph', 'c').includes(printsql.baseEditionSql('ph')));
ok('baseEditionSql reads both the column and the source name',
   /ph\.edition/.test(printsql.baseEditionSql('ph')) && /1stedition/i.test(printsql.baseEditionSql('ph')));

console.log('\n6. WIRED');
const server = fs.readFileSync('server.js', 'utf8');
const fnOf = name => { const i = server.search(new RegExp('\\n(?:async\\s+)?function\\s+' + name + '\\s*\\(')); if (i < 0) return '';
  const j = server.slice(i + 5).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|\napp\./); return server.slice(i, j < 0 ? undefined : i + 5 + j); };
ok('editionsOfCard reads gradeprice.printRunsFor — one list', /gp\.printRunsFor\(/.test(fnOf('editionsOfCard')));
const route = (i => server.slice(i, server.indexOf('\napp.', i + 5)))(server.indexOf("app.get('/api/listings/:cardId'"));
ok('/api/listings refuses an unknown edition (400)', /parseEditionParam\(req\.query\.edition\)/.test(route) && /unknown edition/.test(route));
ok('/api/listings refuses an edition the card\'s set never had (400)', /editionsOfCard\(card\)\.includes\(edition\)/.test(route));
ok('the view cache key carries the edition', /edition \? '\|ed:' \+ edition/.test(fnOf('viewCacheGrade')));
ok('listingsFor and an expansion pass the edition on', /printing, edition, sites:/.test(fnOf('listingsFor'))
   && /const opts = \{ background: false, printing, edition \};/.test(fnOf('expandView')));
ok('sourceEbay asks for it and gates on it', /edition: opts\.edition \|\| null/.test(fnOf('sourceEbay'))
   && /opts\.edition \? \{ edition: opts\.edition \} : \{\}/.test(fnOf('sourceEbay')));
ok('rows carry the edition key and whether it was stated', /editionKey: v\.edition \|\| null/.test(server)
   && /editionStated: o\.editionStated === true/.test(server));
ok('the payload names the editions and reports kept stated / unstated / refused',
   /editions: editionsOfCard\(card\)/.test(fnOf('buildListingsPayload')) && /editionReport:/.test(fnOf('buildListingsPayload')));
ok('/api/cards returns editions and editionPrices', /editionPrices,/.test(server) && /NOT \$\{printsql\.baseEditionSql\('ph'\)\}/.test(server));

console.log('\n7. THE PAGE');
const html = fs.readFileSync('cardhunt_preview.html', 'utf8');
const pfn = name => { const i = html.search(new RegExp('\\n(?:async\\s+)?function\\s+' + name + '\\s*\\(')); if (i < 0) return '';
  const j = html.slice(i + 5).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/); return html.slice(i, j < 0 ? undefined : i + 5 + j); };
ok('the Edition box is drawn only when the card has MORE THAN ONE edition', /eds\.length > 1/.test(pfn('renderSelector'))
   && /S\.currentCard\.editions/.test(pfn('renderSelector')));
ok('it is its own box, beside Printing — not folded into it', /if \(editionBox\) h \+= editionBox;/.test(pfn('renderSelector')));
ok('openCard resets the edition', /SEL\.edition='all'/.test(pfn('openCard')));
ok('fetchListings keys its cache on the edition and sends it', /'\|ed:' \+ ed0/.test(pfn('fetchListings')) && /&edition=/.test(pfn('fetchListings')));
ok('renderLiveListings asks with SEL.edition and drops a stale answer', /edition: edition/.test(pfn('renderLiveListings'))
   && /\(SEL\.edition \|\| 'all'\) !== edition/.test(pfn('renderLiveListings')));
ok('the Search-all / Load-more buttons carry the edition too', /edition: edition/.test(pfn('liveExpand')));
ok('rows with no stated edition go to their own group, never dropped', /unstatedEd/.test(pfn('renderLiveListings'))
   && /Edition not stated/.test(pfn('renderLiveListings')));
ok('a selected 1st Edition shows ITS held price, or a dash — never the Unlimited price',
   /card\.editionPrices/.test(pfn('selectedHeld')) && /x\.edition === se/.test(pfn('selectedHeld'))
   && /price: null/.test(pfn('selectedHeld')));
ok('edition + printing together has no stored price and says so', /if \(sp && se\) return \{ price: null/.test(pfn('selectedHeld')));

// 2026-10-02 (TASK T2): nothing WROTE a 1st Edition price. TCGdex returns it
// in the same response the refresh reads; tcgdexPriceFor dropped it, so
// every 1st Edition price was frozen at what a harvest left (Lugia neo1-9
// $164.80 held, $1,134.85 live). Measured after: neo3 refresh, 7 rows.
if (fs.existsSync(__dirname + '/ingest.js')) {
  console.log('\n6b. THE WRITER (ingest.js)');
  const ing = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
  const fnOf = name => { const a = ing.indexOf('async function ' + name + '(');
    const b = ing.indexOf('\nasync function ', a + 10); return a < 0 ? '' : ing.slice(a, b > a ? b : undefined); };
  const tpf = fnOf('tcgdexPriceFor'), wep = fnOf('writeEditionPrice');
  ok('tcgdexPriceFor reads the 1st Edition price with the shared reader',
     /tdxp\.tcgplayerByEdition\(/.test(tpf) && /\.firstEdition/.test(tpf));
  ok('...refuses a 1st Edition product TCGdex gives to two cards', /_tdxConflicts\.tcgplayer\.has\(String\(fe\.productId\)\)/.test(tpf));
  ok('...and never when the headline itself is a 1st Edition key', /startsWith\('1st-edition'\)/.test(tpf));
  ok('writeEditionPrice stores edition = \'1st-edition\' (kept out of every headline)', /'1st-edition',\$4/.test(wep));
  ok('the refresh writes it', /await writeEditionPrice\(card, res\);/.test(fnOf('refreshDue')));
  ok('safeprices writes it', /await writeEditionPrice\(card, res\);/.test(fnOf('safePrices')));
  // The column is what the headline rule reads first.
  ok('baseEditionSql excludes a row whose edition column is 1st-edition',
     /ph\.edition IS NOT NULL/.test(printsql.editionOfSql('ph')) && /'1st-edition'/.test(printsql.baseEditionSql('ph')));
}

(async () => {
  if (process.argv.includes('--db')) {
    console.log('\n7. THE REAL TABLE (--db)');
    let Pool; try { Pool = require('pg').Pool; } catch (e) { console.log('  (skipped — pg not installed)'); }
    if (Pool && process.env.DATABASE_URL) {
      const db = require('./schemaguard').testPool();   // refuses schema changes
      try {
        const REAL = `ph.grade IS NULL AND ph.source NOT LIKE 'estimate%' AND ph.price_usd > 0`;
        const r = await db.query(`SELECT count(*)::int AS n FROM (
          SELECT DISTINCT ON (ph.card_api_id) ph.source FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
          WHERE ${REAL} AND ${printsql.basePrintingSql('ph', 'c')} ORDER BY ph.card_api_id, ph.recorded_at DESC) x
          WHERE x.source ILIKE '%1stedition%'`);
        ok('no card\'s headline is a 1st Edition price', r.rows[0].n === 0, r.rows[0].n + ' cards');
        const e = await db.query(`SELECT count(*)::int AS n FROM price_history ph WHERE ${REAL} AND NOT ${printsql.baseEditionSql('ph')}`);
        ok('the 1st Edition rows are still there, for the edition selector', e.rows[0].n > 500, e.rows[0].n + ' rows');
      } finally { await db.end(); }
    } else console.log('  (skipped — DATABASE_URL not set)');
  }
  console.log(`\nedition.test.js — ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
