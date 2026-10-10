// ══════════════════════════════════════════════════════════════
// roles.js — what a signed-in person may do (T6 step 2, 2026-10-06)
//
// Three states:
//   master    the token's email is in CARDZON_MASTER_EMAILS. DERIVED on
//             every call from the env list, never stored: take an address
//             out of the list and that person stops being a master on the
//             next request, with no database write. A master is implicitly
//             approved and needs nobody's approval.
//   approved  a master approved them   } stored in user_access, keyed on
//   pending   signed in, not decided   } the auth user id (the token's sub),
//   rejected  a master refused them    } never the email — emails change.
//
// The email compared is the one in the token auth.verify() already checked
// (signature, issuer, audience, expiry). Nothing the page sends is read.
//
// An address in the list with no mailbox behind it (roy@cardzon.com, Roy's
// decision) is not an error and is not stripped: it simply matches nobody
// until someone signs in with it.
//
// The email IS kept in user_access (security follow-up T2, 2026-10-06,
// reversing the first decision): it is written from the verified token at
// each sign-in (/api/me -> touch) and nothing else from the token is
// stored — email and user id only. The masters' list reads our own table;
// nothing here reads the `auth` schema. A row whose email has not been
// captured yet (signed in before this) shows "awaiting first sign-in" until
// that user's next sign-in fills it.
// ══════════════════════════════════════════════════════════════
'use strict';

const STORED_STATES = ['pending', 'approved', 'rejected'];

// Read at call time — a list changed on Render is honoured on the next
// request, without a deploy (the "read credentials at call time" lesson).
function masterEmails() {
  return String(process.env.CARDZON_MASTER_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function isMasterEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return !!e && masterEmails().includes(e);
}

const USER_ACCESS_SQL = `CREATE TABLE IF NOT EXISTS user_access (
  user_id uuid PRIMARY KEY,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  first_signed_in_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  email text)`;
// The column for tables made before it existed. Additive; no data moved.
const USER_ACCESS_EMAIL_SQL = 'ALTER TABLE user_access ADD COLUMN IF NOT EXISTS email text';
// The account page's "previous visit" (2026-10-10): last_seen_at moves on every
// page load, so on the page it always read as this visit. previous_visit_at keeps
// the last moment of the visit BEFORE this one; a visit ends after
// VISIT_GAP_MINUTES with no page load. The column comes from
// migration-previous-visit.sql, which Roy runs — NOT from this file's first-use
// migration (Roy, 2026-10-10). The code uses it only once that file's COMMENT is
// on the column (prevVisitReady); until then touch() writes last_seen_at only and
// the page says "none recorded before this one".
const VISIT_GAP_MINUTES = 30;
const PREV_VISIT_MARKER = 'migration-previous-visit.sql';
const PREV_VISIT_READY_SQL = `SELECT col_description(a.attrelid, a.attnum) AS note FROM pg_attribute a
  WHERE a.attrelid = 'public.user_access'::regclass AND a.attname = 'previous_visit_at' AND NOT a.attisdropped`;
const PREV_RECHECK_MS = 10 * 60 * 1000;
// The email as stored: trimmed, lower-case (how isMasterEmail compares).
// Not an email-looking string -> null, never a guess.
function emailOf(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.length <= 320 ? e : null;
}

// The store the server uses. Without one (no DATABASE_URL) a non-master's
// state cannot be read, and resolve() fails CLOSED — it never assumes.
let _store = null;
function setStore(s) { _store = s; }
function store() { return _store; }

// { migrate: true } is the server's first-use migration, and only the
// server passes it (on an unguarded pool — schemaguard.js). Anyone else
// gets a store that CHECKS the table has the shape this code needs and
// refuses to run on one that does not; it never creates or alters it.
const USER_ACCESS_COLUMNS = ['user_id', 'state', 'first_signed_in_at', 'last_seen_at', 'decided_by', 'decided_at', 'email'];
function pgStore(db, opts) {
  const migrate = !!(opts && opts.migrate) && !require('./schemaguard').isGuarded(db);
  let ready = null;
  const verify = () => db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_access'`).then(r => {
    const have = new Set(r.rows.map(x => x.column_name));
    const missing = USER_ACCESS_COLUMNS.filter(c => !have.has(c));
    if (missing.length) throw new Error('user_access is missing ' + missing.join(', ')
      + ' — the server\'s first-use migration or migration-user-access.sql adds it; this store does not');
  });
  const table = () => ready || (ready = (migrate
    ? db.query(USER_ACCESS_SQL).then(() => db.query(USER_ACCESS_EMAIL_SQL))
    : verify()).catch(e => { ready = null; throw e; }));
  // Has Roy's migration run? Yes is kept; no is asked again every 10 minutes,
  // so running the file switches the feature on without a redeploy.
  let prevReady = false, prevAskedAt = 0;
  const prevVisitReady = async () => {
    if (prevReady || Date.now() - prevAskedAt < PREV_RECHECK_MS) return prevReady;
    prevAskedAt = Date.now();
    try { const r = await db.query(PREV_VISIT_READY_SQL); prevReady = !!(r.rows[0] && r.rows[0].note === PREV_VISIT_MARKER); }
    catch (e) { prevReady = false; }
    return prevReady;
  };
  return {
    prevVisitReady,
    async get(userId) {
      await table();
      const r = await db.query('SELECT state FROM user_access WHERE user_id = $1', [userId]);
      return r.rows[0] ? r.rows[0].state : null;
    },
    // The email captured at sign-in, for refusing a decision on a master.
    async emailFor(userId) {
      await table();
      const r = await db.query('SELECT email FROM user_access WHERE user_id = $1', [userId]);
      return r.rows[0] ? r.rows[0].email : null;
    },
    // A sign-in seen (/api/me). Creates the row as pending; an existing
    // row keeps its state — a rejected user signing in again stays
    // rejected and does not reappear in the pending list. The email is the
    // verified token's; a token without one leaves the stored one alone.
    async touch(userId, email) {
      await table();
      if (await prevVisitReady()) {
        await db.query(`INSERT INTO user_access (user_id, email) VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET
            previous_visit_at = CASE WHEN user_access.last_seen_at < now() - interval '${VISIT_GAP_MINUTES} minutes'
              THEN user_access.last_seen_at ELSE user_access.previous_visit_at END,
            last_seen_at = now(),
            email = COALESCE(EXCLUDED.email, user_access.email)`, [userId, emailOf(email)]);
        return;
      }
      await db.query(`INSERT INTO user_access (user_id, email) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(),
          email = COALESCE(EXCLUDED.email, user_access.email)`, [userId, emailOf(email)]);
    },
    async decide(userId, state, byUserId) {
      await table();
      const r = await db.query(`UPDATE user_access SET state = $2, decided_by = $3, decided_at = now()
        WHERE user_id = $1 RETURNING user_id, state, decided_by, decided_at`, [userId, state, byUserId]);
      return r.rows[0] || null;
    },
    // The account page (TASK-account-and-bars T2): ONE row, the caller's own —
    // the route passes req.account.userId, never an id from the request.
    async account(userId) {
      await table();
      const prev = await prevVisitReady() ? 'previous_visit_at' : 'NULL::timestamptz AS previous_visit_at';
      const r = await db.query(`SELECT user_id, email, state, first_signed_in_at, last_seen_at, ${prev}, decided_at
        FROM user_access WHERE user_id = $1`, [userId]);
      return r.rows[0] || null;
    },
    // For the masters' view — our own table only. email null = captured
    // at that user's next sign-in.
    async list() {
      await table();
      const r = await db.query(`SELECT a.user_id, a.email, a.state, a.first_signed_in_at, a.last_seen_at,
               a.decided_at, a.decided_by, d.email AS decided_by_email
        FROM user_access a
        LEFT JOIN user_access d ON d.user_id = a.decided_by
        ORDER BY a.first_signed_in_at DESC`);
      return r.rows;
    }
  };
}

// The role a stored row is SHOWN as. A listed email is master whatever the
// row's state column says — the column never holds 'master' (CHECK), and a
// master's row is created 'pending' by touch() like anyone's. Every place
// that shows a row's state asks this, never r.state directly.
function displayRole(row) {
  if (row && isMasterEmail(row.email)) return 'master';
  const s = row && row.state;
  return STORED_STATES.includes(s) ? s : 'pending';
}

// roleFor(user) -> { role, state }   role: master | approved | pending | rejected
// Throws when the state cannot be read; the caller fails closed.
async function roleFor(user) {
  if (!user || !user.id) throw new Error('no user');
  if (isMasterEmail(user.email)) return { role: 'master', state: 'approved' };
  if (!_store) throw new Error('approval state unavailable: no database');
  const s = await _store.get(user.id);
  const state = STORED_STATES.includes(s) ? s : 'pending';
  return { role: state, state };
}

module.exports = { masterEmails, isMasterEmail, roleFor, displayRole, setStore, store, pgStore, emailOf, USER_ACCESS_COLUMNS,
                   USER_ACCESS_SQL, USER_ACCESS_EMAIL_SQL, VISIT_GAP_MINUTES, PREV_VISIT_MARKER, PREV_VISIT_READY_SQL, STORED_STATES };
