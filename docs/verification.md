# Local verification — 29 September 2026

- `npm test`: **110 tests passed across 10 files**. Migrations run against isolated embedded PostgreSQL databases; storage and delivery boundaries use controlled doubles.
- `npm run build`: **passed**, including TypeScript checking, route compilation and generation of 22 static pages with dynamic routes retained.
- `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=msedge`: **20 tests passed** using desktop and iPhone-sized mobile viewport emulation. Public, admin and judge views use controlled API fixtures; anonymous access and cross-origin rejection checks hit the actual API.

The code review found and the implementation corrected resubmission routing, jury prerequisite scoring rounds, and recovery of discarded draft files after submission. Regression tests cover explicit judge revocation, historical review preservation, minimum distinct reviewers in every prerequisite round, and recovery without changing submitted or published asset selections.

The local suite also covers OTP expiry/replay/rate limits, staff MFA and revocation, school registration and coordinator correction, school and guardian authorization, sibling identities, team invitations, edition snapshots, final-submit idempotency, content verification, authorized byte ranges, Trash/restore/purge failures, historical import idempotency, file repair, admin context, and separate publication consent and moderation.

On this Windows machine, low available memory initially caused database-fixture timeouts. Test workers now run serially with a bounded heap; closed WebAssembly fixtures release their references before the next fixture. All 110 tests subsequently passed. Production builds also use one page-generation worker to keep local memory use bounded.

These checks do not prove live SMS/email delivery, the chosen object provider's behavior, real PostgreSQL concurrency, realistic interrupted-video uploads, backup restoration, purge reconciliation after restore, or peak-load capacity. Complete the staging acceptance checks in the handoff and [release gates](requirements.md) after providers and approved programme inputs are available. Final visual design remains deferred; no deployment or live registration opening has been performed.
