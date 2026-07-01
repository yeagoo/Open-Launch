-- Register the Skill-driven free directory publication worker.
-- Drains due skill_publication rows under the global free-channel throttle,
-- performs canary re-checks, retries with exponential backoff, and promotes
-- completed submissions.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/skill-publish',
  'Skill free directory publisher',
  '*/2 * * * *',
  true,
  60000,
  'Publishes free Skill submissions under the global 10/day throttle; handles canary AI re-checks, retries, completion, and takedown.'
) ON CONFLICT ("path") DO NOTHING;
