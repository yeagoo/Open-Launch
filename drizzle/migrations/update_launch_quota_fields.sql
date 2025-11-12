-- 更新 launch_quota 表：删除 premium_plus_count，添加 badge_count
ALTER TABLE launch_quota DROP COLUMN IF EXISTS premium_plus_count;
ALTER TABLE launch_quota ADD COLUMN IF NOT EXISTS badge_count INTEGER NOT NULL DEFAULT 0;

