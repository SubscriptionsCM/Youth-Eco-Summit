> Package status 4 November 2026: read START-HERE.md and docs/current-developer-handoff-2026-11-04.md first. The local WordPress portal is 1.4.1. Historical WordPress snapshot and status evidence are dated 9 October. Next.js and WordPress are separate implementations; later live behavior requires explicit migration.

# Youth Eco Summit platform

Functional implementation of `Youth Eco Summit Developer Handoff.md`. Next.js App Router, TypeScript, PostgreSQL, private S3-compatible object storage and a separately running durable worker. The public frontend uses the supplied 2027 copy and layered event imagery; the existing registration and administration workflows remain in place.

See the [public frontend handoff](docs/frontend-build.md) for the design-only preview, asset provenance, verification and standalone build instructions.

The public frontend and backend are now connected and verified locally. See [integration delivery](docs/frontend-backend-integration.md) for the working journeys, `local:*` commands, test results and production configuration still required. The local environment uses synthetic data and captures SMS/email without sending real messages.

## 2027 guidelines and saved forms

The team-supplied 2027 guidelines now cover ten competition formats and the relevant public pages. Teacher registration uses three steps; student and school registration use four. Progress saves to the signed-in account in PostgreSQL. The local importer created version-two competition drafts while preserving previous versions; dates, consent and unresolved competition policies still need approval before activation.

See the [2027 implementation handoff](docs/guidelines-2027-implementation.md), [public content notes](docs/guidelines-2027-content.md) and [form/upload rules](docs/guidelines-forms.md). An [optional WordPress participation bridge](docs/wordpress-temporary.md) is packaged, awaiting the choice of temporary architecture, hosted portal origin and WordPress access. It has not been activated on a live WordPress site.

## Run locally

Requires Node.js 24+, PostgreSQL 17+ and npm. Docker is optional.

```sh
npm ci
docker compose up -d postgres
# Copy .env.example to .env and supply your local configuration.
node --env-file=.env --import tsx scripts/migrate.ts
node --env-file=.env --import tsx scripts/seed.ts
npm run dev
node --env-file=.env --import tsx scripts/worker.ts
```

Next.js loads `.env`; standalone scripts use the explicit `--env-file` shown above. `DATABASE_SSL=true` verifies the database certificate for managed PostgreSQL. Configure the appropriate trusted CA at the host when needed; do not disable certificate verification.

To create the first owner, set the `BOOTSTRAP_OWNER_*` variables and run `node --env-file=.env --import tsx scripts/bootstrap-owner.ts` in a private terminal. Enroll its one-time TOTP URI in an authenticator. Remove the bootstrap password from the environment immediately afterward. Subsequent staff accounts use invitations. See [authentication](docs/auth.md).

No competition catalogue, consent text, event date, benefit, partner claim or live provider has been invented. The seed creates unapproved content drafts only. Public registration stays closed until configuration and approved privacy/terms exist. Unconfigured providers return a service-unavailable error instead of pretending to send OTPs or retain files.

## Configuration order

1. Configure organization-owned PostgreSQL, storage, scanner, SMS/email delivery and application origin. Run all migrations, the application and worker.
2. Sign in at `/login` as owner. Use `/admin/content` to enter approved privacy, terms, about and contact text. Text is rendered safely as text, not executable HTML.
3. Create an edition in `/admin/editions`, including the confirmed label/dates, approved guardian consent and separate publication consent. Keep it draft until approval. The edition configuration action allows correction while closed.
4. Review source forms and create versioned competitions, class categories, fields, allowed files, team sizes, limits and opening/closing dates. Explicitly approve each competition. Create rubrics/rounds and record the jury's decision permissions, prerequisite scoring rounds and minimum reviewers per prerequisite round.
5. Review historical school matches and nominations, verify the school contact and approve its lifetime record. A school ID never grants editing access.
6. Invite judges, configure assignment rules, validate representative large uploads and load, and complete the staging acceptance checklist before advertising open flows.

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run start
npm run test:e2e
node --import tsx scripts/capacity.ts entries=10000 filesPerEntry=1 averageMB=200 versions=1 copies=2 viewsPerFile=3
```

Tests use real embedded PostgreSQL via PGlite for isolated database checks, plus external storage/delivery doubles. Production always uses `pg` and a PostgreSQL server. No production in-memory data store is substituted.

## Structure

- `src/app`: route shells, metadata, plain responsive layout, API entry point.
- `src/components`: replaceable functional forms and workspaces.
- `src/domain/rules.ts`: versioned configuration and domain validation.
- `src/server`: authorization and transactional registration, submission, review, administration, import, publication and deletion services.
- `src/server/storage`: private storage, streaming integrity checks, scanning and media range handling.
- `migrations`: ordered SQL schema changes with checksums.
- `scripts`: migrations, owner setup, worker, seed and capacity calculator.
- `tests`: rules, SQL workflows, authentication, private storage and browser checks.

See [operations](docs/operations.md), [schema](docs/schema.md), [requirement coverage](docs/requirements.md), [verification](docs/verification.md), [storage](docs/storage.md) and [implementation plan](docs/superpowers/plans/2026-09-29-platform.md).
