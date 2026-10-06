// ══════════════════════════════════════════════════════════════
// schemaguard.js — tests cannot change the production schema
// (security follow-up, 2026-10-06)
//
// roles.test.js --db once added a column to the real user_access table: the
// store it exercised ran its first-use migration. The outcome was harmless;
// the capability was not. Schema changes come from exactly two places:
//   * the server's own first-use migration (server.js, unguarded), and
//   * a SQL block Roy runs himself (the migration-*.sql files).
//
// Every test that touches the database gets its connection HERE
// (testPool / testClient), and that connection refuses any statement that
// changes the schema or privileges — before it is sent. Rows a test inserts
// and removes are not schema and still work.
//
// A test that boots server.js against the real database sets
// CARDZON_SCHEMA_GUARD=1 in the child's env; server.js wraps its pool with
// fromEnv(), so the server's first-use migration is refused there too.
//
// schemaguard.test.js pins all of it: no test opens its own pg connection,
// the guard refuses (and a real DDL statement never reaches Postgres under
// --db), and it lets ordinary reads and writes through.
// ══════════════════════════════════════════════════════════════
'use strict';

// The first keyword of each statement. DO is here because a DO block can
// carry any DDL inside it. SET ROLE / SET LOCAL are not schema.
const SCHEMA_WORDS = /^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|SECURITY|DO|REINDEX|CLUSTER|VACUUM|IMPORT)\b/i;
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// True when any statement in the text changes schema or privileges. Splits
// on ';' without parsing quotes: a ';' inside a string can only make it
// refuse more, never less.
function isSchemaChange(sql) {
  const text = typeof sql === 'string' ? sql : (sql && sql.text) || '';
  return strip(text).split(';').some(part => SCHEMA_WORDS.test(part.trim()));
}

function refusal(sql, who) {
  const text = typeof sql === 'string' ? sql : (sql && sql.text) || '';
  const e = new Error(`schemaguard (${who}): a schema change was refused before it was sent — `
    + `"${strip(text).trim().replace(/\s+/g, ' ').slice(0, 70)}". Schema changes come from the server's `
    + `first-use migration or a migration-*.sql block run by hand, never from a test.`);
  e.code = 'SCHEMA_GUARD';
  return e;
}

function wrapQuery(target, who) {
  const orig = target.query.bind(target);
  target.query = function (sql, ...rest) {
    if (isSchemaChange(sql)) {
      const e = refusal(sql, who);
      const cb = rest.find(x => typeof x === 'function');
      if (cb) { process.nextTick(() => cb(e)); return undefined; }
      return Promise.reject(e);
    }
    return orig(sql, ...rest);
  };
}

// Wraps a pg Pool or Client in place and returns it. A pool's checked-out
// clients are wrapped too (pool.connect()).
function guard(conn, who) {
  if (!conn || conn.__schemaGuard) return conn;
  who = who || 'guarded';
  wrapQuery(conn, who);
  if (typeof conn.totalCount === 'number' && typeof conn.connect === 'function') {   // a Pool
    const connect = conn.connect.bind(conn);
    conn.connect = function (cb) {
      if (cb) return connect((err, client, done) => { if (client) guard(client, who); cb(err, client, done); });
      return connect().then(client => guard(client, who));
    };
  }
  Object.defineProperty(conn, '__schemaGuard', { value: who });
  return conn;
}
const isGuarded = conn => !!(conn && conn.__schemaGuard);

const opts = () => ({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
function testPool() { const { Pool } = require('pg'); return guard(new Pool(opts()), 'test'); }
function testClient() { const { Client } = require('pg'); return guard(new Client(opts()), 'test'); }

// server.js: guarded only when a test started it so.
const ENV = 'CARDZON_SCHEMA_GUARD';
function fromEnv(pool) { return process.env[ENV] === '1' ? guard(pool, 'server under test') : pool; }

module.exports = { isSchemaChange, guard, isGuarded, testPool, testClient, fromEnv, ENV };
