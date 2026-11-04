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

## External access and acceptance gaps

- GitHub origin is the requested repository. Connector metadata initially showed read-only access; a collaborator-permission read was also rejected by the integration. A local Git credential dry run is recorded separately. No force push is used.
- The local Git push dry run returned HTTP 403 for saved account `Sonam82`. Source remains local until the intended account is authorized.
- Vercel subscriptions@compactummedia.com connection can list the intended team but project creation returned HTTP 403. No project/deployment was created.
- Supabase was discovered as an available integration but has not been connected. No project, live tables, storage bucket or auth settings have been created there.
- Supabase Free caps individual files at 50 MB; the existing short-film rule allows 120 MB. A suitable plan/storage arrangement needs approval before payment or migration.
- Provider delivery, old-account recovery/linking, operational data projection, notification/integration workflows, worker/scan service, backup restoration, browser/load/production tests and domain cutover are outstanding. The new form switch remains disabled until staging acceptance.
