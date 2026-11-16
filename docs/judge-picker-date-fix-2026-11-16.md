# Judge picker original submission dates

Deployed to https://new.youthecosummit.com on **16 November 2026**. Application release: `7823a40c9bf4103e61ef3f92d5fdc23845030ab3`.

The preserved WordPress entry picker previously returned archive `captured_at` as the submission date. It now reads the original `payload.date_created`, returns capture time separately as `imported_at`, and sorts by the original submission date with absent values last. The display preserves the WordPress timestamp without interpreting its unqualified timezone in the reviewer's browser. Missing or invalid source dates display **Original submission date not recorded**; import time is never substituted. Native-site submission dates keep their existing formatting.

This is a read-only projection and display correction. No database migration, import, payload rewrite, file transfer, assignment snapshot change or source WordPress write was required.

| Verification | Status | Evidence |
| --- | --- | --- |
| Regression tests | Pass | Nine focused tests cover source/capture separation, ordering, absent and invalid dates, timezone independence, native behavior and unchanged archived rows. The tests reproduced the original failure before the correction. |
| Full validation | Pass | [GitHub Actions run 43817985233](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43817985233): 533 tests passed, two existing skips, typecheck, production build and standalone packaging successful. |
| Live original dates | Pass | All 578 eligible WordPress competition entries across ten competitions and 28 picker pages matched the read-only source-date baseline, including original-date ordering and separately retained import timestamps. |
| Desktop and mobile | Pass | Isolated Playwright Chrome checks at 1280px and 320px, using America/Los_Angeles and Asia/Kolkata timezones, showed source timestamps verbatim. Screenshots were inspected; no horizontal overflow or page errors. A browser-only round fixture exposed the real picker without creating a production round. |
| Access and native entries | Pass | Anonymous picker access denied; normal owner password/MFA access successful. Native picker timestamps retain their existing shape and display. |
| Record preservation | Pass | Before/after full-row fingerprints match for all 6,440 WordPress records, 30 immutable versions, 714 attachment metadata rows, 76 native form records and 26 native file rows. Stored source-date projections for all 3,318 eligible archived entries also match. Existing archive payloads, checksums and capture timestamps remain unchanged. |
| Judging preservation | Pass | Round, assignment and review row fingerprints unchanged. No production round, assignment, review, judge account or invitation created by these checks; no notifications sent. |
| Runtime and security | Pass | Active revision verified, private configuration mode 0600, database TLS/CA configured, public-table RLS enabled, no PUBLIC/anon/authenticated table grants, existing background jobs complete. Homepage/form configuration and invalid recovery-key denial also passed activation checks. |
| Upload capacity and rollback | Pass | A fresh 360 MiB private temporary write succeeded and was removed. Only verified byte-identical inactive compiled build copies were shared to retain headroom; file paths, contents and modes were preserved. User files and active runtime were excluded from replacement, and the previous release remains available for rollback. |

Live API/browser verification completed at **12:14:54 IST**; final runtime and capacity checks completed at **12:16:19 IST**. Private baselines, fingerprints, logs and screenshots remain Git-ignored under `.local/judge-picker-date-20261116/`. No credentials or private submission payloads are included in this report.

No pending requirement remains for this date correction. Existing owner-managed judge enrollment and assignments remain unchanged.
