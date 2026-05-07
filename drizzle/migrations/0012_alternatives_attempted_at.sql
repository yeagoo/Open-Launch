-- Track when generate-alternatives last attempted a project. Without this,
-- subjects whose pool is too small or whose AI prescreen returns nothing get
-- re-evaluated every 5 minutes forever, burning DeepSeek calls.
ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "alternatives_attempted_at" timestamp;
