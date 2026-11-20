# Backend usability update — 20 November 2026

The two user-provided UI/UX transcripts informed improvements to the existing backend rather than a new visual identity. Relevant principles were hierarchy, repeatable spacing/type, purposeful colour, visible choices, counts that help decisions, consistent interaction feedback and useful empty states. Promotional tool recommendations in the transcripts were not treated as instructions.

## Changes

- A quieter app background, consistent panels and controls, compact headings, clearer active navigation and a primary dashboard action.
- Judging links are visible; the existing Tools group remains one group with its three essential options.
- Forms inbox exposes common form types and search-scoped counts. More types remain available in the selector. Contact uses its actual published WordPress form key.
- List and card views contain the same authorised records. Narrow screens default to cards; an explicit presentation preference is remembered without storing submission data.
- Applied filter chips, individual clear controls, matching-result totals and helpful empty-state recovery reduce guessing. Draft search text is only applied by Search.
- Results are associated with the successful request that produced them. Changing scope hides actionable stale results until the new request succeeds.
- Unique accessible result names, one link per card, keyboard focus styles, touch targets and reduced-motion handling improve access.
- Original WordPress dates, submitted values, attachments, account roles and record actions are preserved.

## Verification scope

Current-screen screenshots were captured before editing with representative fixtures. The same admin overview, forms inbox, archive, schools, judging setup, participant dashboard and judge queue are checked at 1440 px and 390 px. Browser audit blocks business writes and invitations. Functional tests cover filter totals/scoping, correct Contact mapping, view preference, empty recovery, stale response safety and unique links. Full production validation and read-only record comparison are required before completion.

The separate VPS migration remains postponed. This work targets the existing Hostinger deployment at new.youthecosummit.com.
