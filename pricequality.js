// pricequality.js — is a card's headline price CURRENT and MEASURED? (T1, 2026-10-02)
//
// Measured 2026-10-02 over every visible card (PROGRESS.md): of 1,148 cards
// whose headline is over $100, 130 are not a current, measured price —
// 113 Japanese Yuyu-tei asks from a single 28 August run nothing repeats,
// 10 English rows 66-67 days old that no source re-prices (Rayquaza ☆
// $2,500.99, Mudkip ☆ $3,999.99), and 7 English rows that ALTERNATE
// between two figures night after night (Torchic ☆ 4500 / 1200 / 4500 /
// 1200 / 4500). The card page said a price's date; nothing else did, and
// nothing said a price was swinging or thin. Every screen that shows a
// headline now carries this module's answer, and the page draws it with
// one function (priceFlagHtml).
//
// ONE definition. Every server payload that carries a headline price calls
// annotate(); the page never re-derives any of it. The page's own
// PRICE_OLD_DAYS (card page date line) is pinned to STALE_DAYS by
// pricequality.test.js — two copies of "30" is how this project drifts.
//
// Flags, never removals: an old or unsettled price is still the price we
// hold, and it is shown — saying what it is.
'use strict';

const STALE_DAYS = 30;          // older than this: no source has re-priced it
const UNSETTLED_RATIO = 1.5;    // a move this large between two readings...
const UNSETTLED_JUMPS = 2;      // ...at least twice inside the window
const WINDOW_DAYS = 60;
const THIN_YAHOO_N = 2;         // a Yahoo median of 1-2 items (source name yahoojp_N)

const DAY = 86400000;

// How many items stand behind the headline, where the source says.
// yahoojp_N: N items in the median. TCGplayer internal search records
// TCGplayer's own listing count in source_meta.listings (0b0ddfb, from the
// 2026-10-03 nightly on). Everything else: unknown, and nothing is claimed.
function listingsBehind(source, meta) {
  const m = /^yahoojp_(\d+)$/.exec(String(source || ''));
  if (m) return Number(m[1]);
  if (meta && typeof meta.listings === 'number') return meta.listings;
  return null;
}

// Count the big moves in a chronological series of one source's readings.
function jumps(series) {
  let n = 0;
  for (let i = 1; i < series.length; i++) {
    const a = Number(series[i - 1]), b = Number(series[i]);
    if (!(a > 0) || !(b > 0)) continue;
    if (Math.max(a, b) / Math.min(a, b) >= UNSETTLED_RATIO) n++;
  }
  return n;
}

// Whose figure a headline is, when it is not TCGplayer's US market as TCGdex
// or our search measured it (Roy, 2026-10-09). The legacy pokemontcg.io import
// (ingest extractPrice, rows of 2026-07-27 .. 09-22, no source_meta) wrote
// cardmarket_avg / cardmarket_trend (Cardmarket's EU retail) and
// tcgplayer_<printing>[_mid]; TCGdex writes tcgdex_cardmarket. Ten of the
// cards released from a shared product on 2026-10-09 fell to a July
// cardmarket_avg row, and the page called it nothing but "old".
function originOf(source, meta) {
  const s = String(source || '');
  // Our search's rows from before 2 October record no product and no match
  // label: the fallback that took other cards' products wrote them, and
  // nothing says which (Roy, 2026-10-09: left, shown with their age, re-asked
  // first by value). ~2% of those checkable were wrong.
  if (s === 'tcgplayer_market' && !(meta && meta.matchedBy))
    return { flag: 'unchecked', market: 'TCGplayer (US)', what: 'market price', via: 'our TCGplayer search',
             note: 'which product it matched was not recorded, so its collector number cannot be checked; it is asked again first' };
  if (s === 'cardmarket_avg' || s === 'cardmarket_trend')
    return { flag: 'eu', market: 'Cardmarket (EU)', what: s === 'cardmarket_avg' ? 'average sell price' : 'trend price', via: 'pokemontcg.io' };
  if (s === 'tcgdex_cardmarket') return { flag: 'eu', market: 'Cardmarket (EU)', what: 'price', via: 'TCGdex' };
  if (/^tcgplayer_/.test(s) && s !== 'tcgplayer_market')
    return { flag: 'pokemontcg', market: 'TCGplayer (US)',
             what: /_mid$/.test(s) ? 'mid price' : /_low$/.test(s) ? 'cheapest listing' : 'market price', via: 'pokemontcg.io' };
  return null;
}

// ── An asking price (Roy, 2026-10-10) ──
// Where a source has listings but no market price (no recent sales), the
// writers store the cheapest listing with basis 'ask' (tcgdexprice.basisPrice,
// our search's ask pass; pokemontcg.io's `_low` rows record no source_meta, so
// their name says it). It is shown as "Cheapest listed: $X · <market>, <date>",
// never as a market value, and it feeds nothing (printsql.markedSql).
function isAsk(source, meta) {
  return !!((meta && meta.basis === 'ask') || /^tcgplayer_.*_low$/.test(String(source || '')));
}
// The source's own date for the figure where it gives one (TCGdex `updated`,
// pokemontcg.io `updatedAt`), else when we recorded it.
function figureDate(meta, recordedAt) {
  const d = meta && (meta.updated || meta.updatedAt);
  const t = Date.parse(d ? String(d).replace(/\//g, '-') : recordedAt);
  return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
function askOf(price, source, meta, recordedAt) {
  if (!isAsk(source, meta)) return null;
  const on = figureDate(meta, recordedAt);
  const market = /cardmarket/.test(String(source)) ? 'Cardmarket' : 'TCGplayer';
  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const day = on ? new Date(on + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
  return { price: Number(price), market, date: on,
           text: 'Cheapest listed: ' + fmt(price) + ' · ' + market + (day ? ', ' + day : ''),
           why: 'No recent sales, so no market price is available.' };
}

// Reviewed statements about one card's price, shown wherever its price is
// (Roy, 2026-10-09). Each says what we showed, what a source says, and what
// we cannot tell. A note never changes the number.
const NOTES = {
  'en-ecard3-H10': 'We showed $198.07 for this card until 2026-10-09; pokemontcg.io says $1,249.94 (its TCGplayer figure of 2026-06-29). '
    + 'The $198.07 came from a TCGplayer product named "Gyarados (11)". We cannot currently tell which is right.',
};

// The classification. `series`: the headline source's own readings for this
// card inside WINDOW_DAYS, oldest first (may be omitted: no unsettled flag).
function classify({ price, source, recordedAt, meta, series, now }) {
  now = now == null ? Date.now() : now;
  const p = price == null ? null : Number(price);
  if (!source || p == null || !(p > 0)) return { kind: 'none', flags: [], label: 'no price held' };
  // An estimate is not a price (Roy, 2026-10-09): printsql keeps estimate rows
  // out of every headline; should one ever arrive here it is no price, never a kind.
  if (/^estimate/.test(source)) return { kind: 'none', flags: [], label: 'no price held' };
  const flags = [];
  const t = recordedAt ? Date.parse(recordedAt) : NaN;
  const ageDays = isFinite(t) ? Math.floor((now - t) / DAY) : null;
  if (ageDays != null && ageDays > STALE_DAYS) flags.push('old');
  const n = listingsBehind(source, meta);
  if (n != null && n <= (/^yahoojp_/.test(source) ? THIN_YAHOO_N : 0)) flags.push('thin');
  let range = null;
  if (series && series.length >= 3 && jumps(series) >= UNSETTLED_JUMPS) {
    flags.push('unsettled');
    range = [Math.min.apply(null, series.map(Number)), Math.max.apply(null, series.map(Number))];
  }
  const parts = [];
  const o = originOf(source, meta);
  if (o) {
    flags.unshift(o.flag);
    const on = isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
    parts.push(`${o.market} ${o.what}, read from ${o.via}` + (on ? `, recorded ${on}` + (ageDays > STALE_DAYS && o.flag !== 'unchecked' ? '' : ` (${ageDays} days ago)`) : '')
      + (o.flag === 'eu' ? ' - a European retail figure, not the US market' : '')
      + (o.via === 'pokemontcg.io' ? "; pokemontcg.io's own date for it was not kept" : '')
      + (o.note ? '; ' + o.note : ''));
  }
  // An ask is said first: what the number is, then why there is no market price.
  const ask = askOf(p, source, meta, recordedAt);
  if (ask) { flags.unshift('ask'); parts.unshift(ask.text + ' - an asking price, not a market value. ' + ask.why); }
  if (flags.includes('old')) parts.push(`recorded ${ageDays} days ago; no source has re-priced it since`);
  if (flags.includes('thin')) parts.push(n === 0 ? 'the source had no listings behind this figure'
                                                 : `from ${n} listing${n === 1 ? '' : 's'} only`);
  if (range) parts.push(`moved ${UNSETTLED_RATIO}x or more at least twice in ${WINDOW_DAYS} days `
                        + `(between $${range[0].toFixed(2)} and $${range[1].toFixed(2)})`);
  return { kind: 'measured', flags, ageDays, listings: n, range, ask,
           label: flags.length ? flags.join(' · ') : 'current',
           title: parts.length ? parts.join('; ') : null };
}

// Annotate headlines in one query. items: [{ id, price, source, recordedAt, meta }].
// Returns Map(id -> quality). The series is the headline source's own rows
// for that card in the window — ungraded, base printing, the same rows a
// headline is chosen from (printsql), so a reverse or a second reading can
// never make a base price look unsettled.
async function annotate(db, items) {
  const out = new Map();
  const real = items.filter(x => x && x.id && x.source && !/^estimate/.test(x.source));
  let rows = [];
  if (db && real.length) {
    const printsql = require('./printsql');
    try {
      rows = (await db.query(`
        SELECT ph.card_api_id AS id, ph.source, ph.price_usd::float AS p
        FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
        -- digital:unfiltered — the ids were resolved through visibleSql by the caller
        WHERE ph.card_api_id = ANY($1) AND ph.grade IS NULL
          AND ph.recorded_at > NOW() - make_interval(days => ${WINDOW_DAYS})
          AND ${printsql.basePrintingSql('ph', 'c')}
        ORDER BY ph.recorded_at`, [real.map(x => x.id)])).rows;
    } catch (e) { rows = null; }   // a failed lookup claims nothing about settledness
  }
  const series = new Map();
  for (const r of rows || []) {
    const k = r.id + '\u0000' + r.source;
    if (!series.has(k)) series.set(k, []);
    series.get(k).push(r.p);
  }
  for (const x of items) {
    if (!x || !x.id) continue;
    const q = classify({ price: x.price, source: x.source, recordedAt: x.recordedAt, meta: x.meta,
      series: rows ? series.get(x.id + '\u0000' + x.source) || [] : null });
    if (NOTES[x.id]) q.note = NOTES[x.id];
    out.set(x.id, q);
  }
  return out;
}

module.exports = { STALE_DAYS, UNSETTLED_RATIO, UNSETTLED_JUMPS, WINDOW_DAYS, THIN_YAHOO_N,
                   NOTES, listingsBehind, jumps, originOf, isAsk, figureDate, askOf, classify, annotate };
