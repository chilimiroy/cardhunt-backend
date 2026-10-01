-- migration-logo-source.sql — record WHERE a set's logo came from (2026-10-01)
--
-- The image_source pattern, for set_logo. ccfill.js fills logos for sets
-- TCGdex has none for from pokemontcg.io, and every field it writes must
-- say so. Additive and nullable: NULL means "written before this column
-- existed" (TCGdex, via setmeta). Nothing reads it as a condition.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS set_logo_source text;
