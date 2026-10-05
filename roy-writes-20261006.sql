-- roy-writes-20261006.sql — three production writes for Roy to run.
--
-- The session cannot write to production (correctly). Each write below has
-- a SELECT to save first, the expected row count, and the UPDATE. Run in the
-- Supabase SQL editor, one numbered block at a time; save each SELECT's
-- output (Download CSV) before running its UPDATE. Counts measured
-- 2026-10-06 with read-only queries.
--
-- No credential appears here. Nothing is deleted. Card ids do not change.

-- ════════════════════════════════════════════════════════════════════
-- 1. McDonald's 2023 and 2024: copy mcd21's plain-arches logo.
--    Neither TCGdex nor pokemontcg.io has a logo for these sets
--    (images.pokemontcg.io/mcd23/logo.png and mcd24 are 404). mcd21's logo
--    is the plain golden arches, which 2019 and 2021 also use. 2022's logo
--    reads "Match Battle" and is NOT used.
-- ════════════════════════════════════════════════════════════════════

-- 1a. Back up. Expect 30 rows (15 + 15), set_logo and set_logo_source NULL.
SELECT api_card_id, set_api_id, set_logo, set_logo_source
FROM cards
WHERE api_card_id LIKE 'en-%' AND set_api_id IN ('2023sv', '2024sv')
ORDER BY api_card_id;

-- 1b. Write. Expect "UPDATE 30". The IS NULL guard means a re-run changes nothing.
UPDATE cards
SET set_logo        = 'https://images.pokemontcg.io/mcd21/logo.png',
    set_logo_source = 'copied:pokemontcg mcd21 (plain arches)',
    updated_at      = NOW()
WHERE api_card_id LIKE 'en-%'
  AND set_api_id IN ('2023sv', '2024sv')
  AND set_logo IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 2. MEP and SVP Black Star Promos: copy the generic Black Star Promos logo.
--    TCGdex has no logo for either (assets.tcgdex.net/en/sv/svp/logo.png
--    and /en/me/mep/logo.png are 404). The XY, SM, SWSH and BW promo logos
--    on TCGdex are the same file (15,737 bytes, the black "PROMO" star);
--    SWSH's is used.
-- ════════════════════════════════════════════════════════════════════

-- 2a. Back up. Expect 315 rows (mep 89 + svp 226), set_logo NULL.
SELECT api_card_id, set_api_id, set_logo, set_logo_source
FROM cards
WHERE api_card_id LIKE 'en-%' AND set_api_id IN ('mep', 'svp')
ORDER BY api_card_id;

-- 2b. Write. Expect "UPDATE 315".
UPDATE cards
SET set_logo        = 'https://assets.tcgdex.net/en/swsh/swshp/logo.png',
    set_logo_source = 'copied:tcgdex swshp (generic Black Star Promos)',
    updated_at      = NOW()
WHERE api_card_id LIKE 'en-%'
  AND set_api_id IN ('mep', 'svp')
  AND set_logo IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 3. Unown "?" (Unseen Forces Unown Collection): number '%3F' -> '?'.
--    '%3F' is TCGdex's localId, not what the card prints. The card id stays
--    en-exu-%3F, so the 4 price_history rows (append-only) still point at it.
--    Alerts 0, portfolio 0.
--    The code side shipped in the same commit as this file: cardid.tcgdexLocalId
--    asks TCGdex for '%253F', and manifest/cardgap fold '%3F' to '?', so a
--    re-ingest neither 404s nor re-adds the card.
-- ════════════════════════════════════════════════════════════════════

-- 3a. Back up. Expect 1 row: id 10900, number '%3F'.
SELECT id, api_card_id, name, number, set_api_id, set_total
FROM cards
WHERE api_card_id = 'en-exu-%3F';

-- 3b. Write. Expect "UPDATE 1".
UPDATE cards
SET number = '?', updated_at = NOW()
WHERE api_card_id = 'en-exu-%3F' AND number = '%3F';

-- 3c. Check. Expect one row, number '?'.
SELECT api_card_id, number FROM cards WHERE api_card_id = 'en-exu-%3F';

-- ════════════════════════════════════════════════════════════════════
-- To undo any block: re-apply the values from its saved SELECT, e.g.
--   UPDATE cards SET set_logo = NULL, set_logo_source = NULL
--   WHERE set_api_id IN ('2023sv','2024sv') AND set_logo_source LIKE 'copied:%';
--   UPDATE cards SET number = '%3F' WHERE api_card_id = 'en-exu-%3F';
-- ════════════════════════════════════════════════════════════════════
