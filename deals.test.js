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

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
