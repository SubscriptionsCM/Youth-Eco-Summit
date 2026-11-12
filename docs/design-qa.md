# Live presentation comparison - 12 November 2026

**final result: blocked**

## Target and evidence

Match the current public images, text and design at https://youthecosummit.com/ on https://new.youthecosummit.com/. The source homepage was opened and its desktop rendering observed, including the new video hero and social header. The 15 public marketing pages, their original CSS and 72 media references were subsequently captured from public HTTPS responses; streamed public content was resolved without executing source scripts. The generated payload and assets are versioned with source hashes.

All 15 updated public routes returned HTTP 200 in the local preview and rendered their source-matched content and local asset references. Thirty-nine focused tests passed, including actual DOM tests for video motion/visibility handling, partner pause/manual browsing and mouse dragging, tabs and FAQ accessibility. Independent code review found no remaining Important/Critical findings; all 13 unique source stylesheet/font URLs resolved locally and matched hashes. These checks do not establish pixel or responsive visual parity.

## Earlier browser blocker (resolved)

The browser control service repeatedly timed out while inspecting the source subpage, capturing screenshots, opening the ready preview and reconnecting to the existing tab. Native app inventory also timed out. The user confirmed they could not see a browser panel. A request to show the new site in this chat's Codex panel returned `queued`, rather than a visible attached browser. The user subsequently explicitly approved Playwright. Fresh isolated Chrome contexts now provide actual browser screenshots.

The rendered target screenshot could therefore not be captured and placed beside the reference at equal viewport/state. This report does not pass screenshot QA or claim native touch/decoder/browser behavior was fully accepted. The final desktop/mobile comparison remains required when browser control is available.

## Completed review corrections

- Explicit reduced-motion video playback now sets the source CSS visibility attribute; Pause removes it.
- Pausing partner animation enables native horizontal browsing. Mouse dragging and keyboard browsing use scoped handlers with cleanup.
- Stale or visibility-aborted video play attempts no longer become an explicit user pause. A pending-play/hide/reject/show DOM regression passed after reproducing the failure.

Working forms, approved-publication reads and account controls remain connected to the existing application. Database records, private attachments and source authentication/mail services were not changed by the presentation update.

## Current comparison iteration

Playwright captures at 1280 × 900 and 390 × 844, deviceScaleFactor 1, reduced motion, found a newer live homepage hero, impact summary, winner tabs, video links and competition media. These P1 content differences are being corrected and recaptured. Earlier pre-refresh evidence is retained in `.local/visual-qa-final-20261112/`; updated preview comparisons are in `.local/visual-qa-preview-20261112/`. Final result remains blocked until the production recapture finishes.
