# School access and partner enquiries — 30 September meeting

Implemented on 5 October 2026. No production database was changed and no real school sheet has been supplied.

## Database deployment

Apply migrations with the normal `npm run db:migrate` process before deploying this backend. Migration `010_school_ids_and_partner_enquiries.sql` adds the school-ID registry and private partner enquiry queue. Existing canonical IDs remain unchanged. Migration backfills only canonical IDs; it does not infer aliases from old import provenance.

## School registration and IDs

School registration remains lifetime, followed by per-edition student registrations. Schools require administrator approval before students may register. The student form now suggests existing schools after typing two characters; city filtering, street address, postal code and school ID distinguish same-name branches. Arrow keys and Enter select a suggestion; Escape closes it. A typed name is never submitted as a school identity. The request always carries the selected school UUID and the server checks that it is active.

The private historical importer now preserves `originalReference` (for example, an existing EDU-prefixed ID) as the permanent ID of a new imported school. For an explicitly matched existing school, it retains the existing canonical ID and adds the old ID as an accepted alias. School search and school-contact claiming accept both. IDs are trimmed and case-normalized; they are globally unique across canonical and imported IDs, with conflicts rejected at preview and again at commit. Matching remains an explicit administrator decision; same names never merge records.

Preload the supplied sheet through **Administration → Imports**: map `originalReference` to the existing ID column and preserve stable source IDs. Include the branch address/city/state/postal code and registered contact details. Review every `schoolMatches` decision. Do not assign `approval: "approved"` unless verified against the organizer's source. Existing imported rows are idempotent and will not be overwritten. To attach legacy IDs to records imported by an earlier release, create a separate reviewed reconciliation source containing each `originalReference` and explicitly select its existing school UUID. No automatic aliases were invented from ambiguous legacy data.

## School dashboard

A participant verifies the school's registered phone and claims the school from `/schools/register`. `/dashboard` then exposes **View school registrations** for active schools with verified contact access. The dashboard reports distinct linked students, edition registrations and submitted entries; it lists each student's class, edition and competition status, including team memberships. It supports edition filtering, pagination and manual refresh for daily review.

`GET /api/schools/:id/dashboard` independently checks the active verified user/contact link and school state on every request. A school ID alone grants no access. It returns no parent/emergency contacts, submission answers, files or private entry links. Existing participant authorization for editing/viewing work stays unchanged.

## Partner enquiries

`/partners/enquire` collects organization, adult contact name, email, optional phone, partnership area and a short message. `POST /api/public/partner-enquiries` validates all fields and affirmative enquiry consent, records the approved privacy text snapshot, uses same-origin checks and limits each email to five enquiries per 24 hours. A hidden field reduces automated spam. A submission UUID makes network retries idempotent; a reused UUID with changed details is rejected. Enquiries are retained privately in PostgreSQL; nothing is emailed automatically. Publication of approved privacy information is required before accepting the form.

Owner/admin accounts review enquiries at `/admin/partner-enquiries`, search contacts/organizations and mark each enquiry new, contacted or closed with an audited reason. Judges and participants cannot read or update this queue. The frontend-only client review export displays the form with submission disabled and never collects enquiry data.

Still required before live use: the actual school/teacher sheet and reconciliation review; a configured runtime database with migration 010; approved privacy information; an organizer retention process for partner enquiries; deployment to a Node/PostgreSQL/private-storage environment.
