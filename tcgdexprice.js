/**
 * ══════════════════════════════════════════════════════════════
 * tcgdexprice.js — read TCGdex's embedded `pricing` block
 *
 * TCGdex returns pricing on every card response. No key, no extra
 * endpoint, same URL the catalog already fetches. See TASK.md T1.
 *
 * This file is PARSING ONLY. It never fetches and never writes.
 * `tcgdexprobe.js` does the network; ingest.js does the database.
 * Standalone on purpose — ingest.js has been reverted twice by a
 * downloaded file landing on local work. See CLAUDE.md.
 *
 * ── What the API actually returns (probed 2026-09-03, not assumed) ──
 *
 * TASK.md described the shape from the TCGdex docs. Three things
 * differ, and each one silently corrupts a price if taken on faith:
 *
 *  1. The TCGplayer variant key is `reverse-holofoil`, NOT `reverse`.
 *     Docs say `reverse`. A parser reading `.reverse` finds undefined
 *     and reports "no reverse pricing" for the entire collection.
 *
 *  2. A provider can be present-but-NULL, not merely absent.
 *     ja/SV2a-201 returns `"tcgplayer": null`. TASK.md says
 *     "providers are omitted when the card is not listed" — so
 *     `Object.keys(pricing)` reports tcgplayer as available and the
 *     next property access throws.
 *
 *  3. Fields carry 0 and null to mean "no data".
 *     ja/SV2a-201 has `trend-holo: 0` alongside `avg-holo: null` on a
 *     card worth €417. Zero is not a price. Storing it would read as
 *     a free card and, worse, would satisfy any `price != null` check.
 *
 * `variants_detailed[]` also carries a `pricing` block per variant,
 * which looks like variant-level pricing and is not — every entry
 * repeats the same card-level blob. swsh3-136's `type:"reverse"`
 * entry still contains both `normal` and `reverse-holofoil`. Read
 * the top-level `pricing` and split it yourself; that is what
 * splitTcgplayer does.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

// ── Which TCGplayer printing is "the card" ────────────────────
// Our scraped `tcgplayer_market` is one raw-NM number per card: the
// base printing. TCGdex separates printings, so we have to say which
// one corresponds. Ordered — first present wins.
//
// A holo-only card (every SIR, SAR, Hyper Rare) has NO `normal` key;
// `holofoil` IS its base printing. A bulk common has no `holofoil`.
// Reverse holo is deliberately absent from this list: it is a
// different physical card at a different price and gets its own row.
const BASE_PRINTINGS = [
  'normal',
  'holofoil',
  '1st-edition-holofoil',
  '1st-edition-normal',
  '1st-edition',
  'unlimited-holofoil',
  'unlimited'
];

// Printings that are a reverse-holo of the base card.
const REVERSE_PRINTINGS = ['reverse-holofoil', 'reverse'];

/**
 * Is this a usable price?
 *
 * Rejects null/undefined (absent), 0 (TCGdex's "no data" — see header
 * note 3), negatives and non-finite values. Does NOT reject small
 * positive prices: TCGPlayer's floor is $0.02 and bulk commons
 * genuinely sit there. `looksLikeJunk` once rejected exactly those and
 * silently dropped ~80 valid prices per set. See CLAUDE.md.
 */
function isUsablePrice(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** First usable price among the named fields, else null. */
function firstPrice(obj, fields) {
  if (!obj || typeof obj !== 'object') return null;
  for (const f of fields) if (isUsablePrice(obj[f])) return obj[f];
  return null;
}

/**
 * Split TCGdex's tcgplayer block into base and reverse printings.
 *
 * Returns { base, reverse, keys } where base/reverse are
 * { printing, marketPrice, lowPrice, midPrice, directLowPrice } or null,
 * and `keys` lists every printing key seen (so an unrecognised printing
 * is reported rather than silently dropped).
 */
function splitTcgplayer(tcgplayer) {
  const out = { base: null, reverse: null, keys: [], unknown: [] };
  if (!tcgplayer || typeof tcgplayer !== 'object') return out;

  for (const [k, v] of Object.entries(tcgplayer)) {
    if (k === 'unit' || k === 'updated') continue;
    if (v && typeof v === 'object') out.keys.push(k);
  }

  const pick = (names) => {
    for (const n of names) {
      const blk = tcgplayer[n];
      if (!blk || typeof blk !== 'object') continue;
      // marketPrice is the headline number; fall back down the ladder
      // rather than returning nothing for a card that has a low/mid.
      const price = firstPrice(blk, ['marketPrice', 'midPrice', 'lowPrice']);
      if (price === null) continue;
      return {
        printing: n,
        price,
        marketPrice: isUsablePrice(blk.marketPrice) ? blk.marketPrice : null,
        lowPrice: isUsablePrice(blk.lowPrice) ? blk.lowPrice : null,
        midPrice: isUsablePrice(blk.midPrice) ? blk.midPrice : null,
        directLowPrice: isUsablePrice(blk.directLowPrice) ? blk.directLowPrice : null,
        productId: blk.productId ?? null
      };
    }
    return null;
  };

  out.base = pick(BASE_PRINTINGS);
  out.reverse = pick(REVERSE_PRINTINGS);

  const known = new Set([...BASE_PRINTINGS, ...REVERSE_PRINTINGS]);
  out.unknown = out.keys.filter(k => !known.has(k));
  return out;
}

/**
 * Read the Cardmarket block.
 *
 * `avg` is the average sale price, `trend` Cardmarket's own trend
 * value, `low` the cheapest listing. We take trend then avg — `low`
 * is a single optimistic listing, not a market level, so it is
 * carried but not used as the headline.
 *
 * The `-holo` suffixed fields describe the holo printing of the same
 * card, mirroring the TCGplayer split.
 */
function readCardmarket(cm) {
  if (!cm || typeof cm !== 'object') return null;
  const price = firstPrice(cm, ['trend', 'avg', 'avg7', 'avg30']);
  if (price === null) return null;
  return {
    price,
    unit: cm.unit || 'EUR',
    trend: isUsablePrice(cm.trend) ? cm.trend : null,
    avg: isUsablePrice(cm.avg) ? cm.avg : null,
    low: isUsablePrice(cm.low) ? cm.low : null,
    avg7: isUsablePrice(cm.avg7) ? cm.avg7 : null,
    avg30: isUsablePrice(cm.avg30) ? cm.avg30 : null,
    holo: firstPrice(cm, ['trend-holo', 'avg-holo']),
    idProduct: cm.idProduct ?? null,
    updated: cm.updated || null
  };
}

/**
 * Parse a whole TCGdex card response into priced observations.
 *
 * Returns { cardmarket, tcgplayerBase, tcgplayerReverse, unknownPrintings }.
 * Every field may be null — absence is normal and is not an error.
 * Callers must treat null as "not listed", never as zero.
 */
function parsePricing(card) {
  const p = (card && card.pricing) || null;
  if (!p || typeof p !== 'object') {
    return { cardmarket: null, tcgplayerBase: null, tcgplayerReverse: null, unknownPrintings: [] };
  }
  const tp = splitTcgplayer(p.tcgplayer);
  return {
    cardmarket: readCardmarket(p.cardmarket),
    tcgplayerBase: tp.base,
    tcgplayerReverse: tp.reverse,
    unknownPrintings: tp.unknown,
    tcgplayerUpdated: (p.tcgplayer && p.tcgplayer.updated) || null
  };
}

// ══════════════════════════════════════════════════════════════
// LANGUAGE GUARD — TCGdex pricing is NOT per-language
//
// Measured 2026-09-04, three cards, ja vs zh-tw:
//
//   SV4a-001   ja ナゾノクサ     zh-tw 走路草        both idProduct 746203, both 0.18
//   S12a-100   ja オリジンディアルガV  zh-tw 起源帝牙盧卡V  both idProduct 687662, both 1.15
//   SV2a-201   ja リザードンex   zh-tw 噴火龍ex      both idProduct 719654, both 463.22
//
// TCGdex localises the card NAME and serves the SAME Cardmarket
// product. Traditional Chinese sets reuse Japanese set ids (SV4a, S12a,
// SV8a), so a zh-tw request returns the Japanese card's listing with a
// Chinese name on it.
//
// This matters because it looks like the opposite of a problem. A
// coverage probe reported TCGdex pricing 56% of unpriced Chinese cards,
// about 4,164 of them — against a catalogue that is 0% priced and
// parked in TASK.md T5 for want of any source at all. Writing it would
// have read as unparking Chinese, and would in fact have priced the
// Traditional Chinese catalogue at Japanese market values.
//
// CLAUDE.md: "Never substitute across languages. Cross-language
// matching is for FINDING equivalents, never for DISPLAYING them."
//
// English is unaffected — its set ids (swsh3, sv03.5) are distinct, so
// there is no collision to inherit. Japanese is the canonical owner of
// the shared ids, so its own pricing is correct.
const PRICING_LANGS = ['en', 'ja'];

/**
 * May pricing be written for this language?
 * Returns { ok, reason } — never a bare boolean, so a refusal has to
 * carry its explanation to wherever it is printed.
 */
function pricingAllowedFor(lang) {
  const l = String(lang || '').toLowerCase();
  if (PRICING_LANGS.includes(l)) return { ok: true, reason: null };
  if (l === 'zh-tw' || l === 'zh-cn') {
    return { ok: false, reason:
      'TCGdex serves the JAPANESE card\'s Cardmarket listing for Chinese locales — '
      + 'same idProduct, same price, localised name only. Chinese sets reuse Japanese '
      + 'set ids, so this would price the Chinese catalogue at Japanese values. '
      + 'Verified on SV4a-001, S12a-100 and SV2a-201.' };
  }
  return { ok: false, reason: `pricing not validated for language "${lang}" — probe it before writing` };
}

// ── Source names, for price_history.source ────────────────────
// Distinct from our scraped `tcgplayer_market` on purpose: the whole
// value of this source is that it is a SECOND path to the same
// marketplace, and collapsing the two names would destroy the
// cross-check that found the master-ball mirror collision.
const SOURCE = {
  cardmarket: 'tcgdex_cardmarket',
  tcgplayerBase: 'tcgdex_tcgplayer_normal',
  tcgplayerReverse: 'tcgdex_tcgplayer_reverse'
};

module.exports = {
  BASE_PRINTINGS, REVERSE_PRINTINGS, SOURCE, PRICING_LANGS,
  isUsablePrice, firstPrice, splitTcgplayer, readCardmarket, parsePricing,
  pricingAllowedFor
};
