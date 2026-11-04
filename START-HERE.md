# Youth Eco Summit developer package

Prepared 4 November 2026 from the local project. Read the handoff DOCX or Markdown at the root first; it supersedes older status notes.

- this app directory: complete Next.js and PostgreSQL application source, public images and PDFs, twelve migrations, dependency lockfile, tests, setup/build/worker scripts and custom WordPress source.
- `app/wordpress/yes-native-portal`: current local portal source, version 1.4.1, including singular Student labels for individual entries.
- `app/wordpress/yes-registration-email`: independent branded email implementation, version 1.1.0; provider activation must be checked with the owner.
- `wordpress-reference/`: historical production snapshot captured on 9 October 2026 before the 1.4.1 label patch. This is a reference, not a fresh server backup. It includes the generated theme frontend and fifteen safe form definitions.
- `SHA256SUMS.txt`: per-file checksums. From this directory run `shasum -a 256 -c SHA256SUMS.txt`.
- `PACKAGE-MANIFEST.json`: inventory, versions, verification and exclusions.

The public website at https://youthecosummit.com uses Hostinger and WordPress. The separate Next.js backend is not the current live registration store. No GitHub remote, Vercel project or Supabase project is configured in the local source. The app uses pg directly, not Payload CMS.

For a frontend preview, enter this app directory, use Node.js 24 or newer, run `npm ci` and `npm run dev -- --port 3010`. Leave DATABASE_URL unset for this frontend-only path. For PostgreSQL, worker and local capture/storage setup, follow the new handoff and `app/docs/local-integration.md`.

Fresh checks on 4 November: TypeScript passed; all 192 unit tests passed across 22 files. Historical deployment tests are dated separately in the handoff. No production deployment, database migration or new real-provider delivery test was performed for this package.

Production credentials, .env.local, participant records, private uploads, database backups, local access files, proof screenshots, node_modules and generated Next.js builds are excluded. Install dependencies with npm ci. Third-party WordPress plugins and live/private data require a separately authorized migration.

Preserve the 5 November 2026 11:59 p.m. IST student/competition cutoff, lifetime school profiles, per-student contacts and current data. Reconcile the actual server before deployment. Do not restore an old database over incoming registrations or blindly rebuild the historic WordPress export.

The generated theme frontend is stored once at `../wordpress-reference/themes/yes-frontend-theme/frontend`. The current source in this directory may contain later changes. Refer to the root handoff before rebuilding or deploying.
