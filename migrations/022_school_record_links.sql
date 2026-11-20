CREATE TABLE school_record_links (
 source text NOT NULL CHECK(source IN ('portal','wordpress')),
 record_id uuid NOT NULL,
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 source_checksum text NOT NULL CHECK(source_checksum ~ '^[a-f0-9]{64}$'),
 active boolean NOT NULL DEFAULT true,
 lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version >= 0),
 linked_by uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source, record_id)
);
CREATE INDEX school_record_links_school ON school_record_links(school_id);

CREATE TABLE school_record_link_history (
 id uuid PRIMARY KEY,
 source text NOT NULL,
 record_id uuid NOT NULL,
 before_snapshot jsonb,
 after_snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source,record_id) REFERENCES school_record_links(source,record_id) ON DELETE CASCADE
);
CREATE INDEX school_record_link_history_record ON school_record_link_history(source,record_id);

CREATE FUNCTION deny_school_record_link_history_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
  RETURN NULL;
 END IF;
 RAISE EXCEPTION 'School record link history is append-only';
END;
$$;
CREATE TRIGGER school_record_link_history_append_only
 BEFORE UPDATE OR DELETE OR TRUNCATE ON school_record_link_history
 FOR EACH STATEMENT EXECUTE FUNCTION deny_school_record_link_history_changes();

ALTER TABLE school_record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_record_link_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON school_record_links, school_record_link_history FROM PUBLIC;
REVOKE ALL ON FUNCTION deny_school_record_link_history_changes() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON school_record_links, school_record_link_history FROM anon;
  REVOKE ALL ON FUNCTION deny_school_record_link_history_changes() FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON school_record_links, school_record_link_history FROM authenticated;
  REVOKE ALL ON FUNCTION deny_school_record_link_history_changes() FROM authenticated;
 END IF;
END $$;
