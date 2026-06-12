-- Capture the expected Premium-launch price (in cents) on the project at
-- schedule time, so payment validation compares against the price that
-- applied when the checkout was created — not the live PREMIUM_PRICE
-- constant. This grandfathers in-flight Stripe sessions across a price
-- change instead of refunding them. Null for free/badge launches and for
-- historical rows (validation falls back to the constant for those).
ALTER TABLE project ADD COLUMN IF NOT EXISTS premium_price_cents integer;
--> statement-breakpoint

-- Backfill premium launches that are ALREADY mid-checkout (payment_pending)
-- when this ships, so their in-flight Stripe sessions are validated against
-- the current price (399¢ = $3.99) rather than the live constant. Without
-- this, the very release that later changes PREMIUM_PRICE would hold/refund
-- these existing sessions — exactly the case this column exists to prevent.
-- 399 is the current LAUNCH_SETTINGS.PREMIUM_PRICE in cents (constants can't
-- be referenced from SQL); update this literal if the price differs at deploy.
UPDATE project
SET premium_price_cents = 399
WHERE launch_type = 'premium'
  AND launch_status = 'payment_pending'
  AND premium_price_cents IS NULL;
