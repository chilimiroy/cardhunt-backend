-- ══════════════════════════════════════════════════════════════
-- migration-variants.sql  (TASK T10, 2026-09-29)
--
-- Which PRINTINGS a card exists in. Rarity belongs to the card; printing
-- belongs to the copy. Expedition Alakazam #1 is Holo Rare, printed holo
-- and reverse; #33 is Rare, printed normal and reverse. One row per
-- number cannot say that, and a variant column on price_history alone
-- cannot either — it can store a reverse price, but nothing knew whether a
-- card HAS a reverse, so 241 cards showed a reverse-holo price as their
-- base price.
--
-- Written by `node ingest.js manifest <lang> [set]` from TCGdex's
-- variants_detailed (tcgdexprice.printingsFromTcgdex). Shape:
--   { "printings": [ { "key": "holo", "tcgplayer": 83497 },
--                    { "key": "reverse", "tcgplayer": 83497 } ],
--     "from": "variants_detailed" | "booleans" }
-- Keys: normal | holo | reverse | reverse-<foil> (pokeball, masterball,
-- cosmos, energy). NULL means NOT YET READ — never "no variants".
--
-- Additive: two nullable columns, no rewrite.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS variants            jsonb,
  ADD COLUMN IF NOT EXISTS variants_checked_at timestamptz;

COMMENT ON COLUMN cards.variants IS
  'Printings this card exists in, from TCGdex variants_detailed: '
  '{printings:[{key,tcgplayer}],from}. NULL = not yet read, NOT "none".';
