# Functional interface

The app uses a plain responsive interface while final visual design and public content are pending. No sample dates, sponsors, claims or competition rules are published.

The public `/showcase` page renders only the text and selected media returned by the approved-publication API. It uses publication-scoped media URLs, displays images and videos with a file-link fallback, and opens PDFs through a link. Admins must explicitly approve selected file IDs for public display; public media permission remains separate from private submission storage and participant consent.

Public routes include the home page, About, Competitions and individual competition details, participation instructions, FAQs, school search and nomination, school and student registration, Contact, Privacy and Terms. Approved content is read from the public configuration endpoint. Registration and nomination forms stay closed until approved privacy and participation terms exist; student registration also requires an open approved edition with dates and versioned consent.

Participants sign in with their verified contact, register separate students, manage school details, create drafts and review before submitting. Entry files are hashed incrementally in 4 MiB slices. Multipart progress, pause, resume from the same original file, verification status and draft file replacement are available. The client never treats a transferred file as ready before the server verifies it. Private downloads use authenticated media routes. Submitted revisions remain visible as receipts and revision history.

Returning school contacts use **Access a registered school** on `/schools/register`. They enter a permanent reference or select the school from the directory. The claim endpoint verifies that their OTP-verified contact matches the existing active school contact. The interface then reloads the authorized participant dashboard and opens the existing school for updates. A public school ID alone never grants record access.

Team invitations are created by the lead guardian and shared by that guardian. The recipient signs in using the invited contact, selects their own registered student and explicitly confirms team participation. Optional publication permission is separate from participation consent and appears only when approved versioned wording exists.

The admin workspace provides paginated search, filtered exports, details, support corrections, configuration editors, nomination matching, assignments, decision recording, files, historical repairs, import preview and reconciliation, audit history, jobs and Trash. Trash shows a dependency preview. Permanent deletion has a separate typed confirmation and is represented as a tracked request, not immediate completion. Advanced configuration accepts JSON and the server validates each field.

Round configuration includes a separate list of approved prerequisite scoring-round IDs. No prerequisite is inferred; jury shortlisting/finalization stays closed without configured scoring prerequisites. Eligible trashed draft files from finalized revisions have an audited archival recovery action in Files. Recovery requires a reason and leaves the immutable submitted revision, reviews and public file selection unchanged.

Judges see their assigned queue, retained files, exact revision, rubric and their own review. They can save a draft, flag a problem and review before final submission. Screening and jury decisions appear only for roles authorized by the configured round.

## Verification

`tests/ui-routes.test.ts` checks required route coverage. `tests/e2e/public.spec.ts` exercises desktop and mobile public navigation, overflow, unauthenticated guards, unapproved consent closure and nomination failure preservation. Run `npm run test:e2e` after installing Playwright Chromium. The configuration starts a local development server when needed. Full configured participant, storage and judge acceptance still requires the seeded integration environment and organizer-owned service credentials.

`tests/e2e/workspaces.spec.ts` covers authenticated admin school/student details and edition-scoped crosslinks, the judge’s empty/revoked assignment states, and saving an assigned rubric draft with controlled API fixtures. Admin details show annual participation, contacts, consent wording and verification history, lead/team entries, assignment progress and previous submitted review versions. Raw records remain available in a collapsed panel.
