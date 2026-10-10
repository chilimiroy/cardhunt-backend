require('./testcount')(19);   // assertions in a plain run — fewer fails the file (testcount.js)
// marked.test.js — a MARKED price is shown and feeds nothing (Roy, 2026-10-10).
//
// "This price may be out of date" (printsql.markedSql, pricequality.markOf):
// older than 45 days, an asking price (listings, no market price), a
// TCGplayer row with no recorded product, or an English card none of whose
// recorded prices names a product. Such a price is drawn with the marker and
// must reach NONE of: the deals shelf and its job, alerts, biggest movers,
// trending risers, the trending price lists.
//
// What would be different if this were silently doing nothing: a consumer
// would rank, compare or alert on a marked headline. So each consumer is
// checked where it chooses its price — on the row it CHOSE, never a filter
// before choosing (which would fall back to an older, unmarked price) — and
// --db runs the real trending queries and finds no marked card in them.
//
//   node marked.test.js          node marked.test.js --db
'use strict';
const fs = require('fs');
const ps = require('./printsql'), pq = require('./pricequality'), T = require('./trending');
let pass = 0, fail = 0;
const ok = (c, label, d) => { if (c) { pass++; console.log('  ok    ' + label); } else { fail++; console.log('  FAIL  ' + label + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } };
const flat = s => String(s).replace(/\s+/g, ' ');

console.log('\n  the marker, one definition');
const M = ps.markedSql('ph');
ok(ps.MARK_DAYS === 45 && pq.STALE_DAYS === ps.MARK_DAYS && /make_interval\(days => 45\)/.test(M), 'older than 45 days marks (the "old" line is the same number)');
ok(/source_meta->>'basis', ''\) = 'ask'/.test(M) && /\^tcgplayer_\.\*_low\$/.test(M), 'an asking price marks (basis ask, or a pokemontcg.io _low row)');
ok(/tcgdex!_tcgplayer!_%/.test(M) && /productId' IS NULL/.test(M), 'a TCGplayer-sourced row with no recorded product marks');
ok(/card_api_id LIKE 'en-%' AND NOT EXISTS/.test(M) && /pk\.id NOT IN \(/.test(M), 'an English card with no unrefused row naming a product marks');
const D = Date.parse('2026-10-10T12:00:00Z'), ago = d => new Date(D - d * 864e5).toISOString();
const K = o => (pq.classify(Object.assign({ now: D, id: 'en-x-1', productHistory: true, meta: { productId: 1, matchedBy: 'number' } }, o)).marked || { reasons: [] }).reasons.join();
ok(K({ price: 5, source: 'tcgdex_tcgplayer_normal', recordedAt: ago(1) }) === ''
   && K({ price: 5, source: 'yahoojp_4', recordedAt: ago(44), id: 'ja-x-1', meta: null, productHistory: null }) === '',
   'KEEP: a current TCGdex price with its product, and a 44-day-old Yahoo median, are not marked');
ok(K({ price: 5, source: 'yuyutei_shop', recordedAt: ago(1), id: 'ja-x-1', meta: null, productHistory: null }) === 'ask'
   && /'yuyutei_shop'/.test(M),
   'a Yuyu-tei price is one shop\'s shelf price: an ask, marked, fed to nothing (Roy, 2026-10-10)');
ok(K({ price: 5, source: 'tcgdex_tcgplayer_normal', recordedAt: ago(46) }) === 'old'
   && K({ price: 18500, source: 'tcgplayer_market', recordedAt: ago(0), meta: { productId: 84198, basis: 'ask', matchedBy: 'number' } }) === 'ask'
   && K({ price: 4000, source: 'tcgplayer_market', recordedAt: ago(44), meta: null }) === 'product'
   && K({ price: 9, source: 'cardmarket_avg', recordedAt: ago(10), meta: null, productHistory: false }) === 'history',
   'the JS twin gives each reason: old / ask / product / history');
const q = pq.classify({ now: D, id: 'en-ex15-100', price: 4000, source: 'tcgplayer_market', recordedAt: ago(44), meta: null, productHistory: false });
ok(q.flags.includes('marked') && /may be out of date/.test(q.marked.text) && /Source: TCGplayer, our search, 2026-08-27/.test(q.marked.text),
   'a marked price carries the "marked" flag, and the marker says why, whose and when', q.marked);

console.log('\n  it feeds nothing — each consumer, on the price it chose');
const pSql = flat(T.priceSql(T.parseParams({})).text);
ok(pSql.includes('NOT ' + flat(ps.markedSql('l'))) && pSql.indexOf('NOT ' + flat(ps.markedSql('l'))) > pSql.indexOf('FROM latest l'),
   'trending price lists: the chosen headline (latest), if marked, ranks nowhere');
const mSql = flat(T.moverSql(T.parseParams({ sort: 'gain-pct' })).text);
ok(mSql.includes('curu AS (SELECT * FROM cur WHERE NOT ' + flat(ps.markedSql('cur')) + ')')
   && /JOIN curu cur ON cur\.card_api_id = ph\.card_api_id/.test(mSql) && /FROM curu cur JOIN prev USING/.test(mSql) && !/FROM cur JOIN prev/.test(mSql),
   'biggest movers and trending risers: a marked current price moves nothing (both joins read the unmarked set)');
ok(/prev AS \(.*COALESCE\(ph\.source_meta->>'basis', ''\) <> 'ask'/.test(mSql), '...and an ask is never the earlier end of a move');
const rank = T.rankMovers([{ id: 'a', prev_price: 10, price: 20, readings: 3 }, { id: 'b', prev_price: 10, price: 20, readings: 3 }], 'gain-pct', new Map([['a', q]]));
ok(rank.cards.length === 1 && rank.cards[0].id === 'b' && rank.excluded.flagged === 1, 'rankMovers drops a marked card by its flag, keeps the other', rank);
const S = flat(fs.readFileSync(__dirname + '/server.js', 'utf8'));
const dc = S.slice(S.indexOf('async function dealCandidates('), S.indexOf('const dealJob'));
ok(/SELECT DISTINCT ON \(ph\.card_api_id\) ph\.card_api_id, ph\.price_usd, ph\.source, ph\.recorded_at, ph\.source_meta/.test(dc)
   && /\) latest WHERE source ILIKE '%tcgplayer%' AND price_usd > 0 -- .* AND NOT \$\{printsql\.markedSql\('latest'\)\} ORDER BY/.test(dc),
   'the deals job: the chosen headline, if marked, is no candidate');
const dr = S.slice(S.indexOf('async function dealRefOf('), S.indexOf('// BEST DEALS'));
ok(/current: !!\(pq && pq\.kind === 'measured' && !pq\.flags\.length\)/.test(dr) && /const refUsable = ref => ref && ref\.isReal !== false && ref\.price > 0 && ref\.current;/.test(fs.readFileSync(__dirname + '/deals.js', 'utf8'))
   && !(q.kind === 'measured' && !q.flags.length),
   'the deals shelf and every pick: the reference must carry no flag, and a marked price always carries one');
const I = flat(fs.readFileSync(__dirname + '/ingest.js', 'utf8'));
const al = I.slice(I.indexOf('async function evaluateAlerts('), I.indexOf('async function rarityFill('));
ok(/CASE WHEN lp\.marked THEN NULL ELSE lp\.price_usd END AS market_price/.test(al)
   && /SELECT p\.price_usd, \$\{require\('\.\/printsql'\)\.markedSql\('p'\)\} AS marked FROM price_history p/.test(al)
   && /ORDER BY p\.recorded_at DESC LIMIT 1\) lp ON TRUE/.test(al),
   'alerts: the chosen headline, if marked, is no market price to alert on');
ok(!/\(SELECT price_usd FROM price_history p WHERE p\.card_api_id = a\.card_api_id/.test(al), '...and the old unmarked subquery is gone');
const mr = S.slice(S.indexOf('async function marketRefOf('), S.indexOf('async function judgeListings('));
ok(/current: !!\(pq && pq\.kind === 'measured' && !pq\.flags\.length\)/.test(mr), 'the listing check\'s market reference (outliers, sibling hide line) is not current when marked');

console.log('\n  shown, with the marker');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');
const pm = H.slice(H.indexOf('function priceMarksHtml('), H.indexOf('\n}\n', H.indexOf('function priceMarksHtml(')));
ok(/var marked = q\.marked && q\.marked\.text \? q\.marked : null;/.test(pm) && /&#9719;/.test(pm) && /aria-label="price may be out of date"/.test(pm),
   'the page draws ONE symbol for it, its reasons on hover (or beside it on the card page)');
ok(/days > 45\) return/.test(H.slice(H.indexOf('function priceAgeHtml('))), 'the card page\'s date line says "old" from 45 days, like the marker');

(async () => {
  if (process.argv.includes('--db')) {
    console.log('\n  --db: the real queries');
    const db = require('./schemaguard').testPool();
    const digital = require('./digital');
    try {
      const head = `SELECT c.api_card_id id FROM cards c JOIN LATERAL (SELECT * FROM price_history ph WHERE ph.card_api_id = c.api_card_id
        AND ph.grade IS NULL AND ph.price_usd > 0 AND ${ps.basePrintingSql('ph', 'c')} ORDER BY ph.recorded_at DESC LIMIT 1) lp ON TRUE`;
      const n = (await db.query(`SELECT COUNT(*)::int n FROM (${head} WHERE ${digital.visibleSql('c')} AND ${ps.markedSql('lp')}) x`)).rows[0].n;
      ok(n > 100, 'there ARE marked headlines for the consumers to refuse (else the next checks prove nothing)', n);
      for (const [name, sql] of [['price high to low', T.priceSql(T.parseParams({ sort: 'price-desc', limit: 60 }))],
                                 ['price low to high', T.priceSql(T.parseParams({ sort: 'price-asc', limit: 60 }))],
                                 ['movers 7d', T.moverSql(T.parseParams({ sort: 'gain-pct', window: '7d' }))],
                                 ['movers 30d', T.moverSql(T.parseParams({ sort: 'gain-pct', window: '30d' }))]]) {
        const ids = (await db.query(sql)).rows.map(r => r.id);
        const bad = (await db.query(`${head} WHERE c.api_card_id = ANY($1) AND ${ps.markedSql('lp')}`, [ids])).rows.map(r => r.id);
        ok(bad.length === 0, name + ': ' + ids.length + ' cards, none with a marked headline', bad.slice(0, 5));
      }
    } finally { await db.end(); }
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
