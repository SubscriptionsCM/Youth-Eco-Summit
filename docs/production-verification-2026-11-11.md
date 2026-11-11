# Production verification — 11 November 2026

The updated application is live at [new.youthecosummit.com](https://new.youthecosummit.com/) on Hostinger. The deployed application revision is `4c40024143246b94107525e79a2a5f520f9ded67`, built by [successful GitHub Actions run 42977195422](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/42977195422). Its build, type checking, 452 passing tests and isolated worker startup passed; two existing tests were explicitly skipped.

## Deployed changes

- Forms, account-provider selection and dashboard configuration now evaluate at request time. The current WordPress deadline, 15 November 2026 at 23:59 IST, is reflected in validation and site copy.
- Existing participant credentials are checked against the current WordPress installation through a private PHP bridge. Supabase retains application sessions, source-ID identity relationships, drafts, submissions and file metadata. WordPress remains an authentication and mail dependency; it must remain available.
- Uploads use private Hostinger filesystem storage outside the web root. Multipart transfers have signed, scoped authorizations. Downloads recheck ownership and use short-lived authorizations, attachment disposition and private cache headers.
- The live worker verifies MIME, SHA-256, malware and PDF/media metadata. ClamAV signature refresh, a clean PDF scan and standard harmless positive-detection acceptance passed.
- Native Forminator notification planning and delivery are integrated with immutable submission context and an explicit review state for uncertain deliveries. Sixteen native notification plans rendered successfully in WordPress without sending them. The separately authorized plain delivery test reached the approved subscriptions mailbox.
- Submitted file links and terminal verification failure feedback are implemented. The contact page links to the retained source contact form.

## Preserved archive

The read-only current WordPress capture is dated **2026-11-11T03:47:55Z** and reported zero unresolved attachments. Incremental import added 294 records and 154 files without replacing existing records. Readback verified every added record, file length and SHA-256.

The retained archive contains **6,180 original records**, including **5,760 historical form entries, 245 users and 125 school records**, plus **579 attachments totaling 3,865,160,727 bytes**. Earlier records absent from the current source were preserved. Nine changed user snapshots were retained separately in an immutable version table; readback, retry idempotency and preservation of their original payloads passed. The version table has RLS enabled and no PUBLIC, anonymous or authenticated API grants. The archive has no public table grants.

Private exports, credentials, runtime configuration, signed capabilities and detailed evidence are excluded from Git. The previous application release and routing backup are retained. LiteSpeed activation required restarting only the process whose executable and working directory matched the previous app. Application restart markers follow [LiteSpeed's documented mechanism](https://docs.litespeedtech.com/lsws/cp/cpanel/cloudlinux/).

## Production acceptance

Two normal-API acceptance runs each passed 12 checks. One uploaded the published 678,735-byte guidelines PDF; the second uploaded a synthetic 6,301,627-byte PDF across two parts. Both exercised draft capability access, denied unauthorized reads and cross-origin mutations, optimistic locking, required-field validation, private upload, queued worker verification, authorized download, full byte/hash comparison and range requests. The labeled test drafts remain unsubmitted; these runs sent no team notifications. A deployed synthetic invalid account login correctly reached the WordPress validator and returned 401.

All 29 audited public routes returned HTTP 200 on both source and destination. This establishes route availability, not completion of client-rendered forms. The refreshed first-party link and asset audit is recorded privately alongside the route inventory.

## Remaining acceptance

- Human signup, emailed-code verification, initial dashboard access, password reset and post-reset login have passed. Browser automation timed out while attaching or evaluating pages, so broader visual and mobile acceptance remain unverified.
- Real student/educator submissions, all ten competition workflows, a film at the source allowance, final receipts and notifications. Test delivery to the additional native team addresses still needs authorization; the legacy student administrator destination needs an owner decision.
- Staff owner/admin/judge invitation and MFA acceptance using approved operator accounts.
- Approved legal text remains unavailable from the source's public configuration. Existing source content was preserved; no replacement policy was invented.
- A final incremental capture is required at eventual WordPress cutover because the source remains live and accepts new activity. Permanent removal of the WordPress account/mail dependency and automatic Hostinger deployment are separate remaining setup requirements.

Full end-to-end parity is **not yet signed off**.

## Signup compatibility correction

The human signup attempt reached emailed-code verification, then failed in the private account bridge before creating a source account. Read-only inspection confirmed that the published native registration mappings and InnoDB tables match the expected policy. The source subscriber role also includes `read_private_locations` and `read_private_events`; the bridge's original reader allowlist rejected these existing permissions.

Private helper patch `f4574caff7f8e53da6d6433037ae65dce5a229b2` now permits those two specific native reader capabilities. Administrator, private-post and unknown enabled capabilities remain blocked. Student and educator PHP create-action regressions reproduced the failure before the change, then passed after it. All 34 focused PHP/account tests, type checking and PHP lint passed; independent review found no Important or Critical issues. The helper was deployed atomically with SHA-256 readback, mode `0600` and the previous helper retained privately. The Next.js application bundle is unchanged. The user subsequently confirmed that the dashboard opened after verification. A read-only database check independently confirmed one active participant account, a source identity binding, one consumed confirmation challenge and an active session. No local password was stored and no staff role was granted. Password-recovery acceptance remains pending.

The subsequent [full CI run 42962126186](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/42962126186) passed 415 tests with two existing skips, type checking, the production build, worker startup and standalone packaging.

## Participant recovery correction

The user received the recovery email, but its plain link was not clickable in their client and led to WordPress's forgotten-password page. The application now sends an HTML anchor to its own `/reset-password` page. Native key and login travel in the fragment, which the client removes from the address before accepting password input. API responses and reports contain no reset link, key or password. The form requires matching passwords and returns to application sign-in after success; staff recovery is separate.

WordPress still generates, expires and validates the key, performs the password update and fires its native hooks. The adapter checks eligibility, refreshes the user cache and revalidates the key under a per-user advisory lock. It confirms the changed password and consumed key, then revokes linked application sessions without automatically signing in or creating an identity. Subsequent session reads also require a matching current source credential fingerprint.

Source inspection found Ultimate Member's strong-password rules (8–30 characters), approval checks and three-request limit. The adapter runs those existing validation hooks in scoped state, preserves native success notifications and recovery-flag cleanup, and restores form, cookie and user context. Native user resolution is used before policy checks; aliases and ambiguous email ownership cannot skip the checks. A read-only check against the live source accepted a strong synthetic candidate and rejected weak, short, overlong and backslash-containing candidates, with context restored and no password or reset-key changes.

The final independent review found no Important or Critical issues after cache/replay and alias-resolution regressions were corrected. Full CI passed 452 tests, two existing skips, type checking, production build and packaging. Hostinger activation verified the new page and a real invalid-key rejection; rollback and the prior release are retained.

At `2026-11-11T07:22:48Z`, one request through the production API generated a native reset key, advanced the source request counter to one and returned a successful mail confirmation for the authorized subscriptions mailbox. The agent did not change the password. Browser controls again failed to attach, so clickable email, visual reset-form acceptance, human password change and subsequent successful login are pending the user's confirmation.

The user subsequently confirmed that resetting the password worked. A read-only database check verified that the account remains an active participant with no local password, its previous session is revoked, and the account authentication version has advanced beyond that session. No current sign-in session was present at that check, so login with the new password and return to the dashboard remain pending.

The user then confirmed that signing in with the new password opens the dashboard. The account recovery acceptance path is passed. A labeled synthetic contact draft (`YES-12146-BF09EEE1-1BC`) has been validated and saved without submission or notifications. Remaining signed-in form automation awaits dedicated credentials in a Git-ignored local configuration file; additional team-address notification tests await authorization.
