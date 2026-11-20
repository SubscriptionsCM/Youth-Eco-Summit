# Admin dashboard clarity update

Deployed to https://new.youthecosummit.com/admin on 20 November 2026, application revision `6a2004cc2bf64c6e29ad03052461b42623baff01`.

The main view now prioritises four counts: student-registration forms, submitted competition entries, quality checks remaining and quality checks completed. Today's completed checks appear with the completed total. The scope states both websites and all years, with an expandable explanation of record counts, offline QC and the saved WordPress checkpoint.

Three task cards lead to submissions/QC, judging and school access. Judging progress comes from the existing combined report, removing a duplicate judging request. Archive/form/file storage totals are collapsed under “Earlier records & files,” with accurate labels and working browse links. Healthy background-task information no longer occupies the main dashboard; failed tasks still surface an action banner. Daily work appears first in navigation, with separate school, judging, historical-record and Tools groups. No database schema or business-data changes were needed.

## Verification

- [Release pipeline](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44702600910): typecheck, 622 tests across 82 files, production build and standalone packaging passed. Two existing tool-dependent tests remain skipped. One older UI assertion was updated to verify the new hierarchy instead of the removed “Forms received” label.
- Local browser checks passed at 1440px, 768px and 390px, covering populated/empty/error states, safe unavailable totals, refresh, keyboard history expansion, mobile-menu Escape and action destinations.
- Production checks passed at the same three widths, with six screenshots of default/expanded-history states. Counts match the source APIs; refresh reloads each count source once. All three task cards and both form-browsing destinations open correctly. No horizontal overflow, JavaScript errors or HTTP 5xx responses occurred.
- Whole-row fingerprints and counts match before/after for all 17 monitored original tables and all three credential records. No production business records were written and no invitations or messages were sent.
- The deployed revision, database TLS, private configuration permissions, seven RLS-protected metadata tables and restricted grants were verified. All 44 existing jobs remain complete. Previous runtime retained for rollback.

Private browser captures and detailed results are Git-ignored under `.local/dashboard-clarity/`. This interface change does not create historical QC decisions, judge assignments, school grants or a later WordPress sync; those operational boundaries remain as documented in the school/QC implementation report.
