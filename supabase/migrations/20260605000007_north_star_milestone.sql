-- No schema change needed: milestones table already accepts any string as milestone.
-- This migration documents the two new milestone values used by the app:
--   'tenth_outfit_saved'           — user saved 10 outfits (any timeframe)
--   'tenth_outfit_saved_within_7_days' — user saved 10 outfits within 7 days of signup (North Star achieved)
-- No DDL required. This file exists as a record only.
-- The milestones table unique constraint (user_id, milestone) handles deduplication.
COMMENT ON TABLE milestones IS
  'milestone values: first_outfit_saved, tenth_outfit_saved, tenth_outfit_saved_within_7_days';
