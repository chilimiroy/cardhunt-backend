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

console.log('\n  off again (TASK T1, 2026-10-05): the live shelf\'s top pick was a different genuine card');
ok(deals.ENABLED === false, 'deals.ENABLED is false until "is this photo this card" is answered');
ok(/different card/.test(deals.OFF_REASON), 'the off state names why');
{
  const s = fs.readFileSync(__dirname + '/server.js', 'utf8');
  const f = s.slice(s.indexOf('function dealBackFollowUp'), s.indexOf('function dealBackFollowUp') + 200);
  const g = s.slice(s.indexOf('function dealBackFollowUp'), s.indexOf('function dealBackFollowUp') + 400);
  ok(g.length > 100 && /if \(\(!deals_\.ENABLED && !measure\)/.test(g), 'switched off, dealBackFollowUp returns before any getItem — unless measuring');
  // Measuring (2026-10-07): only the tooling-keyed probe passes it.
  const probe = s.slice(s.indexOf("app.get('/api/ebay/dealsprobe/:cardId'"), s.indexOf("app.get('/api/ebay/aspects/:cardId'"));
  ok((s.match(/\{ measure: true \}/g) || []).length === 1 && /\{ measure: true \}/.test(probe)
     && /app\.get\('\/api\/ebay\/dealsprobe\/:cardId', toolingKey\.require/.test(s),
     '...and only /api/ebay/dealsprobe (tooling key) measures — nothing reaches a visitor');
}
ok(/switched off/.test(deals.OFF_REASON), 'the off state still carries its reason, should it be switched off again');
ok(/genuine card/.test(deals.describeRule()) && /at most 2/.test(deals.describeRule()), 'the rule states the back and what it costs');
ok(/Nothing is fetched/.test(deals.describeRule()), 'the rule says nothing is fetched');

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const h = src.slice(src.indexOf("app.get('/api/deals'"), src.indexOf('// ── SEARCH'));
ok(h.length > 100, '/api/deals exists');
ok(/listingCache\.entries\(\)/.test(h) && /LISTING_TTL/.test(h), 'it reads only the 15-minute listing cache');
ok(!/(gatherListings|listingsFor|sourceEbay|fetchEbay|ebayCall|ebayItemOnDemand)\(/.test(h), 'it never gathers listings — 0 eBay calls');
ok(/ebayCalls: 0/.test(h), 'and says so in the payload');
ok(/parts\.length !== 2/.test(h) && /isRawGrade/.test(h), 'raw views without a printing or edition filter only');
{
  // The price end, one definition for the shelf and its probe (dealRefOf).
  const S2 = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
  const dr = S2.slice(S2.indexOf('async function dealRefOf('), S2.indexOf("app.get('/api/deals'"));
  ok(/deals_\.pickDeal\(v\.payload, ref\)/.test(h) && /const ref = await dealRefOf\(v\.cardId\)/.test(h)
     && /numberMatchedPrice\(cardId\)/.test(dr) && /pricequality\.annotate/.test(dr),
     'the price end is the current, measured, number-matched price');
}
ok(/materialPending: true/.test(src), 'rows the novelty check has not reached are marked, so no deal is an unchecked gold card');
const fu = src.slice(src.indexOf('function dealBackFollowUp'), src.indexOf('// ── What does ONE listing'));
ok(fu.length > 200, 'dealBackFollowUp exists');
ok(/deals_\.ENABLED/.test(fu) && /isRawGrade\(grade\)/.test(fu) && /printing \|\| edition/.test(fu), 'it runs only when deals are on, on raw views without a printing or edition filter');
ok(/deals_\.backCandidates\(/.test(fu) && /DEAL_BACK_MAX/.test(fu), 'it checks only backCandidates, within DEAL_BACK_MAX a view');
ok(/background: true/.test(fu), 'background origin: it yields at the soft stop');
ok((src.match(/^ {2}(if \(st\) )?dealBackFollowUp\(card, requestedId/gm) || []).length === 2, 'called after an open and after every re-judge');
ok(/back: \{ state: v\.state, says: v\.says, metal: !!v\.metal \}/.test(src), 'a kept row carries the metal-photo signal, so the deals bar can read it');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok(/fetch\(BACKEND \+ '\/api\/deals/.test(page) && /loadHomeDeals\(\)/.test(page), 'the home shelf reads /api/deals');
ok(!/function notYet/.test(page), 'the "not live yet" placeholder is gone, not left dormant');
ok(/No deal to show right now/.test(page) && /opened in the last 15 minutes/.test(page), 'an empty shelf says why');
ok(/if \(!deals_\.ENABLED\) return res\.json\(\{ enabled: false, reason: deals_\.OFF_REASON/.test(h), 'switched off, /api/deals answers enabled:false with the reason before reading any view');
// TASK-ui T8: switched off, the home slot is empty — no gap, no placeholder —
// and the reason is stated in the console; a FAILURE is still shown.
const ldAt = page.indexOf('async function loadHomeDeals'), ld = page.slice(ldAt, page.indexOf('\n}\n', ldAt));
ok(/if \(d\.enabled === false\) \{\s*sec\.hidden = true;\s*console\.info\('\[deals\] Best deals is switched off: '/.test(ld), 'switched off: the section stays hidden and the reason is logged, not "no deal right now"');
ok(/sec\.hidden = false;\s*\/\/ a failure is shown/.test(ld) && /\n  sec\.hidden = false;/.test(ld), 'a load failure, and an enabled shelf, show the section');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
