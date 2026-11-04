# Handoff coverage and release gates

The source handoff is authoritative. This matrix distinguishes implementation from demonstrations that require approved programme input or live infrastructure. Final visual design remains explicitly deferred.

| Handoff area | Implementation | Verification / required input |
| --- | --- | --- |
| Public pages and responsive structure | Next routes, plain semantic layout, titles/descriptions, content slots, competition details, participation guide, FAQ, privacy/terms, contact | Approved copy, hero assets, partner/benefit claims and final design still required; none invented |
| School search / nomination | Public safe directory DTO, location filtering, permanent IDs, pending nomination receipt, duplicate review | Verified baseline legacy directory and contact-verification process approval |
| Lifetime schools | Permanent school record, verified contact editing, annual participation and immutable prior context | Representative multi-edition SQL checks; actual legacy reconciliation required |
| Contact verification and access | Hashed expiring SMS OTP, resend/attempt limits, multiple students per guardian, server sessions, invited staff with TOTP, recovery and revocation | Configure owned delivery services and complete live OTP/recovery checks |
| Student registration | Active school prerequisite, guardian vs emergency fields, separate versioned consent, student/edition reference and snapshot | Approved wording and class/source-form requirements; teacher-on-behalf is not enabled without an approved authorization process |
| Configured competition forms | Immutable configurations, server category assignment, distinct draft/final flows, required field/type/range/file validation, limits and deadlines | Final source forms/catalogue must be reviewed and configured |
| Team entries | Lead and linked members, authorized member validation, guardian-specific invitation acceptance, one entry per team | Configure approved team size, school and class-category policies; team mode requires these choices explicitly |
| Retained uploads | Direct multipart parts, progress/resume, completed-upload crash recovery, full content/checksum/size verification, scanner/duration boundary | Private bucket, CORS and scanner service required; realistic interrupted-video staging check remains |
| Final receipt/revisions | Transactional finalization, idempotent retries, immutable revisions and exact asset list, locked final submissions | SQL workflow checks; real concurrent PostgreSQL/load rehearsal required |
| Admin overview/directory | Edition counts with distinct meanings, server pagination/search/filter, school/student/entry context, judges and job failures | Review filters and workload against production-sized representative data |
| Assignments/routing | Manual/bulk and ongoing scopes, explicit assignment uniqueness, revocation tombstones, reconciliation and retryable jobs | Measure proposed ten-second queue target in deployment; do not claim target from local code alone |
| Judge workspace | Assigned-only queue, anonymous DTO and generated filenames, rubric validation, draft/final lock, flags, current authorization on mutation and media | Staging isolation/round-close/reassignment checks; uploaded work may itself reveal authorship |
| Decisions/results | Screening transitions, required final review count, referenced jury shortlist/award decisions, role permissions | Agreed aggregation, ties, missing-review and ratification policy still required; no automatic winner calculation |
| Safe media | Authenticated per-request/byte-range gateway; protected download fallback; no signed/public download URLs | Provider range/version support and representative media verification |
| Trash/restore | Explicit dependency previews/batches, reason/audit, parent-first restore, no automatic expiry, no revived publication/revocation | SQL workflow tests and staging dependent-record cases |
| Permanent purge | Owner confirmation, inaccessible purge state, retryable object/version removal then relational cleanup, minimal deletion ledger | Real provider deletion failure/restore rehearsal and retention policy approval required |
| Exports | Authenticated audited filtered CSV streaming and bounded XLSX; formula-safe values and platform references | Large export load check; exports exist only as response bytes, not public bucket copies |
| Historic imports | Column mappings, preview, reviewed school matches, source-ID idempotency, reconciliation and missing-file repair records | Actual source exports, access permission, organizer-controlled file ingestion and count/retrieval reconciliation required |
| Public showcase | Separate publication consent, explicit text/file moderation, safe public DTO and publication-scoped range-capable media gateway; every request checks current consent, revision and Trash | Publish only selected, reviewed files; original names, private storage URLs, contacts and review data are excluded. Withdrawal blocks subsequent requests; delivered bytes cannot be recalled |
| Configuration/content | Admin edition, competition version, rubric/round, rule and plain text content management | Programme owners supply final content; registration tutorial guide is functional text, not a finalized video/design |
| Operations | Checked migrations, environment inventory, owner bootstrap, worker, structured incident logs, cost worksheet and restore runbook | Hosting, monitor destinations, actual cost quotes, retention/RPO/RTO, backup restore and load tests require chosen services |
| Later modules | Recorded in operating delivery sequence | Attendance/QR check-in, outreach, volunteers and deeper teacher portals are separate scope in the handoff |

## Acceptance evidence to collect before live launch

Record the environment, fixture references and result for each handoff acceptance check 1–14. Automated tests cover the implemented local rules and SQL workflows; they do not substitute for a live SMS round trip, a 200 MB interrupted upload, real provider object deletion, restoration of a video backup or peak-load testing.

Required external inputs are those in handoff section 13. The user confirmed on 29 September 2026 that approved forms/rules and chosen database/storage/OTP providers are not available. Configuration should remain closed until those inputs are supplied; a working development build is not a launch approval.
