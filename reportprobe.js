// reportprobe.js — does row-level security hold on listing_reports?
// Attempts, not assertions (Roy, 2026-10-08, TASK-reports-and-pages T3).
// Prints what Postgres ANSWERED, the rlsprobe.js way: user A's request run
// exactly as PostgREST runs it (SET LOCAL ROLE authenticated + A's claims).
//
//   node reportprobe.js
//
// ONE transaction, ROLLED BACK — nothing is kept. If listing_reports does not
// exist yet (migration-reports.sql not run), the migration's own statements
// run INSIDE that transaction first, so the attempts meet the policies Roy
// will install, and the rollback removes them again. After Roy has run the
// migration the same command tests the real table (still rolled back).
// Needs DATABASE_URL. Local tooling: 0 eBay calls.
'use strict';
const fs = require('fs'), crypto = require('crypto');
const show = x => JSON.stringify(x);

async function attempts(db, A, B) {
  const out = [];
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const exists = (await c.query(`SELECT to_regclass('public.listing_reports') AS t`)).rows[0].t;
    let rehearsed = false;
    if (!exists) {
      const sql = fs.readFileSync(__dirname + '/migration-reports.sql', 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gim, '');
      await c.query(sql);
      rehearsed = true;
    }
    const HOSTILE = '<script>window.__pwned=1</script><img src=x onerror="alert(1)"> </div><div class="rep-item">FORGED';
    const mk = (id, details) => c.query(`INSERT INTO listing_reports (user_id, card_id, listing_id, source, reason, details)
      VALUES ($1, 'en-base1-4', 'reportprobe', 'ebay', 'other', $2) RETURNING id`, [id, details]).then(r => r.rows[0].id);
    const aid = await mk(A, HOSTILE), bid = await mk(B, 'user B\'s report');
    const back = (await c.query('SELECT details FROM listing_reports WHERE id = $1', [aid])).rows[0].details;
    const masterView = (await c.query('SELECT count(*)::int AS n FROM listing_reports WHERE id IN ($1, $2)', [aid, bid])).rows[0].n;
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: A, role: 'authenticated' })]);
    const as = (await c.query('SELECT current_user, auth.uid() AS uid')).rows[0];
    const attempt = async (key, label, sql, args) => {
      await c.query('SAVEPOINT a');
      try {
        const r = await c.query(sql, args);
        out.push({ key, label, command: r.command, rowCount: r.rowCount, rows: r.rows, error: null });
      } catch (e) {
        out.push({ key, label, command: null, rowCount: null, rows: [], error: { code: e.code, message: e.message } });
        await c.query('ROLLBACK TO SAVEPOINT a');
      }
    };
    await attempt('readOwn', `1. A reads A's own report:      SELECT id FROM listing_reports WHERE id = ${aid}`, 'SELECT id, user_id = $2 AS mine FROM listing_reports WHERE id = $1', [aid, A]);
    await attempt('readB', `2. A reads B's report:          SELECT id FROM listing_reports WHERE id = ${bid}`, 'SELECT id, user_id FROM listing_reports WHERE id = $1', [bid]);
    await attempt('insertOwn', `3. A inserts a report directly (past the server's approval check and rate limit)`, `INSERT INTO listing_reports (user_id, card_id, listing_id, source, reason) VALUES ($1, 'en-base1-4', 'direct', 'ebay', 'fake') RETURNING id`, [A]);
    await attempt('updateB', `4. A changes B's report state:  UPDATE listing_reports SET state = 'dismissed' WHERE id = ${bid}`, `UPDATE listing_reports SET state = 'dismissed' WHERE id = $1 RETURNING id`, [bid]);
    await attempt('insertAsB', `   A inserts a report as B`, `INSERT INTO listing_reports (user_id, card_id, listing_id, source, reason) VALUES ($1, 'en-base1-4', 'asB', 'ebay', 'fake') RETURNING id`, [B]);
    await attempt('deleteOwn', `   A deletes A's own report`, 'DELETE FROM listing_reports WHERE id = $1 RETURNING id', [aid]);
    await attempt('countAll', '   A counts every report it can see', 'SELECT count(*)::int AS visible FROM listing_reports');
    await c.query('RESET ROLE');
    await c.query('SET LOCAL ROLE anon');
    await attempt('anonRead', '   anon (no session) counts every report', 'SELECT count(*)::int AS visible FROM listing_reports');
    await c.query('RESET ROLE');
    const bAfter = (await c.query('SELECT id, state FROM listing_reports WHERE id = $1', [bid])).rows;
    return { rehearsed, as, aid, bid, attempts: out, bAfter, hostile: { sent: HOSTILE, readBack: back, equal: back === HOSTILE }, masterView };
  } finally { await c.query('ROLLBACK'); c.release(); }
}

async function main() {
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const A = crypto.randomUUID(), B = crypto.randomUUID();
  try {
    const p = await attempts(db, A, B);
    console.log(p.rehearsed ? 'listing_reports does not exist yet: migration-reports.sql was run INSIDE this transaction (rolled back at the end).'
                            : 'listing_reports exists: testing the real table.');
    console.log('A = ' + A + '\nB = ' + B + '\nas: ' + show(p.as));
    for (const a of p.attempts) console.log(a.label + '\n   -> ' + (a.error ? `ERROR ${a.error.code}: ${a.error.message}`
      : `${a.command} ${a.rowCount}${a.rows.length ? '  rows: ' + show(a.rows) : '  (no rows)'}`));
    console.log("B's report afterwards, as the server sees it: " + show(p.bAfter));
    console.log('the server\'s own connection (what /api/admin/reports, masters only, reads): ' + p.masterView + ' of the 2 reports');
    console.log('hostile details stored and read back byte for byte: ' + p.hostile.equal);
    console.log('(rolled back — nothing kept)');
  } finally { await db.end(); }
}
module.exports = { attempts };
if (require.main === module) main().catch(e => { console.error('reportprobe failed: ' + e.message); process.exit(1); });
