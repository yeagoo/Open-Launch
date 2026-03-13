-- Add unique constraint on project.website_url
-- First remove any exact duplicate website_url rows (keep the earliest created_at)
DELETE FROM "project" p1
USING "project" p2
WHERE p1.created_at > p2.created_at
  AND p1.website_url = p2.website_url;
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_website_url_unique" UNIQUE("website_url");
