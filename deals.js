// deals.js — "Best deals right now" (TASK T3, 2026-10-05).
//
// REQUIRED BY server.js, so it is TRACKED.
//
// The rule, decided by Roy: the cheapest TRUSTED Buy It Now listing against
// a MEASURED price, where both ends are solid. Deliberately not the outlier
// signal: an outlier is below trust; a deal is at the bottom of trust.
//
//   listing end  live, Buy It Now (never a current bid), not flagged by any
//                check (outlier.trustworthy — price, reprint band, novelty),
//                landed cost KNOWN (shipping stated), not still waiting for
//                its photo check, and the cheapest of at least MIN_TRUSTED
//                such rows in its view
//   price end    the card's stored, number-matched, ungraded price, real and
//                CURRENT (pricequality: no old / thin / unsettled mark) — the
//                same reference outlier.js judges by
//   a deal       landed at least MIN_DISCOUNT below that price
//
// Drawn ONLY from views someone opened in the last 15 minutes (the listing
// cache eBay's terms allow). It never fetches: 0 eBay calls to fill a browse
// tile — that is how 5,000 calls once went in twelve hours. Raw views
// without a printing or edition filter only: the stored price is the base
// printing, ungraded.
//
// OFF since 2026-10-05 (Roy). Seen live with real views, at most 2 of 8 were
// like-for-like: a gold metal novelty card, an Evolutions Mewtwo under Mewtwo
// ☆, three copies the seller called damaged / MP against a near-mint price,
// a "Non-Holo" against the holo price. The bar below now also refuses stated
// damage, a stated printing or edition other than the price's, and any row a
// check has marked (pending photo, metal photo, other back). It does NOT catch
// that #1 row: the gold Shining Charizard carried no mark anywhere — colour
// 0.059 above our scan (washed-out light), price not low enough to flag, back
// "no-claim" (PROGRESS 2026-10-05, night). ENABLED stays false until the shelf
// is re-measured live and that class is answered.
'use strict';
const outlier = require('./outlier');

const ENABLED = false;
const OFF_REASON = 'Best deals is switched off while its bar is fixed: listings shown here must be the same card, '
  + 'printing and condition as the price they are compared with, and on 2026-10-05 most were not.';
const MIN_DISCOUNT = 0.15;
const MIN_TRUSTED = 3;
// Stated below near mint: the stored price is the card's ungraded market price,
// which is a near-mint price. Codes from cardmatch.sellerCondition.
const BELOW_NM = new Set(['LP', 'MP', 'HP', 'DMG']);

// The printing the card's price is for: its one non-reverse printing. null
// when the card's printings are unread or it has two (normal AND holo) — then
// a row that STATES a printing cannot be shown to be the priced one.
function basePrintingOf(payload) {
  const keys = ((payload && payload.printings) || []).map(p => p && p.key).filter(k => k && !/^reverse/.test(k));
  return keys.length === 1 ? keys[0] : null;
}

// Why this row cannot be a deal, or null. Every reason is a row the listings
// panel already marks or the title already states — one place, counted.
function notADeal(l, base) {
  if (!l || !l.live) return 'ended';
  if (l.saleType === 'auction' || !outlier.trustworthy(l)) return l.suspect ? 'flagged: ' + l.suspect : 'a current bid';
  if (!l.shippingKnown || !(Number(l.landed) > 0)) return 'shipping not stated';
  if (l.materialPending) return 'novelty check not run yet';
  if (l.stamp && l.stamp.state === 'pending') return 'photo still being compared';
  if (l.back && (l.back.state === 'other-back' || l.back.metal)) return 'back check marked it';
  if (l.sellerStated && BELOW_NM.has(l.sellerCondition)) return 'stated condition below near mint';
  if (l.printingStated && (/^reverse/.test(l.printing || '') || l.printing !== base)) return 'states another printing';
  if (l.editionStated && l.editionKey && l.editionKey !== 'unlimited') return 'states another edition';
  return null;
}

// One view's best candidate. payload: a cached /api/listings payload; ref:
// { price, current, isReal } for the card. Returns { deal } or { why },
// and `excluded`: how many rows each reason kept out.
function pickDeal(payload, ref) {
  if (!ref || !ref.isReal || !(ref.price > 0)) return { why: 'no measured price for this card' };
  if (!ref.current) return { why: 'the stored price is ' + (ref.quality || 'not current') };
  const base = basePrintingOf(payload), excluded = {}, solid = [];
  for (const l of (payload && payload.listings) || []) {
    const no = notADeal(l, base);
    if (no) excluded[no] = (excluded[no] || 0) + 1; else solid.push(l);
  }
  if (solid.length < MIN_TRUSTED) return { why: `${solid.length} solid listing${solid.length === 1 ? '' : 's'} (needs ${MIN_TRUSTED})`, excluded };
  const best = solid.reduce((a, b) => (Number(b.landed) < Number(a.landed) ? b : a));
  const discount = 1 - Number(best.landed) / ref.price;
  if (discount < MIN_DISCOUNT) return { why: `cheapest solid listing is ${Math.round(discount * 100)}% below the price`, excluded };
  return { deal: { listing: best, price: ref.price, discount: Math.round(discount * 1000) / 1000, solidCount: solid.length }, excluded };
}

function rankDeals(deals) {
  return deals.slice().sort((a, b) => b.discount - a.discount || a.listing.landed - b.listing.landed);
}

function describeRule() {
  return 'The cheapest trusted Buy It Now listing (shipping stated, no check marked it, no stated damage, printing or '
    + 'edition other than the priced one) on a card opened in the last '
    + '15 minutes, at least ' + Math.round(MIN_DISCOUNT * 100) + '% below the card\'s current measured price, among at least '
    + MIN_TRUSTED + ' such listings. Nothing is fetched to fill this shelf.';
}

module.exports = { ENABLED, OFF_REASON, MIN_DISCOUNT, MIN_TRUSTED, BELOW_NM, basePrintingOf, notADeal, pickDeal, rankDeals, describeRule };
