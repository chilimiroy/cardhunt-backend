// pricecheck.test.js — editions compared like for like; the internal
// TCGplayer search kept ONLY where TCGdex cannot price (2026-10-01).
//
//   1. tcgdexprice.tcgplayerByEdition splits TCGdex's TCGplayer block at the
//      edition line. pricecheck flagged 10 of 12 Neo Genesis cards because
//      its "live" figure was the 1st Edition price and ours was Unlimited.
//   2. tcgdexPriceFor — the REAL function, extracted from ingest.js, run
//      against a stubbed TCGdex — says WHY there is no price, and only
//      no-tcgplayer / not-on-tcgdex / shared may fall back to the internal
//      search. An unreachable TCGdex used to send every card there.
//   3. The structure: pricecheck asks per edition; the deleted scrape path
//      stays deleted; the internal search has exactly one definition.
//
//   node pricecheck.test.js        (SKIP of part 2-3 where ingest.js is absent)
require('./testcount')(34);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const tdxp = require('./tcgdexprice.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } }
console.log('\n  pricecheck.test.js\n');

// ── 1. editions ──
const E = tdxp.tcgplayerByEdition;
ok(typeof E === 'function', 'tcgplayerByEdition exported');
if (typeof E === 'function') {
  // neo1-9 Lugia as TCGdex serves it: two editions, no plain holofoil.
  const lugia = E({ unit: 'USD', '1st-edition-holofoil': { marketPrice: 164.8, productId: 1 },
                    'unlimited-holofoil': { marketPrice: 531.39, productId: 2 } });
  ok(lugia.unlimited && lugia.unlimited.price === 531.39, 'Lugia neo1-9: Unlimited is 531.39, not the 1st Edition figure');
  ok(lugia.firstEdition && lugia.firstEdition.price === 164.8, 'Lugia neo1-9: 1st Edition 164.80 read separately');
  const modern = E({ normal: { marketPrice: 0.12, productId: 3 }, 'reverse-holofoil': { marketPrice: 0.4 } });
  ok(modern.unlimited && modern.unlimited.price === 0.12 && !modern.firstEdition, 'a modern card: normal is its only edition; reverse never read');
  const only1st = E({ '1st-edition-normal': { marketPrice: 9.5, productId: 4 } });
  ok(!only1st.unlimited && only1st.firstEdition.price === 9.5, 'a card listed only as 1st Edition has no Unlimited figure');
  ok(!E(null).unlimited && !E(null).firstEdition, 'tcgplayer: null -> nothing (present-but-null provider)');
  ok(!E({ holofoil: { marketPrice: 0, midPrice: null } }).unlimited, 'a 0 price is "no data", not a price');
  ok(E({ holofoil: { marketPrice: null, midPrice: 7 } }).unlimited.price === 7, 'falls back marketPrice -> midPrice');
}

// ── 2. tcgdexPriceFor, the real function ──
// CRLF stripped: a clean checkout on Windows (core.autocrlf=true) has CRLF
// endings, and the slicer below ends on "\n}\n" — it found nothing there.
const I = fs.existsSync('ingest.js') ? fs.readFileSync('ingest.js', 'utf8').replace(/\r\n/g, '\n') : null;
if (!I) console.log('  SKIP parts 2-3 — ingest.js not present');
function slice(src, start) {
  const i = src.indexOf(start); if (i < 0) return '';
  const j = src.indexOf('\n}\n', i); return j < 0 ? '' : src.slice(i, j + 2);
}
(async () => {
  if (I) {
    const src = slice(I, 'async function tcgdexPriceFor(');
    const fbm = I.match(/const TCGDEX_FALLBACK_OK = new Set\(\[[^\]]*\]\);/);
    ok(src.length > 200 && fbm, 'tcgdexPriceFor and TCGDEX_FALLBACK_OK found in ingest.js');
    // The slicer, checked: it must stop before the next function.
    ok(!/async function tcgPlayerSearch/.test(src), 'slice stops at the end of tcgdexPriceFor');
    const FALLBACK = fbm ? new Function(fbm[0] + '; return TCGDEX_FALLBACK_OK;')() : new Set();
    ok(FALLBACK.has('no-tcgplayer') && FALLBACK.has('not-on-tcgdex') && FALLBACK.has('shared'),
       'fallback allowed where TCGdex cannot price: no-tcgplayer, not-on-tcgdex, shared');
    ok(!FALLBACK.has('unreachable') && !FALLBACK.has('not-ready'),
       'never when TCGdex is unreachable or no harvest has run — that would move the whole catalogue');

    const ARTISTS = [];
    const run = async (responses, conflicts) => {
      let n = 0;
      const fakeFetch = async () => {
        const r = responses[Math.min(n++, responses.length - 1)];
        if (r === 'throw') throw new Error('ECONNRESET');
        return { status: r.status, ok: r.status === 200, json: async () => r.body };
      };
      // writeIllustrator (2026-10-08): the artist rides the same response; stubbed, recorded.
      const f = new Function('db', 'tdxp', 'hostDelay', 'DELAY_TCGDEX', 'TCGDEX', 'fetch', 'sleep', 'console', 'tcgdexLocalId', 'writeIllustrator', 'writeRegulationMark',
        'let _tdxConflicts = null, _tdxWarned = false;\n' + src + '\nreturn tcgdexPriceFor;')(
        null, { parsePricing: tdxp.parsePricing, tcgplayerByEdition: tdxp.tcgplayerByEdition, printingsFromTcgdex: tdxp.printingsFromTcgdex, loadProductConflicts: async () => conflicts || { ready: true, tcgplayer: new Set() } },
        async () => {}, 0, 'https://tcgdex.test', fakeFetch, async () => {}, { log() {} }, require('./cardid').tcgdexLocalId,
        async (card, ill) => { ARTISTS.push(ill === undefined ? '(undefined)' : ill); }, async () => {});
      // A bare null (the old function) must count as failures, not crash.
      try { return (await f({ api_card_id: 'en-neo1-9', set_api_id: 'neo1', number: '9' })) || { bare: null }; }
      catch (e) { return { threw: e.message }; }
    };
    const lugia = { status: 200, body: { name: 'Lugia', pricing: { tcgplayer: {
      '1st-edition-holofoil': { marketPrice: 164.8, productId: 11 }, 'unlimited-holofoil': { marketPrice: 531.39, productId: 12 } } } } };
    let r = await run([lugia]);
    ok(r.price === 531.39 && /unlimited-holofoil/.test(r.source), 'priced: the Unlimited figure (' + JSON.stringify(r && r.price) + ')');
    // 2026-10-02: the 1st Edition figure in the same response is carried out
    // beside the headline (it was dropped, and nothing else wrote one).
    ok(r.firstEdition && r.firstEdition.price === 164.8 && /1st-edition-holofoil/.test(r.firstEdition.source)
       && r.firstEdition.meta.role === 'edition', 'the 1st Edition figure rides beside it, as its own row (' + JSON.stringify(r && r.firstEdition && r.firstEdition.price) + ')');
    r = await run([{ status: 404, body: {} }]);
    ok(r.price === null && r.none === 'not-on-tcgdex', '404 -> not-on-tcgdex: ' + JSON.stringify(r));
    r = await run([{ status: 200, body: { name: 'Sprigatito', pricing: { tcgplayer: null, cardmarket: {} } } }]);
    ok(r.price === null && r.none === 'no-tcgplayer', 'tcgplayer: null -> no-tcgplayer: ' + JSON.stringify(r));
    r = await run([lugia], { ready: true, tcgplayer: new Set(['12']) });
    ok(r.price === null && r.none === 'shared', 'a product given to two cards -> shared: ' + JSON.stringify(r));
    r = await run([{ status: 503, body: {} }, { status: 503, body: {} }, 'throw']);
    ok(r.price === null && r.none === 'unreachable', 'three failures -> unreachable, not a bare null: ' + JSON.stringify(r));
    r = await run([{ status: 503, body: {} }, lugia]);
    ok(r.price === 531.39, 'a transient failure is retried before giving up');
    r = await run([lugia], { ready: false });
    ok(r.price === null && r.none === 'not-ready', 'no harvest yet -> not-ready');

    // ── 3. structure ──
    const spf = slice(I, 'async function safePriceFor(');
    ok(/TCGDEX_FALLBACK_OK\.has\(td\.none\)/.test(spf), 'safePriceFor falls back only on TCGDEX_FALLBACK_OK');
    ok(spf.indexOf('tcgdexPriceFor(card)') < spf.indexOf('tcgPlayerSearch(card.name, card.set_name'),
       'safePriceFor asks TCGdex before the internal search');
    const pc = slice(I, 'async function priceCheck(');
    ok(/tdxp\.tcgplayerByEdition\(/.test(pc), 'pricecheck reads TCGdex by edition');
    ok(/editionOfSql\('p'\)\} = '1st-edition'/.test(pc), "pricecheck reads OUR 1st Edition row separately");
    ok(pc.length > 1000 && !/tcgPlayerSearch\(/.test(pc), 'pricecheck never asks the internal search');
    ok(/NOT CHECKABLE/.test(pc), 'pricecheck SAYS a no-TCGdex card is not checkable rather than skipping it');
    // The fallback's rows are labelled, and Cardmarket is a second reading.
    ok(/via: 'tcgplayer-internal-search'/.test(spf), 'internal-search rows carry source_meta.via');
    ok(/role: 'second-reading'/.test(spf) && /fx\.toUsd\(td\.cardmarket\.price/.test(spf),
       "TCGdex's Cardmarket price, converted by fx.js, is stored as a second reading");
    ok((I.match(/await writeSecondReading\(card, res\);/g) || []).length === 2, 'both writers (safeprices, refresh) write the second reading');
    const ps = require('./printsql.js');
    ok(/source_meta->>'role'/.test(ps.basePrintingSql('ph', 'c')) && /second-reading/.test(ps.basePrintingSql('ph', 'c')),
       'every headline reader excludes second readings (printsql.basePrintingSql)');
    ok((I.match(/mp-search-api\.tcgplayer\.com/g) || []).length === 1, 'the internal search URL appears once (tcgPlayerSearch)');
    ok(!/async function (scrapeEbaySold|scrapeTcgPlayer|scrapePrices)\b/.test(I), 'the scrape functions stay deleted');
    ok(!/LH_Sold/.test(I), "no eBay sold-page URL in ingest.js");
    ok(/cmd === 'scrape'\)\s*\{\s*console\.log\('  scrape was DELETED/.test(I), '`node ingest.js scrape` refuses rather than running');
  }
  // ── --db: a NEWER second reading does not become the headline ──
  // Inside a transaction that is always rolled back: insert a Cardmarket
  // second reading dated now for a real card, run the headline pick, compare.
  if (process.argv.includes('--db') && process.env.DATABASE_URL) {
    const ps = require('./printsql.js');
    const c = require('./schemaguard').testClient();   // refuses schema changes
    await c.connect();
    const head = id => c.query(`SELECT ph.price_usd::float p, ph.source FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
      WHERE ph.card_api_id = $1 AND ph.grade IS NULL AND ph.source NOT LIKE 'estimate%' AND ph.price_usd > 0
        AND ${ps.basePrintingSql('ph', 'c')} ORDER BY ph.recorded_at DESC LIMIT 1`, [id]).then(r => r.rows[0]);
    try {
      await c.query('BEGIN');
      const id = 'en-svp-085';
      const before = await head(id);
      await c.query(`INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta, recorded_at)
        VALUES ($1, 99999, 'tcgdex_cardmarket', 'cardmarket', 'raw_nm', $2, NOW() + interval '1 day')`,
        [id, JSON.stringify({ role: 'second-reading' })]);
      const after = await head(id);
      ok(before && after && before.p === after.p && after.source !== 'tcgdex_cardmarket',
         `--db: a newer second reading leaves ${id}'s headline at $${before && before.p} (got $${after && after.p} ${after && after.source})`);
      await c.query(`INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, recorded_at)
        VALUES ($1, 88888, 'tcgdex_cardmarket', 'cardmarket', 'raw_nm', NOW() + interval '2 day')`, [id]);
      const unlabelled = await head(id);
      ok(unlabelled && unlabelled.p === 88888, '--db: the same row WITHOUT the label would have become the headline (the rule is what holds it)');
    } finally { await c.query('ROLLBACK'); await c.end(); }
  } else console.log('  (--db not given: the headline check against the database did not run)');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
