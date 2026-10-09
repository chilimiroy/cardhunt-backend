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
// A hold comes off when its card is matched to a product of its own — the
// product-id matching is a task of its own, not done here.
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
const COLLISIONS = require(FILE).collisions;
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
const ids = Object.keys(HELD);
// Ids are ours (cardid shape), so quoting is plain; asserted by the test.
function notHeldSql(ph = 'ph') {
  return ids.length ? `${ph}.card_api_id NOT IN (${ids.map(i => "'" + i + "'").join(', ')})` : 'TRUE';
}
function heldFor(cardId) { return HELD[cardId] || null; }
// For a card payload already built: no headline, no third-party price blob.
function apply(obj, cardId) {
  const h = heldFor(cardId || (obj && obj.id));
  if (!h || !obj) return obj;
  return Object.assign(obj, { _price: null, _priceIsReal: false, _priceSource: null, tcgplayer: null, cardmarket: null,
    priceHeld: { reason: h.reason, product: h.product, products: h.products, with: h.with } });
}
module.exports = { FILE, COLLISIONS, HELD, notHeldSql, heldFor, apply };
