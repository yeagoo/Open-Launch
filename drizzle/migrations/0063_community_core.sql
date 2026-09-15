-- Additive Phase 2 schema. No existing product comments are imported.
CREATE TABLE community_thread (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id text REFERENCES "user"(id) ON DELETE SET NULL,
 type text NOT NULL CHECK (type IN ('Shipped','Learning','Question','Milestone','Todo')),
 project_id text REFERENCES project(id) ON DELETE SET NULL,
 title text CHECK (char_length(title) <= 160),
 body text NOT NULL CHECK (char_length(body) <= 10000),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published','deleted')),
 moderation text NOT NULL DEFAULT 'public' CHECK (moderation IN ('public','pending','hidden')),
 locked_at timestamptz(3), pinned_until timestamptz(3),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
 reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
 request_key varchar(100), request_hash varchar(64),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 published_at timestamptz(3),
 CHECK (lifecycle = 'draft' OR (published_at IS NOT NULL AND char_length(btrim(body)) > 0)),
 CHECK ((request_key IS NULL) = (request_hash IS NULL))
);
CREATE UNIQUE INDEX community_thread_draft_owner_idx ON community_thread(author_id) WHERE lifecycle = 'draft';
CREATE UNIQUE INDEX community_thread_request_idx ON community_thread(author_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX community_thread_public_date_idx ON community_thread(published_at DESC,id DESC) WHERE lifecycle='published' AND moderation='public';
CREATE INDEX community_thread_public_type_date_idx ON community_thread(type,published_at DESC,id DESC) WHERE lifecycle='published' AND moderation='public';
CREATE INDEX community_thread_author_date_idx ON community_thread(author_id,created_at DESC,id DESC);
CREATE INDEX community_thread_project_idx ON community_thread(project_id);
--> statement-breakpoint
CREATE TABLE community_reply (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 thread_id uuid NOT NULL REFERENCES community_thread(id) ON DELETE CASCADE,
 author_id text REFERENCES "user"(id) ON DELETE SET NULL,
 parent_id uuid,
 body text NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 4000),
 moderation text NOT NULL DEFAULT 'public' CHECK (moderation IN ('public','pending','hidden')),
 deleted_at timestamptz(3),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 request_key varchar(100) NOT NULL, request_hash varchar(64) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (thread_id,id),
 FOREIGN KEY (thread_id,parent_id) REFERENCES community_reply(thread_id,id),
 UNIQUE (author_id,thread_id,request_key),
 CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX community_reply_thread_date_idx ON community_reply(thread_id,created_at,id);
CREATE INDEX community_reply_parent_idx ON community_reply(thread_id,parent_id);
CREATE INDEX community_reply_author_idx ON community_reply(author_id);
CREATE TABLE community_thread_vote (
 thread_id uuid NOT NULL REFERENCES community_thread(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 PRIMARY KEY(thread_id,user_id)
);
CREATE INDEX community_thread_vote_user_idx ON community_thread_vote(user_id);
CREATE TABLE community_bookmark (
 thread_id uuid NOT NULL REFERENCES community_thread(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 PRIMARY KEY(thread_id,user_id)
);
CREATE INDEX community_bookmark_user_idx ON community_bookmark(user_id,thread_id);
--> statement-breakpoint
CREATE TABLE community_report (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id text REFERENCES "user"(id) ON DELETE SET NULL,
 thread_id uuid REFERENCES community_thread(id) ON DELETE CASCADE,
 reply_id uuid REFERENCES community_reply(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (char_length(btrim(reason)) > 0 AND char_length(reason) <= 1000),
 content_snapshot text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
 resolver_id text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(), resolved_at timestamptz(3),
 CHECK ((thread_id IS NOT NULL)::integer + (reply_id IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX community_report_thread_reporter_idx ON community_report(thread_id,reporter_id) WHERE thread_id IS NOT NULL;
CREATE UNIQUE INDEX community_report_reply_reporter_idx ON community_report(reply_id,reporter_id) WHERE reply_id IS NOT NULL;
CREATE INDEX community_report_status_date_idx ON community_report(status,created_at,id);
CREATE INDEX community_report_reporter_idx ON community_report(reporter_id);
CREATE INDEX community_report_resolver_idx ON community_report(resolver_id);
CREATE TABLE community_moderation_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 thread_id uuid REFERENCES community_thread(id) ON DELETE SET NULL,
 reply_id uuid REFERENCES community_reply(id) ON DELETE SET NULL,
 action text NOT NULL, reason text NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX community_moderation_thread_idx ON community_moderation_event(thread_id,created_at);
CREATE INDEX community_moderation_reply_idx ON community_moderation_event(reply_id);
CREATE INDEX community_moderation_actor_idx ON community_moderation_event(actor_id);
CREATE TABLE community_feed_snapshot (
 id text PRIMARY KEY,
 thread_ids uuid[] NOT NULL CHECK (cardinality(thread_ids) <= 2000),
 expires_at timestamptz(3) NOT NULL
);
CREATE INDEX community_feed_snapshot_expiry_idx ON community_feed_snapshot(expires_at);
--> statement-breakpoint
-- Counter triggers also cover cascaded vote deletion when an account is removed.
CREATE FUNCTION community_vote_counter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN UPDATE community_thread SET vote_count=vote_count+1 WHERE id=NEW.thread_id;
 ELSE UPDATE community_thread SET vote_count=vote_count-1 WHERE id=OLD.thread_id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER community_vote_count AFTER INSERT OR DELETE ON community_thread_vote FOR EACH ROW EXECUTE FUNCTION community_vote_counter();
CREATE FUNCTION community_reply_counter() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta integer := 0;
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL AND OLD.moderation='public' THEN delta:=delta-1; END IF;
 IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND NEW.moderation='public' THEN delta:=delta+1; END IF;
 IF delta <> 0 THEN UPDATE community_thread SET reply_count=reply_count+delta WHERE id=COALESCE(NEW.thread_id,OLD.thread_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER community_reply_count AFTER INSERT OR UPDATE OR DELETE ON community_reply FOR EACH ROW EXECUTE FUNCTION community_reply_counter();
-- Replies are immutable in identity and limited to one level under a root reply.
CREATE FUNCTION community_reply_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.thread_id IS DISTINCT FROM OLD.thread_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
   RAISE EXCEPTION 'reply parent identity is immutable' USING ERRCODE='check_violation';
 END IF;
 IF NEW.parent_id IS NOT NULL AND EXISTS (SELECT 1 FROM community_reply WHERE id=NEW.parent_id AND parent_id IS NOT NULL) THEN
   RAISE EXCEPTION 'only one reply nesting level is supported' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_reply_parent_check BEFORE INSERT OR UPDATE ON community_reply FOR EACH ROW EXECUTE FUNCTION community_reply_parent_guard();
CREATE FUNCTION community_remove_private_drafts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN DELETE FROM community_thread WHERE author_id=OLD.id AND lifecycle='draft'; RETURN OLD; END $$;
CREATE TRIGGER community_user_delete_drafts BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION community_remove_private_drafts();
-- Audit content cannot be edited/deleted; FK-driven anonymization is allowed.
CREATE FUNCTION community_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'community audit is append-only' USING ERRCODE='check_violation'; END IF;
 IF (to_jsonb(NEW)-'actor_id'-'thread_id'-'reply_id') IS DISTINCT FROM (to_jsonb(OLD)-'actor_id'-'thread_id'-'reply_id')
    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND (NEW.actor_id IS NOT NULL OR EXISTS (SELECT 1 FROM "user" WHERE id=OLD.actor_id)))
    OR (NEW.thread_id IS DISTINCT FROM OLD.thread_id AND (NEW.thread_id IS NOT NULL OR EXISTS (SELECT 1 FROM community_thread WHERE id=OLD.thread_id)))
    OR (NEW.reply_id IS DISTINCT FROM OLD.reply_id AND (NEW.reply_id IS NOT NULL OR EXISTS (SELECT 1 FROM community_reply WHERE id=OLD.reply_id))) THEN
   RAISE EXCEPTION 'community audit is append-only' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_audit_immutable BEFORE UPDATE OR DELETE ON community_moderation_event FOR EACH ROW EXECUTE FUNCTION community_audit_immutable();
