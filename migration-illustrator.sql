-- migration-illustrator.sql — store each card's artist (2026-10-08)
--
-- Roy runs this; no test and no server path creates it (schemaguard.js).
-- The card page used to fetch the artist from TCGdex on every view. The
-- nightly refresh already fetches TCGdex's card for every English card it
-- prices, and that response carries the illustrator: ingest.js
-- writeIllustrator() stores it from there. Until this runs, the nightly
-- says the column is missing and stores nothing; the page says "not recorded".
--
--   illustrator             the artist as TCGdex names it; NULL = none known
--   illustrator_checked_at  when the nightly last asked TCGdex for this card;
--                           NULL = never asked (so "no artist" and "not yet
--                           asked" are told apart)
-- Catalogue data, not user data: covered by cards' existing RLS (on, no
-- policy for the API roles); nothing new to grant.
BEGIN;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS illustrator text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS illustrator_checked_at timestamptz;
COMMIT;
