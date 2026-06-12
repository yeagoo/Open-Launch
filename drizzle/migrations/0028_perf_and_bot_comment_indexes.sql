-- Performance + integrity indexes, plus a one-time dedup of bot comments.
-- Runs transactionally (default) so the dedup + reparent + index build are
-- all-or-nothing. Index builds are plain (not CONCURRENTLY) because they
-- must run after the dedup in the same transaction; at deploy time the
-- brief write lock on these tables is acceptable.

-- Composite index for the hot listing/cron path. Nearly every query filters
-- on launch_status plus a scheduled_launch_date range (home today/yesterday/
-- month, winners, category, the launch-window cron).
CREATE INDEX IF NOT EXISTS project_status_date_idx
  ON project (launch_status, scheduled_launch_date);
--> statement-breakpoint

-- Owner lookups (dashboard, quota recount, admin).
CREATE INDEX IF NOT EXISTS project_created_by_idx
  ON project (created_by);
--> statement-breakpoint

-- Plain btree on fuma_comments.page so the per-project comment-count join on
-- every listing query can use an index instead of scanning the table.
CREATE INDEX IF NOT EXISTS fuma_comments_page_idx
  ON fuma_comments (page);
--> statement-breakpoint

-- Dedup existing bot comments (keep the earliest per page+author) so the
-- partial unique index below can be created without a violation. Before
-- deleting a duplicate, REPARENT any real-user interactions attached to it
-- onto the kept comment so replies/ratings aren't orphaned:

-- 1. Reparent replies (fuma_comments.thread -> kept comment id).
WITH keep AS (
  SELECT page, author, MIN(id) AS keep_id
  FROM fuma_comments
  WHERE author LIKE 'bot-user-%'
  GROUP BY page, author
  HAVING COUNT(*) > 1
),
dups AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM fuma_comments c
  JOIN keep k ON c.page = k.page AND c.author = k.author
  WHERE c.id <> k.keep_id
)
UPDATE fuma_comments r
SET thread = d.keep_id
FROM dups d
WHERE r.thread = d.dup_id;
--> statement-breakpoint

-- 2. Reparent ratings (fuma_rates.comment_id -> kept comment id). Move at
--    most ONE rating per (user_id, keep_id): if a user rated several
--    duplicates in the same group we pick the lowest dup id and move only
--    that one (the rest are dropped in step 3), otherwise moving multiple
--    rows to the same (user_id, keep_id) PK would abort the migration. Also
--    skip when the user already rated the kept comment directly.
WITH keep AS (
  SELECT page, author, MIN(id) AS keep_id
  FROM fuma_comments
  WHERE author LIKE 'bot-user-%'
  GROUP BY page, author
  HAVING COUNT(*) > 1
),
dups AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM fuma_comments c
  JOIN keep k ON c.page = k.page AND c.author = k.author
  WHERE c.id <> k.keep_id
),
pick AS (
  SELECT d.keep_id, fr.user_id, MIN(fr.comment_id) AS move_comment_id
  FROM fuma_rates fr
  JOIN dups d ON fr.comment_id = d.dup_id
  GROUP BY d.keep_id, fr.user_id
)
UPDATE fuma_rates fr
SET comment_id = p.keep_id
FROM pick p
WHERE fr.user_id = p.user_id
  AND fr.comment_id = p.move_comment_id
  AND NOT EXISTS (
    SELECT 1 FROM fuma_rates x
    WHERE x.comment_id = p.keep_id AND x.user_id = p.user_id
  );
--> statement-breakpoint

-- 3. Drop any leftover ratings still pointing at duplicates (the colliding
--    ones from step 2 — the user already has an equivalent rate on the kept
--    comment, so nothing of value is lost).
WITH keep AS (
  SELECT page, author, MIN(id) AS keep_id
  FROM fuma_comments
  WHERE author LIKE 'bot-user-%'
  GROUP BY page, author
  HAVING COUNT(*) > 1
),
dups AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM fuma_comments c
  JOIN keep k ON c.page = k.page AND c.author = k.author
  WHERE c.id <> k.keep_id
)
DELETE FROM fuma_rates fr
USING dups d
WHERE fr.comment_id = d.dup_id;
--> statement-breakpoint

-- 4. Finally delete the duplicate bot comments themselves.
WITH keep AS (
  SELECT page, author, MIN(id) AS keep_id
  FROM fuma_comments
  WHERE author LIKE 'bot-user-%'
  GROUP BY page, author
  HAVING COUNT(*) > 1
),
dups AS (
  SELECT c.id AS dup_id, k.keep_id
  FROM fuma_comments c
  JOIN keep k ON c.page = k.page AND c.author = k.author
  WHERE c.id <> k.keep_id
)
DELETE FROM fuma_comments c
USING dups d
WHERE c.id = d.dup_id;
--> statement-breakpoint

-- One comment per bot per project. Scoped to bot authors so cron retries /
-- overlapping runs can't post duplicate bot comments, while real users are
-- free to post multiple comments on the same project.
CREATE UNIQUE INDEX IF NOT EXISTS fuma_comments_bot_page_author_uniq
  ON fuma_comments (page, author)
  WHERE author LIKE 'bot-user-%';
