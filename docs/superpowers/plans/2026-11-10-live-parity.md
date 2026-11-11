# Live parity verification and remediation plan

## Goal

Test the Hostinger application against the current WordPress website, correct confirmed discrepancies, and record any workflow that remains unverified or blocked.

## Authorized choices

The user selected private Hostinger file storage with metadata in Supabase and authorized test email to `subscriptions@compactummedia.com`. Published WordPress content and current source behavior are authoritative. Existing production records and source files must be preserved.

## Architecture

The Next.js application continues to use server-mediated Supabase data access. A provider-neutral object-store interface retains the existing S3 implementation and adds private filesystem objects outside the web root. Multipart transfer uses short-lived scoped signatures, bounded streaming and immutable publication. Download handlers retain current record ownership checks. Malware and media verification remain required before files are available.

WordPress account compatibility needs current source identity verification and source-ID ownership. Existing staff roles confer no new application privileges. Existing provider confirmation and recovery checks must be preserved.

## Independent tasks

- [x] Capture the current public route inventory on both sites.
- [x] Check first-party links, static assets, anchors and linked PDFs.
- [x] Confirm the active WordPress deadline from server-side validation.
- [x] Correct deadline configuration, UI copy and server validation with boundary regressions.
- [x] Make runtime-gated form/dashboard pages evaluate the configured mode at request time.
- [x] Route configured email account sign-in through the existing account component while retaining SMS and staff MFA behavior.
- [x] Implement and test private filesystem multipart storage, immutable objects, pinned reads and signed transfer claims.
- [x] Integrate storage with ordinary uploads, reference forms, historical imports and authorized downloads.
- [ ] Configure real malware/media verification and durable worker execution on Hostinger.
- [ ] Transfer the historical attachment archive into the new private store and verify hashes, sizes and idempotent readback.
- [ ] Verify actual account migration, signup, verification, recovery, draft save/resume, final submission, notifications and staff access with authorized test accounts.
- [ ] Rebuild through GitHub Actions and deploy the verified bundle over SSH.
- [ ] Repeat public browser/API tests and reconcile test-only records without touching existing records.
- [ ] Save the final pass/fail/blocked report with evidence and pending requirements.

## Verification boundaries

HTTP 200 and a passing unit suite do not establish completion of a form workflow. Static HTML inventories do not establish the state of a client-rendered form. Tests must exercise the normal public UI/API, persistent records, permissions, worker verification and resulting receipts or messages. Test-only data must be uniquely identifiable. Passwords, credentials, OTPs and private draft capabilities must be excluded from reports and Git.

## Current evidence

The read-only baseline covers 29 routes on each site, 410 first-party linked targets and seven matching PDF pairs. The new educator registration page is blocked by missing legal-content configuration, while WordPress renders its Forminator flow. The active WordPress server enforces the 15 November deadline. The new runtime currently has reference forms disabled and email accounts unconfigured.

## Execution

Use systematic debugging, test-driven changes and fresh verification before deployment. Independent reviewers own nonoverlapping deadline, account-navigation and storage-foundation files. The primary agent integrates API routes, runtime configuration, migration, production tests and the final report.

## Verification checkpoint — 11 November 2026

The full local suite passed 398 tests with two explicitly skipped cases. Subsequent focused checks passed 27 tests, covering the current-source delta builder, terminal file-verification feedback, runtime contact entry and entry catalogue. PHP lint and native WordPress notification rendering passed. These are implementation checks; normal production account creation, message delivery, uploads and staff access still require acceptance after deployment.

The original snapshot has 3,670 records and 425 immutable attachments (1,529,147,267 bytes), all retained with matching size and SHA-256. A read-only current source capture at 2026-11-11T03:47:55Z contains 3,942 records and 579 attachments with zero exporter issues. Incremental reconciliation is pending. Changed existing source identities must be reported and preserved, never silently replaced.

The WordPress account and native mail bridges remain private server-side dependencies. An authorized plain WordPress delivery test reached subscriptions@compactummedia.com; native workflow delivery to other source recipients has not been authorized. Full malware signatures and a clean PDF scan passed on Hostinger. Positive-detection acceptance remains under investigation.
