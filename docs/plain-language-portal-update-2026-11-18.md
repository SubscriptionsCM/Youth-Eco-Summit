# Plain-language portal update — 18 November 2026

Live site: https://new.youthecosummit.com/.
Application revision: `73aa8a5a3fa8b36662b4101f11b31d225aac6e37`.

The active portals now explain records through readable names, statuses and actions.
Administrators can use the website without interpreting JSON or database identifiers.

## What changed

- Background tasks show their purpose, status, attempts and dates. Completed tasks
  say that no action is needed. Only failed tasks offer a retry.
- The activity log shows the person, affected record and relevant changes, including
  before-and-after corrections and open/closed judging rounds. Private diagnostic
  values and unrelated sensitive fields are omitted from the display.
- Search accepts the task and activity names displayed on screen.
- Trash identifies the school, student or entry and summarizes related records.
  The owner confirms permanent deletion by typing DELETE; server permission and
  exact-record checks remain intact. Administrators cannot permanently delete records.
- Earlier entry history presents review progress, scores, eligibility, flags and
  jury decisions as readable information.
- Judges see familiar file labels such as PDF document and a plain-language scoring
  guide. File links and scoring rules remain unchanged.
- Submission download wording and common status labels are clearer. Student,
  educator and school registration workflows retain their existing rules.

The active site uses the dedicated portal workflow. Earlier administration modes
retain their original fallback details for compatibility.

## Verification

| Check | Status |
| --- | --- |
| Full CI suite | Pass: 577 tests across 75 files; two existing tool-dependent skips |
| Type checking and production build | Pass in GitHub CI |
| Focused UI, permissions and database-read tests | Pass: 39 |
| Desktop/mobile screen checks | Pass: 42 at 1366, 390 and 320 px |
| Real account/navigation checks | Pass: 27 using authorized owner and participant accounts |
| Database integrity | Pass: counts and complete-row fingerprints unchanged across 17 tables |
| Runtime and database security | Pass: expected revision, private configuration mode 0600, verified TLS, RLS and restricted table grants |
| Temporary file capacity | Pass: 360 MiB written and removed after capacity recovery |

Responsive checks used synthetic data for owner/admin task, activity and Trash views,
student/educator/school saved forms and judge scoring. Browser writes were blocked;
the Trash preview was answered locally with fixture data. Live checks also opened
actual task and activity details. No business records were edited and no invitations
or notifications were sent. No live judge accounts or assignments were created.

The preserved data includes 6,440 WordPress records, 30 record versions, 714 archived
attachment records, 76 website form records, 26 website file records and 126 schools.
Their original dates and metadata remain unchanged. Attachments were not modified.

CI evidence: https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44284894369.
Private test evidence is retained under `.local/plain-language-20261118/` and excluded
from Git. Initial local checks were affected by disk/resource limits; the complete
release passed CI and subsequent deployed browser checks.

Hostinger's quota was reached during a temporary-capacity probe. A redundant older
deployment installer was removed only after verifying its identical local archive
backup. Application runtimes and business data were retained, and the final capacity
probe passed. Hosting storage remains limited and should be monitored as uploads grow.
No hosting purchase or account upgrade was made.
