-- migration-dex-ids.sql — store each card's national Pokédex number(s) (2026-10-09, TASK-tcgdex-fields T1)
--
-- Roy runs this; no test and no server path creates it (schemaguard.js).
-- TCGdex gives the dex number as an ARRAY, and 121 English cards carry
-- several: a TAG TEAM card depicts two Pokémon (Pikachu & Zekrom GX is
-- {25,644}), and one card carries five. Keeping only the first would be a lie
-- about the card (Roy, 2026-10-09), so every number is kept, in TCGdex's order.
-- The nightly already fetches TCGdex's card for every English card it prices:
-- ingest.js writeDexIds() stores it from there — no extra request. Until this
-- runs, the nightly says the column is missing and stores nothing.
--
--   dex_ids             integer[]; '{}' = none known (a Trainer, an Energy,
--                       or a Pokémon card TCGdex gives no number for);
--                       NULL = never asked
--   dex_ids_checked_at  when the nightly last asked TCGdex for this card;
--                       NULL = never asked
-- A response without numbers never erases stored ones.
--
-- Storage only: not wired into any gate, the estimator, the headline or the
-- photo checks. Catalogue data, covered by cards' existing RLS.
BEGIN;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS dex_ids integer[];
ALTER TABLE cards ADD COLUMN IF NOT EXISTS dex_ids_checked_at timestamptz;
COMMIT;
