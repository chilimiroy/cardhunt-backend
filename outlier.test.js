const o = require('./outlier');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

// The real Giratina V #186 data from the audit
const gira186 = [2.08, 8.5, 17, 20, 25, 299.95, 569.01, 745, 778.17, 792.31,
                 817.61, 825, 873.99, 900, 925, 942.85, 987, 987.8, 1024.99,
                 1050.98, 1114.99].map((p,i) => ({ landed: p, title: 'listing ' + i }));

console.log('Giratina V #186 — the real spread from the audit\n');
const r = o.flagOutliers(gira186);
console.log(`  median $${r.stats.median.toFixed(2)}  low $${r.stats.low}  high $${r.stats.high}  spread ${r.stats.spread}x`);
console.log(`  flagged ${r.stats.flagged} of ${r.stats.count}\n`);
r.listings.filter(l => l.suspect).forEach(l =>
  console.log(`    ${l.suspect.padEnd(16)} $${l.landed}  — ${l.suspectReason}`));

chk('$2.08 flagged', r.listings.find(l => l.landed === 2.08).suspect);
chk('$8.50 flagged (the Fan Art one)', r.listings.find(l => l.landed === 8.5).suspect);
chk('$17 flagged', !!r.listings.find(l => l.landed === 17).suspect);
chk('$299 NOT flagged', !r.listings.find(l => l.landed === 299.95).suspect);
chk('$1114 NOT flagged', !r.listings.find(l => l.landed === 1114.99).suspect);

console.log('\nA genuinely cheap card must NOT be flagged\n');
const grimer = [0.99,0.99,0.99,0.99,0.99,0.99,0.99,1,1.12,1.12,1.12]
  .map(p => ({ landed: p }));
const r2 = o.flagOutliers(grimer);
chk('median $' + r2.stats.median + ' below the floor — test not applied', !r2.stats.applied);
chk('  reason: ' + r2.stats.reason, r2.stats.flagged === 0);

console.log('\nA thin sample must NOT be judged\n');
const thin = [900, 950, 2.5].map(p => ({ landed: p }));
const r3 = o.flagOutliers(thin);
chk('3 listings — not applied', !r3.stats.applied);
chk('  nothing flagged on a sample of 3', r3.stats.flagged === 0);

console.log('\nAn honest spread must survive\n');
const honest = [42,45,48,50,52,55,58,60,65,70].map(p => ({ landed: p }));
const r4 = o.flagOutliers(honest);
chk('normal variation — 0 flagged', r4.stats.flagged === 0);

// ── A median the fakes set (2026-10-04) ────────────────────────
// Shining Charizard 107/105, Raw NM, all eight eBay sites, 144 rows past the
// gate, every photo labelled by eye: 116 gold/black metal replicas (m), 24
// genuine English copies (g), 2 genuine foreign (f), 2 unclear (u). Stored
// number-matched price that day: $1,700.99 (TCGdex/TCGplayer, current).
console.log('\nShining Charizard — a feed that is mostly fakes cannot judge itself\n');
const scM = [1,4,5,5.02,5.99,7.5,7.72,8,9.85,9.85,10.36,11,12.5,14.99,20,20,20,23,25,25.2,25.75,26.5,
  26.72,27.97,31.94,33.81,40,44.26,46.46,46.74,50,50,50,54.51,59.64,65,69.18,70,70.23,72.49,73.44,75,75,
  77.7,81.93,95,112.36,120,138.21,139.33,147.11,150,158.4,176.63,200,200,248.84,250,250,267.69,271.12,
  276.03,290,300,300,310.63,337.08,350,350,355,392,449.94,500,619.89,650,650,650,669.93,785,790.27,
  790.83,800,825,850,893.1,949.99,980,1000,1000,1000,1200,1299,1300,1450,1462.73,1500,1500,1500,1500,
  1517.35,1524.6,1566.58,1582.7,1600,1600,1764.79,1777,2378.35,2462.5,2514.33,2984.28,5000,7000,12000,
  19837.63,22000];
const scG = [944.21,1096.06,1254.22,1368.17,1368.17,1371.33,1458.11,1563.62,2078.09,2284.46,2499,2500,
  2525,2970.22,3019.81,3174.22,3500,4250,4399,4496.95,5631.58,6988.82,12499,35000,3406.77,5624.85];
const sc = scM.map(p => ({ landed: p, k: 'm' })).concat(scG.map(p => ({ landed: p, k: 'g' })),
  [{ landed: 29.58, k: 'u' }, { landed: 1004.51, k: 'u' }]);
const count = (res, k) => res.listings.filter(l => l.k === k && l.suspect).length;
const feed = o.flagOutliers(sc);
const anch = o.flagOutliers(sc, { reference: { price: 1700.99, source: 'tcgdex_tcgplayer_holofoil' } });
console.log(`  feed median $${feed.stats.median.toFixed(2)}: ${count(feed, 'm')} of 116 replicas flagged`);
console.log(`  catalogue $${anch.stats.basisPrice}: ${count(anch, 'm')} of 116 replicas flagged`);
chk('without a reference the fakes set the median (~$421) and $72.49 passes',
    feed.stats.median < 450 && !feed.listings.find(l => l.landed === 72.49).suspect);
chk('with the stored $1,700.99 the $72.49 replica is flagged',
    !!anch.listings.find(l => l.landed === 72.49).suspect);
chk('...and the C$100 one ($70.23)', !!anch.listings.find(l => l.landed === 70.23).suspect);
chk('basis says catalogue, and the feed median is still reported',
    anch.stats.basis === 'catalogue' && anch.stats.reference.used && anch.stats.median === feed.stats.median);
// eBay API licence §9.5 / §8.1(d) (Roy, 2026-10-08): the reason names OUR
// catalogue price and never the listings' median.
chk('the reason names the catalogue price and NOT the listings\' median', /\$1700\.99 catalogue price/.test(anch.listings.find(l => l.landed === 72.49).suspectReason) &&
    !/420\.97/.test(anch.listings.find(l => l.landed === 72.49).suspectReason));
chk('KEEPS: 0 of 26 genuine copies flagged (cheapest $944.21)', count(anch, 'g') === 0);
chk('replicas flagged rise (27 -> 53 of 116)', count(feed, 'm') === 27 && count(anch, 'm') === 53);
// A reference never lowers the bar: below the feed median it is not used.
const low = o.flagOutliers(gira186, { reference: { price: 100 } });
chk('a reference BELOW the feed median is ignored (Giratina flags unchanged)',
    low.stats.basis === 'listings' && low.stats.flagged === r.stats.flagged && low.stats.reference.used === false);
// It does not open a thin sample, and lifts no cheap card over the floor wrongly.
chk('a reference does not judge a 3-listing sample', !o.flagOutliers(thin, { reference: { price: 2000 } }).stats.applied);
const h2 = o.flagOutliers(honest, { reference: { price: 60 } });
chk('an honest spread near its stored price: 0 flagged', h2.stats.applied && h2.stats.flagged === 0);

console.log('\nFlagged listings sort last, not by price\n');
const sorted = o.sortWithSuspectsLast(r.listings);
chk('cheapest trustworthy row is first ($' + sorted[0].landed + ')', !sorted[0].suspect);
chk('flagged rows are at the end', !!sorted[sorted.length-1].suspect);

// ── The floor judges the ITEM price (Roy, 2026-10-07) ──────────
// The ZIP union showed postage lifting flagged rows over the line: Pikachu
// SM162 $10 (flagged under $17.00) became $10 + $8.80 = $18.80, over $18.00.
// And anyone can clear the floor by moving money from price into postage.
console.log('\nThe floor judges what the seller asks, not price + postage\n');
{
const row =(price, shipping, extra) => Object.assign({ price, shipping, landed: +(price + (shipping || 0)).toFixed(2) }, extra || {});
const feed = Array.from({ length: 30 }, (_, i) => row(160 + i * 2, 5));        // item median ~$189
const pikachu = row(10, 8.80, { id: 'pika' });                                  // the real case's shape
const laundered = row(5, 25, { id: 'launder' });                                 // price moved into postage
const honestCheap = row(24, 5, { id: 'honest' });                                // 13% of median: a real bargain
const all = feed.concat([pikachu, laundered, honestCheap]);
const byItem = o.flagOutliers(all), byDelivered = o.flagOutliers(all, { judgeBy: 'delivered' });
const flagged = (r, id) => !!r.listings.find(l => l.id === id).suspect;
chk('item price: the $10 + $8.80 row is flagged ($10 is under 10% of the median)', flagged(byItem, 'pika'));
chk('item price: $5 + $25 postage is flagged — moving money into shipping does not clear the floor', flagged(byItem, 'launder'));
chk('item price KEEPS an honest cheap row (13% of the median)', !flagged(byItem, 'honest'));
chk('the stats say what was judged', byItem.stats.judgedOn === 'item price' && byDelivered.stats.judgedOn === 'delivered price');
chk('the old rule (delivered, measurement only) misses the laundered row — the bug, reproduced', !flagged(byDelivered, 'launder'));
const rank = o.sortWithSuspectsLast(byItem.listings);
chk('ranking still uses the DELIVERED price: cheapest trusted first by price + postage',
    !rank[0].suspect && rank.filter(l => !l.suspect).every((l, i, a) => i === 0 || a[i - 1].landed <= l.landed));
chk('a row with no item price is judged on what it has (landed)', o.flagOutliers(feed.concat([{ id: 'x', landed: 3 }])).listings.find(l => l.id === 'x').suspect);
}

// ── The headline's seller floor (Roy, 2026-10-07) ──────────────
console.log('\nThe headline needs a seller with a record\n');
{
const eb = (score, percent) => ({ source: 'ebay', price: 50, landed: 55, live: true, sellerFeedback: { score, percent } });
chk('the floor is 10 feedback at 95% positive (below the vouching bar 100 @ 98%)',
    o.HEADLINE_SELLER.minScore === 10 && o.HEADLINE_SELLER.minPercent === 95);
chk('tonight\'s headline sellers fail it: 0 @ 0%, 1 @ 100%, 4 @ 100%, 5 @ 100%, -4 @ 0%, 78 @ 0%',
    [[0, 0], [1, 100], [4, 100], [5, 100], [-4, 0], [78, 0]].every(([s, p]) => !o.headlineEligible(eb(s, p))));
chk('KEEPS an established seller: 10 @ 95% (the edge), 69 @ 100%, 251 @ 100%, 2,906 @ 99.9%',
    [[10, 95], [69, 100], [251, 100], [2906, 99.9]].every(([s, p]) => o.headlineEligible(eb(s, p))));
chk('just under the edge fails: 9 @ 100%, 500 @ 94.9%', !o.headlineEligible(eb(9, 100)) && !o.headlineEligible(eb(500, 94.9)));
chk('a shop\'s ask (no feedback exists) passes; an eBay seller we cannot see does not',
    o.headlineEligible({ source: 'yuyutei', price: 50, landed: 50, live: true }) && !o.headlineEligible({ source: 'ebay', price: 50, landed: 55, live: true }));
chk('the floor never rescues a flagged row or a current bid',
    !o.headlineEligible(Object.assign(eb(5000, 100), { suspect: 'unusually-cheap' })) && !o.headlineEligible(Object.assign(eb(5000, 100), { priceKind: 'current-bid' })));
const S = require('fs').readFileSync(__dirname + '/server.js', 'utf8');
chk('the payload\'s headline fields come from headlineEligible, and it says how many cheaper rows it stepped over',
    /const trusted = listings\.filter\(outlier\.headlineEligible\);/.test(S) && /cheapestLive: \(headLive \|\| \{\}\)\.landed \?\? null,/.test(S)
    && /headlineFloor: \{ minScore: outlier\.HEADLINE_SELLER\.minScore/.test(S));
const P = require('fs').readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
chk('the page says plainly beside the headline: how many, why, and that they are still listed',
    /d\.headlineFloor && d\.headlineFloor\.skippedCheaper/.test(P) && /not used as the cheapest trusted listing because the seller/.test(P) && /still listed below/.test(P));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
