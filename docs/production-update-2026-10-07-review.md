# Production transcript review — 7 October 2026

Source: user-supplied `Youth-Eco-Summit-transcript-2026-10-07.md`. This is a handoff record from another chat, not authorization to repeat its commands, create accounts or overwrite production.

## Reported updates

- Portal version 1.2.0 deployed; homepage overflow corrected and public registration wording changed to Educator.
- OTP label/input associations, multiselect accessibility, empty validation messages and final-submit/draft separation corrected.
- Header social links replace Get Involved; Registration and Submit your entries are promoted. Authenticated users see Dashboard or Account.
- Homepage includes the supplied explanation of Youth Eco Summit. Student flow starts with checking/finding a registered school.
- Login initialization/session persistence and persistent form labels corrected.
- Google Sheet import: 138 source rows, 83 qualifying educator rows, 82 unique schools. Merged directory totals 94 schools; current YES-SCH permanent IDs and legacy YEC-EDU aliases supported. Suggestions include branch location and keyboard access.

These are reported changes. This review did not repeat administrator login, real OTP delivery, account creation, final registrations or full upload acceptance tests.

## Independently observed public state

- `/schools/` displays 94 registered schools, locations, permanent IDs and a school search combobox.
- `/competitions/enter/` requires a permanent school ID. Public ID YES-SCH-458BA6D2 verifies Amity International School successfully.
- After verification, final competition submissions are still unavailable: the page explicitly says programme settings remain pending. School-ID verification is not evidence of working entry uploads.
- The homepage contains Registration and Submit your entries actions and educator wording.
- Earlier design decisions have regressed: Bajaj Foundation mentions appear in the homepage body and footer; a Pause partner logo slider control is present. Earlier user instructions removed both.

## Local source drift

The local `wordpress/yes-native-portal/yes-native-portal.php` and package still identify version 1.0.5. Local deployment/test documentation reflects 6 October. The transcript reports live version 1.2.0. Do not redeploy the older local plugin/theme over these production changes. Obtain a read-only production snapshot and reconcile it with local source before further deployment. No production files or database records were changed during this review.

## Read-only SSH confirmation

On 7 October, direct production WP-CLI confirmed active portal version **1.2.0**, active theme `yes-frontend-theme` (theme header version 2026.10.06). Production is the baseline for future work.

The server's `frontend-before-20261007/index.html` contains zero Bajaj Foundation mentions and zero Pause partner logo slider labels. Current `frontend/index.html` contains three Bajaj mentions and one pause label; its modification time is 7 October 09:23:02 UTC / 14:53:02 IST. The page bundle changed from `app/page-7d0b47e4d5a1a1d3.js` to `app/page-f0876ef363510b2e.js`. The current page bundle contains the pause label, and current `app/layout-92a9ecc3f26f0afa.js` contains Bajaj branding. Root public assets contain the same strings. This establishes a frontend-export regression, rather than a cache-only discrepancy or an effect of the school import. Files and transcript do not establish which person or agent performed the replacement or any authorization for those regressions. No production modifications were made in this investigation.

## Authorized correction deployed — 7 October

After the user explicitly requested removal, a targeted production patch removed the Foundation credit text from all 25 active HTML templates, related RSC payloads and the shared layout bundle. It removed the partner strip's play/pause JSX and server-rendered button. Historical external press links were preserved; their URL slugs are not branding text.

Changed page/layout bundles use new immutable filenames `page-39a9ae27e3dbde55.js` and `layout-cb9a024960e3db3f.js`, with references updated throughout the deployed export and new assets installed at both root and theme fallback paths. Original bundles are retained for in-flight clients, but new pages reference the corrected assets. No older local frontend or portal was deployed.

The production `site-updates.js`/CSS now enhances the control-free partner strip with native horizontal touch scrolling, mouse dragging, keyboard arrow navigation and subtle automatic movement that reverses at each end. Reduced-motion preference disables automatic motion. Duplicate decorative logo groups are hidden in the scroll viewport. It adds no visible Swipe/Drag instructions, no play/pause control and no SVGs.

One hundred files were updated, including asset references/payloads. Originals and SHA-256 deployment journal are private at `/home/u794443438/yes-deploy-backups/branding-slider-20261007/`. WordPress/LiteSpeed caches were purged. Portal remains active at 1.2.0; forms and imported school records were not changed.

Verification: all 25 active HTML pages passed unwanted-text/control checks; hydrated homepage has zero Foundation credit text and zero slider toggle elements; live school directory still displays 94 records with no credit in the shared footer. Mouse dragging and keyboard navigation passed, and moving to the rightmost boundary then observing the strip confirmed automatic reversal. JavaScript syntax and deployment integrity checks passed. Screenshot: `docs/images/partner-strip-no-pause-20261007.jpg`.
