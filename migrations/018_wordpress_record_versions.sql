-- Later source changes are retained separately; the original archive is preserved.
CREATE TABLE wordpress_record_versions (
 id uuid PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES wordpress_records(id),
 baseline_checksum text NOT NULL CHECK(baseline_checksum ~ '^[a-f0-9]{64}$'),
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 captured_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(record_id,checksum)
);
CREATE FUNCTION wordpress_record_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Retained source versions are immutable';
END;
$$;
CREATE TRIGGER wordpress_record_version_changes BEFORE UPDATE OR DELETE ON wordpress_record_versions
FOR EACH ROW EXECUTE FUNCTION wordpress_record_version_immutable();
ALTER TABLE wordpress_record_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wordpress_record_versions FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  EXECUTE 'REVOKE ALL ON TABLE wordpress_record_versions FROM anon';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  EXECUTE 'REVOKE ALL ON TABLE wordpress_record_versions FROM authenticated';
 END IF;
END;
$$;
