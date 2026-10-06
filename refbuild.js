// refbuild.js — build the sibling check's reference scans ahead of time
// (speed T2, 2026-10-06; refscans.js says what is stored and why).
//
//   node refbuild.js --dry                 how many are missing, and the size
//   node refbuild.js [--max=N] [--set=X]   build the missing ones
//   node refbuild.js --retry-unbuildable   ask again for ones recorded unbuildable
//   (a built row of another REF_VERSION is rebuilt on every run, no flag needed)
//   options: --concurrency=2 (default)
//
// Resumable by construction: every run selects only the cards with no usable
// row, and each card is written the moment it is built — an interrupted run
// loses at most the scans in flight. Run it again after ingesting a set.
//
// Gentle on the image host: two fetches at a time by default. A transient
// failure (timeout, network, 429, 5xx) is NOT stored — the card stays
// missing for the next run — and pauses every lane, doubling from 5 s to
// 5 min; a success resets it. A permanent answer (404/403/410, not a JPEG)
// is stored as 'unbuildable' with its reason, which the server reports as
// "not run" on that card's page — never as a pass.
// Zero eBay calls. Runs from home; never deployed.

const { Pool } = require('pg');
const digital = require('./digital');
const refscans = require('./refscans');
const stampcheck = require('./stampcheck');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const has = k => process.argv.includes('--' + k);
const DRY = has('dry'), MAX = +arg('max', 0) || Infinity, SET = arg('set', null);
const LANES = Math.max(1, Math.min(4, +arg('concurrency', 2) || 2));
const FETCH_MS = 60 * 1000, PAUSE_MIN = 5000, PAUSE_MAX = 5 * 60 * 1000;

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Every English card with another card of its name in its set — the same
// rule as server.js siblingRowsOf — that has no usable reference.
async function missing() {
  const states = ["rs.card_id IS NULL"];
  if (has('retry-unbuildable')) states.push("rs.state = 'unbuildable'");
  states.push(`(rs.state = 'built' AND rs.version IS DISTINCT FROM '${refscans.REF_VERSION}')`);
  const r = await db.query(`
    WITH named AS (
      SELECT c.set_api_id, lower(c.name) AS n FROM cards c
       WHERE c.api_card_id LIKE 'en-%' AND ${digital.visibleSql('c')}
       GROUP BY 1, 2 HAVING count(*) > 1)
    SELECT c.api_card_id, c.image_large, c.image_small, rs.state AS was
      FROM cards c JOIN named ON named.set_api_id = c.set_api_id AND named.n = lower(c.name)
      LEFT JOIN card_reference_scans rs ON rs.card_id = c.api_card_id
     WHERE c.api_card_id LIKE 'en-%' AND ${digital.visibleSql('c')}
       AND (${states.join(' OR ')}) ${SET ? 'AND c.set_api_id = $1' : ''}
     ORDER BY c.set_api_id, c.api_card_id`, SET ? [SET] : []);
  return r.rows;
}

async function counts() {
  const r = await db.query(`SELECT state, count(*)::int AS n, sum(octet_length(rgb))::bigint AS bytes
    FROM card_reference_scans GROUP BY 1 ORDER BY 1`);
  return r.rows;
}

function save(id, url, v) {
  return db.query(`INSERT INTO card_reference_scans (card_id, scan_url, state, reason, version, tw, w, h, rgb, built_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
    ON CONFLICT (card_id) DO UPDATE SET scan_url = EXCLUDED.scan_url, state = EXCLUDED.state, reason = EXCLUDED.reason,
      version = EXCLUDED.version, tw = EXCLUDED.tw, w = EXCLUDED.w, h = EXCLUDED.h, rgb = EXCLUDED.rgb, built_at = now()`,
    [id, url, v.reason ? 'unbuildable' : 'built', v.reason || null, v.version || null, v.tw || null, v.w || null, v.h || null, v.rgb || null]);
}

// One card: { built } | { unbuildable } | { transient } — only the first two are stored.
async function buildOne(row) {
  const url = refscans.scanUrlOf(row);
  if (!/^https:\/\//.test(url)) { await save(row.api_card_id, url || '(none)', { reason: 'no scan URL' }); return 'unbuildable'; }
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) }); }
  catch (e) { return { transient: (e && e.name) === 'TimeoutError' ? 'timeout' : 'network: ' + (e && e.message) }; }
  if (r.status === 429 || r.status >= 500) return { transient: 'HTTP ' + r.status };
  if (!r.ok) { await save(row.api_card_id, url, { reason: 'HTTP ' + r.status }); return 'unbuildable'; }
  let buf;
  try { buf = Buffer.from(await r.arrayBuffer()); }
  catch (e) { return { transient: 'body: ' + (e && e.message) }; }
  let v;
  try { v = refscans.templateFromScan(buf); }
  catch (e) { v = { reason: 'JPEG did not decode: ' + String(e && e.message).slice(0, 80) }; }
  await save(row.api_card_id, url, v);
  return v.reason ? 'unbuildable' : 'built';
}

(async () => {
  await refscans.ensureTable(db);
  const todo = (await missing()).slice(0, MAX);
  console.log(`refbuild: ${todo.length} card(s) to build${SET ? ' in ' + SET : ''}, ${LANES} at a time; stored now:`,
    JSON.stringify(await counts()));
  if (DRY) {
    console.log(`dry run: ~${(todo.length * stampcheck.WHOLE_TW * Math.round(stampcheck.WHOLE_TW * 1.375) * 3 / 1e6).toFixed(1)} MB of templates to add`);
    return db.end();
  }
  const tally = { built: 0, unbuildable: 0, transient: 0 }, transientWhy = {};
  let next = 0, pause = 0, pausedUntil = 0, stop = false;
  const t0 = Date.now();
  process.on('SIGINT', () => { if (stop) process.exit(130); stop = true; console.log('\nstopping after the scans in flight (Ctrl-C again to quit now)'); });
  const lane = async () => {
    while (!stop && next < todo.length) {
      const wait = pausedUntil - Date.now();
      if (wait > 0) { await new Promise(r => setTimeout(r, wait)); continue; }
      const row = todo[next++];
      const out = await buildOne(row).catch(e => ({ transient: 'db: ' + e.message }));
      if (out && out.transient) {
        tally.transient++; transientWhy[out.transient] = (transientWhy[out.transient] || 0) + 1;
        pause = Math.min(PAUSE_MAX, pause ? pause * 2 : PAUSE_MIN);
        pausedUntil = Date.now() + pause;
        console.log(`  ${row.api_card_id}: ${out.transient} — left for the next run; pausing ${Math.round(pause / 1000)} s`);
      } else { tally[out]++; pause = 0; }
      const done = tally.built + tally.unbuildable + tally.transient;
      if (done % 25 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`  ${done}/${todo.length}  built ${tally.built} · unbuildable ${tally.unbuildable} · transient ${tally.transient}`
          + `  (${rate.toFixed(2)}/s, ~${Math.round((todo.length - done) / Math.max(rate, 0.01) / 60)} min left)`);
      }
    }
  };
  await Promise.all(Array.from({ length: LANES }, lane));
  console.log(`refbuild: built ${tally.built}, unbuildable ${tally.unbuildable}, transient ${tally.transient}`
    + (tally.transient ? ' ' + JSON.stringify(transientWhy) : '') + ` in ${Math.round((Date.now() - t0) / 1000)} s`);
  const left = (await missing()).length;
  console.log(`still missing: ${left}${left ? ' — run again to resume' : ''}; stored now:`, JSON.stringify(await counts()));
  await db.end();
})().catch(e => { console.error('refbuild failed:', e.message); process.exit(1); });
