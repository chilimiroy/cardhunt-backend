// rls.test.js — row-level security (T6 step 2, 2026-10-06)
//
//   node rls.test.js        the migration says what it must (offline)
//   node rls.test.js --db   Supabase: every public table has RLS on, no API
//                           role can TRUNCATE or write user_access, and the
//                           rlsprobe attempts (as PostgREST runs user A's
//                           request, rolled back) answer as they must —
//                           A's OWN row readable, B's rows untouchable.
//
// Before 2026-10-06 RLS was off on every table and the public anon key could
// delete anyone's alert and approve itself (PROGRESS 2026-10-06 (night)).
// A table created later without RLS fails --db here.

require('./testcount')(13);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), crypto = require('crypto');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const M = fs.readFileSync(__dirname + '/migration-rls.sql', 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '');
const USER_TABLES = ['alerts', 'portfolio', 'users', 'user_access'];
console.log('\n  the migration');
for (const t of USER_TABLES) {
  ok(`${t}: RLS enabled`, new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`).test(M));
  ok(`${t}: a SELECT policy for authenticated, keyed on auth.uid()`, new RegExp(`ON ${t} FOR SELECT TO authenticated\\s+USING \\((user_id|id) = \\(select auth\\.uid\\(\\)\\)`).test(M));
}
ok('no write policy on any table (writes go through the server, which checks approval)', !/FOR (INSERT|UPDATE|DELETE|ALL)/.test(M));
ok('no policy for anon at all', !/TO anon/.test(M));
ok('user_access: INSERT/UPDATE/DELETE revoked from the API roles', /REVOKE INSERT, UPDATE, DELETE ON user_access FROM anon, authenticated/.test(M));
ok('TRUNCATE (which RLS does not cover) revoked everywhere', /REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated/.test(M));
ok('one transaction', /^\s*BEGIN;/m.test(M) && /COMMIT;\s*$/.test(M));

(async () => {
  if (process.argv.includes('--db')) {
    const db = require('./schemaguard').testPool();   // refuses schema changes
    try {
      console.log('\n  --db: Supabase as it is');
      const t = await db.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`);
      const off = t.rows.filter(r => !r.relrowsecurity).map(r => r.relname);
      ok(`every public table has RLS on (${t.rows.length})`, t.rows.length >= 12 && off.length === 0, off.length ? 'OFF: ' + off.join(', ') : '');
      const g = await db.query(`SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
          AND (privilege_type = 'TRUNCATE' OR (table_name = 'user_access' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')))`);
      ok('no API role can TRUNCATE anything or write user_access', g.rows.length === 0, g.rows.map(r => r.grantee + ' ' + r.privilege_type + ' ' + r.table_name).join(', '));
      const role = await db.query('SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      ok('this connection (the server\'s and ingest\'s role) bypasses RLS', role.rows[0] && role.rows[0].rolbypassrls === true, JSON.stringify(role.rows[0]));

      console.log('\n  --db: user A\'s request, as PostgREST runs it (rolled back)');
      const A = crypto.randomUUID(), B = crypto.randomUUID();
      const p = await require('./rlsprobe.js').attemptsInDatabase(db, A, B);
      const at = Object.fromEntries(p.attempts.map(a => [a.key, a]));
      ok('running as role authenticated, auth.uid() = A', p.as.current_user === 'authenticated' && p.as.uid === A, JSON.stringify(p.as));
      ok('ALLOWS: A reads A\'s own alert', at.readOwn.rowCount === 1, JSON.stringify(at.readOwn.rows));
      ok('read B\'s alert: 0 rows', !at.readB.error && at.readB.rowCount === 0);
      ok('update B\'s alert: UPDATE 0', !at.updateB.error && at.updateB.rowCount === 0);
      ok('insert a row as B: 42501 row-level security', at.insertAsB.error && at.insertAsB.error.code === '42501', at.insertAsB.error && at.insertAsB.error.message);
      ok('delete B\'s alert: DELETE 0', !at.deleteB.error && at.deleteB.rowCount === 0);
      ok('count of all alerts: only A\'s own (1)', at.countAll.rows[0] && at.countAll.rows[0].visible === 1, JSON.stringify(at.countAll.rows));
      ok('A approving A (insert): 42501 permission denied', at.approveInsert.error && at.approveInsert.error.code === '42501');
      ok('A approving A (update): 42501 permission denied', at.approveUpdate.error && at.approveUpdate.error.code === '42501');
      ok('the catalogue is not readable through the API roles (0)', at.cards.rows[0] && at.cards.rows[0].visible === 0);
      ok('B\'s row untouched, as the server sees it', p.bAfter.length === 1 && p.bAfter[0].still_b && Number(p.bAfter[0].target_price) === 100, JSON.stringify(p.bAfter));
    } finally { await db.end(); }
  }
  console.log('\n  rls.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
