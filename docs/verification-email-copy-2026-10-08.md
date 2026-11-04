# Youth Eco Summit verification email

Status: Branded SMTP delivery and local code verification implemented and installed in the live custom email plugin (1.1.0). Activation is pending an authenticated sender account and an inbox delivery test. Current live delivery remains through the previous gateway.

Sender display name: **Youth Eco Summit**

Subject: **Your Youth Eco Summit verification code**

Hello,

Use the code below to verify your email address and continue your Youth Eco Summit registration:

**[verification code]**

This code expires in 10 minutes. Please do not share it with anyone.

If you did not request this code, you can ignore this email.

Thank you,
Youth Eco Summit

## Live delivery findings

Checked the production WordPress installation over SSH on 8 October 2026.

- The custom student/educator email verification plugin calls miniOrange's hosted authentication challenge API. This API generates and sends the email; it does not pass through WordPress's `wp_mail`.
- The installed miniOrange OTP Verification plugin (5.4.9) uses `MiniOrangeGateway`. Its email-template configuration method is empty. Its settings view explicitly limits email template customization to premium plans.
- The hosted API request supplies the plugin name as `transactionName`, which explains the plugin mention in the default message. Changing that field alone would still leave the transaction wording, miniOrange signature, and Xecurify sender.
- No SMTP delivery hook is configured in the live WordPress runtime. The miniOrange `USE_YOUR_SMTP` setting is disabled.
- miniOrange's official guide directs hosted-gateway customers to the provider account's email-template page: https://login.xecurify.com/moas/admin/customer/showemailtemplate . This page requires account sign-in.

## Remaining dependency

The user approved an independent branded email flow. The remaining requirement is a configured, authenticated sender account plus confirmation of test delivery to an operator-controlled inbox. The new path does not need miniOrange account access or a miniOrange upgrade. Do not purchase an email plan or activate untested delivery.

The follow-up implementation adds `branded-email.php` and updates the custom `yes-registration-email.php` plugin. No miniOrange files or SMS settings were changed. Private backup: `/home/u794443438/yes-deploy-backups/branded-email-20261008/live-before.php`.

The new flow uses authenticated SMTP with a separate PHPMailer instance, a six-digit code, ten-minute expiry, keyed hash storage, five verification attempts, browser/form/recipient binding, existing nonce and rate-limit checks, and one-use verification proof. Legacy codes remain supported during the changeover.

28 checks passed against the installed code using an in-memory mailer, without delivering emails or creating registrations. The student registration URL returned HTTP 200. A real email delivery test has not been performed; no SMTP credentials are configured.

Public DNS currently points incoming email at Hostinger (`mx1.hostinger.com`, `mx2.hostinger.com`) and includes Hostinger in SPF. This identifies the email provider but does not establish which mailboxes exist or provide their credentials.

Configuration and activation instructions: `wordpress/yes-registration-email/README.md`.

Reference: https://plugins.miniorange.com/otp-verification-plugin-general-settings-configuration
