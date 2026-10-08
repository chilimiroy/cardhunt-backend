// pricequality.test.js — an old, thin or unsettled headline SAYS so, on every
// screen that shows it (T1, 2026-10-02).
//
//   node pricequality.test.js         offline: the rule both ways, the page's real
//                                      renderer, every reader wired
//   node pricequality.test.js --db    + annotate() against Supabase on cards measured
//                                      2026-10-02 (Torchic ☆ unsettled, Rayquaza ☆ old)
//
// Measured that day: 130 of 1,148 cards over $100 held a price that was not
// current and measured — 113 Yuyu-tei asks from one 28 Aug run, 10 English
// rows 66-67 days old, 7 alternating (Torchic ☆ 4500/1200/4500/1200/4500).
'use strict';
const fs = require('fs');
const pq = require('./pricequality');
const DB = process.argv.includes('--db');
let pass = 0, fail = 0;
const ok = (c, label, d) => { if (c) pass++; else { fail++; console.log('  FAIL ' + label + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } };
const DAY = 86400000, NOW = Date.parse('2026-10-02T12:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();
const C = o => pq.classify(Object.assign({ now: NOW }, o));

console.log('\n  the rule — what it KEEPS as current');
{
  const cur = C({ price: 78.35, source: 'tcgdex_tcgplayer_holofoil', recordedAt: ago(1), series: [77.9, 78.1, 78.35] });
  ok(cur.kind === 'measured' && cur.flags.length === 0 && cur.label === 'current', 'a fresh, steady TCGdex price carries no flag', cur);
  ok(C({ price: 5, source: 'tcgplayer_market', recordedAt: ago(30) + '' }).flags.length === 0, '30 days is not yet old (the card page\'s own edge)');
  ok(C({ price: 3, source: 'yahoojp_3', recordedAt: ago(1) }).flags.length === 0, 'a Yahoo median of 3 items is not thin');
  ok(C({ price: 3, source: 'tcgplayer_market', recordedAt: ago(1), meta: { listings: 4 } }).flags.length === 0, 'internal search with 4 listings is not thin');
  ok(C({ price: 3, source: 'tcgplayer_market', recordedAt: ago(1), meta: { via: 'tcgplayer-internal-search' } }).listings === null,
     'no listing count recorded: nothing claimed (rows before 0b0ddfb)');
  ok(C({ price: 20, source: 'tcgplayer_market', recordedAt: ago(1), series: [10, 20, 20, 20] }).flags.length === 0,
     'ONE big move is a move, not unsettled');
  ok(C({ price: 10.4, source: 'tcgplayer_market', recordedAt: ago(1), series: [10, 12, 10.5, 13, 10.4] }).flags.length === 0,
     'wobble under 1.5x is not unsettled');
  ok(C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), series: null }).flags.length === 0,
     'no series (lookup failed): nothing claimed about settledness');
}

console.log('\n  the rule — what it FLAGS');
{
  const torchic = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), series: [4500, 1200, 4500, 1200, 4500] });
  ok(torchic.flags.includes('unsettled') && torchic.range[0] === 1200 && torchic.range[1] === 4500, 'Torchic ☆ 4500/1200 nightly is unsettled, with its range', torchic);
  ok(/1200\.00/.test(torchic.title) && /4500\.00/.test(torchic.title), '...and the reason names both figures', torchic.title);
  const ray = C({ price: 2500.99, source: 'tcgplayer_normal', recordedAt: ago(67) });
  ok(ray.flags.includes('old') && ray.ageDays === 67, 'Rayquaza ☆ 67 days old is old', ray);
  ok(C({ price: 2, source: 'yahoojp_2', recordedAt: ago(1) }).flags.includes('thin'), 'a Yahoo median of 2 items is thin');
  ok(C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), meta: { listings: 0 } }).flags.includes('thin'),
     'a TCGplayer "market" on 0 listings is thin');
  const est = C({ price: 0.66, source: 'estimate', recordedAt: ago(1) });
  ok(est.kind === 'estimate' && est.flags[0] === 'estimate', 'an estimate is an estimate', est);
  ok(C({ price: 0, source: 'tcgplayer_market', recordedAt: ago(1) }).kind === 'none'
     && C({ price: null, source: null }).kind === 'none', 'no price: none');
  const both = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(40), series: [4500, 1200, 4500] });
  ok(both.flags.join() === 'old,unsettled', 'old AND unsettled both said', both.flags);
}

console.log('\n  one definition — the page\'s 30 days IS pricequality.STALE_DAYS');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');
{
  const i = H.indexOf('function priceAgeHtml('), body = H.slice(i, H.indexOf('\n}\n', i));
  const m = /days > (\d+)/.exec(body);
  ok(m && Number(m[1]) === pq.STALE_DAYS, 'priceAgeHtml\'s threshold equals STALE_DAYS', m && m[1]);
}

console.log('\n  the page draws the server\'s answer — the REAL priceMarksHtml');
let marks = null;
{
  const i = H.indexOf('function priceMarksHtml('), j = H.indexOf('\n}\n', i);
  ok(i > 0, 'priceMarksHtml is defined in the page');
  try {
    marks = new Function(H.slice(H.indexOf('function liveEsc('), H.indexOf('}); }', H.indexOf('function liveEsc(')) + 5)
      + '\n' + H.slice(i, j + 2) + '\nreturn priceMarksHtml;')();
  } catch (e) { ok(false, 'priceMarksHtml + liveEsc compile', e.message); }
}
if (marks) {
  const qT = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(40), series: [4500, 1200, 4500] });
  const tile = marks(true, qT);
  ok(/>old</.test(tile) && />unsettled</.test(tile), 'a tile shows old and unsettled', tile);
  ok(/1200\.00/.test(tile), '...with the reason in its title');
  ok(marks(true, C({ price: 78, source: 'tcgdex_tcgplayer_holofoil', recordedAt: ago(1) })) === '', 'a current price draws nothing (KEEP)');
  ok(marks(true, null) === '' && marks(true, undefined) === '', 'no quality held (old cached payload): nothing claimed');
  ok(/>est</.test(marks(false, null)) && !/unsettled|old/.test(marks(false, qT)), 'an estimate says est, and only est');
  const page = marks(true, qT, { skip: ['old'], text: true });
  ok(!/>old</.test(page) && /unsettled: /.test(page), 'card page: old left to the date line, unsettled spelled out', page);
  ok(!/<script/i.test(marks(true, { flags: ['old'], title: '<script>x</script>' })), 'the reason is escaped');
}

console.log('\n  every screen that shows a headline is wired');
{
  const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
  const sets = S.slice(S.indexOf("app.get('/api/sets/:setId/cards'"), S.indexOf("const realCount = cards.filter"));
  ok(/pricequality\.annotate\(db/.test(sets) && /_priceQuality = pq\.get/.test(sets), '/api/sets/:id/cards — every tile annotated');
  ok(/lp\.source_meta AS price_meta/.test(sets) && /meta: r\.price_meta/.test(sets), '...with source_meta (listing counts)');
  const card = S.slice(S.indexOf("app.get('/api/cards/:cardId'"), S.indexOf("// ── Not one of ours"));
  ok(/pricequality\.annotate\(db/.test(card) && /_priceQuality: pq\.get\(c\.api_card_id\)/.test(card), '/api/cards/:id (card page, alerts, latest searches)');
  const tr = S.slice(S.indexOf('async function trendingBody('), S.indexOf('// ── SEARCH'));   // the shared body (T6, 2026-10-08)
  ok(/pricequality\.annotate\(db/.test(tr) && /priceQuality: pq\.get\(c\.id\)/.test(tr), '/api/trending (both trending grids)');
  const T = fs.readFileSync(__dirname + '/trending.js', 'utf8');
  ok((T.match(/AS price_meta/g) || []).length === 2, 'trending.js selects source_meta for price and mover sorts');
  // The page: est is drawn in one place; every tile renderer goes through it.
  const code = H.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  // Two est markers, and only two: the helper's, and the card page's large
  // headline one (cd-mkt, 11px). Any third is a tile drawing est on its own.
  const estAt = []; code.replace(/>est<\/span>/g, (m, off) => { estAt.push(off); return m; });
  const inFn = (off, name) => { const i = code.lastIndexOf('function ', off); return code.slice(i, i + 9 + name.length + 1) === 'function ' + name + '('; };
  ok(estAt.length === 2 && estAt.some(o => inFn(o, 'priceMarksHtml')) && estAt.some(o => inFn(o, 'updatePrices')),
     'est is drawn only by priceMarksHtml and the card page headline', estAt.length);
  const calls = (code.match(/priceMarksHtml\(/g) || []).length;
  ok(calls === 7, 'priceMarksHtml: one definition + set tile, card page, cardTile, cardSummaryTile, latest searches, alerts bar', calls);
  ok(/estMark = priceMarksHtml\(isReal, c\._priceQuality\)/.test(code), 'set tile passes the card\'s quality');
  ok(/priceMarksHtml\(true, cc\._priceQuality, \{ skip: \['old'\], text: true \}\)/.test(code), 'card page badge passes it');
  ok(/out\.quality = d\._priceQuality/.test(code), 'cardSummary keeps it (alerts, latest searches)');
  // The search page's trending is catalogue since T6 (2026-10-08): no price, so no mark to keep.
  ok(/quality: c\.priceQuality/.test(code), 'the Pokémon trending grid keeps it');
  ok(!/_priceQuality: c\.priceQuality/.test(code) && /noPrice: true/.test(code), 'the search page\'s trending draws no price at all (catalogue tiles)');
}

(async () => {
  if (DB) {
    console.log('\n  --db: annotate() on real rows (measured 2026-10-02)');
    const db = require('./schemaguard').testClient();   // refuses schema changes
    await db.connect();
    try {
      const printsql = require('./printsql');
      const ids = ['en-ex7-108', 'en-ex8-107', 'en-sv03.5-199'];
      const r = await db.query(`
        SELECT c.api_card_id id, lp.price_usd, lp.source, lp.recorded_at, lp.source_meta
        FROM cards c LEFT JOIN LATERAL (
          SELECT price_usd, source, recorded_at, source_meta FROM price_history ph
          WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL AND ${printsql.basePrintingSql('ph', 'c')}
          ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC LIMIT 1) lp ON TRUE
        WHERE c.api_card_id = ANY($1)`, [ids]);
      const q = await pq.annotate(db, r.rows.map(x => ({ id: x.id, price: x.price_usd, source: x.source, recordedAt: x.recorded_at, meta: x.source_meta })));
      const g = id => q.get(id) || {};
      ok((g('en-ex7-108').flags || []).includes('unsettled'), 'Torchic ☆ (en-ex7-108) is unsettled from its own rows', g('en-ex7-108'));
      ok((g('en-ex8-107').flags || []).includes('old'), 'Rayquaza ☆ (en-ex8-107) is old', g('en-ex8-107'));
      ok(g('en-sv03.5-199').kind === 'measured' && !(g('en-sv03.5-199').flags || []).length, 'Charizard ex 199 is current (KEEP)', g('en-sv03.5-199'));
    } finally { await db.end(); }
  }
  console.log(`\n  pricequality.test.js — ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
