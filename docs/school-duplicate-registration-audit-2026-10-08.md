# Live school duplicate-registration audit — 8 October 2026

Reviewed the current production WordPress portal 1.2.3 and Forminator school form 9188, with read-only database inspection and non-saving validation calls.

Finding: school registration has no server-side duplicate comparison against existing registrations. Active submit-errors hooks are miniOrange OTP (priority 1), custom email verification (2), portal registration rules (20), and India state validation (25). School email is an ordinary required contact field, not a unique WordPress account identifier. Every accepted school submission receives a newly generated permanent school ID. Catalog deduplication only hides duplicate school listings; it does not prevent database submissions.

Among 21 completed registrations, found two matching groups after whitespace/case normalization of school name, address, coordinator, email and phone: entry IDs 1848/1849 (16 January 2026, not marked as tests) and 2749/2753 (6 October 2026, explicitly test-labelled). Drafts were excluded. These groups do not identify the client's particular registration without their school details.

Replayed existing January entry fields through the current custom registration/state/email validation functions: no errors. The October test data contains an older unrecognized state string, which the current state validator rejects; replacing only that with a valid state still gives no duplicate error. No final registration, OTP message, or database write was performed. This is a validation-path audit, not a new end-to-end OTP-verified submission.

Recommended fix: enforce school/branch uniqueness on the server using school identity and address/location, reject exact repeat registrations, and direct existing schools to their lifetime profile/ID. Contact email/phone alone should not be globally unique across schools because shared coordinators may serve multiple branches. Preserve distinct branches, drafts and existing records; ensure concurrent submissions cannot both create a new school identity.
