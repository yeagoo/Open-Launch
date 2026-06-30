-- Shift DeepSeek-using cron jobs out of the DeepSeek peak-pricing windows.
--
-- DeepSeek adopts peak/off-peak pricing (~mid-July 2026): peak = 2x price, all
-- billing items, during Beijing 09:00-12:00 and 14:00-18:00. Beijing is UTC+8,
-- so in the UTC schedule the dispatcher uses, peak hours are:
--   Beijing 09:00-12:00 -> UTC 01:00-04:00  (UTC hours 1,2,3)
--   Beijing 14:00-18:00 -> UTC 06:00-10:00  (UTC hours 6,7,8,9)
-- Off-peak (allowed) UTC hours therefore = 0,4,5,10-23.
--
-- We only move jobs that actually call DeepSeek AND tolerate delay. NOT touched:
--   - /api/projects/auto-fill: user-realtime (not a cron), must stay responsive.
--   - update-launches / others: don't call DeepSeek.
-- The 4 high-frequency project-pipeline jobs (enrich/quality/relate/translate-
-- projects) fully pause during peak: a project stays visible immediately; only
-- its AI post-processing waits until peak ends (<=~4h). All schedules stay in
-- cron_schedule so they remain editable from /admin without a redeploy.

-- Project pipeline (every 5 min) — run only on off-peak hours.
UPDATE "cron_schedule" SET "cron_expression" = '*/5 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/enrich-projects';
UPDATE "cron_schedule" SET "cron_expression" = '*/5 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/quality-check-projects';
UPDATE "cron_schedule" SET "cron_expression" = '*/5 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/relate-projects';
UPDATE "cron_schedule" SET "cron_expression" = '*/5 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/translate-projects';

-- AI page generators — keep their minute offsets, restrict to off-peak hours.
UPDATE "cron_schedule" SET "cron_expression" = '5,35 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/generate-alternatives';
UPDATE "cron_schedule" SET "cron_expression" = '15,45 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/generate-comparisons';
UPDATE "cron_schedule" SET "cron_expression" = '0 0,4,5,10-23 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/translate-blog';

-- Tag moderation: was every 3h (0 */3); 5 off-peak runs/day is plenty.
UPDATE "cron_schedule" SET "cron_expression" = '0 0,12,15,18,21 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/moderate-tags';

-- Engagement sim: was every 2h (0 */2, hit peak 2/6/8). Off-peak 2h-ish grid.
-- Votes are distributed across the launch window, not tied to the run instant.
UPDATE "cron_schedule" SET "cron_expression" = '0 0,4,10,12,14,16,18,20,22 * * *', "updated_at" = now()
  WHERE "path" = '/api/cron/simulate-engagement';

-- Monthly blog recap draft: was 0 9 1 (Beijing 17:00, peak) -> UTC 00:00.
UPDATE "cron_schedule" SET "cron_expression" = '0 0 1 * *', "updated_at" = now()
  WHERE "path" = '/api/cron/generate-blog-recap';

-- Weekly blog roundup draft: was 0 10 Mon (Beijing 18:00, peak edge) -> UTC 12:00.
UPDATE "cron_schedule" SET "cron_expression" = '0 12 * * 1', "updated_at" = now()
  WHERE "path" = '/api/cron/generate-blog-roundup';
