# Competition entry and registration UX — 9 October 2026

Historical 1.3.2 report. Superseded by [the 1.3.4 live submission update](challenge-submission-ux-2026-10-09.md); competition submissions are now enabled.

## Cause
The selected competition route fell back to the chooser when competition uploads were disabled. Its “View entry” link pointed to that same route, giving the impression of a non-working button. All ten competition upload forms remain drafts and `entries_enabled` remains false.

## Changes
- A selected competition opens a distinct details page, including requirements and the selected school.
- Primary “Register as a student” and secondary “Already registered? Sign in” actions appear before secondary details, on desktop and mobile.
- Registration opens the existing three-step Forminator student form. School options are preselected by a normalized matching name when an existing option matches the verified school. Saved draft selections are never overwritten.
- School ID, entry type, team size where relevant and competition are preserved through registration and sign-in links. Context fields are allowlisted and verified server-side.
- Registration success directs participants to sign in with their selected competition. Draft saves and failed submissions retain their existing behavior.
- Contextual sign-in includes the same-origin competition return URL and fixes the old registration link.
- The chooser uses “Choose [competition]” rather than “View entry”.
- Both chooser and details state that registration is open but competition uploads are not available yet. Registration does not submit competition work.

## Verification
- 57 new rendering and validation checks; 173 existing competition-participation checks; 57 school-picker checks: 287 passed.
- PHP syntax checked on the server.
- Browser: the reported URL opens Open Letter details, and its registration button opens the actual student form with AMITY INTERNATIONAL SCHOOL selected.
- Browser: contextual sign-in opens the current login form; its registration link opens the correct student registration page.
- Server rendering: correct same-origin login return URL.
- Desktop 1280 × 720 and mobile 390 × 844: registration actions visible in the initial viewport.
- No accounts or submission records were created and no OTPs were sent. Real login, registration submission and competition uploads were not completed in this verification.

## Remaining limitation
Competition submissions are not live. This release does not publish draft competition forms or change their activation setting. It fixes the misleading loop and makes the available registration flow explicit.

## Backup
Live pre-change files: `/home/u794443438/yes-deploy-backups/entry-ux-20261009/` (`portal-before.php`, `entry-before.php`, `entry-before.css`).

## Screenshots
![Live competition actions](images/entry-registration-ux-20261009.png)
![Mobile actions](images/entry-registration-ux-mobile-20261009.png)
