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
require('./testcount')(69);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const pq = require('./pricequality'), PQ = pq, vm = require('vm');
const DB = process.argv.includes('--db');
let pass = 0, fail = 0;
const ok = (c, label, d) => { if (c) pass++; else { fail++; console.log('  FAIL ' + label + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } };
const DAY = 86400000, NOW = Date.parse('2026-10-02T12:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();
const C = o => pq.classify(Object.assign({ now: NOW }, o));

console.log('\n  the rule — what it KEEPS as current');
{
  const cur = C({ price: 78.35, source: 'tcgdex_tcgplayer_holofoil', recordedAt: ago(1), meta: { productId: 1 }, series: [77.9, 78.1, 78.35] });
  ok(cur.kind === 'measured' && cur.flags.length === 0 && cur.label === 'current', 'a fresh, steady TCGdex price carries no flag', cur);
  ok(C({ price: 5, source: 'tcgplayer_market', recordedAt: ago(45) + '' , meta: { matchedBy: 'number', productId: 1 }}).flags.length === 0, '45 days is not yet old (the marker\'s edge; 30 until 2026-10-10)');
  ok(C({ price: 3, source: 'yahoojp_3', recordedAt: ago(1) }).flags.length === 0, 'a Yahoo median of 3 items is not thin');
  ok(C({ price: 3, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1, listings: 4 } }).flags.length === 0, 'internal search with 4 listings is not thin');
  ok(C({ price: 3, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1, via: 'tcgplayer-internal-search' } }).listings === null,
     'no listing count recorded: nothing claimed (rows before 0b0ddfb)');
  ok(C({ price: 20, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1 }, series: [10, 20, 20, 20] }).flags.length === 0,
     'ONE big move is a move, not unsettled');
  ok(C({ price: 10.4, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1 }, series: [10, 12, 10.5, 13, 10.4] }).flags.length === 0,
     'wobble under 1.5x is not unsettled');
  ok(C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1 }, series: null }).flags.length === 0,
     'no series (lookup failed): nothing claimed about settledness');
}

console.log('\n  the rule — what it FLAGS');
{
  const torchic = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1 }, series: [4500, 1200, 4500, 1200, 4500] });
  ok(torchic.flags.includes('unsettled') && torchic.range[0] === 1200 && torchic.range[1] === 4500, 'Torchic ☆ 4500/1200 nightly is unsettled, with its range', torchic);
  ok(/1200\.00/.test(torchic.title) && /4500\.00/.test(torchic.title), '...and the reason names both figures', torchic.title);
  const ray = C({ price: 2500.99, source: 'tcgplayer_normal', recordedAt: ago(67) });
  ok(ray.flags.includes('old') && ray.ageDays === 67, 'Rayquaza ☆ 67 days old is old', ray);
  ok(C({ price: 2, source: 'yahoojp_2', recordedAt: ago(1) }).flags.includes('thin'), 'a Yahoo median of 2 items is thin');
  ok(C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(1), meta: { matchedBy: 'number', productId: 1, listings: 0 } }).flags.includes('thin'),
     'a TCGplayer "market" on 0 listings is thin');
  const est = C({ price: 0.66, source: 'estimate', recordedAt: ago(1) });
  ok(est.kind === 'none' && est.flags.length === 0, 'an estimate is no price (Roy, 2026-10-09)', est);
  ok(C({ price: 0, source: 'tcgplayer_market', recordedAt: ago(1) , meta: { matchedBy: 'number', productId: 1 }}).kind === 'none'
     && C({ price: null, source: null }).kind === 'none', 'no price: none');
  const both = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(50), meta: { matchedBy: 'number', productId: 1 }, series: [4500, 1200, 4500] });
  ok(both.flags.join() === 'old,unsettled,marked', 'old AND unsettled both said, and old marks it', both.flags);
}

console.log('\n  one definition — the page\'s 30 days IS pricequality.STALE_DAYS');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');
{
  const i = H.indexOf('function priceAgeHtml('), body = H.slice(i, H.indexOf('\n}\n', i));
  const m = /days > (\d+)/.exec(body);
  ok(m && Number(m[1]) === pq.STALE_DAYS, 'priceAgeHtml\'s threshold equals STALE_DAYS', m && m[1]);
}

console.log('\n  whose figure it is (Roy, 2026-10-09)');
const fnSrc = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}\n', i) + 2); };
{
  const eu = C({ price: 257.5, source: 'cardmarket_avg', recordedAt: ago(67) });
  ok(eu.flags.join() === 'eu,old,marked' && /Cardmarket \(EU\) average sell price, read from pokemontcg\.io, recorded 2026-07-27/.test(eu.title)
     && /European retail figure/.test(eu.title) && /67 days ago/.test(eu.title), 'a July cardmarket_avg row says Cardmarket (EU), via pokemontcg.io, and its date and age', eu);
  const us = C({ price: 60.86, source: 'tcgplayer_holofoil', recordedAt: ago(67) });
  ok(us.flags[0] === 'pokemontcg' && /^TCGplayer \(US\) market price, read from pokemontcg\.io/.test(us.title), 'a July pokemontcg.io TCGplayer row says so', us);
  ok(C({ price: 9, source: 'tcgdex_cardmarket', recordedAt: ago(1) }).flags.join() === 'eu', 'TCGdex\'s Cardmarket row is EU too');
  ok(pq.originOf('tcgplayer_market', { matchedBy: 'number' }) === null && pq.originOf('tcgdex_tcgplayer_holofoil') === null && pq.originOf('estimate') === null,
     'KEEP: TCGplayer\'s US market as TCGdex or our search measured it carries no origin mark');
  const n = pq.NOTES['en-ecard3-H10'];
  ok(/\$198\.07/.test(n) && /\$1,249\.94/.test(n) && /cannot currently tell which is right/.test(n), 'Skyridge Gyarados H10: what we showed, what pokemontcg.io says, and that we cannot tell', n);
  // getBase says where its number came from — a pokemontcg.io figure is not an estimate.
  const gb = new Function('pricesOpen', 'mockP', fnSrc('getBase') + '\nreturn getBase;')(() => true, () => 0.3);
  const o1 = {}, o2 = {}, o3 = {};
  gb({ id: 'en-ecard3-H10', tcgplayer: { updatedAt: '2026/06/29', prices: { holofoil: { market: 1249.94 } } } }, o1);
  gb({ id: 'x', cardmarket: { updatedAt: '2026/07/27', prices: { averageSellPrice: 9 } } }, o2);
  gb({ id: 'y' }, o3);
  ok(o1.origin && o1.origin.kind === 'pokemontcg.io' && o1.origin.market === 'TCGplayer (US)' && o1.origin.date === '2026/06/29'
     && o2.origin.market === 'Cardmarket (EU)' && o3.origin.kind === 'none', 'getBase reports a pokemontcg.io figure as one, and nothing else as no price', [o1, o2, o3]);
}

console.log('\n  the page draws the server\'s answer — the REAL priceMarksHtml');
let marks = null;
{
  const i = H.indexOf('function priceMarksHtml('), j = H.indexOf('\n}\n', i);
  ok(i > 0, 'priceMarksHtml is defined in the page');
  try {
    marks = new Function(H.slice(H.indexOf('function liveEsc('), H.indexOf('}); }', H.indexOf('function liveEsc(')) + 5)
      + '\n' + fnSrc('thirdPartyOriginText') + '\n' + H.slice(i, j + 2) + '\nreturn priceMarksHtml;')();
  } catch (e) { ok(false, 'priceMarksHtml + liveEsc compile', e.message); }
}
if (marks) {
  const qT = C({ price: 4500, source: 'tcgplayer_market', recordedAt: ago(50), meta: { matchedBy: 'number', productId: 1 }, series: [4500, 1200, 4500] });
  const tile = marks(true, qT);
  ok(/&#9719;<\/span>/.test(tile) && /may be out of date: recorded 50 days ago/.test(tile) && />unsettled</.test(tile) && !/>old</.test(tile),
     'a tile shows the marker (old, with its reason) and unsettled; the old word is the marker\'s now', tile);
  ok(/1200\.00/.test(tile), '...with the reason in its title');
  ok(marks(true, C({ price: 78, source: 'tcgdex_tcgplayer_holofoil', recordedAt: ago(1), meta: { productId: 1 } })) === '', 'a current price draws nothing (KEEP)');
  ok(marks(true, null) === '' && marks(true, undefined) === '', 'no quality held (old cached payload): nothing claimed');
  ok(marks(false, null) === '' && marks(false, qT) === '', 'no price draws no mark at all — never est (Roy, 2026-10-09)');
  const page = marks(true, qT, { skip: ['old'], text: true });
  ok(!/>old</.test(page) && /unsettled: /.test(page), 'card page: old left to the date line, unsettled spelled out', page);
  ok(!/<script/i.test(marks(true, { flags: ['old'], title: '<script>x</script>' })), 'the reason is escaped');
  const third = marks(false, null, { origin: { kind: 'pokemontcg.io', market: 'TCGplayer (US)', what: 'market price', date: '2026/06/29' } });
  ok(/>pokemontcg\.io</.test(third) && !/>est</.test(third) && /TCGplayer \(US\) market price, from pokemontcg\.io, dated/.test(third) && /not measured by us/.test(third),
     'a pokemontcg.io figure is marked pokemontcg.io with its date — never est', third);
  const unl = C({ price: 3.38, source: 'tcgplayer_market', recordedAt: ago(13), meta: null });
  ok(unl.flags.join() === 'unchecked,marked' && /recorded 2026-09-19 \(13 days ago\)/.test(unl.title) && /was not recorded/.test(unl.title) && /asked again first/.test(unl.title),
     'a search row from before 2 October (no match label) says its age, that its product was not recorded, and that it is re-asked', unl);
  const IS = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
  ok(/const relabel = r\.held_source === 'tcgplayer_market' && !\(r\.held_meta && r\.held_meta\.matchedBy\) && !relabelAsked\[r\.api_card_id\]/.test(IS)
     && /urgency: relabel \? 1e6 \+ \(parseFloat\(r\.price_usd\) \|\| 0\)/.test(IS) && /relabelAsked\[card\.api_card_id\] = /.test(IS),
     'the nightly asks these first, dearest first, whatever their tier — once each (ingest-progress-relabel-<lang>.json)');
  const unlTile = marks(true, unl);
  ok(/&#9719;<\/span>/.test(unlTile) && /which TCGplayer product it priced was not recorded/.test(unlTile) && /Source: TCGplayer, our search, 2026-09-19/.test(unlTile),
     'on a tile it is the marker: product not recorded, the source and the date on hover', unlTile);
  const unlOld = C({ price: 3.38, source: 'tcgplayer_market', recordedAt: ago(50), meta: null });
  ok(unlOld.flags.join() === 'unchecked,old,marked' && /\(50 days ago\)/.test(unlOld.title) && unlOld.marked.reasons.join() === 'old,product',
     '...and past 45 days it is old as well, both reasons on the marker');
  const euTile = marks(true, C({ price: 257.5, source: 'cardmarket_avg', recordedAt: ago(67) }));
  ok(/>EU</.test(euTile) && /Cardmarket \(EU\)/.test(euTile), 'a Cardmarket headline is marked EU on a tile', euTile);
  ok(/>disputed</.test(marks(false, { kind: 'none', flags: [], note: 'We showed $198.07' })), 'a reviewed note is marked on a tile');
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
  ok(!/>est</.test(code), 'the page draws est nowhere (Roy, 2026-10-09)');
  const np = (code.match(/noPriceHtml\(/g) || []).length;
  ok(np === 5 && /no price recorded/.test(code) && /price withheld/.test(code), 'no price says so in words, through one function: definition, set tile, cardTile, card page twice', np);
  const calls = (code.match(/priceMarksHtml\(/g) || []).length;
  ok(calls === 7, 'priceMarksHtml: one definition + set tile, card page, cardTile, cardSummaryTile, latest searches, alerts bar', calls);
  ok(/estMark = priceMarksHtml\(isReal, c\._priceQuality, \{ origin: from\.origin, source: c\._priceSource \}\)/.test(code), 'set tile passes the card\'s quality, where its number came from, and its source (a live _low ask)');
  ok(/thirdPartyOriginText\(from\.origin\)/.test(code.slice(code.indexOf('function updatePrices('))) && /q\.note/.test(code.slice(code.indexOf('function updatePrices('))),
     'the card page spells out a pokemontcg.io figure and a reviewed note');
  ok(/priceMarksHtml\(true, cc\._priceQuality, \{ skip: ask \? \['old', 'ask'\] : \['old'\], text: true \}\)/.test(code)
     && /\(ask \? '' : priceAgeHtml\(cc\._priceDate\)\)/.test(code), 'card page badge passes it (an ask: no second date, no repeated ask line)');
  // An ask has no place among sales (2026-10-10): Charizard ☆ δ's position box said
  // "Recorded low: $4000.00 … Near its recorded high" beside its $18,500 floor.
  const vb = code.slice(code.indexOf('function updateValueBar('), code.indexOf('// ── DOM INIT'));
  ok(/if \(card && askOfCard\(card\) && !card\.priceHeld\) \{/.test(vb) && vb.indexOf('askOfCard(card)') < vb.indexOf('var pts = s ?'),
     'the price-position box draws no low, high or position for an asking price');
  const SV = fs.readFileSync(__dirname + '/server.js', 'utf8');
  const hs = SV.slice(SV.indexOf("app.get('/api/history/:cardId'"), SV.indexOf('// LIVE LISTINGS'));
  ok(/AS basis,/.test(hs) && /GROUP BY 1, 2, 3, 4, 5/.test(hs) && /basis: r\.basis === 'ask' \? 'ask' : 'market'/.test(hs)
     && /var wantBasis = askOfCard\(card\) \? 'ask' : 'market';/.test(code),
     'the chart: an asking price is its own series, never joined to a line of sales; the page picks the series of its headline\'s kind');
  ok(/out\.quality = d\._priceQuality/.test(code), 'cardSummary keeps it (alerts, latest searches)');
  // The search page's trending is catalogue since T6 (2026-10-08): no price, so no mark to keep.
  ok(/quality: c\.priceQuality/.test(code), 'the Pokémon trending grid keeps it');
  ok(!/_priceQuality: c\.priceQuality/.test(code) && /noPrice: true/.test(code), 'the search page\'s trending draws no price at all (catalogue tiles)');
}

console.log('\n  an asking price: listings but no market price (Roy, 2026-10-10)');
{
  // Charizard ☆ δ as TCGplayer answered on 2026-10-09: product 84198, no marketPrice, lowestPrice 18,500.
  const c = PQ.classify({ price: 18500, source: 'tcgplayer_market', recordedAt: '2026-10-09T22:30:00Z',
    meta: { basis: 'ask', matchedBy: 'number', productId: 84198, listings: 5 } });
  ok(c.flags[0] === 'ask' && c.ask && c.ask.text === 'Cheapest listed: $18,500 · TCGplayer, 9 Oct'
     && c.ask.why === 'No recent sales, so no market price is available.', 'an ask row says "Cheapest listed: $18,500 · TCGplayer, 9 Oct" and why', c.ask);
  ok(/an asking price, not a market value/.test(c.title), '...and its title says it is an asking price, not a market value');
  const tdx = PQ.classify({ price: 4, source: 'tcgdex_tcgplayer_normal', recordedAt: '2026-10-08T03:00:00Z',
    meta: { basis: 'ask', productId: 1, updated: '2026-10-07T10:00:00Z' } });
  ok(tdx.ask && tdx.ask.date === '2026-10-07', 'a TCGdex ask is dated by TCGdex\'s own update, not when we stored it');
  ok(PQ.isAsk('tcgplayer_holofoil_low', null) && !PQ.isAsk('tcgplayer_holofoil', null) && !PQ.isAsk('tcgplayer_holofoil_mid', null),
    'pokemontcg.io rows (no source_meta): the `_low` name is an ask; a market row is not');
  const mk = PQ.classify({ price: 204.41, source: 'tcgdex_tcgplayer_holofoil', recordedAt: new Date().toISOString(), meta: { basis: 'market', productId: 2 } });
  ok(!mk.ask && !mk.flags.includes('ask'), 'KEEP: a market price is not an ask');
  const I = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
  const tps = I.slice(I.indexOf('async function tcgPlayerSearch'), I.indexOf('// ── 2. (Cardmarket'));
  ok(/opts\.askOnly\s*\? !\(h\.marketPrice > 0\) && h\.lowestPrice > 0/.test(tps) && /basis: 'ask'/.test(tps),
    'our search: the ask pass takes only products with NO market price, at their lowest listing');
  ok(/res = await ask\(false\);\s*if \(!res\) res = await ask\(true\);/.test(I), '...and is asked only when the market pass found nothing');
  ok(/const memo = new Map\(\);/.test(I) && /let hits = opts\.memo \? opts\.memo\.get\(q\) : null;/.test(I) && !/TCG_SEARCH_MEMO/.test(I),
    '...reading the market pass\'s answers through a per-card memo (no module-level cache to leak one card\'s hits into another\'s)');
  ok(/basis: res\.basis/.test(I) && /basis: b\.basis/.test(I), 'both nightly writers record the basis (search, TCGdex)');
  ok(/t\[k\]\.low > 0\)\s+return \{ price: t\[k\]\.low,\s+source: 'tcgplayer_' \+ k \+ '_low'/.test(I) && !/t\[k\]\.mid > 0/.test(I),
    'pokemontcg.io reader: no market -> the floor as `_low`; the mid ask is never a price');
  // The page, run: the box label and line.
  const at = H.indexOf('function markValueLabel(grade, ask) {'), at2 = H.indexOf('function askOfCard(c) {');
  const els = { 'cd-mkt-lbl': { textContent: '' }, 'cd-mkt-note': { textContent: '' } };
  const ctx = { document: { getElementById: id => els[id] || null } };
  vm.createContext(ctx);
  vm.runInContext(H.slice(at, H.indexOf('\n}\n', at) + 2) + H.slice(at2, H.indexOf('\n}\n', at2) + 2), ctx);
  const a = ctx.askOfCard({ _price: 18500, _priceQuality: c });
  ok(a && a.amount === '$18,500' && a.market === 'TCGplayer' && a.day === '9 Oct', 'the page reads the ask: $18,500 · TCGplayer, 9 Oct', a);
  ctx.markValueLabel('Raw NM', a);
  ok(els['cd-mkt-lbl'].textContent === 'Asking price' && els['cd-mkt-note'].textContent === 'No recent sales, so no market price is available.',
    'the box is "Asking price", never "Market value", with why');
  ctx.markValueLabel('PSA 10', a);
  ok(els['cd-mkt-lbl'].textContent === 'Raw NM asking price' && /No graded price is recorded/.test(els['cd-mkt-note'].textContent), '...and under a grade, "Raw NM asking price"');
  ok(ctx.askOfCard({ _price: 204.41, _priceQuality: mk }) === null, 'KEEP: a market price is not drawn as an ask');
  ok(/: ask \? '<span[^']*>Cheapest listed:<\/span> '/.test(H), 'the card page draws "Cheapest listed:" for an ask');
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
