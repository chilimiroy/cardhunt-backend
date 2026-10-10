// ══════════════════════════════════════════════════════════════
// localdb.js — a local server cannot write to production (2026-10-10)
//
// REQUIRED BY server.js, so it is TRACKED.
//
// What happened: a local `node server.js` with this machine's DATABASE_URL
// (the production write credentials the nightly uses) created three tables
// on first use and a test account row in user_access (PROGRESS 2026-10-10
// (harness)). schemaguard.js guards TESTS; a hand-started local server was
// unguarded by design, because "the server" was assumed to be Render.
//
// The structure (migration-local-readonly.sql, Roy runs it): a Postgres role
// that can only read — SELECT on every table, nothing else, and
// default_transaction_read_only on. This machine's DATABASE_URL becomes that
// role's connection; the write URL is CARDHUNT_WRITE_DATABASE_URL, which only
// the nightly's .cmd files map onto DATABASE_URL for their own child process.
// Postgres itself then refuses a local write — no setting to forget.
//
// This module is the backstop until that exists, and after: off Render, the
// server asks the database what its connection may do and refuses to start
// on one that can write. Exempt: Render (process.env.RENDER, set by Render),
// no database at all, and a server a TEST booted against the real database
// (CARDZON_SCHEMA_GUARD=1 — the opt-in --db suites, which write and remove
// their own rows by design; schemaguard already refuses their DDL).
// ══════════════════════════════════════════════════════════════
'use strict';

const CAPABILITY_SQL = `SELECT current_user AS who,
  has_table_privilege(current_user, 'public.price_history', 'INSERT') AS can_insert,
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
  current_setting('default_transaction_read_only') AS read_only`;

// What the connection may do, from the database's own answer.
function writable(row) {
  if (!row) return true;                                   // unknown: treated as writable (fail closed)
  if (String(row.read_only) === 'on') return false;        // every transaction read-only
  return !!(row.can_insert || row.can_create);
}

// The other direction (2026-10-10): a scheduled ingest job must be able to WRITE,
// or it would run, store nothing and exit 0. INSERT on price_history and
// read-write transactions are what the jobs need.
const EXIT_READ_ONLY = 5;
function canWrite(row) {
  return !!row && String(row.read_only) !== 'on' && !!row.can_insert;
}

function exemptReason(env, db) {
  if (env.RENDER) return 'on Render';
  if (!db) return 'no database';
  if (env.CARDZON_SCHEMA_GUARD === '1') return 'booted by a test (CARDZON_SCHEMA_GUARD=1)';
  return null;
}

const SETUP = 'This machine\'s DATABASE_URL can write to production. A local server must start on the read-only '
  + 'role: run migration-local-readonly.sql in Supabase, point DATABASE_URL at cardhunt_local_ro, and keep the '
  + 'write URL in CARDHUNT_WRITE_DATABASE_URL for the nightly only (localdb.js).';

// -> { ok, why, who? }   Never throws: a failed check refuses (fail closed).
async function bootCheck(db, env) {
  const exempt = exemptReason(env || {}, db);
  if (exempt) return { ok: true, why: exempt };
  let row = null;
  try { row = (await db.query(CAPABILITY_SQL)).rows[0]; }
  catch (e) { return { ok: false, why: 'could not ask the database what this connection may do: ' + e.message + '. ' + SETUP }; }
  const who = (row && row.who) || 'an unknown role';
  if (writable(row)) return { ok: false, who, why: 'connected as ' + who + ', which can write' + (row ? '' : ' (no answer: assumed)') + '. ' + SETUP };
  return { ok: true, who: row.who, why: 'read-only connection (' + row.who + ')' };
}

module.exports = { CAPABILITY_SQL, writable, canWrite, EXIT_READ_ONLY, exemptReason, bootCheck, SETUP };

// ── node localdb.js --prove [--txn-read-only] ────────────────────────────
// A guard is not working until something has been seen to fail against it
// (CLAUDE.md, LESSONS 5). Run after migration-local-readonly.sql: it tries a
// real INSERT through THIS machine's DATABASE_URL, inside BEGIN ... ROLLBACK,
// and passes (exit 0) only if Postgres REFUSES it and no row exists after.
// A write that goes through is rolled back, printed, and exits 1.
// --txn-read-only proves the mechanism on any connection (SET TRANSACTION READ
// ONLY first) — what the role's default_transaction_read_only does for every
// transaction. Startup options (?options=-c ...) are dropped by Supabase's pooler
// on both ports (measured 2026-10-10), so the role setting is the only way.
async function prove(url, opts) {
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
  const tag = 'localdb-prove-' + Date.now();
  const out = { tag };
  try {
    out.capability = (await db.query(CAPABILITY_SQL)).rows[0];
    out.wouldBoot = (await bootCheck(db, {})).ok;
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      if (opts && opts.txnReadOnly) await c.query('SET TRANSACTION READ ONLY');
      await c.query('INSERT INTO search_log (query) VALUES ($1)', [tag]);
      out.refused = null;
    } catch (e) { out.refused = { code: e.code, message: e.message }; }
    finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
    out.rowsAfter = (await db.query('SELECT count(*)::int AS n FROM search_log WHERE query = $1', [tag])).rows[0].n;
  } finally { await db.end().catch(() => {}); }
  out.ok = !!out.refused && out.rowsAfter === 0;
  return out;
}
if (require.main === module && process.argv.includes('--prove')) {
  const txn = process.argv.includes('--txn-read-only');
  prove(process.env.DATABASE_URL, { txnReadOnly: txn }).then(o => {
    const c = o.capability || {};
    console.log('  connection: ' + c.who + ' — insert ' + c.can_insert + ', create ' + c.can_create + ', read_only ' + c.read_only
      + (txn ? ' (this transaction set READ ONLY)' : '') + '; a local server would ' + (o.wouldBoot ? 'start' : 'refuse to start'));
    if (o.refused) console.log('  REFUSED: ' + o.refused.code + ' ' + o.refused.message);
    else console.log('  NOT REFUSED: the INSERT went through (rolled back) — this connection can write');
    console.log('  rows with the probe tag afterwards: ' + o.rowsAfter);
    console.log(o.ok ? '  PROVEN: a write through this connection is refused by Postgres.' : '  NOT PROVEN.');
    process.exit(o.ok ? 0 : 1);
  }).catch(e => { console.log('  could not run: ' + e.message); process.exit(2); });
}
