ALTER TABLE import_rows ADD COLUMN preview_version uuid;
ALTER TABLE import_rows ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Stable source identifiers survive deletion to prevent silent resurrection on reruns.
CREATE TABLE import_student_identities (
  source text NOT NULL,
  source_student_id text NOT NULL,
  student_id uuid NOT NULL,
  PRIMARY KEY(source,source_student_id)
);

CREATE TABLE imported_submission_history (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  import_row_id uuid NOT NULL REFERENCES import_rows(id),
  original_reference text,
  original_state text NOT NULL,
  original_submitted_at timestamptz,
  retention_status text NOT NULL DEFAULT 'unverified' CHECK(retention_status IN ('unverified','missing','verified')),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE historical_file_refs (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','inaccessible','retained')),
  asset_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,source_url)
);
CREATE INDEX historical_file_repair_queue ON historical_file_refs(status,created_at);
