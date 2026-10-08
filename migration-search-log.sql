-- migration-search-log.sql — record search terms (2026-10-08, TASK-reports-and-pages T6)
--
-- Roy runs this; no test and no server path creates it (schemaguard.js).
-- Until it is run, /api/search records nothing and the search page's
-- "Most searched cards" says it is not recording yet.
--
-- What is kept: the query text (the server caps it at 120 characters), the
-- card it resolved to when it resolved to ONE card, and how many candidates
-- it had. No user id, no IP: "most searched" counts searches, not people.
--
-- RLS on from the first commit, with NO policy: the API roles (anon,
-- authenticated) can neither read nor write it; only the server's own
-- connection (which bypasses RLS) inserts and aggregates.
BEGIN;

CREATE TABLE IF NOT EXISTS search_log (
  id          bigserial PRIMARY KEY,
  searched_at timestamptz NOT NULL DEFAULT now(),
  query       text NOT NULL CHECK (char_length(query) <= 120),
  card_id     text,
  candidates  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS search_log_card_time ON search_log (card_id, searched_at) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS search_log_time ON search_log (searched_at);

ALTER TABLE search_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON search_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE search_log_id_seq FROM anon, authenticated;

COMMIT;
