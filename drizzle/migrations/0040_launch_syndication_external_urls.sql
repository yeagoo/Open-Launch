-- The toolso target is a gateway that fans out to its own network and returns
-- MANY published URLs; we previously kept only the first in external_url. Store
-- the full list (JSON-encoded string array) so the buyer's "listing is live"
-- email can include every published URL, not just one. Standalone sites store a
-- single-element array. Nullable: pre-existing rows fall back to external_url.
ALTER TABLE "launch_syndication" ADD COLUMN IF NOT EXISTS "external_urls" text;
