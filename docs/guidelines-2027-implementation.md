# 2027 guidelines and forms handoff

Updated on **6 October 2026** from the team-supplied *YOUTH ECO SUMMIT TOPICS AND GUIDELINES-2027.pdf*. This delivery includes the public content, saved registration forms, versioned competition drafts and an optional temporary WordPress bridge. It is implemented locally; production form hosting and WordPress activation remain pending.

## Public content

The canonical source is [`src/data/guidelines-2027.ts`](../src/data/guidelines-2027.ts). It covers **ten formats**: Open Letter, Blog, Article, Case Study, Short Film, Spoken Word / Monologue, Painting, Digital Art, Waste to Art and Eco-Business Model. Each includes class topics, individual/group limits, word counts where relevant, file requirements, judging criteria and conditional recognition opportunities.

The updates appear on `/`, `/competitions`, applicable published 2027 competition details, `/how-to-participate`, `/students`, `/parents`, `/teachers-schools`, `/faq`, `/resources`, `/awards`, `/experience` and `/get-involved`. Earlier competition versions retain their own rules. The original PDF is available unchanged under `public/documents/guidelines/`; detailed content provenance is in [the content notes](guidelines-2027-content.md).

## Saved forms

| Audience | Route | Steps |
|---|---|---|
| Teacher | `/teachers/register` | School → Teacher details → Review |
| Student / guardian | `/register` | School → Student → Contact & consent → Review |
| School | `/schools/register` | School → Location → Teacher contact → Review |

After signing in with a verified phone, **Save and continue**, **Back** and **Save and exit** persist the draft and current step to the account in PostgreSQL. Returning with the same account restores saved progress. Drafts support partial answers; required information is checked before final confirmation. Unsaved changes are identified explicitly, and competing edits are rejected rather than silently overwriting newer progress. Keystrokes are not advertised as automatically saved.

Student registration uses the parent/guardian’s verified account. Teachers register their own profile, share the permanent school ID with families and support student-created work. School registration remains lifetime, with separate records for distinct branches. Teacher school association requires administrator review before school-dashboard access; a school ID alone gives no private-record access.

Competition entries also use saved steps: **Entry details → Your team, where applicable → Upload work → Review & submit**. The server validates class-specific topics, declarations, file roles and individual limits. Uploaded media is verified using the existing private-storage and worker pipeline. Final submission labels are generated from authorized school/student/team records. See [form and upload details](guidelines-forms.md).

## Local data and approval state

Migrations `011_registration_drafts.sql` and `012_guideline_assets.sql` have been applied to the local PostgreSQL database. `scripts/import-2027-guidelines.ts` has created **ten version-four draft** competition records using provenance key `yes-2027-ai-deduction-confirmed-v4`. These current drafts combine the confirmed AI deduction with the Waste to Art class decision. The database preserves eight version-one records, ten version-two source records and one version-three Craft record alongside the ten version-four drafts. The importer is repeatable and does not approve competitions, activate registration, open an edition or invent dates or consent.

The user resolved **Waste to Art eligibility on 6 October 2026**: Classes 5–12, grouped as 5–6, 7–8, 9–10 and 11–12. The canonical/public content and the version-four Craft configuration use those four bands with the common craft prompt. This explicit decision supersedes the PDF’s conflicting class ranges; the source PDF and earlier versions are preserved unchanged. Other competition class ranges remain as supplied.

The user resolved **AI judging on 6 October 2026**: AI-generated content in a submitted entry incurs a **15-point deduction**, with no AI-based disqualification. AI use for research or reference remains permitted. The canonical rules and newly compiled configurations use this decision; the conflicting source PDF and earlier configuration versions remain unchanged as provenance. Applying the deduction requires human review; the application does not claim automatic AI detection.

Before activating the new portal, resolve and approve the remaining items:

- **Art rubric:** published criteria total 90 marks. No missing ten marks or score scaling has been fabricated.
- **Missing material:** the eco-business slide template and separate case-study reference were not attached.
- **Group policies:** permitted school combinations and class-category combinations must be chosen explicitly; the PDF supplies maximum team sizes but not these policies.
- **Confirmed dates:** student registration and competition submissions opened on 1 October 2026 and close at the end of 5 November 2026 in India time. The backend uses 6 November, 00:00 IST as the exclusive closing boundary. School and teacher registration remain available beyond this deadline. `npm run local:participation-dates` applies these dates to the 2027 edition, current guideline forms and already-approved competition versions, with audit history and no change to rules, consent or approval state.
- **Consent still needed:** the parent/guardian wording used in current registrations is requested so the new portal can match it. The new portal remains a draft until existing consent and remaining form policies are configured; the confirmed programme being open does not invent these missing values.

## Temporary WordPress option

The optional package is [`wordpress/yes-participation-bridge/yes-participation-bridge.zip`](../wordpress/yes-participation-bridge/yes-participation-bridge.zip). It displays the canonical guidelines and participation links on WordPress, with students, teachers and schools continuing to the hosted Next.js portal. Their forms, saved steps, records and uploads remain in the existing backend.

This architecture awaits the user’s choice. It has **not been installed or activated**. The real portal HTTPS origin and confirmed WordPress administrator access are still needed; the existing Compactum static approval preview cannot receive registrations. WordPress/PHP activation and runtime checks remain pending. Installation, shortcodes, package contents and limitations are documented in [the WordPress notes](wordpress-temporary.md).

## Initial delivery verification snapshot

**180 automated tests passed**, with no skipped tests. The application build and static frontend review build passed, including TypeScript checks. Eight real HTTP checks passed in the isolated local runtime, covering authenticated step saves, restoration through a fresh client, account isolation, stale writes, consent, idempotent receipts, pending teacher access, required-file enforcement and relevant pages/PDF availability.

The importer was run locally and rerun to verify preservation: the initial ten version-two records were retained, and the user-confirmed Craft version-three record was added separately. `npm run local:verify-guidelines` repeats the synthetic registration checks when the local test edition and services are available. The WordPress ZIP was rebuilt and its contents, data and original PDF verified. PHP execution, WordPress activation, production delivery providers and visual browser verification remain unverified. No live publication or registration activation is claimed.

## Deadline update verification

On 6 October, 13 focused date/configuration tests and TypeScript checking passed. They cover the final millisecond of 5 November in IST, exact cutoff enforcement, receipt retries, preserved historical forms and consent/approval states, and repeatable configuration. The local database now has the confirmed dates on the 2027 edition and ten current guideline forms. School and teacher registration remain ungated. This change has not deployed or activated production forms.

## AI clarification verification

On 6 October 2026, the importer created **ten version-four drafts**. Its immediate rerun created zero records and preserved all ten. Database checks confirmed that every version-four record remains draft, stores the 15-point AI deduction and updated acknowledgement declarations, omits the old no-AI assertion, and retains the 5 November 2026, 11:59 p.m. IST student/entry deadline. The historical version counts remain eight version one, ten version two and one version three; none were overwritten.

**23 affected tests passed**: 14 guideline-entry tests, three participation-date configuration tests and six rules tests. The production build passed, including TypeScript validation. The static frontend review build passed with 26 HTML pages, internal-asset checks and no API transport. HTTP checks returned 200 with the updated AI rule on `/`, `/faq`, `/competitions` and `/parents`. This clarification was not verified with a full-suite rerun or browser test.

The WordPress package was rebuilt from the final canonical rules, preserving the combined AI/copied-work art deduction and unchanged source PDF. Package checks found no active AI-disqualification wording or unresolved AI-policy item. No production deployment, form approval or WordPress activation was performed.
