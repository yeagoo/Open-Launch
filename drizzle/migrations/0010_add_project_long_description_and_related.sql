-- Long-form AI-generated product descriptions, stored per-locale alongside short descriptions.
-- EN row is canonical (generated from Crawl4AI + DeepSeek); other locales translated from EN.
ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "long_description" text,
  ADD COLUMN IF NOT EXISTS "long_description_generated_at" timestamp;

-- Per-project related/alternative product list, picked by AI from candidate set.
CREATE TABLE IF NOT EXISTS "project_related" (
  "project_id" text NOT NULL,
  "related_project_id" text NOT NULL,
  "rank" integer NOT NULL,
  "generated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_related_pkey" PRIMARY KEY ("project_id", "related_project_id")
);

DO $$ BEGIN
  ALTER TABLE "project_related"
    ADD CONSTRAINT "project_related_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_related"
    ADD CONSTRAINT "project_related_related_project_id_project_id_fk"
    FOREIGN KEY ("related_project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "project_related_project_id_idx"
  ON "project_related" ("project_id");
