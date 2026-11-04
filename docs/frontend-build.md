# Public frontend handoff

Updated 29 September 2026.

**Integration update:** The later [frontend/backend integration delivery](frontend-backend-integration.md) supersedes the next-stage boundary below. The same-origin API journeys now run against the local database and worker, with test delivery/storage services. Production provider configuration remains outstanding.

The public website now uses the supplied *Youth Eco Summit 2027 Concise Website Copy*, the existing purple/yellow palette, event photography and layered cutouts. This delivery covers the public interface inside the supplied Next.js application. It does not configure production registration services or open registration.

## Pages and presentation

- Home: student-led hero, programme overview, student opportunities, parent/teacher/school benefits, competition formats, participation steps, summit experience, recognition, student-work introduction and registration FAQs.
- Editorial pages: About, Students, Parents, Teachers & Schools, Experience, Awards, Partners and Resources.
- Participation guide and FAQs: permanent school IDs, lifetime school registration, saved entries and the separation between competition entry and event attendance.
- Competitions and competition details: present the published backend catalogue rather than inventing active competitions, entry rules or deadlines.
- Existing Contact, school directory, student showcase, privacy and terms routes remain available. Contact/legal content, public school records and published student work continue to depend on approved backend data.

The primary colours are `#4D3F7F` and `#EDC119`, with cream and lavender supporting backgrounds. The design uses raster photographs and transparent WebP cutouts; no SVG illustrations or patterns were created. Asset sources and editing prompts are recorded in [frontend-assets.md](frontend-assets.md).

## Implementation map

| File | Responsibility |
| --- | --- |
| `src/components/site-shell.tsx` | Shared header/footer, responsive navigation and marketing/portal layout selection |
| `src/components/summit-home.tsx` | Home page sections and public calls to action |
| `src/components/editorial-pages.tsx` | Editorial pages, participation guide and FAQs |
| `src/components/public-pages.tsx` | Backend-driven competition and approved-content presentation |
| `src/components/home-interactions.tsx` | Keyboard-operable participation tabs |
| `src/components/campaign-motion.tsx` | GSAP entrances and foreground/background scroll movement |
| `src/app/campaign.css`, `src/app/editorial.css` | Responsive public styles and restrained hover/focus treatments |
| `src/app/layout.tsx`, `src/app/sitemap.ts` | Font, shared metadata and public route inventory |
| `public/images/` | Local raster assets |

GSAP reveals sections once with small position/opacity changes and moves layered imagery by modest independent distances. Animations are scoped to the page, reverted on route cleanup and disabled when `prefers-reduced-motion: reduce` is active. Revealed elements have their animation transforms cleared so CSS hover effects continue to work. The interface also provides a skip link, mobile menu, participation tabs with keyboard navigation and native FAQ disclosure controls.

## Preview without backend configuration

Use Node.js 24+ and npm from the project directory:

```sh
npm ci
npm run dev -- --port 3010
```

Open `http://localhost:3010`. No database is required to preview the public design. Leave `DATABASE_URL` unset for this mode. The existing backend returns empty public configuration, school and showcase responses when a database is not configured; it does not create demonstration records.

Do not copy `.env.example` unchanged for a design-only preview: its database URL points to the optional local Docker database. For backend development, use the template with the setup instructions in the [README](../README.md) and [operations guide](operations.md). Set `APP_ORIGIN` to the actual application origin, including the development port, when configuring authentication. Unconfigured registration or authentication services should remain unavailable rather than report false success.

## Backend integration boundary

The server services, domain rules, database migrations and worker remain preserved. Existing school/student registration, sign-in, dashboard, entry/upload, admin and judge flows retain their routes, API contracts and access controls. Public CTAs point to those existing routes. The form workflow is not replaced with local-storage submissions or simulated receipts.

The next integration stage must connect organization-owned PostgreSQL, private object storage, file scanning, SMS/email delivery and the worker; supply approved privacy/terms, consent, edition dates, competition rules and school records; then exercise real registration, uploads, recovery and judging. Public showcase entries still require the backend's publication permission and moderation. Marketing copy does not activate these services or grant entry/attendance eligibility.

## Production build

```sh
npm run typecheck
npm test
npm run build
```

The application uses `output: 'standalone'`. After a successful build, include both public assets and generated browser assets in the standalone bundle:

```sh
cp -R public .next/standalone/
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
node .next/standalone/server.js
```

Run these copy commands against a fresh build output. Deploy the contents of `.next/standalone` to a Node-capable service and start its `server.js`; set the service's `PORT`, application origin and runtime configuration as required. The background worker remains a separate process as described in the operations guide. This is a Next.js server build, not a static HTML upload for shared hosting. Do not publish private environment files with the downloadable source or public assets.

## Verification for this frontend delivery

- TypeScript check passed.
- Production build passed.
- Vitest: 110 tests passed.
- Public browser checks were performed through the computer-use browser tools (CUA), including responsive presentation and the interactive frontend.
- The Playwright suite was **not run for this frontend delivery**. Earlier results in [verification.md](verification.md) describe the supplied backend's previous verification, not a new frontend run.

These checks do not demonstrate live OTP/email delivery, storage/scanner configuration, successful production registrations, peak-load behavior or disaster recovery. Those remain part of the next integration and staging checks.

## Visual content expansion — 29 September 2026

The homepage now includes an immediate partner-logo slider (nine organisations with pause/resume and reduced-motion support), all eight current-site 2027 experience categories, ten original 2026 speaker posters, six historical winner PDFs, a photographic archive mosaic and verified press/social links. The learning overview also uses photographs. The original preferred hero collage is served directly without image recompression, with a genuine students-on-stage supporting card; `VOICE` is centred above the speaker. Small entrance effects accompany photos and text.

The homepage competition area explicitly features 15 awards. Registration FAQs follow the five-step guide, and showcase copy includes entries beyond awards. Supplied backend publication/consent controls remain in place. Public content, source ambiguities and open client/backend dependencies are mapped in [meeting-coverage.md](meeting-coverage.md) and [summit-source-audit.md](summit-source-audit.md). The homepage has canonical and structured metadata, and the sitemap/robots default to the official domain unless `APP_ORIGIN` is configured.

### Checks for the 29 September expansion

Production build (including TypeScript) passed after the final CSS adjustment. Desktop and 390px mobile layouts were reviewed in the browser without page-level horizontal overflow. The partner slider pauses and resumes using the keyboard, and the mobile speaker controls advance and return to the first poster. All six winner PDFs respond successfully with the correct PDF content type. The existing 110-test result above belongs to the initial frontend delivery; that suite was not repeated for this visual expansion.

## Participation imagery and motion refinement — 29 September 2026

- Partner-logo slots increased from 190×86 to 340×144 on desktop, and 150×77 to 240×118 on phones. Padding was removed and all slider marks load eagerly.
- Five transparent GPT-generated paper-collage illustrations are stored in `public/images/participation/` and used in the homepage steps, competition page and full participation guide. They are decorative concept artwork; original Summit photos remain historical imagery. Prompt set and generation method: [participation-art-prompts.md](participation-art-prompts.md).
- Competitions now has a large collage hero, visual expression panels, an illustrated catalogue/empty state, and genuine past-award photography. Actual competition data and routes are preserved. The guide gives all five steps a large illustrated scene and working jump links.
- Entrance motion is 350 ms for copy and 400 ms for imagery, with shorter travel and minimal staggering. All public registration FAQ lists now use the same 240 ms expandable panel. Keyboard controls, collapsed-content tab order and rapid reversal were checked in the browser; the open answer reflows at mobile width. See [motion-guidance.md](motion-guidance.md) for primary UX/accessibility sources and reduced-motion behavior.
- Production build and TypeScript pass. Homepage, competitions and participation guide were reviewed at desktop and 390 px phone width with no page-level horizontal overflow. Partner pause/resume, step tabs, step anchors and FAQ interactions were exercised. PNG dimensions and true alpha were verified.
