// schemaguard.test.js — tests cannot change the production schema
// (security follow-up, 2026-10-06)
//
//   node schemaguard.test.js         the guard, offline (a fake connection),
//                                    and every test file's structure
//   node schemaguard.test.js --db    also: against Supabase, a real
//                                    CREATE TABLE from a test connection is
//                                    refused and the table does not exist
//                                    afterwards; reads and row writes pass
'use strict';
const fs = require('fs'), path = require('path');
const sg = require('./schemaguard');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

(async () => {
  console.log('\n  what counts as a schema change');
  const CHANGE = ['CREATE TABLE IF NOT EXISTS x (a int)', 'ALTER TABLE user_access ADD COLUMN IF NOT EXISTS email text',
    '  -- a comment first\n  alter table cards drop column name', '/* c */ DROP TABLE alerts', 'TRUNCATE alerts',
    'GRANT SELECT ON cards TO anon', 'REVOKE ALL ON cards FROM anon', "COMMENT ON TABLE cards IS 'x'",
    'DO $$ BEGIN EXECUTE \'ALTER TABLE cards ADD COLUMN z int\'; END $$', 'SELECT 1; CREATE INDEX i ON cards (name)',
    'create unique index if not exists i on cards(name)', { text: 'ALTER TABLE cards ENABLE ROW LEVEL SECURITY' }];
  const ROWS = ['SELECT * FROM cards', 'INSERT INTO alerts (user_id) VALUES ($1)', 'UPDATE alerts SET status = $1',
    'DELETE FROM alerts WHERE id = $1', 'WITH a AS (SELECT 1) SELECT * FROM a', 'BEGIN', 'ROLLBACK', 'SAVEPOINT a',
    'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", "SELECT 'created' AS altered_word",
    'SELECT column_name FROM information_schema.columns', { text: 'SELECT 1' }];
  for (const s of CHANGE) ok('refused: ' + JSON.stringify(typeof s === 'string' ? s : s.text).slice(0, 60), sg.isSchemaChange(s));
  for (const s of ROWS) ok('passes:  ' + JSON.stringify(typeof s === 'string' ? s : s.text).slice(0, 60), !sg.isSchemaChange(s));

  console.log('\n  the guard on a connection (fake pool: records what reaches it)');
  const sent = [];
  const fakeClient = () => ({ query: async sql => { sent.push(typeof sql === 'string' ? sql : sql.text); return { rows: [] }; }, release() {} });
  const fakePool = { totalCount: 0, query: async sql => { sent.push(sql); return { rows: [] }; }, connect: async () => fakeClient() };
  const p = sg.guard(fakePool, 'test');
  let err = null; try { await p.query('ALTER TABLE user_access ADD COLUMN IF NOT EXISTS email text'); } catch (e) { err = e; }
  ok('pool.query: a schema change rejects with SCHEMA_GUARD', err && err.code === 'SCHEMA_GUARD', err && err.message.slice(0, 90));
  ok('... and was never sent', sent.length === 0, JSON.stringify(sent));
  await p.query('SELECT 1');
  ok('pool.query: a read is sent', sent.length === 1);
  const c = await p.connect();
  err = null; try { await c.query({ text: 'CREATE TABLE x (a int)' }); } catch (e) { err = e; }
  ok('a client from pool.connect() is guarded too', err && err.code === 'SCHEMA_GUARD' && sent.length === 1);
  await c.query('INSERT INTO alerts (user_id) VALUES ($1)', ['x']);
  ok('... and passes a row write', sent.length === 2);
  err = await new Promise(r => p.query('DROP TABLE x', e => r(e)));
  ok('callback style is refused too', err && err.code === 'SCHEMA_GUARD' && sent.length === 2);
  ok('guarded, and says so', sg.isGuarded(p) && !sg.isGuarded({ query() {} }));
  delete process.env[sg.ENV];
  const raw = { totalCount: 0, query: async () => ({}) };
  ok('server.js pool unguarded by default (its own first-use migration runs)', !sg.isGuarded(sg.fromEnv(raw)));
  process.env[sg.ENV] = '1';
  ok(`server.js pool guarded when ${sg.ENV}=1`, sg.isGuarded(sg.fromEnv({ totalCount: 0, query: async () => ({}) })));
  delete process.env[sg.ENV];

  console.log('\n  roles.js: only the server migrates user_access');
  const roles = require('./roles');
  const seen = [];
  const store = roles.pgStore({ query: async sql => { seen.push(sql); return { rows: roles.USER_ACCESS_COLUMNS.map(column_name => ({ column_name })) }; } });
  await store.get('00000000-0000-4000-8000-000000000000');
  ok('pgStore(db) with no option: checks the columns, sends no DDL', seen.length >= 2 && !seen.some(sg.isSchemaChange), seen.map(s => s.trim().slice(0, 30)).join(' | '));
  const seen2 = [];
  const short = roles.pgStore({ query: async sql => { seen2.push(sql); return { rows: [{ column_name: 'user_id' }] }; } });
  err = null; try { await short.get('x'); } catch (e) { err = e; }
  ok('... and refuses a table missing a column, naming it, rather than adding it', err && /missing state, .*email/.test(err.message) && !seen2.some(sg.isSchemaChange), err && err.message.slice(0, 80));
  const seen3 = [];
  await roles.pgStore({ query: async sql => { seen3.push(sql); return { rows: [] }; } }, { migrate: true }).get('x');
  ok('pgStore(db, { migrate: true }) on an unguarded pool: the first-use migration', seen3.some(s => /CREATE TABLE IF NOT EXISTS user_access/.test(s)) && seen3.some(s => /ADD COLUMN IF NOT EXISTS email/.test(s)));
  const seen4 = [];
  const g = sg.guard({ totalCount: 0, query: async sql => { seen4.push(sql); return { rows: roles.USER_ACCESS_COLUMNS.map(column_name => ({ column_name })) }; } }, 'test');
  await roles.pgStore(g, { migrate: true }).get('x');
  ok('... but on a guarded pool, migrate:true is ignored (verify only)', !seen4.some(sg.isSchemaChange) && seen4.length >= 2);

  console.log('\n  structure: every test reaches the database through the guard');
  const files = fs.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f) || f === 'jptest.js');
  const own = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if (/new\s+(pg\.)?(Pool|Client)\s*\(/.test(t)) own.push(f);
  }
  ok(`no test opens its own pg connection (${files.length} files read)`, own.length === 0, own.join(', '));
  const usesGuard = files.filter(f => /require\('\.\/schemaguard'\)\.test(Pool|Client)\(\)/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  ok('the database tests use testPool()/testClient() (at least the 14 that had their own)', usesGuard.length >= 14, usesGuard.length + ': ' + usesGuard.join(', '));
  // A test that boots server.js with the real DATABASE_URL must guard it.
  const spawnsReal = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r/g, '');
    const re = /spawn\(process\.execPath, \[[^\]]*server\.js'\)\][\s\S]{0,400}?env:\s*\{([^}]*)\}/g;
    let m; while ((m = re.exec(t))) if (!/DATABASE_URL: ''/.test(m[1]) && !/CARDZON_SCHEMA_GUARD: '1'/.test(m[1])) spawnsReal.push(f);
  }
  ok('every test that boots server.js either gives it no database or sets CARDZON_SCHEMA_GUARD=1', spawnsReal.length === 0, spawnsReal.join(', '));
  const S = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok("server.js wraps its pool with schemaguard.fromEnv, and only it passes { migrate: true }", /require\('\.\/schemaguard'\)\.fromEnv\(new Pool\(/.test(S)
     && /roles\.pgStore\(db, \{ migrate: true \}\)/.test(S)
     && files.every(f => !/migrate: true/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')) || f === 'schemaguard.test.js'));

  if (process.argv.includes('--db')) {
    console.log('\n  --db: against Supabase, from a test connection');
    const db = sg.testPool();
    const name = 'schemaguard_probe_' + process.pid;
    try {
      err = null; try { await db.query(`CREATE TABLE ${name} (a int)`); } catch (e) { err = e; }
      ok('CREATE TABLE from a test connection: refused', err && err.code === 'SCHEMA_GUARD', err && err.message.slice(0, 80));
      const r = await db.query('SELECT to_regclass($1) AS t', ['public.' + name]);
      ok('... and the table does not exist (it never reached Postgres)', r.rows[0].t === null, JSON.stringify(r.rows[0]));
      const c2 = await db.connect();
      try {
        err = null; try { await c2.query('ALTER TABLE user_access ADD COLUMN IF NOT EXISTS schemaguard_probe text'); } catch (e) { err = e; }
        ok('ALTER on a checked-out client: refused', err && err.code === 'SCHEMA_GUARD');
      } finally { c2.release(); }
      const cols = await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'user_access' AND column_name = 'schemaguard_probe'`);
      ok('... and user_access has no such column', cols.rows[0].n === 0);
      ok('a read passes', (await db.query('SELECT count(*)::int n FROM cards')).rows[0].n > 0);
    } finally { await db.end(); }
  }

  console.log('\n  schemaguard.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
