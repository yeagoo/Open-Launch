-- migrate: no-transaction
-- OPS NOTE: if a CONCURRENTLY build is interrupted (lock kill, dropped
-- connection), PostgreSQL leaves an INVALID index behind and IF NOT EXISTS
-- then SKIPS it on re-run. Before re-running after any failure:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- and DROP INDEX CONCURRENTLY any invalid index from this file first.
-- Index coverage for hot query paths (audit 2026-07). CREATE INDEX
-- CONCURRENTLY so this is safe to run against the live production table
-- without taking a write-blocking lock; must run outside a transaction,
-- hence the no-transaction directive + one statement per breakpoint.
--
--   user.is_bot            — simulate-engagement (2h) and import-producthunt
--                            (daily) both filter WHERE is_bot = true over the
--                            whole user table. Partial index: bots are a
--                            small minority, so the index stays tiny.
--   fuma_comments.thread   — reply fetching and the stale-rewrite NOT EXISTS
--                            correlated subquery in simulate-engagement.
--   project(status,created_at) — category/tag "recent" lists filter
--                            launch_status IN (ongoing, launched) and sort by
--                            created_at; the existing project_status_date_idx
--                            is on scheduled_launch_date and can't serve it.
--   directory_order.stripe_subscription_id — markUltraOrderCanceled looks
--                            orders up by subscription id on every
--                            subscription event. UNIQUE: two orders must
--                            never share a subscription. NULLs allowed
--                            (one-off orders have no subscription).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_is_bot_idx"
  ON "user" ("is_bot") WHERE "is_bot" = true;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "fuma_comments_thread_idx"
  ON "fuma_comments" ("thread");
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_status_created_idx"
  ON "project" ("launch_status", "created_at" DESC);
--> statement-breakpoint

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "directory_order_stripe_subscription_uniq"
  ON "directory_order" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
--> statement-breakpoint

-- Dead index: every project_translation read goes through the
-- (project_id, locale) primary key; a locale-only index only costs write
-- amplification.
DROP INDEX CONCURRENTLY IF EXISTS "project_translation_locale_idx";
