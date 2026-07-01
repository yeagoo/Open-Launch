-- Skill-driven free directory submission.
--
-- This is intentionally separate from the paid launch_syndication pipeline:
-- free submissions have their own API keys, domain verification, review state,
-- variants, and publication queue so they cannot destabilize paid fulfilment.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "skill_api_key" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "key_hash"      text NOT NULL,
  "key_prefix"    text NOT NULL,
  "label"         text NOT NULL,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "last_used_at"  timestamp,
  "revoked_at"    timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_api_key_hash_uniq"
  ON "skill_api_key" ("key_hash");

CREATE INDEX IF NOT EXISTS "skill_api_key_account_idx"
  ON "skill_api_key" ("account_id");

CREATE TABLE IF NOT EXISTS "verified_domain" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"   text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "domain"       text NOT NULL,
  "method"       text NOT NULL CHECK ("method" IN ('html', 'dns', 'meta')),
  "token"        text NOT NULL,
  "verified_at"  timestamp,
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "verified_domain_account_domain_uniq"
  ON "verified_domain" ("account_id", "domain");

CREATE TABLE IF NOT EXISTS "skill_submission" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"       text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "domain"           text NOT NULL,
  "website_url"      text NOT NULL,
  "status"           text NOT NULL DEFAULT 'pending_review'
                       CHECK ("status" IN ('pending_review', 'rejected', 'publishing', 'completed', 'paused', 'taken_down')),
  "review_score"     integer CHECK ("review_score" IS NULL OR ("review_score" >= 0 AND "review_score" <= 100)),
  "review_reason"    text,
  "locale"           text NOT NULL DEFAULT 'en',
  "tos_accepted_at"  timestamp,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "skill_submission_account_idx"
  ON "skill_submission" ("account_id", "created_at");

CREATE INDEX IF NOT EXISTS "skill_submission_status_idx"
  ON "skill_submission" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "skill_submission_variant" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id"  uuid NOT NULL REFERENCES "skill_submission"("id") ON DELETE CASCADE,
  "site"           text NOT NULL,
  "title"          text NOT NULL,
  "tagline"        text NOT NULL,
  "body_md"        text NOT NULL,
  "lang"           text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_submission_variant_submission_site_uniq"
  ON "skill_submission_variant" ("submission_id", "site");

CREATE TABLE IF NOT EXISTS "skill_publication" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id"    uuid NOT NULL REFERENCES "skill_submission"("id") ON DELETE CASCADE,
  "site"             text NOT NULL,
  "rel"              text NOT NULL DEFAULT 'nofollow' CHECK ("rel" IN ('nofollow')),
  "batch_day"        integer NOT NULL CHECK ("batch_day" >= 1),
  "scheduled_for"    date NOT NULL,
  "status"           text NOT NULL DEFAULT 'scheduled'
                       CHECK ("status" IN ('scheduled', 'sent', 'failed', 'unpublished')),
  "attempts"         integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "external_id"      text,
  "external_url"     text,
  "last_error"       text,
  "next_attempt_at"  timestamp,
  "sent_at"          timestamp,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_publication_submission_site_uniq"
  ON "skill_publication" ("submission_id", "site");

CREATE INDEX IF NOT EXISTS "skill_publication_status_scheduled_idx"
  ON "skill_publication" ("status", "scheduled_for");

CREATE INDEX IF NOT EXISTS "skill_publication_submission_idx"
  ON "skill_publication" ("submission_id");
