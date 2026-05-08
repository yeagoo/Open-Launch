-- Track DeepSeek calls so the admin can see token spend over time and
-- catch runaway crons before they pile up costs.
CREATE TABLE IF NOT EXISTS "ai_usage_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "function_name" text NOT NULL,
  "model" text NOT NULL,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "ai_usage_created_at_idx" ON "ai_usage_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_usage_function_name_idx" ON "ai_usage_log" ("function_name");
