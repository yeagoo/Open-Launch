-- Per-locale blog translations. English stays the canonical row in
-- blog_article; this table holds translated title/description/content for the
-- other locales (slug + locale = PK). The blog pages merge a translation over
-- the English row and fall back to English when a locale's row is missing.
-- Additive + queried only for non-English locales (guarded), so this doesn't
-- affect the English blog if applied after deploy.
CREATE TABLE IF NOT EXISTS "blog_article_translation" (
  "slug" text NOT NULL,
  "locale" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "content" text NOT NULL,
  "meta_title" text,
  "meta_description" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "blog_article_translation_slug_locale_pk" PRIMARY KEY ("slug", "locale")
);
