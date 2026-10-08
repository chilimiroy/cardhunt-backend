/**
 * sourcerank.test.js — node sourcerank.test.js
 *
 * Standalone, like jptest.js and cardparse.test.js.
 *
 * The case that matters most is the LAST one in ALLOW and the FIRST in
 * SKIP: a nightly `refresh ja` must not put a Yahoo mirror price back over
 * the Yuyu-tei price that corrected it.
 */
// sourcerank.js is local-only (gitignored: ingest's price writer), so a
// clone does not have it. Say so plainly instead of throwing
// MODULE_NOT_FOUND; there is nothing here to test without it.
const TC = require('./testcount')(48);   // assertions in a plain run — fewer fails the file (testcount.js)
if (!require('fs').existsSync(__dirname + '/sourcerank.js')) {
  TC.skip(48, 'sourcerank.test.js — sourcerank.js is local-only (gitignored) and not in this checkout');
  console.log('\n  0 passed, 0 failed');
  process.exit(0);
}
const sr = require('./sourcerank');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) console.log(`  FAIL  ${label}\n        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  return ok;
};

// ── ranks ─────────────────────────────────────────────────────
const RANK_CASES = [
  ['tcgplayer_market', sr.HIGH], ['tcgplayer_holofoil', sr.HIGH],
  ['tcgplayer_reverseHolofoil', sr.HIGH], ['yuyutei_shop', sr.HIGH],
  ['yahoojp_3', sr.MEDIUM], ['yahoojp_50', sr.MEDIUM], ['yahoojp_avg_12', sr.MEDIUM],
  ['cardmarket_trend', sr.MEDIUM], ['cardmarket_avg', sr.MEDIUM],
  ['ebay_api', sr.MEDIUM], ['scraper', sr.MEDIUM],
  ['estimate', sr.LOW],
  // unrecognised must land in the middle, never at the top
  ['something_new', sr.DEFAULT_RANK], ['', sr.DEFAULT_RANK], [null, sr.DEFAULT_RANK],
  // anchoring: a lookalike must not inherit HIGH
  ['yuyutei_shop_experimental', sr.DEFAULT_RANK],

  // ── TCGdex, TASK.md T1 ──
  ['tcgdex_tcgplayer_normal', sr.HIGH],
  ['tcgdex_tcgplayer_reverse', sr.HIGH],
  ['tcgdex_cardmarket', sr.MEDIUM]
];

// ── overwrite decisions ───────────────────────────────────────
const ALLOW = [
  ['yahoojp_3',    null,             'first price for a card'],
  ['yahoojp_3',    'estimate',       'a market observation beats a derived one'],
  ['yuyutei_shop', 'estimate',       'shop price beats an estimate'],
  ['yuyutei_shop', 'yahoojp_3',      'shop separates printings Yahoo cannot'],
  ['tcgplayer_market', 'yahoojp_3',  'marketplace beats auction median'],
  ['yahoojp_9',    'yahoojp_3',      'same source, newer wins — a real price move'],
  ['yuyutei_shop', 'yuyutei_shop',   'same source re-run'],
  ['tcgplayer_market', 'yuyutei_shop', 'equal confidence may replace'],
  ['yuyutei_shop', 'tcgplayer_market','equal confidence may replace'],

  // ── TCGdex must be ABLE to price, or T1 delivers nothing ──
  // The whole point of T1 is filling gaps. A rank that blocks every
  // TCGdex write would pass a skip-only test and add zero prices.
  ['tcgdex_tcgplayer_normal', null,        'TCGdex prices a card nothing else reached'],
  ['tcgdex_tcgplayer_normal', 'estimate',  'a real marketplace beats a derived estimate'],
  ['tcgdex_cardmarket',       'estimate',  'EU aggregate still beats an estimate'],
  ['tcgdex_cardmarket',       null,        'cardmarket-only cards get their first real price'],
  ['tcgdex_tcgplayer_normal', 'yahoojp_3', 'productId-keyed marketplace beats an auction median'],
  ['tcgdex_tcgplayer_normal', 'yuyutei_shop', 'validated at 37/37 vs our scrape, so equal to HIGH'],
  ['tcgdex_tcgplayer_normal', 'tcgplayer_market',
                                           'the two paths agreed; either may carry the newer number'],
  ['tcgplayer_market', 'tcgdex_tcgplayer_normal', 'and symmetrically back'],
  ['tcgdex_tcgplayer_normal', 'tcgdex_tcgplayer_normal', 'same source re-run']
];

const SKIP = [
  ['yahoojp_3',   'yuyutei_shop',     'THE T1 CASE — nightly refresh must not undo jpreconcile'],
  ['yahoojp_22',  'tcgplayer_market', 'auction median must not demote a marketplace price'],
  ['estimate',    'yahoojp_3',        'an estimate never replaces an observation'],
  ['estimate',    'yuyutei_shop',     'an estimate never replaces a shop price'],
  ['cardmarket_trend', 'yuyutei_shop','medium never demotes high'],
  ['something_new',    'yuyutei_shop','an unknown source never demotes a known-good one'],

  // ── TCGdex Cardmarket must not re-price Japan to EU retail ──
  // cmcheck measured Cardmarket at a median 1.595x above the Japanese
  // sources on genuinely comparable cards. Letting it overwrite would
  // silently mark the JP catalogue up ~60% to European retail.
  ['tcgdex_cardmarket', 'yuyutei_shop',      'EU premium must not overwrite a JP shop price'],
  ['tcgdex_cardmarket', 'tcgplayer_market',  'EU aggregate must not demote a US marketplace price'],
  ['tcgdex_cardmarket', 'tcgdex_tcgplayer_normal',
                                             'within TCGdex, the marketplace price outranks the EU aggregate'],
  ['estimate',          'tcgdex_tcgplayer_normal', 'an estimate never replaces a TCGdex observation'],
  ['estimate',          'tcgdex_cardmarket', 'an estimate never replaces a TCGdex observation']
];

console.log(`\n${'='.repeat(72)}`);
console.log('  SOURCE CONFIDENCE');
console.log(`${'='.repeat(72)}\n`);

for (const [src, want] of RANK_CASES)
  eq(`rank(${JSON.stringify(src)})`, sr.sourceRank(src), want);
console.log(`  ranks: ${RANK_CASES.length} cases`);

console.log('\n  MUST ALLOW');
for (const [next, cur, why] of ALLOW) {
  const ok = eq(`allow ${next} over ${cur}`, sr.canOverwrite(next, cur), true);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${String(next).padEnd(18)} over ${String(cur).padEnd(18)} ${why}`);
}

console.log('\n  MUST SKIP');
for (const [next, cur, why] of SKIP) {
  const ok = eq(`skip ${next} over ${cur}`, sr.canOverwrite(next, cur), false);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${String(next).padEnd(18)} over ${String(cur).padEnd(18)} ${why}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log(`  (${ALLOW.length} of ${ALLOW.length + SKIP.length} decision cases assert an overwrite is ALLOWED —`);
console.log('   a gate tested only on what it blocks would pass by blocking everything)\n');
process.exit(fail ? 1 : 0);
