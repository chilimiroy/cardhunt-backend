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
// Emails never enter user_access (decided 2026-10-06: they live in Supabase
// Auth's own `auth` schema). The masters' list reads them from auth.users.
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
  decided_at timestamptz)`;

// The store the server uses. Without one (no DATABASE_URL) a non-master's
// state cannot be read, and resolve() fails CLOSED — it never assumes.
let _store = null;
function setStore(s) { _store = s; }
function store() { return _store; }

function pgStore(db) {
  let ready = null;
  const table = () => ready || (ready = db.query(USER_ACCESS_SQL).catch(e => { ready = null; throw e; }));
  return {
    async get(userId) {
      await table();
      const r = await db.query('SELECT state FROM user_access WHERE user_id = $1', [userId]);
      return r.rows[0] ? r.rows[0].state : null;
    },
    // A sign-in seen (/api/me). Creates the row as pending; an existing
    // row keeps its state — a rejected user signing in again stays
    // rejected and does not reappear in the pending list.
    async touch(userId) {
      await table();
      await db.query(`INSERT INTO user_access (user_id) VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()`, [userId]);
    },
    async decide(userId, state, byUserId) {
      await table();
      const r = await db.query(`UPDATE user_access SET state = $2, decided_by = $3, decided_at = now()
        WHERE user_id = $1 RETURNING user_id, state, decided_by, decided_at`, [userId, state, byUserId]);
      return r.rows[0] || null;
    },
    // For the masters' view. The email is auth.users' — not copied here.
    async list() {
      await table();
      const r = await db.query(`SELECT a.user_id, u.email, a.state, a.first_signed_in_at, a.last_seen_at,
               a.decided_at, a.decided_by, d.email AS decided_by_email
        FROM user_access a
        LEFT JOIN auth.users u ON u.id = a.user_id
        LEFT JOIN auth.users d ON d.id = a.decided_by
        ORDER BY a.first_signed_in_at DESC`);
      return r.rows;
    }
  };
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

module.exports = { masterEmails, isMasterEmail, roleFor, setStore, store, pgStore,
                   USER_ACCESS_SQL, STORED_STATES };
