// refscans.test.js — the reference table under the schema guard (2026-10-06)
//
// A test that boots the server against the real database runs it on a
// guarded pool (schemaguard.js, CARDZON_SCHEMA_GUARD=1). There the first-use
// migration must send NO DDL: it checks the columns and refuses, naming the
// missing one. On an unguarded pool (production) it creates and migrates.
// Offline: the pools are fakes that record what they were sent.

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const fresh = () => { delete require.cache[require.resolve('./refscans.js')]; return require('./refscans.js'); };
const ALL = ['card_id', 'scan_url', 'state', 'reason', 'version', 'tw', 'w', 'h', 'rgb', 'built_at'];
const fake = (guarded, columns) => {
  const sent = [];
  return { sent, __schemaGuard: guarded || undefined,
    query: async t => { sent.push(String(t).trim().split(/\s+/).slice(0, 2).join(' '));
      return { rows: /information_schema/.test(t) ? columns.map(c => ({ column_name: c })) : [] }; } };
};

(async () => {
  console.log('\n  guarded pool: checks, never migrates');
  let db = fake(true, ALL);
  await fresh().ensureTable(db);
  ok('every column present: one SELECT, no DDL sent', db.sent.length === 1 && /^SELECT/.test(db.sent[0]), db.sent.join(' | '));

  db = fake(true, ALL.filter(c => c !== 'version'));
  let err = null;
  try { await fresh().ensureTable(db); } catch (e) { err = e; }
  ok('a missing column is refused, and named', err && /missing version/.test(err.message), err && err.message.slice(0, 60));
  ok('...still without sending DDL', db.sent.every(s => /^SELECT/.test(s)));

  console.log('\n  unguarded pool (production): creates and migrates');
  db = fake(false, ALL);
  await fresh().ensureTable(db);
  ok('CREATE TABLE, then ADD COLUMN version, then RLS', /^CREATE TABLE/.test(db.sent[0]) && db.sent.some(s => /^ALTER TABLE/.test(s))
     && db.sent.length >= 4, db.sent.join(' | '));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
