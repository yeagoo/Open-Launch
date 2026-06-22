-- Register the monthly blog-recap generator in the in-app dispatcher. Runs at
-- 09:00 UTC on the 1st of each month; surfaced in /admin/cron-runs. It writes a
-- DRAFT recap (status='draft', unlisted) from real launch data for human review
-- — it never auto-publishes. Idempotent via ON CONFLICT.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/generate-blog-recap',
  'Generate blog recap (draft)',
  '0 9 1 * *',
  true,
  60000,
  'Writes a DRAFT monthly launch-recap blog post from real launch data (DeepSeek prose). Human reviews and publishes via scripts/publish-blog.ts.'
) ON CONFLICT ("path") DO NOTHING;
