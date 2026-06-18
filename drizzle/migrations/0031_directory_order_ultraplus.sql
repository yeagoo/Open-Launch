-- Allow the new one-time `ultraPlus` directory tier.
--
-- The directory pricing redesign adds a fifth tier (Ultra Plus, $25.99,
-- one-time). The directory_order.tier CHECK constraint from 0021 only
-- permits basic/plus/pro/ultra, so a paid Ultra Plus order would fail to
-- insert/update. Widen the allowed set.
--
-- Idempotent: drop the existing named constraint (no-op if already gone)
-- and re-add it with ultraPlus included.

ALTER TABLE "directory_order" DROP CONSTRAINT IF EXISTS "directory_order_tier_check";

ALTER TABLE "directory_order"
  ADD CONSTRAINT "directory_order_tier_check"
  CHECK ("tier" IN ('basic', 'plus', 'pro', 'ultra', 'ultraPlus'));
