// estimatescan.js — which cards would show OUR ESTIMATE where the card's own
// recorded prices say something else entirely (Roy, 2026-10-09). READ-ONLY on
// the database; 0 eBay calls.
//
//   node estimatescan.js            print the measurement
//   node estimatescan.js --write    also write pricehold-estimates.json, the
//                                   list pricehold.js holds (no number shown)
//
// A card DISPLAYS an estimate when its headline row is one (source estimate*),
// or when it has no headline and no pokemontcg.io price blob, so the page runs
// estimator.js itself (getBase -> mockP). Its OWN record is every measured raw
// row stored for it — any source, any date, second readings included, refused
// rows (another card's product, pricehold.REFUSED) excluded. When the estimate
// sits MULTIPLE times or more below or above the median of that record, the
// estimate is held: the card shows no number and says why. Skyridge Gengar H09
// showed an estimate of $0.30 while TCGdex had measured it at $190-$195 four
// times: a fake bargain with our name on it.
//
// Why 5 (measured 2026-10-09, PROGRESS 2026-10-09 (late)): not the estimator's
// own error — it misses the measured median by 4.1x for the median card and by
// 17x for a quarter of them, so a bar set from its error would excuse almost
// anything. 5x is past what the card's own record explains: Cardmarket's EU
// retail runs ~1.6x TCGplayer, and the median card's furthest reading sits 1.7x
// from its own median. An estimate a fifth of what the card has been measured
// at is the bargain the page must never advertise. Today only H09 crosses any
// bar from 2x to 650x; the multiple governs what comes next.
//
// The estimator is not changed. The hold comes off by itself the moment a
// measured headline is recorded (pricehold.apply holds only a payload with no
// real price), and the list is re-measured by --write.
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'pricehold-estimates.json');
const MULTIPLE = 5;

async function scan(db) {
  const printsql = require('./printsql'), pricehold = require('./pricehold'), digital = require('./digital');
  const est = require('./estimator');
  // The headline as it would be WITHOUT this hold, or a held card would vanish
  // from its own measurement.
  const rule = printsql.basePrintingSql('ph', 'c').replace(pricehold.notEstimateHeldSql('ph'), 'TRUE');
  const rows = (await db.query(`SELECT c.api_card_id, c.name, c.number, c.rarity, c.set_total, c.set_release,
      COALESCE(c.tcgplayer_data->'prices', '{}'::jsonb) <> '{}'::jsonb AS tblob,
      COALESCE(c.cardmarket_data->'prices', '{}'::jsonb) <> '{}'::jsonb AS cblob,
      lp.price_usd, lp.source
    FROM cards c LEFT JOIN LATERAL (SELECT price_usd, source FROM price_history ph
      WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL AND ${rule}
      ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC LIMIT 1) lp ON TRUE
    WHERE ${digital.visibleSql('c')} AND (lp.source IS NULL OR lp.source LIKE 'estimate%')`)).rows;
  const shown = [];
  for (const r of rows) {
    if (pricehold.HELD[r.api_card_id]) continue;   // already held, for a shared product
    if (r.source) shown.push({ id: r.api_card_id, name: r.name, estimate: Number(r.price_usd), shownAs: 'stored estimate row' });
    else if (!r.tblob && !r.cblob) shown.push({ id: r.api_card_id, name: r.name, shownAs: 'page estimate (estimator.js)',
      estimate: est.estimatePrice({ rarity: r.rarity, cardId: r.api_card_id, name: r.name, number: r.number, setTotal: r.set_total, setRelease: r.set_release }) });
  }
  const refused = pricehold.REFUSED.map(x => Number(x.row));
  const own = (await db.query(`SELECT card_api_id, price_usd::float AS p, source, recorded_at, recorded_at::date::text AS d FROM price_history
      WHERE card_api_id = ANY($1) AND grade IS NULL AND source NOT LIKE 'estimate%' AND price_usd > 0 AND NOT (id = ANY($2))
      ORDER BY recorded_at`, [shown.map(s => s.id), refused])).rows;
  const by = new Map();
  for (const o of own) (by.get(o.card_api_id) || by.set(o.card_api_id, []).get(o.card_api_id)).push(o);
  const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const held = [];
  let compared = 0;
  for (const s of shown) {
    const rec = by.get(s.id);
    if (!rec || !(s.estimate > 0)) continue;
    compared++;
    const med = median(rec.map(o => o.p));
    const ratio = Math.max(med / s.estimate, s.estimate / med);
    if (ratio < MULTIPLE) continue;
    held.push({ id: s.id, name: s.name, estimate: s.estimate, shownAs: s.shownAs,
      median: Math.round(med * 100) / 100, readings: rec.length, sources: [...new Set(rec.map(o => o.source))].sort(),
      first: rec[0].d, last: rec[rec.length - 1].d,
      ratio: Math.round(ratio), direction: med > s.estimate ? 'below' : 'above' });
  }
  held.sort((a, b) => a.id.localeCompare(b.id));
  return { shown: shown.length, compared, held };
}

async function main() {
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await db.query('SET default_transaction_read_only = on');
    const r = await scan(db);
    console.log(`${r.shown} cards display an estimate; ${r.compared} have a measured record of their own; ${r.held.length} sit ${MULTIPLE}x or more from it`);
    for (const h of r.held) console.log(`  ${h.id} ${h.name}: estimate $${h.estimate} is ${h.ratio}x ${h.direction} its own median $${h.median} (${h.readings} readings, ${h.sources.join(', ')}, ${h.first}..${h.last})`);
    if (process.argv.includes('--write')) {
      fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), multiple: MULTIPLE, held: r.held }, null, 1) + '\n');
      console.log('  wrote ' + path.basename(OUT));
    }
  } finally { await db.end(); }
}
module.exports = { scan, OUT, MULTIPLE };
if (require.main === module) main().catch(e => { console.error('estimatescan failed: ' + e.message); process.exit(1); });
