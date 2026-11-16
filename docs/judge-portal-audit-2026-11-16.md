# Judge portal setup and end-to-end audit

The clearer account setup is deployed at https://new.youthecosummit.com in release `8239584b4997d28404f23ecace8335258bcb3259`.

The invitation screen now explains three steps: add the account to an authenticator app, create a password of at least 12 characters, and enter the current six-digit app code. It offers a locally rendered QR code, a same-phone app link and separate manual account/issuer/setup-key details. Copying the key has an accessible fallback. It explains that the security code comes from the authenticator app, rather than email. Existing authentication endpoints, credentials and invitation records were not changed by this UI update.

## Test results

| Check | Status | Result |
| --- | --- | --- |
| Full automated validation | Pass | [CI run 43820871123](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43820871123): 538 tests passed, two existing skips; typecheck, production build and standalone packaging succeeded. |
| QR and manual setup | Pass | Five focused tests cover local QR generation, correct manual details, clipboard failure, QR-rendering failure and invalid links. An independent QR decoder recovered the exact setup value from the actual browser canvas. |
| Full judge workflow | Pass — isolated | Two complete browser runs, with nine checkpoints each for native-site and preserved WordPress-shaped entries, used the built frontend, actual service handlers, isolated database and private test storage. They covered owner and judge password/MFA sign-in, seeded setup acceptance, round and assignment creation, draft resume, file download, scoring and deductions, final confirmation/locking, retained review history and revocation. Email delivery was disabled; no invitations were sent. |
| Deployed setup on desktop/mobile | Pass | Production JavaScript and styles checked at 1280px and 320px with synthetic browser-only setup data. QR decoding succeeded, no overflow or page errors, and manual details remained readable. No real invitation was opened or consumed. |
| Preserved archive checksums | Pass | All 6,440 archived records and 30 immutable versions matched their SHA-256 payload checksums; version lineage was valid. All 4,189 observations in the completed source capture were retained as originals or immutable versions. |
| Original submission dates | Pass | All 578 eligible WordPress competition entries across ten competitions and 28 picker pages matched original source dates, with original-date ordering and separate import timestamps. |
| Complete stored attachment integrity | Pass | All 714 retained attachments, totaling 5,236,953,780 bytes, were read in full on Hostinger and matched exact size and SHA-256. Parent/source relationships and the complete source attachment inventory matched. No files were imported or repaired. |
| Assignment readiness | Pass: 570; Fail: 8 source records | All 570 complete, file-backed entries passed the actual source-to-judge mapping and required-file checks. Eight other completed source records have no retained attachments or upload-field metadata and are correctly rejected for assignment. See below. |
| Draft/nonfinal protection | Pass | All 298 other competition records remained outside the assignment picker. They were retained in the archive. |
| Protected live attachment delivery | Pass | All 714 retained attachments returned authorized exact-length HEAD and range responses with private/no-store headers. Anonymous access to a valid grant was denied. Six complete downloads, one per retained MIME type (4,532,060 bytes total), matched full SHA-256. The targeted run also verified 1,011 protected record detail pages. |
| Invitation email delivery | Not exercised | No invitations were sent. Setup acceptance used seeded local fixtures; the production setup display used synthetic browser-only data. |
| Live read connectivity | Pass with retries | The initial broad archive detail scan stopped on a connection failure. The targeted final run completed successfully with two bounded retries. No request remained failed in that run; recurring connection failures should be investigated if observed again. |
| Data preservation | Pass | Before/after full-row fingerprints match for all 6,440 archive records, 30 versions, 714 attachment metadata rows, 76 native form records, 26 native file rows and the existing invitation. Round, assignment and review tables remain empty and unchanged. |
| Runtime security | Pass | Correct active revision, private runtime mode 0600, database TLS/CA enabled, public-table RLS enabled and no PUBLIC/anon/authenticated table grants. Existing notification/file-verification jobs remained complete. |
| Upload reserve | Pass after remediation | The initial reserve probe failed. Sharing only SHA-identical inactive compiled build copies and deployment archives recovered space while preserving paths, contents and modes. A fresh 360 MiB private temporary write succeeded and was removed. Active runtime, user files and source WordPress data were excluded from replacement. |

Live file/date/setup checks completed **16 November 2026 at 13:21:41 IST**. Both full isolated review cycles passed with zero external emails.

## Eight incomplete source entries

| Competition | Completed records without original upload metadata or attachments | Status |
| --- | ---: | --- |
| Spoken word | 4 | Fail — source incomplete |
| Short film making | 2 | Fail — source incomplete |
| Case study | 1 | Fail — source incomplete |
| Eco business model | 1 | Fail — source incomplete |

These eight records are present in the source capture but have zero source attachments and zero recorded upload-field values. Their stored records remain unchanged. Required-file validation blocks assignment; restoring or reconciling the original uploads is an owner follow-up and was not attempted under the instruction to preserve existing records.

## Scope and limits

This audit checks the preserved source checkpoint captured on **16 November 2026 at 10:47:47 IST**. It does not synchronize later WordPress activity.

No production invitations, judge accounts, rounds, assignments, reviews or final submissions were created, and no notification emails were sent. Production has no configured judging rounds or assignments, so the complete assigned-judge lifecycle was verified in isolation rather than by changing live data. Live archive/file authorization and the deployed setup were checked separately.

The full inventory export was blocked by automatic approval review. The completed archive audit returned only totals and grouped results; truncated test output was discarded. Locally retained preservation evidence consists of table fingerprints, and no full production audit inventory was exported. Private credentials, setup keys, user payloads, filenames and download grants are excluded from this report. Test logs, aggregate evidence and masked screenshots are Git-ignored under `.local/judge-audit-20261116/`. Previous deployment and rollback paths remain available.
