// ══════════════════════════════════════════════════════════════
// pricedupe.js — one price source answering for several cards (Roy, 2026-10-09)
//
// The bug this guards against: a search matches the WRONG product — a sealed
// box, a generic pool — and that one product's price lands on many cards.
//
// What it replaced (ingest.js looksLikeJunk): any price >= $5 within 1.5% of
// 5 of the last 12 prices was rejected. The nightly works in descending value
// order, so neighbouring cards are genuinely close: on 08/10 it discarded
// 1,285 real prices (1,239 of 1,284 warnings at or below the one before). It
// measured sort order, not duplication. Nothing it rejected was written; the
// cards kept older prices instead.
//
// The rule now, across a whole run (one guard per ingest command):
//   * With a product id (TCGdex's TCGplayer block, TCGplayer's own search —
//     both TCGplayer product ids): REJECT when an earlier card in the run got
//     the SAME price for the SAME product id. A different product id is a
//     different product, whatever the prices do.
//   * Without one (Yahoo medians, anything else): exact equality, to the cent,
//     from the same source, at or above FLOOR — rejected from the
//     EXACT_MIN_CARDS-th card on. Two cards sharing a price is normal.
//   * No proximity test, no window.
// Below FLOOR, shared exact prices are normal market data (bulk commons sit
// on TCGplayer's minimum) — only the product-id rule applies there.
// Required by ingest.js; tracked.
// ══════════════════════════════════════════════════════════════
'use strict';
const FLOOR = 5.00;
// Why 5 (measured 2026-10-09, not a feel). The rule applies only to prices
// WITHOUT a product id, from one source, at >= $5. In that population:
//   * Yahoo medians (yahoojp_*), the source it mainly governs: at most 4
//     cards at one exact price on any day — 3,884 prices over 45 days.
//   * The 08/10 nightly: 274 cards priced without a product id, at most 3 at
//     one exact price from one source.
// So real data of this kind has not reached 5. Two cases it must NOT be
// stretched to cover, both measured the same day:
//   * Prices WITH a product id do repeat genuinely: 6 different products at
//     exactly $6.49 holofoil from TCGdex on 08/10. That is why they are judged
//     by product id, never by equality.
//   * Yuyu-tei prices on fixed yen points: 71 cards at exactly $6.24 on 08/28.
//     Yuyu-tei writes through ingest.js yuyuteiIngest, not safePriceFor, so
//     this guard never sees it — keep it that way, or this threshold refuses
//     thousands of genuine prices.
// Older TCGplayer-search rows from before product ids were recorded (Aug-Sep)
// reached 10 at $99.99 in a day; whether genuine is unknown — those rows now
// carry product ids and take the product rule.
const EXACT_MIN_CARDS = 5;

const cents = p => Math.round(Number(p) * 100);

function createGuard() {
  const byProduct = new Map();   // productId -> { cardId, cents }
  const byExact = new Map();     // source|cents -> Set(cardId)
  return {
    // res: { price, source, meta: { productId } } -> null (allowed) | reason
    check(cardId, res) {
      if (!res || !(res.price > 0)) return null;
      const c = cents(res.price);
      const pid = res.meta && res.meta.productId != null && res.meta.productId !== '' ? String(res.meta.productId) : null;
      if (pid) {
        const first = byProduct.get(pid);
        if (!first) { byProduct.set(pid, { cardId, cents: c }); return null; }
        if (first.cardId !== cardId && first.cents === c)
          return 'same price $' + (c / 100).toFixed(2) + ' and the same product ' + pid + ' as ' + first.cardId;
        return null;
      }
      if (c < cents(FLOOR)) return null;
      const key = (res.source || '?') + '|' + c;
      const set = byExact.get(key) || new Set();
      set.add(cardId); byExact.set(key, set);
      if (set.size >= EXACT_MIN_CARDS)
        return 'exactly $' + (c / 100).toFixed(2) + ' from ' + (res.source || '?') + ' for ' + set.size + ' different cards, no product id to tell them apart';
      return null;
    },
  };
}
module.exports = { FLOOR, EXACT_MIN_CARDS, createGuard };
