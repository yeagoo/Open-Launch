CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "metadata" json,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_user_id_fk"
    FOREIGN KEY ("admin_user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_user_id_idx" ON "admin_audit_log" ("admin_user_id");
CREATE INDEX IF NOT EXISTS "admin_audit_log_action_idx" ON "admin_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx" ON "admin_audit_log" ("created_at");
