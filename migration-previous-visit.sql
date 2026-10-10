-- 2026-10-10: the account page's "Previous visit" (roles.js touch / account).
-- Roy runs this in the Supabase SQL editor. The code does not create the column
-- and does not use it until the COMMENT below is on it — the comment is how the
-- server knows this file was run (roles.prevVisitReady). Until then the account
-- page says "none recorded before this one" and touch() writes last_seen_at only.
--
-- Note: the column already EXISTS on production — the deploy of 2026-10-10
-- (c1e2372) added it through roles.js's first-use migration, which this change
-- removes; 3 of 6 rows hold values written since. ADD COLUMN IF NOT EXISTS is a
-- no-op there; the COMMENT is what switches the feature on.
--
-- previous_visit_at: the last page load of the visit BEFORE this one; a visit
-- ends after 30 minutes with no page load (roles.VISIT_GAP_MINUTES).
ALTER TABLE user_access ADD COLUMN IF NOT EXISTS previous_visit_at timestamptz;
COMMENT ON COLUMN user_access.previous_visit_at IS 'migration-previous-visit.sql';
