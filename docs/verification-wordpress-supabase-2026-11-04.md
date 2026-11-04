# WordPress / Supabase preparation — verification

Date: 4 November 2026. This is local preparation and rehearsal, not a production migration/deployment certificate.

## Source and preservation

- Original app retained in a Git baseline, on `migration/wordpress-supabase`; original migrations 001–012 unchanged.
- Fresh SSH read-only inventory: WordPress 6.9.11; portal 1.4.1; 39 Forminator definitions; 217 users. No live form submissions, participant edits, account changes, DNS changes or purchases were performed.
- Private consistent export: 3,670 source records, of which 3,413 are entries, plus 425 attachments totalling 1,529,147,267 bytes. Export reported zero unresolved attachment references.
- Portable manifest matched SHA256 `6f3efadbbc4fbe4d7c36bdcbc7f5d2867dee66974ef0ca77de0eda8d1932c611` after download.
- Every downloaded attachment matched its manifest size and SHA256 (`wordpress:migrate --offline`).
- Separate current public school directory: 125 records with canonical IDs and aliases. SHA256 `eb4523e15311b960731155aa9f78fc2e5c006a6050fc775cf6260dfaad0ba4e7`. Stored privately alongside the export, with a supplemental school-record import envelope.
- A wider engine inventory found 2,081 historical Elementor submissions. The supplemental read-only snapshot contains 2,091 records, including their values/action logs, inactive Formidable definitions and E2PDF certificate metadata. Source checks found zero orphan Elementor values/action logs and zero Formidable submission entries. The supplemental manifest SHA256 is `fbcd82c02a1d54e2395a7c1b0a56db4f90045988d76622e585d49b59f7fc93f2`. Total preserved historical submission entries across the two snapshots: 5,494. The source remains open, so a final delta is required.
- Seven files in the supplied historical WordPress reference were already missing: 905 of 912 manifest entries matched. None of those reference files or the original package manifest were altered.

## Isolated PostgreSQL rehearsal

`npm run wordpress:rehearse -- .local/wp/export.json` completed against an isolated PGlite PostgreSQL fixture:

| Check | Result |
| --- | --- |
| Dry run | 3,670 ready, zero inserts |
| First import | 3,670 records inserted; 425 verified attachment relationships |
| Identical retry | Zero inserts; 3,670 unchanged |
| Readback | 3,670 records and 425 attachments match |
| Integrity issues | Zero |

The fixture was closed after verification. Private reports remain in `.local/migration-reports/`. No Supabase objects or production database rows were written by this rehearsal. Account/record projection and ownership reconciliation are still required before cutover.

The supplemental legacy-engine snapshot also passed offline validation and a separate isolated rehearsal: 2,091 inserts, zero inserts on retry, 2,091 matching records on readback and zero integrity issues. The 125-school supplement passed offline schema/count validation. These remain separate snapshots, not an assertion that live WordPress stopped receiving data.

## Application checks

The initial supplied suite passed 190 tests with 2 skipped. Added targeted checks cover current form identities/conditions, role contacts, teams, cutoff, secret/consent pruning, source retries/conflicts, attachment verification, private draft ownership, Supabase participant-only identity mapping, RLS/browser role denial and upload completion recovery.

The independent review found whitespace-only required input and a storage-complete/database-failure retry gap. Both were reproduced with failing tests and corrected. A further regression checks that opening and immediately saving a competition link retains its declared role/mode.

Windows sandbox temporary-file rename restrictions required a workspace-local test cache. The default Turbopack build hit Windows junction permissions; the Webpack production build is the supported local fallback. Production HTTP smoke checks returned 200 for `/`, `/competitions/enter`, `/forms/student`, `/schools/nominate` and `/api/forms/config`. The configuration endpoint correctly reported registration/database/email-account switches disabled/unconfigured without secrets.

Final verification: TypeScript passed; the full suite passed 214 tests with 2 skipped across 28 files; `npm run build -- --webpack` exited successfully and generated all routes. The two review regressions passed after failing before their fixes. Browser automation was unavailable, so visual/mobile fidelity and real-provider round trips remain unverified.

The two skipped cases require installed Poppler (`pdftotext`) and FFmpeg (`ffprobe`): actual PDF text extraction and raster-dimension inspection. Install and exercise those on the worker host before upload acceptance; the successful unit suite does not substitute for those media checks.

## Continuation: cloud setup and operational migration

The user completed Git Credential Manager authorization as SubscriptionsCM. Local Git published `migration/wordpress-supabase` to the requested repository without force; only `.env.example` is tracked among environment files. The GitHub integration itself still rejects writes. Vercel's authenticated CLI created and linked project `youth-eco-summit` (`prj_c7unyvJ3XerwdvzYPfW5aXKI8A13`) in team `team_n88muyNIr5bmUaP4XCrOyeiK`; its connector continued to return403. Vercel Git linking returned400/admin-or-write-required even after the repository had a published branch, so that separate GitHub authorization remains pending.

The user created Supabase project `doxvdfmsjqnhqdzugnmt` in Singapore. A dashboard SQL preflight returned zero public application tables. A guarded schema transaction applied numbered migrations001–015, browser-role security and private-bucket bootstrap; SQL readback returned15 applied migrations. This does not establish that any historical data has reached Supabase. Further security readback and provider configuration are pending because the browser connection became unreliable and no database/service credentials were supplied.

Added operational school projection and explicit owner-approved historical-user links. A local rehearsal of the actual public directory created125 schools and83 aliases; all208 identifiers resolved through public search, a retry inserted zero duplicates and all125 source payloads passed hash readback. Reports remain private. Projection tests cover atomic rollback, preserved target corrections/inactive status and canonical/alias conflicts across batches and origins.

Historical-entry and attachment reads require a matching verified participant, an explicit source-user link and agreeing same-origin stable owner IDs. Source roles are retained only as metadata. Password, IP and hidden metadata are filtered from participant responses. Password recovery now commits local session revocation before provider mutation and keeps uncertain attempts blocked for support reconciliation. Overlapping recovery attempts cannot supersede a pending request. Independent review found no remaining P1/P2 issues after these fixes.

Targeted verification observed21 projection tests,15 recovery/identity tests and4 history route tests passing. Earlier staff-auth/recovery regression checks passed26 tests before the final pending-attempt policy adjustment. A later UI worker failed to start; no assertion failure was reported. The desktop homepage rendered with zero broken images. Full responsive, provider and production browser acceptance remains pending.

Final code verification for commit `46935c13b8da6fcf8e803f2b7e11cf931ba783ec`: [GitHub CI run41803939953](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/41803939953) passed dependency installation, TypeScript, all32 test files (252 passed,2 skipped) and the production build. The Linux test run took66.17seconds. The local Webpack production build also exited0 and generated the history route. The duplicate local full test run was stopped after CI passed; Windows worker startup was unreliable on a machine with about513MB free RAM.

Vercel deployment `dpl_7SFR6mU7WVofrth4WKWnK14SPjfD` reached Ready at https://youth-eco-summit-cdc50lwj8-rudhraksh-s-projects.vercel.app, with alias https://youth-eco-summit.vercel.app. Vercel assigned this first deployment to the new project's production environment automatically; it remains protected by Vercel Authentication. The WordPress custom domain was not changed. Registration remains disabled and the database/provider credentials are not configured. `SUBSCRIPTION_CONTACT_EMAIL=subscriptions@compactummedia.com` was created for preview and production without overwriting existing values.

Authenticated `vercel curl` smoke checks passed for the deployed homepage (expected title, hero and competition link) and `/api/forms/config` (`enabled:false`, `configured:false`, `emailAccounts:false`). Deployment Protection was retained. These checks do not substitute for real form, database, upload or delivery acceptance.

## Supabase snapshot import and SSL verification

The user supplied the pooler credentials privately and chose to remain on Supabase Free. The client verifies both the CA chain and hostname using Supabase's official Root 2021 CA. Its SHA256 certificate fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, obtained from the download URL used by Supabase's official dashboard source. No certificate verification was disabled.

Cloud readback confirmed 15 matching migration checksums, RLS enabled on all 50 application tables, zero grants to browser roles, and `yes-private` remaining private. After the user enabled SSL enforcement, a fresh verified connection also returned `pg_stat_ssl.ssl=true` for the pooler-to-Postgres connection.

The snapshot's database records are now imported into project `doxvdfmsjqnhqdzugnmt`:

| Record kind | Verified rows |
| --- | ---: |
| Historical entries | 5,494 |
| Archived users | 217 |
| Form definitions | 42 |
| Options/configuration | 6 |
| Source posts | 2 |
| School identity evidence | 125 |
| Total | 5,886 |

All original payload hashes matched independent cloud readback. Repeating the import inserted zero duplicates. The batched import was reviewed before execution and tested locally for preview-only behavior, retry idempotence, source conflicts and rollback after a later SQL batch failed. It did not overwrite existing data. Private reports are `.local/migration-reports/cloud-records-1793787960783.json` and the separate verification report `.local/migration-reports/cloud-records-1793788120498.json`.

The operational directory contains 125 schools and 83 aliases. All 208 identifiers resolved through the application's directory query; repeat projection created zero additional rows. Archived users have not been auto-created as active accounts: the operational user table remains empty, pending verified ownership and staff setup.

All 425 attachment objects, totalling 1,529,147,267 bytes, remain deferred because the user selected Free. Their original source and private export are preserved; zero attachment objects have been migrated. A final WordPress delta is still required because the source remained live after the snapshots.

Vercel now has the transaction-pooler URL, CA certificate and application session secret configured as sensitive variables for preview and production, with verified TLS enabled and a small connection pool. Protected preview `dpl_5xEmi8wghoC8RVKy3SZFcC7j1Vdk` reached Ready at https://youth-eco-summit-g5p48p2pd-rudhraksh-s-projects.vercel.app. Its form config reports `configured:true`, `enabled:false`, `emailAccounts:false`; provider/form acceptance is still required.

After SSL enforcement, an authenticated request to the deployed `/api/public/schools` returned 125 total schools and 25 records on its first page. The response contained no phone or email contact fields. The existing production alias is a separate deployment; the connected preview is the review target for this configuration.

An actual legacy school alias also resolved through the deployed endpoint to its expected canonical record. The Vercel project metadata still reports no linked Git repository; automatic Vercel builds require the separate GitHub app/repository connection to be completed.

## Acceptance gaps

- Authorize Vercel's GitHub integration and verify automatic builds; configure and test Supabase Auth/email delivery and staff ownership.
- Attachment transfer and 120 MB film uploads remain deferred under the user's Free-plan decision. No upgrade or purchase was made.
- Reconcile explicit historical account ownership, operational judging/domain records and the final WordPress delta.
- Verify real email/recovery delivery, current and historical notification/integration workflows, judging/domain projection, private uploads, worker/scanner hosting, backup restoration, load/mobile/accessibility checks and domain cutover.
- Registration remains disabled until staging acceptance. WordPress stays live and its existing data is retained.
