-- Speed T2, 2026-10-06: the sibling check's reference scans, built ahead of
-- time by refbuild.js so a visitor's request never waits on a third-party
-- host. refscans.js runs the same statements on first use; this file is the
-- record. Our own immutable catalogue scans only — never a listing photo.
--   tw   the matcher width the template was built for (stampcheck.WHOLE_TW);
--        a row built for another width is not used
--   rgb  the 24-px template wholeScore compares, raw RGB (~2.4 KB a card)
--   state 'unbuildable' + reason: reported on the card's page as NOT run
CREATE TABLE IF NOT EXISTS card_reference_scans (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,
  reason text,
  tw int, w int, h int,
  rgb bytea,
  built_at timestamptz NOT NULL DEFAULT now());
-- Catalogue bookkeeping (migration-rls.sql): RLS on, no policy.
ALTER TABLE card_reference_scans ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE ON card_reference_scans FROM anon, authenticated;
