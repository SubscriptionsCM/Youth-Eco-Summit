# School workspace, quality checks and progress reports

Implementation of the remaining voice-note requirements uses the existing Next.js application, WordPress archive and dedicated judging layer. The VPS migration remains postponed.

## Staff workflows

- **Submissions & quality checks** at `/admin/reports`: student-registration records, submitted competitions, QC completed/remaining/today, category coordinators and dedicated judge progress. Year, school, competition and source filters have explicit scope. Drafts do not enter completed-submission or QC totals. Search/status filters apply to the entry list.
- QC decisions are independent of judging, versioned, source/file-bound and audited. A source or attachment change requires a recheck. Coordinators can be changed without creating accounts or sending invitations.
- **Link school records** at `/admin/school-records`: review earlier registrations or entries that have no permanent school ID, verify the original, choose the registered school and record a reason. Manual links are versioned and source-bound; they can be removed without deleting the source or audit history. A changed original requires verification again.
- **School access** at `/admin/school-access`: staff verify representative requests, approve/decline access or revoke existing access. Stale decisions are rejected; history and reasons remain available.
- Judge management displays active assignments, completed reviews and competitions per reviewer. Reporting uses the dedicated judging tables and flags unavailable reviewer accounts.

## School workflows

- **My school** at `/school`: participant accounts request access through the registered-school picker. Requests alone grant no access and send no messages.
- Approved representatives see only explicitly linked records for their school, with submission-year and student search filters, student cards and competition totals. Individual links use a unique authenticated student account or an unambiguous participant email in a supported form slot. School names and spare team fields do not establish identity.
- Name, class and section corrections append versioned roster corrections with reasons. Original registrations, submitted work, eligibility and file contents stay unchanged. Private guardian contacts, answers and files are excluded from school responses.

## Reporting boundaries

Registration totals are submitted records, not unique people. Known earlier student-registration forms are included; mixed-purpose historical forms remain in the archive without an invented student classification. WordPress figures describe preserved records, not a continuously synchronized live counter. Missing school identities and original dates remain explicitly unknown. QC begins pending until staff record individual decisions; the inconsistent offline 17 November totals were not invented as per-entry completion history. Judge accounts, rounds and assignments remain owner-managed.

## Validation and delivery

Deployed to https://new.youthecosummit.com/ on 20 November 2026. Application revision: `bb813e91b94b5e140dbdde38e71be279ba565958`. The previous runtime is retained for rollback. No VPS migration, paid changes, invitations or test notifications were performed.

| Verification | Result |
|---|---|
| [GitHub validation and release build](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/44695794323) | Pass: typecheck, 622 tests across 82 files, production build and standalone package; two existing tool-dependent tests skipped. |
| Isolated end-to-end workflows | Pass: nine workflows and ten captures, including school approval/revocation, roster corrections, historical linking/removal, QC completion, coordinator changes and judge assignment/draft/download/final scoring. Original fixture submissions unchanged. |
| Production desktop/mobile | Pass: seven pages at 1440px and 390px (14 captures), no horizontal overflow, JavaScript errors, server errors or error alerts. |
| Production authorization and reports | Pass: owner and participant sign-in/sign-out, report/filter reconciliation, school-access reads and participant denial of all three staff APIs. |
| Original-data preservation | Pass: counts and whole-row fingerprints match for all 17 monitored original tables, including 6,440 WordPress records, 714 attachment metadata rows, 76 native form records and 26 native file rows. All three credential fingerprints unchanged. Attachment binaries were not rewritten or freshly rehashed in this update. |
| Database and worker health | Pass: TLS certificate verified, private configuration mode 0600, all seven new tables have RLS, no PUBLIC/anon/authenticated table grants or trigger-function execution grants, migration checksums match. All 44 existing jobs complete; zero failed jobs. |

Write-path acceptance used the real services and isolated local data. Production business records were only read; no real school grants, corrections, QC decisions, judge assignments or invitations were created for testing. The first production mobile test incorrectly waited for a desktop-only sidebar to be visible; its readiness check was corrected for the collapsed mobile navigation, then all 14 views passed. An existing notification-test cleanup was changed to avoid truncating the new append-only school-link history; production audit protections remain intact.

## Remaining operational setup and source limitations

- Staff must verify school representatives and approve access. School names alone never grant access.
- Staff must verify historical school links using the original forms. The live mapper currently lists 269 unlinked student, educator or competition records; these were not automatically assigned to schools.
- Earlier offline QC decisions need approved entry-level reconciliation. The 17 November summary contains inconsistent totals and cannot safely create individual completion records. All 588 supported submitted competition records therefore begin pending in the new QC layer; this does not imply that no offline checks happened.
- The owner must add real judges, rounds and assignments. Production has no judge accounts, rounds or active assignments; the complete judging write lifecycle was verified in isolation.
- The WordPress archive remains the existing saved checkpoint, not a continuous sync. This update did not import later WordPress intake. Eight pre-existing archived competition entries lack attachments (four spoken-word, two short-film, one case-study and one business-model entry); they remain preserved and unavailable for assignment until their source files are reconciled.

Private detailed evidence is retained in `.local/school-qc-browser/result.json` and `.local/school-qc-release/` (production results, screenshots, before/after fingerprints and database-health output). These files are Git-ignored and must not be published because screenshots can contain participant data.
