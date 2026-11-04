# Frontend and backend integration

Completed locally on 29 September 2026 using the supplied `youthecosummit-NextJS.zip` backend and the revised public frontend in one Next.js application. The original database migrations, domain services, access controls, storage gateway and worker are retained. No second backend or simulated browser submissions were introduced.

## Connected journeys

- Public competition catalogue → unique competition record → sign-in → eligible student/competition selection → draft → retained upload → review → submitted receipt.
- School registration → staff approval → permanent school directory → verified returning-school access.
- Guardian OTP → student registration → account dashboard. Returning students can use their stable student record for another edition. Siblings keep separate identities.
- Staff invitation → authenticator enrollment → staff sign-in → administration/judging. The header provides the correct workspace and sign-out for each role.
- Admin-approved About copy, public catalogue and school records load from the backend. Historical static editorial content and approved design assets remain in the frontend.
- Separate publication consent → administrator moderation → public showcase and selected files. Withdrawal removes the public listing and access to its files.

The app calls its own `/api` routes using HTTP-only sessions. Competition and team-invitation destinations survive sign-in; redirects accept safe internal pages only. Competitions use their unique database IDs because slugs can repeat across editions and versions. Availability, edition and class filters match backend rules, which remain authoritative.

Entry forms retain unsaved answers while file status refreshes. Their original concurrency version is retained so a refresh cannot silently overwrite a change from another tab. A rejected stale save leaves the user's text visible and offers explicit discard/reload recovery.

## Running the integrated local application

See [local-integration.md](local-integration.md) for PostgreSQL and the isolated Moto installation. After those prerequisites:

```sh
npm run local:setup
```

Start each long-running process in a separate terminal:

```sh
npm run local:services
npm run local:worker
npm run local:dev
```

Open `http://127.0.0.1:3010`. A local-test notice distinguishes this environment. The services use a dedicated `yes_local_integration` database. Setup initially creates only unapproved content drafts.

To exercise the full lifecycle with clearly labelled synthetic records:

```sh
npm run local:verify
```

This **writes local test data**: a test owner on first run, test policy copy, an open test edition, school, student, competition, file, staff invitation and review. It refuses production/nonlocal targets. Previous open editions from this verifier are archived without deleting their records. It does not send real SMS or email. Do not use it to seed the live programme.

The private `.local/integration-access.json` stores the local test owner's credentials/enrollment URI and latest record references. `.local/inbox/messages.jsonl` receives test OTPs and invitation messages. Both are local, excluded from source packages, and must not be shared or deployed. `.local/integration-report.json` contains the latest verification results without secrets.

## Verification

- **137 Vitest tests passed** across 12 files, including stable returning-student identity, safe login redirects, duplicate competition slugs, class/edition eligibility, authentication, storage, submissions, admin and judging rules.
- **Production build and TypeScript passed.** The source was compiled with local configuration; a deployment build must use the intended production configuration.
- **10 HTTP lifecycle checks passed** against the real Next.js API, PostgreSQL, worker and S3 SDK: access denial/CSRF; owner MFA; admin configuration/public catalogue; OTP and school approval; student/dashboard/draft persistence and isolation; multipart upload and private retrieval; submission/admin receipt; judge invitation/MFA/review; publication/withdrawal; logout.
- Browser checks through CUA verified competition → login → selected dashboard, actual OTP login, persisted student/entry visibility, draft creation and preservation of unsaved text across file-status refresh. Browser checks use the local API rather than intercepted responses.
- Regression scenarios are also saved in `tests/e2e/participant-integration.spec.ts`. The Playwright CLI suite was not run in this delivery; the browser checks above were performed through CUA.

## Remaining production configuration

This completes the code integration and local verification, not live-service activation. Production requires the organization's PostgreSQL endpoint, private persistent S3-compatible storage, real SMS/email webhooks, malware scanner, worker hosting and exact HTTPS application origin. Approved programme policies/consent, dates, competitions and school records must replace local test fixtures through the administration workflows.

Moto is an in-memory S3 emulator: its upload bytes disappear when that process restarts, while local PostgreSQL records persist. Local file checks retain checksum/type/size/access validation but deliberately skip malware scanning. Cloud IAM, retention/backups, live message delivery, real malware scanning and production load are not verified by these local checks. The production guards still require those services; they have not been bypassed.

Neither `.env.local` nor `.local/` belongs in a deployment or downloadable source archive. Start production with its own configuration as described in [operations.md](operations.md).
