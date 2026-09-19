// ══════════════════════════════════════════════════════════════
// gradeprice.js — what a grade is actually worth, from real listings
//
// The card page prices every grade from a multiplier table: PSA 10 = 7x
// raw, applied to a 2024 Common and a 1999 Charizard alike. Real premiums
// run from ~3x on a modern common to 40x+ on a vintage chase card, so the
// table is worst exactly where the money is.
//
// eBay already answers the question — every graded search returns verified
// slab listings. This module turns those into ONE number per card, per
// grade, per edition, and says how much evidence is behind it.
//
//   aggregate(listings, { grade })  -> { groups, best, basis, ... }
//
// What it will not do:
//
//   · Mix asking prices with sold prices. An active listing is what one
//     seller hopes for; a sold listing is what someone paid. Averaging
//     them produces a number describing neither market.
//   · Mix editions. A 1st Edition PSA 10 and an Unlimited PSA 10 both read
//     "4/102 PSA 10" and sell 10x apart.
//   · Hide a thin sample. A median of one is a data point, not a market
//     price, and it goes out labelled as one.
//   · Persist listings. The aggregate may be stored; the rows may not.
//
// Every caller must render `label` beside the number. A price the user
// cannot tell from a measured one is worse than no price.
// ══════════════════════════════════════════════════════════════

// ── Scope ─────────────────────────────────────────────────────
// Everything below is inside this function on purpose. A <script src> does
// NOT get a scope of its own: it shares the page's, so a top-level `const`
// here collides with the page's own. `const API` did exactly that, in all
// three served modules at once, and a collision throws before the first
// statement runs — the module 200s, defines nothing, and every
// `window.X && ...` guard quietly uses the old inline code instead.
//
// Nothing is re-indented: the wrapper is the change, and a reindented body
// would hide it in the diff. Add nothing outside these parentheses.
(function (root) {

// A median, not a mean: one $250,000 Charizard among twenty $8,000 ones
// would drag a mean into a number no card ever sold for.
function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : +(((s[mid - 1] + s[mid]) / 2).toFixed(2));
}

// Landed cost, because that is what a buyer pays. A row whose shipping the
// source never stated uses its price and is counted separately — pretending
// unknown shipping is zero understates every such row.
function landedOf(l) {
  return l.shippingKnown && Number.isFinite(l.landed) ? l.landed : l.price;
}

// An ended listing that sold is evidence of a price. An active auction is a
// bid in progress — it is neither an asking price nor a sale, and it rises
// until it closes, so it can only mislead.
function usable(l) {
  if (!(Number(l.price) > 0)) return false;
  if (l.live && l.listingType === 'auction') return false;
  // A listing the outlier check called implausible is not evidence of what
  // this grade is worth. $2.08 against an $817 median is a proxy, a
  // mislabelled listing or a scam in every case, and averaging it in would
  // publish a measured price built partly on the thing we just flagged.
  // Only `implausible` — `unusually-cheap` may well be a real bargain, and
  // a median absorbs one of those without harm. Rows with no `suspect`
  // field (the outlier check did not run, or nothing was flagged) are
  // unaffected, so every existing caller behaves exactly as before.
  if (l.suspect === 'implausible') return false;
  return true;
}

const SOLD = 'sold', ACTIVE = 'active';
function basisOf(l) { return l.live ? ACTIVE : SOLD; }

// Editions are labels from listingparse, which reads them out of seller
// titles. Most titles say nothing, and "unspecified" is a real group — for
// a modern set it IS the market; for Base Set it is a mixture, and the
// group's label says so rather than quietly averaging.
function editionKey(l) {
  return l.edition ? String(l.edition) : null;
}

function describe(group) {
  const n = group.count;
  const src = group.basis === SOLD ? 'sold' : 'active';
  if (n === 1) return `one ${src} listing — a data point, not a market price`;
  if (n < 3)   return `${n} ${src} listings — too thin to be a market price`;
  return `median of ${n} ${src} listings`;
}

// ── The aggregate ─────────────────────────────────────────────
// Returns every group it found, plus `best`: the one a caller should show.
// Sold beats active, then sample size — never the other way round, because
// a hundred hopeful asking prices still are not a sale.
function aggregate(listings, opts) {
  opts = opts || {};
  const grade = opts.grade || null;
  const minSample = Number.isFinite(opts.minSample) ? opts.minSample : 3;

  const rows = (listings || []).filter(usable);
  const skippedAuctions = (listings || []).filter(
    l => l.live && l.listingType === 'auction').length;

  const buckets = new Map();
  for (const l of rows) {
    const g = String(l.condition || grade || 'Raw');
    const ed = editionKey(l);
    const key = g + ' ' + (ed || '') + ' ' + basisOf(l);
    if (!buckets.has(key)) buckets.set(key, { grade: g, edition: ed, basis: basisOf(l), rows: [] });
    buckets.get(key).rows.push(l);
  }

  const groups = [];
  for (const b of buckets.values()) {
    const vals = b.rows.map(landedOf);
    const shippingKnown = b.rows.filter(l => l.shippingKnown).length;
    const g = {
      grade: b.grade,
      edition: b.edition,
      basis: b.basis,
      count: b.rows.length,
      median: median(vals),
      low: Math.min(...vals),
      high: Math.max(...vals),
      shippingKnown,
      // Landed only when every row stated its shipping. Otherwise the number
      // is a floor, and says so.
      landed: shippingKnown === b.rows.length,
      thin: b.rows.length < minSample
    };
    g.label = describe(g);
    groups.push(g);
  }

  // Sold first, then the bigger sample, then the higher median as a tiebreak
  // so the choice is deterministic rather than insertion-ordered.
  groups.sort((a, b) =>
    (a.basis === SOLD ? 0 : 1) - (b.basis === SOLD ? 0 : 1) ||
    b.count - a.count ||
    b.median - a.median);

  const forGrade = grade ? groups.filter(g => g.grade === String(grade)) : groups;
  const best = forGrade[0] || null;

  return {
    grade,
    groups,
    best,
    // A caller that shows `best` must also know what it excluded, or a card
    // whose whole market is live auctions looks like a card with no market.
    skippedAuctions,
    considered: rows.length,
    // Multiple editions in one grade is not a problem to be averaged away —
    // it is the answer to "why do these two listings differ by 10x".
    editionsFound: [...new Set(groups.map(g => g.edition).filter(Boolean))]
  };
}

// ── The multiplier, kept honest ───────────────────────────────
// This table used to live in the frontend as `GM` and nowhere else, which
// is how the estimator split started. It lives here now, with the code that
// labels its output, so a caller cannot get the number without the caveat.
//
// These are guesses. That is the point of T2: replace each one, per card,
// with a median measured from real slab listings as the evidence arrives.
const GRADE_MULTIPLIERS = {
  'Raw NM': 1, 'Raw LP': 0.75, 'Raw MP': 0.5, 'Raw HP': 0.35,
  'PSA 5': 0.8, 'PSA 6': 1.1, 'PSA 7': 1.4, 'PSA 8': 2.0, 'PSA 9': 3.5, 'PSA 10': 7.0,
  'CGC 8': 1.8, 'CGC 9': 3.0, 'CGC 9.5': 4.5, 'CGC 10': 6.5,
  'BGS 8': 1.6, 'BGS 9': 2.8, 'BGS 9.5': 4.2
};

// The GM table stays as a fallback: most cards will never have enough slab
// listings to measure. But a fallback that looks like a measurement is how
// users act on a guess, so every estimate carries `estimated: true` and the
// multiplier it came from.
function fromMultiplier(rawPrice, grade, multiplier) {
  const m = Number(multiplier);
  if (!(Number(rawPrice) > 0) || !(m > 0)) return null;
  return {
    grade, value: +(rawPrice * m).toFixed(2),
    estimated: true, multiplier: m, count: 0,
    label: `estimate — raw price x${m}, not measured from listings`
  };
}

// What to show for one grade: the measurement when there is one worth
// showing, the multiplier otherwise, and never one dressed as the other.
function priceFor(agg, grade, rawPrice, multiplier, opts) {
  opts = opts || {};
  const minSample = Number.isFinite(opts.minSample) ? opts.minSample : 3;
  const g = agg && agg.groups
    ? agg.groups.filter(x => x.grade === String(grade))
                .sort((a, b) => (a.basis === SOLD ? 0 : 1) - (b.basis === SOLD ? 0 : 1) ||
                                 b.count - a.count)[0]
    : null;

  if (g && g.count >= minSample) {
    return {
      grade: String(grade), value: g.median, estimated: false,
      count: g.count, basis: g.basis, edition: g.edition,
      landed: g.landed, low: g.low, high: g.high, label: g.label,
      // The premium we MEASURED, which is the number the GM table was
      // guessing at. Worth surfacing: it is how the table gets fixed.
      premium: Number(rawPrice) > 0 ? +(g.median / rawPrice).toFixed(2) : null
    };
  }

  const est = fromMultiplier(rawPrice, grade, multiplier);
  // A thin measurement is not thrown away — it is shown as supporting
  // evidence beside the estimate, because "one listing at $612" is useful
  // even when it is not a market price.
  if (est && g) { est.observed = { median: g.median, count: g.count, basis: g.basis, label: g.label }; }
  return est;
}

const API = { aggregate, priceFor, fromMultiplier, median, landedOf, usable,
              GRADE_MULTIPLIERS };

// ── Dual mode: Node require() AND a browser <script> ──────────
// Same arrangement as cardmatch.js and estimator.js: server.js serves this
// file at /gradeprice.js and the browser picks it up as window.GradePrice.
// The multiplier table above is exactly the kind of thing that gets pasted
// into the HTML "just for now" and then drifts.
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (root) root.GradePrice = API;

})(typeof window !== 'undefined' ? window : null);
