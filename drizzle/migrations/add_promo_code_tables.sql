-- 创建优惠码表
CREATE TABLE IF NOT EXISTS "promo_code" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "discount_amount" numeric(10,2) NOT NULL DEFAULT 2.99,
  "usage_limit" integer,
  "used_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 创建优惠码使用记录表
CREATE TABLE IF NOT EXISTS "promo_code_usage" (
  "id" text PRIMARY KEY NOT NULL,
  "promo_code_id" text NOT NULL REFERENCES "promo_code"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "project"("id") ON DELETE SET NULL,
  "used_at" timestamp NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "promo_code_code_idx" ON "promo_code" ("code");
CREATE INDEX IF NOT EXISTS "promo_code_expires_at_idx" ON "promo_code" ("expires_at");
CREATE INDEX IF NOT EXISTS "promo_code_usage_user_id_idx" ON "promo_code_usage" ("user_id");
CREATE INDEX IF NOT EXISTS "promo_code_usage_promo_code_id_idx" ON "promo_code_usage" ("promo_code_id");

-- 添加注释
COMMENT ON TABLE "promo_code" IS '优惠码表';
COMMENT ON TABLE "promo_code_usage" IS '优惠码使用记录表';
COMMENT ON COLUMN "promo_code"."code" IS '优惠码字符串';
COMMENT ON COLUMN "promo_code"."discount_amount" IS '优惠金额（美元）';
COMMENT ON COLUMN "promo_code"."usage_limit" IS '使用次数限制（NULL表示无限制）';
COMMENT ON COLUMN "promo_code"."used_count" IS '已使用次数';
COMMENT ON COLUMN "promo_code"."expires_at" IS '过期时间';
COMMENT ON COLUMN "promo_code"."is_active" IS '是否激活';

