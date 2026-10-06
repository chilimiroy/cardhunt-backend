// roles.test.js — roles, T6 step 2 (2026-10-06)
//
// master is DERIVED from CARDZON_MASTER_EMAILS on every call; approved /
// pending / rejected are stored per auth user id. Tested both ways: who IS
// a master and who is not, and that a state that cannot be read is refused
// rather than assumed.
//
//   node roles.test.js          offline (a memory store)
//   node roles.test.js --db     also: user_access exists in Supabase with
//                               the shape roles.js expects

const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const roles = require('./roles.js');

function memoryStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { get: async id => m.has(id) ? m.get(id) : null, touch: async id => { if (!m.has(id)) m.set(id, 'pending'); },
           decide: async (id, s) => { m.set(id, s); return { user_id: id, state: s }; }, list: async () => [], _m: m };
}

(async () => {
  console.log('\n  master: derived from CARDZON_MASTER_EMAILS, at call time');
  process.env.CARDZON_MASTER_EMAILS = ' Roy@Example.com , roy@cardzon.com,,second@example.org ';
  ok('the list is trimmed, lower-cased, empties dropped', JSON.stringify(roles.masterEmails()) === JSON.stringify(['roy@example.com', 'roy@cardzon.com', 'second@example.org']), JSON.stringify(roles.masterEmails()));
  ok('an address with no mailbox behind it stays in the list (roy@cardzon.com)', roles.masterEmails().includes('roy@cardzon.com'));
  ok('case does not matter', roles.isMasterEmail('ROY@example.COM'));
  ok('a listed address is a master', roles.isMasterEmail('second@example.org'));
  ok('an unlisted address is not', !roles.isMasterEmail('roy@example.co') && !roles.isMasterEmail('xroy@example.com'));
  ok('no email is never a master', !roles.isMasterEmail(null) && !roles.isMasterEmail('') && !roles.isMasterEmail(undefined));
  ok('a substring of the raw list is not a match', !roles.isMasterEmail('example.com') && !roles.isMasterEmail(','));

  roles.setStore(null);
  let r = await roles.roleFor({ id: 'u-master', email: 'roy@example.com' });
  ok('a master needs no store and no approval', r.role === 'master' && r.state === 'approved', JSON.stringify(r));
  process.env.CARDZON_MASTER_EMAILS = 'second@example.org';
  let threw = null; try { await roles.roleFor({ id: 'u-master', email: 'roy@example.com' }); } catch (e) { threw = e.message; }
  ok('removed from the list: not a master on the very next call, no write needed', threw && /unavailable/.test(threw), threw || 'still master');
  delete process.env.CARDZON_MASTER_EMAILS;
  ok('list unset: nobody is a master', !roles.isMasterEmail('second@example.org') && roles.masterEmails().length === 0);
  process.env.CARDZON_MASTER_EMAILS = 'roy@example.com';

  console.log('\n  stored states, per user id');
  threw = null; try { await roles.roleFor({ id: 'u1', email: 'a@example.com' }); } catch (e) { threw = e.message; }
  ok('no store: a non-master is REFUSED (throws), never assumed approved', !!threw, threw);
  const st = memoryStore({ u2: 'approved', u3: 'rejected', u4: 'master', u5: 'pending' });
  roles.setStore(st);
  r = await roles.roleFor({ id: 'u1', email: 'a@example.com' });
  ok('never seen: pending', r.role === 'pending', JSON.stringify(r));
  ok('approved', (await roles.roleFor({ id: 'u2', email: 'b@example.com' })).role === 'approved');
  ok('rejected', (await roles.roleFor({ id: 'u3', email: 'c@example.com' })).role === 'rejected');
  ok('pending', (await roles.roleFor({ id: 'u5', email: 'e@example.com' })).role === 'pending');
  ok('a stored "master" is NOT honoured (master is never stored)', (await roles.roleFor({ id: 'u4', email: 'd@example.com' })).role === 'pending');
  ok('keyed on the user id, not the email: the same email under another id is not approved',
     (await roles.roleFor({ id: 'u9', email: 'b@example.com' })).role === 'pending');
  ok('a master whose stored row says rejected is still a master (cannot be locked out)',
     (await roles.roleFor({ id: 'u3', email: 'ROY@example.com' })).role === 'master');
  await st.touch('u3');
  ok('a rejected user signing in again stays rejected', st._m.get('u3') === 'rejected');
  threw = null; try { await roles.roleFor({ email: 'a@example.com' }); } catch (e) { threw = e.message; }
  ok('no user id: refused', !!threw);

  console.log('\n  the table and the server');
  ok('user_access cannot hold "master"', /CHECK \(state IN \('pending','approved','rejected'\)\)/.test(roles.USER_ACCESS_SQL) && !/master/.test(roles.USER_ACCESS_SQL));
  ok('keyed on the auth user id; no email column', /user_id uuid PRIMARY KEY/.test(roles.USER_ACCESS_SQL) && !/email/.test(roles.USER_ACCESS_SQL));
  const mig = fs.readFileSync(__dirname + '/migration-user-access.sql', 'utf8').replace(/\r/g, '');
  const norm = s => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
  ok('migration-user-access.sql records the same statement roles.js runs', norm(mig) === norm(roles.USER_ACCESS_SQL));
  ok('a sign-in touch never changes a stored state', /ON CONFLICT \(user_id\) DO UPDATE SET last_seen_at = now\(\)`/.test(fs.readFileSync(__dirname + '/roles.js', 'utf8')));
  const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
  const meAt = S.indexOf("app.get('/api/me'"), me = S.slice(meAt, S.indexOf('\n});', meAt) + 4);
  ok('/api/me reports the role from roles.roleFor, after auth.verify', /auth\.verify\(token\)[\s\S]*roles\.roleFor\(v\.user\)[\s\S]*role: r\.role/.test(me));
  ok('/api/me fails closed (503, role null) when the state cannot be read', /status\(503\)[\s\S]{0,80}role: null/.test(me));
  ok('the env name is CARDZON_MASTER_EMAILS — not "fixed" to CARDHUNT_', /CARDZON_MASTER_EMAILS/.test(fs.readFileSync(__dirname + '/roles.js', 'utf8'))
     && !/CARDHUNT_MASTER_EMAILS/.test(S + fs.readFileSync(__dirname + '/roles.js', 'utf8')));

  if (process.argv.includes('--db')) {
    console.log('\n  --db: user_access in Supabase');
    const { Pool } = require('pg');
    const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
      const c = await db.query(`SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='user_access' ORDER BY ordinal_position`);
      const cols = c.rows.map(x => x.column_name + ':' + x.data_type).join(',');
      ok('user_access exists with the expected columns', cols === 'user_id:uuid,state:text,first_signed_in_at:timestamp with time zone,last_seen_at:timestamp with time zone,decided_by:uuid,decided_at:timestamp with time zone', cols);
      let refused = null;
      try { await db.query("BEGIN"); await db.query("INSERT INTO user_access (user_id, state) VALUES (gen_random_uuid(), 'master')"); }
      catch (e) { refused = e.code + ' ' + e.message; } finally { await db.query('ROLLBACK'); }
      ok('Postgres itself refuses a stored "master"', refused && /^23514/.test(refused), refused);
    } finally { await db.end(); }
  }

  console.log('\n  roles.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
