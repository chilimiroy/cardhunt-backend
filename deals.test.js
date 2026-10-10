// deals.test.js — Best deals (TASK T3, 2026-10-05; deals.js).
//
// The cheapest TRUSTED Buy It Now against a MEASURED price, both ends solid,
// from views opened in the last 15 minutes, with 0 eBay calls. Tested both
// ways: what it keeps as a deal, and every reason a row is not one.
//
//   node deals.test.js
'use strict';
require('./testcount')(108);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const deals = require('./deals.js');
let pass = 0, fail = 0;
const pendingTests = [];   // executed checks that are async; the summary waits for them
function ok(c, m) { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
console.log('\n  deals.test.js\n');

// The bars a row must clear before the vouching bar looks at it (deals.notADeal,
// read by deals.vouchFree). pickDeal, backCandidates and solidRows — the
// cached-view shelf's own picker — were DELETED 2026-10-08 with that shelf;
// what they tested about a ROW is tested here directly, both ways.
let _id = 0;
const row = (landed, o) => Object.assign({ source: 'ebay', live: true, saleType: 'buy-it-now', shippingKnown: true,
  landed, price: landed, suspect: null, priceKind: 'listing', itemId: 'v1|' + (++_id) + '|0',
  back: { state: 'genuine-back' } }, o || {});
const ref = { price: 100, isReal: true, current: true, source: 'tcgdex_tcgplayer_holofoil' };
const holoBase = deals.basePrintingOf({ listings: [], printings: [{ key: 'holo' }, { key: 'reverse' }] });
const no = (l, base) => deals.notADeal(l, base === undefined ? holoBase : base);

console.log('  what it keeps');
ok(no(row(70)) === null, 'a live Buy It Now, shipping stated, unflagged row clears');
ok(no(row(50, { sellerStated: true, sellerCondition: 'NM' })) === null, 'KEPT: a stated near-mint copy');
ok(no(row(50, { sellerStated: true, sellerCondition: 'M' })) === null, 'KEPT: a stated mint copy');
ok(no(row(50, { printingStated: true, printing: 'holo' })) === null, 'KEPT: the stated printing IS the priced one');
ok(no(row(50, { printingStated: false, printing: null })) === null, 'KEPT: a title that states no printing');
ok(no(row(50, { editionStated: true, editionKey: 'unlimited' })) === null, 'KEPT: a stated Unlimited');
ok(no(row(50, { stamp: { state: 'not-visible' } })) === null, 'KEPT: a photo checked and clear');
ok(no(row(50, { back: { state: 'genuine-back' } })) === null, 'KEPT: a genuine back seen');

console.log('\n  what it refuses, and says why');
ok(/flagged/.test(no(row(40, { suspect: 'implausible' }))), 'an outlier is skipped — a deal is the bottom of TRUST, not below it');
ok(/flagged/.test(no(row(30, { suspect: 'counterfeit-likely' }))), 'a row the novelty check flagged is skipped');
ok(no(row(50, { saleType: 'auction' })) !== null, 'an auction (a current bid) is never a deal');
ok(/shipping/.test(no(row(50, { shippingKnown: false }))), 'unknown shipping: the landed cost is not solid');
ok(/novelty/.test(no(row(50, { materialPending: true }))), 'a row still waiting for its novelty check is not offered');
ok(/ended/.test(no(row(50, { live: false }))), 'an ended listing is not a deal');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'DMG' }))), 'stated damage ("Damaged", "DMG/PEELING") is not a deal');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'MP' }))), 'stated MP is not a deal against a near-mint price');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'LP' }))), 'stated LP neither');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'reverse' }))), 'a stated reverse holo is not the holo price\'s deal');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'normal' }))), 'a stated "Non-Holo" is not the holo price\'s deal');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'holo' }),
     deals.basePrintingOf({ listings: [], printings: [{ key: 'normal' }, { key: 'holo' }] }))),
   'a card in normal AND holo: a stated printing cannot be shown to be the priced one');
ok(/another edition/.test(no(row(50, { editionStated: true, editionKey: '1st-edition' }))), 'a stated 1st Edition is not the unlimited price\'s deal');
ok(/photo not checked/.test(no(row(50, { stamp: { state: 'pending', kind: 'sibling' } }))), 'a photo still being compared is not a deal');
ok(/back check marked/.test(no(row(50, { back: { state: 'no-claim', metal: true } }))), 'a metal photo among the seller\'s is not a deal');
ok(/back check marked/.test(no(row(50, { back: { state: 'other-back' } }))), 'another language family\'s back is not a deal');

console.log('\n  the price end and the thresholds');
// The ONE threshold that stays on the DELIVERED price (Roy, 2026-10-08):
// a deal is what the buyer pays. The gates judge the item price (outlier.js).
ok(Math.abs(deals.discountOf(row(90, { price: 60 }), ref) - 0.10) < 1e-9, 'a $60 item + $30 shipping is 10% below, not 40%: the discount is on the DELIVERED price');
ok(/below the TCGplayer market price/.test(deals.vouchFree(row(90, { price: 60 }), { listings: [] }, ref).skip || ''), '...so it is skipped as under 15%');
ok(/below the/.test(deals.vouchFree(row(50), { listings: [] }, { price: 100, isReal: false, current: true }).skip || ''), 'an estimate is no price to beat');
ok(/below the/.test(deals.vouchFree(row(50), { listings: [] }, { price: 100, isReal: true, current: false }).skip || ''), 'an old / thin / unsettled price is no price to beat');
ok(deals.MIN_DISCOUNT === 0.15 && deals.MAX_DISCOUNT === 0.60 && deals.DEAL_BACK_MAX === 2, 'the thresholds are the stated ones');
ok(typeof deals.pickDeal === 'undefined' && typeof deals.backCandidates === 'undefined' && typeof deals.MIN_TRUSTED === 'undefined',
   'the cached-view picker is deleted, not left dormant');

console.log('\n  on (Roy, 2026-10-08), with its own supply');
ok(deals.ENABLED === true, 'deals.ENABLED is ON — on the vouching bar, approved accounts');
ok(/switched off/.test(deals.OFF_REASON), 'the off state still carries its reason, should it be switched off again');
ok(/genuine card/.test(deals.describeRule()) && /at most 2/.test(deals.describeRule()), 'the rule states the back and what it costs');

console.log('\n  the auction bars (T5b, 2026-10-10): what each keeps, and why it skips');
{
  const NOW = Date.parse('2026-10-10T00:00:00Z');
  const inH = h => new Date(NOW + h * 3600e3).toISOString();
  const auc = (bid, h, o) => row(bid, Object.assign({ saleType: 'auction', priceKind: 'current-bid', price: bid, shippingKnown: false,
    endsAt: inH(h), sellerStated: true, sellerCondition: 'NM', conditionSource: 'title', title: 'Umbreon VMAX 215/203 NM',
    sellerFeedback: { score: 500, percent: 99.5 }, stamp: undefined }, o || {}));
  const pay = rows => ({ cardId: 'en-x-1', listings: rows, stampGate: { applied: false }, materialCheck: { applied: true } });
  const fA = (l, bar) => deals.auctionFree(l, pay([l]), ref, bar, NOW);
  ok(!fA(auc(70, 30), 'auctions').skip, 'KEPT (best): a vouched auction, bid 30% below, 30 h left — shipping unstated does not matter for a bid');
  ok(!fA(auc(120, 10), 'ending').skip, 'KEPT (ending): 10 h left, whatever the bid');
  ok(!fA(auc(70, 100), 'auctions').skip && /more than 48/.test(fA(auc(70, 100), 'ending').skip || ''), '100 h left: a best auction, not an ending one');
  ok(/within 3 h/.test(fA(auc(70, 2), 'ending').skip || '') && /within 3 h/.test(fA(auc(70, 2), 'auctions').skip || ''),
     'under 3 h left: on neither bar — it could end before it is shown (route 1)');
  ok(/not an auction/.test(fA(row(70), 'ending').skip || ''), 'a Buy It Now is never an auction pick');
  ok(/not 15-60%/.test(fA(auc(95, 30), 'auctions').skip || '') && /not 15-60%/.test(fA(auc(20, 30), 'auctions').skip || ''),
     'best: a bid 5% below, or 80% below, is not a best auction');
  ok(/flagged/.test(fA(auc(70, 30, { suspect: 'implausible' }), 'ending').skip || ''), 'a flagged auction is on neither bar');
  ok(/below near mint/.test(fA(auc(70, 30, { sellerCondition: 'MP' }), 'ending').skip || ''), 'stated MP: refused by the shared row check');
  ok(/seller feedback/.test(fA(auc(70, 30, { sellerFeedback: { score: 3, percent: 100 } }), 'auctions').skip || ''), 'a seller without a record: refused by the shared evidence');
  ok(/no end time/.test(fA(auc(70, 30, { endsAt: null }), 'ending').skip || ''), 'no end time: claims nothing');
  ok(/no current measured price/.test(deals.auctionFree(auc(70, 30), pay([]), Object.assign({}, ref, { current: false }), 'ending', NOW).skip || ''),
     'a marked or old price is nothing to stand beside');
  const two = pay([auc(70, 40), auc(60, 20), auc(80, 5)]);
  const pe = deals.pickAuction(two, ref, 'ending', NOW), pb = deals.pickAuction(two, ref, 'auctions', NOW);
  ok(pe.pick && pe.pick.listing.price === 80 && pe.pick.band === '3-12h', 'ending picks the soonest end, and stores only its band');
  ok(pb.pick && pb.pick.listing.price === 60 && pb.pick.band === null, 'best picks the largest gap (internal); no band');
  ok(deals.endBand(3.5) === '3-12h' && deals.endBand(12) === '12-24h' && deals.endBand(47) === '24-48h', 'the three bands');
  const live = (o) => Object.assign({ buyingOptions: ['AUCTION'], endsAt: inH(5), currentBid: 70, currentBidCurrency: 'USD' }, o || {});
  const good = { state: 'genuine-back', photos: 3 };
  ok(deals.auctionClickRefusal(live(), good, ref, 'auctions', NOW) === null, 'click KEEPS: live, bid still 30% below, a genuine back in 3 photos');
  ok(/ended/.test(deals.auctionClickRefusal(live({ endsAt: inH(-1) }), good, ref, 'ending', NOW)), 'click: ended -> deleted, says so');
  ok(/bidding has moved/.test(deals.auctionClickRefusal(live({ currentBid: 95 }), good, ref, 'auctions', NOW))
     && deals.auctionClickRefusal(live({ currentBid: 95 }), good, ref, 'ending', NOW) === null, 'click: a bid that rose out of the band leaves best, not ending');
  ok(/vouch/.test(deals.auctionClickRefusal(live(), { state: 'no-claim', photos: 3 }, ref, 'ending', NOW))
     && /vouch/.test(deals.auctionClickRefusal(live(), { state: 'genuine-back', photos: 1 }, ref, 'ending', NOW)),
     'click: no genuine back, or one photo -> not shown (the bar vouches at the click)');
}

{
  const s0 = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
  ok(/CREATE TABLE IF NOT EXISTS bar_picks \(bar text NOT NULL, card_id text NOT NULL, item_id text NOT NULL,\s*band text, found_at timestamptz NOT NULL DEFAULT now\(\), run_id text, PRIMARY KEY \(bar, card_id\)\)/.test(s0)
     && /ALTER TABLE bar_picks ENABLE ROW LEVEL SECURITY/.test(s0), 'bar_picks: card, item id, our band, found_at, run — no title, price, photo, seller or end time; RLS on');
  const job = s0.slice(s0.indexOf('async function runDealRefresh('), s0.indexOf("app.post('/api/deals/refresh'"));
  const barsAt = job.indexOf('for (const bar of deals_.AUCTION_BARS)');
  ok(barsAt > 0 && /deals_\.pickAuction\(payload, ref, bar, Date\.now\(\)\)/.test(job)
     && !/(listingsFor|gatherListings|fetchEbay|ebayItemOnDemand)\(/.test(job.slice(barsAt)), 'the job fills both auction bars from the payload it already has — no call after');
  const shelf = s0.slice(s0.indexOf("app.get('/api/bars/:bar', access.priced"), s0.indexOf("app.get('/api/bars/:bar/:cardId/live'"));
  ok(shelf.length > 500 && !/(gatherListings|listingsFor|sourceEbay|fetchEbay|ebayItemOnDemand|backCheckItem)\(/.test(shelf) && /ebayCalls: 0/.test(shelf),
     'the bars\' shelf never asks eBay — 0 calls, and says so');
  ok(!/item_id|title|landed|url|endsAt/.test(shelf.replace(/\/\/.*$/gm, '').replace(/SELECT p\.card_id[^`]*`/, '')), 'the bars\' shelf sends OUR data only');
  ok(/if \(bar === 'graded'\) return res\.json\(Object\.assign\(base, \{ enabled: true, count: 0, picks: \[\], empty: BAR_EMPTY\.graded \}\)\)/.test(shelf)
     && /graded: 'No graded prices are recorded\.'/.test(s0), 'graded slabs: built and silent — "No graded prices are recorded.", nothing asked');
  ok(/found_at > now\(\) - interval '\$\{deals_\.AUCTION_END_H\.min\} hours'/.test(shelf), 'an auction pick is shown no longer than its 3-hour floor (route 1)');
  const click = s0.slice(s0.indexOf("app.get('/api/bars/:bar/:cardId/live'"), s0.indexOf('// ── SEARCH'));
  ok(/ebayItemOnDemand\(p\.item_id, cardId, 'bar-click'\)/.test(click) && /backCheckItem\(card, p\.item_id, \{ needPhotos: true \}\)/.test(click)
     && /deals_\.auctionClickRefusal\(live, back, ref, bar, Date\.now\(\)\)/.test(click), 'the click: one getItem, read for the live auction and its back');
  ok(/live: readLive\(item\)/.test(fs.readFileSync(__dirname + '/certcheck.js', 'utf8')), 'certcheck keeps the live facts in the same 15-minute memory cache');
}

console.log('\n  rotation (T5a, 2026-10-10): a pool of 400 walked 80 at a time');
{
  const pool = Array.from({ length: 400 }, (_, i) => 'c' + i);
  const walked = new Map(), seen = new Set(), runs = [];
  let t = 1;
  for (let run = 0; run < 5; run++) {
    const ids = deals.rotate(pool, walked, 80);
    runs.push(ids);
    for (const id of ids) { seen.add(id); walked.set(id, t++); }
  }
  ok(runs[0].join() === pool.slice(0, 80).join(), 'nothing walked yet: the 80 dearest, in price order');
  ok(runs.every(r => r.length === 80) && seen.size === 400, 'five runs walk all 400 — no card twice');
  ok(runs[1].every(id => !runs[0].includes(id)), 'consecutive runs share no card (they shared 78-80 of 80 before)');
  ok(deals.rotate(pool, walked, 80).join() === runs[0].join(), 'the sixth run starts the cycle again: the longest-walked first');
  ok(deals.rotate(['c5', 'c9', 'c1'], new Map([['c5', 100]]), 2).join() === 'c9,c1', 'a card never walked goes before one walked; ties keep pool order');
}
{
  const s0 = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
  const dc = s0.slice(s0.indexOf('async function dealCandidates('), s0.indexOf('const dealJob'));
  ok(/deals_\.rotate\(pool, walked, n\)/.test(dc) && /DEALS_SUPPLY\.pool/.test(dc) && /cards: 80, pool: 400,/.test(s0),
     'dealCandidates walks the rotation of a 400-card pool, 80 a run');
  ok(/INSERT INTO deal_walks \(card_id, walked_at\)/.test(s0)
     && /CREATE TABLE IF NOT EXISTS deal_walks \(card_id text PRIMARY KEY, walked_at timestamptz NOT NULL DEFAULT now\(\)\)/.test(s0)
     && /ALTER TABLE deal_walks ENABLE ROW LEVEL SECURITY/.test(s0), 'deal_walks: the card and when, nothing of eBay\'s, RLS on');
}

console.log('\n  wiring: the refresh job, the shelf, the click');
const src =fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
const blockAt = src.indexOf('// BEST DEALS — its own supply');
const sup = src.slice(blockAt, src.indexOf('// ── SEARCH', blockAt));
ok(blockAt > 0 && sup.length > 2000, 'the supply block exists');
{
  const job = sup.slice(sup.indexOf('async function runDealRefresh('), sup.indexOf("app.post('/api/deals/refresh'"));
  ok(/deals_\.pickVouched\(payload, ref, paid\.backOf\)/.test(job) && /dealBackOf\(card, \{ paid: true, budget: deals_\.DEAL_BACK_MAX \}\)/.test(job),
     'the job runs the shelf\'s own bar (pickVouched), the back within DEAL_BACK_MAX a card');
  ok(/INSERT INTO bar_picks \(bar, card_id, item_id, band, found_at, run_id\) VALUES \('deals', \$1, \$2, \$3, now\(\), \$4\)/.test(job)
     && /deals_\.discountBand\(r\.pick\.discount\)/.test(job), 'it stores card, item id, OUR band, found_at, run — nothing else (bar_picks, bar deals, 2026-10-10)');
  ok(/DELETE FROM bar_picks WHERE bar = 'deals' AND card_id = \$1/.test(job), 'a card with no deal now loses its old pick');
  ok(/stoppedFor/.test(job) && /break;/.test(job), 'when the quota says stop, it stops and says so');
}
ok(/CREATE TABLE IF NOT EXISTS deal_picks \(\s*card_id text PRIMARY KEY, item_id text NOT NULL, found_at timestamptz NOT NULL DEFAULT now\(\), run_id text\)/.test(sup)
   && /ALTER TABLE deal_picks ENABLE ROW LEVEL SECURITY/.test(sup),
   'deal_picks holds no price, title, photo or discount — and RLS is on from its first use');
ok(/ebay0\.withOrigin\('background', \(\) => \{ runDealRefresh\(runId\)/.test(sup), 'the job runs in a BACKGROUND context (counted so, yields at the soft stop)');
ok(/app\.post\('\/api\/deals\/refresh', toolingKey\.require/.test(sup) && /app\.get\('\/api\/deals\/refresh\/status', toolingKey\.require/.test(sup),
   'start and status are tooling-key only (the GitHub Action)');
{
  const ec = fs.readFileSync(__dirname + '/ebaycall.js', 'utf8');
  ok(/const background = !!opts\.background \|\| currentOrigin\(\) === 'background';/.test(ec), 'ebaycall: a background context makes every call in it background');
}
{
  const shelf = sup.slice(sup.indexOf("app.get('/api/deals', access.priced"), sup.indexOf('const dealLiveCache'));
  ok(shelf.length > 500, '/api/deals exists');
  ok(!/(gatherListings|listingsFor|sourceEbay|fetchEbay|ebayItemOnDemand|dealItemLive)\(/.test(shelf) && /ebayCalls: 0/.test(shelf), 'the shelf never asks eBay — 0 calls, and says so');
  ok(!/item_id|title|discount|landed|url/.test(shelf.replace(/\/\/.*$/gm, '')), 'the shelf sends OUR data only — no item id, title, link, price of eBay\'s, or discount');
  // LIFETIME (Roy, 2026-10-10): a deals pick lives until proven dead — no timer anywhere.
  ok(!/found_at >/.test(shelf) && !/showHours/.test(src) && /recheck: 20,/.test(src),
     'no timer: the shelf shows every pick until it is proven dead; the run re-checks 20 a run');
  ok(/const shown = out\.slice\(0, limit\)\.sort\(\(a, b\) => b\.price - a\.price\);/.test(shelf) && /reserve: out\.length - shown\.length/.test(shelf),
     'the freshest `limit` are shown, ordered by OUR price — never by the internal discount; the rest are the reserve, counted');
  ok(!/DELETE FROM bar_picks WHERE bar = 'deals' AND found_at/.test(src) && /SELECT item_id FROM bar_picks WHERE bar = 'deals' AND card_id = \$1"/.test(src)
     && /DELETE FROM bar_picks WHERE bar <> 'deals' AND found_at < now\(\) - interval '\$\{deals_\.AUCTION_END_H\.min\} hours'/.test(src),
     'neither the run nor the click expires a deals pick by age; the auction bars keep their 3 h (an auction\'s end is its proof)');
  ok(/if \(!deals_\.ENABLED\) return res\.json\(\{ enabled: false, reason: deals_\.OFF_REASON/.test(shelf), 'switched off, it answers enabled:false with the reason');
}
{
  const click = sup.slice(sup.indexOf("app.get('/api/deals/:cardId/live'"), sup.indexOf('// ── THE OTHER BARS'));
  ok(/const v = await dealLiveVerdict\(cardId, p\.item_id, 'deal-click'\);/.test(click) && /if \(v\.gone\) \{ await db\.query\("DELETE FROM bar_picks WHERE bar = 'deals' AND card_id = \$1", \[cardId\]\); return res\.json\(\{ cardId, gone: true, says: v\.says \}\); \}/.test(click),
     'the click: the shared live verdict; a dead pick is deleted and the tile says why');
  ok(/INSERT INTO bar_picks \(bar, card_id, item_id, band, found_at, run_id\)\s*SELECT 'deals', card_id, item_id, NULL, found_at, run_id FROM deal_picks ON CONFLICT \(bar, card_id\) DO NOTHING/.test(src)
     && /\.then\(\(\) => db\.query\('DELETE FROM deal_picks'\)\)/.test(src), 'picks still in deal_picks move to bar_picks once, and deal_picks is emptied (no pick returns from it)');
  ok(deals.discountBand(0.15) === '15-30' && deals.discountBand(0.2999) === '15-30' && deals.discountBand(0.30) === '30-45' && deals.discountBand(0.45) === '45-60'
     && deals.discountBand(0.60) === '45-60' && deals.discountBand(0.61) === null && deals.discountBand(0.1) === null && deals.DEAL_BANDS.join() === '45-60,30-45,15-30',
     'the band: three over the 15-60% window, best first; outside the window, none');
  const verdictSrc = src.slice(src.indexOf('async function dealLiveVerdict('), src.indexOf('async function recheckDealPicks('));
  ok(/q < deals_\.MIN_DISCOUNT \|\| q > deals_\.MAX_DISCOUNT/.test(verdictSrc) && !/discount:|q,|percent/.test(click.slice(click.indexOf('res.json({ cardId, gone: false'))),
     'the live price is re-judged INTERNALLY; no comparison number is sent');
  // Executed: the real dealLiveVerdict + recheckDealPicks, on a fake database and fake eBay answers.
  const recheckSrc = src.slice(src.indexOf('async function recheckDealPicks('), src.indexOf("app.get('/api/deals/:cardId/live'"));
  const queries = [];
  const picks = [{ card_id: 'en-a', item_id: 'v1|1|0' }, { card_id: 'en-b', item_id: 'v1|2|0' }, { card_id: 'en-c', item_id: 'v1|3|0' }, { card_id: 'en-d', item_id: 'v1|4|0' }];
  const live = { 'v1|1|0': { gone: true, calls: 1 },                                                                     // sold (404)
                 'v1|2|0': { item: { price: 70, shipping: 0, currency: 'USD', buyItNow: true }, calls: 1 },             // 30% below: alive
                 'v1|3|0': { item: { price: 97, shipping: 0, currency: 'USD', buyItNow: true }, calls: 0 },             // 3% below: no longer a deal
                 'v1|4|0': { error: 'eBay token unavailable', status: 503 } };                                           // not asked
  const sandbox = new Function('db', 'dealItemLive', 'dealRefOf', 'deals_', 'DEALS_SUPPLY',
    verdictSrc + recheckSrc + '; return recheckDealPicks;')(
    { query: async (sql, args) => { queries.push([sql.replace(/\s+/g, ' ').trim(), args]); return { rows: /SELECT card_id, item_id FROM bar_picks/.test(sql) ? picks : [] }; } },
    async (itemId) => Object.assign({}, live[itemId]),
    async () => ({ price: 100 }), deals, { recheck: 20 });
  pendingTests.push((async () => {
  const rc = await sandbox('20261010120000');
  const sel = queries[0];
  ok(/WHERE bar = 'deals' ORDER BY run_id ASC NULLS FIRST, found_at ASC LIMIT \$1/.test(sel[0]) && sel[1][0] === 20, 'the re-check asks the 20 picks confirmed longest ago');
  ok(rc.asked === 3 && rc.deleted === 2 && rc.kept === 1 && rc.notAsked === 1 && rc.calls === 2,
     'KEPT the live one in band; DELETED the sold one and the one now 3% below; a pick eBay could not be asked about is left alone', JSON.stringify(rc));
  const dels = queries.filter(q => /^DELETE/.test(q[0])).map(q => q[1][0]).join(), ups = queries.filter(q => /^UPDATE/.test(q[0]));
  ok(dels === 'en-a,en-c' && ups.length === 1 && ups[0][1][0] === 'en-b' && ups[0][1][2] === '20261010120000',
     'the dead are deleted by card AND item; the living one is stamped with this run, so the next run asks the next 20');
  })());
  ok(/dealJob\.recheck = await recheckDealPicks\(runId\);/.test(src) && src.indexOf('dealJob.recheck = await recheckDealPicks(runId);') < src.indexOf('const ids = await dealCandidates(DEALS_SUPPLY.cards);'),
     'each scheduled run re-checks first, before walking its 80 cards');
}
{
  const bo = src.slice(src.indexOf('function dealBackOf('), src.indexOf('async function dealRefOf('));
  ok(/background: true, needPhotos: true/.test(bo), 'the paid back asks for the photo count, in the background lane');
  ok(/o\.budget != null && calls >= o\.budget/.test(bo), 'paid: stops at its budget');
}
ok(!/function dealBackFollowUp/.test(src) && !/dealBackFollowUp\(/.test(src), 'the view-time follow-up (for the cached-view shelf) is deleted, not left spending');
ok(/back: \{ state: v\.state, says: v\.says, metal: !!v\.metal \}/.test(src), 'a kept row carries the metal-photo signal, so the deals bar can read it');
// The "most-opened" list may count only real users (Roy, 2026-10-08): every
// recorded view says who opened it, from the request's own origin.
ok(/v\.caller = v\.caller \|\| ebay0\.currentOrigin\(\) \|\| 'background'/.test(src)
   && /ADD COLUMN IF NOT EXISTS caller text/.test(src) && /action, origin, lang, caller\)/.test(src),
   'listing_views records the caller (user / tooling / background) of every view');
{
  const wf = require('path').join(__dirname, '.github', 'workflows', 'deals-refresh.yml');
  const y = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
  ok(/cron: '30 \*\/3 \* \* \*'/.test(y), 'the GitHub Action fires every 3 hours from 00:30 UTC');
  ok(/secrets\.CARDZON_TOOLING_KEY/.test(y) && !/X-CardHunt-Key: [A-Za-z0-9]{12,}/.test(y), 'it sends the key from repo secrets, never written in the file');
  ok(/\/api\/deals\/refresh\/status/.test(y), 'it polls status until the run ends (keeping the instance awake)');
}

const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').split('\r\n').join('\n');
const ldAt = page.indexOf('async function loadHomeDeals'), ld = page.slice(ldAt, page.indexOf('\n}\n', ldAt));
ok(/fetch\(BACKEND \+ '\/api\/deals/.test(page) && /loadHomeDeals\(\)/.test(page), 'the home shelf reads /api/deals');
ok(/No deals right now — checking again shortly\./.test(ld) && /title="' \+ liveEsc\(d\.rule\) \+ '"/.test(ld),
   'an empty shelf says one line; the rule is behind a hover (Roy, 2026-10-08)');
ok(/if \(d\.enabled === false\) \{\s*sec\.hidden = true;\s*console\.info\('\[deals\] Best deals is switched off: '/.test(ld), 'switched off: the section stays hidden and the reason is logged');
ok(/sec\.hidden = false;\s*\/\/ a failure is shown/.test(ld) && /\n  sec\.hidden = false;/.test(ld), 'a load failure, and an enabled shelf, show the section');
ok(!/listing\.|landed|discount|% below/.test(ld), 'a shelf tile shows nothing of eBay\'s — no listing, price of eBay\'s, or percentage');
ok(/'Deal found ' \+ /.test(ld) && /TCGplayer market/.test(ld), 'a tile shows our card, the TCGplayer market price and when the deal was found');
{
  const ck = page.slice(page.indexOf('async function openDeal('), page.indexOf('\n}\n', page.indexOf('async function openDeal(')));
  ok(/'\/api\/deals\/' \+ encodeURIComponent\(cardId\) \+ '\/live'/.test(ck), 'opening a deal fetches the listing live');
  ok(/From eBay/.test(ck) && /delivered/.test(ck) && /View on eBay/.test(ck), 'eBay\'s own zone: "From eBay", its delivered price, a link');
  ok(!/% below|discount|percent/.test(ck), 'no comparison number on screen — the reader sees the two figures and the gap');
  ok(/d\.gone/.test(ck) && /d\.says/.test(ck), 'gone: the tile says why (sold, expired, no longer a deal)');
}
Promise.all(pendingTests).catch(e => ok(false, 'an executed check threw: ' + e.message)).then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
