# Youth Eco Summit WordPress portal

Current production release: **1.4.0 — 9 October 2026**. See `docs/entry-role-flow-2026-10-09.md` in the app root for deployment, regression checks and recovery details.

For this existing production site, use the targeted `yes_native_prepare_entry_role_flow()` migration as an authenticated administrator. Do not rerun `yes_native_prepare_forms()` or `yes_native_prepare_entry_launch()` over current forms: those historical helpers reconstruct fields and can reintroduce obsolete team inputs.

This plugin uses the production site's existing Forminator registrations and WordPress accounts. It does not copy the PostgreSQL database or replace existing account, OTP, notification or registration-consent mappings. Preparation explicitly corrects the student and educator password mapping to honor the visible chosen-password field.

## Initial setup (for a new site only)

1. Back up the site's database, theme and affected form definitions.
2. Install and activate `yes-native-portal` alongside the frontend theme. Activation extends Forminator's supported nullable `draft_id` VARCHAR column to 64 characters, preserving existing records, collation and indexes. The official 1.53.1 schema uses only 12 characters, which cannot store the portal's stronger tokens. The same idempotent check runs at the start of the explicit preparation command; it never changes schema during a public request.
3. Call `yes_native_prepare_forms()` explicitly from an authenticated administrator/WP-CLI context. It updates the three existing registration forms and creates ten **draft** 2027 entry forms. It never runs automatically during activation or a public request.
4. Set the `yes_native_portal` WordPress option with the site's real Ultimate Member login form ID and published privacy, terms and contact page IDs. Preserve the existing registration IDs: student `48441`, teacher `48437`, school `9188`, partner `9213`, nomination `8916`.
5. The frontend theme calls `yes_native_render_page($path)` before `wp_head()` to obtain portal content and enqueue required Forminator assets. Its result is an inner `<section>`, intended for the theme's existing `<main>`.
6. Run the targeted `yes_native_prepare_entry_role_flow()` migration after initial configuration, before enabling competition entries.
7. Set `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` on native portal pages. REST responses already include `private, no-store`.

## Existing forms

- The student form retains its three existing steps and adds a required Class 5–12 selector.
- The educator form retains its four existing steps and lists the ten 2027 formats.
- Student and educator registrations map `registration-password-field` to their existing `password-1` field instead of generating a different password. Preparation verifies the field type and registration form type, is idempotent, and creates no accounts or password changes for existing users.
- The school form becomes four steps: School, Location, Contact and Review. Its mobile progress bar stays in a compact horizontal layout with readable 16 px labels. Its existing `Others` value/conditional field remain intact; school names are aligned with the student form's current list.
- The partner enquiry and school nomination continue through their existing form handlers.
- Original registration consent is preserved verbatim. It is not presented as new guardian permission or publication permission.

Forminator's native Save & Continue stores each draft. The accompanying script saves on actual page changes or an explicit Save and continue later click, reuses `previous_draft_id`, and provides a private link to the saved form. Explicit saving uses native draft AJAX directly without triggering registration or OTP submission events; the real form's draft flag is reset so a subsequent final submission follows its normal validation and verification flow. New draft tokens contain 48 hexadecimal characters with a guaranteed alphabetic prefix and 188 random bits. The response is verified against the stored token, form and draft status before showing success; an unsuccessful insert returns an honest error without a saved-form link. Failed saves show bounded, plain-text native validation messages; HTML and private token values are not rendered. No answers are stored in browser local storage. Passwords, OTP codes, uploaded files and consent must be re-entered when continuing. Consent is excluded from stored draft field data on the server as well as from autosave requests. Uploads remain subject to the existing native Forminator behavior and must be reattached after returning.

miniOrange's Forminator OTP error callback is exempted only during an allowed native draft AJAX request, after both Forminator's nonce validation and the portal's nonce/action checks. All other validation filters remain active. Normal/final registrations retain the original OTP callback; saving a draft does not send an OTP or create an account.

Version 1.0.5 makes Forminator's active success/error response visible even when a resumed form retains an inline `display:none`. Only confirmed final success stops autosaving, removes the expired draft token from the URL, and hides the old saved-form controls. An HTTP-success response containing validation errors keeps the saved draft usable. The miniOrange verification buttons retain their existing provider labels and handlers.

The server rejects final student registrations outside 1 October–5 November 2026, using the exclusive UTC boundary `2026-11-05T18:30:00Z` (6 November midnight IST). Draft saving remains available. Teacher and school registrations are not affected by this cutoff.

## Live competition forms

All ten published competition forms accept entries when the existing portal configuration permits them. Students/educators choose the submitter role first, the competition second, then individual/team only if that competition permits teams. School ID selection auto-fills the canonical school name/branch and is validated on final submission.

Student entries collect name/class and guardian email/phone for every participant. Educator entries collect name/class/email for every participant and exclude guardian fields. The declared submission path appears in the account list and backend metadata. Multiple entries from the same school/competition are permitted.

The user approved reusing the existing student registration consent verbatim. It is not represented as newly approved publication permission. Separate originality acknowledgement retains the 15-point deduction for AI-generated content; judging requires human review.

Server checks enforce authentication, school, class/topic/language eligibility, title format, attachment MIME/size, written PDF word ranges, image orientation and video duration/resolution. PDF extraction uses the bundled `smalot/pdfparser` library. Originality, citations, captions and judging remain organizer checks. Uploads use the configured private directory outside `public_html`; owner/admin authorization is required for downloads.

Draft saves use Forminator's native storage and retain participant contacts plus declared role. Hidden role fields omitted by native drafts are recovered only from nonce-verified prepared draft data. Form and account pages are excluded from LiteSpeed page caching. Existing miniOrange SMS and Youth Eco Summit email-verification integration remain in their own plugins.

School records use the existing canonical school catalog and permanent references. Names/IDs are searchable; contact details remain private. This plugin does not merge separate schools by name.

The account page uses WordPress identity and Forminator review/export. It is not the separate Next.js school-level dashboard, and this release does not migrate the PostgreSQL app.

## Read-only frontend APIs

- `GET /wp-json/yes/v1/auth/session`
- `GET /wp-json/yes/v1/public/config`
- `GET /wp-json/yes/v1/public/schools`
- `GET /wp-json/yes/v1/public/showcase`
- `POST /wp-json/yes/v1/auth/logout` requires an authenticated WP cookie and WordPress REST nonce.

All responses use the frontend's `{ "data": ... }` envelope. Public school results contain directory information, never private coordinator or guardian contact details. Published policy content is read from existing WordPress pages. The showcase stays empty until approved entries are connected.

Official references: [WordPress REST cookie authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/), [REST permissions](https://developer.wordpress.org/rest-api/extending-the-rest-api/routes-and-endpoints/), [Forminator API](https://wpmudev.com/docs/wpmu-dev-plugins/forminator-api-docs/). Draft settings, AJAX parameters and hooks were checked against the official Forminator 1.53.1 source archive.
