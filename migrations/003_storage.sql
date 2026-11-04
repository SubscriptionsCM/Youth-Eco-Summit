CREATE TABLE assets (
 id uuid PRIMARY KEY,
 submission_id uuid NOT NULL REFERENCES submissions(id),
 revision integer NOT NULL CHECK (revision > 0),
 uploader_id uuid NOT NULL REFERENCES users(id),
 original_name text NOT NULL,
 storage_key text NOT NULL UNIQUE,
 mime_type text,
 byte_size bigint CHECK (byte_size > 0),
 checksum text,
 expected_size bigint NOT NULL CHECK (expected_size > 0),
 expected_checksum text NOT NULL CHECK (expected_checksum ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','processing','ready','quarantined','failed')),
 upload_id text,
 part_size bigint NOT NULL,
 storage_version text,
 storage_etag text,
 scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected','failed','dev_bypass')),
 scan_detail jsonb,
 error text,
 verified_at timestamptz,
 last_activity_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 trashed_at timestamptz,
 trashed_by uuid REFERENCES users(id),
 trash_reason text
);
CREATE INDEX assets_submission_revision ON assets(submission_id, revision) WHERE trashed_at IS NULL;
CREATE INDEX assets_processing ON assets(status, created_at) WHERE status <> 'ready';
