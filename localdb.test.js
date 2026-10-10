// localdb.test.js — a local server cannot start on a connection that can write
// to production (localdb.js, 2026-10-10). Tested both ways: what it lets start,
// and what it refuses — and that server.js listens only after the check.
//
//   node localdb.test.js
'use strict';
require('./testcount')(14);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const L = require('./localdb');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const fakeDb = row => ({ query: async () => ({ rows: [row] }) });
const RO = { who: 'cardhunt_local_ro', can_insert: false, can_create: false, read_only: 'on' };
const RW = { who: 'postgres', can_insert: true, can_create: true, read_only: 'off' };

(async () => {
  console.log('\n  what it lets start');
  ok('Render, whatever the connection', (await L.bootCheck(fakeDb(RW), { RENDER: 'true' })).ok);
  ok('no database at all', (await L.bootCheck(null, {})).ok);
  ok('a server a test booted against the real database (CARDZON_SCHEMA_GUARD=1)', (await L.bootCheck(fakeDb(RW), { CARDZON_SCHEMA_GUARD: '1' })).ok);
  const ro = await L.bootCheck(fakeDb(RO), {});
  ok('the read-only role, locally', ro.ok && /cardhunt_local_ro/.test(ro.why), ro.why);
  ok('a role with no write grants, even if transactions are not read-only', (await L.bootCheck(fakeDb(Object.assign({}, RO, { read_only: 'off' })), {})).ok);

  console.log('\n  what it refuses, and says why');
  const rw = await L.bootCheck(fakeDb(RW), {});
  ok('the production write role, locally', !rw.ok && /postgres, which can write/.test(rw.why) && /migration-local-readonly\.sql/.test(rw.why), rw.why.slice(0, 80));
  ok('INSERT on price_history alone is enough to refuse', !(await L.bootCheck(fakeDb(Object.assign({}, RO, { read_only: 'off', can_insert: true })), {})).ok);
  ok('CREATE on the schema alone is enough to refuse', !(await L.bootCheck(fakeDb(Object.assign({}, RO, { read_only: 'off', can_create: true })), {})).ok);
  const broken = await L.bootCheck({ query: async () => { throw new Error('boom'); } }, {});
  ok('a check that cannot run refuses (fail closed)', !broken.ok && /could not ask/.test(broken.why));
  ok('an empty answer refuses', !(await L.bootCheck({ query: async () => ({ rows: [] }) }, {})).ok);
  ok('CARDZON_SCHEMA_GUARD must be exactly 1', !(await L.bootCheck(fakeDb(RW), { CARDZON_SCHEMA_GUARD: 'yes' })).ok);

  console.log('\n  wiring');
  const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
  const at = S.indexOf("require('./localdb').bootCheck(db, process.env)");
  ok('server.js listens only inside the check', at > 0 && S.indexOf('app.listen(PORT', at) > at && (S.match(/app\.listen\(/g) || []).length === 1);
  ok('a refusal exits before any request', /if \(!chk\.ok\) \{ console\.error\('\[localdb\] NOT STARTED: ' \+ chk\.why\); process\.exit\(2\); \}/.test(S));
  const M = fs.readFileSync(__dirname + '/migration-local-readonly.sql', 'utf8');
  ok('the role SQL grants SELECT only and sets every transaction read-only', /GRANT SELECT ON ALL TABLES IN SCHEMA public TO cardhunt_local_ro/.test(M)
     && /default_transaction_read_only = on/.test(M) && !/GRANT (INSERT|UPDATE|DELETE|ALL)/i.test(M));

  console.log(`\n  localdb.test.js — ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
