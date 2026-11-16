# Portal UI and usability update

The update covers the existing admin, participant, educator/school registration and judge workspaces at https://new.youthecosummit.com. It retains the Youth Eco Summit branding, existing routes, permissions, form definitions and submission workflows.

Application release: `26ed43e4bddee29b0153add63ece64fe939d0280`. Live owner acceptance completed **16 November 2026 at 14:53:45 IST**; final integrity/runtime checks completed at **14:58:06 IST**.

## Changes

- Grouped, role-aware navigation replaces the crowded administration link bar. A current-location breadcrumb and compact mobile menu help users move between tasks. Public campaign pages keep their original layout.
- The admin overview uses readable, linked totals from existing APIs, clear task shortcuts and a separate area for earlier-workflow totals. Search controls show relevant filters, results counts and a clear-filter action. Record details receive keyboard focus; closing them returns focus to the originating row.
- The participant dashboard separates recent drafts, submitted receipts and linked earlier entries. Search, client pagination, status labels and registration/school shortcuts make saved work easier to find. When the 200-record API limit is reached, its count/search scope is disclosed explicitly; older records are not deleted.
- Educator and school forms use consistent navigation, headings, spacing and mobile styling within the existing account model. No new account roles were introduced.
- Judge queues and review forms use the same workspace, readable status badges and filter reset. Existing scoring, deductions, private downloads, confirmation and review locking remain intact.
- Session loading and transient focus-refresh failures no longer remount the page and discard local edits. Unsaved forms and review edits prompt before internal link navigation or browser reload/unload; successful saves clear that state and failed saves retain it. File downloads and new tabs remain usable.
- Headers, footers, table scroll regions, focus indicators and pagination are tailored for portal tasks and narrow screens. WordPress dates remain original source values rather than import times or browser timezone conversions.

## Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Full CI | Pass | [Run 43837234364](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43837234364): 548 tests passed, two existing skips, typecheck, production build and standalone packaging successful. An earlier run caught an outdated exact-class assertion; its portal/marketing boundary check was corrected and the full run repeated. |
| Focused behavior | Pass | 13 focused tests include role-link boundaries, unique navigation, saved-work filtering, unknown form keys, stable page state, unsaved-navigation behavior and public/entry layout separation. |
| Cross-role browser checks | Pass | Eight surfaces at 1366px, 390px and 320px: admin overview, record list, forms inbox, judging management, participant dashboard, educator registration, school registration and judge queue. Twenty-four captures, no page errors or horizontal overflow. Fixtures were synthetic and all production mutations blocked. |
| Interaction checks | Pass | Search/reset, draft and earlier-entry views, recent-200 disclosure and pagination, mobile navigation, and record-detail focus/return passed. |
| Complete review workflows | Pass — isolated | Native and preserved WordPress-shaped entries each passed nine browser checkpoints using actual local services and storage, including password/MFA sign-in, assignment, draft resume, private-file download, scoring, final submission, reopening and revocation. No external emails were sent. |
| Code review | Pass | Reviewed role boundaries, preserved actions/exports, counts, source-date handling, focus behavior and unsaved-edit handling. State-remount and recent-record-scope findings were corrected and verified. |
| Live deployment | Pass | Hash-verified CI artifact deployed to Hostinger with rollback retained. Actual owner password/MFA and twelve desktop/mobile captures across six admin/judge pages passed. Overview values matched live APIs, WordPress dates rendered from source values, mobile menu/Escape and account controls worked, and public marketing layout remained intact. A further 24 deployed cross-role fixture captures and interaction checks passed. |
| Record preservation | Pass | Before/after fingerprints match across nine tables: 6,440 archive records, 30 immutable versions, 714 attachment metadata rows, 76 native forms, 26 native file rows, the existing invitation and unchanged empty judging setup/review tables. No schema or data migration was performed. |
| Runtime and upload reserve | Pass | Correct active revision, private runtime mode 0600, database TLS/CA and RLS retained, no client table grants, existing background jobs complete. A 360 MiB temporary write succeeded and was removed. Only byte-identical inactive compiled code copies were shared to retain headroom; user storage and active runtime were excluded from replacement. |

## Limits and preserved requirements

Dashboard counts and native saved-work search cover the latest 200 returned forms, rather than an unlimited history. Linked WordPress entries have a separate view. The UI discloses this limit at the cap.

The unsaved-edit warning covers internal link clicks and browser unload/reload. Client-side browser Back/Forward history is not intercepted; users should save before using history navigation.

No production invitations, accounts, submissions, judging rounds, assignments, reviews or team notifications were created by verification. The complete write workflows were tested in isolation. The eight source records without original uploads identified in the [earlier judge audit](judge-portal-audit-2026-11-16.md) remain unchanged; this UI update does not restore missing source data.

Private credentials and user payloads are excluded from this report. Aggregate evidence and synthetic/masked screenshots are Git-ignored under `.local/portal-ux-20261116/`. Previous deployment and rollback releases are retained.
