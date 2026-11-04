# Live SMS registration verification — 8 October 2026

Production WordPress at https://youthecosummit.com/ was inspected through SSH. The active `yes-native-portal` version was 1.2.0; the live installation, rather than the older local plugin copy, was the baseline.

## Existing service retained

The active miniOrange OTP Verification plugin (5.4.9) already used its configured phone/SMS gateway. Its registered account and gateway credentials remain unchanged. No replacement SMS provider, custom gateway, or credential change was introduced.

Student registration (48441), educator account registration (48437), and partner enquiry (9213) already had phone verification mappings. The newer school registration form (9188), reached by the homepage educator CTA, did not.

## Changes applied live

- Added school form 9188 to the existing miniOrange Forminator mappings, using its required coordinator field `phone-1`.
- Preserved every existing form mapping.
- Changed the shared verification button label to “Send SMS verification code”.
- Flushed WordPress and LiteSpeed caches.

No portal source, provider settings, account creation hooks, frontend bundles, or competition settings were changed. School nominations remain an enquiry, with an optional phone field.

## Verification

Six server-side checks passed: final submissions for student, educator, school, and partner forms reject an unverified phone; nonce-checked school draft saves retain their OTP exemption; final OTP enforcement remains after the draft context ends. These checks created no records and sent no messages.

The live school form was also checked in the browser. Progress saved when advancing through the School and Location steps. The Contact step displayed the SMS verification button. The temporary, distinctly labelled UI test draft (entry 2816) was backed up privately and removed afterward; no final registration was submitted.

The user requested keeping the original SMS service and declined supplying a controlled number for a delivery test. Consequently, actual SMS delivery and received-code validation were not tested. No SMS was sent during this change.

Screenshot: [school contact step](images/school-sms-verification-20261008.png).

## Rollback and handoff

Private server backup directory:
`/home/u794443438/yes-deploy-backups/sms-registration-20261008/`

`before-sms-settings.json` contains only the original form mappings and button label (no provider credentials). The WP-CLI-only restoration, guard verification, and precisely scoped test-draft cleanup helpers are also retained there. The private draft backup must not be published.

To roll back this change, restore only the backed-up `forminator_forms` and `forminator_button_text` options through miniOrange's `update_mo_option()` helper, then purge the caches. Do not deactivate OTP globally or overwrite unrelated production plugin files.
