# Daily Submission & QC Reporting Implementation Plan

**Goal:** Complete the six requested QC reporting requirements without altering original submissions or sending notifications.

**Architecture:** Extend the existing read-only reporting projection with a selected India calendar day and audited QC/coordinator history. Keep current QC editing separate from historical daily report previews. A shared formatter supplies exact-format text and safe CSV downloads from the same calculated response.

**Registration ruling:** Count all submitted student, educator and school registration forms, as explicitly confirmed by the user. Count records, not deduplicated people. Sample document numbers and names are examples only.

- [x] Add focused failing tests for report layout and safe CSV; implement a domain formatter in `src/domain/daily-qc-report.ts`.
- [x] Add database tests for registration totals, India date boundaries, cumulative original submission dates, historical QC reopening and completion timestamps; implement dated read-only reporting in `src/server/submission-quality.ts`.
- [x] Add an accessible daily report panel, five overall metrics, copy/TXT/CSV actions and visible completion dates in the existing QC interface. Never expose historical editing controls.
- [x] Verify database tests, typecheck, desktop/mobile browser behavior, access control, unchanged original data, and exact exported report content.
- [x] Review changes, run full CI/build, deploy the existing Hostinger app, and verify production reporting through read-only requests.

Historical reports reflect currently retained submissions and recorded QC events. Entries without usable original dates cannot be placed on a historical day and must be disclosed. Source/file revisions continue to invalidate unverified completions. No paid services or new account invitations.
