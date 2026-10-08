-- migration-reports.sql — listing reports (2026-10-08, TASK-reports-and-pages T3)
--
-- Roy runs this; no test and no server path creates it (schemaguard.js).
-- Until it is run, POST /api/reports answers 503 "reports are not set up".
--
-- A report is what an approved user said was wrong with ONE listing row, and
-- a snapshot of that row as the page showed it: the card, the listing id and
-- URL, the source, the price shown, and the photo-check verdicts at that
-- moment — a report about a listing that has since changed is otherwise
-- unreadable. Masters change its state; nobody edits or deletes it here.
--
-- RLS on from the first commit:
--   * authenticated: SELECT its OWN reports (user_id = auth.uid()); no other row.
--   * no INSERT / UPDATE / DELETE policy for any API role. A user files a
--     report only through POST /api/reports, which checks approval and the
--     rate limit and takes the user id from the verified token. An RLS insert
--     policy would let a pending account, or anyone with the public anon key
--     and a session, insert past both (CLAUDE.md: API roles write nothing).
--   * masters read every report through /api/admin/reports (access.master):
--     the master list lives in Render's environment, which Postgres cannot see.
BEGIN;

CREATE TABLE IF NOT EXISTS listing_reports (
  id                     bigserial PRIMARY KEY,
  created_at             timestamptz NOT NULL DEFAULT now(),
  user_id                uuid NOT NULL,
  reporter_email         text,
  card_id                text NOT NULL CHECK (char_length(card_id) <= 80),
  listing_id             text NOT NULL CHECK (char_length(listing_id) <= 200),
  listing_url            text CHECK (listing_url IS NULL OR char_length(listing_url) <= 600),
  source                 text NOT NULL CHECK (char_length(source) <= 40),
  price_shown            numeric(12, 2),
  price_currency         text CHECK (price_currency IS NULL OR char_length(price_currency) <= 8),
  reason                 text NOT NULL CHECK (reason IN ('fake', 'wrong_card', 'wrong_condition', 'wrong_price', 'other')),
  details                text CHECK (details IS NULL OR char_length(details) <= 1000),
  photo_checks           jsonb NOT NULL DEFAULT '{}'::jsonb,
  state                  text NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'reviewed', 'actioned', 'dismissed')),
  state_changed_by       uuid,
  state_changed_by_email text,
  state_changed_at       timestamptz,
  CHECK (reason <> 'other' OR char_length(btrim(coalesce(details, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS listing_reports_created ON listing_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS listing_reports_user_created ON listing_reports (user_id, created_at DESC);

ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listing_reports_own_read ON listing_reports;
CREATE POLICY listing_reports_own_read ON listing_reports FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON listing_reports FROM anon, authenticated;
REVOKE ALL ON SEQUENCE listing_reports_id_seq FROM anon, authenticated;

COMMIT;
