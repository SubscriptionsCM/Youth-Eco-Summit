CREATE TABLE school_access_requests (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','revoked')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 decision_reason text CHECK(length(decision_reason) BETWEEN 3 AND 1000),
 decided_by uuid REFERENCES users(id),
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX school_access_one_live_request ON school_access_requests(user_id, school_id) WHERE status IN ('pending','approved');

CREATE TABLE school_student_corrections (
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('portal','wordpress')),
 record_id uuid NOT NULL,
 lock_version integer NOT NULL CHECK(lock_version >= 1),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 class_name text NOT NULL CHECK(length(class_name) <= 80),
 section text NOT NULL CHECK(length(section) <= 80),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 changed_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id, source, record_id, lock_version)
);

ALTER TABLE school_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_student_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON school_access_requests, school_student_corrections FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON school_access_requests, school_student_corrections FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON school_access_requests, school_student_corrections FROM authenticated;
 END IF;
END $$;
