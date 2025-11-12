-- 删除 user 表的 Premium 相关字段
ALTER TABLE "user" DROP COLUMN IF EXISTS "is_premium";
ALTER TABLE "user" DROP COLUMN IF EXISTS "premium_expires";

-- 注释：由于没有 Premium 用户，可以安全删除这些字段

