-- Persist the buyer's email + name on directory_order so the
-- syndicate-launches cron can email the buyer the published partner URLs once
-- the order is fully delivered. Both are captured from the Stripe checkout
-- session at payment time (previously only used transiently in the webhook).
-- Nullable: pre-existing rows, and sessions without customer_details, stay NULL
-- and are simply not emailed.
ALTER TABLE "directory_order" ADD COLUMN IF NOT EXISTS "buyer_email" text;
ALTER TABLE "directory_order" ADD COLUMN IF NOT EXISTS "buyer_name" text;
