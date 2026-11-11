# Participant recovery correction

The existing recovery action mails a native WordPress link and provides no participant reset form on the new app. Replace that handoff while retaining WordPress's native reset-key generation, expiration, one-time validation, eligibility checks and password hooks.

1. Reproduce clickable-mail and reset completion failures with PHP and application regressions.
2. Build a private recovery adapter that overrides only the scoped native recovery message with an HTML anchor targeting the configured app origin. Keep key and login in the fragment, away from HTTP URLs and referrers. Restore mail hooks after the operation.
3. Validate native keys before and after a per-user advisory lock; run native password validation and reset functions. Preserve unrelated request state and reject invalid, expired, inactive, policy-blocked and competing resets.
4. Add a participant reset page which reads and removes fragment credentials, posts passwords only to the same-origin account API, requires confirmation and returns to sign-in. Keep staff recovery separate.
5. Revoke existing app sessions after a confirmed native change. Source credential fingerprints remain authoritative on every cookie read, including uncertain outcomes. Do not create or promote app users during reset.
6. Run focused and full CI checks, obtain independent review, deploy a verified standalone release with rollback retained, and test production mail to the authorized subscriptions mailbox. New passwords and reset links remain private; the user completes the actual password change.
