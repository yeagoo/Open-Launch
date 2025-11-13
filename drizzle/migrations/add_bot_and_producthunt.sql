-- 添加 bot 用户标识字段
ALTER TABLE "user" ADD COLUMN "is_bot" BOOLEAN DEFAULT FALSE;

-- 创建 ProductHunt 导入记录表
CREATE TABLE IF NOT EXISTS "product_hunt_import" (
  "id" TEXT PRIMARY KEY,
  "product_hunt_id" TEXT NOT NULL UNIQUE,
  "product_hunt_url" TEXT NOT NULL,
  "project_id" TEXT REFERENCES "project"("id") ON DELETE SET NULL,
  "votes_count" INTEGER,
  "rank" INTEGER,
  "imported_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "product_hunt_import_ph_id_idx" ON "product_hunt_import"("product_hunt_id");
CREATE INDEX IF NOT EXISTS "product_hunt_import_project_id_idx" ON "product_hunt_import"("project_id");

-- 创建 bot 用户（5个不同的 bot 账号用于模拟）
INSERT INTO "user" (
  "id",
  "name",
  "email",
  "email_verified",
  "created_at",
  "updated_at",
  "is_bot",
  "role"
) VALUES
  (
    'bot-user-ph-1',
    'TechHunter',
    'bot-ph-1@aat.ee',
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    'user'
  ),
  (
    'bot-user-ph-2',
    'ProductScout',
    'bot-ph-2@aat.ee',
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    'user'
  ),
  (
    'bot-user-ph-3',
    'LaunchTracker',
    'bot-ph-3@aat.ee',
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    'user'
  ),
  (
    'bot-user-ph-4',
    'StartupDigger',
    'bot-ph-4@aat.ee',
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    'user'
  ),
  (
    'bot-user-ph-5',
    'InnoFinder',
    'bot-ph-5@aat.ee',
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    'user'
  )
ON CONFLICT ("id") DO NOTHING;

