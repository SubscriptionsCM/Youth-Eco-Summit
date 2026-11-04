-- Explicit immutable links. Archived roles never become application roles.
CREATE TABLE wordpress_school_links (
 record_id uuid PRIMARY KEY REFERENCES wordpress_records(id),
 school_id uuid NOT NULL REFERENCES schools(id),
 source_checksum text NOT NULL CHECK(source_checksum ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wordpress_user_links (
 record_id uuid PRIMARY KEY REFERENCES wordpress_records(id),
 user_id uuid NOT NULL REFERENCES users(id),
 auth_user_id uuid NOT NULL REFERENCES supabase_identities(auth_user_id),
 source_checksum text NOT NULL CHECK(source_checksum ~ '^[a-f0-9]{64}$'),
 linked_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wordpress_user_links_user ON wordpress_user_links(user_id);
ALTER TABLE wordpress_school_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE wordpress_user_links ENABLE ROW LEVEL SECURITY;
