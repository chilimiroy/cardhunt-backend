-- Speed T2, 2026-10-06: the sibling check's reference scans, built ahead of
-- time by refbuild.js so a visitor's request never waits on a third-party
-- host. refscans.js runs the same statements on first use; this file is the
-- record. Our own immutable catalogue scans only — never a listing photo.
--   version  how the template was derived (refscans.REF_VERSION); a row of
--            another version is not used and refbuild.js rebuilds it
--   tw   the matcher width the template was built for (stampcheck.WHOLE_TW)
--   rgb  the 24-px template wholeScore compares, raw RGB (~2.4 KB a card)
--   state 'unbuildable' + reason: reported on the card's page as NOT run
CREATE TABLE IF NOT EXISTS card_reference_scans (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,
  reason text,
  version text,
  tw int, w int, h int,
  rgb bytea,
  built_at timestamptz NOT NULL DEFAULT now());
-- Added after the first 2,942 rows were built (2026-10-06): the column, and
-- those rows stamped with the derivation that built them.
ALTER TABLE card_reference_scans ADD COLUMN IF NOT EXISTS version text;
UPDATE card_reference_scans SET version = 'ref-1-w24'
 WHERE state = 'built' AND tw = 24 AND version IS NULL;
-- Catalogue bookkeeping (migration-rls.sql): RLS on, no policy.
ALTER TABLE card_reference_scans ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE ON card_reference_scans FROM anon, authenticated;
