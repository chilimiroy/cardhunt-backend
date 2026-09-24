// trending.js — what /api/trending sorts by, and what it refuses to rank.
//
// REQUIRED BY server.js, so it is TRACKED. A file the server requires is not
// local tooling (the estimator.js / yuyutei.js lesson in CLAUDE.md).
//
// ── What exists to sort by, measured 2026-09-24 against Supabase ──
//
//   price     Every card with a measured, ungraded price. Same row the card
//             page reads: grade IS NULL, never an estimate, latest first.
//
//   movers    price_history is append-only, so a change is two measured rows
//             for the same card, from the SAME source, the same edition and
//             the same variant, a window apart. Pairs available that day:
//
//                 window   pairs   changed   moved >=10% on a >=$1 card
//                 24h        615       129        23
//                 7d         812       563        72
//                 30d      6,482     5,838     1,333
//
//             All English. Japanese cards are not being re-priced: ONE
//             Japanese card had a measured price from the last 4 days (Yahoo
//             rows stop 09-22, Yuyu-tei was a single 08-29 pass), so none has
//             a fresh price to pair. Grouping yahoojp_N by family was measured
//             too and adds nothing for the same reason. Chinese has no prices
//             at all. The
//             response reports how many cards were ELIGIBLE, so an empty
//             Japanese list reads as "no data", not "no movement".
//
//   views     NOTHING RECORDS A CARD VIEW. No table, no column, no endpoint.
//             "Most viewed" is therefore not offered: a sort with no data
//             behind it would return an arbitrary order dressed as a ranking.
//
// ── Thin data, excluded rather than ranked ──
//   * estimates never participate, at either end;
//   * a change across sources (yuyutei -> tcgplayer) is a source switch, not
//     a movement, so both ends must share source, edition and variant —
//     editions are separate markets;
//   * the current price must be recent (MAX_AGE_DAYS) or it is not a mover
//     "now"; the earlier price must fall inside the window's own band, so a
//     card with two points a month apart is never a 24-hour mover;
//   * a ratio is meaningless at the price floor: percentage sorts need the
//     earlier price >= $1 and every mover must have moved >= $0.25;
//   * sample_n cannot help: it is NULL on every one of the 83,974 real rows.
//     Recorded here so nobody builds a filter on it expecting it to bite.
//   * a >5x move in the window is FLAGGED suspect and sorted after the rest,
//     never removed — the outlier.js rule. It is far more often a variant
//     mix-up than a market.

'use strict';

const SORTS = {
  'price-desc': { label: 'Price: high to low',               kind: 'price' },
  'price-asc':  { label: 'Price: low to high',               kind: 'price' },
  'gain-pct':   { label: 'Biggest movers — % gain',          kind: 'move' },
  'fall-pct':   { label: 'Biggest fallers — %',              kind: 'move' },
  'gain-usd':   { label: 'Biggest movers — value gain',      kind: 'move' },
  'fall-usd':   { label: 'Biggest fallers — value',          kind: 'move' },
};

// The earlier price must lie in [window, window + tolerance] before the
// current one. Tolerance exists because refresh runs on tiers (24h to 30d),
// so an exact-to-the-hour pair almost never exists.
const WINDOWS = {
  '24h': { days: 1,  tolDays: 1,  label: '24 hours' },
  '7d':  { days: 7,  tolDays: 4,  label: '7 days' },
  '30d': { days: 30, tolDays: 15, label: '30 days' },
};
const DEFAULT_SORT = 'price-desc';
const DEFAULT_WINDOW = '7d';
const LANGS = ['en', 'ja', 'zh-tw', 'zh-cn'];

const MAX_AGE_DAYS = 4;       // the current price must be this fresh to be a mover
const PCT_MIN_PREV = 1.00;    // % sorts: earlier price floor, USD
const MIN_ABS_MOVE = 0.25;    // every mover: minimum absolute change, USD
const SUSPECT_RATIO = 5;      // flagged, sorted last, never removed

function parseParams(q) {
  q = q || {};
  const sort = SORTS[q.sort] ? q.sort : DEFAULT_SORT;
  const window = WINDOWS[q.window] ? q.window : DEFAULT_WINDOW;
  const lang = LANGS.indexOf(q.lang) >= 0 ? q.lang : 'en';
  let limit = parseInt(q.limit, 10);
  if (!(limit > 0)) limit = 24;
  limit = Math.min(limit, 60);
  return { sort, window, lang, limit, kind: SORTS[sort].kind };
}

// The card's own id prefix. `LIKE 'en-%'` alone would not separate zh-tw
// from zh-cn, and the one foreign-shaped id in `cards` (me2pt5-294) matches
// no language at all, which is correct.
function langPattern(lang) { return lang + '-%'; }

const CARD_COLS = `c.api_card_id AS id, c.name, c.name_en, c.number, c.rarity,
  c.image_small, c.set_api_id, c.set_name, c.set_name_en`;

const REAL = `ph.grade IS NULL AND ph.source NOT LIKE 'estimate%' AND ph.price_usd > 0`;

function priceSql(p) {
  const dir = p.sort === 'price-asc' ? 'ASC' : 'DESC';
  return {
    text: `
      WITH latest AS (
        SELECT DISTINCT ON (ph.card_api_id)
               ph.card_api_id, ph.price_usd, ph.source, ph.recorded_at
        FROM price_history ph
        WHERE ${REAL} AND ph.card_api_id LIKE $1
        ORDER BY ph.card_api_id, ph.recorded_at DESC)
      SELECT ${CARD_COLS}, l.price_usd AS price, l.source AS price_source,
             l.recorded_at AS price_date,
             COUNT(*) OVER () AS eligible
      FROM latest l JOIN cards c ON c.api_card_id = l.card_api_id
      ORDER BY l.price_usd ${dir}, c.api_card_id
      LIMIT $2`,
    values: [langPattern(p.lang), p.limit],
  };
}

// Every eligible pair is returned (a few thousand at most) and ranked in JS
// by rankMovers(), so the thin-data rules live in one testable place rather
// than half in SQL and half here.
function moverSql(p) {
  const w = WINDOWS[p.window];
  return {
    text: `
      WITH cur AS (
        SELECT DISTINCT ON (ph.card_api_id)
               ph.card_api_id, ph.source, ph.edition, ph.variant,
               ph.price_usd, ph.recorded_at
        FROM price_history ph
        WHERE ${REAL} AND ph.card_api_id LIKE $1
          AND ph.recorded_at > NOW() - make_interval(days => $2)
        ORDER BY ph.card_api_id, ph.recorded_at DESC),
      prev AS (
        SELECT DISTINCT ON (ph.card_api_id)
               ph.card_api_id, ph.price_usd, ph.recorded_at
        FROM price_history ph
        JOIN cur ON cur.card_api_id = ph.card_api_id
                AND cur.source = ph.source
                AND COALESCE(cur.edition, '') = COALESCE(ph.edition, '')
                AND COALESCE(cur.variant, '') = COALESCE(ph.variant, '')
        WHERE ${REAL}
          AND ph.recorded_at <= cur.recorded_at - make_interval(days => $3)
          AND ph.recorded_at >= cur.recorded_at - make_interval(days => $4)
        ORDER BY ph.card_api_id, ph.recorded_at DESC)
      SELECT ${CARD_COLS},
             cur.price_usd AS price, cur.source AS price_source,
             cur.recorded_at AS price_date,
             prev.price_usd AS prev_price, prev.recorded_at AS prev_date
      FROM cur JOIN prev USING (card_api_id)
      JOIN cards c ON c.api_card_id = cur.card_api_id`,
    values: [langPattern(p.lang), MAX_AGE_DAYS, w.days, w.days + w.tolDays],
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

// rows: [{ price, prev_price, ... }] with numeric-ish prices.
// Returns { cards, eligible, excluded:{floor, unchanged}, suspect }.
function rankMovers(rows, sort) {
  const pct = sort === 'gain-pct' || sort === 'fall-pct';
  const gain = sort === 'gain-pct' || sort === 'gain-usd';
  const excluded = { floor: 0, direction: 0, small: 0 };
  const out = [];
  for (const r of rows) {
    const now = Number(r.price), was = Number(r.prev_price);
    if (!(now > 0) || !(was > 0)) continue;
    const change = now - was;
    if (Math.abs(change) < MIN_ABS_MOVE) { excluded.small++; continue; }
    if (gain ? change <= 0 : change >= 0) { excluded.direction++; continue; }
    if (pct && was < PCT_MIN_PREV) { excluded.floor++; continue; }
    const ratio = now / was;
    out.push(Object.assign({}, r, {
      price: round2(now), prev_price: round2(was),
      change: round2(change), change_pct: round2((ratio - 1) * 100),
      suspect: ratio > SUSPECT_RATIO || ratio < 1 / SUSPECT_RATIO,
    }));
  }
  const key = pct ? (c => c.change_pct) : (c => c.change);
  out.sort((a, b) => {
    if (a.suspect !== b.suspect) return a.suspect ? 1 : -1;
    return gain ? key(b) - key(a) : key(a) - key(b);
  });
  return { cards: out, eligible: rows.length, excluded,
           suspect: out.filter(c => c.suspect).length };
}

function describeRule(p) {
  if (p.kind === 'price') {
    return 'Latest measured, ungraded price per card — estimates excluded. '
      + 'The same price the card page shows.';
  }
  const w = WINDOWS[p.window];
  return 'Change between two measured prices from the same source, edition and variant, '
    + w.label + ' apart (earlier price ' + w.days + '–' + (w.days + w.tolDays) + ' days before the latest), '
    + 'the latest within ' + MAX_AGE_DAYS + ' days. Estimates never count. '
    + (p.sort.endsWith('pct') ? 'Cards under $' + PCT_MIN_PREV.toFixed(2) + ' are left out of % sorts. ' : '')
    + 'Moves under $' + MIN_ABS_MOVE.toFixed(2) + ' are ignored; a move over ' + SUSPECT_RATIO
    + 'x is flagged and sorted last.';
}

module.exports = {
  SORTS, WINDOWS, LANGS, DEFAULT_SORT, DEFAULT_WINDOW,
  MAX_AGE_DAYS, PCT_MIN_PREV, MIN_ABS_MOVE, SUSPECT_RATIO,
  parseParams, priceSql, moverSql, rankMovers, describeRule,
};
