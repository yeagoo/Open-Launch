-- Add source_locale to project (default 'en' covers all existing rows)
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "source_locale" text NOT NULL DEFAULT 'en';

-- Per-locale translations of project description
CREATE TABLE IF NOT EXISTS "project_translation" (
  "project_id" text NOT NULL,
  "locale" text NOT NULL,
  "description" text NOT NULL,
  "is_source" boolean NOT NULL DEFAULT false,
  "ai_generated" boolean NOT NULL DEFAULT false,
  "generated_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_translation_pkey" PRIMARY KEY ("project_id", "locale")
);

DO $$ BEGIN
  ALTER TABLE "project_translation"
    ADD CONSTRAINT "project_translation_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "project_translation_project_id_idx"
  ON "project_translation" ("project_id");
CREATE INDEX IF NOT EXISTS "project_translation_locale_idx"
  ON "project_translation" ("locale");
