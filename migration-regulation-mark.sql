-- migration-regulation-mark.sql — store each card's regulation mark (2026-10-09, TASK-tcgdex-fields T2)
--
-- Roy runs this; no test and no server path creates it (schemaguard.js).
-- The regulation mark is the letter that says which printing era a card
-- belongs to ("F", "G", ...). The nightly already fetches TCGdex's card for
-- every English card it prices and that response carries it: ingest.js
-- writeRegulationMark() stores it from there — no extra request. Until this
-- runs, the nightly says the column is missing and stores nothing.
--
--   regulation_mark             the letter as TCGdex gives it; NULL = none known
--                               (older cards legitimately have none)
--   regulation_mark_checked_at  when the nightly last asked TCGdex for this
--                               card; NULL = never asked
-- So "none known" (checked_at set, mark NULL) and "never asked" (checked_at
-- NULL) stay distinguishable. A response without the field never erases a
-- stored mark.
--
-- Storage only: not wired into any gate, the estimator, the headline or the
-- photo checks. Catalogue data, covered by cards' existing RLS.
BEGIN;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS regulation_mark text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS regulation_mark_checked_at timestamptz;
COMMIT;
