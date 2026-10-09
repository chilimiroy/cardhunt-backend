// ══════════════════════════════════════════════════════════════
// pokemontcgblock.js — the ONE reader of a pokemontcg.io price block
// (Roy, 2026-10-10).
//
// cards.tcgplayer_data / cards.cardmarket_data are OUR COPY of what
// pokemontcg.io said when a card was ingested — 12,697 of them dated
// 2026-07-27. They were read in six places, each its own way, and quoted as
// pokemontcg.io's current answer: Charizard ☆ δ's "$4,000 market, $20,000
// low" was the July copy; live, pokemontcg.io said market null, low $18,500.
// The page also turned a block into a number no source produced (the midpoint
// of low and high) and took the MID listing as a market price.
//
// figureOf(tcgplayer, cardmarket, { copy, now }) returns the one figure a
// block supports, or null:
//   1. TCGplayer's market price (holofoil, 1st Ed. holo, 1st Ed., unlimited,
//      normal — never the reverse, which is not the card's base price, T10);
//   2. else a Cardmarket sale figure (average sell price, trend, 7-day
//      average) — a market price, Europe's;
//   3. else, where TCGplayer has listings but no market price, the cheapest
//      listing as an ASKING price (pricequality.askOf's treatment).
// A market price anywhere beats an ask. The mid listing is never a price (it
// is the middle ask), and nothing is computed from two figures.
// Every answer carries: the source's own date, its age in days, whether it is
// our stored copy (copy: true) or fetched just now (copy: false), and whether
// it is marked (older than 45 days, or an ask) — a marked figure is shown with
// the marker and feeds nothing.
//
// Nothing else reads those blocks or columns (pokemontcgblock.test.js).
// ══════════════════════════════════════════════════════════════
'use strict';
const MARK_DAYS = require('./printsql').MARK_DAYS;
const TCG_PRINTINGS = ['holofoil', '1stEditionHolofoil', '1stEdition', 'unlimited', 'normal'];
const CM_FIGURES = [['averageSellPrice', 'average sell price', 'cardmarket_avg'],
                    ['trendPrice', 'trend price', 'cardmarket_trend'],
                    ['avg7', '7-day average', 'cardmarket_avg7']];
const pos = v => typeof v === 'number' && isFinite(v) && v > 0;
// "2026/07/27" (pokemontcg.io's form) -> "2026-07-27", else null.
function dateOf(block) {
  const d = block && block.updatedAt;
  const t = d ? Date.parse(String(d).replace(/\//g, '-')) : NaN;
  return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function figureOf(tcgplayer, cardmarket, opts) {
  opts = opts || {};
  const now = opts.now == null ? Date.now() : opts.now;
  const copy = opts.copy !== false;
  const t = (tcgplayer && tcgplayer.prices) || {}, cm = (cardmarket && cardmarket.prices) || {};
  let f = null;
  for (const k of TCG_PRINTINGS) {
    if (t[k] && pos(t[k].market)) { f = { price: t[k].market, basis: 'market', market: 'TCGplayer (US)', what: 'market price',
                                          printing: k, source: 'tcgplayer_' + k, block: tcgplayer }; break; }
  }
  if (!f) for (const [field, what, source] of CM_FIGURES) {
    if (pos(cm[field])) { f = { price: cm[field], basis: 'market', market: 'Cardmarket (EU)', what, source, block: cardmarket }; break; }
  }
  if (!f) for (const k of TCG_PRINTINGS) {
    if (t[k] && pos(t[k].low)) { f = { price: t[k].low, basis: 'ask', market: 'TCGplayer (US)', what: 'cheapest listing',
                                       printing: k, source: 'tcgplayer_' + k + '_low', block: tcgplayer }; break; }
  }
  if (!f) return null;
  const date = dateOf(f.block);
  const ageDays = date ? Math.floor((now - Date.parse(date + 'T00:00:00Z')) / 864e5) : null;
  delete f.block;
  const reasons = [];
  if (ageDays == null || ageDays > MARK_DAYS) reasons.push(ageDays == null ? 'its date was not given' : `dated ${date}, ${ageDays} days ago (over ${MARK_DAYS})`);
  if (f.basis === 'ask') reasons.push('the cheapest listing, not a sale - there is no market price');
  return Object.assign(f, {
    via: 'pokemontcg.io', copy, date, ageDays, marked: reasons.length > 0,
    text: f.market + ' ' + f.what + ', ' + (copy ? 'our stored copy of pokemontcg.io\'s figure' : 'from pokemontcg.io, fetched now')
      + (date ? ', dated ' + date + (ageDays != null ? ' (' + ageDays + ' days ago)' : '') : ', undated')
      + (f.market === 'Cardmarket (EU)' ? ' - a European retail figure, not the US market' : '')
      + (reasons.length ? '. May be out of date: ' + reasons.join('; ') + '. Shown for reference only: it moves no deal, alert or trending list.' : '.'),
  });
}

// The stored copy, as the database row holds it.
function storedFigure(row, opts) {
  return figureOf(row && row.tcgplayer_data, row && row.cardmarket_data, Object.assign({}, opts, { copy: true }));
}
// A block fetched from pokemontcg.io just now (the live fallback paths, ingest).
function liveFigure(card, opts) {
  return figureOf(card && card.tcgplayer, card && card.cardmarket, Object.assign({}, opts, { copy: false }));
}

module.exports = { TCG_PRINTINGS, MARK_DAYS, dateOf, figureOf, storedFigure, liveFigure };
