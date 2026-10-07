// auction.test.js — eBay auctions are listed, and a current bid is never a price (T0, 2026-10-04)
//
// Browse search returns Buy It Now only unless asked: 0 auctions in 258 rows
// over four cards, while eBay's own site showed Giratina V 186 PSA 10
// auctions we never listed. Now asked. An auction's number is its CURRENT
// bid — shown and labelled, but never the cheapest and never a baseline.

const fs = require('fs');
const outlier = require('./outlier.js');
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name); };

const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
console.log('\n  the request');
ok('the eBay search asks for auctions as well as Buy It Now',
   /buyingOptions:\{FIXED_PRICE\|AUCTION\}/.test(src));
ok('an auction with no Buy It Now is priced from its current bid',
   /it\.currentBidPrice/.test(src) && /priceKind: isAuction && !\(it\.price && it\.price\.value != null\) \? 'current-bid'/.test(src));
ok('the row carries when it ends and how many bids', /endsAt: it\.itemEndDate/.test(src) && /bids: Number\.isFinite\(it\.bidCount\)/.test(src));

console.log('\n  a current bid is not a price');
const rows = [100, 104, 98, 110, 102, 99].map((p, i) => ({ itemId: 'b' + i, price: p, landed: p }));
const bid = { itemId: 'a1', price: 1.5, landed: 1.5, priceKind: 'current-bid', listingType: 'auction' };
const j = outlier.flagOutliers(rows.concat(bid));
ok('the median ignores the bid', j.stats.median === outlier.median(rows.map(r => r.price)));
ok('the bid is not flagged as a fake (it is not judged at all)', !j.listings.find(l => l.itemId === 'a1').suspect);
ok('the bid is never trustworthy, so never the cheapest', !outlier.trustworthy(j.listings.find(l => l.itemId === 'a1')));
ok('a Buy It Now row stays trustworthy', outlier.trustworthy(j.listings.find(l => l.itemId === 'b0')));
ok('an auction WITH a Buy It Now price is an ordinary price', outlier.trustworthy({ price: 50, listingType: 'auction', priceKind: null }));
// 2026-10-07: headlineEligible = trustworthy (no current bid, unflagged) + the seller floor.
ok('the payload\'s cheapest is drawn from headline-eligible rows (trustworthy: never a current bid)',
   /const trusted = listings\.filter\(outlier\.headlineEligible\)/.test(src) && /cheapest: trusted\.length \? trusted\[0\]\.landed/.test(src)
   && !require('./outlier').headlineEligible({ source: 'ebay', priceKind: 'current-bid', landed: 1, live: true, sellerFeedback: { score: 999, percent: 100 } }));

console.log('\n  the page says so');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('a current-bid row is labelled "current bid, not the final price"', /l\.priceKind === 'current-bid'[\s\S]{0,120}current bid, not the final price/.test(page));

console.log(`\n  auction.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
