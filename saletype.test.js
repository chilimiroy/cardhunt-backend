// saletype.test.js — Buy It Now and Auctions are two tabs of one answer (T5, 2026-10-04)
//
// An auction's number is its current bid, not a price: auctions get their
// own tab (bid, bid count, time left; ending soonest first) and never a
// cheapest. An auction that also offers Buy It Now is buyable now and is
// filed under Buy It Now, its bid beside. The existing filters (condition,
// printing, edition) apply to both, because the split happens first and the
// rest of the panel runs unchanged. 19 of these fail on the code before T5.

require('./testcount')(22);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const vm = require('vm');
const outlier = require('./outlier.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !extra ? '' : '  — ' + extra)); };

const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');

// The REAL normaliseListing, lifted from server.js and run.
function fnText(text, name) {
  const i = text.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, j = text.indexOf('{', i);
  for (let k = j; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') { depth--; if (depth === 0) return text.slice(i, k + 1); }
  }
  return null;
}
const ctx = {};
vm.createContext(ctx);
let norm = null;
try { vm.runInContext(fnText(src, 'normaliseListing') + '; this.normaliseListing = normaliseListing;', ctx); norm = ctx.normaliseListing; } catch (e) { /* reported below */ }

console.log('\n  the row says which');
ok('normaliseListing found and runs', typeof norm === 'function');
const N = o => (norm ? norm(Object.assign({ source: 'ebay', price: 10, live: true }, o)) : {});
ok('a fixed-price row is Buy It Now', N({ listingType: 'fixed' }).saleType === 'buy-it-now');
ok('a current bid is an auction', N({ listingType: 'auction', priceKind: 'current-bid' }).saleType === 'auction');
ok('an auction WITH Buy It Now is Buy It Now', N({ listingType: 'auction', priceKind: null }).saleType === 'buy-it-now');
ok('…and carries its current bid beside', N({ listingType: 'auction', currentBid: 4.25 }).currentBid === 4.25);
ok('no bid stated: currentBid is null, never 0', N({ listingType: 'fixed' }).currentBid === null);
ok('a shop ask is Buy It Now', N({ source: 'yuyutei', priceKind: 'shop-ask' }).saleType === 'buy-it-now');
ok('eBay auction+BIN reads currentBidPrice at the row\'s own rate', /currentBid: isAuction && it\.price && it\.price\.value != null && it\.currentBidPrice/.test(src));
ok('a live Yahoo auction\'s yen is a current bid', /priceKind: feed\.live && !it\.isFixedPrice \? 'current-bid'/.test(src));

console.log('\n  cheapest is Buy It Now only');
const bin = N({ price: 50, landed: 50, listingType: 'fixed' });
const auc = N({ price: 3, landed: 3, listingType: 'auction', priceKind: 'current-bid' });
ok('the auction is never trustworthy', !outlier.trustworthy(auc));
ok('the Buy It Now row is', outlier.trustworthy(bin));
ok('the payload counts both tabs', /saleTypes: \{\s*buyItNow: listings\.filter\(l => l\.live && l\.saleType !== 'auction'\)\.length,\s*auction: listings\.filter\(l => l\.live && l\.saleType === 'auction'\)\.length/.test(src));

console.log('\n  the page');
ok('the bar offers Buy It Now and Auctions, not "Live listings"',
   /id="ltab-bin"[^>]*>Buy It Now</.test(page) && /id="ltab-auction"[^>]*>Auctions</.test(page) && !/>Live listings</.test(page));
ok('both tabs draw through the gated panel (one writer)', /if\(tab==='live'\|\|tab==='auction'\)\{[\s\S]{0,140}renderListingFinder/.test(page));
ok('a grade change never sends the Auctions tab to the link lists', /S\.ltab !== 'live' && S\.ltab !== 'auction'\) buildMockListings/.test(page));
const rl = fnText(page, 'renderLiveListings') || '';
ok('the split is applied FIRST, before the condition filter', rl.indexOf("var saleView") > 0 && rl.indexOf("var saleView") < rl.indexOf('var condFilter'));
ok('the auction view draws no cheapest', /if \(saleView === 'auction'\) \{[\s\S]*?ending soonest first[\s\S]*?return;\s*\}\s*if \(d\.cheapestLive != null\)/.test(rl));
ok('auctions are sorted by end time', /saleView === 'auction'[\s\S]{0,400}new Date\(a\.endsAt\)/.test(rl));
ok('the auction view says a bid is not a price', /current bid<\/strong>, not what the card will sell for/.test(rl));
ok('an empty Auctions tab points at the Buy It Now count, not "no listing"', /No auction of this exact card/.test(rl));
const lr = fnText(page, 'liveRow') || '';
ok('an auction+BIN row shows its bid (eBay\'s own currency, liveBid) and when the auction ends', /auction bid ' \+ liveBid\(l\)/.test(lr) && /auction ' \+ liveEndsIn/.test(lr));
ok('tab counts come from the answer, one writer', /function liveTabCounts\(d\)/.test(page) && (page.match(/getElementById\('ltab-bin'\)/g) || []).length === 1);

console.log(`\n  saletype.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
