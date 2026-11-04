CREATE TABLE registration_drafts (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('school','student','teacher')),
 scope text NOT NULL DEFAULT 'new',
 payload jsonb NOT NULL DEFAULT '{}',
 current_step integer NOT NULL DEFAULT 0 CHECK(current_step BETWEEN 0 AND 3),
 lock_version integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','completed','discarded')),
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX registration_draft_owner ON registration_drafts(owner_id,kind,scope,updated_at DESC) WHERE state='draft';

CREATE TABLE teacher_registrations (
 id uuid PRIMARY KEY,
 reference text NOT NULL UNIQUE,
 user_id uuid NOT NULL REFERENCES users(id),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 name text NOT NULL,
 role text NOT NULL,
 email text NOT NULL,
 phone text NOT NULL,
 subject text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
 review_note text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,school_id)
);
