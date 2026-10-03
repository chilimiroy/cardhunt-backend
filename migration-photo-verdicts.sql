-- TASK T2, 2026-10-03: the stamp gate's verdicts, kept across restarts.
-- server.js runs the same statement on first use (PHOTO_VERDICTS_SQL); this
-- file is the record. Hashed keys and our own verdict only — no eBay data:
--   item_key   sha256(eBay item id), 32 hex
--   photo_key  sha256(photo URL), 16 hex — a changed photo is checked again
--   version    the matcher that produced it (stampcheck.VERDICT_VERSION)
CREATE TABLE IF NOT EXISTS listing_photo_verdicts (
  item_key text NOT NULL, check_kind text NOT NULL, version text NOT NULL,
  photo_key text NOT NULL, card_id text, state text NOT NULL,
  reprint text, label text, says text, score real,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_key, check_kind, version));
