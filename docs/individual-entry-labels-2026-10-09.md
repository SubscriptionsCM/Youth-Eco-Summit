# Individual entry labels — 9 October 2026

Deployed Youth Eco Summit native portal version 1.4.1 to the live WordPress website, youthecosummit.com.

Individual competition entries now use “Student”, “Student full name”, “Student class” and “Student email”, without “1”. Guardian contact labels follow the same singular wording. Team entries retain numbered participant headings and labels. Name and class validation messages also use singular wording for an individual entry.

The change is applied through the Forminator render-fields filter in `wordpress/yes-native-portal/includes/entry-role-flow.php`. Field IDs, saved form definitions, drafts and stored submissions are preserved. It applies both to individual-only competitions and individual entries in competitions that also allow teams.

Verification: PHP syntax checks passed for both deployed files. Read-only live Forminator checks passed across all 10 individual competition forms and all five team-capable competition forms (341 assertions), including stale entry-type queries and posted entry-type overrides. All 10 stored competition form definitions matched their pre-deployment hashes. The live Open Letter page was also checked in the browser: its heading and visible name, class and email fields use singular labels. No entries or verification messages were created for these checks.

The existing entry-role regression suite also passed all 206 checks, including participant validation, contact storage and saved-entry context.

Pre-deployment copies of the two affected PHP files are stored outside the public web directory at `/home/u794443438/yes-deploy-backups/individual-labels-20261009-1.4.1/`.
