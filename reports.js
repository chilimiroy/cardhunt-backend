// ══════════════════════════════════════════════════════════════
// reports.js — a user's report about one listing row (Roy, 2026-10-08,
// TASK-reports-and-pages T3). REQUIRED BY server.js, so it is TRACKED.
//
// What a report holds, what it may hold, and how often one may be filed.
// The routes are in server.js (POST /api/reports — access.approved;
// GET /api/admin/reports and POST /api/admin/reports/:id/state —
// access.master); the table is migration-reports.sql (Roy runs it).
//
// The details field is text a person typed. It is DATA: stored as given
// (trimmed, capped), never interpreted here, and the page renders it with
// textContent only (reports.test.js stores a script tag and proves it).
// ══════════════════════════════════════════════════════════════
'use strict';
const { isOurCardId } = require('./cardid');

const REASONS = {
  fake:            'Fake or counterfeit',
  wrong_card:      'Wrong card',
  wrong_condition: 'Wrong condition',
  wrong_price:     'Wrong price',
  other:           'Other',
};
const STATES = ['new', 'reviewed', 'actioned', 'dismissed'];

const DETAILS_MAX = 1000;        // characters; the form says so and stops at it
const PHOTO_CHECKS_MAX = 8000;   // bytes of JSON: the row's verdicts, never a photo
// The rate limit, counted in the table itself (survives a restart, and
// every server instance agrees): at most 5 reports in any 10 minutes and
// 30 in any 24 hours per account. A person reporting a bad page of listings
// one by one fits inside it; a script filling the table does not.
const RATE = [
  { n: 5,  minutes: 10,      label: '5 reports in 10 minutes' },
  { n: 30, minutes: 24 * 60, label: '30 reports in 24 hours' },
];

// ── The stored eBay price does not outlive its use (Roy, 2026-10-08) ──
// A report keeps listing_id and listing_url. The price we showed is eBay's
// data: it is cleared once the report is actioned or dismissed, and on any
// report older than PRICE_KEEP_DAYS whatever its state. Only eBay rows: a
// shop's ask (Yuyu-tei) is not eBay data. Not a scheduled job: clearPrices()
// runs when a report is filed, before every read of the masters' list and
// after every state change — the only paths that read or write the price.
const PRICE_KEEP_DAYS = 30;
const PRICE_CLEAR_STATES = ['actioned', 'dismissed'];
// The rule, for one row (reports.test.js; reportprobe.js checks the SQL
// below gives the same answer on real rows).
function shouldClearPrice(row, now) {
  if (!row || row.source !== 'ebay' || row.price_shown == null) return false;
  if (PRICE_CLEAR_STATES.indexOf(row.state) >= 0) return true;
  const age = (now == null ? Date.now() : +now) - new Date(row.created_at).getTime();
  return age > PRICE_KEEP_DAYS * 86400000;
}
function clearPricesSql() {
  return `UPDATE listing_reports SET price_shown = NULL, price_currency = NULL
    WHERE source = 'ebay' AND price_shown IS NOT NULL
      AND (state IN (${PRICE_CLEAR_STATES.map(s => "'" + s + "'").join(', ')}) OR created_at < now() - interval '${PRICE_KEEP_DAYS} days')`;
}
// -> the number of reports whose price was cleared
async function clearPrices(db) {
  const r = await db.query(clearPricesSql());
  return r.rowCount;
}

const str = (v, max) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()).slice(0, max);

// The photo-check verdicts at the moment of the report, as the row carried
// them: the stamp / lookalike / sibling check, the back check, the outlier
// or novelty flag. Only these keys, only short strings and booleans.
function photoChecksOf(x) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  const pick = (o, keys) => {
    if (!o || typeof o !== 'object') return undefined;
    const r = {};
    for (const k of keys) if (o[k] != null) r[k] = typeof o[k] === 'boolean' ? o[k] : str(o[k], 300);
    return Object.keys(r).length ? r : undefined;
  };
  const stamp = pick(x.stamp, ['state', 'kind', 'says', 'deferred']);
  const back = pick(x.back, ['state', 'says', 'metal']);
  if (stamp) out.stamp = stamp;
  if (back) out.back = back;
  if (x.suspect) out.suspect = str(x.suspect, 60);
  if (x.suspectReason) out.suspectReason = str(x.suspectReason, 300);
  if (x.materialPending) out.materialPending = true;
  return out;
}

// body -> { ok: true, row } | { ok: false, error }
function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const reason = str(b.reason, 40);
  if (!REASONS[reason]) return { ok: false, error: 'choose what is wrong: ' + Object.keys(REASONS).join(', ') };
  const raw = typeof b.details === 'string' ? b.details : '';
  if (raw.trim().length > DETAILS_MAX) return { ok: false, error: 'details are limited to ' + DETAILS_MAX + ' characters' };
  const details = raw.trim();
  if (reason === 'other' && !details) return { ok: false, error: 'say what is wrong — details are required for "other"' };
  const cardId = str(b.cardId, 80);
  if (!isOurCardId(cardId)) return { ok: false, error: 'not a CardZon card id' };
  const listingId = str(b.listingId, 200);
  if (!listingId) return { ok: false, error: 'the listing id is missing' };
  let listingUrl = str(b.listingUrl, 600) || null;
  if (listingUrl && !/^https?:\/\//i.test(listingUrl)) return { ok: false, error: 'the listing URL is not a web address' };
  const source = str(b.source, 40);
  if (!source) return { ok: false, error: 'the source is missing' };
  let price = b.price == null || b.price === '' ? null : Number(b.price);
  if (price != null && !(Number.isFinite(price) && price >= 0 && price < 1e9)) return { ok: false, error: 'the price is not a number' };
  if (price != null) price = Math.round(price * 100) / 100;
  const currency = str(b.currency, 8) || null;
  const photoChecks = photoChecksOf(b.photoChecks);
  if (JSON.stringify(photoChecks).length > PHOTO_CHECKS_MAX) return { ok: false, error: 'photo-check snapshot too large' };
  return { ok: true, row: { cardId, listingId, listingUrl, source, price, currency, reason, details: details || null, photoChecks } };
}

// The SQL that counts an account's recent reports for every window at once.
function rateSql() {
  return 'SELECT ' + RATE.map((r, i) => `count(*) FILTER (WHERE created_at > now() - interval '${r.minutes} minutes')::int AS w${i}`).join(', ')
    + ' FROM listing_reports WHERE user_id = $1 AND created_at > now() - interval \'' + Math.max(...RATE.map(r => r.minutes)) + ' minutes\'';
}
// counts row -> null (allowed) | { limit, message }
function rateRefusal(row) {
  for (let i = 0; i < RATE.length; i++) {
    if ((row && row['w' + i] || 0) >= RATE[i].n)
      return { limit: RATE[i].label, message: 'Report limit reached: ' + RATE[i].label + '. Thank you — try again later.' };
  }
  return null;
}

module.exports = { REASONS, STATES, DETAILS_MAX, PHOTO_CHECKS_MAX, RATE, validate, photoChecksOf, rateSql, rateRefusal,
                   PRICE_KEEP_DAYS, PRICE_CLEAR_STATES, shouldClearPrice, clearPricesSql, clearPrices };
