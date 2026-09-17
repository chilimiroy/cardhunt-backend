-- ══════════════════════════════════════════════════════════════
-- migration-grade-dimension.sql
--
-- price_history has one row per card per observation and no way to say
-- WHICH card-in-which-state that observation was of. Two consequences,
-- long known and both on the carried-forward list:
--
--   · Grade. A PSA 10 sells for 3x to 40x the raw card, and the table
--     cannot hold that number, so the product multiplies a guess instead
--     (T2).
--   · Variant. 241 cards show a reverse-holo price as their base price and
--     111 more are withheld because there is nowhere to put the second
--     number.
--
-- One missing dimension, wearing two hats. One schema change.
--
-- Run against Supabase BEFORE deploying the code that writes these
-- columns. Adding nullable columns is not a rewrite and takes no
-- meaningful lock; the index build is the only slow part.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS grade       text,
  ADD COLUMN IF NOT EXISTS variant     text,
  ADD COLUMN IF NOT EXISTS sample_size integer;

COMMENT ON COLUMN price_history.grade IS
  'PSA 10 / BGS 9.5 / ... . NULL means the ungraded card, which is what '
  'every row written before this migration is. Readers that want the base '
  'price MUST filter grade IS NULL — a graded row is a different market, '
  'not a newer observation of the same one.';

COMMENT ON COLUMN price_history.variant IS
  'Edition or print variant when the source stated one: 1st Edition, '
  'Shadowless, Unlimited, Master Ball, Poke Ball. NULL means unstated, '
  'which is not the same as "normal".';

COMMENT ON COLUMN price_history.sample_size IS
  'How many listings an aggregate was computed from. NULL for a single '
  'observed price. A median of one is a data point, not a market price, '
  'and the number that says which must travel with the price.';

-- Every existing row is an ungraded observation. The column defaults to
-- NULL, which already says that, so there is no backfill — but be explicit
-- that this was considered rather than forgotten.
--   (no UPDATE required: grade IS NULL == ungraded)

-- The lookup every price read performs: latest row for a card, preferring
-- a real source over an estimate. Grade joins the key because the reads
-- now filter on it.
CREATE INDEX IF NOT EXISTS price_history_card_grade_recorded_idx
  ON price_history (card_api_id, grade, recorded_at DESC);

-- Aggregates are written per card per grade per variant. This index serves
-- "what do we already have for this card" without scanning history.
CREATE INDEX IF NOT EXISTS price_history_grade_not_null_idx
  ON price_history (card_api_id, grade, variant, recorded_at DESC)
  WHERE grade IS NOT NULL;

-- ── Verify ────────────────────────────────────────────────────
-- Expect: every pre-existing row ungraded, and the base-price read
-- unchanged in count.
--
--   SELECT count(*) FILTER (WHERE grade IS NULL)  AS ungraded,
--          count(*) FILTER (WHERE grade IS NOT NULL) AS graded
--   FROM price_history;
--
--   SELECT api_card_id, price_usd, source
--   FROM cards c
--   LEFT JOIN LATERAL (
--     SELECT price_usd, source FROM price_history ph
--     WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL
--     ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
--     LIMIT 1) lp ON TRUE
--   WHERE c.api_card_id = 'ja-SV2a-129';
--   -- must still read ~0.51 from yuyutei_shop
