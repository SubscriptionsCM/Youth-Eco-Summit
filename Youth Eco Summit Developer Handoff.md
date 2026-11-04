# Youth Eco Summit Website Developer Handoff

Prepared for the development team on 29 September 2026  
Stack: Next.js and PostgreSQL  
Basis: meetings of 28 and 29 September, the supplied WhatsApp discussion, and Rudhraksh’s latest requirements

Build a central Youth Eco Summit platform for school and student registration, competition submissions, administration, and judging. Admins must be able to find every school, student, entry, and retained file in one place. Judges must see only the submissions assigned to them. Deleting a record must move it to Trash before any permanent removal.

The latest instruction governs storage: retain all submitted information and files under organizer control and make them accessible through the website. The earlier Drive or YouTube link-only plan, and proposals to save only shortlisted work, are superseded. Longlisting and shortlisting determine judging progress, not whether files are retained.

Items marked **proposed default** are implementation recommendations, not decisions already agreed in the meetings. The final section identifies outstanding inputs; these should not silently become invented competition rules.

## 1 Scope and delivery priorities

The requested registration opening is **1 October 2026**, with draft copy due **30 September 2026**. The summit is in January; the notes reference January 29, but the exact edition label and event date/year must be confirmed. Store dates and editions as configuration.

| Priority | Work to deliver | Completion boundary |
| --- | --- | --- |
| Registration launch | Public pages, school search and nomination, lifetime school registration, student registration, contact OTP, competition forms and uploads, confirmations, admin records and search, Trash and restore | Required for every flow that is advertised as open on October 1 |
| Core judging | Admin and judge accounts, assignments, automatic routing, judging queues, rubric-based reviews, longlist and shortlist decisions, results | Part of the requested MVP; required before any judging begins |
| Next release | Historical imports and reconciliation, public entry showcase, richer reports, content editing tools, registration tutorial | Schedule explicitly; approved content and legacy school matching may be needed earlier |
| Later modules | Event attendance and QR check-in, volunteers, outreach campaigns, deeper teacher or school portals | Separate scope towards the January summit |

The original MVP includes the backend and judging functionality. This sequencing is a dependency plan, not permission to omit it. If delivery must be staged, agree the release boundary explicitly and keep unfinished flows closed. No estimate in this document guarantees that a new system can be completed in two days.

## 2 Public website and content

Build responsive pages for Home, About the summit and initiatives, Competitions, individual competition details, How to participate, FAQs, school search and nomination, school registration, student registration and entry submission, and Contact or support. Provide privacy and participation terms appropriate to the collected information.

The home page should present Youth Eco Summit as the main brand, use student participation or children on stage as the hero, and give competition participation a prominent CTA. School search remains a secondary CTA. Highlight approved institutional partners near the top, followed by the competitions, participation steps, student opportunities, school benefits, initiatives, press links, and social channels.

Use Reyona’s finalized designs and the approved cutout and layered-image direction. Light animation and doodles can support the student-led tone. Copy and layout should address three distinct needs: students’ reasons to participate, teachers’ registration workload, and schools’ recognition and value to parents. Include lifetime school registration and the school-ID prerequisite in the FAQs.

The notes mention 15 awards and possible scholarships, gifts, recognition, UN/WWF/ministry associations, and historic participation metrics. Publish only the exact claims, logos, numbers, and benefits cleared by the team. Prepare page titles, descriptions, share previews, semantic structure, accessible forms, and mobile layouts. A gallery of winning and non-winning work requires separate publication permission and moderation; private submission is not permission to publish.

## 3 School and student registration

### School search and nomination

- Search by school name and location, with enough location detail to distinguish schools with similar names. Display only approved public school information.
- If a school exists, select its permanent school ID. The ID identifies the school; it is not a password and must not grant access to its contacts or records.
- If it does not exist, collect a nomination with school name, location, nominator contact, and school contact where available. Show a receipt and a pending status; nomination does not automatically approve a school.
- **Proposed default:** admins review duplicates and nominations, invite or verify the school contact, and approve the school. Confirm the verification method with the registration team. A student cannot finalize registration or an entry until linked to a registered, active school.

### Lifetime school registration

Capture school name, address, city/district, state, postal code, primary contact name and role, email, phone, and teacher/coordinator details. Confirm which fields are mandatory from the existing forms. Generate one permanent school ID and retain the original registration date.

Returning schools remain searchable in future editions and confirm or update their contact details without repeating full registration. Use a separate annual participation record. Existing verified schools should carry forward automatically; historical schools without a reliable ID mapping require reconciliation rather than duplicate registration. School record changes require a verified school contact or admin authority.

### Student registration and access

Capture student name, registered school, class, section if needed, coordinator if applicable, and parent/guardian or emergency contact details. Collect additional fields only where the source form or competition requires them. Generate a student reference and an edition participation record. Store the class and school applicable to that edition so later changes do not rewrite history.

The meeting requests contact OTP at submission. **Proposed default:** a parent/guardian contact verifies the registration session by OTP; the student can then complete eligible entries in that session. Define a teacher-on-behalf flow if required. An emergency contact is not automatically a guardian, and OTP verifies control of a phone number, not parental consent. Record consent separately using approved wording.

Allow multiple students under one verified contact, such as siblings; do not treat phone number or name as a unique student identity. Provide secure access to the participant’s own drafts and receipts through an authenticated session. A registration reference alone must not unlock personal data. Add rate limits, OTP expiry, resend handling, and recovery/support behavior.

Registration, competition entry, and physical event attendance are distinct records and actions. Registering for a competition must not imply a confirmed seat at the summit.

## 4 Competitions and submission forms

Create one configured form per competition using shared registration data. Automatically populate edition, school, student, class, and eligible category instead of requiring repeated manual entry. Category assignment must be calculated and validated on the server from approved class/group rules.

| Activity examples from the notes | Expected submission support | Rules still needed |
| --- | --- | --- |
| Essay and other written work | Retained document; text field if the approved form requires it | Formats, language, word limits, required declarations |
| Painting and artwork | Original uploaded image and optional description | Image formats, resolution, number of files |
| Speech, short film, play | Retained video, title and required participant details | Duration, file size, formats, team rules |
| Coding | Approved source files/archive, description, supporting material | Accepted formats, individual/team rules, judging method |

These examples are not a finalized competition catalogue. Review every existing form before implementing its fields. Do not run submitted code on the application server.

Each competition needs an edition, title, guidelines, opening and closing time, eligibility rules, class categories, individual/team mode, entry limit, file requirements, and review rounds. **Proposed default:** implement versioned form configurations; a general-purpose drag-and-drop form builder is outside the initial scope.

Provide draft saving, upload progress, retry/resume for large files, field validation, a final review screen, and a unique submission receipt. Acknowledge successful submission only after required data and files are durably recorded. Show processing or upload failure clearly; never display success while the retained file is missing.

Final submission must be idempotent: retries or double clicks produce one entry and one receipt. Enforce eligibility, entry limits, deadlines, and allowed files on the server. For team activities, retain the lead participant and linked team members under one entry according to the approved rules.

**Proposed default:** participants can edit drafts. Final submissions are locked unless an admin reopens them with a reason. Retain each submitted revision; reviews refer to the exact revision seen. A replacement file must not silently replace work that has already been scored.

## 5 Admin dashboard

Provide authenticated administration with these screens and actions:

- **Overview:** counts by edition for registered schools, students, entries, upload failures, unassigned entries, review progress, shortlisted work, and Trash. Show what each count measures; students, entries, and files are different totals.
- **Schools:** search, filters, nominations and approvals, contact details, permanent ID, annual participation, linked coordinators, students, and entry history. Edit, deactivate, move to Trash, and restore with an audit trail.
- **Students:** search by reference, name, school, class, and authorized contact lookup. Show registration details, consent/verification records, annual participation, and all related entries.
- **Submissions:** filter by edition, activity, class/category, school, workflow state, assignment, judge, review status, and file availability. Open the entry, retained documents/images/videos, revision history, guideline checks, scores, and decision history.
- **Judges and assignments:** invite or deactivate judges, configure assignment rules, assign or reassign individual/bulk entries, and monitor workload and completion.
- **Results:** inspect longlists, shortlists, submitted reviews and approved score summaries; record the jury’s decisions, awards, and publication eligibility. Confirm any admin ratification step with the jury lead rather than assuming admins select winners.
- **Exports:** export filtered registration, entry, and review data as CSV/XLSX. Use authenticated platform references for files; exports must not contain public or long-lived storage links. Large exports may run as jobs with downloadable results inside the dashboard.
- **Trash and audit history:** inspect who changed, assigned, deleted, restored, or purged an item and when. Provide record history and cross-links so school enquiries can be answered without searching filenames.

Use server-side pagination and filtering. Admin edits must preserve previous values or an appropriate change history. Provide a clearly distinguished support correction flow; admins should not overwrite a judge’s score while impersonating that judge.

## 6 Roles and access permissions

**Proposed role split:** Owner admin controls accounts and permanent purge; Admin handles day-to-day operations; Judge reviews assigned entries. The owner is an admin account with additional permissions, not a separate public role. Participant access is limited to their own authorized records.

| Capability | Owner admin | Admin | Judge |
| --- | --- | --- | --- |
| All school and student records | Yes | Yes | No |
| All entries and retained files | Yes | Yes | Assigned entries only |
| Manage judges and assignments | Yes | Yes | No |
| Read submitted judging results | Yes | Yes | Own reviews only |
| Score an entry | With explicit judging assignment | With explicit judging assignment | With assignment |
| Trash and restore | Yes | Yes | No |
| Permanent purge | Yes | Only if explicitly granted | No |
| Publish results or entries | Yes | Yes | No |

Use invitation-based admin and judge accounts with session expiry, secure recovery, and deactivation. **Proposed default:** require MFA for privileged admin accounts. Deactivation must prevent future authenticated requests and terminate sessions.

Enforce permissions on every server data read and mutation, including search results, counts, exports, previews, file requests, review endpoints, and direct entry URLs. A hidden navigation item is not access control. Next.js recommends centralized server-side authorization close to the data source. 
[Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication)

Judges receive the entry reference, activity, category/class group, submitted work, guidelines, rubric, and their own review history. **Proposed default:** hide parent contacts and other unnecessary personal information; hide student/school identity unless the judging process needs it. Do not show another judge’s scores or global school/student directories.

## 7 Assignment and judging workflow

### Assigning work

Admins can assign one entry, selected entries, or an ongoing rule defined by **edition + activity + category/class group + review round + judge**. For example, assign the relevant essay category for one edition to Judge A in the scoring round. Multiple judges may review the same entry when the approved process requires it.

An ongoing rule covers existing eligible entries and newly eligible entries until paused or revoked. Materialize an explicit assignment for each entry and judge so the admin can see the exact queue. Enforce one active assignment per entry, judge, and round. Explicit exclusions and manual revocations take precedence; the routing job must not recreate a revoked assignment silently.

Route an entry only when its required files are ready and it is eligible for that round. Longlisting rounds may receive newly submitted entries; scoring rounds receive entries after the required guideline check. Queue entries with no matching assignment as **unassigned** and surface them to admins.

**Proposed responsiveness target:** eligible new entries appear in matching judge queues within 10 seconds in normal operation, without manual spreadsheet work. Use reliable jobs with retries and an admin-visible failure state. A missed job must be recoverable through reconciliation.

Reassigning work removes the old judge’s access on subsequent authorized requests and preserves their existing review as history. Reassignment is not an instruction to erase scores. Admins explicitly decide whether a historical review remains eligible for results. Reassignment and round closure must also block stale pages from saving reviews.

### Judge dashboard

Show assigned entries grouped by pending, in progress, and submitted review. Judges can search/filter within that set, open the retained work, read category instructions, save a draft score/comment, and submit a final review. Include a way to flag an unreadable file or conflict for the admin.

Use configurable scoring criteria, ranges, weights if applicable, and required comments. Version the rubric. Validate every score on the server; incomplete required criteria cannot be submitted. **Proposed default:** final reviews are locked and can only be reopened by an admin with a recorded reason. Other judges cannot see private drafts; admins see completion status and submitted reviews.

### Review stages and decisions

Maintain separate concepts for the entry’s workflow, file readiness, and each judge’s review status:

| Entry stage | Meaning and transition |
| --- | --- |
| Draft | Not a finalized entry; visible only to its authorized participant and admins as needed |
| Submitted | Required submission data and retained files accepted; awaiting guideline screening |
| Longlisted | Passed guideline checks; eligible for the configured scoring round |
| Disqualified | Failed a stated guideline; reason recorded and files retained |
| Shortlisted | Advanced after the required reviews and an authorized decision |
| Not selected | Did not advance in a review stage; reason/history and files retained |
| Finalized | Final result recorded, including winner/award where applicable |

Admins or judges explicitly assigned to screening can record guideline outcomes. The WhatsApp discussion assigns winner selection to the jury. **Proposed default:** the jury decides shortlists and winners through its agreed process, and admins record and publish those decisions; confirm any ratification step and configure decision permissions by round. Judges remain limited to their assigned entries. Do not derive winners from averages until the team supplies the aggregation, missing-review and tie-break rules. Round eligibility and transitions must be enforced server-side. A year-end archive is a read-only organizational state, separate from Trash.

## 8 File storage and retention

“Stored on the website” means the organization controls the retained information and files, and users access them through the platform. Use PostgreSQL for relational records, form answers, scores, audit metadata, and file references. Store the actual documents, images, and videos in private object storage under an organizer-owned account. They do not need to live inside PostgreSQL or on the Next.js application disk.

**Recommended architecture:** Next.js application + PostgreSQL + private object storage + background jobs. Select the storage and hosting providers based on capacity, support, transfer costs, and deployment requirements. Amazon S3 or a compatible service is an implementation option, not a purchased or approved provider.

Use direct uploads authorized by the backend, with multipart/resumable handling for large videos. Verify ownership, expected object key, type, size, and checksum before finalizing the asset record. Multipart upload and integrity checks are supported by S3; confirm the equivalent behavior for the chosen provider. [S3 multipart upload documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)

Store each asset’s original name, generated storage key, actual type, byte size, checksum, version, owning submission, uploader, timestamps, and readiness/scan status. Generate storage identifiers from internal IDs; filenames such as Name_Class_School are no longer needed for retrieval. Validate actual content, quarantine failed checks, and support safe document/image/video previews with an authorized download fallback.

For judge previews and downloads, use an authenticated media gateway that checks the current assignment and Trash state on each request and supports video byte-range requests. Do not issue reusable public file URLs. A presigned storage URL grants access to whoever holds it until its effective expiry, so browser-visible signed download URLs would create a revocation delay. Previously delivered bytes cannot be recalled. [S3 presigned URL behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

Retain originals across editions, including disqualified and non-winning entries, until an authorized deletion. Derived previews and thumbnails are linked to the same asset. External Drive/YouTube references may be supplementary, but an entry requiring a file is incomplete until an organizer-controlled copy is stored and verified. Historical links that cannot be imported must be visibly marked missing or inaccessible.

No automatic lifecycle rule may delete finalized entries, originals, or items in Trash. Cleanup of abandoned upload parts is separate, must use a documented grace period, and must exclude valid resumable uploads and referenced assets. Alert admins about storage use, failed uploads, and retrieval failures.

Capacity planning must separate participants, entries, files, average sizes, and peak usage. **Illustrative arithmetic only:** 10,000 videos averaging 200 MB require approximately 2 TB for originals; 100,000 require approximately 20 TB, before previews, versions, and backups. The historical 2.25 lakh participation figure is not a forecast of unique users or video uploads. Estimate storage, transfer, OTP, and hosting costs before opening uploads.

## 9 Trash restore and permanent deletion

All ordinary Delete actions mean **Move to Trash**. Apply this to submissions and their files, student records, and school records. Record deletion time, actor, and reason, while preserving the underlying data and relationships.

- A trashed submission immediately leaves active lists, routing, judge queues, participant access, and public showcases. Keep its files and reviews recoverable for authorized admins in Trash. Every access path must check Trash state.
- Restoring a submission restores its prior workflow state, files, versions, and review history. Re-evaluate permissions: only still-active judges with valid current assignments and rounds regain access. Restoration does not republish a public gallery entry automatically.
- **Proposed dependency rule:** block trashing a school or student while active dependent participation or submission records exist. Show the dependencies and provide an explicit bulk operation preview if the admin wishes to trash those too. Do not silently cascade through a school’s entire history.
- Restore parent records before dependent records. A bulk restore restores only items included in that deletion operation; it must not revive items already in Trash for another reason.
- A required file cannot be removed from an active finalized entry on its own. Trash the entry or perform an audited replacement that retains the old version. Shared team entries and files must not be destroyed through one member’s record.
- **Proposed default:** Trash has no automatic expiry. Provide search/filter, deletion details, restore, and a separately authorized permanent-delete action. Do not create an automatic 30-day purge without a new policy decision.

Permanent deletion requires a clear affected-item summary and explicit admin confirmation. Purge database content, file versions, originals, generated previews, export copies and public derivatives as applicable; preserve only minimal audit references required to record the action. Do not remove a physical file still referenced by another retained entry.

Run purge as a tracked, retryable job because database and storage deletion are separate operations. Mark records inaccessible while purging and report completion or failure; do not claim successful deletion if objects remain. Backup copies follow the documented backup retention schedule and are not erased instantly. Recovery procedures must reapply completed deletions so a backup restore does not resurrect purged content.

## 10 Suggested data model

This is a logical model for estimation and implementation; the developer should produce migrations and a relationship diagram before building forms.

| Entity or group | Purpose and key relationships |
| --- | --- |
| editions | Summit cycle, label, registration dates, submission deadlines, event dates, lifecycle state |
| schools and school_nominations | Permanent school ID and profile; nomination, verification, approval and duplicate handling |
| school_contacts and school_participations | Contacts/coordinators and one school participation per edition |
| students and student_participations | Stable participant identity; edition-specific school/class and historical context |
| users, sessions and participant_access | Admin/judge identities, roles and sessions; authorized access to individual student records |
| contact_verifications and consents | Verification result and time; consent purpose, wording version, actor and time, without retaining plaintext OTPs |
| competition_editions and categories | Versioned rules, form configuration, class mappings, deadlines and eligibility for an edition |
| submissions and submission_members | Entry reference, participant/team, edition/activity/category, state and submission time |
| submission_revisions and assets | Immutable submitted answers and file versions, readiness and private storage references |
| review_rounds and rubrics | Round eligibility, scoring criteria, version and locking rules |
| assignment_rules and judge_assignments | Ongoing scopes, explicit per-entry access, overrides, revocation and history |
| reviews and review_scores | Judge, assignment, round, exact submission revision, rubric version, draft/final scores and comments |
| decisions and publications | Guideline/shortlist/award history; separately approved public content and publication consent |
| audit_events, deletion_batches and jobs | Change history, recoverable deletion sets, imports, routing, exports and purge status |

Use foreign keys and transactions; avoid destructive cascade deletes on primary domain records. Include creation/update timestamps and soft-delete metadata where relevant. Enforce uniqueness for permanent school IDs, submission references, annual participation, active assignments, and review identities. Enforce competition entry limits in a transaction, including concurrent requests.

Store core searchable fields in typed columns; versioned competition-specific answers may use validated JSONB. Preserve source-edition snapshots for school/class details. Index actual query paths: edition, activity, category, school, participant, status, active judge assignments, and Trash. Use appropriate search indexes and pagination rather than loading full datasets into the browser.

## 11 Historical data and operations

The reported legacy volume is approximately 2.25 lakh student participations and 3,000–4,000 schools across three years. Treat these as planning estimates until the actual exports are reviewed.

Provide an import process for the old Google Forms/Sheets data: map columns, identify edition and competition, retain source IDs, validate rows, preview duplicates, import, and produce a reconciliation report. Import retries must not duplicate records. Use reviewed school matches and manual resolution for uncertain student identities; names or shared phone numbers are insufficient for automatic merges.

Import old submission files into organizer-controlled storage where access permits. Preserve the original reference and import status; record inaccessible files as a repair queue. Do not claim complete historical availability until record counts, relationships, and retained file retrieval have been checked. A baseline verified school directory should be ready for launch if returning schools are expected to find their existing registration.

Use organization-owned accounts for hosting, database, storage, email and OTP services. Separate staging from production; keep secrets server-side. Implement database migrations, error reporting, durable job retries, upload/routing alerts, and audited access to administrative exports. Protect exports from spreadsheet formula injection.

Back up PostgreSQL and object storage with a documented restore procedure. Agree recovery targets and retention periods, test restoration of a record and its actual files, and document how Trash and completed purges behave after recovery. A database-only backup does not restore a missing video.

The developer’s delivery includes source code, schema/migrations, deployment instructions, environment-variable inventory without secrets, admin setup, storage/backup ownership, operating costs, and a short walkthrough for the admin team.

## 12 Acceptance checks

Demonstrate these in staging with representative school, student, file, and judge records. Use realistic file sizes and agree a peak-user load target before launch.

1. A registered school appears in the next edition under the same school ID; contact updates do not alter prior-edition submission context.
2. A student without a registered school follows nomination and cannot bypass the school requirement through the API. A public school ID cannot edit a school profile.
3. OTP failure, expiry, resend and shared-parent-contact cases work. One sibling cannot access another student’s data without the appropriate authorization.
4. Each competition validates its own fields, category, deadline, team rules and files. Repeated submit requests create only one entry and receipt.
5. An interrupted video upload resumes or retries; a failed/incomplete upload cannot become a successful finalized entry. Retained work remains accessible after the student deletes their personal source copy.
6. An admin finds a student by name/reference and sees their school, class, entries, files, current assignments, and submitted review outcomes.
7. Judge A cannot access unrelated Judge B entries through lists, guessed URLs, APIs, search, counts, downloads or previews. A judge cannot self-assign or submit another judge’s review.
8. A matching new eligible entry reaches an active assignment rule; an unmatched entry appears in the admin’s unassigned queue. Retried routing jobs do not duplicate assignments.
9. Revocation, reassignment, account deactivation, and round closure block subsequent unauthorized reads/writes, including saves from a stale browser tab. Prior submitted scores remain in history.
10. Submitted reviews use the approved rubric and exact file revision; final scores cannot be silently edited. Missing reviews and ties follow the approved decision rules.
11. Trashing an entry removes all active access, including file access. Restoring it recovers files/reviews without reviving revoked assignments, previously trashed dependencies, or public publication.
12. Parent deletion shows dependencies; purge failure is visible and retryable; an unprivileged admin or judge cannot purge. Completed purge removes the configured live copies.
13. Historical import reruns create no duplicates and report missing assets. Public pages and gallery copies expose no private contacts or internal review data.
14. Restore a representative backup, including files, and verify that completed deletions remain enforced. Check mobile registration, keyboard navigation, and usable validation messages.

## 13 Inputs needed to finish configuration

These are specific inputs for the implementation team, not requests to reopen the settled stack or storage decision. Confirm them in parallel with development. Competition rules and access behavior must be resolved before their affected flows go live.

| Input | Suggested source or owner |
| --- | --- |
| Final competition list, source forms, fields, class groups, individual/team rules, limits and deadlines | Pragya and the programme team; Sonam reviews every source form |
| School verification, nominations, returning-school mapping and teacher-on-behalf submission process | Pragya and the registration team |
| Parent versus emergency contact use, OTP flow and approved consent/publication wording | Programme owner; developer supplies the proposed flow |
| Review rounds, rubric, score ranges/weights, reviewers per entry, conflict handling, ties and winner approval | Pragya, Shohini and the jury lead |
| Whether judging is anonymous and whether file downloads are needed in addition to previews | Jury lead and programme owner |
| Allowed file formats, maximum sizes/durations, upload counts and expected concurrency | Programme team with developer capacity estimate |
| Owner/admin permissions, backup retention, recovery targets and any future Trash expiry | Platform owner and developer |
| Exact event date and edition label, confirmed awards/benefits, partner approvals, media and metrics | Pragya and Pankaj Bajaj |
| Final designs, content and launch release boundary | Reyona for design; Rudhraksh for copy; implementation team for estimates |
| Legacy exports and permission to retrieve historic files | Existing Forms/Sheets/Drive account owners |

The accepted handoff should leave the developer with a configured competition catalogue, agreed judging rules, storage limits and cost estimate, a dated delivery plan, and the acceptance checks above. Registration, administrative access, retained submissions, judge isolation, and recoverable deletion are the core product outcomes.
