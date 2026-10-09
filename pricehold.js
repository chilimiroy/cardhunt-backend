// ══════════════════════════════════════════════════════════════
// pricehold.js — cards whose price we cannot stand behind show NO number
// (Roy, 2026-10-09).
//
// When two of our cards are mapped to the SAME TCGplayer product, one of the
// mappings is wrong and nothing on the row says which. "The first card wins"
// would be arbitrary, so every card of every such product is held: every price
// row of a held card is kept out of the headline (printsql.basePrintingSql —
// the one headline rule, so the card page, set page, search, trending, deals
// and alerts all lose it at once), the card endpoints say priceHeld with the
// reason and send no third-party price blob, and the page draws no number for
// it — not the blob, not an estimate. Rows are not deleted: price_history is
// append-only and /api/history still charts what was recorded.
//
// The list is MEASURED, not typed: pricehold-collisions.json, written by
// `node collisionscan.js --write` (read-only on the database). It began as the
// nine cards one nightly batch collided on; the catalogue-wide measurement
// found 53 product ids over 106 cards (PROGRESS 2026-10-09 (later)), all held.
// pricehold.test.js --db fails when the database no longer matches the file.
// A hold comes off when its card is matched to a product of its own. The
// matching was fixed 2026-10-09 (cardnumber.js; TASK-product-matching): the
// rows the loose matcher wrote are refused below, and 59 of the 106 came off.
// Required by printsql.js and server.js; tracked.
// ══════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const FILE = path.join(__dirname, 'pricehold-collisions.json');
const REMOVE_WHEN = 'each card is matched to its own TCGplayer product (a distinct product id per card): re-run collisionscan.js --write';
const ORIGIN = {
  source: 'TCGdex gives both cards this product',
  both: 'TCGdex and our TCGplayer search both put them on it',
  'our-search-onto-tcgdex-id': 'our TCGplayer search matched a card to another card\'s product',
  'our-search': 'our TCGplayer search matched them to one product',
};
const MEASURED = require(FILE);
const COLLISIONS = MEASURED.collisions;
// ── Refused rows (TASK-product-matching, 2026-10-09) ──
// Our TCGplayer search used to match a lettered or prefixed number to the
// plain one, and to take a name hit stating ANOTHER number (cardnumber.js).
// The rows it wrote that way are not deleted (price_history is append-only)
// and are not the card's price: each is named here by row id, measured by
// collisionscan.js with the matcher's own rule, and kept out of the headline
// (notRefusedSql, in printsql.basePrintingSql) and out of the mappings. The
// fixed matcher writes no such row, so the list only shrinks.
const REFUSED = MEASURED.refused || [];
const REFUSED_IDS = REFUSED.map(r => String(r.row));
if (!REFUSED_IDS.every(id => /^\d+$/.test(id))) throw new Error('pricehold: a refused row id is not a number');
const HELD = {};
for (const c of COLLISIONS) {
  const ids = c.cards.map(x => x.id);
  for (const id of ids) {
    const h = HELD[id] || (HELD[id] = { products: [], with: [], origins: [], removeWhen: REMOVE_WHEN });
    h.products.push(c.product);
    for (const o of ids) if (o !== id && !h.with.includes(o)) h.with.push(o);
    if (!h.origins.includes(c.origin)) h.origins.push(c.origin);
  }
}
for (const [id, h] of Object.entries(HELD)) {
  h.product = h.products[0];
  h.reason = 'price withheld: ' + id + ' and ' + h.with.join(', ') + ' are mapped to the same TCGplayer product ('
    + h.products.join(', ') + ') — ' + h.origins.map(o => ORIGIN[o] || o).join('; ') + '. One of the mappings is wrong and we cannot tell which.';
}
// ── Reviewed holds: one card, a headline nothing independent corroborates ──
// Each names what was measured and who decided. Held exactly like a shared
// product (no headline, no price blob, the reason shown); it comes off when
// a source we can match by product prices the card.
const REVIEWED = {
  'en-ex15-100': {
    decided: 'Roy, 2026-10-09',
    reason: "price withheld: our last TCGplayer reading for Charizard ☆ δ is $4,000 (2026-08-27, product not recorded), and our readings"
      + " alternated $980 / $990 / $4,000 / $4,000 / $1,000 / $1,000. pokemontcg.io's $4,000 is the same TCGplayer market figure,"
      + " not a second source (its own listings start at $20,000); TCGdex has no price for this card; Cardmarket's EU figures"
      + " ($838 trend, $1,483.81 30-day average, $1,653.33 average sell) put it nearer $1,000. We cannot tell which is right.",
    removeWhen: 'a source matched by product (TCGdex, or our search with the product recorded) prices the card',
  },
};
for (const [id, r] of Object.entries(REVIEWED)) {
  if (!HELD[id]) HELD[id] = { kind: 'reviewed', products: [], product: null, with: [], origins: ['reviewed'],
                              reason: r.reason, decided: r.decided, removeWhen: r.removeWhen };
}
const ids = Object.keys(HELD);
// Ids are ours (cardid shape), so quoting is plain; asserted by the test.
function notHeldSql(ph = 'ph') {
  return ids.length ? `${ph}.card_api_id NOT IN (${ids.map(i => "'" + i + "'").join(', ')})` : 'TRUE';
}
// Row ids are digits only (checked above), so quoting is plain.
function notRefusedSql(ph = 'ph') {
  return REFUSED_IDS.length ? `${ph}.id NOT IN (${REFUSED_IDS.join(', ')})` : 'TRUE';
}
function heldFor(cardId) { return HELD[cardId] || null; }
// For a card payload already built: no headline, no third-party price blob.
function apply(obj, cardId) {
  const h = heldFor(cardId || (obj && obj.id));
  if (!h || !obj) return obj;
  return Object.assign(obj, { _price: null, _priceIsReal: false, _priceSource: null, tcgplayer: null, cardmarket: null,
    priceHeld: { reason: h.reason, product: h.product, products: h.products, with: h.with } });
}
module.exports = { FILE, COLLISIONS, HELD, REFUSED, REVIEWED, notHeldSql, notRefusedSql, heldFor, apply };
