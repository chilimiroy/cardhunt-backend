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
//
// Unlimited BEFORE 1st Edition (TASK T3, 2026-09-30). Read from TCGdex: on
// WOTC sets there is no plain `holofoil`, only `1st-edition-holofoil` and
// `unlimited-holofoil` — neo1-9 Lugia 164.80 / 531.39, gym1-14 Sabrina's
// Gengar 549.50 / 505.36 — and this list tried the 1st Edition key first,
// so the "base" was the 1st Edition price. The base is Unlimited; a 1st
// Edition key is base only for a card TCGdex lists in no other printing.
const BASE_PRINTINGS = [
  'normal',
  'holofoil',
  'unlimited-holofoil',
  'unlimited-normal',
  'unlimited',
  '1st-edition-holofoil',
  '1st-edition-normal',
  '1st-edition'
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

// ── Which printings a card exists in (TASK T10) ───────────────
// Read from a real response 2026-09-29, not the docs. variants_detailed[]
// entries carry { type, size, foil?, subtype?, stamp?, thirdParty }:
//   type     normal | holo | reverse                  -> the printing
//   foil     pokeball | masterball | cosmos | energy   -> the reverse pattern
//   subtype  unlimited | shadowless | 1999-2000-copyright -> print RUN, not printing
//   stamp    ["1st-edition"] -> print run; ["set-logo"] -> a stamped product
//   size     standard | jumbo -> jumbo is a different product
// So: standard size, no product stamp, key = type(-foil), one per key.
// The `variants` booleans are used ONLY when variants_detailed is absent,
// and they cannot see patterns — so a card read that way says so
// (`from: 'booleans'`) rather than implying it has no mirrors.
// Never invents: a card TCGdex lists only as holo gets exactly ['holo'].
function printingsFromTcgdex(card) {
  const out = new Map();
  const det = card && card.variants_detailed;
  if (Array.isArray(det) && det.length) {
    for (const v of det) {
      if (!v || !v.type) continue;
      if (v.size && v.size !== 'standard') continue;
      const stamps = Array.isArray(v.stamp) ? v.stamp : [];
      if (stamps.some(s => s !== '1st-edition')) continue;
      const key = String(v.type).toLowerCase() + (v.foil ? '-' + String(v.foil).toLowerCase() : '');
      if (!/^[a-z0-9-]+$/.test(key)) continue;
      if (!out.has(key)) {
        out.set(key, { key, tcgplayer: (v.thirdParty && v.thirdParty.tcgplayer) || null });
      } else if (!out.get(key).tcgplayer && v.thirdParty && v.thirdParty.tcgplayer) {
        out.get(key).tcgplayer = v.thirdParty.tcgplayer;
      }
    }
    return { printings: [...out.values()], from: 'variants_detailed' };
  }
  const b = card && card.variants;
  if (b && typeof b === 'object') {
    for (const k of ['normal', 'holo', 'reverse']) if (b[k] === true) out.set(k, { key: k, tcgplayer: null });
    return { printings: [...out.values()], from: 'booleans' };
  }
  return { printings: [], from: null };
}

// ── Prices for the NON-base printings (TASK T10) ──────────────
// [{ variant, price, productId, printing }] — variant is the printing key
// stored in price_history.variant ('reverse', 'reverse-pokeball', ...).
//
//   plain reverse   -> the card-level `reverse-holofoil` block (splitTcgplayer)
//   patterned       -> that variants_detailed entry's OWN pricing, and only
//                      when the block's productId equals the entry's own
//                      thirdParty.tcgplayer id. Measured 2026-09-29 on
//                      sv08.5-001: normal/reverse repeat the card blob
//                      (product 610356, $0.04 / $0.21); the Poké Ball and
//                      Master Ball entries carry products 610536 / 610637 at
//                      $0.31 / $1.32. A pattern whose block names another
//                      product is the repeated blob, and is NOT its price.
// The base printing is parsePricing().tcgplayerBase, unchanged.
function printingPrices(card) {
  const out = [];
  const p = parsePricing(card);
  if (p.tcgplayerReverse) {
    out.push({ variant: 'reverse', price: p.tcgplayerReverse.price,
               productId: p.tcgplayerReverse.productId, printing: p.tcgplayerReverse.printing });
  }
  for (const v of (card && Array.isArray(card.variants_detailed) ? card.variants_detailed : [])) {
    if (!v || v.type !== 'reverse' || !v.foil || (v.size && v.size !== 'standard')) continue;
    const own = v.thirdParty && v.thirdParty.tcgplayer;
    const tp = v.pricing && v.pricing.tcgplayer;
    if (!own || !tp) continue;
    for (const k of ['holofoil', 'reverse-holofoil', 'normal']) {
      const blk = tp[k];
      if (!blk || blk.productId !== own) continue;
      const price = firstPrice(blk, ['marketPrice', 'midPrice', 'lowPrice']);
      if (price === null) continue;
      const variant = 'reverse-' + String(v.foil).toLowerCase();
      if (!out.some(o => o.variant === variant)) out.push({ variant, price, productId: own, printing: k });
      break;
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// ONE PRODUCT, TWO CARDS — trusted for neither (TASK T1 / T4, 2026-09-29)
//
// TCGdex's price is keyed by the marketplace's own product id, which is
// why it beat our name-and-number matching on 90% agreement. But the
// MAPPING from TCGdex card to product is TCGdex's, and it is sometimes
// wrong. Measured:
//
//   en swsh9tg-TG16 Mimikyu V  TCGplayer 263784 = the MAIN-SET 068/172
//                              ($3.62); the Trainer Gallery card is $86.55
//   en ecard1-1 / ecard1-33    Alakazam holo and rare, ONE Cardmarket
//                              product 274876
//
// A price that is right for one card and wrong for the other cannot be
// told apart from here, so a product id claimed by two different cards
// is used for neither. Holo and reverse of ONE card share a product
// legitimately — the test is distinct CARD ids, never rows.
//
// claims: [{ cardId, tcgplayer, cardmarket }] (ids may be null)
// returns { tcgplayer: Map(pid -> [cardIds]), cardmarket: Map(...) },
// holding only the ids claimed by 2+ distinct cards.
function productConflicts(claims) {
  const out = { tcgplayer: new Map(), cardmarket: new Map() };
  for (const mk of ['tcgplayer', 'cardmarket']) {
    const by = new Map();
    for (const c of claims) {
      const pid = c[mk];
      if (pid === null || pid === undefined || pid === '') continue;
      const k = String(pid);
      if (!by.has(k)) by.set(k, new Set());
      by.get(k).add(c.cardId);
    }
    for (const [k, ids] of by) if (ids.size > 1) out[mk].set(k, [...ids].sort());
  }
  return out;
}

const CONFLICT_TABLE = `
  CREATE TABLE IF NOT EXISTS tcgdex_product_conflicts (
    lang text NOT NULL, marketplace text NOT NULL, product_id text NOT NULL,
    card_ids text[] NOT NULL, recorded_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lang, marketplace, product_id))`;

// The DB half. A harvest of ONE set cannot see the other card of a pair in
// another set (TG16's twin is in swsh9), so the batch is merged with every
// claim already stored — the productId on earlier tcgdex rows' source_meta —
// and with conflicts recorded by earlier runs. A full-language run replaces
// that language's recorded conflicts; a partial run only adds to them.
async function recordProductClaims(db, lang, claims, { dry = false, fullRun = false } = {}) {
  await db.query(CONFLICT_TABLE);
  const inBatch = new Set(claims.map(c => c.cardId));
  const hist = await db.query(`
    SELECT DISTINCT card_api_id AS "cardId",
           CASE WHEN source LIKE 'tcgdex_tcgplayer_%' THEN source_meta->>'productId' END AS tcgplayer,
           CASE WHEN source = 'tcgdex_cardmarket' THEN source_meta->>'idProduct' END AS cardmarket
    FROM price_history
    WHERE card_api_id LIKE $1 AND variant IS NULL AND source_meta IS NOT NULL
      AND (source LIKE 'tcgdex_tcgplayer_%' OR source = 'tcgdex_cardmarket')`, [lang + '-%']);
  const all = claims.concat(hist.rows.filter(r => !inBatch.has(r.cardId)));
  const found = productConflicts(all);
  if (!fullRun) {
    const prev = await db.query(
      `SELECT marketplace, product_id, card_ids FROM tcgdex_product_conflicts WHERE lang=$1`, [lang]);
    for (const r of prev.rows) {
      const m = found[r.marketplace];
      if (m && !m.has(r.product_id)) m.set(r.product_id, r.card_ids);
    }
  }
  let persisted = false;
  if (!dry) {
    if (fullRun) {
      await db.query(`DELETE FROM tcgdex_product_conflicts WHERE lang=$1`, [lang]);
      // A marker, so "a full run found nothing shared" is distinguishable
      // from "no full run has ever happened".
      await db.query(`INSERT INTO tcgdex_product_conflicts (lang, marketplace, product_id, card_ids)
                      VALUES ($1,'_run','full','{}')`, [lang]);
    }
    for (const mk of ['tcgplayer', 'cardmarket']) {
      for (const [pid, ids] of found[mk]) {
        await db.query(`
          INSERT INTO tcgdex_product_conflicts (lang, marketplace, product_id, card_ids)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (lang, marketplace, product_id)
          DO UPDATE SET card_ids = EXCLUDED.card_ids, recorded_at = NOW()`, [lang, mk, pid, ids]);
      }
    }
    persisted = true;
  }
  return { ...found, persisted };
}

// For readers (ingest's refresh): every product id recorded as shared, as
// Sets. `ready` is false when no full run has ever been recorded — the
// caller must then NOT trust TCGdex blindly, and must say so.
async function loadProductConflicts(db, lang) {
  await db.query(CONFLICT_TABLE);
  const r = await db.query(
    `SELECT marketplace, product_id FROM tcgdex_product_conflicts WHERE lang=$1`, [lang]);
  const out = { tcgplayer: new Set(), cardmarket: new Set(),
                ready: r.rows.some(x => x.marketplace === '_run') };
  for (const x of r.rows) if (out[x.marketplace]) out[x.marketplace].add(x.product_id);
  return out;
}

module.exports = {
  productConflicts, recordProductClaims, loadProductConflicts,
  printingsFromTcgdex, printingPrices,
  BASE_PRINTINGS, REVERSE_PRINTINGS, SOURCE, PRICING_LANGS,
  isUsablePrice, firstPrice, splitTcgplayer, readCardmarket, parsePricing,
  pricingAllowedFor
};
