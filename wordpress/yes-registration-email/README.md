# Youth Eco Summit email verification

Supports branded, authenticated SMTP emails with local OTP verification. SMS continues through the existing miniOrange plugin.

Default delivery is `gateway` for compatibility. Installing this update does not silently switch delivery before a sender has been configured and tested.

## Configure branded delivery

Use an existing authenticated SMTP account. Put credentials in the live server's private configuration (for example, `wp-config.php`), never in this repository or public files:

```php
define('YES_EMAIL_SMTP_HOST', 'your-provider-smtp-host');
define('YES_EMAIL_SMTP_PORT', 587);
define('YES_EMAIL_SMTP_USER', 'verification@youthecosummit.com');
define('YES_EMAIL_SMTP_PASSWORD', 'your-mailbox-password-or-app-password');
define('YES_EMAIL_SMTP_ENCRYPTION', 'tls');
// Optional verified sender/alias; defaults to the SMTP username.
define('YES_EMAIL_FROM', 'verification@youthecosummit.com');
```

Use your provider's port/encryption pairing: typically 587 with `tls`, or 465 with `ssl`. TLS certificate verification remains enabled. Sender name is always **Youth Eco Summit**. Subject and both HTML/plain-text bodies are defined in `yes_email_message()`.

Check configuration using `wp eval 'var_export(!is_wp_error(yes_email_smtp_config()));'` without printing credentials. Send a branded test to an address controlled by the operator and confirm inbox receipt and sender authentication before changing production delivery. Test codes have no registration proof unless issued through a real form challenge.

Activate after successful delivery verification:

```sh
wp option update yes_registration_email_delivery smtp
```

Rollback to the previous provider if required:

```sh
wp option update yes_registration_email_delivery gateway
```

Existing provider codes remain valid until their original expiration. Branded codes are six digits, expire in 10 minutes, and allow five verification attempts. The database stores only a keyed hash tied to the browser, form and recipient. Verified proof lasts 30 minutes and is consumed by successful registration. Resends invalidate the previous code/proof; a delivery failure never grants verification. Existing nonce checks, recipient/IP throttling and atomic locks remain active.

The isolated PHPMailer instance affects only registration email codes; it does not alter other WordPress emails or SMS settings.

## Automated checks

Run `wp eval-file wp-content/plugins/yes-registration-email/tests/branded-email.php` only in an environment without real `YES_EMAIL_SMTP_*` constants. The test injects an in-memory mailer, prevents external HTTP calls and cleans its temporary verification state. It does not deliver emails, submit registrations or create accounts.
