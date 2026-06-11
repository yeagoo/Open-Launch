-- Explicit "the paid amount matched the tier price" flag on directory orders.
--
-- Before this, an amount-mismatch order (Payment Link pointing at the wrong
-- Stripe price) was "held for review" only implicitly: stored as status='paid'
-- but skipped for syndication. That implicit hold leaked in two ways —
--   1. the syndication reconciler / sponsor sidebar both act on status='paid',
--      so a held order could still be cross-posted or shown as a sponsor;
--   2. nothing distinguished a held order from a clean paid one.
--
-- This column makes the hold explicit. The webhook sets it false on mismatch;
-- sponsors and the syndication worker both require amount_verified = true.
-- Existing rows default to true (they were never flagged as mismatched).

ALTER TABLE "directory_order"
  ADD COLUMN IF NOT EXISTS "amount_verified" boolean NOT NULL DEFAULT true;
