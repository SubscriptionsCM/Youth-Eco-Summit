-- Additive source archive. Import never updates or grants access to domain records.
CREATE TABLE wordpress_records (
 id uuid PRIMARY KEY,
 source text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('user','entry','school','form','option','post')),
 source_id text NOT NULL,
 payload jsonb NOT NULL,
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,kind,source_id)
);
CREATE TABLE wordpress_attachments (
 id uuid PRIMARY KEY,
 source text NOT NULL,
 source_id text NOT NULL,
 entry_record_id uuid NOT NULL REFERENCES wordpress_records(id),
 filename text NOT NULL,
 mime_type text NOT NULL,
 byte_size bigint NOT NULL CHECK(byte_size>0),
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 storage_key text NOT NULL UNIQUE,
 verified_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,source_id)
);
CREATE TABLE supabase_identities (
 auth_user_id uuid PRIMARY KEY,
 user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 verified_contact text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE portal_form_records (
 id uuid PRIMARY KEY,
 form_key text NOT NULL,
 owner_id uuid REFERENCES users(id),
 draft_token_hash text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
 answers jsonb NOT NULL DEFAULT '{}',
 current_step integer NOT NULL DEFAULT 0 CHECK(current_step>=0),
 lock_version integer NOT NULL DEFAULT 0,
 school_id uuid REFERENCES schools(id),
 identity_key text,
 reference text NOT NULL UNIQUE,
 submitter_role text CHECK(submitter_role IN ('student','educator')),
 form_snapshot jsonb,
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz
);
CREATE INDEX portal_form_owner ON portal_form_records(owner_id,updated_at);
CREATE UNIQUE INDEX portal_school_identity ON portal_form_records(identity_key) WHERE form_key='school' AND status='submitted';
CREATE TABLE portal_form_files (
 id uuid PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES portal_form_records(id),
 field_id text NOT NULL,
 filename text NOT NULL,
 storage_key text NOT NULL UNIQUE,
 expected_size bigint NOT NULL CHECK(expected_size>0),
 expected_checksum text NOT NULL CHECK(expected_checksum ~ '^[a-f0-9]{64}$'),
 mime_type text,
 metadata jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded','ready','rejected')),
 upload_id text,
 part_size integer NOT NULL DEFAULT 5242880,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 UNIQUE(record_id,field_id)
);
-- Defence in depth when deployed on Supabase. Browser API roles receive no table
-- access; all reads/writes go through the authenticated application API.
ALTER TABLE wordpress_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE wordpress_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supabase_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_form_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_form_files ENABLE ROW LEVEL SECURITY;
