ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN totp_secret text;
ALTER TABLE users ADD COLUMN totp_last_counter bigint NOT NULL DEFAULT -1;
ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 0;

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  auth_version integer NOT NULL,
  mfa_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE auth_otps (
  contact text PRIMARY KEY,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE auth_rates (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  resets_at timestamptz NOT NULL
);
CREATE INDEX auth_rates_expiry ON auth_rates(resets_at);

CREATE TABLE auth_invitations (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  contact text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','judge')),
  totp_secret text NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE auth_recovery (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE contact_verifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  contact text NOT NULL,
  method text NOT NULL CHECK (method = 'sms_otp'),
  verified_at timestamptz NOT NULL DEFAULT now()
);

-- Invalidate old sessions even when an account is changed outside the normal API.
CREATE FUNCTION auth_invalidate_changed_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.totp_secret IS DISTINCT FROM OLD.totp_secret THEN
    NEW.auth_version := GREATEST(NEW.auth_version, OLD.auth_version + 1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER auth_account_changes BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION auth_invalidate_changed_account();
