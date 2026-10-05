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
'use strict';
const outlier = require('./outlier');

const MIN_DISCOUNT = 0.15;
const MIN_TRUSTED = 3;

// One view's best candidate. payload: a cached /api/listings payload; ref:
// { price, current, isReal } for the card. Returns { deal } or { why }.
function pickDeal(payload, ref) {
  if (!ref || !ref.isReal || !(ref.price > 0)) return { why: 'no measured price for this card' };
  if (!ref.current) return { why: 'the stored price is ' + (ref.quality || 'not current') };
  const solid = (payload && payload.listings || []).filter(l => l && l.live && l.saleType !== 'auction'
    && outlier.trustworthy(l) && l.shippingKnown && !l.materialPending && Number(l.landed) > 0);
  if (solid.length < MIN_TRUSTED) return { why: `${solid.length} solid listing${solid.length === 1 ? '' : 's'} (needs ${MIN_TRUSTED})` };
  const best = solid.reduce((a, b) => (Number(b.landed) < Number(a.landed) ? b : a));
  const discount = 1 - Number(best.landed) / ref.price;
  if (discount < MIN_DISCOUNT) return { why: `cheapest solid listing is ${Math.round(discount * 100)}% below the price` };
  return { deal: { listing: best, price: ref.price, discount: Math.round(discount * 1000) / 1000, solidCount: solid.length } };
}

function rankDeals(deals) {
  return deals.slice().sort((a, b) => b.discount - a.discount || a.listing.landed - b.listing.landed);
}

function describeRule() {
  return 'The cheapest trusted Buy It Now listing (shipping stated, no check flagged it) on a card opened in the last '
    + '15 minutes, at least ' + Math.round(MIN_DISCOUNT * 100) + '% below the card\'s current measured price, among at least '
    + MIN_TRUSTED + ' such listings. Nothing is fetched to fill this shelf.';
}

module.exports = { MIN_DISCOUNT, MIN_TRUSTED, pickDeal, rankDeals, describeRule };
