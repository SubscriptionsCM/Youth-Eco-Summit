# Live competition journey — 9 October 2026

Deployed to youthecosummit.com with native portal 1.3.4. This supersedes the earlier 1.3.2 entry-registration UX report and its uploads-disabled limitation.

The live competitions page was serving an obsolete eight-card export with no actionable entry links. The student and educator forms also retained the old early-access confirmation in their Forminator `behaviors` settings. Student registration already automatically signs the participant in.

The live programme now renders ten published guideline competitions with Start entry actions, topics, eligibility and file requirements. The current live hero and other sections are retained. The exported Next streaming boundary is resolved on the server so removing obsolete hydration does not leave a Loading page. Mobile navigation remains functional. No SVG assets were created.

Registration confirmation leads to Choose your challenge, or Continue to my entry when a verified competition context exists. Already signed-in participants are not sent to registration again. Sign-in retains the verified school and competition selection and fixes the obsolete registration destination.

Entry forms accept submissions and retain the existing multi-step saves. The team flow collects the member count and names, respects the published team policy, and verifies a registered school ID. Multiple entries from one school are permitted. The original student-registration consent is reused verbatim following user approval; the originality/15-point AI policy acknowledgement remains separate. No new publication or guardian permissions were invented.

Final submission checks include authentication, school, class/topic/language eligibility, title format, required attachments, actual MIME/size, image/video orientation and video duration/resolution. Written PDFs require selectable text within the published word range. PDF text extraction uses the official `smalot/pdfparser` Composer package; manual checks remain necessary for originality, citations, captions and content/judging. Uploads are outside public_html, under `/home/u794443438/yes-private-entry-uploads`, and download routes authorize only the owning account or WordPress administrators. Competition notification emails were not configured or sent.

Forminator invokes validation before and after converting a saved draft and moving its attachment. Browser testing exposed false expired-draft and unreadable-file errors during the second pass. The fix retains successful validation within that one PHP request, while unknown drafts and unvalidated missing files remain rejected.

## Evidence

- Browser: challenge card → Individual → searchable registered-school selector → actual five-step Open Letter form.
- Browser: 550-word labelled QA PDF submitted successfully; confirmation showed YES-ENTRY-2930, also visible in the signed-in account.
- Backend: entry 2930 active, owner 120, received-for-review metadata, checked registration consent, attachment path outside public_html.
- Anonymous HTTP request to that actual attachment returned 403. Signed-in browser attachment navigation was blocked by the browser's download client; it was not claimed as a completed browser download.
- Browser: independent QA saved draft reloaded with the entered name and school restored.
- QA records 2921 (initial failed submission shell), 2930 (successful submission), 2933 (save/reload draft) and the two QA PDFs were removed from the active data/file area after backup. Existing unrelated records were retained.
- 88 challenge journey checks, 42 submission/security checks, 57 entry UX checks passed on live. Existing participation checks passed earlier in this task (173).
- Desktop and 390 × 844 mobile checked; screenshots in docs/images/challenge-start-live-20261009.png and challenge-start-mobile-20261009.png. Viewport restored.
- PHP syntax checked on the server. No new participant accounts or OTP messages were created/sent during testing.

## Deployment and recovery

Remote snapshot: `/home/u794443438/yes-deploy-backups/challenge-journey-20261009/` includes the prior theme functions, portal/entry UX source, registration settings, ten competition definitions and portal configuration. Recoverable removed QA records/files are under `qa-removed/`, outside the website root. New code is in `wordpress/yes-native-portal/includes/{challenge-journey,entry-submission}.php` and related assets/tests. Theme functions add the `yes_frontend_page_html` filtering point. The previous configuration had entries disabled; reverting source alone does not revert the form metadata or portal option.

Student registration and competition submissions remain open until 5 November 2026, 11:59 p.m. IST. School and educator registrations retain their separate policy.
