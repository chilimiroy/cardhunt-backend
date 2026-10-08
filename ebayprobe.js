#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * ebayprobe.js — end-to-end eBay Browse check, one card, live
 *
 *   node ebayprobe.js <cardId> [grade]
 *   node ebayprobe.js en-swsh3.5-74 "PSA 10"
 *
 * Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the environment. They
 * live on Render, so from a laptop run it as:
 *
 *   EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... node ebayprobe.js en-swsh3.5-74 "PSA 10"
 *
 * READ-ONLY: it reads the card from Supabase and calls eBay. No INSERT,
 * no UPDATE, nothing cached.
 *
 * ── Why this exists ──
 * `ebayBrowseActive()` had never run against live credentials, and the
 * failure it produced was indistinguishable from "no credentials set" —
 * `getEbayToken()` returned a bare null for four unrelated causes and
 * `sourceEbay` reported all of them as "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET
 * not set". This walks the same four stages the server walks and names
 * the one that fails:
 *
 *   1  credentials present
 *   2  token exchange            <- eBay tells us if the app is wrong
 *   3  search returns items      <- category / query problems show here
 *   4  items survive the title gate  <- grade + number matching
 *
 * Stage 4 is the one that silently returns nothing while every other
 * stage reports success, so it prints the titles it rejected AND why.
 * A source that returns zero must say whether it found nothing or
 * filtered everything away — those are different failures.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const { Pool } = require('pg');
const jpf = require('./jpfilter.js');

const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

function line() { console.log('  ' + '-'.repeat(74)); }

async function main() {
  const cardId = process.argv[2] || 'en-swsh3.5-74';
  const grade  = process.argv[3] || 'PSA 10';

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  EBAY BROWSE PROBE — ${cardId} @ ${grade}`);
  console.log(`${'='.repeat(78)}\n`);

  // ── 1. credentials ──
  const id = process.env.EBAY_CLIENT_ID || '';
  const secret = process.env.EBAY_CLIENT_SECRET || '';
  console.log('  1. CREDENTIALS');
  console.log(`     EBAY_CLIENT_ID      ${id ? 'set (len ' + id.length + ')' : 'MISSING'}`);
  console.log(`     EBAY_CLIENT_SECRET  ${secret ? 'set (len ' + secret.length + ')' : 'MISSING'}`);
  if (!id || !secret) {
    console.log('\n     STOP: no credentials in this environment.');
    console.log('     They are set on Render, not locally. Either run this with them');
    console.log('     inline, or hit  /ebay/status?probe=1  on the deployed service.\n');
    return;
  }

  // ── 2. token ──
  console.log('\n  2. TOKEN EXCHANGE');
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  let tok;
  {
    // Through ebaycall like every other eBay request (T2, 2026-09-30): this
    // exchange was a raw fetch — uncounted, outside the quota, the one call
    // in the codebase that still reached api.ebay.com unguarded. It is
    // TOOLING, as is the search below: past the 300/day tooling allowance
    // the probe stops rather than borrowing from the user budget.
    const r = await require('./ebaycall').fetchEbay(db, {
      url: 'https://api.ebay.com/identity/v1/oauth2/token',
      method: 'POST', basic: auth, kind: 'token', origin: 'tooling',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope='
            + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
      meta: { cardId: 'ebayprobe' }
    });
    if (r.blocked) { console.log(`     STOP (${r.blocked}): ${r.reason}`, '\n'); return; }
    if (r.transport) { console.log(`     STOP: ${r.reason}`, '\n'); return; }
    if (!r.ok) {
      console.log(`     STOP: eBay rejected the exchange — ${r.reason}`, '\n');
      console.log('     invalid_client almost always means the App ID / Cert ID pair is');
      console.log('     a SANDBOX keyset while this endpoint is production, or the Cert ID');
      console.log('     was copied with whitespace.', '\n');
      return;
    }
    const d = r.data || {};
    tok = d.access_token;
    if (!tok) { console.log('     STOP: eBay answered with no access_token', '\n'); return; }
    console.log(`     OK — token acquired, expires in ${d.expires_in}s`);
  }

  // ── the card ──
  if (!db) { console.log('\n  DATABASE_URL required to look the card up.\n'); return; }
  const { rows } = await db.query(
    `SELECT api_card_id, name, name_en, number, set_api_id, set_name, set_name_en, set_total, set_release
     FROM cards WHERE api_card_id=$1`, [cardId]);
  if (!rows.length) { console.log(`\n  No such card: ${cardId}\n`); return; }
  const card = rows[0];
  const name = card.name_en || card.name;
  console.log(`\n     card: ${name} #${card.number} — ${card.set_name} (total ${card.set_total})`);

  // ── 3. search ── exactly the query sourceEbay builds
  // ONE description of the card, the one server.js ebayMatchCard builds,
  // used by BOTH the query and the gate. Until 2026-09-29 (T9) this probe
  // built its own query, fetched eBay unmetered, and gated with
  // jpfilter.enItemMatchesRequest, a gate production never ran, which dropped
  // Giratina / TAG TEAM / ACE SPEC titles the real gate keeps.
  const cm = require('./cardmatch');
  const fc = { name, nameEn: card.name_en || null, number: card.number, setTotal: card.set_total,
               setId: card.set_api_id, setName: card.set_name_en || card.set_name,
               setYear: card.set_release ? new Date(card.set_release).getUTCFullYear() : null,
               lang: cm.languageFromCardId(card.api_card_id) };
  const q = cm.buildQuery(fc, grade);
  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
    + '?q=' + encodeURIComponent(q)
    + '&category_ids=183454&limit=60&sort=price';

  console.log('\n  3. SEARCH');
  console.log(`     q = ${JSON.stringify(q)}`);
  const call = await require('./ebaycall').fetchEbay(db, { url, token: tok, kind: 'search', origin: 'tooling',
    meta: { cardId: 'ebayprobe', query: q }, countFrom: x => (x && x.itemSummaries ? x.itemSummaries.length : 0) });
  if (!call.ok) {
    console.log('     STOP: search failed: ' + (call.reason || call.blocked));
    return;
  }
  const d = call.data || {};
  const items = d.itemSummaries || [];
  console.log(`     ${items.length} items returned (total matches: ${d.total ?? 'n/a'})`);
  if (!items.length) {
    console.log('\n     Zero items from eBay itself — this is a QUERY or CATEGORY problem,');
    console.log('     not a filter problem. Try without category_ids=183454, or with a');
    console.log('     looser q, before touching the title gate.\n');
    return;
  }

  // ── 4. the title gate ──
  // 4. cardmatch.verify, the gate sourceEbay runs, on the card built above.
  console.log('\n  4. TITLE GATE  (cardmatch.verify, the production gate)');
  console.log(`     matching against: number ${fc.number}, setTotal ${fc.setTotal}, `
    + `setId ${fc.setId}, setName ${JSON.stringify(fc.setName)}\n`);

  const kept = [], dropped = [];
  for (const it of items) {
    const v = cm.verify(it.title || '', fc, grade);
    it._why = v.reason;
    (v.ok ? kept : dropped).push(it);
  }

  line();
  console.log(`  KEPT ${kept.length} of ${items.length}\n`);
  kept.slice(0, 15).forEach(it => {
    const p = it.price && it.price.value;
    console.log(`   $${String(p).padStart(9)}  ${String(it.title).slice(0, 62)}`);
  });

  if (dropped.length) {
    console.log(`\n  DROPPED ${dropped.length} — with the reason, so a gate that rejects`);
    console.log('  everything cannot look like a marketplace with no stock:\n');
    dropped.slice(0, 20).forEach(it => {
      const t = it.title || '';
      console.log('   ' + String(it._why || '?').slice(0, 60).padEnd(62) + String(t).slice(0, 50));
    });
  }

  line();
  if (!kept.length) {
    console.log('\n  VERDICT: eBay returned listings and the gate rejected ALL of them.');
    console.log('  Read the reasons above. If they are mostly "number/set", the titles');
    console.log('  state the set by a name we do not hold; if mostly "grade", the grade');
    console.log('  vocabulary differs from what jpTitleHasGrade expects.\n');
  } else {
    console.log(`\n  VERDICT: working end to end — ${kept.length} real listings for ${cardId} @ ${grade}.\n`);
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { if (db) await db.end().catch(() => {}); });
