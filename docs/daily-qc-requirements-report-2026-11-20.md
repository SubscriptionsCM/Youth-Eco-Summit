# Daily submission and QC reporting — 20 November 2026

## Requirements audit

Before this change: **2 complete, 2 partial, 2 missing**.

| Requirement | Before | Implemented behavior |
|---|---|---|
| Five overall statistics | Partial | Five visible cards: all submitted registration forms, submissions, completed QCs, QCs completed today, pending QCs. |
| Category-wise QC details | Complete | All six requested fields remain available on desktop and mobile, with a designated-person label. |
| Assign responsibility, update QC status, track completion dates | Partial | Existing audited responsibility and status controls retained; QC completion timestamps now visible. |
| Date filters and exact daily report format | Missing | India-calendar report date; cumulative original submissions through that day; recorded QC and responsibility history; exact supplied report labels, category order and text layout. |
| Copy/export | Missing | Copy report, UTF-8 TXT and spreadsheet-safe CSV; all use the same calculated preview. |
| Dynamic database statistics | Complete | Calculated from actual retained submission records and QC metadata, without importing sample totals. |

## Counting and history

The user confirmed that Total Registrations means **all submitted student, educator and school registration forms**. It counts records, not unique people or login accounts. Competition drafts are excluded. School, competition and original submission-year filters apply as described on the page; text search and QC-status filters only narrow the entry list.

Choose a report date in **Admin → Submissions & quality checks → Daily Submission & QC Summary**. “Today” means that selected India-calendar day. A subsequent reopening does not rewrite an earlier recorded completion. Editing notes on an unchanged completed check preserves its completion timestamp. Selected dates survive live refreshes and saves.

Historical reports use currently retained submissions and files plus recorded QC decisions. A changed source or file needs a new QC check. Entries without usable original dates are disclosed and excluded from dated reports. Offline checks without individual database completion evidence remain pending; the sample document is a layout reference and is not seeded as factual QC data.

## Verification

- Focused database, history and exact-format tests: **42 passed**.
- Full CI: **671 passed, 2 existing tool-dependent skips**, 89 test files; TypeScript, production build and Hostinger packaging passed.
- Browser tests at **1440, 768 and 390 pixels**: five metrics, report dates, no horizontal overflow, copy, TXT/CSV downloads, selected-date preservation, responsibility saves, QC reopening and visible completion timestamps passed.
- Write-path tests used an isolated local database. Its original submissions remained unchanged; no invitations or notifications were generated.

## Production result — Pass

Deployed commit `de5979ecf0a5e777f2027d29dd5f1a4e8ea7bd00` to the existing [Hostinger QC reporting page](https://new.youthecosummit.com/admin/reports). The previous runtime is retained for rollback. [Full CI run](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44729206485) passed.

Live admin read-only tests passed at 1440 and 390 pixels: five metric cards, dated preview, exact category order, clipboard, TXT and CSV downloads, no page errors, no HTTP 5xx responses and no horizontal overflow. Invalid dates return 422. Live report API responses measured about 1.4–1.8 seconds in this verification; this is a functional check, not a load test.

Before/after fingerprints matched across **20 original and QC-related tables**, including submission records, attachment metadata, QC history, category responsibility, judging data and invitations. Account credential fingerprints also matched. No production business records were created or modified and no messages or invitations were sent during this audit.

All six requested reporting features are implemented and verified. Current all-years, all-schools totals at verification:

| Statistic | Actual database value |
|---|---:|
| Total registrations | 338 |
| Student / educator / school registration records | 182 / 81 / 75 |
| Total submitted competition entries | 588 |
| Recorded QCs completed | 0 |
| Recorded QCs completed today | 0 |
| Pending QCs | 588 |

**Remaining operational input:** Staff must record past offline QC decisions against the corresponding submissions before they can count as completed in the app. The supplied document's example totals and designated names were not converted into invented individual QC records. One existing category responsibility was preserved unchanged.
