-- Run after all numbered migrations, before opening the public app.
-- No existing bucket is overwritten; a public bucket must be reviewed separately.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='yes-private' AND public) THEN
  RAISE EXCEPTION 'The existing yes-private bucket is public. Refusing to reuse it.';
 END IF;
END $$;
INSERT INTO storage.buckets(id,name,public) VALUES('yes-private','yes-private',false)
 ON CONFLICT(id) DO NOTHING;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='supabase_identity_auth_user') THEN
  ALTER TABLE public.supabase_identities ADD CONSTRAINT supabase_identity_auth_user
   FOREIGN KEY(auth_user_id) REFERENCES auth.users(id);
 END IF;
END $$;
-- No anon/authenticated storage policies are added. Server-only storage keys and
-- short-lived URLs are issued only after the app checks record ownership.
COMMIT;
