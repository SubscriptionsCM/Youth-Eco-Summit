# Competition entry participation rules — 8 October 2026

Installed on the live WordPress site in `yes-native-portal` 1.3.0.

## Confirmed requirements

- Start with Individual or Team.
- Team entries require a whole-number student count of at least two.
- Every entry requires a valid school ID from the live registered-school directory. Typed school names alone do not establish registration.
- The final Forminator submission handler enforces the school check, including requests that bypass the entry page.
- One school may submit multiple entries to the same competition; no school/competition uniqueness constraint or quota is introduced.

## Implementation

The public `/competitions/enter/` route first collects entry type and team size, then validates school ID. Competition links preserve the chosen competition, entry type, count and canonical school ID. All ten prepared Forminator entry forms now start with a separate Entry type step, followed by Student and school, Your work, Uploads, and Review. The team count is conditional on selecting Team. These fields use the existing Forminator storage and save-at-each-step mechanism.

Server-side validation rejects blank/unknown school IDs, missing/invalid entry types, missing/decimal/negative team counts, and teams that violate existing category rules. Metadata records `_yes_entry_mode`, `_yes_team_size`, `_yes_verified_school_id` and `_yes_verified_school_name`. School ID/name are normalized from the registered directory. Valid partial drafts remain savable, while an invalid draft nonce cannot exempt the new rules. Saved links carry the entry context.

The source guidelines currently allow teams for Case Study (3), Short Film (3), Spoken Word (2), Waste to Art (3), and Eco-Business Model (3). Other categories remain individual-only pending the user's answer about allowing teams in every competition. The internal `yes_native_entry_team_policy` option defaults to `guidelines`; the `all` value would allow teams in currently individual-only categories without inventing maximum sizes for them. Existing published team-size limits remain applicable.

## Current limitation

The ten 2027 entry forms were drafts and `entries_enabled` was false before this change. Their status and that setting remain unchanged. The new participation flow and backend checks are deployed, but final competition uploads/submissions are not enabled. Outstanding consent/upload approval is still required. This update is not a successful end-to-end competition submission test.

## Verification

173 assertions passed against the installed code with zero forms submitted, participant records created or messages sent. All ten stored form definitions were checked for first-step field order, conditional team count, required school ID and preserved draft status. Live browser checks confirmed the team count appears when Team is selected, the next step preserves the choice/count, and an unknown school ID is rejected. Node syntax validation passed for the new UI script.

Private server backup: `/home/u794443438/yes-deploy-backups/team-entry-20261008/`. It contains the previous portal PHP and ten form-definition snapshots, not participant submissions.

![Live entry choice](images/entry-team-choice-20261008.png)
