-- Directory listing orders. One row per Stripe purchase of a tier
-- (Basic / Plus / Pro / Ultra) for a single project URL. Plus / Pro
-- need manual fulfilment by admin after payment; Ultra is a
-- subscription so we also track the Stripe subscription id.

-- `gen_random_uuid()` is in core since PG 13; this guard makes the
-- migration safe on older clusters too.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "directory_order" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"              text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "tier"                    text NOT NULL CHECK ("tier" IN ('basic','plus','pro','ultra')),
  "url"                     text NOT NULL,                  -- snapshot of project.website_url at purchase time
  "locale"                  text,                           -- buyer's UI locale at checkout time, used to locale-route post-payment emails
  "status"                  text NOT NULL DEFAULT 'pending'
                              CHECK ("status" IN ('pending','paid','fulfilled','refunded','failed','canceled')),
  "amount_cents"            integer CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0),
  "currency"                text DEFAULT 'usd',
  "stripe_session_id"       text UNIQUE,                    -- checkout session id (one-off tiers)
  "stripe_subscription_id"  text,                           -- subscription id (Ultra)
  "stripe_customer_id"      text,
  "paid_at"                 timestamp,
  "fulfilled_at"            timestamp,
  "fulfilled_by"            text REFERENCES "user"("id") ON DELETE SET NULL,
  "admin_notes"             text,
  "created_at"              timestamp NOT NULL DEFAULT now(),
  "updated_at"              timestamp NOT NULL DEFAULT now()
);

-- Admin queue page filters by status; keep this index slim.
CREATE INDEX IF NOT EXISTS "directory_order_status_idx"
  ON "directory_order" ("status", "paid_at" DESC);

-- Lets the project detail / dashboard cheaply look up "what does
-- this project already own" without a status filter.
CREATE INDEX IF NOT EXISTS "directory_order_project_idx"
  ON "directory_order" ("project_id");
