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

module.exports = { CAPABILITY_SQL, writable, exemptReason, bootCheck, SETUP };
