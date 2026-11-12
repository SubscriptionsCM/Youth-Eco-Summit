# Current live presentation matching plan

**Goal:** Match the images, copy, public layouts and shared navigation currently published at youthecosummit.com on new.youthecosummit.com, as explicitly requested by the user.

**Architecture:** Keep the existing Next.js application, authentication, form workflows, APIs, Supabase records and private file storage. Capture reviewed public page markup and stylesheet/media assets into a versioned local reference, render public marketing routes from that source, and provide local interactive behavior for its tabs, disclosures, galleries and video. Keep transactional routes on their existing components. Do not import source tracking scripts, account state, private information or WordPress executable code.

**Tech stack:** Existing Next.js/React/TypeScript application; static public HTML and CSS; source images/fonts/video stored under a new immutable public asset namespace. No additional hosted services or paid purchases.

## Tasks

- [ ] Capture all 15 existing public marketing routes, their published content, source CSS and public media. Resolve streamed public HTML and inventory controls/assets.
- [ ] Add failing contract tests for safe static content, complete route coverage, local asset integrity and reduced-motion video behavior.
- [ ] Add the public-content renderer and local interactive behavior; adapt shared header/footer to the reference while preserving account controls and new-site form destinations.
- [ ] Copy original public images, font files, PDFs and desktop/mobile hero video into a new asset namespace, preserving existing files.
- [ ] Run contract tests, existing full suite, type checking and production build. Review source changes and confirm no database/form implementation was replaced.
- [ ] Compare source and destination screenshots and geometry at equal desktop/mobile widths, including video poster, section order, images, copy, tabs, FAQs, menus and carousel controls. Resolve mismatches.
- [ ] Publish the validated build through the existing GitHub/Hostinger release workflow; verify the public result and retained rollback, and write a concise report with any concrete limitations.

## Acceptance boundary

The source site is the visual and public-copy authority for this request. Existing data, form definitions, privacy/consent rules, authentication and mail behavior are outside presentation replacement and remain preserved. Existing approved backend requirements and later cutover remain tracked separately. Do not copy incidental source text-encoding errors or tracking integrations into the application.
