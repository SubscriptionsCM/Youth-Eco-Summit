-- QC metadata is independent of immutable submissions and judging scores.
CREATE TABLE submission_quality (
 source text NOT NULL CHECK(source IN ('portal','wordpress')), record_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','needs_attention')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=4000), checked_checksum text NOT NULL DEFAULT '',
 lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version>=0), updated_by uuid REFERENCES users(id),
 completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source,record_id)
);
CREATE TABLE submission_quality_history (
 id uuid PRIMARY KEY, source text NOT NULL, record_id uuid NOT NULL, snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(source,record_id) REFERENCES submission_quality(source,record_id)
);
CREATE TABLE submission_category_coordinators (
 form_key text PRIMARY KEY, coordinator text NOT NULL CHECK(length(coordinator)<=200),
 lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version>=0),
 updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE submission_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_quality_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_category_coordinators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON submission_quality,submission_quality_history,submission_category_coordinators FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON submission_quality,submission_quality_history,submission_category_coordinators FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON submission_quality,submission_quality_history,submission_category_coordinators FROM authenticated; END IF;
END $$;
