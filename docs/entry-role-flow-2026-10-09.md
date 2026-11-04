# Entry flow update — 9 October 2026

Deployed to the production WordPress site as `yes-native-portal` 1.4.0. English minutes are at https://compactummedia.com/youthecosummit/minutes/#meeting-2026-10-09; the live entry flow starts at https://youthecosummit.com/competitions/enter/.

## Final behavior

- Opening screen asks student or educator, with a separate “Continue a saved entry” link. Account creation and sign-in are identified explicitly later.
- The next screen selects one of ten competitions. Team size/type is offered only for competitions allowing teams; individual-only competitions go straight to school confirmation.
- Student submissions collect every participating student's name/class and guardian email/phone. Educator submissions collect every student's name/class/email, with no guardian contacts.
- Registered school IDs use the existing searchable selector and auto-fill the canonical school name/branch. The form explains how to register an unlisted school; school/competition quotas are not introduced.
- Multi-step drafts retain the role, mode, school and all participant contacts. Inactive-role and unused participant contact fields are excluded from saved records. Uploads and verification codes must be added again when returning.
- Final submissions retain declared student/educator provenance in Forminator metadata and display it in the account entry list. This identifies the selected submission path; it does not certify a user's professional role.
- User-facing registration fields use educator/guardian. Existing URLs, internal field IDs, account creation, OTP mappings, notifications and consent remain compatible.

## Migration and recovery

Backups are outside the website root at `/home/u794443438/yes-deploy-backups/entry-role-flow-20261009/` (prior plugin, full form snapshots, staged migration and recoverable synthetic QA records/files). Compactum minutes backup: `/home/u206408555/yes-backups/minutes-20261009/`.

For an existing deployed site, copy the updated plugin files, back up all affected Forminator definitions, and run only `yes_native_prepare_entry_role_flow()` under an authenticated administrator/WP-CLI context. It updates twelve forms while preserving account/verification settings, notifications, behaviors, integrations, publication status and portal configuration. Do not run the older broad preparation/entry-launch helpers over this release; they recreate obsolete participant fields.

Forminator omits hidden fields from native draft saves. A valid nonce-checked draft therefore obtains the role from its prepared form data and stores `_yes_entry_submitter_role` and `_yes_entry_submission_by`. Saved links restore the role from that metadata. Form/account pages explicitly bypass LiteSpeed page caching to prevent stale draft HTML.

## Verification

- 846 read-only regression assertions passed across role flow (206), participation (173), entry modes (197), challenge journey (88), account/registration UX (57), submission validation (42), school selector (77), and draft/OTP hook isolation (6).
- PHP syntax checks passed for all six deployed PHP files.
- Browser: a three-student educator Short Film entry and an individual student Open Letter entry completed successfully. Final database inspection confirmed the required contacts, canonical school and submitting account; inactive contacts were absent.
- Browser: student draft reopened at its saved step with guardian contacts intact; a three-student draft restored all six guardian contact fields.
- Account dashboard displayed student/educator submission provenance. Both test attachments were stored outside `public_html`; anonymous download was denied with HTTP 403.
- A before/after comparison confirmed twelve forms retained account, OTP, notification, integration and publication settings. Entry activation/configuration was unchanged.
- Mobile opening screen checked at 390 px with no horizontal overflow. New minutes tab and prior meeting tabs verified.
- Three synthetic QA records and two uploads were backed up outside the web root and removed. Temporary QA mail suppression/instrumentation was removed. Existing participant records were untouched.

Desktop proof: `../../work/entry-role-flow-20261009/entry-start-desktop.png`; minutes proof: `../../work/entry-role-flow-20261009/minutes-oct9.png`.

Hosting purchase/migration remains pending confirmation of the plan buyer and payment method. No message was sent to Pragya and no plan was purchased.
