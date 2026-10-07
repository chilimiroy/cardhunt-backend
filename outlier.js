// ══════════════════════════════════════════════════════════════
// outlier.js — flag listings that are too cheap to be the real card
//
// Some fakes declare themselves — "custom", "proxy", "fan art" — and a
// keyword list catches those. The expensive ones declare nothing:
//
//   Giratina V 186/196 Lost Origin Ultra Rare Full Art      $2.08
//   Giratina V 186/196 Alternate Art Ultra Rare Lost Origin  $1,114.99
//
// Same card number, same set, 500x apart. The title of the first is
// indistinguishable from a genuine listing, so no word can reject it.
//
// The card's own listings can. A price far below the median of its
// peers is either a proxy, a damaged card sold as NM, a mislabelled
// listing, or a scam — and in every one of those cases it is not the
// thing the user is looking for.
//
// This FLAGS rather than rejects. A genuine bargain exists, and
// removing it silently would be its own failure. The UI should show it,
// ranked last, marked.
//
//   const { flagOutliers } = require('./outlier');
//   const { listings, stats } = flagOutliers(kept);
// ══════════════════════════════════════════════════════════════

// Below this share of the median, a listing is suspect. 0.1 means
// "an order of magnitude cheaper than its peers".
const SUSPECT_RATIO = 0.10;
// And this much again is beyond doubt.
const IMPLAUSIBLE_RATIO = 0.03;
// Fewer listings than this and the median means little.
const MIN_SAMPLE = 5;
// Cheap cards have wide relative spreads for honest reasons, so only
// apply the test where the median is high enough to matter.
const MIN_MEDIAN = 15;

function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// An auction's CURRENT bid (T0, 2026-10-04) is not a price anyone can buy
// at: a $1 opening bid with three days left would set the median and become
// the card's cheapest. Shown, labelled, sorted by its bid — never a baseline,
// never judged against one, never the headline.
const isCurrentBid = l => !!l && l.priceKind === 'current-bid';
function priceOf(l) {
  const p = l.landed != null ? l.landed : l.price;
  const n = parseFloat(p);
  return isFinite(n) && n > 0 ? n : null;
}
// The cheap floor judges the ITEM price (Roy, 2026-10-07): what the seller
// asks for the card. Postage is no evidence a listing is genuine, and judging
// the delivered price let a shipping quote lift a flagged row over the line —
// the ZIP union's headline drops, Pikachu SM162 $10 (flagged under $17) became
// $10 + $8.80 = $18.80 (over $18.00, by 80 cents) — and lets any seller clear
// the floor by moving money from price into postage. priceOf (delivered)
// still ranks and is shown; only the judgement uses this.
function itemPriceOf(l) {
  const p = l.price != null ? l.price : l.landed;
  const n = parseFloat(p);
  return isFinite(n) && n > 0 ? n : null;
}

// ── A median the fakes set themselves (2026-10-04) ────────────
// Shining Charizard 107/105, Raw NM, all eight eBay sites: 144 rows past the
// gate, ~116 of them gold/black metal replicas (labelled by eye). Their
// median, $420.97, became the yardstick, so a $72.49 replica sat at 0.17x
// and was not flagged — while every genuine copy asked $944 or more and the
// catalogue's own number-matched price was $1,700.99. When most of the feed
// is wrong, the feed cannot judge itself.
//
// opts.reference: { price, source, recordedAt } — the stored, number-matched,
// base-printing raw price, passed ONLY when it is real and current (the
// caller checks pricequality: not old, not thin, not unsettled). It is used
// when it sits ABOVE the feed's median; it never lowers the bar. Measured on
// the 1,010 labelled rows over 12 cards: at the same 10% ratio, 0 of 864
// right rows flagged (as before), different illustrations 10 -> 15 of 24,
// metal/recolour 5 -> 8 of 38. Still FLAGS, never removes.
function flagOutliers(listings, opts) {
  opts = opts || {};
  const ratio       = opts.suspectRatio     || SUSPECT_RATIO;
  const hardRatio   = opts.implausibleRatio || IMPLAUSIBLE_RATIO;
  const minSample   = opts.minSample        || MIN_SAMPLE;
  const minMedian   = opts.minMedian        || MIN_MEDIAN;

  // Item price for the median and for every row (itemPriceOf). opts.judgeBy
  // 'delivered' is the rule before 2026-10-07, kept ONLY so the deals probe
  // can measure both on the same rows; nothing else passes it.
  const judgeOf = opts.judgeBy === 'delivered' ? priceOf : itemPriceOf;
  const out = listings.map(l => Object.assign({}, l));
  const prices = out.filter(l => !isCurrentBid(l)).map(judgeOf).filter(p => p !== null);

  const stats = {
    count: out.length, priced: prices.length,
    median: median(prices), low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
    applied: false, reason: null, flagged: 0,
    basis: 'listings', basisPrice: null, reference: null
  };

  const ref = opts.reference;
  const refPrice = ref && isFinite(Number(ref.price)) && Number(ref.price) > 0 ? Number(ref.price) : null;
  if (refPrice) stats.reference = { price: refPrice, source: ref.source || null,
                                    recordedAt: ref.recordedAt || null, used: false };

  if (prices.length < minSample) {
    stats.reason = `only ${prices.length} priced listings — too few to judge an outlier`;
    return { listings: out, stats };
  }
  const useRef = refPrice != null && refPrice > stats.median;
  const basis = useRef ? refPrice : stats.median;
  if (basis < minMedian) {
    stats.reason = `median $${stats.median.toFixed(2)} is below $${minMedian} — ` +
                   'cheap cards spread widely for honest reasons';
    return { listings: out, stats };
  }

  stats.applied = true;
  stats.basis = useRef ? 'catalogue' : 'listings';
  stats.basisPrice = basis;
  if (useRef) stats.reference.used = true;
  stats.spread = stats.high && stats.low ? +(stats.high / stats.low).toFixed(1) : null;
  const against = useRef
    ? `this card's $${basis.toFixed(2)} catalogue price (the listings' own median, ` +
      `$${stats.median.toFixed(2)}, sits below it)`
    : `the $${basis.toFixed(2)} median for this card`;

  stats.judgedOn = opts.judgeBy === 'delivered' ? 'delivered price' : 'item price';
  for (const l of out) {
    const p = judgeOf(l);
    if (p === null || isCurrentBid(l)) continue;
    const r = p / basis;
    if (r <= hardRatio) {
      l.suspect = 'implausible';
      l.suspectReason = `$${p.toFixed(2)} is ${Math.round(1 / r)}x below ${against} — ` +
        'almost certainly not the real card';
      stats.flagged++;
    } else if (r <= ratio) {
      l.suspect = 'unusually-cheap';
      l.suspectReason = `$${p.toFixed(2)} against ${against} — check the listing carefully`;
      stats.flagged++;
    }
  }

  return { listings: out, stats };
}

// ── Priced AT a known reprint ─────────────────────────────────
// Aquapolis Lugia 149/147, Raw, measured live 2026-09-27: 28 listings past
// the gate, 14 of them at $350-$500 and naming no reprint. The 30th
// Celebration Classic Collection Lugia reprints it with the same number; its
// own 32 listings run $375-$950, median $450. The genuine 2003 card runs
// $1,500-$15,050.
//
// "Cheap for this card" cannot see those rows: they are HALF the feed, so
// they drag the median to $1,000 and sit at 0.35-0.5x of it. The sharper
// question is "priced exactly where the reprint trades?", and it can only
// be asked where a reprint relationship is KNOWN (cardmatch REPRINT_OF) —
// so it cannot touch a card without one. The global ratio is not loosened.
//
// Four conditions, all required, so a genuine listing at a fair price is
// not caught because a number nearby happens to be similar:
//   1. the reprint has enough priced listings to have a band (MIN_SAMPLE);
//   2. the ORIGINAL prices apart from it in this feed — at least
//      REPRINT_MIN_ABOVE of its rows sit above the band, with their median
//      REPRINT_SEPARATION x the reprint's;
//   3. ...and in the catalogue: the stored number-matched market price
//      (opts.marketPrice) is also REPRINT_SEPARATION x the reprint's median.
//      Where the two cards trade alike, price is no evidence: Base Set
//      Charizard raw runs $21-$350 live against a $290 reprint, because
//      damaged genuine copies really do sell there — nothing is flagged;
//   4. the listing falls inside the reprint's own interquartile range,
//      widened by REPRINT_BAND_PAD either side.
// FLAGS, never rejects. A genuine damaged original can sell there.
const REPRINT_BAND_PAD   = 0.15;
const REPRINT_SEPARATION = 2.5;
const REPRINT_MIN_ABOVE  = 3;
// Stated condition codes (cardmatch.sellerCondition / eBay's Card Condition)
// that explain a low price on their own.
const PLAYED = new Set(['MP', 'HP', 'DMG']);

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// reprint: { label, cardId, prices: [number] } — the reprint's own gated,
// untrusted-rows-removed listing prices at the SAME grade.
function flagReprintPriced(listings, reprint, opts) {
  opts = opts || {};
  const minSample  = opts.minSample  || MIN_SAMPLE;
  const separation = opts.separation || REPRINT_SEPARATION;
  const minAbove   = opts.minAbove   || REPRINT_MIN_ABOVE;
  const pad        = opts.bandPad != null ? opts.bandPad : REPRINT_BAND_PAD;
  const minMarket  = opts.minMarket  || MIN_MEDIAN;

  const out = listings.map(l => Object.assign({}, l));
  const rp = ((reprint && reprint.prices) || []).map(Number)
    .filter(p => isFinite(p) && p > 0).sort((a, b) => a - b);
  const stats = { reprint: reprint ? reprint.cardId : null,
                  label: reprint ? reprint.label : null,
                  sample: rp.length, applied: false, flagged: 0, reason: null };

  if (rp.length < minSample) {
    stats.reason = `only ${rp.length} priced reprint listings — too few to know where it trades`;
    return { listings: out, stats };
  }
  stats.median = median(rp);
  const lo = +(quantile(rp, 0.25) * (1 - pad)).toFixed(2);
  const hi = +(quantile(rp, 0.75) * (1 + pad)).toFixed(2);
  stats.band = [lo, hi];

  const above = out.map(priceOf).filter(p => p !== null && p > hi);
  stats.originalAbove = above.length;
  stats.originalAboveMedian = above.length ? median(above) : null;
  if (above.length < minAbove || stats.originalAboveMedian < stats.median * separation) {
    stats.reason = `this card does not price apart from ${stats.label} here ` +
      `(${above.length} listings above $${hi}` +
      (above.length ? `, median $${stats.originalAboveMedian.toFixed(2)}` : '') +
      `) — price is no evidence either way`;
    return { listings: out, stats };
  }
  // ...and the catalogue must agree, independently of this feed. A few
  // high rows exist in almost any feed; the stored number-matched market
  // price is a second path to the same fact. It is the UNGRADED price, so
  // on a graded search it is a lower bound — it can only make this refuse
  // more often, never less. No stored price, no flag.
  const mkt = Number(opts.marketPrice);
  stats.marketPrice = isFinite(mkt) && mkt > 0 ? mkt : null;
  if (stats.marketPrice == null) {
    stats.reason = 'no stored market price for this card to confirm it prices apart from ' +
      stats.label + ' — not applied';
    return { listings: out, stats };
  }
  // The same floor flagOutliers keeps, for the same reason: under $15 a
  // genuine played copy honestly sells at a reprint's level. Measured:
  // Claydol 15/106 (market $5.15) "MP" at $1.99 against a $2 reprint.
  if (stats.marketPrice < minMarket) {
    stats.reason = `stored market price $${stats.marketPrice.toFixed(2)} is under $${minMarket} — ` +
      'cheap cards spread widely for honest reasons';
    return { listings: out, stats };
  }
  if (stats.marketPrice < stats.median * separation) {
    stats.reason = `stored market price $${stats.marketPrice.toFixed(2)} is under ` +
      `${separation}x the ${stats.label} median ($${stats.median.toFixed(2)}) — ` +
      'the catalogue does not say this card prices apart, so price is no evidence';
    return { listings: out, stats };
  }

  stats.applied = true;
  stats.exemptPlayed = 0;
  for (const l of out) {
    const p = priceOf(l);
    if (p === null || l.suspect) continue;       // a stronger flag stands
    if (p >= lo && p <= hi) {
      // A played copy has an honest reason to sit low: "Zekrom 114/114 Holo
      // Damaged" at $19.99 is the genuine card at a fair price for it.
      if (PLAYED.has(l.sellerCondition)) { stats.exemptPlayed++; continue; }
      l.suspect = 'reprint-priced';
      l.suspectReason = `$${p.toFixed(2)} is priced at the ${stats.label} median ` +
        `($${stats.median.toFixed(2)}; it trades $${lo.toFixed(0)}-$${hi.toFixed(0)}) — ` +
        `may be the reprint. This card's other listings run from $${Math.min(...above).toFixed(0)}`;
      stats.flagged++;
    }
  }
  return { listings: out, stats };
}

// How far down a flagged listing goes. Exported because the server sorts
// on `live` as well and must not grow its own idea of the ranking — two
// implementations of one ordering is how the estimator and the query
// builder each drifted in this project.
function suspectRank(l) {
  return l.suspect === 'implausible' ? 2 : l.suspect ? 1 : 0;
}

// Is this a row the headline number may be taken from? `cheapest` is what
// people act on, so it skips anything flagged — the row is still shown,
// ranked last and carrying its reason, but it does not get to be the
// answer to "what does this card cost".
function trustworthy(l) { return !l.suspect && !isCurrentBid(l); }

// Sort so flagged listings land last regardless of price, since the whole
// point of a cheapest-first list is that the top row is trustworthy.
function sortWithSuspectsLast(listings) {
  return listings.slice().sort((a, b) => {
    const d = suspectRank(a) - suspectRank(b);
    if (d !== 0) return d;
    const pa = priceOf(a), pb = priceOf(b);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });
}

module.exports = { flagOutliers, flagReprintPriced, sortWithSuspectsLast, suspectRank, trustworthy,
                   median, priceOf, isCurrentBid,
                   REPRINT_BAND_PAD, REPRINT_SEPARATION, REPRINT_MIN_ABOVE,
                   SUSPECT_RATIO, IMPLAUSIBLE_RATIO, MIN_SAMPLE, MIN_MEDIAN };
