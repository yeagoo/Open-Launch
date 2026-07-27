-- Keep financial records when a project is deleted.
--
-- directory_order + launch_syndication are financial/fulfilment records:
-- deleting a project must not cascade-delete payment history (refund
-- disputes, reconciliation). Switch both project_id FKs to ON DELETE SET
-- NULL. The application code treats a null project_id as "project deleted
-- after purchase": the syndication drain flips such rows to the terminal
-- 'orphaned' status and the order surfaces in the admin queue.
--
-- Also widens the launch_syndication.status CHECK with:
--   'sending'  — claimed by a worker tick before the HTTP push (claim guard
--                against overlapping ticks double-posting to partner sites)
--   'orphaned' — terminal, project deleted before delivery
--
-- Constraint names: the FKs were created inline in 0021/0026, so PostgreSQL
-- auto-named them `<table>_<column>_fkey`. DROP CONSTRAINT IF EXISTS covers
-- both the PG default and the drizzle-kit `_fk` style just in case.

ALTER TABLE "directory_order"
  ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "directory_order" DROP CONSTRAINT IF EXISTS "directory_order_project_id_fkey";
ALTER TABLE "directory_order" DROP CONSTRAINT IF EXISTS "directory_order_project_id_project_id_fk";
ALTER TABLE "directory_order"
  ADD CONSTRAINT "directory_order_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL;

ALTER TABLE "launch_syndication"
  ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "launch_syndication" DROP CONSTRAINT IF EXISTS "launch_syndication_project_id_fkey";
ALTER TABLE "launch_syndication" DROP CONSTRAINT IF EXISTS "launch_syndication_project_id_project_id_fk";
ALTER TABLE "launch_syndication"
  ADD CONSTRAINT "launch_syndication_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL;

ALTER TABLE "launch_syndication" DROP CONSTRAINT IF EXISTS "launch_syndication_status_check";
ALTER TABLE "launch_syndication"
  ADD CONSTRAINT "launch_syndication_status_check"
  CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'orphaned'));
