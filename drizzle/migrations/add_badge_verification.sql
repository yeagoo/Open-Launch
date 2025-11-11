-- Add badge verification fields to project table
ALTER TABLE "project" 
ADD COLUMN IF NOT EXISTS "has_badge_verified" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "badge_verified_at" timestamp;

-- Create index for faster badge verification queries
CREATE INDEX IF NOT EXISTS "project_badge_verified_idx" ON "project" ("has_badge_verified", "scheduled_launch_date");

-- Add comment for documentation
COMMENT ON COLUMN "project"."has_badge_verified" IS 'Whether the project website has the aat.ee badge installed and verified';
COMMENT ON COLUMN "project"."badge_verified_at" IS 'Timestamp when the badge was successfully verified';

