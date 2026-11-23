# Live VPS handover — 23 November 2026

## Current application

The public website is [youthecosummit.com](https://youthecosummit.com). Production runs on the dedicated Youth Eco Summit VPS (`189.72.159.54`), using Next.js, a separate Node.js 22 worker, local PostgreSQL 18 and private filesystem storage. WordPress, PHP, MySQL and Supabase are not runtime dependencies. Historical import names and legacy scripts remain as provenance and migration tooling.

Email uses the existing Hostinger Premium account through the restricted, mail-only `hsendmail` SSH transport. Keep that hosting plan and SSH service active. Do not replace mail/DNS settings while updating the application.

Live changes include role-specific student, educator, school, judge and staff access; review of unmatched imported account types; school nominations; clearer account-type sign-in; an inline Contact Us form and readable inbox; custom CMS review rounds; Rudhraksh's Developer display label with existing Owner authorization; and the animated sidebar with one expanded section at a time.

## Source and deployed releases

The application code deployed on 21 November is `fd2d3098d61f34bbe78f4913da4975d2563f7768`. Later handover-only commits can follow this revision without requiring a production rebuild.

- Web: `/srv/youth-eco-summit/releases/20261121-accordion-fd2d309/runtime`
- Worker: `/srv/youth-eco-summit/releases/20261121-nomination-a04c39e/runtime`
- Protected environment: `/srv/youth-eco-summit/config/runtime.env`
- Restricted email configuration: `/srv/youth-eco-summit/config/hostinger-mail/`

Read the actual service working directories before maintenance; a newer release may have been installed:

```sh
systemctl show youth-eco-summit-web -p WorkingDirectory --value
systemctl show youth-eco-summit-worker -p WorkingDirectory --value
```

Compactum is not the production host. Its old migration/build/QA workspace was archived and removed on 22 November, freeing approximately 27.48 GB. A temporary Git synchronization checkout may be created there separately.

## Development and deployment

Use Node.js 22, the committed lockfile and `npm ci`. Configure an isolated local PostgreSQL database, private file storage and captured delivery; use `.env.example` as a template together with the native settings in the [VPS runbook](native-vps-migration.md). Never copy production credentials or private data into a development checkout or this public repository.

Run `npm run typecheck`, `npm test` and `npm run build` for application changes. The tracked [GitHub workflow](../.github/workflows/validate.yml) validates on push/PR and packages a credential-free standalone artifact on push. It does not deploy to the VPS. Repository files alone do not establish whether an external hosting integration exists.

Preserve the existing runtime environment, database, uploaded files, mail transport and worker during a web update. Build a fresh release, verify it before promotion and retain the previous release for application rollback. Do not seed or reinitialize production, rerun owner bootstrap or historical imports/backfills, or restore a pre-migration dump over records accepted after cutover. The synchronization order in the migration runbook documents the completed migration; it is not a routine update procedure.

## Backups and verification

Current PostgreSQL logical backups are under `/var/backups/youth-eco-summit/postgresql/`, with 14-day retention. The private migration recovery archive is now on the dedicated VPS at:

```text
/var/backups/youth-eco-summit/migration-archive-20261122/compactum-migration-20261122.tar.gz
```

That archive is 23,419,912,154 bytes, with SHA-256 `2be4b90664ef0632a18fc57a9a4e17ad10bcbd9b0d4ec00ca1877bb262ed0ec5`. Sender/receiver checksums, all 149,874 archive entries and full gzip integrity passed before the Compactum copies were removed. It includes original private exports, stopped QA recovery data and a complete application Git bundle. Keep it root-only and out of GitHub. Restore into a separate review directory first. This archive shares the production VPS and does not cover complete loss of that VPS.

For the deployed revision, focused unit/UI checks, TypeScript and the production build passed on 21 November. Isolated HTTP and desktop/390 px Chromium checks covered the recent account, contact, judging and navigation changes; physical Safari was not tested. Homepage, health and native configuration checks passed after the 22 November backup relocation. This handover update is not a fresh full production audit.
