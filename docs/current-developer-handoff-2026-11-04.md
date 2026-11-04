# Youth Eco Summit Developer Handoff

Developer continuation package prepared 4 November 2026

Prepared for the developer continuing the website, registration system and hosting migration.

## 1 Current status and package contents

The public website at https://youthecosummit.com uses WordPress on Hostinger. It serves a frontend exported from the Next.js project, with native WordPress forms and accounts. The complete Next.js and PostgreSQL application is included separately and has not been deployed by us as the live registration backend. It does not use Payload CMS. Continue from the source in app, reconcile the WordPress features listed below, and plan a controlled deployment rather than assuming the two backends are interchangeable.

This package was assembled from the local workspace on 4 November 2026. Production-specific settings and verification below were last inspected on 9 October; they are dated implementation evidence, not a fresh server audit. The local portal source includes the subsequent 1.4.1 individual-label fix. Reconcile the actual server with this package before changing a live site that is receiving registrations.

This document takes precedence over older handoff notes where they conflict. In particular, competition forms are now published, competition entries are enabled, and the live entry flow has been updated through 9 October. Older documents describing draft-only competitions or a team-first flow record earlier releases.

The package contains complete local Next.js source and public assets, its dependency lockfile, twelve database migrations, tests, scripts, historical implementation notes and custom WordPress source. A separately labelled WordPress reference snapshot was downloaded read-only from production on 9 October before the 1.4.1 label patch. Preserve that reference for comparison; use app/wordpress for the current local custom code and check the actual server before deploying either version.

| Location in the ZIP | Purpose |
| --- | --- |
| `START-HERE.md` | Entry point and source precedence |
| `Youth Eco Summit Developer Handoff 2026-11-04.docx` | Readable handoff document |
| `Youth Eco Summit Developer Handoff 2026-11-04.md` | Editable source of this document |
| `app/` | Next.js application, backend, migrations, assets and tooling |
| `app/wordpress/` | Current local custom WordPress code including portal 1.4.1 |
| `wordpress-reference/` | Production reference captured on 9 October before the 1.4.1 patch |
| `wordpress-reference/form-reference-2026-10-09.json` | Safe reference export of fifteen form definitions and selected configuration |
| `SHA256SUMS.txt` and `PACKAGE-MANIFEST.json` | File integrity and package inventory |

Secrets, installed dependencies, generated build directories, participant records, private uploads, database backups, local test-access files and saved-form tokens are excluded. The historical form reference omits notification recipients and provider/integration settings; it is not a complete WordPress database migration. Its portal version is 1.4.0 because the labels were subsequently adjusted at render time without changing stored form definitions. Obtain live credentials and private data separately through the site owner.

The original September developer brief remains in `app/Youth Eco Summit Developer Handoff.md` and `app/docs/briefs/Original-Developer-Handoff.docx`. It is a historical specification, not a statement that every proposed module is live.

### Accounts and infrastructure

No GitHub remote is configured for this local repository. Neither a Vercel project link nor Supabase configuration exists in the project. Vercel and Supabase were discussed as possible hosting choices, not connected for this deployment. The local environment points to PostgreSQL on loopback, not Supabase.

The existing Hostinger server user is `u794443438`; production was managed over SSH on port 65002. Access credentials, the hosting account email, provider accounts and billing ownership are not included. Obtain current access from the site owner privately. Select organization-owned GitHub and hosting projects before adding CI or migrating the Node app.

The configured student-registration and competition deadline is 5 November 2026 at 11:59 p.m. IST, which follows this package date. School and educator registrations continue. Preserve the cutoff during migration; do not reopen entries or change approved dates implicitly.

## 2 Frontend and product decisions to preserve

- Keep the established purple and yellow palette. Youth Eco Summit is the primary brand; remove Bajaj Foundation credits and mentions from current website branding. Historical press URLs may retain their original slugs.
- Use actual summit students, educators and event photography. Image edits and background removal should preserve real faces. Do not introduce invented AI people or generated SVG artwork and patterns.
- Retain subtle entrance animations, independent foreground/background movement, responsive cards and animated FAQ opening/closing. Respect reduced-motion preferences and keep essential content visible without animation.
- Partner logos must be prominent and large. The homepage partner strip moves automatically in both directions and supports finger/mouse dragging and keyboard interaction. Do not restore play/pause buttons or “Swipe” and “Drag to explore” text.
- Keep the shorter mobile homepage with sliders for “What to expect” and image collections. Retain summit speakers, previous winners’ PDFs, press links, competition content and institutional partner visibility.
- Retain the hero tagline “Asia’s largest youth-led platform”, the theme “Waste segregation, the need of the hour”, clear Get involved routes for students, educators/schools and partners, and the partner enquiry form.
- Use the date-only countdown to 29 January 2027. A final event start time has not been supplied. Student and school impact totals are still awaited; do not invent figures. The meeting notes supplied 66+ cities.
- Keep school search as a secondary CTA, readable body/form text, logo without redundant adjacent brand text, and the simplified hero without the removed arrow decorations.
- Registration, competition submission and summit attendance are separate flows. School registration is a lifetime record; students may enter multiple competitions one at a time.

The proposal/sitemap, client frontend review and minutes remain separate pages. Review preview: https://compactummedia.com/youthecosummit/home/. Meeting minutes: https://compactummedia.com/youthecosummit/minutes/. Minutes have dated tabs for 28 September, 30 September and 9 October 2026. The latest minutes were translated into English and added after approval. Do not overwrite these pages while deploying the public website.

## 3 Live WordPress components and form registry

Read-only production inspection on 9 October confirmed WordPress 6.9.9 and PHP 8.1.34. The recorded custom portal was `yes-native-portal` 1.4.0; the custom email plugin is `yes-registration-email` 1.1.0. Forminator 1.53.1 stores forms and submissions. Ultimate Member 2.11.4 supplies existing account/login functionality; miniOrange OTP 5.4.9 supplies the existing SMS integration. LiteSpeed Cache 7.8.1 is installed.

The active theme is `yes-frontend-theme`. Its header retains an earlier version date; its files include targeted production updates made through 9 October. The archived snapshot records production patches as of its capture; current local portal source additionally includes version 1.4.1. Compare it with the live installation before applying changes. Third-party WordPress plugins are not bundled and must remain installed on an existing site or be obtained separately for a new installation.

| Form or page | Live ID | Route or use |
| --- | --- | --- |
| School registration | 9188 | `/schools/register/` |
| Student registration | 48441 | `/register/` |
| Educator registration | 48437 | `/teachers/register/`; internal teacher key retained |
| Partner enquiry | 9213 | `/partners/enquire/` |
| School nomination | 8916 | `/schools/nominate/` |
| Login and account | 12418 and 12426 | Existing native login/account pages |
| Contact page | 6537 | Existing contact page |

| Competition | Live Forminator ID |
| --- | --- |
| Open Letter | 48542 |
| Blog | 48543 |
| Article | 48544 |
| Case Study | 48545 |
| Short Film | 48546 |
| Spoken Word or Monologue | 48547 |
| Painting | 48548 |
| Digital Art | 48549 |
| Waste to Art | 48550 |
| Eco-Business Model | 48551 |

All fifteen configured forms are published, and `yes_native_portal.entries_enabled` is true. Privacy and terms page mappings in this option are currently zero; retained registration consent is used. A complete legal-page/content review remains a separate owner task. Form IDs are specific to this database and must be remapped on a clean installation.

## 4 Competition entry flow and participant fields

Start at https://youthecosummit.com/competitions/enter/.

1. Choose “Student” or “Educator”. A separate “Continue a saved entry” route is available. The opening screen no longer mixes role selection with ambiguous registration buttons.
2. Choose one of the ten competitions. Public competition cards have a working start-entry action; selecting a challenge opens its actual form journey.
3. Choose individual or team only when that competition permits teams. An individual-only category does not offer a team choice. Team size is an integer within the category maximum. Unsupported team context is corrected to individual rather than leading to a dead end.
4. Select a registered school through the searchable school-ID dropdown. Canonical school name and branch are filled automatically, and the server verifies the school against the directory.
5. Create the appropriate student/educator account or sign in to an existing account when required. “Already registered” was replaced with explicit account and saved-entry wording.
6. Complete four form steps: Students and school, Your work, Uploads, Review. Progress is saved on valid step transitions; final submission performs server-side validation.

| Submission path | Required fields for every participating student |
| --- | --- |
| Student submitting directly | Student name and class; guardian email and guardian phone |
| Educator submitting for a school | Student name, class and email; no guardian fields |

Individual entries use “Student”, “Student full name”, “Student class” and “Student email”, without a numeric suffix. Team entries retain numbered headings and labels. Portal 1.4.1 applies this through the Forminator render-fields filter and preserves field IDs, drafts and stored form definitions. It covers individual-only competitions and individual entries within team-capable competitions.

The form supports structured details for up to three participants, depending on category rules. Unused participant rows and contact fields belonging to the inactive submission path are excluded from saved/final records. The interface uses “educator” and “guardian”; stable internal field IDs and legacy teacher URLs remain for compatibility.

Each final entry records its declared student/educator path, entry mode, team size, verified school and submitting account. Account entry lists display this provenance. It describes the path selected by the submitter; it does not independently certify an educator’s employment.

A school can have multiple entries in the same competition. There is no school-level one-entry quota. A student can enter several competitions separately. Every entry requires a valid school ID, including direct requests bypassing the opening screen. If a school is absent, the page tells the student to ask an educator/coordinator to register the school first, with a route to registration.

Existing registration consent is reused for entries as explicitly approved. Preserve this mapping when changing forms. Do not silently substitute unrelated publication-consent text.

## 5 School selection and saved progress

The public directory combines imported school records with current registrations, preserves canonical `YES-SCH-` references and accepted legacy IDs, and displays branch location to distinguish similarly named schools. The snapshot contains 82 imported public school rows; the combined live directory had 94 records at the earlier audit. Live registration can change that total.

The school ID field suggests results as the user types, supports keyboard/touch selection, and cancels stale searches. Selected canonical school name/branch fills the linked field; changing the selection clears or updates that value. A typed name alone is not a verified school. Final validation resolves the canonical identity server-side instead of trusting a browser-supplied school name.

School registration has School, Location, Contact and Review steps. Student registration collects school/class, guardian contact and location/consent. The educator form uses educator terminology and the ten competition options. Existing student and educator password mappings were corrected to use the visible password field rather than automatically generating a different password.

All configured registration and competition forms support Forminator save-and-continue. Valid step changes autosave; the page provides “Continue this saved form”, “Copy link to saved form” and “Save and continue later”. The confusing “resume link” wording was removed. Draft retention is 60 days. Keep saved links private.

Drafts restore the current step and allowed answers, including submission role, school, team size and applicable participant contacts. Passwords, uploads, verification codes and consent must be supplied again. Form answers are not put in browser local storage. Native draft/account pages use private/no-store responses and a no-referrer policy; analytics are suppressed on sensitive form pages.

Forminator’s original 12-character draft column was extended to nullable `VARCHAR(64)` to support 48-character tokens. The live column was verified as `varchar(64)` on 9 October. `yes_native_ensure_draft_schema()` checks this during activation/explicit preparation, not public page requests. Preserve this capacity through Forminator upgrades.

OTP validation is bypassed only for the configured forms’ nonce-validated draft-save operation. Final registration still requires verification. Existing draft tokens are checked against the form, and a successful save response requires actual persistence. Hidden role fields omitted by native Forminator drafts are restored from validated prepared data and retained metadata.

State/UT selection is a searchable dropdown containing all 28 states and 8 union territories of India, backed by a final-submission allowlist. This does not validate the relationship between city, state and PIN code. That separate location-consistency feature has not been implemented.

## 6 Verification services and email activation

| Live registration type | Current verification requirement |
| --- | --- |
| Student | Email code; own-phone SMS requirement removed |
| Educator | Email code and SMS code |
| School | Representative phone SMS code |
| Partner | Existing phone verification preserved |
| School nomination | Existing enquiry behavior; optional phone |

SMS continues through the existing miniOrange service and its existing account/settings. The phone control, country code and Send SMS verification code button were aligned within the field layout for desktop and mobile. No provider was replaced for SMS, and no actual SMS delivery test was performed with an operator-controlled number.

The custom email plugin supports an independent branded SMTP path and local verification-code handling. However, the last inspected production setting was `gateway`; no authenticated SMTP sender is configured. Therefore the independent Youth Eco Summit email body is implemented but not yet active for delivery. Installing the code alone does not remove the provider’s current sender/template.

To activate branded delivery, configure these constants in private server configuration: `YES_EMAIL_SMTP_HOST`, `YES_EMAIL_SMTP_PORT`, `YES_EMAIL_SMTP_USER`, `YES_EMAIL_SMTP_PASSWORD`, `YES_EMAIL_SMTP_ENCRYPTION`, and optionally `YES_EMAIL_FROM`. Use the provider’s correct TLS/port pairing and a verified sender. Keep credentials out of the theme, public files and repository.

Send a real test to an operator-controlled inbox and verify receipt, sender and authentication. Then use `wp option update yes_registration_email_delivery smtp`. Rollback is `wp option update yes_registration_email_delivery gateway`. Configuration and safe test instructions are in `app/wordpress/yes-registration-email/README.md`.

The branded sender name is Youth Eco Summit and the subject is “Your Youth Eco Summit verification code”. The body explains email verification, shows the code, gives its ten-minute expiry and ends with Youth Eco Summit. It has no transaction wording, WP OTP Verification Plugin credit or miniOrange signature.

Branded codes are six digits, stored as keyed hashes and bound to browser, form and recipient. Codes expire after ten minutes; successful proof lasts thirty minutes and is consumed by registration. Resend has a sixty-second interval, recipient/IP throttling and invalidates the previous proof/code; verification permits five failed attempts. Delivery failure never grants verification. The isolated SMTP mailer does not change SMS or other WordPress emails.

## 7 Guidelines eligibility and closing dates

The original team PDF is retained unchanged. Website/form rules use the structured 2027 guidelines JSON plus explicit user clarifications. Full class-specific topics, prompts, references, rewards, rubrics and file requirements are in `app/src/data/` and the live portal’s `data/guidelines-2027.json`; the original PDF is included with public assets.

| Competition and classes | Entry mode | Required work |
| --- | --- | --- |
| Open Letter 5–6 | Individual | PDF 1 MB; 500–600 words |
| Blog 7–8 | Individual | PDF 1 MB; 500–800 words |
| Article 9–10 | Individual | PDF 1 MB; 600–1000 words |
| Case Study 11–12 | Individual or team up to 3 | PDF 1 MB; 1000–1500 words |
| Short Film 7–8 and 11–12 | Individual or team up to 3 | MP4 120 MB; up to 5 minutes |
| Spoken Word 5–12 | Individual or team up to 2 | MP4 50 MB; up to 2 minutes; optional transcript PDF |
| Painting 5–6 | Individual | Landscape JPEG 1 MB |
| Digital Art 7–10 | Individual | Landscape JPEG 1 MB |
| Waste to Art 5–12 | Individual or team up to 3 | Two MP4s, 25 MB each; up to 30 seconds and 1 minute |
| Eco-Business Model 7–12 | Individual or team up to 3 | PDF 2 MB and MP4 50 MB up to 1 minute |

Writing languages are English/Hindi. Video/art resolution and orientation rules, caption declarations, selected class/topic/language, submission title and file-role requirements are applied from the JSON. The prescribed title structure is `SchoolName_Class_Category_ProjectTitle_Authors`, using underscores. Preserve category-specific details rather than introducing a generic upload field.

The user resolved Waste to Art’s conflicting class ranges by allowing four bands: 5–6, 7–8, 9–10 and 11–12. AI-generated submission content receives a 15-point deduction, not automatic disqualification. AI research/reference remains permitted with credited sources. Source citation, originality, captions and AI assessment still require human review; do not present them as fully detectable by code.

WordPress checks actual file type/size, readable PDF word count and relevant media constraints. Its private local-file pipeline is different from the Next.js S3 multipart/scanning pipeline. Preserve this distinction in migration and testing. The bundled PDF parsing library is Smalot PDFParser 2.12.5; FFmpeg tooling availability must be checked on a replacement host.

Student registration and competition submissions are open from 1 October 2026 through 5 November 2026, 11:59 p.m. IST. The exclusive closing boundary is `2026-11-05T18:30:00Z` (6 November midnight IST). School and educator registrations remain open beyond that cutoff. The website launch date is distinct from the entry deadline; the original MVP delivery target was 30 September for a 1 October launch.

Two source issues remain unresolved: the art rubric totals 90 marks, so do not invent the remaining ten; the referenced eco-business slide template was not supplied, so do not invent its headings.

## 8 Live data administration and WordPress operations

WordPress users/accounts are in the existing WordPress database. Form definitions, saved drafts, completed registrations, partner enquiries and competition entries are stored by Forminator in that database. Staff access them through https://youthecosummit.com/wp-admin/ → Forminator → Forms → the relevant form → Submissions. Entry metadata additionally records role, school, mode, account and review information. The public account page displays the signed-in submitter’s entries.

Competition uploads are stored outside the public web root at `/home/u794443438/yes-private-entry-uploads/`. Downloads go through the authenticated `/yes-entry-files/` handler; owner/administrator authorization is required and anonymous download is denied. A WordPress database backup alone cannot recreate these files. Ordinary historic Forminator uploads may use existing storage settings; inspect and migrate them separately.

Live WordPress root: `/home/u794443438/domains/youthecosummit.com/public_html`. Custom theme source is in `app/wordpress/yes-frontend-theme`; plugins are in `app/wordpress/yes-native-portal` and `app/wordpress/yes-registration-email`. They belong under the matching `wp-content/themes` and `wp-content/plugins` paths after reconciling with production. The generated frontend export is retained once under `wordpress-reference/themes/yes-frontend-theme/frontend`; it is the historical export, not a new build of this source. Avoid overwriting later live frontend patches. The existing theme serves `_next/static`, image and document assets from the export and preserves native form asset isolation. Do not load the exported React form hydrator on native form/account pages or introduce a second Select2 runtime.

For changes to the existing site, back up affected files, Forminator definitions and configuration before deployment. The latest role migration updates twelve forms while preserving OTP/account mappings, notifications, integrations, publication status and portal configuration. Run only `yes_native_prepare_entry_role_flow()` under authenticated WP-CLI/admin context when specifically applying that migration. Do not rerun older broad preparation or entry-launch helpers over the current forms; they recreate obsolete participant fields. The role helper is loaded by the active portal plugin.

Use the safe form-reference JSON to inspect field IDs, conditions and pagination. It cannot restore notification recipients, provider credentials or a whole site. A new server requires a controlled WordPress database migration, private uploads, installed third-party plugins, rewrite/configuration and remapped IDs where needed.

Form and account pages bypass LiteSpeed page caching to prevent stale draft/form HTML. Purge WordPress/LiteSpeed caches after marketing/theme changes and verify both mobile and signed-out pages. Retest save/restore, account login, final verification and school selection after changing Forminator, Ultimate Member, miniOrange, Select2 or native asset allowlists.

Private deployment backups are outside the web root under `/home/u794443438/yes-deploy-backups/`. The role-flow backup is `entry-role-flow-20261009/`; earlier deployment, team, branded-email and UX folders are recorded in the dated implementation notes. Do not restore an old full database over newer registrations. Prefer targeted file/form/configuration rollback; preserve current participant records and uploads.

The old `yes-participation-bridge` package describes an inactive alternative redirecting to a hosted Next.js portal. It is not an active component in the recorded production snapshot and should not be activated alongside the current native portal.

## 9 Next.js application architecture and setup

The app uses Next.js App Router, React, TypeScript, PostgreSQL through `pg`, private S3-compatible storage, a separate Node background worker and GSAP. It does not use Payload CMS. `src/app` contains public/private pages and API routes; `src/server` contains domain, auth, database, storage and job logic. `public` contains supplied/edited images, logos, PDFs and other frontend assets.

Twelve transactional, checksummed migrations are included, from `001_domain.sql` through migration 012. Apply them through the provided migration script; never edit an already applied migration. Migrations 010–012 add school-ID aliases/partner enquiries, saved registration drafts and guideline-asset support. Use exact filenames in the package rather than old notes referring to only ten migrations.

Frontend preview requires Node.js 24 or newer. From `app/`, run `npm ci`, then `npm run dev -- --port 3010`. Open http://localhost:3010. Leave `DATABASE_URL` unset for this preview; copying the example database URL enables backend configuration and will require a real database.

For the guarded full local environment, first install PostgreSQL 17+ on `127.0.0.1:5432` with the current OS user able to create a database. Then run:

```sh
npm ci
python3 -m venv .local/moto-venv
.local/moto-venv/bin/python -m pip install 'moto[server]==5.2.2'
npm run local:setup
```

Run `npm run local:services`, `npm run local:worker` and `npm run local:dev` in separate terminals. Open http://127.0.0.1:3010. Setup generates fresh secrets and migrates `yes_local_integration`. It does not create accounts or open registration. Local services capture SMS/email without sending real messages; Moto object storage is ephemeral across restarts while PostgreSQL persists.

For Docker PostgreSQL instead, follow the manual path in `app/README.md`: `docker compose up -d postgres`, copy `.env.example` to a private `.env`, configure it and use `node --env-file=.env --import tsx scripts/migrate.ts` and the matching seed/worker commands. The compose database/user differs from the guarded OS-user local setup; do not mix their connection strings.

`npm run local:guidelines` prepares the ten 2027 guideline competition drafts. The legacy `local:competition-drafts` script creates earlier unapproved proposals; do not use it as the final 2027 configuration. Review/approve the active version, consent and dates through the documented setup rather than assuming a seed opens registration.

Checks: `npm run typecheck`, `npm test`, `npm run build`. Integration and Playwright checks need the services described in `docs/local-integration.md`. `npm run local:verify` writes synthetic records and local access files; run it only against the intended local/test environment.

## 10 Runtime configuration and production deployment

The `.env.example` contains development placeholders; generate new secrets. The shared WordPress host does not run the Node application. Next.js production requires Node hosting, a worker, persistent PostgreSQL and private storage. VPS or managed hosting purchase and payment arrangements remain pending.

| Configuration group | Required setup |
| --- | --- |
| Application and database | `APP_ORIGIN`, `APP_ENV`, `DATABASE_URL`, `DATABASE_SSL`; exact HTTPS origin and verified database TLS |
| Authentication | `AUTH_SECRET` of at least 32 random characters; preserve it securely for OTP/TOTP encryption |
| Delivery | `AUTH_DELIVERY_ENABLED`, SMS/email webhook URLs and tokens; test real provider adapters before enabling |
| Storage | Private S3 bucket/region/endpoint where applicable, SDK credentials or workload role, exact origin CORS |
| File verification | `FILE_SCAN_URL`, token/timeouts; install Poppler and FFmpeg for `pdftotext` and `ffprobe` |
| Owner setup | Bootstrap owner contact/name/password through the private CLI flow, then remove bootstrap secrets |

The Next.js participant authentication currently uses guardian/contact phone OTP; staff use password plus TOTP MFA. This differs from the live WordPress student-email and educator-email/SMS setup. Port the latest approved authentication/contact behavior explicitly; do not assume credentials or sessions are interchangeable.

Run a separate long-lived worker for upload verification, routing, retry and purge jobs. Use persistent queues and monitor failed jobs/queue age. The Next.js pipeline handles multipart uploads, checksums, MIME validation, malware scanning and guideline inspection before marking files ready. Keep `STORAGE_DEV_SKIP_SCAN` disabled in production; local scanner bypass and capture providers are development fixtures.

Source modules include admin/judge areas, invitations/MFA, partner enquiries, imports, retained entry versions, audits and Trash/restore/purge; these are not all deployed into WordPress. The Next.js school dashboard requires verified contact access; a school ID alone grants none.

Build the Node application with `npm run build`; deploy the standalone server plus static/public assets and worker runtime as described in `docs/operations.md`. Apply migrations before starting the release and check `/api/health` plus private provider/storage readiness. Preserve authorization, same-origin checks and no-store behavior behind the proxy; configure the trusted IP header only if the proxy overwrites incoming values.

`npm run build:review` produces `.review-build/out` with writes disabled; `npm run build:wordpress-frontend` creates a WordPress frontend export. Reconcile later live patches before deploying either local build. Keep proposal/minutes directories intact.

Back up PostgreSQL and private originals/object versions separately and rehearse isolated restoration. Retention, recovery targets, capacity and restore testing remain pending. Follow `docs/operations.md` and `docs/storage.md` for purge-journal reconciliation and access checks.

## 11 Work remaining and migration priorities

1. Configure and test an organization-owned SMTP sender, then activate the branded email path. Current gateway delivery is unchanged. Complete controlled real SMS and email-code delivery tests.
2. Fix duplicate school registration at final submission. The 8 October audit confirmed identical school/contact/address details can create another registration; catalog deduplication is not a registration uniqueness constraint. Use normalized school-plus-branch identity, safe reconciliation and concurrent-request protection. Do not make shared coordinator phone/email globally unique across legitimate branches.
3. Decide whether to add city/state/PIN consistency checking. Current searchable state validation only checks the allowed state value; it does not reject a city in another state.
4. Port the latest WordPress role-first journey, per-student guardian/educator contacts, email/SMS policy, school picker and dashboard provenance into the Next.js implementation. Recheck ten competition rules and enabled dates after migration.
5. Transfer WordPress users, school IDs/aliases, registrations, completed entries and private files through a reviewed migration. Preserve source IDs and branch identity; explicitly map existing accounts/consent rather than joining by school name. Reconcile counts and file hashes before cutover.
6. Supply approved impact totals, the eco-business slide template and the missing art rubric clarification. Review legal/privacy mappings and publication permissions before any new public showcase use.
7. Complete hosting purchase/configuration, independent staging, provider delivery, scan service, backups/recovery and realistic upload/load tests before migrating registrations away from WordPress.

The student “email already registered” investigation found WordPress account-email uniqueness, not a global ban on school coordinator contact emails. School registration does not create a WordPress account; student/educator account registrations share the WordPress email namespace. The actual client email addresses were not supplied, so the two reported attempts cannot be individually attributed. Preserve clear existing-account/sign-in guidance and retest changed-email errors during the next controlled registration check.

A legacy public OTP snippet was quarantined after it exposed a provider credential. No credential is included here. The owner still needs to rotate that known exposed key through the provider; changing frontend files alone is not key rotation.

Attendance/QR check-in, volunteers, outreach/re-engagement and deeper module expansion remain later work. Do not describe those proposed modules as operational just because the original brief lists them.

## 12 Change record and verification evidence

| Period | Principal changes |
| --- | --- |
| 28 September to 5 October | Visual frontend, real-photo cutouts, subtle motion, responsive sliders, readable typography, partner prominence, Get involved, partner enquiry and school dashboard source |
| 6 October | Team PDF applied across content/forms; ten guideline formats; class-band, AI penalty and closing-date clarifications; native WordPress frontend/forms deployed; saved-step schema and password mapping corrected |
| 7 October | School data/legacy IDs imported; current branding credits removed; partner strip pause control removed; live theme updates retained |
| 8 October | Existing SMS restored; student/educator email checks; branded SMTP implementation installed pending activation; state dropdown; phone/button layout; saved-form wording; ID search; duplicate/email audits |
| 9 October | Working challenge start and account continuation; entry forms activated; private uploads and authoritative checks; eligibility-aware team selection; school auto-fill; role-first entry journey and per-participant contacts; minutes updated |

The latest recorded live verification is 9 October, prior to this packaging pass. It passed 846 read-only assertions: role flow 206, participation 173, modes 197, challenge journey 88, account/registration UX 57, submission validation 42, school selector 77 and draft/OTP hook isolation 6. Six deployed PHP files passed syntax checking.

Browser tests completed a three-student educator Short Film entry and an individual student Open Letter entry. Database inspection confirmed canonical school, account and applicable contact fields, with inactive contacts absent. Student saved drafts restored guardian details, including all six guardian contact fields for a three-member team. Account lists displayed student/educator provenance. Both attachments were private and anonymous retrieval returned HTTP 403. A 390-pixel mobile opening screen had no horizontal overflow.

Before/after comparison confirmed twelve affected forms retained account, OTP, notification, integration and publication settings. Three synthetic QA records and two test attachments were backed up privately and removed; temporary mail suppression/instrumentation was removed. Existing participant records were not altered by those tests.

The independent email implementation passed 28 in-memory checks without real delivery. Earlier dated documents contain Next.js unit/build/type and local HTTP evidence. Those are historical results for their tested releases, not a new full-suite result for this ZIP. This handoff packaging checks archive integrity, required files and exclusions; it does not claim fresh real-provider delivery, load testing or complete Next.js/WordPress parity.

Read this handoff first, then `app/docs/individual-entry-labels-2026-10-09.md`, `app/docs/entry-role-flow-2026-10-09.md`, `app/docs/entry-registration-ux-2026-10-09.md`, the school/verification notes, and the architecture runbooks. Preserve the original briefs for context; apply the approved rules and reconcile the actual live system with the dated component snapshot when the records differ.

### Checks completed for this package

On 4 November 2026, `npm run typecheck` passed and `npm test` passed all 192 tests across 22 files. Packaging checks cover required source, public assets, twelve migrations, the handoff document, excluded private files, ZIP integrity and per-file SHA256 checksums. These results do not claim fresh browser, real SMS/email delivery, production migration, upload capacity, backup restore or hosting acceptance.

The recorded 1.4.1 release separately passed PHP syntax checks, 341 read-only live rendering assertions and the 206-check role-flow suite. A live browser check confirmed singular labels for individual entries. No form definitions or participant records were changed for that fix.

### First session for the receiving developer

1. Read the root `START-HERE.md` and this document, then verify `SHA256SUMS.txt` before installing dependencies.
2. Start a frontend preview or the isolated full local environment. Review `.env.example`; generate new credentials instead of copying former local or production secrets.
3. Obtain read-only production access and inspect active custom files, form definitions, provider settings, private uploads and registration totals. Back them up before changes.
4. Agree whether the next milestone continues WordPress or deploys Next.js. For Next.js, close the documented role/contact/verification gaps and rehearse account, school-ID and file migration on staging.
5. Verify the November cutoff, save-and-return, per-participant fields, individual/team eligibility, duplicate handling, real verification delivery and backend visibility before cutover. Preserve existing registrations.
