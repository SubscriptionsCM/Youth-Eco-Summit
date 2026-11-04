# Live form test report — 6 October 2026

Site: https://youthecosummit.com/. Native portal: 1.0.5. Tests used clearly labelled synthetic records and reserved fictional contact details.

## Results

| Form | Save and reload | Final submission | WordPress storage |
| --- | --- | --- | --- |
| School — 9188 | Passed, including location and current step | Passed twice, including retest after confirmation fix | Completed entries 2749 and 2753 |
| School nomination — 8916 | Passed, including selected school and entered details | Passed | Completed entry 2755 |
| Partner enquiry — 9213 | Passed, organisation name restored | Not completed: real OTP required | Draft 2756 |
| Student — 48441 | Passed, username restored | Not completed: real OTP, password and fresh consent required | Draft 2757 |
| Teacher — 48437 | Passed, city restored | Not completed: real OTP, password and fresh consent required | Draft 2758 |
| Ten 2027 competition entry forms | Not tested through public forms | Disabled, therefore not passed | All ten Forminator posts remain drafts |

Each listed record was retrieved from the database and found by Forminator's native completed/draft administration query. School name and coordinator contact values matched the submitted synthetic values. Drafts contained no password or consent metadata. Test draft saving created no WordPress user accounts. This verifies native storage/query retrieval; it is not a claim that an authenticated administrator browser session or export download was exercised.

## Backend review

Open [WordPress → Forminator → Submissions](https://youthecosummit.com/wp-admin/admin.php?page=forminator-entries), select the relevant form, and select completed submissions or saved drafts as appropriate. Search for **YES WEBSITE TEST 6dc173c18088**. The six test records remain for inspection; they are not real participants or approved schools. Saved drafts follow the existing 60-day retention setting.

## Fix deployed

Resumed forms could hide the native confirmation behind an inline `display:none`, leaving the form looking blank after a successful submission. Portal 1.0.5 displays active response messages, hides stale resume controls, and removes the expired draft query parameter after confirmed final success. Validation errors do not stop autosaving. School and nomination were resubmitted successfully after the fix.

The existing miniOrange “Verify mobile” action was confirmed visually on the partner form. Its provider label, validation and handlers were left unchanged.

## Validation checks

Fifteen read-only server assertions passed: opening/cutoff boundaries, allowed student classes, school nomination requirement, required other-school name, disabled competition submission, server-side password/consent exclusion, matching draft ownership, rejection of cross-form draft reuse, and final OTP requirements for student, teacher and partner forms.

Six additional checks confirmed that the draft-only miniOrange exemption rejects invalid action/nonce/form combinations and does not remove the final-submit OTP guard. These checks submitted no forms and sent no messages.

## Notification handling and remaining acceptance tests

Three school/nomination notification emails were suppressed only for this run's exact synthetic marker. The temporary isolation file was removed afterwards. Production form notification settings were unchanged. Actual email delivery, external integrations and real OTP delivery have not been verified.

To finish student/teacher/partner acceptance testing, use an owner-controlled phone number and email, verify the received OTP, complete fresh registration consent where present, then check completed entries, account creation, login and notifications. Those tests remain outstanding; saved drafts alone do not prove final registration.

Competition entry acceptance remains blocked by disabled public forms and the pending school-ID, consent, team-eligibility and file-validation work documented in [wordpress-live-deployment.md](wordpress-live-deployment.md). Do not advertise this test as approval of competition uploads.

![Successful live school submission](images/school-form-confirmation.jpg)
