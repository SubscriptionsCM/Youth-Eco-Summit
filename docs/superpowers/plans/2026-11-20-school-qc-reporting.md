# School, QC and Reporting Implementation Plan

> Execute in this session using subagent-driven-development for the school workspace and review; integrate shared routes centrally.

**Goal:** Complete the approved voice-note requirements while preserving immutable submissions and source history.

**Spec:** docs/superpowers/specs/2026-11-20-school-qc-reporting-design.md

**Architecture:** A shared read-only submission projection feeds separate staff reporting/QC and approved-school services. New state lives in additive protected tables. Existing authentication, uploads and dedicated judging remain authoritative.

## Global Constraints

- No invitations, messages, paid changes or invented production judging/QC/student data.
- Original answers, source records, dates and attachments remain unchanged.
- School access requires an active participant and explicit approved access. Staff functions require an active owner/admin.
- Do not touch docs/accounts-and-forms-test-report-2026-11-13.md. The VPS migration remains paused.

### Task 1: Shared submission projection

Create src/server/submission-records.ts and tests/submission-records.test.ts. Export `loadSubmissionRecords(db): Promise<SubmissionRecord[]>`, `requireActive(db,actor,roles): Promise<void>` and `recordLink(record): string`. SubmissionRecord has id/source (portal|wordpress)/formKey/title/kind (competition|student|teacher|school|other)/status (submitted|draft|other)/reference/submittedAt/year/schoolId/name/email/className/section/answers. answers is server-only. Read known form IDs, verify archived checksums, match only explicit school identifiers, retain original dates, and reject malformed/draft source rows for completed counts. Write failing tests for draft exclusion, identity matching, original dates and source immutability; implement and verify.

### Task 2: School workspace

Create migration 021_school_workspace.sql, src/server/school-workspace.ts, src/components/school-workspace.tsx, src/app/school/page.tsx and tests/school-workspace.test.ts. The controller integrates router/nav separately. Consume Task 1's projection. Export `schoolWorkspaceRoute(request,db,actor,path:string[])` for /api/school-workspace plus `/api/school-workspace/admin` and subpaths. The base GET lists the participant's access requests; POST /requests creates a pending request with schoolId/reason. Staff GET /admin lists requests; PATCH /admin/:requestId approves or revokes with reason. GET /schools/:schoolId returns safe school-scoped students and competition progress with year/search/pagination. PATCH /schools/:schoolId/students/:source/:recordId records versioned name/className/section correction with reason and lockVersion, preserving originals. Provide `SchoolWorkspace` and `SchoolAccessAdministration` components. Test cross-school/role denial, pending access denial, approval/revocation, version conflicts, restricted DTOs, original-row preservation and archived school matching. No email. Do not change shared navigation/router or the shared projection; report any needed interface changes.

### Task 3: QC and reports

Create migration 020_submission_quality.sql, src/server/submission-quality.ts, src/components/submission-report.tsx and tests/submission-quality.test.ts. Add staff-only /api/submission-report read and /api/submission-quality write endpoints through router integration. QC writes contain source/recordId/status/note/reason/lockVersion; optional category coordinator is separate metadata. Validate submitted competition status and active staff, enforce optimistic concurrency and append immutable history. Report filterable submission year/school/competition/source; include registration records, submitted competitions, QC completed/remaining/today, category coordinators and per-judge progress from dedicated tables. Display paginated QC records and original source links. Test matching scopes, drafts, year boundaries in Asia/Kolkata, no original writes, stale rejection and access denial. Integrate overview metrics and reporting navigation.

### Task 4: Integration, review and release

Integrate school/report routes before generic admin dispatch, mobile-safe navigation and school dashboard link. Run all unit tests/typecheck/build; use actual new services in isolated end-to-end browser fixtures for access grant, school correction and QC without external delivery. Review authorization, record counts and no source rewrites. Build and deploy with the established Hostinger release process and additive migrations only. Verify protected pages at desktop/mobile, live read endpoints, no failed jobs and original-record fingerprints. Record operational pending items truthfully.
