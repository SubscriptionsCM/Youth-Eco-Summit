# Unified forms and submissions

Deployed to https://new.youthecosummit.com/admin/reference-forms on 20 November 2026. Final application revision: `8ae0f93f2905cd71ca1b80881e4804160015614e`.

Staff now use one **Forms & submissions** list, search, form-type filters and pagination across all 6,018 available forms. Origin-based menus, separate archive counters and source selectors were removed from the dashboard, reports, school-record linking and judge picker. Existing archive-page URLs lead into the same list and preserve search/filter context. Original identifiers remain available for traceability.

The participant dashboard combines its authorized records in All forms, Drafts and Submitted views. Existing ownership checks and the most-recent-200 native-form limit/notice remain in place. Draft continuation is retained where supported; read-only records stay read-only. School representatives still require explicit approved school access. No identity or school grant is inferred from names, school text or contact details.

The judge picker lists supported submitted competition entries together. A mixed selection is validated and assigned in one transaction, with source-qualified identities, duplicate-safe retries and all-or-nothing rollback. The previous low-level assignment interface remains compatible. No production judge invitations, rounds or assignments were created for testing.

Original dates use one readable calendar format, with the original timestamp retained in the time element. All 2,081 supplemental records retain their original dates, and their three form identities are recognized. Only verified semantic fields are presented; unknown opaque fields, numeric metadata without authoritative definitions, credentials, logs and storage URLs remain private. Raw originals are unchanged. School-name display follows the original form's school field and conditional custom-school field, avoiding the previous educator-state/school confusion.

## Verification

- [Final pipeline](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44720493788): typecheck, **640 tests passed across 87 files**, production build and standalone packaging passed. Two existing tool-dependent tests remain skipped.
- Isolated browser acceptance: 12 desktop/tablet/mobile captures passed. Shared search/type filters, original detail dates, an authorized exact-byte attachment download, an atomic mixed judge assignment and participant isolation were checked. Original fixture records and file metadata stayed unchanged.
- Production verification: 16 desktop/mobile views passed with no horizontal overflow, JavaScript errors or HTTP 5xx responses. Shared collection/search/type filters, year-filtered reports, sign-in/sign-out and participant denial of staff APIs passed. An educator's displayed school was compared with its original form field and matched.
- An anonymous request to the combined staff collection returned 401. A real browser followed the former archive URL into the unified collection with search preserved; Next.js supplies this compatibility redirect through streamed metadata.
- Read-only full-data reconciliation matched **all 6,018 eligible record identities**, including matching UUIDs in different namespaces without merging. First/last page reconciliation and all 2,081 supplemental original dates passed; no original date was missing in this dataset. Sample host-side list queries took 1.75–1.97 seconds; the combined competition picker took 0.66 seconds. These are sampled timings, not a new concurrent load test.
- Whole-row counts/fingerprints matched across all 17 monitored original tables and all three credential records. Submission/file contents and permissions were not rewritten. No migrations, paid changes, production business writes, invitations or test notifications were performed by the audit. Attachment binaries were not freshly rehashed in this release; an isolated protected download was checked byte-for-byte.
- Final runtime revision, verified database TLS, private configuration mode 0600, seven protected metadata tables and restricted browser grants passed. All 44 existing jobs remained complete. Previous runtimes are retained for rollback.

The collection includes available forms of all statuses and years. Operational report totals count supported submitted registrations/competition entries; these are not the same as the full record-library total or unique-person counts. This release combines existing available records; it does not perform another external import, create offline QC completion history or automatically merge people. The postponed VPS migration remains untouched.

Private detailed evidence and authenticated screenshots are Git-ignored under `.local/unified-records/` and must not be published.
