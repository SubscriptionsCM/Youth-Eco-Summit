# Native VPS migration

The application runs as Next.js and a background worker with local PostgreSQL. Participant accounts, passwords, verification, recovery, forms, judging and notification planning run in Node.js. Historical source names in PostgreSQL identify the provenance of imported records; they do not invoke WordPress. Private files remain on the VPS filesystem and require application authorization.

Email uses the existing Hostinger Premium hosting account's `hsendmail` transport. Nodemailer composes the MIME message, then a dedicated key restricted to the VPS IP and a forced mail-only command delivers it to Hostinger. No WordPress, PHP application, MySQL, mailbox purchase or email trial is involved. Keep the existing Hostinger hosting plan and SSH service active. The application key cannot open a shell, forward ports or read the hosting account's files.

## Release configuration

Set `AUTH_PARTICIPANT_PROVIDER=native`, `PORTAL_REFERENCE_FORMS=true`, `AUTH_DELIVERY_ENABLED=true`, `NEXT_PUBLIC_JUDGING_MODE=portal` at build and runtime, `APP_ORIGIN=https://youthecosummit.com`, local `DATABASE_URL`, `DATABASE_SSL=false`, `EMAIL_TRANSPORT=hostinger`, `SENDMAIL_PATH`, `MAIL_FROM`, `MAIL_TEMP_ROOT`, filesystem storage and the verification-tool paths. Remove WordPress and Supabase service settings. Store credentials only in the VPS's protected configuration directory.

Build with `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `node scripts/package-hostinger-worker.mjs`; copy `public` and `.next/static` into the standalone output. Next.js tracing excludes the legacy `wordpress` directory. Reject an artifact containing PHP files. The legacy packaging script name is retained, but the release contains no PHP bridge. Start separate web and worker services after the final synchronization.

## Data synchronization order

1. Preserve DNS, source PostgreSQL, legacy SQL and file backups. Rehearse all imports against the stopped staging application.
2. Stop source business writes and drain the source worker. Keep original source file paths intact until the final exports and attachment capture finish, because attachment identities include those paths. Then replace source routing with the temporary transport proxy for cached-DNS visitors.
3. Restore the final PostgreSQL snapshot before applying new migrations. Apply migration 023, then run the native legacy importer against a fresh, hash-verified source export. Preserve IDs, source associations, passwords, school references, historical versions and file checksums.
4. Review aggregate import counts and verify every referenced attachment. The importer refuses ambiguous identity claims. Supply `--staff-mappings=PRIVATE_REVIEWED.json` for the two explicitly reviewed administrator identities; native staff passwords, two-factor secrets and roles are preserved. Exact current snapshots retain changed source payloads and add verified school aliases without replacing immutable baselines. A legacy username/email collision is resolved by checking at most two password candidates and accepting exactly one match; recovery targets the verified email owner.
5. Configure native email, verify the existing Hostinger connection and perform an authorized delivery test. Preserve participation deadlines. Start exactly one production worker.
6. Change only website DNS A/AAAA records. Preserve MX, SPF, DKIM, DMARC, autodiscovery, nameservers and verification records. Check apex, www and new-host redirects, TLS, authentication, files and email after propagation.

Never restore the source database after accepting target production writes. Rehearsal accounts and capture mail belong only to the separate `yes_local_migration` database and must not enter production.

## Verification

The guarded QA runner is `scripts/verify-native-migration.ts`; browser coverage is `playwright.migration.config.ts`. It runs against an isolated PostgreSQL database, private files, real scanning tools and loopback SMTP capture. The test transport is rejected outside loopback and the exact isolated database. Test account addresses use `.test` domains. Real Hostinger delivery is a separate integration check with an authorized recipient.

Native notifications retain the source recipients, template variables, attachment policy and immutable delivery records. Deleted recipient email-field tags are omitted, matching the previous renderer; a message still requires a valid configured recipient. Unknown body variables, corrupt files and ambiguous delivery outcomes fail closed or enter operator review instead of silently resending.
