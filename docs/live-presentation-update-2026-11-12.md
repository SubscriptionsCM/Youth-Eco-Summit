# Live website presentation update - 12 November 2026

The current WordPress presentation has been implemented and deployed at [new.youthecosummit.com](https://new.youthecosummit.com/). Active code: `08d27a7641f5efa3a832f0267cf995c592a47761`. [Final CI run 43174390411](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43174390411) passed **495 tests in 61 files**, with two existing skips, TypeScript checking, production build, worker packaging and standalone checks. The previous working release is retained for rollback.

## Updated presentation

- All 15 public marketing pages now use the current live site's reviewed content, section order, imagery and source styling, including the full-width background video, student/school sections and recognition section.
- The shared logo, social navigation, footer and foundation credit follow the reference. Account menus and sign-out retain the application's existing behavior.
- The 72 original asset references include images, font files, winner PDFs and desktop/mobile hero videos. They are served locally in a new immutable namespace. Existing application assets were retained.
- Local controls support video play/pause and reduced-motion/visibility handling, partner animation and manual browsing, mouse dragging, speaker navigation, participation tabs and FAQ disclosure.
- The working contact form and approved-publications API remain connected. Source loading placeholders, executable scripts and transient account state were excluded from the static public content. No participant records were frozen into public page snapshots.
- Social-preview and structured-data image URLs resolve against the Hostinger domain. Public build configuration uses the correct application origin without adding credentials to Git.

## Completed verification

- All 15 updated public pages returned HTTP 200 and their headings matched the reviewed source content.
- All 72 deployed asset references matched original lengths and SHA-256 hashes: **32,083,337 bytes** in total. Git-stored originals were independently checked as well.
- Every stylesheet linked by the production homepage matched the validated build artifact. All 13 unique source CSS/font asset URLs had also passed local resolution and hash review.
- Hero video delivery returned HTTP 206 for a 1,024-byte range with `video/mp4` content type. Social-preview image URLs returned successfully from the new domain.
- Sixteen preserved account, school, form, policy and access-gate routes returned HTTP 200, bringing production route coverage to 31. Form configuration remained enabled and configured with WordPress account services; the existing approved-publication read endpoint responded successfully.
- The activation checks retained rejection of a synthetic invalid password-reset key and verified the reset page. No real password, role or account was changed.
- Independent code review found no remaining Important or Critical issues. DOM regressions reproduced and fixed reduced-motion playback visibility, partner manual browsing/dragging, and a pending-play/hide/reject/show race.

No database migration or production form submission was performed for this presentation update. Existing records, private attachments, authentication, form definitions, security policies and mail workflows were preserved. No paid service was purchased.

## Pending visual acceptance

**Desktop/mobile screenshot comparison remains blocked.** Browser controls repeatedly timed out; the user could not see a browser panel, and the request to open one returned queued. The updated target could not be captured beside the reference at equal viewport/state. HTTP, asset, DOM and CI checks are complete, but they do not establish pixel-level parity or native touch/decoder behavior. See [the visual QA record](design-qa.md).

The earlier 12 November visual report covered revision `f4c7f3a`, before this source-presentation refresh. Its screenshots are historical evidence for that earlier layout, not acceptance of this new design.

Broader existing requirements remain in the [functional/migration report](production-verification-2026-11-11.md): WordPress account/mail dependency, approved legal content, explicit judging/edition configuration and final incremental capture at cutover. See [presentation maintenance notes](live-presentation-reference.md) for the reviewed public-source workflow.
