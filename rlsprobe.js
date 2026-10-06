// rlsprobe.js — does row-level security hold? Attempts, not assertions
// (T6 step 2, 2026-10-06). Prints what Postgres / PostgREST ANSWERED.
//
//   node rlsprobe.js                    1. in the database, exactly as PostgREST runs a request
//                                          for user A (SET LOCAL ROLE authenticated + A's claims):
//                                          read A's own alert (must be ALLOWED), then read, update,
//                                          insert-as and delete user B's, and A approving
//                                          themselves. One transaction, ROLLED BACK.
//                                       2. over PostgREST with the anon key alone (no session).
//   node rlsprobe.js --token=<jwt>      3. also over PostgREST with a REAL session's access token
//                                          (user A). In the browser, signed in:
//                                          JSON.parse(localStorage['sb-<ref>-auth-token']).access_token
//
// For 2 and 3 user B's row must exist outside a transaction: one alert is
// inserted for a random user id with status 'deleted' (so the nightly
// evaluation never reads it) and removed at the end, whatever happened.
// Needs DATABASE_URL; the anon key and URL are read from the deployed
// /api/auth/config (public). Local tooling: 0 eBay calls.
// rls.test.js --db runs part 1 (attemptsInDatabase) and asserts on it.
'use strict';
const crypto = require('crypto');
const show = x => JSON.stringify(x);

// -> [{ key, label, command, rowCount, rows, error: { code, message } | null }]
async function attemptsInDatabase(db, A, B) {
  const out = [];
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const mk = id => c.query(`INSERT INTO alerts (user_id, card_api_id, card_name, alert_type, target_price, status)
      VALUES ($1, 'en-base1-4', 'rlsprobe', 'below', 100, 'deleted') RETURNING id`, [id]).then(r => r.rows[0].id);
    const aid = await mk(A), bid = await mk(B);
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
    await attempt('readOwn', `READ A's own alert: SELECT id FROM alerts WHERE id = ${aid}`, 'SELECT id FROM alerts WHERE id = $1', [aid]);
    await attempt('readB', `READ B's alert:     SELECT id, user_id FROM alerts WHERE id = ${bid}`, 'SELECT id, user_id FROM alerts WHERE id = $1', [bid]);
    await attempt('updateB', `WRITE B's alert:    UPDATE alerts SET target_price = 1 WHERE id = ${bid}`, 'UPDATE alerts SET target_price = 1 WHERE id = $1 RETURNING id', [bid]);
    await attempt('insertAsB', 'WRITE as B:         INSERT INTO alerts (user_id, ...) VALUES (B, ...)', `INSERT INTO alerts (user_id, card_api_id, alert_type, target_price, status) VALUES ($1, 'en-base1-4', 'below', 5, 'deleted') RETURNING id`, [B]);
    await attempt('deleteB', `DELETE B's alert:   DELETE FROM alerts WHERE id = ${bid}`, 'DELETE FROM alerts WHERE id = $1 RETURNING id', [bid]);
    await attempt('countAll', 'READ every alert:   SELECT count(*) FROM alerts', 'SELECT count(*)::int AS visible FROM alerts');
    await attempt('approveInsert', "A approves A:       INSERT INTO user_access (user_id, state) VALUES (A, 'approved')", `INSERT INTO user_access (user_id, state) VALUES ($1, 'approved')`, [A]);
    await attempt('approveUpdate', "A approves A:       UPDATE user_access SET state = 'approved' WHERE user_id = A", `UPDATE user_access SET state = 'approved' WHERE user_id = $1`, [A]);
    await attempt('cards', 'READ the catalogue: SELECT count(*) FROM cards', 'SELECT count(*)::int AS visible FROM cards');
    await c.query('RESET ROLE');
    const after = (await c.query('SELECT id, user_id = $2 AS still_b, target_price FROM alerts WHERE id = $1', [bid, B])).rows;
    return { as, aid, bid, attempts: out, bAfter: after };
  } finally { await c.query('ROLLBACK'); c.release(); }
}

async function overRest(label, cfg, bid, A, B, bearer) {
  console.log('\n' + label);
  const H = { apikey: cfg.anonKey, Authorization: 'Bearer ' + (bearer || cfg.anonKey), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const go = async (what, method, q, body) => {
    const r = await fetch(cfg.url + '/rest/v1/' + q, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    console.log(`   ${what}\n      ${method} /rest/v1/${q}\n      -> HTTP ${r.status}  ${(await r.text()).slice(0, 300)}`);
  };
  await go("READ B's alert", 'GET', `alerts?id=eq.${bid}&select=id,user_id`);
  await go("WRITE B's alert", 'PATCH', `alerts?id=eq.${bid}`, { target_price: 1 });
  await go('WRITE as B', 'POST', 'alerts', { user_id: B, card_api_id: 'en-base1-4', alert_type: 'below', target_price: 5, status: 'deleted' });
  await go("DELETE B's alert", 'DELETE', `alerts?id=eq.${bid}`);
  await go('approve someone', 'POST', 'user_access', { user_id: A, state: 'approved' });
  // Written back with the name it already has: a row returned means the
  // key CAN write the catalogue, and nothing is changed either way.
  await go('write the catalogue (same value)', 'PATCH', `cards?api_card_id=eq.en-base1-4&select=api_card_id`, { name: cfg.base1_4 });
}

async function main() {
  const { Pool } = require('pg');
  const HOST = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
  const token = (process.argv.find(a => a.startsWith('--token=')) || '').slice(8) || null;
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const A = crypto.randomUUID(), B = crypto.randomUUID();
  try {
    const rls = await db.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`);
    console.log('RLS per public table: ' + rls.rows.map(r => r.relname + (r.relrowsecurity ? ' ON' : ' off')).join(', '));
    console.log('\n1. IN THE DATABASE, as PostgREST runs a request for user A (role authenticated, sub = A)');
    console.log('   A = ' + A + '\n   B = ' + B);
    const p = await attemptsInDatabase(db, A, B);
    console.log('   as: ' + show(p.as));
    for (const a of p.attempts) console.log('   ' + a.label + '\n      -> ' + (a.error ? `ERROR ${a.error.code}: ${a.error.message}`
      : `${a.command} ${a.rowCount}${a.rows.length ? '  rows: ' + show(a.rows) : '  (no rows)'}`));
    console.log("   B's row afterwards, as the server sees it: " + show(p.bAfter) + '\n   (rolled back — nothing kept)');

    const cfg = await fetch(HOST + '/api/auth/config').then(r => r.json());
    if (!cfg.enabled) { console.log('\n2/3 SKIPPED: ' + HOST + ' has sign-in off (' + cfg.reason + ')'); return; }
    cfg.base1_4 = (await db.query(`SELECT name FROM cards WHERE api_card_id = 'en-base1-4'`)).rows[0].name;
    const bid = (await db.query(`INSERT INTO alerts (user_id, card_api_id, card_name, alert_type, target_price, status)
      VALUES ($1, 'en-base1-4', 'rlsprobe: user B', 'below', 100, 'deleted') RETURNING id`, [B])).rows[0].id;
    try {
      await overRest('2. OVER POSTGREST, the anon key alone (no session)', cfg, bid, A, B, null);
      if (token) await overRest("3. OVER POSTGREST, the anon key + user A's session", cfg, bid, A, B, token);
      else console.log("\n3. NOT RUN: no --token (a real session's access token is needed; see the header)");
      const after = await db.query('SELECT id, user_id = $2 AS still_b, target_price, status FROM alerts WHERE id = $1', [bid, B]);
      console.log("\n   B's row afterwards, as the server sees it: " + show(after.rows));
      const ca = await db.query(`SELECT name FROM cards WHERE api_card_id = 'en-base1-4'`);
      console.log('   en-base1-4 afterwards: ' + show(ca.rows));
    } finally {
      await db.query('DELETE FROM alerts WHERE user_id = $1', [B]);
      await db.query('DELETE FROM user_access WHERE user_id = $1', [A]);
      console.log("   (B's temporary alert removed)");
    }
  } finally { await db.end(); }
}

module.exports = { attemptsInDatabase };
if (require.main === module) main().catch(e => { console.error('rlsprobe failed: ' + e.message); process.exit(1); });
