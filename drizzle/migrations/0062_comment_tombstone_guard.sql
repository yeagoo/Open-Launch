-- A moderator hide is a tombstone, not a reversible visibility flag. The
-- application write path already predicates its UPDATE on hidden_at IS NULL;
-- this trigger preserves that invariant if a future adapter bypasses it.

CREATE OR REPLACE FUNCTION prevent_hidden_comment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.hidden_at IS NOT NULL THEN
    -- PostgreSQL's json type has no equality operator; normalize both
    -- documents to jsonb before comparing their semantic values.
    IF to_jsonb(NEW.content) IS DISTINCT FROM to_jsonb(OLD.content)
       OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
       OR NEW.hidden_by IS DISTINCT FROM OLD.hidden_by THEN
      RAISE EXCEPTION 'moderated comments are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fuma_comments_prevent_hidden_mutation ON fuma_comments;

CREATE TRIGGER fuma_comments_prevent_hidden_mutation
BEFORE UPDATE OF content, hidden_at, hidden_by ON fuma_comments
FOR EACH ROW
EXECUTE FUNCTION prevent_hidden_comment_mutation();
