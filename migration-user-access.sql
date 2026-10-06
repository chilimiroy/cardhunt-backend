-- T6 step 2, 2026-10-06: who a master has approved. roles.js runs the same
-- statement on first use (USER_ACCESS_SQL); this file is the record.
--   user_id     the Supabase auth user id (the token's sub) — never the
--               email: emails change, the id does not
--   state       pending (every new sign-in) | approved | rejected
--   decided_by  the master's user id; decided_at when
-- `master` is NOT a state here: it is derived from CARDZON_MASTER_EMAILS on
-- every request, so removing an address takes effect with no write.
CREATE TABLE IF NOT EXISTS user_access (
  user_id uuid PRIMARY KEY,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  first_signed_in_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz);
