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

function priceOf(l) {
  const p = l.landed != null ? l.landed : l.price;
  const n = parseFloat(p);
  return isFinite(n) && n > 0 ? n : null;
}

function flagOutliers(listings, opts) {
  opts = opts || {};
  const ratio       = opts.suspectRatio     || SUSPECT_RATIO;
  const hardRatio   = opts.implausibleRatio || IMPLAUSIBLE_RATIO;
  const minSample   = opts.minSample        || MIN_SAMPLE;
  const minMedian   = opts.minMedian        || MIN_MEDIAN;

  const out = listings.map(l => Object.assign({}, l));
  const prices = out.map(priceOf).filter(p => p !== null);

  const stats = {
    count: out.length, priced: prices.length,
    median: median(prices), low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
    applied: false, reason: null, flagged: 0
  };

  if (prices.length < minSample) {
    stats.reason = `only ${prices.length} priced listings — too few to judge an outlier`;
    return { listings: out, stats };
  }
  if (stats.median < minMedian) {
    stats.reason = `median $${stats.median.toFixed(2)} is below $${minMedian} — ` +
                   'cheap cards spread widely for honest reasons';
    return { listings: out, stats };
  }

  stats.applied = true;
  stats.spread = stats.high && stats.low ? +(stats.high / stats.low).toFixed(1) : null;

  for (const l of out) {
    const p = priceOf(l);
    if (p === null) continue;
    const r = p / stats.median;
    if (r <= hardRatio) {
      l.suspect = 'implausible';
      l.suspectReason = `$${p.toFixed(2)} is ${Math.round(1 / r)}x below the ` +
        `$${stats.median.toFixed(2)} median for this card — almost certainly not the real card`;
      stats.flagged++;
    } else if (r <= ratio) {
      l.suspect = 'unusually-cheap';
      l.suspectReason = `$${p.toFixed(2)} against a $${stats.median.toFixed(2)} median ` +
        `for this card — check the listing carefully`;
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
function trustworthy(l) { return !l.suspect; }

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

module.exports = { flagOutliers, sortWithSuspectsLast, suspectRank, trustworthy,
                   median, priceOf,
                   SUSPECT_RATIO, IMPLAUSIBLE_RATIO, MIN_SAMPLE, MIN_MEDIAN };
