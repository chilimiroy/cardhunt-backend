// ══════════════════════════════════════════════════════════════
// pricehold.js — cards whose price we cannot stand behind show NO number
// (Roy, 2026-10-09).
//
// When two of our cards are priced as the SAME TCGplayer product at the same
// price, one of the two mappings is wrong and nothing on the row says which.
// The nightly works in value order, so "the first card wins" would be
// arbitrary. Both sides are held: every price row of a held card is kept out
// of the headline (printsql.basePrintingSql — the one headline rule, so the
// card page, set page, search, trending, deals and alerts all lose it at
// once), the card endpoints say priceHeld with the reason and send no
// third-party price blob, and the page draws no number for it — not the
// blob, not an estimate. Rows are not deleted: price_history is append-only
// and /api/history still charts what was recorded.
//
// Each entry says the product, the cards sharing it, and WHEN IT COMES OFF.
// Found replaying the 08/10 nightly with pricedupe.js (PROGRESS 2026-10-09).
// Required by printsql.js and server.js; tracked.
// ══════════════════════════════════════════════════════════════
'use strict';
const REMOVE_WHEN = 'each card is matched to its own TCGplayer product (a distinct product id per card), checked by hand against TCGplayer';
const COLLISIONS = [
  { product: '90056', price: 249.00, cards: ['en-dpp-DP05', 'en-dpp-DP25', 'en-dpp-DP48'], name: 'Tropical Wind', via: 'TCGplayer internal search' },
  { product: '97703', price: 1400.00, cards: ['en-np-36', 'en-hgssp-HGSS18'], name: 'Tropical Tidal Wave', via: 'TCGdex (np-36); HGSS18 also by internal search' },
  { product: '85669', price: 509.99, cards: ['en-ecard3-10', 'en-ecard3-H09'], name: 'Gengar (Skyridge)', via: 'TCGdex (ecard3-10)' },
  { product: '86201', price: 111.04, cards: ['en-ecard3-H11', 'en-ecard3-12'], name: 'Houndoom (Skyridge)', via: 'TCGplayer internal search' },
];
const HELD = {};
for (const c of COLLISIONS) for (const id of c.cards) {
  HELD[id] = {
    reason: 'price withheld: ' + c.cards.length + ' of our cards (' + c.cards.join(', ') + ') were priced as the same TCGplayer product ('
      + c.product + ') at the same price — one of the mappings is wrong and we cannot tell which',
    product: c.product, with: c.cards.filter(x => x !== id), removeWhen: REMOVE_WHEN,
  };
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
    priceHeld: { reason: h.reason, product: h.product, with: h.with } });
}
module.exports = { COLLISIONS, HELD, notHeldSql, heldFor, apply };
