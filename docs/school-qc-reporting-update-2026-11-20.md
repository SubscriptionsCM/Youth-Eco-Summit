# School workspace, quality checks and progress reports

Implementation of the remaining voice-note requirements uses the existing Next.js application, WordPress archive and dedicated judging layer. The VPS migration remains postponed.

## Staff workflows

- **Submissions & quality checks** at `/admin/reports`: student-registration records, submitted competitions, QC completed/remaining/today, category coordinators and dedicated judge progress. Year, school, competition and source filters have explicit scope. Drafts do not enter completed-submission or QC totals. Search/status filters apply to the entry list.
- QC decisions are independent of judging, versioned, source/file-bound and audited. A source or attachment change requires a recheck. Coordinators can be changed without creating accounts or sending invitations.
- **School access** at `/admin/school-access`: staff verify representative requests, approve/decline access or revoke existing access. Stale decisions are rejected; history and reasons remain available.
- Judge management displays active assignments, completed reviews and competitions per reviewer. Reporting uses the dedicated judging tables and flags unavailable reviewer accounts.

## School workflows

- **My school** at `/school`: participant accounts request access through the registered-school picker. Requests alone grant no access and send no messages.
- Approved representatives see only explicitly linked records for their school, with submission-year and student search filters, student cards and competition totals. Individual links use a unique authenticated student account or an unambiguous participant email in a supported form slot. School names and spare team fields do not establish identity.
- Name, class and section corrections append versioned roster corrections with reasons. Original registrations, submitted work, eligibility and file contents stay unchanged. Private guardian contacts, answers and files are excluded from school responses.

## Reporting boundaries

Registration totals are submitted records, not unique people. Known earlier student-registration forms are included; mixed-purpose historical forms remain in the archive without an invented student classification. WordPress figures describe preserved records, not a continuously synchronized live counter. Missing school identities and original dates remain explicitly unknown. QC begins pending until staff record individual decisions; the inconsistent offline 17 November totals were not invented as per-entry completion history. Judge accounts, rounds and assignments remain owner-managed.

## Validation and delivery

New isolated database tests cover authorization, conflicting school metadata, original dates, drafts, school-scoped reads/corrections, approval races, stale updates, valid team/account associations, file-bound QC, India-time completion dates and dedicated judge progress. Browser acceptance uses the real service functions with synthetic local data and disables external messages. Production verification is read-only for business records and compares preserved-table and credential fingerprints. Release results are recorded after deployment; implementation is not itself a claim of production acceptance.
