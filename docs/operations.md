# Deployment and operation

## Ownership and environments

Use organization-owned hosting, PostgreSQL, private object storage, scanner and SMS/email provider accounts. Keep production and staging in separate databases, buckets, provider applications and secrets. The repository selects interfaces, not a purchased provider. There are no credentials in source.

Deploy the Next.js Node server and at least one long-running worker process. Keep the worker near PostgreSQL/storage. A scheduled function running every minute cannot meet the handoff's proposed ten-second routing target. The worker reconciles routing every three seconds and claims durable jobs using row locks. Scale workers after testing real upload verification throughput; use a separate routing worker if video scanning delays a shared worker. Monitor queue age as well as queue length.

Migrate before starting a new application version. Migrations are transactional and checksummed; never edit an applied migration. Take a recoverable snapshot before schema deployment. `npm run build` generates a standalone server; include `.next/static`, `public` if present, migrations, scripts, and dependencies needed by the worker in the deployment artifact. Route traffic only after `/api/health` responds and provider/database readiness has been checked privately. The public health endpoint deliberately reveals no credentials or infrastructure details.

Serve HTTPS. Set `APP_ORIGIN` to the exact external origin. Session cookies are secure in production, HTTP-only and same-site; authenticated operations and mutations are uncached. Reverse proxies must overwrite the trusted client-IP header before `AUTH_TRUSTED_IP_HEADER` is set. Otherwise contact and global limits still apply, but per-network fairness will be reduced. Add an edge body-size and request-rate cap to protect the public nomination and OTP endpoints.

## Storage and jobs

Follow [storage setup](storage.md): private bucket, limited service credentials, exact upload CORS origin, version support, streaming scanner, no lifecycle deletion of originals/finalized/Trash objects. Only upload-part URLs are signed. Private downloads use the authenticated gateway; explicitly moderated showcase files use a separate publication gateway that checks current consent and selected file IDs. Each range request is authorized again. A client already holding delivered bytes cannot have those bytes recalled.

Verification checks content type, full byte count/checksum and scanning before setting `ready`. Scanner configuration is mandatory in production. Keep malware files quarantined and retained for authorized resolution. Source archives are never executed. Document previews use a safe authenticated download fallback. Automatic conversion or execution of submitted Office documents or code is not part of the platform.

Jobs have retry backoff and a terminal failure state after five attempts. Admins inspect `/admin/jobs` and retry after correcting the cause. A crashed worker lease becomes recoverable after fifteen minutes; a running worker heartbeats its lease. Purges remain inaccessible on failure. No automatic Trash expiry or abandonment deletion is enabled. Approve a separate resumable-upload grace period before adding multipart cleanup.

Alerts to configure in your monitoring service: request failures, failed jobs, oldest pending routing job over ten seconds, verification backlog, failed/quarantined assets, storage bytes, retrieval errors, PostgreSQL disk/connection capacity and backup failures. The application logs structured incident IDs and job IDs without form contents or contact values. Forward stdout/stderr to the chosen monitoring account.

## Backup and restore rehearsal

Retention period, RPO (maximum lost work) and RTO (time to restore) require platform-owner approval; no values are silently assumed.

1. Back up PostgreSQL with an organization-managed backup/PITR service or `pg_dump --format=custom`. Encrypt backups and restrict restore credentials. Back up private originals and all retained object versions separately; a database dump cannot recreate videos.
2. Export the minimal `purge_ledger` after every purge to a separate protected deletion journal, outside the restoration snapshot. Retain this journal under the agreed policy. It contains internal IDs/keys, not student answers or contacts.
3. Restore PostgreSQL to an isolated environment. Restore actual object versions to an isolated private bucket. Disable outbound notifications, registrations and workers during recovery.
4. Overlay all completed purge-journal entries newer than the backup: mark their restored entities inaccessible, remove the listed objects and remaining relational content using the purge workflow, and verify object HEAD/list-version results. Never open the restored app before reconciliation. Do not assume an old database ledger includes recent purges.
5. Reconcile stale upload/routing jobs and resume the worker. Test a retained document and a byte-range video request, including original SHA256 verification. Check guardian ownership, judge assignment isolation, Trash restore, revocation and a previously completed purge.
6. Record backup ID, object versions, representative references, measured RPO/RTO, test results and operator. Only then permit a production cutover.

The repository provides the schema/workflow/runbook. A real backup restoration has **not** been demonstrated without a deployed database, bucket and approved retention policy. It remains a release gate.

## Cost and capacity worksheet

Run `scripts/capacity.ts` with measured entries, files per entry, average MB, revisions, backup copies, previews, views per file, OTP volume and provider unit prices. Inputs `pricePerGBMonth`, `pricePerGBTransfer`, `pricePerOTP`, `hostingMonthly`, and `databaseMonthly` produce a planning estimate, not a quotation. Example arithmetic: 10,000 entries × one 200 MB video is 2,000 GB of originals before revisions/backups. Measure database rows and request fees separately. Legacy student participation counts are not unique-user or upload forecasts.

No provider has been selected, so an actual cost estimate, peak load target and capacity approval remain outstanding. Test large interrupted uploads and competing final-submit requests at the agreed concurrency before opening.

## Admin walkthrough

Approve a verified school or reconcile a nomination → locate its students by reference/name/contact → inspect linked edition participation and entries → open retained work through the platform → assign entries or an ongoing rule → monitor review completion and flags → record guideline outcomes and referenced jury decisions → request separate publication consent and moderate public text and each selected file → export filtered data as CSV/XLSX.

Use Move to Trash for ordinary deletion. Review dependency counts before bulk deletion. Restore parents before dependents; restoration never republishes or unrevokes access. The owner must type the deletion batch ID to request purge. Check the worker's completion status rather than treating a purge request as deletion success. Correct support data with an audit reason; reopen reviews rather than editing a judge's score.

## Delivery sequence recorded 29 September 2026

- Implementation: registration, retained submissions, admin/search/Trash and core judging code in this repository.
- Before advertised registration opens: approved forms/content/consent/dates, services, verified legacy school directory, representative file tests and load/cost sign-off. The requested 1 October opening is a business target, not a verified release promise.
- Before judging begins: approved round/rubric/decision policies, invitations/assignments, tested isolation and stale-save revocation.
- Subsequent release work requiring real inputs: historical export reconciliation and file repair, publication moderation/content and tutorial approval, richer programme reporting.
- Attendance/QR check-in, volunteer/outreach campaigns and deeper teacher portals remain separate later modules, as explicitly scoped in the handoff.
