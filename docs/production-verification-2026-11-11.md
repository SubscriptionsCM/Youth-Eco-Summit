# Production verification - 11 November 2026

**12 November follow-up:** The homepage overflow and broader public desktop/mobile visual checks are now completed on deployed revision `f4c7f3a0141cfca47489ded753f738bbbb031b6f`. See [the visual verification report](visual-verification-2026-11-12.md) for 60 checks across 30 routes, five homepage widths and the current release evidence. The functional/migration results below describe the 11 November acceptance snapshot.

The application is live at [new.youthecosummit.com](https://new.youthecosummit.com/) on Hostinger. Active revision: `61df1ce59add154473f2d4daa99a7f41204dc08c`. [GitHub Actions run 43021439688](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43021439688) passed **481 tests**, with two existing skips, TypeScript checking, production build, isolated worker startup and standalone packaging. The previous release and routing rollback remain available.

## Completed production acceptance

| Area | Verified result |
| --- | --- |
| Public routes | All 29 inventoried destination routes returned HTTP 200 after the final deployment. Earlier source/destination link, asset and PDF comparison evidence is retained privately. Route availability is distinct from interactive acceptance. |
| Forms | All 16 active workflows submitted through normal production APIs: contact, nomination, school, partner, educator, student and all ten competitions. Seventeen labeled QA submissions are retained, including a fresh contact regression after the field correction. |
| Persistence | Required validation, scoped draft ownership, save/resume, optimistic locking, final receipts, repeat-submit idempotency, post-submit edit rejection and account-list readback passed. |
| Conditional fields | Student/educator contact visibility, hidden-value pruning, team eligibility, team-size bounds, duplicate names and class eligibility passed across all ten formats. Two-member branches and all four permitted three-member branches passed; these additional drafts remain unsubmitted and sent no mail. |
| Files | Private multipart transfers, size limits, MIME, SHA-256, malware checks, PDF word counts and media metadata passed. The film allowance was exercised at 125,829,120 bytes (120 MiB). Authorized complete downloads matched bytes and hashes; anonymous and unrelated-account access was denied. Range requests passed in the earlier upload runs. |
| Notifications | All 19 expected native notifications for the 17 labeled submissions are marked delivered, with no pending delivery. This means WordPress accepted native mail delivery, not confirmation of every recipient inbox. Recipients and native attachment policies were preserved. The user separately confirmed plain test mail, signup confirmation and recovery mail. |
| Participant accounts | User-confirmed signup, emailed-code confirmation, dashboard access, clickable application recovery link, password reset and login with the new password passed. Normal-API participant sign-in also passed. |
| Staff | The approved owner account passed password plus MFA login, wrong-password/code denial and TOTP replay denial. The user confirmed authenticator enrollment. Submitted-form inbox and historical archive collections, exact-ID detail reads and private historic downloads passed. Participant access to staff collections and unrelated history was denied. |
| School review | Only the labeled QA school was approved through the normal API. Directory inclusion and current status passed while original answers, form snapshot and receipt remained unchanged. The same QA school was then deactivated and retained; it disappeared from the active directory. |

Staff can sign in using **Admin or judge** at [the login page](https://new.youthecosummit.com/login). The new read-only collections are [submitted forms](https://new.youthecosummit.com/admin/reference-forms) and [WordPress archive](https://new.youthecosummit.com/admin/wordpress-history). The participant test account retains its participant role. No second staff or judge account was created or invited.

## Field and runtime corrections

The contact form now renders the native separate required first/last name fields. Name objects save and resume correctly; existing scalar submitted names remain readable. Structured name/address values use allowlisted scalar keys in human order, independent of JSONB key ordering. Raw archive records are unchanged. Address aliases are adapted only in temporary native notification rendering, with conflicting aliases rejected. Phone validation now follows each native configured mode instead of imposing a blanket digit count. Read-only rendering against the installed WordPress plugin confirmed both name parts and all tested address components without sending mail.

The hosted process wrapper caused PDF/media command results to be destructured incorrectly. An explicit UTF-8 execFile callback fixed the real failure; regression tests and all competition uploads subsequently passed. The current full release includes the correction.

The source deadline, **15 November 2026 at 23:59 IST**, is reflected in request-time configuration, UI and server validation. Participant recovery uses the application's reset page while preserving native key expiry, password rules, account approval, hooks and consumed-key/session checks.

Browser checks confirmed homepage partner navigation, participation tabs, FAQ disclosure and mobile navigation earlier in this run. The partner-carousel scrollbar is hidden. The final contact form was visually checked at desktop and 390-pixel mobile width: the required name fields stack correctly, with no horizontal page overflow on that form. Private screenshots are retained locally. A separate horizontal overflow was observed on the homepage in the agent browser; its cause was not established, so broader visual sign-off remains open. Browser capture/control was intermittent during parts of the audit. The complete submission matrix was exercised through normal APIs, rather than claiming every workflow passed through the browser UI.

## Preserved migration and integrity

Latest completed source capture: **2026-11-11T12:48:58Z**, with zero unresolved attachments. The latest append-only batch added **15 records and 14 attachments** (308,445,070 bytes). Eleven changed existing user observations were reconciled through immutable versions: four new versions, seven already retained. Original payloads were preserved and version retries were idempotent.

The retained archive now contains:

- **6,195 original records**: 5,774 historical entries, 246 users, 125 schools, 42 form definitions, six options and two posts.
- **593 private attachments**, totaling **4,173,605,797 bytes**.
- **13 immutable changed-record versions**, separate from their original records.

At **2026-11-11T13:00:24Z**, the final independent sweep verified all 6,195 record checksums, all 13 version checksums and baseline relationships, and every attachment's length and SHA-256. Retrying the latest batch reported 15 unchanged records and zero inserts. Older records absent from the current source remain retained. The archive has no PUBLIC, anonymous or authenticated API table grants; inspected identity, notification and version tables have RLS enabled.

Private Hostinger storage remains outside the web root; metadata and application records are in Supabase Free. Database connections validate TLS against the configured CA. Runtime configuration is in a private mode-0600 file, excluded from Git, and signed file access is scoped and checked again at download time. Credentials, passwords, MFA setup material, user exports, session cookies and draft capabilities are excluded from the repository and this report.

A fresh full-copy export reached Hostinger's account disk quota. It was retained for investigation. After hashing against retained immutable files, 578 newly generated duplicate copies were replaced with hard links, reclaiming 3,752,477,725 bytes while preserving their paths. Subsequent capture reused 579 verified existing attachments and copied only new files. No source file, original archive record or retained file content was removed or overwritten. Deployment and subsequent form writes succeeded after space was reclaimed. No paid plan was purchased.

## Remaining requirements and limits

- The public layout and homepage-overflow item was closed by the [12 November visual follow-up](visual-verification-2026-11-12.md). That pass covers public pages and signed-out access gates, not browser acceptance of every signed-in role/workflow.
- WordPress remains required for existing participant credential verification and native account/mail workflows. Do not remove it until a separate replacement is configured and accepted.
- The source still accepts activity. A final incremental capture is required when its submission workflow is closed or cut over; this report covers the capture timestamp above.
- The source exposes no approved published privacy/participation text through the inspected configuration. Existing source content was preserved; no legal policy was invented. New legal text requires approved content.
- GitHub validation builds are automatic. Hostinger deployment is currently an operator-verified SSH process. Automatic Hostinger deployment and any additional staff/judge onboarding remain separate configuration work.
- The new reference-form inbox and archive are read-only administration views. New reference submissions were not silently projected into the separate legacy judging schema or assigned inferred editions/student identities. Judging-specific acceptance requires explicit competition/edition and role configuration.

The normal form, account, storage, notification and owner-access acceptance described above has passed. **Full end-to-end visual and operational cutover sign-off remains open for the listed items.**
