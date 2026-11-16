# Portal account menu and end-to-end testing report

Verified 16/11/2026, 4:50:08 pm IST at https://new.youthecosummit.com/.

Deployed application: `cff52a8bf44f7265bd8da1d1c852c945cd27e5bd`.
[Automated validation](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43846677935): **551 passed, 2 skipped**, type checking and production build passed. The skips require optional PDF/media inspection tools in the CI environment.

## Results

| Area | Status | Verified coverage |
| --- | --- | --- |
| Account dropdown | Pass | Consistent left-aligned rows, 44px targets, compact spacing, viewport containment, Escape/outside-click/focus dismissal, preserved unsaved input, failed-sign-out feedback and role-specific sign-out destinations. |
| Admin/owner | Pass | Existing production owner signs in with password/MFA. Overview, inbox, archive, record/job details, judging management and judge overview work on desktop/mobile. Isolated admin creates rounds/assignments and reopens/revokes reviews. |
| Student | Pass within stated scope | Shared participant authentication checked live; isolated three-step form validates, saves, resumes, submits, reloads its receipt, locks after submission and denies other-account reads on desktop/mobile. Current deadline rejection also passes. |
| Teacher | Pass within stated scope | Shared participant authentication checked live; isolated form validation, save/resume, step navigation, submission/receipt, reload, submission lock and access denial pass on desktop/mobile. |
| School | Pass within stated scope | Live registration introduction loads. Isolated form validation, save/resume, submission and pending-review receipt, reload, lock and access denial pass on desktop/mobile. |
| Judge | Pass in isolated workflows | Real authentication/MFA services and QR enrollment, native and WordPress-shaped entries, original source date in assignment picker, draft/reload, exact private download bytes, scoring/deductions, final confirmation/locking, reopen history, revocation and authorization denials pass. No live judge account or assignment was created. |
| Layout and interaction | Pass | 54 checks against the local build and 54 against deployed frontend assets using synthetic API responses: nine views at 1366px, 390px and 320px. No horizontal overflow or uncaught client errors. Includes menu behavior, role links, search/clear, pagination, saved-form lists and record-detail focus. |
| Existing production accounts | Pass | 24 read-only page captures: real owner pages at 1366px/320px; real participant dashboard and student/teacher/school introductions at 1366px/390px/320px. Displayed overview totals match the APIs. Public homepage layout remains intact. |
| Security and upload capacity | Pass | Runtime configuration remains private (0600), database TLS/certificate verification and RLS remain enabled, no public client table grants, existing notification/file-verification jobs are complete. A 360 MiB private temporary write succeeds and is removed. |
| Record preservation | Pass | Counts and full-row aggregate fingerprints match before and after deployment/testing for all nine tables below. No production business-record mutation or invitation request was sent. |

## Preserved records

| Table | Records | Comparison |
| --- | ---: | --- |
| wordpress_records | 6440 | Unchanged |
| wordpress_record_versions | 30 | Unchanged |
| wordpress_attachments | 714 | Unchanged |
| portal_form_records | 76 | Unchanged |
| portal_form_files | 26 | Unchanged |
| judging_rounds | 0 | Unchanged |
| judging_assignments | 0 | Unchanged |
| judging_reviews | 0 | Unchanged |
| auth_invitations | 1 | Unchanged |

## Scope and expected restrictions

- Student, teacher and school workflows use the shared participant account system. Production has one owner and one participant account; separate admin/judge fixtures run only in an isolated database.
- Six registration workflows and two full staff/judge workflows use synthetic records, real persistence/authentication services and private fixture storage. The browser API transport is routed into those isolated services. Registration fixture authentication is supplied at its boundary; shared participant sign-in is separately verified against production.
- Successful student submission uses a fixed **14 November 2026** fixture date. The production deadline remains **15 November 2026, 11:59 p.m. IST**. Valid student answers are also rejected after that deadline without modifying the fixture draft.
- Production submission, school approval, scoring, invitation delivery, password changes and recovery-email sends are intentionally excluded from live mutation tests. No new invitations, emails, accounts, submissions, assignments or reviews were created in production. Ordinary sign-in/sign-out session metadata is expected.
- All 714 archived attachment metadata records and 26 native file records are preserved. This run checks exact download bytes in native/WordPress-shaped judge fixtures; it does not reopen every production attachment. Previously documented incomplete source uploads remain a source-data limitation.

No unresolved application defect was found within this tested scope. Initial runner failures were resolved through fresh MFA counters, explicit loaded-state assertions, navigation limits and complete local fixture configuration. No production policy, deadline, password or record was changed to make tests pass.

Screenshots and detailed machine-readable evidence are retained privately under `.local/portal-audit-20261116/`; credentials, cookies and authenticator setup information are excluded from this report and Git.
