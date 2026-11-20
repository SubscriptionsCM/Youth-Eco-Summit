# School access, quality checks and reporting

The owner authorized completion of the gaps identified in the voice-note audit. Extend the current reference-form workflow on new.youthecosummit.com; the VPS migration remains postponed.

## Records and reporting

Read native forms and supported archived WordPress forms through one server-side projection. Preserve every source row, original date, file and submission answer. Match schools only with explicit permanent IDs; never infer access from school names. Report submission year separately from the summit edition. Native records and archived records remain distinguishable. Count registration records, not unique people; competition submissions exclude drafts and other forms. Show reporting scope and unknown dates/school links explicitly.

## School workspace

Provide a participant-only My school workspace. Representatives request access to a registered school; active staff approve or revoke requests after verification. Requests do not grant access or send notifications. Existing verified school access must not automatically expose unrelated schools. Approved representatives see only their school's linked students, competition progress and year filters, not private submission files or guardian contacts. Student name/class/section corrections are separate versioned records with reasons and an audit trail; immutable original forms remain unchanged. School representatives cannot modify submitted work, scores or contact/account identity. Staff can review access requests in the admin portal.

## Quality checks

QC is separate from judging. Staff record pending, in progress, completed or needs attention against a submitted competition record. Missing QC metadata means pending, not completed. Optional category coordinators use a staff-entered name; no Preeti/Pragya/Abhishek accounts or historic completion counts are invented. Optimistic version checks prevent lost updates. Every change records actor, reason, original source reference and time; source answers are untouched. Reports show category submissions, completed, remaining and completed today using India time, plus attention/in-progress detail. Daily counts measure current completed records whose completion date is today, and explain this scope. The conflicting 17 November manual report is not imported as fact.

## Judge progress

Aggregate active assignments and submitted reviews from the dedicated judging tables, including per-judge/per-competition summaries, rather than the unused legacy judging tables. Existing assignment, file, scoring and final-lock rules remain in effect. Owner remains responsible for actual judge accounts, rounds and assignments; do not send invitations or create synthetic production records.

## Security and delivery

Additive migrations with RLS enabled and browser database privileges revoked. All reads/writes check active roles, origin, ownership and source status; no new direct browser database access. Integrate pages with the current accessible portal controls, useful empty states and mobile cards. Verify new actions against isolated real database fixtures, run regression tests/typecheck/build, test desktop/mobile in a local browser, and verify live reads after deployment. No production business writes merely to obtain a test pass, no mail and no paid changes. Preserve unrelated working files. Continuous WordPress syncing and missing original uploads are operational data dependencies, not fabricated by these features.
