# Production verification — 11 November 2026

The updated application is live at [new.youthecosummit.com](https://new.youthecosummit.com/) on Hostinger. The deployed application revision is `42e6c4e988808586e3dc0991d4fd148fbf079ef3`, built by [successful GitHub Actions run 42958015414](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/42958015414). Its build, type checking, 406 passing tests and isolated worker startup passed; two existing tests were explicitly skipped. Subsequent source-version checks passed nine focused tests and type checking.

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

- Human confirmation of normal signup, emailed-code verification, successful login, password recovery and dashboard access. Browser automation timed out while attaching or evaluating pages, so current visual and mobile acceptance remain unverified.
- Real student/educator submissions, all ten competition workflows, a film at the source allowance, final receipts and notifications. Test delivery to the additional native team addresses still needs authorization; the legacy student administrator destination needs an owner decision.
- Staff owner/admin/judge invitation and MFA acceptance using approved operator accounts.
- Approved legal text remains unavailable from the source's public configuration. Existing source content was preserved; no replacement policy was invented.
- A final incremental capture is required at eventual WordPress cutover because the source remains live and accepts new activity. Permanent removal of the WordPress account/mail dependency and automatic Hostinger deployment are separate remaining setup requirements.

Full end-to-end parity is **not yet signed off**.
