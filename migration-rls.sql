-- T6 step 2, 2026-10-06: row-level security.
--
-- Found before this ran (PROGRESS 2026-10-06 (night)): RLS was OFF on every
-- public table and the roles anon and authenticated held INSERT, UPDATE,
-- DELETE and TRUNCATE on all of them. The anon key is public by design (the
-- page is given it to start a sign-in), so anyone could read every alert and
-- rewrite the catalogue over PostgREST — and, once user_access existed,
-- approve themselves.
--
-- The server and ingest connect as `postgres` (rolbypassrls = true;
-- /api/db/check reports the role), so nothing here changes what they see.
-- Only PostgREST callers — anon key, with or without a user's session — are
-- constrained.
--
-- User data: RLS on, and a user may READ their own rows (keyed on
-- auth.uid()). There is deliberately NO write policy: every write goes
-- through the server, which checks approval (access.js). A write policy
-- keyed on the user id alone would let a PENDING user write through
-- PostgREST and walk round the closed door.
-- user_access: a user may read their own state, never write it.
-- Catalogue and bookkeeping tables: RLS on with no policy — PostgREST gets
-- nothing; the server reads and writes them as before.
-- TRUNCATE ignores RLS, so it is revoked from both API roles everywhere.

BEGIN;

ALTER TABLE alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alerts_read_own ON alerts;
CREATE POLICY alerts_read_own ON alerts FOR SELECT TO authenticated
  USING (user_id = (select auth.uid())::text);
DROP POLICY IF EXISTS portfolio_read_own ON portfolio;
CREATE POLICY portfolio_read_own ON portfolio FOR SELECT TO authenticated
  USING (user_id = (select auth.uid())::text);
DROP POLICY IF EXISTS users_read_own ON users;
CREATE POLICY users_read_own ON users FOR SELECT TO authenticated
  USING (id = (select auth.uid()));
DROP POLICY IF EXISTS user_access_read_own ON user_access;
CREATE POLICY user_access_read_own ON user_access FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON user_access FROM anon, authenticated;

ALTER TABLE cards                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_quota               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_quota_hour          ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_photo_verdicts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_views            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcgdex_product_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE yuyutei_index            ENABLE ROW LEVEL SECURITY;

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

COMMIT;
