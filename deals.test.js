// deals.test.js — Best deals (TASK T3, 2026-10-05; deals.js).
//
// The cheapest TRUSTED Buy It Now against a MEASURED price, both ends solid,
// from views opened in the last 15 minutes, with 0 eBay calls. Tested both
// ways: what it keeps as a deal, and every reason a row is not one.
//
//   node deals.test.js
'use strict';
const fs = require('fs');
const deals = require('./deals.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
console.log('\n  deals.test.js\n');

// Every row carries a genuine back unless a test says otherwise: the bars
// below are each tested alone; the genuine-back rule has its own section.
let _id = 0;
const row = (landed, o) => Object.assign({ source: 'ebay', live: true, saleType: 'buy-it-now', shippingKnown: true,
  landed, price: landed, suspect: null, priceKind: 'listing', itemId: 'v1|' + (++_id) + '|0',
  back: { state: 'genuine-back' } }, o || {});
const ref = { price: 100, isReal: true, current: true };
const view = rows => ({ listings: rows });

console.log('  what it keeps');
let r = deals.pickDeal(view([row(70), row(90), row(95)]), ref);
ok(r.deal && r.deal.listing.landed === 70 && r.deal.discount === 0.3, 'the cheapest solid listing, 30% below a current measured price');
r = deals.pickDeal(view([row(40, { suspect: 'implausible' }), row(80), row(90), row(95)]), ref);
ok(r.deal && r.deal.listing.landed === 80, 'an outlier is skipped — a deal is the bottom of TRUST, not below it');
r = deals.pickDeal(view([row(30, { suspect: 'counterfeit-likely' }), row(84), row(90), row(95)]), ref);
ok(r.deal && r.deal.listing.landed === 84, 'a row the novelty check flagged is skipped');
// The ONE threshold that stays on the DELIVERED price (Roy, 2026-10-08):
// a deal is what the buyer pays. The gates judge the item price (outlier.js).
r = deals.pickDeal(view([row(90, { price: 60 }), row(90), row(95)]), ref);
ok(!r.deal, 'a $60 item + $30 shipping is 10% below, not 40%: the discount is on the DELIVERED price');

console.log('\n  what it refuses, and says why');
const why = (rows, rf) => deals.pickDeal(view(rows), rf || ref).why || '';
ok(/measured/.test(why([row(50), row(90), row(95)], { price: 100, isReal: false, current: true })), 'an estimate is no price to beat');
ok(/old|current/.test(why([row(50), row(90), row(95)], { price: 100, isReal: true, current: false, quality: 'old' })), 'an old / thin / unsettled price is no price to beat');
ok(/needs 3/.test(why([row(50), row(90)])), 'fewer than three solid listings: no bottom of trust to stand on');
ok(/below the price/.test(why([row(90), row(95), row(99)])), 'under 15% below: not a deal');
ok(/needs 3/.test(why([row(50, { saleType: 'auction' }), row(90), row(95)])), 'an auction (a current bid) is never a deal');
ok(/needs 3/.test(why([row(50, { shippingKnown: false }), row(90), row(95)])), 'unknown shipping: the landed cost is not solid');
ok(/needs 3/.test(why([row(50, { materialPending: true }), row(90), row(95)])), 'a row still waiting for its photo check is not offered');
ok(/needs 3/.test(why([row(50, { live: false }), row(90), row(95)])), 'an ended listing is not a deal');
ok(deals.MIN_DISCOUNT === 0.15 && deals.MIN_TRUSTED === 3, 'the thresholds are the stated ones');

console.log('\n  the bar after the live look (2026-10-05): like for like only');
const holoCard = rows => ({ listings: rows, printings: [{ key: 'holo' }, { key: 'reverse' }] });
const pick = (rows, v) => deals.pickDeal((v || holoCard)(rows), ref);
const cheapest = rows => (pick(rows).deal || { listing: {} }).listing.landed;
const solid3 = [row(80), row(90), row(95)];
ok(cheapest([row(50, { sellerStated: true, sellerCondition: 'DMG' })].concat(solid3)) === 80, 'stated damage ("Damaged", "DMG/PEELING") is not a deal');
ok(cheapest([row(50, { sellerStated: true, sellerCondition: 'MP' })].concat(solid3)) === 80, 'stated MP is not a deal against a near-mint price');
ok(cheapest([row(50, { sellerStated: true, sellerCondition: 'LP' })].concat(solid3)) === 80, 'stated LP neither');
ok(cheapest([row(50, { sellerStated: true, sellerCondition: 'NM' })].concat(solid3)) === 50, 'KEPT: a stated near-mint copy');
ok(cheapest([row(50, { sellerStated: true, sellerCondition: 'M' })].concat(solid3)) === 50, 'KEPT: a stated mint copy');
ok(cheapest([row(50, { printingStated: true, printing: 'reverse' })].concat(solid3)) === 80, 'a stated reverse holo is not the holo price\'s deal');
ok(cheapest([row(50, { printingStated: true, printing: 'normal' })].concat(solid3)) === 80, 'a stated "Non-Holo" is not the holo price\'s deal');
ok(cheapest([row(50, { printingStated: true, printing: 'holo' })].concat(solid3)) === 50, 'KEPT: the stated printing IS the priced one');
ok(cheapest([row(50, { printingStated: false, printing: null })].concat(solid3)) === 50, 'KEPT: a title that states no printing');
ok(deals.pickDeal({ listings: [row(50, { printingStated: true, printing: 'holo' })].concat(solid3), printings: [{ key: 'normal' }, { key: 'holo' }] }, ref).deal.listing.landed === 80,
   'a card in normal AND holo: a stated printing cannot be shown to be the priced one');
ok(cheapest([row(50, { editionStated: true, editionKey: '1st-edition' })].concat(solid3)) === 80, 'a stated 1st Edition is not the unlimited price\'s deal');
ok(cheapest([row(50, { editionStated: true, editionKey: 'unlimited' })].concat(solid3)) === 50, 'KEPT: a stated Unlimited');
ok(cheapest([row(50, { stamp: { state: 'pending', kind: 'sibling' } })].concat(solid3)) === 80, 'a photo still being compared is not a deal');
ok(cheapest([row(50, { stamp: { state: 'not-visible' } })].concat(solid3)) === 50, 'KEPT: a photo checked and clear');
ok(cheapest([row(50, { back: { state: 'no-claim', metal: true } })].concat(solid3)) === 80, 'a metal photo among the seller\'s is not a deal');
ok(cheapest([row(50, { back: { state: 'genuine-back' } })].concat(solid3)) === 50, 'KEPT: a genuine back seen');
const ex = pick([row(50, { sellerStated: true, sellerCondition: 'DMG' }), row(55, { printingStated: true, printing: 'reverse' })].concat(solid3)).excluded;
ok(ex && ex['stated condition below near mint'] === 1 && ex['states another printing'] === 1, 'every excluded row is counted by its reason');

console.log('\n  the genuine-back rule (TASK T1, 2026-10-05): evidence it is real, not only no evidence it is fake');
const noBack = o => Object.assign({ back: undefined }, o || {});
// The gold Shining Charizard: no mark anywhere, back no-claim, 89% below.
const goldCharizard = row(180.17, { back: { state: 'no-claim', metal: false }, title: 'Shining Charizard 107/105 Neo Destiny' });
const shining = { price: 1701, isReal: true, current: true };
const sc = deals.pickDeal(view([goldCharizard, row(1400), row(1500), row(1600)]), shining);
ok(sc.deal && sc.deal.listing.landed === 1400, 'the gold Shining Charizard (no-claim back) is NOT the deal; the cheapest genuine-back row is');
ok(sc.excluded && sc.excluded["no genuine back in the seller's photos"] === 1, 'and it is counted under its reason');
r = deals.pickDeal(view([row(50, noBack()), row(80), row(95)]), ref);
ok(r.deal && r.deal.listing.landed === 80 && r.excluded['back not checked yet'] === 1, 'a row the back check has not reached is not a deal yet, and says so');
r = deals.pickDeal(view([row(50, noBack()), row(60, noBack()), row(70, noBack())]), ref);
ok(!r.deal && /genuine back/.test(r.why), 'no solid row with a genuine back: no deal, and the reason names the back');
r = deals.pickDeal(view([row(50, { back: { state: 'no-claim' } }), row(90), row(95)]), ref);
ok(!r.deal && /genuine back is 10% below/.test(r.why), 'the next genuine-back row under 15% below: no deal at all');
r = deals.pickDeal(view([row(50, { back: { state: 'no-claim' } }), row(80), row(95)]), ref);
ok(r.deal && r.deal.listing.landed === 80, 'the next row with a genuine back, still 15% below, becomes the deal');
ok(cheapest([row(50, { back: { state: 'other-back' } })].concat(solid3)) === 80, 'another language family\'s back is not a deal');

console.log('\n  which backs a view checks for the shelf (backCandidates)');
const cand = (rows, budget, rf) => deals.backCandidates(view(rows), rf || ref, budget == null ? deals.DEAL_BACK_MAX : budget).map(l => l.landed);
const js = a => JSON.stringify(a);
ok(deals.DEAL_BACK_MAX === 2, 'at most two getItem calls a view');
ok(js(cand([row(50, noBack()), row(60, noBack()), row(70, noBack()), row(95, noBack())])) === '[50,60]', 'the cheapest unchecked candidates, cheapest first, capped');
ok(js(cand([row(50, noBack()), row(60, noBack()), row(70, noBack())], 1)) === '[50]', 'capped by what the view may still spend');
ok(js(cand([row(50, { back: { state: 'no-claim' } }), row(60, noBack()), row(70), row(80, noBack())])) === '[60]', 'a row already judged is not checked again; nothing dearer than a genuine-back row is');
ok(js(cand([row(50), row(60, noBack()), row(70, noBack())])) === '[]', 'the cheapest row already has a genuine back: 0 calls');
ok(js(cand([row(90, noBack()), row(95, noBack()), row(99, noBack())])) === '[]', 'nothing 15% below the price: 0 calls');
ok(js(cand([row(50, noBack()), row(60, noBack())])) === '[]', 'fewer than three solid rows: 0 calls');
ok(js(cand([row(50, noBack({ shippingKnown: false })), row(60, noBack()), row(70), row(80)])) === '[60]', 'a row failing another bar is never checked');
ok(js(cand([row(50, noBack()), row(60), row(70)], 2, { price: 100, isReal: true, current: false })) === '[]', 'no current measured price: 0 calls');
ok(js(cand([row(50, noBack()), row(60), row(70)], 0)) === '[]', 'budget spent: 0 calls');

console.log('\n  on (Roy, 2026-10-08), with its own supply');
ok(deals.ENABLED === true, 'deals.ENABLED is ON — on the vouching bar, approved accounts');
ok(/switched off/.test(deals.OFF_REASON), 'the off state still carries its reason, should it be switched off again');
ok(/genuine card/.test(deals.describeRule()) && /at most 2/.test(deals.describeRule()), 'the rule states the back and what it costs');

console.log('\n  wiring: the refresh job, the shelf, the click');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
const blockAt = src.indexOf('// BEST DEALS — its own supply');
const sup = src.slice(blockAt, src.indexOf('// ── SEARCH', blockAt));
ok(blockAt > 0 && sup.length > 2000, 'the supply block exists');
{
  const job = sup.slice(sup.indexOf('async function runDealRefresh('), sup.indexOf("app.post('/api/deals/refresh'"));
  ok(/deals_\.pickVouched\(payload, ref, paid\.backOf\)/.test(job) && /dealBackOf\(card, \{ paid: true, budget: deals_\.DEAL_BACK_MAX \}\)/.test(job),
     'the job runs the shelf\'s own bar (pickVouched), the back within DEAL_BACK_MAX a card');
  ok(/INSERT INTO deal_picks \(card_id, item_id, found_at, run_id\)/.test(job), 'it stores card, item id, found_at, run — nothing else');
  ok(/DELETE FROM deal_picks WHERE card_id = \$1/.test(job), 'a card with no deal now loses its old pick');
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
  ok(/found_at > now\(\) - interval '3 hours'/.test(shelf), 'picks older than the 3-hour refresh are not shown');
  ok(/out\.sort\(\(a, b\) => b\.price - a\.price\)/.test(shelf), 'ordered by OUR price — never by the internal discount');
  ok(/if \(!deals_\.ENABLED\) return res\.json\(\{ enabled: false, reason: deals_\.OFF_REASON/.test(shelf), 'switched off, it answers enabled:false with the reason');
}
{
  const click = sup.slice(sup.indexOf("app.get('/api/deals/:cardId/live'"));
  ok(/drop\('This one has sold\.'\)/.test(click) && /DELETE FROM deal_picks WHERE card_id = \$1/.test(click), 'a sold listing deletes the pick and says "This one has sold."');
  ok(/q < deals_\.MIN_DISCOUNT \|\| q > deals_\.MAX_DISCOUNT/.test(click) && !/discount:|q,|percent/.test(click.slice(click.indexOf('res.json({ cardId, gone: false'))),
     'the live price is re-judged INTERNALLY; no comparison number is sent');
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
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
