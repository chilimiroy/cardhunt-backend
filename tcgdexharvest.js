#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * tcgdexharvest.js — write TCGdex pricing into price_history
 *
 *   node tcgdexharvest.js <lang> [--dry] [--set=X] [--max=N] [--gaps-only]
 *
 *   --dry        change nothing; print what would be written
 *   --set=X      one set only
 *   --max=N      cap the run
 *   --gaps-only  only cards with no real price today (fastest value)
 *   --force      bypass the source-confidence gate (deliberate rebuild)
 *
 * TASK.md T1. Standalone on purpose: ingest.js has been reverted twice
 * by a downloaded file landing on local work, losing whole subsystems
 * (jpTitleIsSingleRaw, then evaluateAlerts and estFix) while the version
 * banner still matched. Parsing lives in tcgdexprice.js, conversion in
 * fx.js, confidence in sourcerank.js — a revert of ingest.js cannot
 * take any of it.
 *
 * ── What was verified before this file was allowed to write ──
 * TASK.md's rule is "probe before building", so:
 *
 *   tcgdexprobe.js xcheck en 40   median 1.020x, 37/37 agreement with
 *                                 our own tcgplayer_market. Expensive
 *                                 cards matched to the cent.
 *   tcgdexprobe.js cmcheck ja 30  no gross mismatches, so the card match
 *                                 is right; median 1.595x above JP
 *                                 sources — a real EU premium, which is
 *                                 why tcgdex_cardmarket is MEDIUM.
 *   tcgdexprobe.js census en 60   `reverse-holofoil` not `reverse`;
 *                                 `tcgplayer: null` on 11 of 60.
 *   tcgdexprobe.js reverse        241 cards ALREADY display a reverse
 *                                 price as their base price.
 *
 * ── SUPERSEDED 2026-09-29 (TASK T10): reverse rows ARE written now ──
 * The condition below was met: price_history.variant is read. Every
 * headline reader applies printsql.basePrintingSql (a reverse row is never
 * a base price), and this file writes reverse and mirror prices as variant
 * rows from tcgdexprice.printingPrices. The 241 were filled by their base
 * printing. Kept below as the record of why it waited.
 *
 * ── Why no reverse-holo row was written (until T10) ──
 * TASK.md: "Reverse-holo pricing may need its own row or a variant
 * column. Decide deliberately; do not overwrite a base price with a
 * reverse price."
 *
 * Decided: NOT WRITTEN, until price_history can distinguish printings.
 *
 * price_history has no variant column, and every reader takes the newest
 * non-estimate row for the card — server.js /api/sets (the LATERAL join)
 * and /api/market both do exactly this. So a reverse row IS a base price
 * as far as the product is concerned. This is not hypothetical: 241
 * cards already show a reverse-holo price as their base, from the
 * existing tcgplayer_reverseHolofoil rows. Adding a second source doing
 * the same thing would deepen a known bug while calling it a feature.
 *
 * The prices are still collected and counted, so the value of adding a
 * variant column is measurable. Run with --dry to see the total.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const { Pool } = require('pg');
const T = require('./tcgdexprice.js');
const fx = require('./fx.js');
const srank = require('./sourcerank.js');
const printsql = require('./printsql.js');   // T10: the ONE base-price rule the readers use

const TCGDEX = 'https://api.tcgdex.net/v2';
const DELAY = 350;                    // matches ingest.js DELAY_TCGDEX

const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (r.status === 429) { await sleep(30000 * (i + 1)); continue; }
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

/**
 * Does price_history carry a provenance column?
 *
 * TASK.md T1 requires recording the FX rate used. There is nowhere
 * schema-correct to put it today: `grades_json` is empty on all 86,843
 * rows, but its NAME says grades, and quietly storing an exchange rate
 * in it is the `/api/market/` mistake — a value that reads as one thing
 * and is another. So the column is used only if it has been added
 * deliberately, and the run says plainly which mode it is in.
 */
async function hasProvenanceColumn() {
  const r = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='price_history' AND column_name='source_meta'`);
  return r.rows.length > 0;
}

// ── the printings we will write, and the one we will not ──────
function sourceNameFor(printing) {
  return `tcgdex_tcgplayer_${printing}`;
}

async function harvest(lang, flags) {
  const dry      = flags.includes('--dry');
  const force    = flags.includes('--force');
  const gapsOnly = flags.includes('--gaps-only');
  const setArg   = (flags.find(f => f.startsWith('--set=')) || '').split('=')[1] || null;
  const max      = parseInt((flags.find(f => f.startsWith('--max=')) || '').split('=')[1], 10) || 0;

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  TCGDEX PRICING — ${lang}${setArg ? ' / ' + setArg : ''}${dry ? '   [DRY RUN — nothing is written]' : ''}`);
  console.log(`${'='.repeat(78)}\n`);

  // Refuse before doing any work, and say why. --force does NOT open this:
  // it relaxes the source-confidence gate, not the guard against writing
  // one language's prices onto another's cards.
  const allowed = T.pricingAllowedFor(lang);
  if (!allowed.ok) {
    console.log(`  REFUSING to write pricing for "${lang}".\n`);
    console.log('  ' + allowed.reason.replace(/(.{72}) /g, '$1\n  '));
    console.log('\n  This is not a rate limit or a missing key — the data is there and it is');
    console.log('  the wrong language\'s data. See tcgdexprice.js, LANGUAGE GUARD.\n');
    return;
  }

  const provenance = await hasProvenanceColumn();
  const rate = await fx.usdPer('EUR');
  console.log(`  EUR->USD @${rate.rate} (${rate.source}${rate.date ? ' ' + rate.date : ''})`
    + (rate.stale ? '   STALE — live rate unavailable, using pinned' : ''));
  console.log(`  FX provenance column: ${provenance ? 'source_meta present, rate recorded per row'
    : 'ABSENT — rate is printed in this log only, not stored per row'}`);
  if (!provenance) {
    console.log('    (add it with:  ALTER TABLE price_history ADD COLUMN source_meta jsonb;)');
  }
  console.log('');

  // Held source per card, so the confidence gate can be applied without
  // a query per card.
  const { rows: cards } = await db.query(`
    -- "What is shown" must be what the READERS show (T10, 2026-09-29): the
    -- ungraded card, and never a reverse row as the base. Read without that
    -- rule, the 241 cards displaying a reverse price looked PRICED, so
    -- --gaps-only skipped them and the rank gate refused their base price.
    WITH shown AS (
      SELECT DISTINCT ON (ph.card_api_id) ph.card_api_id, ph.source, ph.price_usd::float AS price
      FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
      WHERE ph.grade IS NULL AND ${printsql.basePrintingSql('ph', 'c')}
      ORDER BY ph.card_api_id, (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
    )
    SELECT c.api_card_id, c.name, c.number, c.set_api_id,
           s.source AS held_source, s.price AS held_price
    FROM cards c LEFT JOIN shown s ON s.card_api_id = c.api_card_id
    WHERE c.api_card_id LIKE $1
      AND ($2::text IS NULL OR c.set_api_id = $2)
      ${gapsOnly ? "AND (s.source IS NULL OR s.source LIKE 'estimate%')" : ''}
    ORDER BY c.set_api_id, c.number`, [lang + '-%', setArg]);

  const batch = max ? cards.slice(0, max) : cards;
  console.log(`  ${batch.length} cards to check`
    + (gapsOnly ? ' (no real price today)' : '')
    + `  —  roughly ${Math.round(batch.length * DELAY / 60000)} minutes\n`);
  if (!batch.length) { console.log('  Nothing to do.\n'); return; }

  let wrote = 0, filled = 0, refreshed = 0, skippedRank = 0, noPrice = 0,
      notFound = 0, reverseSeen = 0, cmOnly = 0, disagreements = 0, variantRows = 0,
      sharedRefused = 0;
  const unknownPrintings = {};
  const bigDisagree = [];
  const sharedExamples = [];
  const t0 = Date.now();

  // ── PHASE 1: fetch everything, write nothing ──
  // TASK T1 (2026-09-29): TCGdex sometimes gives two of our cards the SAME
  // TCGplayer product. Measured: swsh9tg-TG16 Mimikyu V (Trainer Gallery,
  // $86.55 on TCGplayer) is mapped to product 263784 — the main-set Mimikyu V
  // 068/172 at $3.62. A price that belongs to one card cannot be told from
  // the other's, so a product id claimed by two cards is trusted for NEITHER.
  // That can only be known once every card has been fetched, hence two phases.
  const fetched = [];
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const d = await get(`${TCGDEX}/${lang}/cards/${c.set_api_id}-${c.number}`);
    await sleep(DELAY);
    if (!d) { notFound++; continue; }
    const p = T.parsePricing(d);
    fetched.push({ c, p, printings: T.printingPrices(d) });
    if ((i + 1) % 500 === 0) {
      const eta = Math.round((Date.now() - t0) / 60000 / (i + 1) * (batch.length - i - 1));
      console.log(`  fetched ${i + 1}/${batch.length}   eta ${eta}m`);
    }
  }

  const conflicts = await T.recordProductClaims(db, lang, fetched.map(f => ({
    cardId: f.c.api_card_id,
    tcgplayer: f.p.tcgplayerBase && f.p.tcgplayerBase.productId,
    cardmarket: f.p.cardmarket && f.p.cardmarket.idProduct
  })), { dry, fullRun: !setArg && !max && !gapsOnly });
  console.log(`\n  product ids claimed by more than one card: ${conflicts.tcgplayer.size} TCGplayer, `
    + `${conflicts.cardmarket.size} Cardmarket  —  trusted for neither card`
    + (conflicts.persisted ? ' (recorded in tcgdex_product_conflicts)' : ''));

  // ── PHASE 2: write ──
  for (let i = 0; i < fetched.length; i++) {
    const { c, p } = fetched[i];
    p.unknownPrintings.forEach(k => { unknownPrintings[k] = (unknownPrintings[k] || 0) + 1; });
    if (p.tcgplayerReverse) reverseSeen++;

    const tpShared = p.tcgplayerBase && conflicts.tcgplayer.has(String(p.tcgplayerBase.productId));
    const cmShared = p.cardmarket && conflicts.cardmarket.has(String(p.cardmarket.idProduct));
    if (tpShared || cmShared) {
      sharedRefused++;
      if (sharedExamples.length < 12) sharedExamples.push(`${c.api_card_id} `
        + (tpShared ? `tcgplayer ${p.tcgplayerBase.productId} -> ${conflicts.tcgplayer.get(String(p.tcgplayerBase.productId)).join(', ')}` : '')
        + (cmShared ? ` cardmarket ${p.cardmarket.idProduct} -> ${conflicts.cardmarket.get(String(p.cardmarket.idProduct)).join(', ')}` : ''));
    }

    // ── choose the observation ──
    // TCGplayer first: it is USD, it is the marketplace our catalogue is
    // priced against, and it validated 37/37. Cardmarket is the fallback
    // for cards TCGplayer does not list — which the census put at 5 in 60.
    // A shared product (above) is skipped on its own marketplace only.
    let obs = null;
    if (p.tcgplayerBase && !tpShared) {
      obs = {
        price: p.tcgplayerBase.price,
        source: sourceNameFor(p.tcgplayerBase.printing),
        marketplace: 'tcgplayer',
        meta: { printing: p.tcgplayerBase.printing, productId: p.tcgplayerBase.productId,
                currency: 'USD', updated: p.tcgplayerUpdated }
      };
    } else if (p.cardmarket && !cmShared) {
      const conv = await fx.toUsd(p.cardmarket.price, p.cardmarket.unit);
      if (conv) {
        cmOnly++;
        obs = {
          price: conv.usd,
          source: 'tcgdex_cardmarket',
          marketplace: 'cardmarket',
          meta: { currency: conv.currency, original: conv.original, fxRate: conv.rate,
                  fxDate: conv.rateDate, fxSource: conv.rateSource,
                  idProduct: p.cardmarket.idProduct, updated: p.cardmarket.updated }
        };
      }
    }
    // ── the other printings (T10) ──
    // Reverse and mirror prices, each tagged with its printing in
    // price_history.variant. Written only now that every reader applies
    // printsql.basePrintingSql — before that a reverse row WAS a base
    // price, which is why this file used to refuse to write one. Appended
    // (the table is append-only), never ranked against the base price:
    // a different printing is a different product, not a competing claim.
    for (const vp of (tpShared ? [] : fetched[i].printings)) {
      if (dry) { variantRows++; continue; }
      const cols = provenance
        ? `(card_api_id, price_usd, source, marketplace, condition, variant, source_meta)`
        : `(card_api_id, price_usd, source, marketplace, condition, variant)`;
      const vals = provenance ? `($1,$2,$3,'tcgplayer','raw_nm',$4,$5)` : `($1,$2,$3,'tcgplayer','raw_nm',$4)`;
      const args = [c.api_card_id, vp.price, 'tcgdex_tcgplayer_' + vp.variant, vp.variant];
      if (provenance) args.push(JSON.stringify({ printing: vp.printing, productId: vp.productId, currency: 'USD',
                                                 updated: p.tcgplayerUpdated }));
      const r = await db.query(`INSERT INTO price_history ${cols} VALUES ${vals}`, args)
        .catch(e => { console.log(`  variant write failed ${c.api_card_id} ${vp.variant}: ${e.message}`); return null; });
      if (r) variantRows++;
    }

    if (!obs) { noPrice++; continue; }

    // ── cross-check, the technique that found the mirror collision ──
    // Where we already hold a TCGplayer price and TCGdex reports the same
    // marketplace, the two must broadly agree. Report where they do not.
    if (/^tcgplayer_/.test(c.held_source || '') && obs.marketplace === 'tcgplayer'
        && c.held_price > 0) {
      const r = obs.price / c.held_price;
      if ((r < 0.6 || r > 1.667) && Math.abs(obs.price - c.held_price) >= 0.25) {
        disagreements++;
        if (bigDisagree.length < 25) {
          bigDisagree.push({ ...c, theirs: obs.price, r });
        }
      }
    }

    // ── confidence gate ──
    if (!force && !srank.canOverwrite(obs.source, c.held_source)) { skippedRank++; continue; }

    const isFill = !c.held_source || /^estimate/.test(c.held_source);
    if (dry) {
      wrote++; isFill ? filled++ : refreshed++;
      if (wrote <= 15) {
        console.log(`  would write  ${String(c.name).slice(0,24).padEnd(26)}`
          + `${(c.set_api_id + '-' + c.number).padEnd(16)}`
          + `$${obs.price.toFixed(2).padStart(9)}  ${obs.source}`
          + (isFill ? '   [FILLS A GAP]' : `   (held $${Number(c.held_price).toFixed(2)} ${c.held_source})`));
      }
    } else {
      const cols = provenance
        ? `(card_api_id, price_usd, source, marketplace, condition, source_meta)`
        : `(card_api_id, price_usd, source, marketplace, condition)`;
      const vals = provenance
        ? `($1,$2,$3,$4,'raw_nm',$5)`
        : `($1,$2,$3,$4,'raw_nm')`;
      const args = provenance
        ? [c.api_card_id, obs.price, obs.source, obs.marketplace, JSON.stringify(obs.meta)]
        : [c.api_card_id, obs.price, obs.source, obs.marketplace];
      const r = await db.query(`INSERT INTO price_history ${cols} VALUES ${vals}`, args)
        .catch(e => { console.log(`  write failed ${c.api_card_id}: ${e.message}`); return null; });
      if (r) { wrote++; isFill ? filled++ : refreshed++; }
    }

    if ((i + 1) % 2000 === 0) {
      console.log(`  [write ${i + 1}/${fetched.length}] ${wrote} written (${filled} gaps filled), ${noPrice} unpriced`);
    }
  }

  // ── report ──
  console.log(`\n  ${'-'.repeat(74)}`);
  console.log(`\n  ${dry ? 'WOULD WRITE' : 'WROTE'}   ${wrote}`);
  console.log(`    other-printing rows (reverse, mirrors)  ${variantRows}`);
  console.log(`    gaps filled (had no real price)   ${filled}`);
  console.log(`    refreshed an existing price       ${refreshed}`);
  console.log(`    of which Cardmarket-only          ${cmOnly}`);
  console.log(`\n  skipped, lower confidence than held  ${skippedRank}`);
  console.log(`  skipped, product shared with another card  ${sharedRefused}`);
  sharedExamples.forEach(s => console.log(`      ${s}`));
  console.log(`  TCGdex had no price                  ${noPrice}`);
  console.log(`  not on TCGdex at all                 ${notFound}`);

  // Until 2026-09-29 reverse prices were deliberately NOT written: no reader
  // looked at price_history.variant, so a reverse row became the base price
  // (241 cards). Every reader now applies printsql.basePrintingSql, and the
  // rows above are written with their variant. (T10)
  console.log(`\n  reverse-holo prices seen   ${reverseSeen}  (written above as variant rows, never as the base)`);

  if (disagreements) {
    console.log(`\n  ${disagreements} disagree with our stored TCGplayer price by >40% and >= $0.25:`);
    bigDisagree.sort((a, b) => Math.abs(Math.log(b.r)) - Math.abs(Math.log(a.r)))
      .slice(0, 15).forEach(c => console.log(`    ${c.r.toFixed(2)}x  ${String(c.name).slice(0,24).padEnd(26)}`
        + `${c.set_api_id}-${c.number}  held $${Number(c.held_price).toFixed(2)} vs $${c.theirs.toFixed(2)}`));
    console.log('    Two paths to ONE marketplace should agree. Each of these is either a');
    console.log('    stale stored price or a wrong match — worth reading before trusting.');
  } else {
    console.log('\n  No card disagreed with our stored TCGplayer price by more than 40%.');
  }

  const un = Object.keys(unknownPrintings);
  if (un.length) {
    console.log('\n  UNRECOGNISED printings seen (classify in tcgdexprice.js):');
    un.forEach(k => console.log(`    ${unknownPrintings[k]}x  ${k}`));
  }
  console.log('');
}

async function main() {
  const lang = process.argv[2];
  const flags = process.argv.slice(3);
  if (!db) { console.log('\n  DATABASE_URL required.\n'); process.exit(1); }
  if (!lang || lang.startsWith('--')) {
    console.log('\n  node tcgdexharvest.js <lang> [--dry] [--set=X] [--max=N] [--gaps-only] [--force]\n');
    await db.end(); return;
  }
  try { await harvest(lang, flags); }
  finally { await db.end(); }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

// This module owns its own pool. When ingest.js calls harvest() as a
// library the pool stays open and node never exits, so the caller must
// close it — `end` exists for exactly that.
async function end() { if (db) await db.end().catch(() => {}); }

module.exports = { harvest, sourceNameFor, end };
