CREATE TABLE participation_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 deadline_date date NOT NULL,
 managed boolean NOT NULL DEFAULT false,
 lock_version integer NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
 updated_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO participation_settings(singleton,deadline_date) VALUES(true,'2026-11-30');
