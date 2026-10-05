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

const row = (landed, o) => Object.assign({ source: 'ebay', live: true, saleType: 'buy-it-now', shippingKnown: true,
  landed, price: landed, suspect: null, priceKind: 'listing' }, o || {});
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

console.log('\n  switched off (Roy, 2026-10-05)');
ok(deals.ENABLED === false, 'deals.ENABLED is false until the shelf is re-measured live');
ok(/switched off/.test(deals.OFF_REASON), 'the off state carries its reason');
ok(/Nothing is fetched/.test(deals.describeRule()), 'the rule says nothing is fetched');

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const h = src.slice(src.indexOf("app.get('/api/deals'"), src.indexOf('// ── SEARCH'));
ok(h.length > 100, '/api/deals exists');
ok(/listingCache\.entries\(\)/.test(h) && /LISTING_TTL/.test(h), 'it reads only the 15-minute listing cache');
ok(!/(gatherListings|listingsFor|sourceEbay|fetchEbay|ebayCall|ebayItemOnDemand)\(/.test(h), 'it never gathers listings — 0 eBay calls');
ok(/ebayCalls: 0/.test(h), 'and says so in the payload');
ok(/parts\.length !== 2/.test(h) && /isRawGrade/.test(h), 'raw views without a printing or edition filter only');
ok(/deals_\.pickDeal\(v\.payload, ref\)/.test(h) && /pricequality\.annotate/.test(h), 'the price end is the current, measured, number-matched price');
ok(/materialPending: true/.test(src), 'rows the novelty check has not reached are marked, so no deal is an unchecked gold card');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok(/fetch\(BACKEND \+ '\/api\/deals/.test(page) && /loadHomeDeals\(\)/.test(page), 'the home shelf reads /api/deals');
ok(!/function notYet/.test(page), 'the "not live yet" placeholder is gone, not left dormant');
ok(/No deal to show right now/.test(page) && /opened in the last 15 minutes/.test(page), 'an empty shelf says why');
ok(/if \(!deals_\.ENABLED\) return res\.json\(\{ enabled: false, reason: deals_\.OFF_REASON/.test(h), 'switched off, /api/deals answers enabled:false with the reason before reading any view');
ok(/d\.enabled === false/.test(page) && /Best deals is switched off/.test(page), 'and the page says it is off, not "no deal right now"');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
