-- A proven WordPress account is independent of archived records and provider email.
CREATE TABLE wordpress_account_identities (
 source text NOT NULL,
 source_user_id text NOT NULL CHECK (source_user_id ~ '^[1-9][0-9]{0,19}$'),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 credential_fingerprint text NOT NULL CHECK (credential_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (source,source_user_id)
);
ALTER TABLE wordpress_account_identities ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION wordpress_account_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source IS DISTINCT FROM OLD.source OR NEW.source_user_id IS DISTINCT FROM OLD.source_user_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
  RAISE EXCEPTION 'WordPress account identity cannot be reassigned';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER wordpress_account_identity_changes BEFORE UPDATE ON wordpress_account_identities
FOR EACH ROW EXECUTE FUNCTION wordpress_account_identity_immutable();

-- Passwords and plaintext verification codes never enter this table.
CREATE TABLE wordpress_registration_challenges (
 id uuid PRIMARY KEY,
 browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
 form_key text NOT NULL CHECK (form_key IN ('student','teacher')),
 recipient text NOT NULL,
 username text NOT NULL,
 registration_nonce uuid NOT NULL,
 code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (browser_hash,form_key)
);
ALTER TABLE wordpress_registration_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX wordpress_registration_recipient_rate ON wordpress_registration_challenges(recipient,updated_at);

-- Override Supabase default privileges. Only the private database role may use these.
REVOKE ALL ON TABLE wordpress_account_identities,wordpress_registration_challenges FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  EXECUTE 'REVOKE ALL ON TABLE wordpress_account_identities,wordpress_registration_challenges FROM anon';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  EXECUTE 'REVOKE ALL ON TABLE wordpress_account_identities,wordpress_registration_challenges FROM authenticated';
 END IF;
END;
$$;
