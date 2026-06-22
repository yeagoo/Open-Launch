-- Register the weekly "best <category> tools" roundup generator in the in-app
-- dispatcher. Runs Mondays 10:00 UTC; one uncovered category per run, written
-- as a DRAFT (status='draft', unlisted) from real listed products for human
-- review. Never auto-publishes. Surfaced in /admin/cron-runs. Idempotent.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/generate-blog-roundup',
  'Generate blog roundup (draft)',
  '0 10 * * 1',
  true,
  60000,
  'Writes a DRAFT "Best <category> tools" roundup from real listed products (DeepSeek prose), one uncovered category per run. Human reviews and publishes via scripts/publish-blog.ts.'
) ON CONFLICT ("path") DO NOTHING;
