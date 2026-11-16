# Dedicated judge portal — 16 November 2026

**Live and ready for owner setup.** Application revision `aca0008cfee695271ad36b2728f9622688d5e6de` is active on Hostinger. No production judge account, invitation, round, assignment or review was created during setup, following the owner's instruction to add these later.

| Destination | Address |
| --- | --- |
| Dedicated judge sign-in | https://new.youthecosummit.com/judge/login |
| Assigned-entry dashboard | https://new.youthecosummit.com/judge |
| Owner/admin management | https://new.youthecosummit.com/admin/judging |

## Available functionality

- Invited judges use the existing staff password/MFA enrollment and sign-in. Unauthenticated visitors see the judge sign-in gate; participant accounts are denied judge APIs and screens.
- Judges search their own assigned entries, access private submission files, save incomplete review drafts, resume them, enter competition marks/deductions/comments and flag conflicts or unreadable work. Final submission requires confirmation and locks the review.
- Staff invite judges, create competition rounds, select native or preserved WordPress entries, assign reviewers, open/close rounds, inspect private reviews, revoke access and reopen a final review with a reason. Previous submitted reviews remain in history, and actions are audited. Reviewer account activation/deactivation uses the linked existing staff-management page.
- The ten supported competitions use their published **2027** rubrics. Original marks and deductions are retained, including 90-point art totals and the 15-point AI-content deduction. Scores do not automatically select or publish winners. Other editions require their own approved rubric configuration.
- Assignments reference real submitted records directly. There is no fabricated student identity or silent projection into the legacy judging schema. Required archived files are reconciled to their original upload metadata. Drafts, unsupported competition mappings, changed snapshots, corrupt hashes and missing required files are rejected.
- Judge responses withhold contact details, names, school identity, original filenames, storage paths and other judges' reviews. Files can themselves contain names; the screen makes this limitation clear. Downloads recheck the current actor and assignment and retain private/no-store, length/hash and range protections.

## Owner setup

1. Sign in with the enrolled owner account and open **Manage judging**.
2. Expand **Invite a judge**, enter their approved name/email and send the invitation. The judge accepts it, sets a password and enrolls an authenticator before receiving assignments.
3. Choose a competition, enter a round name and create the round. It can remain closed while assignments are prepared.
4. Select the round and entry source, find the required submitted entries, select a reviewer and record the assignment reason.
5. Open the round when judges may save or submit reviews. Use assignment management to revoke access or reopen a submitted assessment with a recorded reason.

Preserved QA submissions remain in the system; staff should distinguish them from real participants before assigning work. No test data was deleted or silently excluded from historical records.

## Verification

| Check | Result |
| --- | --- |
| Full isolated regression suite | **Pass: 524 tests / 65 files, zero failures, two existing tool-dependent skips**. |
| TypeScript and production build | **Pass**, locally and in Linux CI. |
| Automated release | [GitHub Actions 43805370195](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43805370195) passed tests, build, isolated worker startup and standalone packaging. Downloaded artifact length/hash and deployed `REVISION` matched. |
| Independent review | Three issues were identified and corrected: archived string-valued drafts, per-field required archive attachments and inconsistent lock ordering. Draft/attachment regressions failed before correction; targeted tests and independent follow-up passed. Concurrency was assessed through lock-order review and version-conflict tests, not a multi-connection production load test. |
| Complete owner/judge journey | **Pass in an isolated browser fixture**: owner MFA; invitation captured locally; real password/MFA enrollment; selecting and assigning a source-shaped submitted entry; draft save/reload; private browser download matching exact bytes; scoring/deduction; confirmation/final lock; staff reopen/history; revocation denying later entry/file requests. Eight checks and four desktop/mobile captures, with no page exceptions or horizontal overflow. |
| Live authentication and access | **Pass**: existing owner password/MFA, existing participant sign-in, anonymous HTTP 401 and participant HTTP 403 responses. No real invitations or setup writes. |
| Live desktop/mobile | **Pass**: dedicated login, anonymous gate, owner management and empty queue at 1280px/320px, plus participant denial. Nine captures; no page exceptions or unexpected alerts/overflow. |
| Live source selection | **Pass**: Open Letter picker returned one native submitted record and 49 preserved WordPress entries. No assignment was made. |
| Production data preservation | Migration and final readback retained **2 users, 0 invitations, 6,316 archived records, 669 archived attachments and 76 native form records**. Judging setup remains **0 rounds / 0 assignments / 0 reviews**. |
| Database/runtime security | **Pass**: new tables have RLS enabled; no public-schema PUBLIC/anon/authenticated table grants or disabled RLS tables; runtime configuration mode 0600; application database TLS and configured CA preserved. |
| Background work | **Pass**: 18 notification jobs and 26 file-verification jobs complete, no pending/running/failed jobs. Existing 21 delivery records remain delivered/provider-accepted. No test message was sent. |
| Capacity and rollback | **Pass**: rollback runtime retained. SHA-identical immutable inactive deployment copies were shared while preserving every path/byte and leaving active runtime files, WordPress and private uploads out of replacement. Reclaimed 126,944,488 bytes. A 360 MiB private temporary write succeeded and was removed. |

Live functional checks completed at **10:21 IST**, and final runtime/security/capacity verification at **10:23 IST on 16 November 2026**. Isolated browser results use the built frontend with browser API transport routed into the real service handlers, isolated PGlite database and local private storage; they are not described as a production judge-account test.

## Remaining operational steps and boundaries

- The owner still needs to invite actual judges, create rounds and assign work. Therefore an assigned judge's complete review cycle and invitation inbox delivery were **not exercised in production**. They were tested with synthetic local accounts/mail capture. No recipient was contacted by the setup.
- The WordPress picker shows the retained archive, whose latest source capture completed **13 November at 13:02:03 IST**. Subsequent source submissions/edits need an incremental sync before staff can judge the complete later source intake. Continuous source synchronization was not added.
- WordPress remains the participant credential/native-mail provider. Existing forms, deadlines, legal-page state and the original source site were preserved.
- Physical Safari/iOS/Android, assistive-technology and sustained-load testing were not performed. Hostinger deployment remains the existing verified SSH release process; GitHub validation builds are automatic.

The source-linked judging schema is additive migration `019_dedicated_judging.sql`, checksum `9ee9c99b192e9a2b5f15f71acd028262f3dc74162c8b5f6f65c47beea139b03d`. Private evidence is Git-ignored under `.local/judge-portal-20261116/`. Credentials, MFA setup, session cookies, invitation tokens and participant payloads are not included in this report.
