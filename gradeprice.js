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

// ── A grade's worth: measured, or nothing ─────────────────────
// The multiplier table that stood in here (raw x 7 = "PSA 10") was a guess
// labelled as one, and it went on 2026-10-09 with every other estimate (Roy):
// the estimator missed by 4x for the typical card and 17x for a quarter of
// them, and nothing a buyer reads should be a guess. What is left is the
// measurement: a grade's median from real listings when there are enough of
// them, a thin one shown only as what it is, and otherwise nothing.
function priceFor(agg, grade, rawPrice, opts) {
  opts = opts || {};
  const minSample = Number.isFinite(opts.minSample) ? opts.minSample : 3;
  const g = agg && agg.groups
    ? agg.groups.filter(x => x.grade === String(grade))
                .sort((a, b) => (a.basis === SOLD ? 0 : 1) - (b.basis === SOLD ? 0 : 1) ||
                                 b.count - a.count)[0]
    : null;
  if (!g) return null;
  if (g.count >= minSample) {
    return {
      grade: String(grade), value: g.median, measured: true,
      count: g.count, basis: g.basis, edition: g.edition,
      landed: g.landed, low: g.low, high: g.high, label: g.label,
      premium: Number(rawPrice) > 0 ? +(g.median / rawPrice).toFixed(2) : null
    };
  }
  // Too few to be a price: said as evidence, never as the grade's value.
  return { grade: String(grade), value: null, measured: false,
           observed: { median: g.median, count: g.count, basis: g.basis, label: g.label } };
}

// ── Print runs: 1st Edition, Shadowless, Unlimited — only where they exist ──
//
// An EXPLICIT list, not a date rule. English 1st Edition ran from Base Set
// (1999) to Neo Destiny (2002) and stopped there: the e-Card sets, Legendary
// Collection and Base Set 2 never had one, so "anything before 2003" would
// offer a 1st Edition group on four sets where it cannot exist. Checked
// 2026-09-26 against TCGdex, whose set payload counts first-edition cards:
// exactly these ten English sets report cardCount.firstEd > 0, and no other.
// Shadowless is a Base Set print run and nothing else.
//
// Japanese is deliberately absent. Its "1st Edition" mark is a different
// thing on different sets, and no set here has been checked — an unchecked
// group is a control backed by no data.
const FIRST_EDITION_SETS = ['base1', 'base2', 'base3', 'base5', 'gym1', 'gym2',
                            'neo1', 'neo2', 'neo3', 'neo4'];
const SHADOWLESS_SETS = ['base1'];

function printRunsFor(setId, lang) {
  if (lang && lang !== 'en') return [];
  if (!FIRST_EDITION_SETS.includes(String(setId || ''))) return [];
  return SHADOWLESS_SETS.includes(setId)
    ? ['1st Edition', 'Shadowless', 'Unlimited']
    : ['1st Edition', 'Unlimited'];
}

const RUN_NOT_STATED = 'Print run not stated';

// Separate markets, each with its own median. null when the set has no
// print runs, which tells the caller to show one list as before.
//
// A row is placed by what the SELLER wrote (listingparse's `edition`); a
// title saying nothing goes to its own group rather than into Unlimited —
// on Base Set that group is a mixture, and it is labelled as one. Nothing
// is dropped: every row lands in exactly one group, in the order it came,
// so flagged rows stay last within their group.
function byPrintRun(listings, setId, lang) {
  const runs = printRunsFor(setId, lang);
  if (!runs.length) return null;
  const groups = runs.map(run => ({ run, rows: [] }));
  const other = {};
  const unstated = { run: RUN_NOT_STATED, rows: [], unstated: true };
  for (const l of listings || []) {
    const ed = l.edition ? String(l.edition) : null;
    const g = ed && groups.find(x => x.run === ed);
    if (g) g.rows.push(l);
    else if (ed) (other[ed] = other[ed] || { run: ed, rows: [] }).rows.push(l);
    else unstated.rows.push(l);
  }
  return groups.concat(Object.values(other), [unstated]).map(g => {
    const vals = g.rows.filter(usable).map(landedOf);
    return Object.assign(g, {
      count: g.rows.length,
      median: vals.length ? median(vals) : null,
      low: vals.length ? Math.min(...vals) : null,
      priced: vals.length,
      thin: vals.length < 3
    });
  });
}

const API = { aggregate, priceFor, median, landedOf, usable,
              FIRST_EDITION_SETS, SHADOWLESS_SETS, printRunsFor, byPrintRun, RUN_NOT_STATED };

// ── Dual mode: Node require() AND a browser <script> ──────────
// Same arrangement as cardmatch.js: server.js serves this file at
// /gradeprice.js and the browser picks it up as window.GradePrice.
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (root) root.GradePrice = API;

})(typeof window !== 'undefined' ? window : null);
