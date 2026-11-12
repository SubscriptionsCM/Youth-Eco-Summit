# Website visual update — 12 November 2026

The visual update is deployed at [new.youthecosummit.com](https://new.youthecosummit.com/) on code `75b983a72b0a69ae0b4215111c0ec8759d09941c`. Desktop and mobile comparison against the captured live WordPress reference is **passed**, with no remaining P0/P1/P2 visual blockers.

## Completed

- Compared all 15 public marketing pages at 1280 × 900 and 390 × 844, using 60 actual source/target screenshots and focused comparisons. The homepage also passed overflow checks at 320px, 768px and 1440px.
- Matched the current hero, introduction, images, section order, impact summary, pillars, competition cards, video links and route-specific footer/page labels. Corrected legacy card sizing, label spacing and the film overlay. Horizontal scrollbars remain hidden during partner browsing.
- Added the three source winner editions, 256 published highlights and six PDF lists, with edition/keyboard/previous/next/pause behavior. Review also fixed an observer cleanup race.
- All 13 live browser interaction groups passed: winner and participation tabs, FAQs, menus, competition disclosures, normal/reduced-motion video, keyboard/mouse/touch partner browsing, and navigation between different page styles/footer variants.
- Verified 31 HTTP routes, per-page CSS and footer copy, 70 original asset references (31,829,168 bytes), video byte ranges, social images and preserved form/showcase services. All 30 final target captures had no horizontal page overflow, broken/pending images or page console errors.
- [CI 43223237743](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43223237743) passed 499 tests in 61 files, two existing skips, TypeScript, the production build and standalone packaging.

Existing records, private attachments, forms, authentication and mail settings were preserved. No production form was submitted for this visual pass. The release and private configuration were checksum/permission checked, and rollback remains available.

## Scope and remaining requirements

The contact page retains its working form entry and existing approved backend copy, while the source frontend currently displays an unavailable-contact fallback. Account/MFA security and live approved-publication reads remain connected. Minor footer leading/rounding is nonblocking P3 polish. Mobile testing used Chromium touch emulation; physical iOS/Safari testing was not included.

Broader WordPress account/mail cutover, approved legal content, explicit judging/edition configuration and the final migration delta remain separately tracked in [the functional/migration report](production-verification-2026-11-11.md). Hosting capacity and inactive release-archive retention also need owner review: quota was reached during this deployment and approximately 1.17 GB was safely reclaimed by sharing verified identical build copies. No records or private uploads were removed, and no paid service was purchased.

See [the detailed visual QA report](design-qa.md) and [the maintenance workflow](live-presentation-reference.md).
