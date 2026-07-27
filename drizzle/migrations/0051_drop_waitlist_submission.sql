-- Drop the unused waitlist_submission table. Nothing in app/ or lib/
-- reads or writes it (audit 2026-07); if a waitlist feature returns it
-- should be re-modeled with a unique constraint on the submitted URL.

DROP TABLE IF EXISTS "waitlist_submission";
