# WordPress parity and Supabase migration

Requested implementation: update the supplied app, preserve all existing data, target organization-owned Supabase/GitHub/Vercel, use subscriptions@compactummedia.com for infrastructure contact, and verify before cutover.

## Inspected baseline

- Next.js 16 App Router, PostgreSQL via pg, custom participant/staff auth, S3 multipart upload verification and background worker.
- Live reference: https://youthecosummit.com. Marketing source already supplies its design/assets. Native WordPress forms differ from the local app.
- Fifteen sanitized form definitions captured 2026-10-09; latest local portal 1.4.1 overrides individual labels. No private records or credentials supplied.
- No existing Git repository, Supabase project configuration, Vercel project link, or GitHub remote. Preserve this package in a baseline Git commit before edits.

## Implementation order

1. Establish baseline checks and inventory all fifteen form definitions and custom PHP validation. Retain original migration files and reference snapshots.
2. Port reference form fields, conditions, class/topic/team constraints and role-specific contact pruning into shared server/client validation. Add a role-first entry route and reference-form renderer using existing styling.
3. Add additive tables for form drafts/submissions, immutable source archive, source identity and attachment hashes. Keep imported identities unclaimed until explicitly reconciled. Never join accounts by name or automatically grant source staff privileges.
4. Add a dry-run-first migration CLI with insert-only/idempotent semantics, conflicting-source detection, attachment path confinement, hashes/count reconciliation and private output reports. Rehearse with synthetic data in isolated PostgreSQL fixtures.
5. Configure Supabase PostgreSQL TLS, private storage compatibility, verified participant identity adapter and database/browser role isolation. Keep staff MFA and backend authorization. Fail closed if configuration is absent.
6. Add GitHub validation workflow, Vercel configuration, secret-free environment template and operational runbook. Preserve separate worker hosting because file inspection needs Poppler/FFmpeg.
7. Run TypeScript, unit/integration tests and production build. Inspect HTTP routes and attempt browser verification. Document exact external access and acceptance gaps.

## Validation and deployment boundaries

Write tests first for conditional contact validation, unauthorized draft access, source conflict/retry behavior, metadata/hash integrity and storage behavior. Run npm run typecheck, npm test and npm run build after changes. Run only synthetic data tests locally. Do not run production writes or submit live forms while inspecting. Production cutover requires current authenticated WordPress export/private files, named Supabase target, organization GitHub destination, and verified provider/worker setup. No purchases are authorized.
