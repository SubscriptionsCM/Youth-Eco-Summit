CREATE UNIQUE INDEX users_contact_normalized ON users(lower(contact));

CREATE TABLE native_participant_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 username text NOT NULL CHECK (char_length(username) BETWEEN 1 AND 60),
 verified_contact text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX native_participant_username ON native_participant_accounts(lower(username));

CREATE TABLE native_participant_challenges (
 id uuid PRIMARY KEY,
 purpose text NOT NULL CHECK (purpose IN ('signup','recovery')),
 browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
 form_key text NOT NULL DEFAULT '' CHECK (form_key IN ('','student','teacher')),
 identifier text NOT NULL,
 recipient text NOT NULL,
 username text NOT NULL DEFAULT '',
 user_id uuid REFERENCES users(id),
 code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 UNIQUE(browser_hash,purpose,form_key)
);
CREATE INDEX native_participant_challenge_recipient ON native_participant_challenges(purpose,recipient,updated_at);
ALTER TABLE native_participant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_participant_challenges ENABLE ROW LEVEL SECURITY;

-- A provider transition must not leave a previously authorized participant cookie usable.
UPDATE users SET auth_version=auth_version+1 WHERE role='participant';
UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL
 AND user_id IN (SELECT id FROM users WHERE role='participant');

CREATE OR REPLACE FUNCTION auth_invalidate_changed_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active IS DISTINCT FROM OLD.active OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.contact IS DISTINCT FROM OLD.contact OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
    OR NEW.totp_secret IS DISTINCT FROM OLD.totp_secret THEN
  NEW.auth_version := GREATEST(NEW.auth_version, OLD.auth_version + 1);
 END IF;
 RETURN NEW;
END;
$$;
