# Live website visual verification — 12 November 2026

**final result: passed**

Final code: `75b983a72b0a69ae0b4215111c0ec8759d09941c`. The release is active on Hostinger with a retained rollback. Post-deployment comparison found no remaining actionable P0/P1/P2 visual differences within the scope and intentional behaviors described below.

## Scope and evidence

Reference: https://youthecosummit.com/. Implementation: https://new.youthecosummit.com/. All 15 public marketing routes were captured in fresh, isolated Playwright Chrome contexts, with explicit user approval after the built-in browser could not attach. Desktop: 1280 × 900 CSS pixels; mobile: 390 × 844 CSS pixels with touch emulation. Screenshots use deviceScaleFactor 1, so CSS and image pixels match directly. Both sides use the same light theme, locale and reduced-motion state for stable poster/layout comparisons. Normal-motion playback and interaction checks are separate.

Actual source and target screenshots, combined comparisons and capture metrics are retained in `.local/visual-qa-production-20261112/`. Each route has desktop/mobile `source-top`, `target-top`, `source-full`, `target-full` and combined `pair` images. Full-page overview sheets cover all subpages. Focused comparisons cover the homepage hero, winners, partners, format cards, speakers, participation photo and footer. Earlier evidence is retained in `iteration-b9e6522/` and `.local/visual-qa-preview-20261112/`.

Fonts and images are allowed to load and decode before the final captures. Lazy-image loading is completed for the full-page comparison; the original production loading settings remain unchanged. Source-side transient navigation/paint errors were retried or checked with focused element captures, rather than copied into the app. Combined top comparisons use crops of fully rendered full-page frames; early top frames that still showed source server/loading markup are excluded from visual judgments.

## Comparison history and fixes

1. **P1 — stale homepage and competition content.** The first comparison showed an older headline, introduction, buttons and section order. The current hero, impact summary, four pillars, video links, competition imagery and three winner editions were imported from the public reference. The 256 published winner highlights and six PDF lists remain publicly sourced.
2. **P2 — source stylesheet order and legacy card overrides.** Per-route source stylesheet order is now preserved. Older app defaults that enlarged cards, changed label display/leading and hid the film overlay were reset only within the reference content. Post-fix native comparisons matched source card sizes. Additional live checks at 320px, 768px and 1440px measured card heights of 290px, 365px and 390px respectively, with no horizontal page overflow.
3. **P2 — route-specific footer and teacher label drift.** Rendered source text was checked across all 15 routes. The homepage/competitions retain the source credit and revised audience labels; the other public routes retain their published footer variant. The teacher-page eyebrow follows the visible source label.
4. **Control cleanup.** Independent review caught a queued observer callback that could restart winner rotation after unmount. A disposal guard and regression test resolve it. Winner and participation tabs are independently scoped.

## Required fidelity surfaces

- **Fonts/typography:** Original Manrope files, weights, sizes, line heights, wrapping and visible labels were compared. Card label defaults and the teacher eyebrow were corrected.
- **Spacing/layout:** Hero proportions, image crops, section rhythm, grids, responsive cards and footer spacing were compared at matched viewport sizes. Page-level horizontal overflow and clipped controls are checked in the browser.
- **Colors/tokens:** Source purple, cream, yellow and lavender surfaces, text colors, borders and film overlay are retained through the original stylesheets.
- **Images/assets:** Original photographs, cutouts, logos, fonts, PDFs and both hero videos are served locally. All 70 current references total 31,829,168 bytes and are checked by length and SHA-256. No generated replacements are used.
- **Copy/content:** Page headings and body content follow the public source, including rendered labels where source server markup differs. Footer wording follows each route’s observed variant.

## Functional and production verification

The full validation run passed 499 tests in 61 files, with two existing skips, TypeScript checking, the production build and standalone worker packaging. CI: https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43223237743.

Browser checks cover winner editions/next/previous/keyboard, all five participation tabs, FAQ disclosures, responsive menus and Escape, all ten competition disclosures, reduced-motion explicit video playback, normal autoplay/offscreen pause/resume, and partner keyboard/mouse/touch browsing without visible horizontal scrollbars. The reference intentionally shows a static complete partner grid under reduced motion; normal-motion browsing is tested separately.

Production checks passed for all 15 public pages and 16 preserved account/form/policy/access-gate routes. All 70 media references matched their original length and SHA-256. Per-route CSS and footer copy matched the reviewed data; linked CSS matched the CI artifact. Social images, a 1,024-byte HTTP 206 video range and existing form/showcase configuration passed. All 30 final target captures had zero page overflow, broken/pending images or page console errors. All 13 browser interaction groups passed, including client navigation removing the old route CSS and updating footer copy. The 320px, 768px and 1440px extra width checks also passed.

## Intentional behavior and limits

Existing application forms, account security/MFA, approved-publication reads and working contact entry remain active. The contact page uses the existing approved backend copy and working form action instead of the source frontend’s unavailable-contact fallback. Source tracking scripts and incidental rendering/encoding errors are excluded. Database records, private attachments, form definitions and mail configuration were preserved; no test form was submitted for this visual pass.

Mobile checks use Chromium touch emulation, not a physical iOS/Safari device. Broader migration cutover, approved legal content and owner-specific judging/edition requirements remain separately tracked in `docs/production-verification-2026-11-11.md`.

## Result and follow-up

The final screenshots were compared with source frames in the same combined inputs, including native-size hero, winners, card, image and footer details. No P0/P1/P2 visual blockers remain. A few pixels of footer leading/rounding remain as nonblocking P3 polish; the content, wrapping and controls stay visible.

The Hostinger account hit its disk quota during deployment. Verified identical immutable build copies in inactive releases were shared while retaining every path and byte; the active release, WordPress files and private storage were excluded from these writes. About 1.17 GB was reclaimed across two passes. The final artifact was resumed only after its saved prefix matched the validated local archive, and its full checksum was verified before extraction and activation. Hosting capacity/release-archive retention still deserves owner review before further large uploads or releases. No paid service was purchased.

The full evidence index is `.local/visual-qa-production-20261112/final-summary.json`; the deployed route/media verification is `.local/source-design-20261112/production-acceptance.json`.
