# Competition-specific entry modes — 9 October 2026

Live native portal 1.3.6. The public entry-type picker previously offered Individual and Team for every selected competition, and all native forms stored both radio options. The guideline validator then rejected individual-only competitions after school confirmation.

Selected individual-only competitions now automatically use Individual and proceed to school confirmation, without a Team choice. Older URLs requesting a team for such a competition are normalized to individual before school selection. Native competition forms expose only their permitted modes, with Individual checked for solo competitions. A markup guard handles older saved drafts that contain a team selection without modifying their stored data merely by visiting the page. Direct unsupported team submissions remain blocked server-side.

Team-enabled competitions retain both modes. Their published maximum appears in the initial entry-type picker and native team-size field; an excessive team size is caught before school selection. Generic journeys that select an entry type first still show only competitions that support the selection.

A targeted update changed only the radio options/label and number-field limits/description across ten forms. Automated before/after comparison confirmed all other fields, settings, notifications and publication status were unchanged. The general preparation helper also retains the new competition-specific options on future preparation runs.

Verification: 197 new read-only checks across all ten forms, 173 existing participation checks, PHP lint. Live browser: Blog with the old team=4 URL opens a valid individual entry with zero Team radios and Individual checked; Short Film retains Team and limits its initial size field to three. No registrations, drafts, final submissions or messages were created in this test. Screenshot: `docs/images/individual-only-entry-live-20261009.png`.

Recovery snapshot: `/home/u794443438/yes-deploy-backups/entry-mode-20261009/formmeta-before.json` preserves all original form definitions; source/version snapshots are in the same outside-public_html directory. `entry-participation-before.php` was recovered from the previous challenge-journey deployment staging snapshot.
