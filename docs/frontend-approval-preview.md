# Frontend approval preview

Run `npm run build:review` to generate the static approval site for `https://compactummedia.com/youthecosummit/home/`.

The script creates a disposable `.review-build` directory and exports to `.review-build/out`. It copies only UI source, static programme data and allowed public images/documents. It shares the already installed `node_modules` locally; dependencies are not copied into the export. The main application source, configuration, environment and database are unchanged.

The preview retains public marketing pages, GSAP interactions, FAQs, partner/speaker sections, previous-winner PDFs and the existing sign-in, school directory and registration page presentations. The registration gates remain closed without an account or approved configuration; no fake participant, school, consent or competition rules are created.

In the staging copy only, the API helper returns empty public collections and a signed-out session entirely in memory. It contains no network transport. Every write rejects with a frontend-preview message. API routes, admin/judge workspaces, dashboards, entries, team/invitation/recovery flows and dynamic competition detail routes are omitted. Links to omitted dashboard/recovery destinations point back to public review pages.

The export is built with `output: 'export'`, `/youthecosummit/home` as the base path, directory index pages and unoptimized local images. Native asset/PDF URLs are prefixed separately from Next navigation. Each page carries noindex metadata; the included `.htaccess` adds an `X-Robots-Tag` header and a `form-action 'none'; upgrade-insecure-requests` content security policy when Apache/LiteSpeed `mod_headers` is available. Verify these headers on the deployed server. The indexing instruction is not access control.

The build receives only ordinary OS execution variables and the preview origin, never application service credentials. No `.env`, `.local`, source, database, server or test payloads are uploaded. The script audits exported route/asset links, missing files, noindex tags and unexpected output files. Its summary is saved as `.review-build/review-export-report.json`, outside the deployable output.

Deploy **only the contents of `.review-build/out/`**, including `.htaccess`, to the approved `/youthecosummit/home/` directory. Do not upload `.review-build` itself or the main project. Keep the separate proposal and meeting-minutes pages outside that directory intact.

## Published 30 September 2026

- Review URL: https://compactummedia.com/youthecosummit/home/
- Release: `20260930T053550Z`.
- Uploaded only the 289 export files (including `.htaccess`) to `domains/compactummedia.com/public_html/youthecosummit/home/`.
- Previous preview retained outside the web root at `/home/u206408555/.codex-deploy-backups/youth-eco-summit/20260930T053550Z/home/`; `home-at-switch/` retains the exact prior live directory as well.
- New home-page SHA-256: `5430ab154882e9d6dfdc33978c67d77d1c95f6a1d717aa2d1c61386256896495`. The HTTPS response matches the exported HTML.
- Proposal and minutes index-file hashes matched before and after the directory swap.
- Live checks: principal public/preview routes, logo, share image and 2026 winners PDF return HTTP 200. `X-Robots-Tag: noindex, nofollow, noarchive` and the form-blocking CSP are served by Hostinger.
- Browser verification: desktop navigation, all eight competition cards, FAQ open/close, mobile menu/navigation, and no horizontal overflow at 390px. Share-image and canonical URLs use the correct preview prefix.

To roll back, preserve the current `home` directory under a fresh private backup name, then restore the prior `home-at-switch` directory to the same public path. No proposal, minutes or domain-root configuration needs to change.

## Published 5 October 2026

- Updated the same `/youthecosummit/home/` preview with the 30 September meeting changes and 5 October clarifications.
- Export contains 303 files and 25 HTML pages, including `/get-involved/` and `/partners/enquire/`. Forms remain disconnected and disabled on this frontend review site.
- Home-page SHA-256: `12d7e408aafcd4ac85b512d2bbda5fd1cc20a4f3fae780f84bc03a61747e27db`; verified against the HTTPS response.
- Previous preview is retained privately at `/home/u206408555/.codex-deploy-backups/youth-eco-summit/20261005-review/home-at-switch/`; `home-before/` is the earlier safety copy.
- The separate minutes page now has two dated tabs. Its previous version is retained in the same private release folder as `minutes-before/`.
- Proposal index hash remained unchanged (`5f799511875aeaaaf316f07500982fc6e05b51180ba72185532ce5af36a3e78c`).
- HTTP checks passed for the updated public routes, logo, student photo, winners PDF and minutes assets. Noindex and form-blocking response headers remain present. Build-time internal asset/navigation auditing passed.
- Local website browser access was rejected by the browser security policy; this release has code/build/HTTP verification, not a newly completed visual browser pass. See `meeting-2026-09-30-implementation.md` for requirement coverage and pending client inputs.

### Partner slider follow-up — 5 October 2026

Removed Play/Pause and visible swipe/drag instructions from the partner strip. Logos now glide at 30px/s and reverse at each end on the same draggable native scroll surface. Touch/mouse/keyboard activity pauses movement; touch inertia receives an idle window, reduced-motion settings disable automatic motion. Arrow controls remain. TypeScript and review export passed; live homepage matches SHA-256 `fd0a10dbc6bd4d0650cf7ebef9d65272f2a38f9351d778480d055ed1fcfb6ef0`. Prior preview retained privately at `.codex-deploy-backups/youth-eco-summit/20261005-slider/home-before/`.

### Readability follow-up — 5 October 2026

Increased small text across the public pages and forms: body copy and primary actions are at least 16px, supporting labels are 14–15px, and FAQ questions/answers are 18px/17px. Sizes use relative units where adjusted, with stronger secondary-text contrast, more line spacing, wrapping controls, flexible card heights and earlier mobile navigation. Competition cards use three, two and one columns across desktop, tablet and mobile widths.

TypeScript and the 303-file review export passed. All 12 source stylesheets parse successfully; no explicit `px`/`rem` font sizes below 14px remain. A second code review checked the responsive CSS; this was not a visual browser pass. The live homepage, seven other public/form pages and all four homepage stylesheets match the exported files over HTTPS. Homepage SHA-256: `d43056e2b2560fa47c22af1ca5b20bfa0f0e32317c37ac84b008e255231b30a3`. Noindex and form-blocking headers remain present. Proposal and minutes file hashes are unchanged. Prior preview is retained privately at `.codex-deploy-backups/youth-eco-summit/20261005-readability/home-before/`.
