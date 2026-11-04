-- Never persist recovery access tokens, codes or passwords. This nonce only
-- identifies the attempt that may clear the fail-closed local recovery lock.
ALTER TABLE supabase_identities ADD COLUMN recovery_nonce uuid;
