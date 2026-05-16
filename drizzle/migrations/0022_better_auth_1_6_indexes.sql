-- Better Auth 1.6 schema-generator output expects userId / identifier
-- indexes on session, account, verification. Our pre-1.6 schema didn't
-- declare them — auth still works, but every `getSession` /
-- account-lookup / verification-pickup turns into a Seq Scan once the
-- tables grow. Add the indexes the BA generator produced now so we
-- stay in lockstep with what 1.6+ assumes is there.
--
-- See: `bunx @better-auth/cli@latest generate -y --output /tmp/x.ts`
-- against better-auth 1.6.11 — the indexes appear inline on each table.
--
-- CONCURRENTLY would be the right choice on a hot prod table, but
-- drizzle-kit migrate runs each file in a single transaction and
-- CREATE INDEX CONCURRENTLY can't run inside one. Plain CREATE INDEX
-- is fine here: session and verification tables are sub-100k rows and
-- the lock window is short. If account grows past ~1M, redo manually
-- with CONCURRENTLY outside the migration runner.

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
