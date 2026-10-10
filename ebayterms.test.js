// ebayterms.test.js — what the eBay API License Agreement rules out, pinned
// (Roy, 2026-10-08; licence read that day, quoted in CLAUDE_ARCHIVE.md
// "eBay listings are cached, never stored" and PROGRESS 2026-10-08).
//
// The rule: never risk API access. Where a reading is uncertain, the thing is
// removed. Allowed: a listing's own price, and a link to it.
//   §9.5    no eBay Content used "to suggest or model prices for items listed
//           on eBay Site" -> no median of eBay prices shown or stored
//   §8.1(d) derived statistics need written permission -> the per-view
//           outlier medians stay inside the server, never in a payload
'use strict';
require('./testcount')(20);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (what, cond, got) => { if (cond) { pass++; console.log('  ok    ' + what); } else { fail++; console.log('  FAIL  ' + what + (got ? '   ' + got : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r/g, '');
const S = read('server.js'), P = read('cardhunt_preview.html');
const fnOf = (src, name) => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i) + 2); };

console.log('  §9.5 — no price modelled from eBay listings reaches a viewer');
ok('the listings payload carries no gradePrice (the eBay median "what this grade is worth")', !/gradePrice:\s*gp\.aggregate/.test(S));
ok('the page has no measured-grade box, and reads no gradePrice', !/function applyMeasuredGrade/.test(P) && !/d\.gradePrice/.test(P));
ok('no typical-grade box either: raw x a multiplier was an estimate, and no estimate is shown (Roy, 2026-10-09)', !/cd-gradeval/.test(P) && !/not measured from sales/.test(P));
ok('print-run groups show "from $Y" (a listing\'s own price) and no median', /'from ' \+ fmtCurrency\(g\.low\)/.test(fnOf(P, 'livePrintRuns')) && !/g\.median/.test(fnOf(P, 'livePrintRuns')));
ok('the price-check line names its yardstick and prints no median', !/o\.median/.test(fnOf(P, 'liveOutlierNote')));
{
  // Parked 2026-10-10 (tracked, refuses to run at all — nofabricated.test.js runs it under a network trap).
  const src = read('gradeprices-disabled.js');
  ok('gradeprices-disabled.js: refuses before anything runs, --write is still refused under it, and the INSERT is gone',
     /if \(require\.main === module\) \{/.test(src) && /if \(args\.some\(a => \/\^--write\\b\/\.test\(a\)\)\)/.test(src)
     && /process\.exit\(2\)/.test(src) && !/INSERT INTO price_history\s*\n/.test(src));
}

console.log('\n  §8.1(d) — per-card medians stay inside the server');
{
  const po = fnOf(S, 'publicOutliers');
  ok('the payload\'s outliers go through publicOutliers', /outliers: publicOutliers\(j\.outliers\)/.test(S) && po.length > 100);
  ok('...which passes no median, low, high, spread or band', !/median|\.low\b|\.high\b|spread|band/.test(po.replace(/\/\/.*$/gm, '')));
  ok('...and a basis price only when it is OUR catalogue price', /basisPrice: o\.basis === 'catalogue' \? o\.basisPrice : null/.test(po));
  // Re-verified 2026-10-10 (Roy): the tooling endpoints returned outlier.js's raw stats.
  ok('the tooling probes send outlier stats only through publicOutliers: marketprobe and dealsprobe\'s floorStats (they returned median, low, high)',
     /usCapped, outliers: publicOutliers\(judged\.stats\),/.test(S) && /floorStats = \{ item: publicOutliers\(byItem\.stats\), delivered: publicOutliers\(byDelivered\.stats\), live: o \}/.test(S)
     && !/usCapped, outliers: judged\.stats|item: byItem\.stats|usMaxExaminedUsd/.test(S));
  const sp = S.slice(S.indexOf("app.get('/api/ebay/setprobe/:cardId'"), S.indexOf("app.get('/api/ebay/setprobe/:cardId'") + 9000);
  // Exemption #9 (Roy, 2026-10-10): the converted current bid sits in eBay's zone and shows its own currency.
  const lb = P.slice(P.indexOf('function liveBid(l){'), P.indexOf('\n}\n', P.indexOf('function liveBid(l){')) + 2);
  const vm = require('vm'), ctx = { CUR_SIGN: { GBP: '£', EUR: '€' }, currentCurrency: 'USD', fmtCurrency: u => '$' + Number(u).toFixed(2) };
  vm.createContext(ctx); vm.runInContext(lb, ctx);
  const gb = ctx.liveBid({ currentBid: 12.7, currentBidOriginal: 10, currentBidCurrency: 'GBP' });
  const us = ctx.liveBid({ currentBid: 12.7, currentBidOriginal: 12.7, currentBidCurrency: 'USD' });
  ok('an auction row\'s current bid: eBay\'s own figure in its own currency, any USD figure called converted, inside eBay\'s section',
     gb === '£10.00 ≈ $12.70 converted' && us === '$12.70'
     && /\(auction bid ' \+ liveBid\(l\) \+ '\)'/.test(P) && /currentBidOriginal: Number\.isFinite\(o\.currentBidOriginal\)/.test(S)
     && /return l\.source === 'ebay'; \}\),/.test(P) && /<section class="src-panel src-ebay" style="border:1px solid var\(--bd\)/.test(P), [gb, us]);
  ok('/api/ebay/setprobe keeps its counts, kept and titles per epid — and no median, low or high of eBay\'s prices',
     /epids\[k\] = \{ count: 0, kept: 0, titles: \[\] \}/.test(sp) && !/e\.median|e\.low|e\.high|e\.prices/.test(sp));
}
{
  const outlier = require('./outlier.js');
  const rows = Array.from({ length: 8 }, (_, i) => ({ source: 'ebay', live: true, price: 400 + i, landed: 400 + i, title: 'x' }))
    .concat([{ source: 'ebay', live: true, price: 20, landed: 20, title: 'cheap' }]);
  const r = outlier.flagOutliers(rows, {});
  const cheap = r.listings.find(l => l.price === 20);
  ok('a flag reason prints the row\'s own price and no median', cheap.suspect && /\$20\.00/.test(cheap.suspectReason) && !/40[0-9]\.|x below/.test(cheap.suspectReason), cheap.suspectReason);
}

console.log('\n  the headline is a listing, named as one');
ok('eBay\'s figure is not in our price-box row; the eBay section is labelled "Listings from eBay"',
   !/id="cd-low"/.test(P) && /Listings from eBay/.test(P) && /function renderOtherSources\(d\)/.test(P));
ok('tiles show no eBay median ("avg listing … median of N" removed)', !/function cardListingAvg|LISTING_AVG_CACHE|median of ' \+/.test(P));
ok('the panel line says "cheapest trusted listing", never "this price"', /'cheapest trusted listing, delivered/.test(P) && !/cheapest buyable/.test(P) && !/not used for this price/.test(P));

console.log('\n  a discount names its third party');
{
  const deals = require('./deals.js');
  ok('refLabel names TCGplayer for our TCGplayer-sourced prices', deals.refLabel({ source: 'tcgdex_tcgplayer_holofoil' }) === 'TCGplayer market price' && deals.refLabel({ source: 'tcgplayer_market' }) === 'TCGplayer market price');
  ok('...and any other source by its own name, never as "market"', /^stored price \(yuyutei\)$/.test(deals.refLabel({ source: 'yuyutei' })));
  ok('the shelf\'s rule says "TCGplayer market price"', /TCGplayer market price/.test(deals.describeRule()) && !/current measured price/.test(deals.describeRule()));
  // No combined number on screen at all (Roy, 2026-10-08): the tile shows OUR
  // figure ("TCGplayer market"), eBay's zone shows eBay's — the reader sees the gap.
  ok('the deals tile names our price as TCGplayer market, and shows no percentage', /TCGplayer market/.test(P) && /priceLabel: deals_\.refLabel\(ref\)/.test(S)
     && !/% below/.test(fnOf(P, 'loadHomeDeals') + fnOf(P, 'openDeal')));
}

console.log(`\n  ebayterms.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
