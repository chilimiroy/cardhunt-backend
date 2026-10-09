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
//
// Our search's rows are held to the matcher's own rule (cardnumber.js,
// TASK-product-matching 2026-10-09): a stored tcgplayer_market row whose
// product states ANOTHER collector number than the one we asked for is a
// REFUSED row — not a mapping, and (pricehold.notRefusedSql) not a headline.
// The evidence is the number in the product's name where it states one
// ("Porygon (103b)"), else the stored matchedNumber: rows written before the
// fix stored the number through the old fold ("103b" -> "103"), so the name
// is the better witness. A reprint is asked by its PRINTED number (CC002 asks
// "4"), so that is the number it is held to. A row stating no number is
// refused only on a card the old matcher is proven to have mismatched, and
// never when the fixed matcher wrote it (source_meta.numberRule) — the fixed
// matcher still takes a hit stating no number. Rows are not deleted.
// A row whose product is STAMPED ([Staff], (Prerelease)) is refused the same
// way unless TCGdex maps the card to that very product (2026-10-09).
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'pricehold-collisions.json');
const { numberKey, tcgHitNumber, RULE, stampedNotOurs, tcgdexProductIds } = require('./cardnumber');
const cm = require('./cardmatch');

// The number our search asked for this card, and the one the stored row's
// product states; refused when both are known and differ.
function askedNumber(card) {
  const rp = cm.reprintOf({ api_card_id: card.api_card_id, number: card.number });
  return rp ? rp.number : card.number;
}
function statedNumber(meta) {
  return tcgHitNumber({ productName: meta && meta.matched }) || numberKey(meta && meta.matchedNumber);
}
// Reviewed (Roy, 2026-10-09): six cards whose headline was a search row written
// before 2 October (no product, no match label) sitting more than 3x from
// pokemontcg.io's own TCGplayer figure for the card — the fallback's signature.
// Their unlabelled search rows that far off are refused. The other ~952 such
// headlines are left (6 bad of 311 checkable, ~2%), shown with their age and
// re-asked first by value (refresh). Measured: PROGRESS 2026-10-09 (late).
const REVIEWED_OFF = { ratio: 3, decided: 'Roy, 2026-10-09', cards: ['en-g1-RC29', 'en-bw11-RC23', 'en-bwp-BW80', 'en-bw11-RC1', 'en-xyp-XY85', 'en-ex15-100'] };
function pokemontcgFigure(tp, p) {
  const v = Object.values(tp || {}).map(x => x && (x.market > 0 ? x.market : x.mid > 0 ? x.mid : 0)).filter(x => x > 0);
  return v.length ? v.reduce((a, x) => Math.abs(Math.log(x / p)) < Math.abs(Math.log(a / p)) ? x : a) : null;
}
function refusedRow(card, meta) {
  const stated = statedNumber(meta), asked = numberKey(askedNumber(card));
  return stated !== null && asked !== null && stated !== asked ? { asked, stated } : null;
}

async function scan(db) {
  const cards = new Map((await db.query(`SELECT api_card_id, name, number, set_api_id, variants FROM cards`)).rows.map(r => [r.api_card_id, r]));
  const claims = [];
  for (const r of (await db.query(`SELECT api_card_id, vp->>'tcgplayer' AS pid
      FROM cards, jsonb_array_elements(variants->'printings') vp
      WHERE variants IS NOT NULL AND vp ? 'tcgplayer' AND vp->>'tcgplayer' <> ''`)).rows)
    claims.push({ pid: String(r.pid), card: r.api_card_id, via: 'tcgdex-variants' });
  // Every row our search wrote, newest first. Pass 1: a row whose product
  // states another number is refused. Pass 2: on a card pass 1 caught — the
  // old matcher is PROVEN to have mismatched it — a row that states no number
  // and was not written by the fixed matcher is refused too: it cannot show
  // it is not the same wrong product (Skyridge Gengar H09 held Gengar (10)'s
  // $509.99 on rows from before product ids were recorded).
  const ours = (await db.query(`SELECT id, card_api_id, source_meta
      FROM price_history WHERE source = 'tcgplayer_market'
      ORDER BY card_api_id, recorded_at DESC, id DESC`)).rows.filter(r => cards.has(r.card_api_id));
  const refused = [], refusedIds = new Set(), mismatched = new Set(), ourLatest = new Map();
  const refuse = (r, why, extra) => {
    const m = r.source_meta || {};
    refused.push(Object.assign({ row: String(r.id), card: r.card_api_id, product: m.productId != null ? String(m.productId) : null, why, matched: m.matched || null }, extra));
    refusedIds.add(String(r.id));
  };
  for (const r of ours) {
    const bad = refusedRow(cards.get(r.card_api_id), r.source_meta);
    if (bad) { refuse(r, 'states another number', bad); mismatched.add(r.card_api_id); continue; }
    // A stamped product ([Staff], (Prerelease)) is another card unless TCGdex
    // maps ours to that very product (cardnumber.stampedNotOurs, 2026-10-09).
    const m = r.source_meta || {};
    if (stampedNotOurs(m.matched, m.productId, tcgdexProductIds(cards.get(r.card_api_id).variants))) {
      refuse(r, 'stamped product, not the one TCGdex maps this card to', { asked: null, stated: null });
      mismatched.add(r.card_api_id);
    }
  }
  // TCGdex's pricing rows carry a product id but no product name. Where one of
  // our search rows has named that product, TCGdex's rows for it are held to
  // the same two rules (2026-10-09): np-36 Tropical Tidal Wave was priced
  // $1,400 by TCGdex on product 97703, which our search read as "Tropical Tidal
  // Wave - HGSS18 (Worlds 10) [Staff]" — another number, and stamped.
  const named = new Map();
  for (const r of ours) { const m = r.source_meta || {}; if (m.productId != null && m.matched && !named.has(String(m.productId))) named.set(String(m.productId), m.matched); }
  const tdxRows = named.size ? (await db.query(`SELECT id, card_api_id, source_meta FROM price_history
      WHERE source LIKE 'tcgdex_tcgplayer_%' AND source_meta->>'productId' = ANY($1)`, [[...named.keys()]])).rows.filter(r => cards.has(r.card_api_id)) : [];
  for (const r of tdxRows) {
    const pid = String(r.source_meta.productId), name = named.get(pid), card = cards.get(r.card_api_id);
    const bad = refusedRow(card, { matched: name });
    const stamped = !bad && stampedNotOurs(name, pid, tcgdexProductIds(card.variants));
    if (bad || stamped) refuse(Object.assign({}, r, { source_meta: Object.assign({}, r.source_meta, { matched: name }) }),
      bad ? 'TCGdex maps a product stating another number' : 'TCGdex maps a stamped product', bad || { asked: null, stated: null });
    if (bad || stamped) mismatched.add(r.card_api_id);   // its unlabelled search rows are unproven too (np-36)
  }
  for (const r of ours) {
    if (refusedIds.has(String(r.id)) || !mismatched.has(r.card_api_id)) continue;
    const m = r.source_meta || {};
    if (m.numberRule === RULE) continue;
    if (statedNumber(m) === null) refuse(r, 'states no number, on a card the old matcher mismatched', { asked: numberKey(askedNumber(cards.get(r.card_api_id))), stated: null });
  }
  // The reviewed six (REVIEWED_OFF): unlabelled rows more than 3x from pokemontcg.io's figure.
  const rev = (await db.query(`SELECT ph.id, ph.card_api_id, ph.price_usd::float AS p, ph.source_meta, c.tcgplayer_data->'prices' AS tp
      FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
      WHERE ph.source = 'tcgplayer_market' AND ph.card_api_id = ANY($1) AND NOT COALESCE(ph.source_meta ? 'matchedBy', false)`, [REVIEWED_OFF.cards])).rows;
  for (const r of rev) {
    if (refusedIds.has(String(r.id))) continue;
    const f = pokemontcgFigure(r.tp, r.p);
    if (f && Math.max(f / r.p, r.p / f) > REVIEWED_OFF.ratio)
      refuse(r, 'unlabelled search row more than 3x from pokemontcg.io (reviewed, ' + REVIEWED_OFF.decided + ')', { pokemontcg: f, price: r.p });
  }
  // TCGdex's pricing mapping: its latest row per card and printing, refused rows left out.
  for (const r of (await db.query(`SELECT DISTINCT ON (card_api_id, source) card_api_id, source_meta->>'productId' AS pid
      FROM price_history WHERE source LIKE 'tcgdex_tcgplayer_%' AND source_meta ? 'productId' AND NOT (id = ANY($1::bigint[]))
      ORDER BY card_api_id, source, recorded_at DESC`, [[...refusedIds]])).rows)
    claims.push({ pid: String(r.pid), card: r.card_api_id, via: 'tcgdex-pricing' });
  for (const r of ours) {
    const m = r.source_meta || {};
    if (refusedIds.has(String(r.id)) || m.productId == null || ourLatest.has(r.card_api_id)) continue;
    ourLatest.set(r.card_api_id, String(m.productId));
  }
  for (const [card, pid] of ourLatest) claims.push({ pid, card, via: 'our-search' });
  refused.sort((a, b) => a.card.localeCompare(b.card) || Number(a.row) - Number(b.row));
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
  return { cardsWithId: new Set(claims.filter(c => cards.has(c.card)).map(c => c.card)).size, products: byPid.size, collisions, refused };
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
    console.log(`  our search: ${r.refused.length} stored rows refused (another number stated, or none on a card it mismatched), on ${new Set(r.refused.map(x => x.card)).size} cards`);
    if (process.argv.includes('--write')) {
      fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), collisions: r.collisions, refused: r.refused }, null, 1) + '\n');
      console.log('  wrote ' + path.basename(OUT));
    }
  } finally { await db.end(); }
}
module.exports = { scan, OUT, refusedRow, askedNumber, statedNumber, REVIEWED_OFF };
if (require.main === module) main().catch(e => { console.error('collisionscan failed: ' + e.message); process.exit(1); });
