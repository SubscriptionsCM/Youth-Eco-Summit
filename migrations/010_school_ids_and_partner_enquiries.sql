-- All canonical and imported school IDs share one namespace. A school name is
-- never an identity key; two branches can retain separate school records.
CREATE TABLE school_identifiers (
 reference text PRIMARY KEY CHECK(reference=upper(trim(reference)) AND length(reference) BETWEEN 1 AND 100),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('canonical','imported')),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO school_identifiers(reference,school_id,kind) SELECT upper(trim(reference)),id,'canonical' FROM schools;
CREATE INDEX school_identifiers_school ON school_identifiers(school_id);
CREATE FUNCTION retain_school_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO school_identifiers(reference,school_id,kind) VALUES(upper(trim(NEW.reference)),NEW.id,'canonical')
 ON CONFLICT(reference) DO UPDATE SET kind='canonical' WHERE school_identifiers.school_id=EXCLUDED.school_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'School reference belongs to another school' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER school_identifier_registered AFTER INSERT OR UPDATE OF reference ON schools FOR EACH ROW EXECUTE FUNCTION retain_school_identifier();

CREATE TABLE partner_enquiries (
 id uuid PRIMARY KEY,
 submission_key uuid NOT NULL UNIQUE,
 request_fingerprint text NOT NULL,
 reference text NOT NULL UNIQUE,
 organization text NOT NULL,
 contact_name text NOT NULL,
 email text NOT NULL,
 phone text NOT NULL DEFAULT '',
 interest text NOT NULL CHECK(interest IN ('programme','resources','outreach','other')),
 message text NOT NULL,
 consent_wording text NOT NULL,
 privacy_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_enquiries_queue ON partner_enquiries(status,created_at);
CREATE INDEX partner_enquiries_contact ON partner_enquiries(email,created_at);
