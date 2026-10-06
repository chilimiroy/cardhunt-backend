-- Speed, 2026-10-07: the novelty check's colour reference — our scan's
-- gold/black profile — built ahead of time by `node refbuild.js --colour`,
-- so a visitor's request never waits on a third-party host to measure it.
-- refscans.js runs the same statements on first use; this file is the record.
-- Our own immutable catalogue scans only — never a listing photo.
--   version   stampcheck.MATERIAL_VERSION: a change to how colour is
--             measured retires every row (rebuilt by refbuild.js --colour)
--   scan_url  the scan measured; a card whose image changed is measured again
--   state 'unbuildable' + reason: the server measures live, as before
CREATE TABLE IF NOT EXISTS card_colour_refs (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,
  reason text,
  version text,
  gold double precision, black double precision,
  built_at timestamptz NOT NULL DEFAULT now());
-- Catalogue bookkeeping (migration-rls.sql): RLS on, no policy.
ALTER TABLE card_colour_refs ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE ON card_colour_refs FROM anon, authenticated;
