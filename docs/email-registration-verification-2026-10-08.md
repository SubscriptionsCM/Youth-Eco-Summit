# Registration email verification — 8 October 2026

Applied to live WordPress at https://youthecosummit.com/ through the authorized SSH connection, using production as the baseline.

## Registration policy

The user requested email-code verification for students and educators and clarified that students may not have access to a phone. The resulting policy is:

| Registration | Required verification |
| --- | --- |
| Student, form 48441, `/register/` | Email code for account field `email-1`; SMS is no longer required |
| Educator account, form 48437, `/teachers/register/` | Email code for account field `email-1` plus the existing SMS code for `phone-4` |
| School, form 9188, `/schools/register/` | Existing coordinator SMS verification retained |

Student parent/guardian contact fields remain as previously configured. Removing student SMS verification does not remove those contact fields or change consent, school ID, account, or competition requirements. All other miniOrange SMS mappings remain intact.

## Existing provider retained

The new `yes-registration-email` WordPress plugin uses the installed miniOrange gateway's `mo_send_otp_token('EMAIL', ...)` and `mo_validate_otp_token(..., 'EMAIL')` methods. No provider credentials were changed and no replacement email or SMS service was configured.

The existing miniOrange Forminator integration selects one channel globally. An independent, form-scoped email verification state allows educators to verify both channels without changing the established SMS handler.

## Implementation

- The email code appears beside the required account email field. Both forms already map this field to the account email.
- Server-side submission checks require verified proof for the exact form, browser cookie, and submitted email address.
- Random browser tokens use an HttpOnly, SameSite cookie; HTTPS sets Secure. Verification state and provider transaction IDs stay on the server.
- A code challenge expires after 10 minutes; verified proof expires after 30 minutes and is consumed after successful final registration.
- Resends require 60 seconds between requests. Limits are five requests per email per hour, 100 per IP per hour, and five unsuccessful code attempts per challenge. Atomic option locks serialize provider requests and challenge updates.
- Codes have no form field name and never enter saved drafts or registration records. Saved drafts require fresh verification when resumed.
- The draft exemption requires the native AJAX action, draft flag, and valid Forminator nonce. Final submissions and forged draft flags retain enforcement.
- Added `yes-registration-email` to the live theme's existing native form asset allowlist, preserving its analytics restrictions on private draft routes.

Source: `wordpress/yes-registration-email/`. Enabled through the `yes_registration_email_enabled` option. Local theme source received the same minimal allowlist addition; no older local portal source was deployed.

## Verification and limits

Nineteen email-handler checks passed before and after deployment, with all provider HTTP calls mocked: valid and invalid codes, nonce/form validation, expiry, email changes, form separation, proof consumption, resend and attempt limits, and draft safety. No real messages or registration accounts were created by these checks.

Ten additional checks confirmed the actual enabled policy, active server hook, permitted frontend assets, removal of student SMS enforcement, and retention of educator/school SMS enforcement.

Live browser checks confirmed the student email button, removal of its SMS control, educator email and SMS controls, and successful educator draft saving before verification. A distinctly labelled temporary educator draft (entry ID recorded in the cleanup helper output) was privately backed up and removed; no final registration was submitted. Screenshots are in `docs/images/student-email-verification-20261008.png` and `docs/images/educator-email-sms-verification-20261008.png`.

Actual inbox delivery and a real received-code check were not performed. Provider credentials and cached email quota are configured; this does not prove delivery to an inbox.

## Private rollback backup

Server directory: `/home/u794443438/yes-deploy-backups/email-registration-20261008/`.

- `before-email-settings.json`: original SMS form mappings and email-enabled option; no provider credentials.
- `before-theme-functions.php`: production theme source before the allowlist addition.
- WP-CLI-only deployment/test helpers and the private synthetic UI draft backup.

To revert safely, restore the student's original SMS mapping first, then disable the email-required option/deactivate this addon. Restore only the theme allowlist change if desired and purge caches. Do not disable the existing SMS plugin or overwrite unrelated production portal files. Keep private test artifacts outside the public webroot.
