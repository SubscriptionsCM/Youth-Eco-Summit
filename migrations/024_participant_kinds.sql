ALTER TABLE users ADD COLUMN participant_kind text NOT NULL DEFAULT 'unclassified'
 CHECK (participant_kind IN ('student','educator','school','unclassified'));

ALTER TABLE native_participant_challenges
 DROP CONSTRAINT native_participant_challenges_form_key_check;
ALTER TABLE native_participant_challenges
 ADD CONSTRAINT native_participant_challenges_form_key_check
 CHECK (form_key IN ('','student','teacher','school'));

CREATE OR REPLACE FUNCTION auth_invalidate_changed_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active IS DISTINCT FROM OLD.active OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.contact IS DISTINCT FROM OLD.contact OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
    OR NEW.totp_secret IS DISTINCT FROM OLD.totp_secret OR NEW.participant_kind IS DISTINCT FROM OLD.participant_kind THEN
  NEW.auth_version := GREATEST(NEW.auth_version, OLD.auth_version + 1);
 END IF;
 RETURN NEW;
END;
$$;
