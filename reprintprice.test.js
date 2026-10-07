// reprintprice.test.js — flag listings priced AT a known reprint, both directions
//
//   node reprintprice.test.js
//
// The data is real: /api/listings on Render, Raw, 2026-09-27.
//   en-ecard2-149  Aquapolis Lugia 149/147         28 kept
//   en-30th-c-029  30th Classic Collection Lugia    32 kept
// 14 of the 28 "Aquapolis" rows sit at $350-$500 and name no reprint.
'use strict';
const outlier = require('./outlier');
const cm = require('./cardmatch');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

const AQUAPOLIS = [350, 350, 350, 385, 390, 400, 400, 400, 400, 400, 400, 443.77, 450, 500,
                   1500, 2078.75, 2100, 2500, 3265, 3553.88, 3999.99, 4308.99, 6287.83,
                   10844.23, 10923.97, 11474, 12000, 15050];
const THIRTIETH = [375, 397.4, 399.99, 400, 400, 400, 400, 400, 405.99, 410, 420, 420, 440, 450,
                   450, 450, 450, 455.55, 459.63, 469.82, 499.95, 499.99, 500, 500, 500, 599, 600,
                   676.67, 690, 700, 800, 950];
const rows = ps => ps.map((p, i) => ({ title: 'row ' + i, landed: p, price: p }));
const R30 = { cardId: 'en-30th-c-029', label: '30th Celebration (2026)', prices: THIRTIETH };
// en-ecard2-149's stored tcgplayer_market, 2026-09-26.
const MKT = { marketPrice: 4500 };

// ── the case itself ──
{
  // The ordinary test first: it must still see nothing here, which is WHY
  // this second test exists. Its threshold is untouched.
  const base = outlier.flagOutliers(rows(AQUAPOLIS));
  ok(base.stats.applied && base.stats.flagged === 0,
     'the global ratio still flags none of the Aquapolis feed (median ' + base.stats.median + ')');
  ok(outlier.SUSPECT_RATIO === 0.10, 'SUSPECT_RATIO unchanged at 0.10');

  const { listings, stats } = outlier.flagReprintPriced(base.listings, R30, MKT);
  const flagged = listings.filter(l => l.suspect === 'reprint-priced').map(l => l.landed);
  ok(stats.applied, 'applied: ' + stats.reason);
  ok(flagged.length === 14, `the 14 rows at $350-$500 are flagged (got ${flagged.length}: ${flagged})`);
  ok(flagged.every(p => p <= 500), 'nothing above $500 flagged');
  ok(listings.filter(l => l.landed >= 1500).every(l => !l.suspect), 'every $1,500+ original untouched');
  const r = listings.find(l => l.suspect === 'reprint-priced');
  ok(/30th Celebration \(2026\) median/.test(r.suspectReason) && /may be the reprint/.test(r.suspectReason),
     'reason names what it matched: ' + r.suspectReason);
  ok(!outlier.trustworthy(r), 'a reprint-priced row cannot be the headline cheapest');
  ok(outlier.suspectRank(r) === 1, 'it sorts after clean rows');
  ok(listings.length === AQUAPOLIS.length, 'FLAGS, never removes: every row is still there');
  const sorted = outlier.sortWithSuspectsLast(listings);
  ok(sorted[0].landed === 1500, 'cheapest trustworthy row is now $1,500, the first genuine original');
}

// ── what it must KEEP ──
{
  // A genuine original at a fair price, beside the same reprint data.
  const { listings } = outlier.flagReprintPriced(rows([1500, 2100, 3999, 4200, 6000, 11000]), R30, MKT);
  ok(listings.every(l => !l.suspect), 'fair-priced originals are not flagged');
}
{
  // Near the band but outside it: the band is the reprint's IQR +15%.
  const { listings, stats } = outlier.flagReprintPriced(rows([650, 700, 3000, 4000, 5000, 9000]), R30, MKT);
  ok(stats.applied && listings.every(l => !l.suspect),
     `$650/$700 sit outside the band ${JSON.stringify(stats.band)} and are kept`);
}
{
  // A card that trades LIKE its reprint: price is no evidence, flag nothing.
  // (Every listing $380-$620 — the original is not priced apart.)
  const { listings, stats } = outlier.flagReprintPriced(rows([380, 400, 420, 450, 470, 500, 560, 620]), R30, MKT);
  ok(!stats.applied && listings.every(l => !l.suspect), 'original priced like the reprint: nothing flagged — ' + stats.reason);
}
{
  // Originals above the band exist but are not far enough apart (< 2.5x).
  const { stats } = outlier.flagReprintPriced(rows([400, 420, 600, 700, 800, 900, 1000]), R30, MKT);
  ok(!stats.applied, 'separation below 2.5x the reprint median: not applied');
}
{
  // Only two originals above the band: not enough to say it prices apart.
  const { stats } = outlier.flagReprintPriced(rows([400, 420, 450, 5000, 9000]), R30, MKT);
  ok(!stats.applied && stats.originalAbove === 2, 'two rows above the band are not enough');
}
{
  // Too few reprint listings to know where it trades.
  const { stats, listings } = outlier.flagReprintPriced(rows(AQUAPOLIS),
    { cardId: 'x', label: 'X', prices: [400, 450, 500] });
  ok(!stats.applied && listings.every(l => !l.suspect), 'three reprint prices are too few');
}
{
  // No reprint data at all.
  const { stats } = outlier.flagReprintPriced(rows(AQUAPOLIS), null);
  ok(!stats.applied, 'null reprint: not applied');
}
{
  // A stronger flag stands.
  const input = rows(AQUAPOLIS);
  input[0].suspect = 'implausible'; input[0].suspectReason = 'kept';
  const { listings } = outlier.flagReprintPriced(input, R30, MKT);
  ok(listings[0].suspect === 'implausible' && listings[0].suspectReason === 'kept', 'an existing flag is not overwritten');
}
{
  // Input rows are not mutated.
  const input = rows(AQUAPOLIS);
  outlier.flagReprintPriced(input, R30, MKT);
  ok(input.every(l => !l.suspect), 'input listings are not mutated');
}

// ── the catalogue must agree, independently of the feed ──
{
  const { stats, listings } = outlier.flagReprintPriced(rows(AQUAPOLIS), R30);
  ok(!stats.applied && listings.every(l => !l.suspect) && /no stored market price/.test(stats.reason),
     'no stored market price: not applied, and says so');
}
{
  const { stats } = outlier.flagReprintPriced(rows(AQUAPOLIS), R30, { marketPrice: 900 });
  ok(!stats.applied && stats.reason.includes('stored market price $900'),
     'a stored price under 2.5x the reprint median vetoes the feed: ' + stats.reason);
}
{
  const { stats } = outlier.flagReprintPriced(rows(AQUAPOLIS), R30, { marketPrice: 0 });
  ok(!stats.applied, 'a zero stored price is no price');
}
{
  // Base Set Charizard, Raw, live 2026-09-27: the whole feed is $21-$350 —
  // damaged genuine copies really do trade at the reprint's level — against
  // 30th CC Charizard at a $290 median. Stored market $944.53 would pass
  // the catalogue test on its own; the FEED test must still refuse, or
  // half the genuine raw Charizards would be flagged.
  const CHARIZARD = [21.48, 45, 60, 85, 99, 120, 150, 180, 199, 210, 225, 240, 250, 260, 275,
                     280, 290, 299, 300, 300, 310, 320, 325, 340, 350];
  const THIRTIETH_ZARD = [230, 240, 250, 260, 270, 280, 285, 289.64, 290, 295, 300, 320, 340, 360, 380];
  const { stats, listings } = outlier.flagReprintPriced(rows(CHARIZARD),
    { cardId: 'en-30th-c-001', label: '30th Celebration (2026)', prices: THIRTIETH_ZARD },
    { marketPrice: 944.53 });
  ok(!stats.applied && listings.every(l => !l.suspect),
     'Base Set Charizard raw: the feed does not price apart, so nothing flagged — ' + stats.reason);
}

{
  // Claydol 15/106, live: market $5.15, a 2008 "MP" copy at $1.99 beside a
  // $2 Celebrations reprint. Under the $15 floor, nothing is judged.
  const { stats } = outlier.flagReprintPriced(rows([1.99, 2, 2.5, 4, 5, 5.5, 6, 6]),
    { cardId: 'en-cel25cc-CC016', label: 'Celebrations (2021)', prices: [1.5, 1.8, 2, 2, 2, 2.2, 2.5] },
    { marketPrice: 5.15 });
  ok(!stats.applied && /under \$15/.test(stats.reason), 'a $5 card is below the floor: ' + stats.reason);
}
{
  // A seller-stated played copy has its own explanation: kept, and counted.
  const input = rows(AQUAPOLIS);
  input[0].sellerCondition = 'DMG'; input[1].sellerCondition = 'MP'; input[2].sellerCondition = 'HP';
  input[3].sellerCondition = 'NM';  input[4].sellerCondition = 'LP';
  const { listings, stats } = outlier.flagReprintPriced(input, R30, MKT);
  ok(!listings[0].suspect && !listings[1].suspect && !listings[2].suspect, 'DMG / MP / HP copies at the reprint level are kept');
  ok(listings[3].suspect === 'reprint-priced' && listings[4].suspect === 'reprint-priced', 'NM and LP at the reprint level are still flagged');
  ok(stats.exemptPlayed === 3 && stats.flagged === 11, `exemptions are counted (${stats.exemptPlayed} exempt, ${stats.flagged} flagged)`);
}

// ── it can only fire where a reprint mapping exists ──
ok(cm.reprintCardsOf({ api_card_id: 'en-ecard2-149', number: '149' }).map(r => r.cardId).join() === 'en-30th-c-029',
   'Aquapolis Lugia -> en-30th-c-029');
ok(cm.reprintCardsOf({ api_card_id: 'en-base1-4', number: '4' }).map(r => r.cardId).sort().join() ===
   'en-30th-c-001,en-cel25cc-CC002', 'Base Set Charizard -> both reprints');
ok(cm.reprintCardsOf({ api_card_id: 'en-base1-04', number: '004' }).length === 2, 'zero-padding does not hide the mapping');
for (const id of ['en-sv03.5-6', 'en-swsh11-186', 'ja-SV2a-201', 'en-30th-c-029', 'en-cel25cc-CC002', 'en-base1-5']) {
  const [, , n] = id.match(/^(\w+)-.+-([^-]+)$/) || [];
  ok(cm.reprintCardsOf({ api_card_id: id, number: n }).length === 0, id + ' has no reprint mapping, so is never checked');
}
// Every mapping resolves to a family.
let all = 0;
for (const [rset, t] of Object.entries(cm.REPRINT_OF)) for (const [, [orig]] of Object.entries(t)) {
  const i = orig.lastIndexOf('-');
  const got = cm.reprintCardsOf({ api_card_id: 'en-' + orig, number: orig.slice(i + 1) });
  all++;
  ok(got.some(r => r.cardId.startsWith('en-' + rset + '-') && r.family), `en-${orig} maps to a ${rset} card with a family`);
}
ok(all === 55, 'all 55 REPRINT_OF rows checked (got ' + all + ')');

// ── wired, and wired once ──
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
ok(/cm\.reprintCardsOf\(card\)/.test(server), 'gatherListings asks for the reprint cards');
ok(/outlier\.flagReprintPriced\(/.test(server), 'gatherListings applies the reprint band');
ok(/noReprintCheck: true/.test(server), 'the reprint fetch cannot recurse');
ok(server.includes('{ marketPrice }') && server.includes('mp && mp.isReal ? mp.price : null'),
   'gatherListings passes the stored REAL price, never an estimate');
ok((server.match(/flagReprintPriced\(/g) || []).length === 1, 'one call site, inside gatherListings, so /api/listings and /api/search agree');

// ── Item price, not price + postage (2026-10-07) ──────────────
// Base Set Blastoise 2/102, Raw NM, union view: two Celebrations Classic
// Collection reprints (eBay's Set aspect says so; Roy checked by eye) at
// $23.99 + $6.07 and $25.00 + $5.38 escaped the CC001 band $16.06-$25.37,
// because the band test read the delivered price ($30.06, $30.38).
{
  const cc001 = { cardId: 'en-cel25cc-CC001', label: 'Celebrations (2021)',
    prices: [16.5, 18, 19, 19.5, 20, 20.5, 21, 22, 22.5, 23, 24] };      // median $20.50, as measured
  const genuine = [180, 190, 200, 205, 210, 213.5, 215, 220, 230, 240].map(p => ({ title: 'genuine', price: p, shipping: 5, landed: p + 5 }));
  const reprints = [{ title: 'cardspread', price: 23.99, shipping: 6.07, landed: 30.06 }, { title: 'erwill6713', price: 25, shipping: 5.38, landed: 30.38 }];
  const { listings, stats } = outlier.flagReprintPriced(genuine.concat(reprints), cc001, { marketPrice: 222.49 });
  const flagged = t => listings.find(l => l.title === t).suspect === 'reprint-priced';
  ok(stats.applied && flagged('cardspread') && flagged('erwill6713'),
     'Blastoise: $23.99 + $6.07 and $25.00 + $5.38 are reprint-priced — the band judges what the seller asks', JSON.stringify(stats.band));
  ok(listings.filter(l => l.title === 'genuine').every(l => !l.suspect), '...and every genuine Blastoise ($180-$240) is kept');
  // The old rule, for the record: delivered prices sit above the band.
  ok(reprints.every(r => r.landed > stats.band[1]) && reprints.every(r => r.price <= stats.band[1]),
     'the delivered prices ($30.06, $30.38) are above the band its item prices sit inside — the bug, reproduced');
  ok(/rows\.filter\(outlier\.trustworthy\)\.map\(outlier\.itemPriceOf\)/.test(server),
     'the reprint\'s own band is built from ITEM prices too (server.js)');
}

console.log(`\nreprintprice.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
