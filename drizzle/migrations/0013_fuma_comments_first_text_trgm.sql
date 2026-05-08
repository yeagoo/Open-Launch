-- Speed up the stale-comment rewrite scan in simulate-engagement.
-- The cron does a case-insensitive regex match against the first paragraph
-- text of every bot-authored fuma_comment to find templated openings.
-- Plain btree indexes can't accelerate `~*`; pg_trgm's GIN index can.
--
-- At ~2.5k bot comments today this is mostly preemptive — without the
-- index, each tick scans every row and applies the regex (~30-50 ms total).
-- The index keeps that bounded as the comment table grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS fuma_comments_first_text_trgm_idx
  ON fuma_comments USING gin (
    (content->'content'->0->'content'->0->>'text') gin_trgm_ops
  );
