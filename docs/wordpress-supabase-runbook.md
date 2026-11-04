# WordPress migration and deployment runbook

Infrastructure contact: subscriptions@compactummedia.com. Repository: https://github.com/SubscriptionsCM/Youth-Eco-Summit.git. This runbook describes prepared code, not a completed production migration.

## Current evidence

The supplied app was preserved in a local Git baseline on branch `migration/wordpress-supabase`. Its original twelve migrations remain unchanged. A fresh read-only WordPress inspection on 4 November found WordPress 6.9.11, native portal 1.4.1, 39 published Forminator definitions and 217 users. WordPress is still receiving entries.

A consistent read-only export contains 3,670 raw source records: 3,413 entries (including historical forms and drafts), 217 users, 39 form definitions and the portal configuration. It includes 425 resolved attachments totalling 1,529,147,267 bytes. Original raw metadata, source IDs, consent and source timestamps are retained. Authentication session/application-password metadata is excluded deliberately; existing WordPress password hashes remain only in the private archive and are not usable Supabase credentials.

The private server export is `/home/u794443438/yes-migration-export-20261104-0438/`. Its original manifest SHA256 is `e7385326ff07ecf10efe599adf3d791d8c09787701f76fcd406e0b1ac479f359`. A portable copy at `/home/u794443438/yes-migration-portable-20261104-v3/` uses hashed, shorter attachment filenames and the same bytes; its manifest SHA256 is `6f3efadbbc4fbe4d7c36bdcbc7f5d2867dee66974ef0ca77de0eda8d1932c611`. Local private material is under ignored `.local/`; never commit or upload it to a public repository or build artifact.

A separate engine inventory also found Elementor's historical submission tables and inactive Formidable definitions. `scripts/export-wordpress-legacy.php` exported 2,091 additional records, including 2,081 Elementor submissions with their values/action logs, Formidable definitions and certificate-generation metadata. There were no Formidable entries or orphan Elementor values/action logs. Its private local snapshot is `.local/legacy/export.json`, also retained at `/home/u794443438/yes-migration-legacy-20261104/`; SHA256 `fbcd82c02a1d54e2395a7c1b0a56db4f90045988d76622e585d49b59f7fc93f2`. The two snapshots preserve 5,494 historical submission entries in total; incoming WordPress entries after either snapshot still need a delta reconciliation.

The package manifest had seven files missing before changes, all under the historical WordPress reference; 905 of the 912 listed files matched. The original manifest and reference remain unchanged. Browser access was unavailable in this session, so no visual fidelity or production browser acceptance is claimed.

## Code layout and feature switch

- `src/data/wordpress-forms.json`: sanitized public field definitions for all 39 live forms, shared school options, pagination and selected safe settings. It excludes private submissions, notifications, integrations and provider secrets. `scripts/sync-wordpress-reference.mjs` can regenerate it from an authorized private export.
- `src/domain/wordpress-forms.ts`: shared conditions/validation, inactive-contact pruning, integer team sizes, duplicate participant checks, class/topic/title validation and the confirmed cutoff.
- `src/components/reference-form.tsx`, `entry-journey.tsx`: reference field rendering, role-first challenge selection, school selection, private saved links, uploads and receipts.
- `migrations/013_wordpress_migration.sql`: additive raw source archive, attachment relationships, verified provider-identity mappings and portal draft/file tables.
- `src/server/wordpress-migration.ts`: dry-run, insert-only import, source conflict detection and counts/hash readback. It never overwrites existing source rows, creates staff accounts, grants participant access or merges identities by name.
- `src/server/supabase-auth.ts`: Supabase email/password signup/confirmation/sign-in, mapped to participant-only local sessions. Existing staff MFA remains separate.
- `src/server/portal-uploads.ts`: direct-to-private-storage multipart uploads and worker verification of bytes, MIME, scan result and guideline metadata.
- `.github/workflows/validate.yml`, `vercel.json`: CI validation and Next.js deployment configuration, with no secrets.

`PORTAL_REFERENCE_FORMS=false` is the safe default. Keep it disabled until the complete staging journey passes. Current registration routes switch to the new implementation only when enabled. The entry hub is `/competitions/enter`; all captured definitions can be inspected at `/forms/<key>`. The ten current competition keys match their published slugs. Legacy definitions use `legacy-<WordPress ID>`. Historical account forms explicitly refuse new submissions until their account/redirect workflows are reconciled; they must not silently create unrelated accounts.

School registration creates a pending lifetime school record and guards normalized branch identity with a unique constraint. Shared contact phone/email is not a school identity. Final competition and student/educator registration resolves the school reference on the server. Contact information for the inactive student/educator path and unused team rows is discarded. New drafts exclude passwords, verification codes and consent; the final revision retains confirmed consent and a form snapshot. Submitted revisions are locked and submission retries return the existing receipt.

## Set up Supabase

1. Connect the organization-owned account and create the intended project. No purchase is authorized. Choose a region appropriate for Indian users and place Vercel functions near the database.
2. Configure server-side secrets privately from `.env.example`. Use a verified TLS PostgreSQL connection and the dashboard CA certificate. Use the session pooler for migrations/worker; the Vercel runtime can use the transaction pooler. Never use a browser-public database/service key.
3. On the named new database, run `npm run db:migrate`. Apply `supabase/security.sql` and `supabase/bootstrap.sql` through the privileged migration connection. These scripts do not drop tables or overwrite buckets. Existing public `yes-private` buckets cause an explicit failure. Runtime browser roles have no application-table grants or permissive RLS policies; all operations pass through the authenticated API.
4. Create scoped private S3 credentials for Supabase Storage and set the existing `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET=yes-private`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `S3_FORCE_PATH_STYLE=true`. Set exact production/preview upload origins. Test S3 multipart support and short-lived downloads. The original S3 version-purge implementation must not be used against Supabase, which does not provide the same versioning API; keep purge disabled until a provider-specific lifecycle is reviewed.
5. Enable email confirmations, strong passwords and provider-side abuse limits. Configure an organization-owned SMTP sender. Confirmation emails must include `{{ .Token }}` for the prepared verification-code UI. Set `AUTH_PARTICIPANT_PROVIDER=supabase` only after delivery and confirmation are verified. Do not infer authorization or staff roles from editable provider metadata.
6. Host the separate Node worker with Poppler, FFmpeg, database/storage access and a real malware scanner. Vercel frontend functions do not replace this worker. Keep `STORAGE_DEV_SKIP_SCAN=false` in production.

Supabase Free's per-file ceiling is 50 MB, while the existing short-film rule permits 120 MB. The attachment archive is about 1.53 GB before future growth. Confirm a suitable approved plan/storage arrangement before migration; this work did not purchase or upgrade anything. See https://supabase.com/docs/guides/storage/uploads/file-limits.

## Rehearse and migrate

Obtain a final current export before cutover. The supplied export is a snapshot while the source remained open; incoming entries must be reconciled. The source site is not to be disabled or its database restored over newer records.

```sh
# Does not connect to Supabase or write database rows:
npm run wordpress:migrate -- .local/wp/export.json --offline

# Isolated local PostgreSQL (PGlite) rehearsal; no production writes:
npm run wordpress:rehearse -- .local/wp/export.json

# Preview against the configured target database; no row/file writes:
npm run wordpress:migrate -- .local/wp/export.json

# After target review, set WORDPRESS_MIGRATION_TARGET privately to the exact
# hostname of MIGRATION_DATABASE_URL (or DATABASE_URL), then:
npm run wordpress:migrate -- .local/wp/export.json --commit
npm run wordpress:migrate -- .local/wp/export.json --verify

# Preserve the other historical engines and public-school identity evidence too:
npm run wordpress:migrate -- .local/legacy/export.json
npm run wordpress:migrate -- .local/wp/schools-export.json
```

The commit command uploads objects with `x-upsert:false`, reads back every object and verifies size/SHA256 before committing database relationships. Retries check existing bytes; changed source records or attachment identities cause failure rather than overwrite. A failed SQL transaction may leave unreferenced private objects; retain and reconcile them rather than deleting unknown data. Reports are written to ignored `.local/migration-reports/` with no participant payloads.

The raw archive intentionally does not give imported accounts access to current records. Before production cutover, reconcile canonical school IDs and aliases (including `yes-native-portal/data/schools-2027.json`, a separate public directory file), map historical owners to verified Supabase identities, and project accepted submissions/drafts into the operational domain. Existing WordPress passwords/sessions cannot simply become Supabase sessions; implement a reviewed account recovery/linking path. Preserve source staff roles only as historical metadata until separately verified invitations/MFA are complete.

The current combined public school directory was captured separately: 125 records, stored privately at `.local/wp/school-directory.json`, SHA256 `eb4523e15311b960731155aa9f78fc2e5c006a6050fc775cf6260dfaad0ba4e7`. Its `.local/wp/schools-export.json` supplement passed offline validation and can be previewed/imported with the same migration CLI. It is separate from the 3,670-record snapshot count. Importing this supplement archives identity/alias evidence; it does not by itself project school rows into the operational directory.

## GitHub and Vercel

The selected repository was empty when inspected. The connected GitHub account `compactummedia` had read-only access; source push requires collaborator access or the SubscriptionsCM account connection. The local origin points to the supplied repository. Push a reviewed branch without force, and make the validation workflow a required check before merging.

A local Git dry run also returned HTTP 403: the machine's saved credential belongs to `Sonam82`, which cannot push this repository. Do not grant an unintended account access merely to bypass this. Use the intended SubscriptionsCM credential/connection or authorize the intended connected account.

The Vercel connection for subscriptions@compactummedia.com can list team `team_n88muyNIr5bmUaP4XCrOyeiK` (`rudhraksh-s-projects`), but project creation returned HTTP 403. No Vercel project was created. Once project creation is permitted, import the repository as a Next.js project. The app checkout is the repository root, so no `app` Root Directory override is needed. Use Node 24. Git integration supplies automatic preview/production builds; CI supplies tests. Store secrets in Vercel's environment settings with separate staging/production values. No database migration, seeding or participant import runs automatically during a build.

Keep the source domain on WordPress until provider delivery, account migration, directory aliases, uploads, worker processing, backups/restore and production smoke tests pass. Do not publish a frontend-only preview as a functioning registration replacement. Preserve existing proposal/minutes URLs when eventually changing routing.

## Acceptance still required

- Supabase access/project creation and target configuration; GitHub write access/push; Vercel project creation permission and deployment.
- Operational projection and verified ownership of historical accounts/records; imported school directory/aliases; delta snapshot reconciliation.
- Current and historical form redirects, account recovery, SMTP/SMS policy, notification recipients and external integrations. The safe schema export deliberately excludes private integration settings; generic submission persistence is not a substitute for those workflows.
- Provider-specific storage lifecycle, upload replacement/recovery, scanner/worker hosting, real email/SMS delivery and actual 120 MB uploads.
- Approved legal content and consent/account policy; owner review of the retained legacy forms.
- Visual/mobile/accessibility browser comparison, production end-to-end testing, backup restoration, load testing and final domain cutover.

Preserve the 5 November 2026, 11:59 p.m. IST student/competition deadline. School and educator registration remain separate from that cutoff. Never reopen entries implicitly during setup.
