// ══════════════════════════════════════════════════════════════
// gradeprices-disabled.js — the graded-price measurer, PARKED (Roy, 2026-10-10).
//
// NOT LOADED BY ANY PAGE. NOT SERVED. NOT RUN: it refuses before anything
// below executes — no database connection, no request, no eBay call.
// Requiring it throws. It was gradeprices.js (local, gitignored); it is
// tracked now only so that its refusal is tested on a clean checkout
// (nofabricated.test.js).
//
// Why parked: it measured a grade's worth as the median of live eBay
// listings, through /api/listings, on the tooling allowance. Under the eBay
// API licence §9.5 (Roy, 2026-10-08) no price may be modelled from eBay
// Content: its --write was removed, and the listings payload stopped carrying
// the gradePrice it read. After that a run spent up to 1 eBay call per card
// per grade (20 at the defaults) and printed "no verified listings" for every
// one. A script that burns quota to produce nothing is the risk, not the file.
//
// MUST NOT RETURN READING EBAY. Graded prices cannot be derived from eBay
// listings under §9.5. When this returns it reads a graded-price source of
// its own (a licensed sold or graded-price feed), stores that source's
// figures with the source named, and the guard below is removed in the same
// commit that points listingsFor() at it. The code is kept for its shape:
// hot tier by value, per-grade loop, thin results refused, a quota stop
// that halts the run instead of storing zeroes.
// ══════════════════════════════════════════════════════════════
'use strict';
if (require.main === module) {
  console.error('gradeprices-disabled.js is parked (Roy, 2026-10-10): graded prices cannot be derived from eBay under the API licence §9.5,'
    + ' and a run would spend eBay calls to produce nothing. Nothing was run; no eBay call was made.');
  process.exit(2);
}
throw new Error('gradeprices-disabled.js is parked: nothing may require it (Roy, 2026-10-10)');

// ── The parked code, unchanged below this line (it never runs) ──
// ══════════════════════════════════════════════════════════════
// gradeprices.js — measure what each grade is worth, and store the number
//
// The card page prices PSA 10 at 7x raw for every card in the database.
// Real premiums run 3x to 40x, and the error is largest on exactly the
// cards worth money. eBay already answers the question on every graded
// search; this is the thing that asks it on purpose and keeps the answer.
//
//   node gradeprices.js --limit=20                  # dry run, prints only
//   node gradeprices.js --limit=20 --write          # persists aggregates
//   node gradeprices.js --cards=en-base1-4 --grades="PSA 10,PSA 9"
//   node gradeprices.js --set=base1 --api=http://localhost:3000
//
// WHY THIS IS A SCRIPT AND NOT PART OF THE API
// A read endpoint must never write. /api/listings computes the same
// aggregate and returns it; it does not store it. This is the only thing
// that stores it, it is run deliberately, and it says what it did.
//
// WHAT IT STORES
// One row per card per grade per edition: the median LANDED price, and the
// number of listings behind it. Never the listings themselves — that rule
// stands, and an aggregate computed from them is not a copy of them.
//
// WHAT IT REFUSES TO STORE
// Anything gradeprice.js calls thin. A median of one is a data point; a
// stored median of one is a market price the moment someone reads it back,
// and nothing downstream would know the difference.
// ══════════════════════════════════════════════════════════════

const gp = require('./gradeprice');
let Pool = null;
try { Pool = require('pg').Pool; } catch (e) { /* dry runs need no pg */ }

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : dflt;
};
// --write REMOVED 2026-10-08 (Roy): a stored median of eBay listing prices is
// a price modelled from eBay Content — API licence §9.5. The write path is
// deleted, not switched off; asking for it fails before anything runs.
if (args.some(a => /^--write\b/.test(a))) {
  console.error('gradeprices.js: --write is removed (eBay API licence §9.5: no eBay Content used to model prices). Nothing was run.');
  process.exit(2);
}
const WRITE   = false;
// 5, not 20 (2026-10-01): each card costs 1 eBay call per grade, 4 grades by
// default, TOOLING — 20 cards was 80 of the 300/day allowance.
const LIMIT   = parseInt(flag('limit', '5'), 10) || 5;
const SET     = flag('set', null);
const CARDS   = (flag('cards', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const GRADES  = (flag('grades', 'PSA 10,PSA 9,CGC 10,BGS 9.5'))
                  .split(',').map(s => s.trim()).filter(Boolean);
const API     = (flag('api', process.env.CARDHUNT_API ||
                  'https://cardhunt-backend.onrender.com')).replace(/\/$/, '');
// eBay quota is metered and shared with every live user of the site. Pace,
// and stop entirely if the API says the guard has closed.
const PAUSE_MS = parseInt(flag('pause', '1500'), 10) || 1500;

const db = (process.env.DATABASE_URL && Pool)
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const money = n => '$' + Number(n).toFixed(2);

async function hotTier() {
  if (CARDS.length) {
    const r = await db.query(
      `SELECT api_card_id, name, number, set_name FROM cards
        WHERE api_card_id = ANY($1)`, [CARDS]);
    return r.rows;
  }
  // "Hot tier" is where the multiplier error costs real money: the cards
  // with the highest base price. A 40x error on a $0.15 common is noise.
  const params = [];
  let where = `p.grade IS NULL AND p.source NOT LIKE 'estimate%'`;
  if (SET) { params.push(SET); where += ` AND c.set_api_id = $${params.length}`; }
  const r = await db.query(`
    SELECT c.api_card_id, c.name, c.number, c.set_name, p.price_usd
    FROM cards c
    JOIN LATERAL (
      SELECT price_usd, source, grade FROM price_history ph
      WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL
      ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
      LIMIT 1
    ) p ON TRUE
    WHERE ${where}
    ORDER BY p.price_usd DESC
    LIMIT ${LIMIT}`, params);
  return r.rows;
}

async function listingsFor(cardId, grade) {
  const url = `${API}/api/listings/${encodeURIComponent(cardId)}`
            + `?grade=${encodeURIComponent(grade)}&limit=50`;
  // T2: tooling — the 300/day allowance, never the user budget; stops when refused.
  const res = await fetch(url, { headers: require('./toolingkey').headers() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const d = await res.json();
  const e = d && d.sources && d.sources.ebay;
  if (e && e.status === 'quota') { console.error('STOP — eBay quota refused (' + (e.limitHit || 'quota') + '): ' + e.reason); process.exit(3); }
  return d;
}

// eBay's own status words, surfaced by /api/listings per source. A guard
// refusing is not an empty marketplace, and treating them alike is how a
// quota stop turns into a database full of zeroes.
function ebayBlocked(payload) {
  const s = (payload.sources && payload.sources.ebay) || {};
  return ['quota', 'disabled', 'unconfigured', 'blocked', 'soft-stop'].includes(s.status)
    ? s.status : null;
}

async function main() {
  if (!db) {
    console.log('\n  DATABASE_URL required (and `npm install pg`).');
    console.log('  Nothing was read and nothing was written.\n');
    process.exit(1);
  }

  const cards = await hotTier();
  console.log(`\n${'='.repeat(78)}`);
  console.log(`  GRADE PRICES — ${cards.length} cards x ${GRADES.length} grades` +
              `   ${WRITE ? 'WRITING' : 'dry run (add --write to persist)'}`);
  console.log(`  api: ${API}`);
  console.log(`${'='.repeat(78)}\n`);

  let measured = 0, thin = 0, none = 0, written = 0, stoppedFor = null;

  outer:
  for (const c of cards) {
    console.log(`  ${c.api_card_id}  ${c.name} #${c.number}` +
                (c.price_usd ? `  raw ${money(c.price_usd)}` : ''));
    for (const grade of GRADES) {
      let d;
      try { d = await listingsFor(c.api_card_id, grade); }
      catch (err) { console.log(`      ${grade.padEnd(8)} api error: ${err.message}`); continue; }

      const blocked = ebayBlocked(d);
      if (blocked) { stoppedFor = blocked; break outer; }

      const agg = d.gradePrice;
      if (!agg || !agg.groups.length) {
        none++;
        console.log(`      ${grade.padEnd(8)} no verified listings` +
                    (agg && agg.skippedAuctions ? ` (${agg.skippedAuctions} live auctions ignored)` : ''));
        await sleep(PAUSE_MS);
        continue;
      }

      for (const g of agg.groups) {
        if (g.grade !== grade) continue;          // a group for another grade
        const tag = `${grade}${g.edition ? ' · ' + g.edition : ''} (${g.basis})`;
        if (g.thin) {
          thin++;
          console.log(`      ${tag.padEnd(34)} ${money(g.median).padStart(10)}  ${g.label} — not stored`);
          continue;
        }
        measured++;
        const premium = c.price_usd ? ` · ${(g.median / c.price_usd).toFixed(1)}x raw` : '';
        console.log(`      ${tag.padEnd(34)} ${money(g.median).padStart(10)}  ${g.label}${premium}`);

        // (the INSERT INTO price_history of the median was here — deleted 2026-10-08, §9.5)
      }
      await sleep(PAUSE_MS);
    }
  }

  console.log(`\n${'-'.repeat(78)}`);
  console.log(`  ${measured} medians worth storing · ${thin} too thin · ${none} with no verified listing`);
  if (WRITE) console.log(`  ${written} rows written to price_history`);
  else       console.log(`  nothing written — this was a dry run`);
  if (stoppedFor) {
    console.log(`\n  STOPPED: eBay reported "${stoppedFor}". Nothing after this point was`);
    console.log(`  measured, and the run is incomplete rather than finished.`);
  }
  console.log('');
  await db.end();
  process.exit(stoppedFor ? 2 : 0);
}

main().catch(err => { console.error('\n  ' + err.stack + '\n'); process.exit(1); });
