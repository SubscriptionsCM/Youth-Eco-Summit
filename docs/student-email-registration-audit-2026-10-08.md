# Student email registration audit — 8 October 2026

Read-only inspection of the live WordPress/Forminator student registration (48441), school form (9188), and email verification addon.

The exact screenshot error “This email address is already registered.” originates in Forminator_CForm_Front_User_Registration::validate_email, and is returned only when WordPress email_exists(email) returns an existing user ID. There are no email_exists filter callbacks overriding the check. Student account mapping points to email-1; school registration has no user-account mapping. Educator registration also creates a WordPress subscriber account and uses the same unique account email namespace.

Non-saving tests against the live student account validator: existing WP account email produced the screenshot error; newly generated unused email passed; the same unused email passed a second call; an existing school-form contact email with no WP account passed. No users, registrations, emails, OTP state or settings were created/changed.

Four completed school entries have contact emails which also match WordPress accounts, but that overlap does not prove school registration created those accounts.

The client's two attempted addresses were requested for exact account lookups. Without them, cannot attribute either particular attempt or determine whether the second screenshot was a fresh server response versus a previously displayed message.

A separate mapping maps text-1 (student name) to username. Duplicate-name/username failures have distinct native “This username is already registered.” text. This is not evidence that the email error is a username error.
