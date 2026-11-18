# Admin essentials cleanup — 18 November 2026

Published to https://new.youthecosummit.com/ on Hostinger.
Application revision: `1093a9d03c8a3304b57b2179784a7bf5b02dea93`.

## Changes

The active admin navigation has seven destinations instead of 21: Overview,
Forms inbox, WordPress archive, Schools, Manage judging, Staff accounts and Tools.
Duplicate student, educator, nomination, enquiry and entry screens now redirect
to the current Forms inbox, retaining relevant search and school filters.
Earlier judging screens redirect to Manage judging. Unused earlier configuration,
import and file-menu screens redirect to Tools. Existing database tables and APIs
are retained for compatibility; this release contains no database migration.

Tools retains Background tasks, Activity log and Trash, together with links to
submission files in the inbox and archive. Staff details use readable fields;
internal identifiers and redundant raw JSON are removed from school/staff displays.
Unsupported staff actions are hidden consistently with existing server permissions.
Owner invitations, school actions, submission corrections, private file access,
judging and recovery remain available. Public and participant/judge navigation
were preserved.

## Verification

| Check | Result |
| --- | --- |
| CI tests | Pass: 560 passed, two existing environment-dependent skips |
| Type checking and production build | Pass |
| Focused navigation/UI tests | Pass: 22 |
| Deployed owner/admin UI, seven screens at 1366/390/320 px | Pass: 42 screen checks, no overflow or JavaScript errors |
| Live owner/participant sign-in, core and Tools pages, mobile menus, aliases and public-site regression | Pass: 27 read-only checks |
| Record integrity | Pass: counts and complete-row fingerprints unchanged across 17 tables |
| Runtime and security | Pass: revision, private configuration mode 0600, verified database TLS, RLS enabled and no public/client table grants |
| Processing jobs | Pass: all existing jobs complete |
| Temporary storage capacity | Pass: 360 MiB written and removed in the private deployment temporary directory |

The two CI skips require `pdftotext` and `ffprobe`, which were absent on the CI
runner. This cleanup does not change file inspection. Browser role fixtures were
read-only; live checks used the existing authorized test accounts. No invitations,
notifications, submissions, assignments or business-record edits were performed.
Mutation workflows were covered by automated tests rather than new production writes.

Initial concurrent browser runs encountered navigation timeouts and one third-party
reCAPTCHA error. Isolated repeat runs passed all 42 UI and 27 live checks with no
JavaScript errors; no repeatable application defect was established.

## Preserved data and deployment

Unchanged records include 6,440 WordPress records, 30 record versions, 714 archived
attachment records, 76 website form records, 26 website file records, 126 schools,
existing invitations and judging data. The other earlier workflow tables remain
present and empty. No content, submissions, original dates or attachments were deleted.

Hostinger initially rejected staging because of its disk quota. The failed attempt's
verified temporary archives were removed. Five duplicate installer copies from an
older deployment were backed up locally and checksum-verified before removing the
remote installer copies, reclaiming 218,314,742 bytes. Sharing identical immutable
compiled files reclaimed a further 165,877,676 bytes while preserving their paths,
contents and permissions. Active and rollback runtimes, runtime configuration,
WordPress files and private attachments were retained. No hosting upgrade was purchased.

Evidence is retained in the Git-ignored `.local/admin-essentials-20261118/` directory.
CI: https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44260679726.
No pending requirement blocks this cleanup.
