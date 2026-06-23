-- Register the blog translation cron in the in-app dispatcher. Runs hourly;
-- fills missing/stale per-locale translations of published English articles
-- into blog_article_translation (a few article-locale pairs per run, so the
-- initial backfill spreads over several runs). Surfaced in /admin/cron-runs.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/translate-blog',
  'Translate blog articles',
  '0 * * * *',
  true,
  120000,
  'Translates published English blog articles into the other 7 locales (DeepSeek), storing results in blog_article_translation. A few pairs per run.'
) ON CONFLICT ("path") DO NOTHING;
