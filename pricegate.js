// ══════════════════════════════════════════════════════════════
// pricegate.js — what a caller without an approved account must not receive
// (door task T1, 2026-10-07)
//
// Roy's door: the CATALOGUE is public (sets, set pages, card pages, names,
// numbers, rarity, artist, logos, images, search). PRICES, LISTINGS and
// LINKS need an approved account. The routes that are nothing but prices or
// listings refuse outright (access.approved). The catalogue routes answer
// everyone, through access.optional, which passes every body a non-approved
// caller is sent through strip() below — so the number never leaves the
// server. Hiding a received price in the page would not be a gate.
//
// strip() returns a COPY (handlers cache the full body and serve it to
// approved callers too) with every key that carries a price, a price's
// provenance, a listing or a marketplace link removed, at any depth.
//
// pricegate.test.js checks it against real responses both ways: every price
// number an approved caller receives for a card is absent from what an
// anonymous caller receives under ANY key — and the catalogue fields are
// still there.
// ══════════════════════════════════════════════════════════════
'use strict';

// Matched against each key, case-insensitively.
//   price…, …Price(s), prices      _price, _priceSource, _priceIsReal, _priceDate,
//                                  _priceQuality, printingPrices, editionPrices,
//                                  sample_prices, price_usd, prevPrice, realPrices …
//   tcgplayer, cardmarket          the source blocks (they ARE prices)
//   market…, cheapest…, listings…  liveCount, outliers, sources (listing sources),
//   gradePrice, change…, deals     whatever a listing or a movement carries
const PRICE_KEY = /price|^tcgplayer$|^cardmarket$|^market|cheapest|^listings?$|^liveCount$|^outliers$|^sources$|^gradePrice|^change(Pct)?$|^deals?$|^realCount$|^priced/i;

const isPriceKey = k => PRICE_KEY.test(k);

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const k of Object.keys(v)) if (!isPriceKey(k)) out[k] = strip(v[k]);
    return out;
  }
  return v;
}

// What the body says instead, so a client knows the absence is the door and
// not "no data". Words only — no number, no placeholder shaped like one.
const WITHHELD = 'Prices, listings and marketplace links are for approved accounts.';

module.exports = { strip, isPriceKey, PRICE_KEY, WITHHELD };
