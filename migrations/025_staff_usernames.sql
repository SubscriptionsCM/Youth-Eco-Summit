ALTER TABLE users ADD COLUMN staff_username text;
ALTER TABLE users ADD CONSTRAINT users_staff_username_valid CHECK (
  staff_username IS NULL OR (
    role IN ('owner','admin','judge')
    AND staff_username ~ '^[a-z][a-z0-9._-]{2,59}$'
  )
);
CREATE UNIQUE INDEX users_staff_username_unique ON users(lower(staff_username)) WHERE staff_username IS NOT NULL;

ALTER TABLE auth_invitations ADD COLUMN staff_username text;
ALTER TABLE auth_invitations ADD CONSTRAINT auth_invitations_staff_username_valid CHECK (
  staff_username IS NULL OR staff_username ~ '^[a-z][a-z0-9._-]{2,59}$'
);
