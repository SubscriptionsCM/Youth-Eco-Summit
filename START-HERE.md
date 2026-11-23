# Youth Eco Summit developer package

> **Current status — 23 November 2026:** this repository now contains the native application deployed to the dedicated Youth Eco Summit VPS. The current live application code is `fd2d3098d61f34bbe78f4913da4975d2563f7768`. Read the [current VPS handover](docs/live-vps-handover-2026-11-23.md) and [native VPS runbook](docs/native-vps-migration.md) before working on it.

Production uses Next.js, a separate Node.js 22 worker, PostgreSQL 18 and private filesystem storage. It does not use a WordPress/PHP/MySQL runtime or Supabase. Email continues through the existing Hostinger Premium mail-only transport. Credentials, exports, private uploads and backup archives stay outside this public repository.

Use Node.js 22 and `npm ci` for a local checkout, with a separate local database and file storage. Existing production data and configuration must be preserved; do not run seed, owner bootstrap, historical import or snapshot-restore commands on the live system. A documentation-only commit after the live application revision does not require redeployment.

## Historical package description — 4 November 2026

The notes below describe the older supplied package and are retained as history. Claims about WordPress being live, a pending migration, missing project access and historical deadlines are not current deployment instructions.

Prepared 4 November 2026 from the local project. Read the handoff DOCX or Markdown at the root first; it supersedes older status notes.

- this app directory: complete Next.js and PostgreSQL application source, public images and PDFs, twelve migrations, dependency lockfile, tests, setup/build/worker scripts and custom WordPress source.
- `app/wordpress/yes-native-portal`: current local portal source, version 1.4.1, including singular Student labels for individual entries.
- `app/wordpress/yes-registration-email`: independent branded email implementation, version 1.1.0; provider activation must be checked with the owner.
- `wordpress-reference/`: historical production snapshot captured on 9 October 2026 before the 1.4.1 label patch. This is a reference, not a fresh server backup. It includes the generated theme frontend and fifteen safe form definitions.
- `SHA256SUMS.txt`: per-file checksums. From this directory run `shasum -a 256 -c SHA256SUMS.txt`.
- `PACKAGE-MANIFEST.json`: inventory, versions, verification and exclusions.

The public website at https://youthecosummit.com uses Hostinger and WordPress. The separate Next.js backend is not the current live registration store. No GitHub remote, Vercel project or Supabase project is configured in the local source. The app uses pg directly, not Payload CMS.

For a frontend preview, enter this app directory, use Node.js 22, run `npm ci` and `npm run dev -- --port 3010`. Leave DATABASE_URL unset for this frontend-only path. For PostgreSQL, worker and local capture/storage setup, follow the new handoff and `app/docs/local-integration.md`.

Fresh checks on 4 November: TypeScript passed; all 192 unit tests passed across 22 files. Historical deployment tests are dated separately in the handoff. No production deployment, database migration or new real-provider delivery test was performed for this package.

Production credentials, .env.local, participant records, private uploads, database backups, local access files, proof screenshots, node_modules and generated Next.js builds are excluded. Install dependencies with npm ci. Third-party WordPress plugins and live/private data require a separately authorized migration.

Preserve the 5 November 2026 11:59 p.m. IST student/competition cutoff, lifetime school profiles, per-student contacts and current data. Reconcile the actual server before deployment. Do not restore an old database over incoming registrations or blindly rebuild the historic WordPress export.

The generated theme frontend is stored once at `../wordpress-reference/themes/yes-frontend-theme/frontend`. The current source in this directory may contain later changes. Refer to the root handoff before rebuilding or deploying.
