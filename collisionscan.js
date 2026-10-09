// collisionscan.js — which TCGplayer product ids are mapped to more than one of
// our cards (Roy, 2026-10-09). READ-ONLY on the database; 0 eBay calls.
//
//   node collisionscan.js            print the measurement
//   node collisionscan.js --write    also write pricehold-collisions.json, the
//                                    list pricehold.js holds (no headline price)
//
// Three mappings carry a product id: TCGdex's own per-printing ids
// (cards.variants, from variants_detailed), TCGdex's pricing block (the
// productId on tcgdex_tcgplayer_* price rows, latest per card and printing),
// and our TCGplayer internal search (tcgplayer_market rows, latest per card).
// An id held by two or more of our cards means one of the mappings is wrong.
// `origin` says where: the source (TCGdex gives both cards the id), our search
// (alone, or onto an id TCGdex gives another card), or both.
// The matching itself is NOT changed here — that is a task of its own.
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'pricehold-collisions.json');

async function scan(db) {
  const cards = new Map((await db.query(`SELECT api_card_id, name, number, set_api_id FROM cards`)).rows.map(r => [r.api_card_id, r]));
  const claims = [];
  for (const r of (await db.query(`SELECT api_card_id, vp->>'tcgplayer' AS pid
      FROM cards, jsonb_array_elements(variants->'printings') vp
      WHERE variants IS NOT NULL AND vp ? 'tcgplayer' AND vp->>'tcgplayer' <> ''`)).rows)
    claims.push({ pid: String(r.pid), card: r.api_card_id, via: 'tcgdex-variants' });
  for (const r of (await db.query(`SELECT DISTINCT ON (card_api_id, source) card_api_id, source_meta->>'productId' AS pid
      FROM price_history WHERE source LIKE 'tcgdex_tcgplayer_%' AND source_meta ? 'productId'
      ORDER BY card_api_id, source, recorded_at DESC`)).rows)
    claims.push({ pid: String(r.pid), card: r.card_api_id, via: 'tcgdex-pricing' });
  for (const r of (await db.query(`SELECT DISTINCT ON (card_api_id) card_api_id, source_meta->>'productId' AS pid
      FROM price_history WHERE source = 'tcgplayer_market' AND source_meta ? 'productId'
      ORDER BY card_api_id, recorded_at DESC`)).rows)
    claims.push({ pid: String(r.pid), card: r.card_api_id, via: 'our-search' });
  const byPid = new Map();
  for (const c of claims) {
    if (!cards.has(c.card)) continue;
    const e = byPid.get(c.pid) || new Map();
    (e.get(c.card) || e.set(c.card, new Set()).get(c.card)).add(c.via);
    byPid.set(c.pid, e);
  }
  const collisions = [];
  for (const [pid, e] of byPid) {
    if (e.size < 2) continue;
    const vias = [...e.values()].map(s => [...s]);
    const bySource = vias.filter(s => s.some(v => v.startsWith('tcgdex'))).length >= 2;
    const ours = vias.some(s => s.includes('our-search'));
    const origin = bySource && ours ? 'both' : bySource ? 'source' : vias.some(s => s.some(v => v.startsWith('tcgdex'))) ? 'our-search-onto-tcgdex-id' : 'our-search';
    collisions.push({ product: pid, origin,
      cards: [...e.keys()].sort().map(id => ({ id, name: cards.get(id).name, number: cards.get(id).number, set: cards.get(id).set_api_id, via: [...e.get(id)].sort() })) });
  }
  collisions.sort((a, b) => a.product.localeCompare(b.product, undefined, { numeric: true }));
  return { cardsWithId: new Set(claims.filter(c => cards.has(c.card)).map(c => c.card)).size, products: byPid.size, collisions };
}

async function main() {
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await db.query('SET default_transaction_read_only = on');
    const r = await scan(db);
    const n = new Set(r.collisions.flatMap(c => c.cards.map(x => x.id))).size;   // a card can sit in two collisions
    const per = {}; for (const c of r.collisions) per[c.cards.length] = (per[c.cards.length] || 0) + 1;
    const org = {}; for (const c of r.collisions) org[c.origin] = (org[c.origin] || 0) + 1;
    console.log(`${r.cardsWithId} cards carry a product id (${r.products} ids); ${r.collisions.length} ids map to more than one card, ${n} cards`);
    console.log('  by cards per id: ' + JSON.stringify(per) + '   by origin: ' + JSON.stringify(org));
    if (process.argv.includes('--write')) {
      fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), collisions: r.collisions }, null, 1) + '\n');
      console.log('  wrote ' + path.basename(OUT));
    }
  } finally { await db.end(); }
}
module.exports = { scan, OUT };
if (require.main === module) main().catch(e => { console.error('collisionscan failed: ' + e.message); process.exit(1); });
