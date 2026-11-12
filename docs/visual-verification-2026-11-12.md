# Public visual verification - 12 November 2026

The homepage overflow is fixed and deployed at [new.youthecosummit.com](https://new.youthecosummit.com/). Production code revision: `f4c7f3a0141cfca47489ded753f738bbbb031b6f`. [GitHub Actions run 43158922696](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/43158922696) passed **484 tests in 58 files**, with two existing skips, TypeScript checking, the production build and standalone packaging. The public homepage's three CSS files were downloaded and matched byte-for-byte against that validated artifact after activation.

## Corrections

- Absolutely positioned accessible speaker labels escaped the carousel's scroll clipping and enlarged the homepage to 2,695 pixels at a 1,280-pixel viewport. Giving the carousel viewport `position: relative` contains those labels without hiding page overflow. All ten speaker labels remain available to assistive technology, and arrow/keyboard scrolling still works.
- The shared `.sr-only` rule was defined only in a lazy form stylesheet. Moving it to global CSS fixes visible PDF/new-tab notices on resources and guideline blocks. The notice remains in accessible link names and measures 1 by 1 pixel visually.
- `/competitions/enter` inherited the full-width marketing layout. It now uses the padded portal shell; the public competition catalogue and detail layouts retain their existing marketing shell. Three route-layout regression tests cover the distinction.
- The partner-carousel scrollbar remains hidden while its arrows and counter work. No blanket `overflow-x: hidden` was added to the page.

## Browser coverage

The final release was checked in the real browser at **390 x 844** and **1280 x 900**: **60 route/viewport checks across 30 routes**. Every recorded page had document width equal to the available viewport, with zero broken loaded images and zero clipped button/input/select labels detected. Screenshots and DOM geometry were used together; fast full-page captures can omit unfinished reveal animations, so participation-step anchor states were also checked directly in the viewport.

| Route group | Paths checked at both sizes |
| --- | --- |
| Home and audience | `/`, `/about`, `/students`, `/parents`, `/teachers-schools` |
| Programme and resources | `/competitions`, `/how-to-participate`, `/awards`, `/experience`, `/resources`, `/showcase` |
| Engagement and support | `/partners`, `/get-involved`, `/contact`, `/faq` |
| School and partner entry points | `/schools`, `/schools/nominate`, `/schools/register`, `/partners/enquire` |
| Account and entry screens | `/login`, `/recover`, `/reset-password`, `/register`, `/teachers/register`, `/competitions/enter` |
| Signed-out access gates | `/dashboard`, `/admin`, `/judge` |
| Existing policy notices | `/privacy`, `/terms` |

The homepage also passed five production width checks:

| Viewport width | Available width | Document width |
| ---: | ---: | ---: |
| 360 | 345 | 345 |
| 390 | 375 | 375 |
| 768 | 753 | 753 |
| 1280 | 1265 | 1265 |
| 1440 | 1425 | 1425 |

The 15-pixel difference is the browser's vertical scrollbar. All eight carousel viewports use the intended relative positioning.

Interactive checks passed for mobile menu opening, Escape dismissal, navigation and dismissal after a route change; desktop partner arrows/counter and hidden scrollbar; speaker arrow and End-key scrolling without document growth; all five homepage participation-tab states and Home-key selection; FAQ opening/closing; later participation-guide anchors and visible animated content; all ten competition guideline disclosures expanded at mobile and desktop widths; student and educator competition pickers and individual/team choices; participant/staff sign-in layouts; and a school search returning the expected single result. The directory's wide table scrolls within its own container on mobile rather than widening the page.

## Deployment evidence and scope

The verified release is `/home/u794443438/yes-hostinger-migration/20261112-051133-f4c7f3a0141c/runtime`. The previous release and routing rollback are retained. Hostinger had replaced its Node binary while the old application process remained running, so its executable path ended in ` (deleted)` and the initial exact-path restart check missed it. The old process was inspected for the same account, exact previous app directory, expected Node path and Next server command before it alone was stopped. Subsequent public CSS hashes and browser geometry verified the new release was actually serving visitors. Runtime form configuration remains enabled with the existing WordPress account provider.

Evidence is retained in the Git-ignored `.local/visual-20261112/` directory: the 60-check inventory, five-width production measurements, release acceptance hashes and screenshots. Temporary viewport overrides were reset after testing. No production submission, historical record, attachment, credential or account role was changed by this visual pass.

This closes the previously pending **public desktop/mobile layout and homepage-overflow** work. It does not claim that every signed-in workflow or every role was exercised through the browser. The prior [functional and migration verification](production-verification-2026-11-11.md) still applies, with its separate pending requirements: approved legal content, explicit judging/edition mappings and additional role onboarding, optional automatic Hostinger deployment, and a final incremental capture at cutover. WordPress remains required for native account/mail behavior. No new legal policy was invented or paid plan purchased.
