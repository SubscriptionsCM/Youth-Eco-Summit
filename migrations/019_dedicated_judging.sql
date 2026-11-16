-- Additive judging layer: authoritative submissions and legacy judging stay intact.
CREATE TABLE judging_rounds (
 id uuid PRIMARY KEY, form_key text NOT NULL, edition text NOT NULL CHECK(length(edition) BETWEEN 1 AND 80),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 200), rubric jsonb NOT NULL,
 open boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE judging_assignments (
 id uuid PRIMARY KEY, round_id uuid NOT NULL REFERENCES judging_rounds(id), judge_id uuid NOT NULL REFERENCES users(id),
 portal_record_id uuid REFERENCES portal_form_records(id), wordpress_record_id uuid REFERENCES wordpress_records(id),
 snapshot jsonb NOT NULL, snapshot_checksum text NOT NULL CHECK(snapshot_checksum ~ '^[a-f0-9]{64}$'),
 source_checksum text NOT NULL CHECK(source_checksum ~ '^[a-f0-9]{64}$'),
 assigned_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
 active boolean NOT NULL DEFAULT true, revoked_at timestamptz, revoked_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((portal_record_id IS NOT NULL)::int+(wordpress_record_id IS NOT NULL)::int=1)
);
CREATE UNIQUE INDEX judging_native_assignment ON judging_assignments(round_id,judge_id,portal_record_id) WHERE portal_record_id IS NOT NULL;
CREATE UNIQUE INDEX judging_archive_assignment ON judging_assignments(round_id,judge_id,wordpress_record_id) WHERE wordpress_record_id IS NOT NULL;
CREATE INDEX judging_person_queue ON judging_assignments(judge_id,active,created_at);
CREATE TABLE judging_reviews (
 id uuid PRIMARY KEY, assignment_id uuid NOT NULL UNIQUE REFERENCES judging_assignments(id),
 scores jsonb NOT NULL DEFAULT '{}', deductions jsonb NOT NULL DEFAULT '[]',
 comment text NOT NULL DEFAULT '' CHECK(length(comment)<=10000), flag text NOT NULL DEFAULT '' CHECK(flag IN ('','conflict','unreadable','other')),
 total numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
 lock_version integer NOT NULL DEFAULT 1 CHECK(lock_version>=1), submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE judging_review_history (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES judging_reviews(id), snapshot jsonb NOT NULL,
 changed_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE judging_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE judging_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE judging_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE judging_review_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON judging_rounds,judging_assignments,judging_reviews,judging_review_history FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON judging_rounds,judging_assignments,judging_reviews,judging_review_history FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON judging_rounds,judging_assignments,judging_reviews,judging_review_history FROM authenticated;
 END IF;
END $$;
