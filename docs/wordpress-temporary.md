# Temporary WordPress participation bridge

The portable plugin is in `wordpress/yes-participation-bridge/`. It gives a WordPress site participation links and the supplied 2027 competition guidelines. It does **not** move the forms or participant records into WordPress.

Students, teachers and schools use the existing Next.js application in a normal, top-level browser navigation. Saved registration steps and competition entries belong to the same PostgreSQL backend, and uploads remain in the configured object storage. WordPress stores only the public portal-origin setting. There are no duplicated participant identities, WordPress form submissions, API credentials, reverse proxies or embedded cross-origin forms.

## Build the installable ZIP

From the application project, after `npm ci`:

```sh
node scripts/build-wordpress-bridge.mjs
```

Output: `wordpress/yes-participation-bridge/yes-participation-bridge.zip`.

The build exports `src/data/guidelines-2027.ts` and `src/data/participation-window.ts` into bundled JSON, copies the supplied guidelines PDF from `public/documents/guidelines/`, and packages an explicit five-file allowlist. No environment files, database exports, credentials, test records or application source are packaged. The ZIP includes a single correctly named plugin directory, ready for WordPress upload. Rebuild and reinstall when the canonical guidelines or dates change; clear WordPress/CDN page caches afterwards.

## Install and configure

1. Confirm the intended WordPress installation and have an administrator upload the ZIP under **Plugins → Add New → Upload Plugin**. Activate only on that confirmed installation. The declared minimums are WordPress 6.0 and PHP 7.4; runtime compatibility still needs verification on the target.
2. Host and verify the full Next.js application, including PostgreSQL, storage, background worker and production delivery providers. A static frontend approval preview cannot save forms.
3. In **Settings → Youth Eco Summit**, enter the app’s HTTPS origin, for example `https://participate.example.org`. The setting accepts an origin only; no path, credentials, query string or fragment. Configure the application’s `APP_ORIGIN` to that same deployed origin through the existing application deployment process.
4. Add a WordPress **Shortcode** block containing `[yes_participation]` to the participation page.
5. Add `[yes_guidelines]` to the guidelines page, or below the participation block. The plugin supplies scoped CSS and native accessible disclosure controls; it needs no JavaScript, theme templates or SVGs.
6. Verify all four links against the real application and complete teacher/student save-and-resume acceptance checks there. The bridge does not enable or approve competitions and does not bypass backend registration or submission rules.

Leave the origin empty until the portal is ready. Public visitors then see the participation schedule, an explicit message that registration links are not connected on this page, and a PDF download; administrators also see a configuration link. An open schedule is not evidence of a configured or deployed portal. No disabled or fake submission form is displayed.

## Student registration and competition deadline

The user confirmed that **student registration and competition submissions only** are open and close on **5 November**. **School and teacher registration remain available after this cutoff.** The shared window's scope is `student-registration-and-competition-submissions`; the plugin does not disable teacher or school links when that window closes. The shared window represents the current cycle as **5 November 2026, end of day IST**: its exclusive closing boundary is `2026-11-05T18:30:00.000Z` (6 November 2026 at 00:00 IST). The visible deadline is 5 November 2026, 11:59 p.m. IST. The opening boundary is the previously agreed 1 October 2026 launch, `2026-09-30T18:30:00.000Z`.

The build exports the explicit student/submission scope, both UTC epoch boundaries and the three status labels produced by the canonical `participationWindowStatus()` function. PHP selects the label using `time()` on each render, so WordPress/PHP timezone settings cannot shift the deadline. It does not freeze the open/closed status at build time. Both shortcodes show the student-specific schedule and state that school and teacher registration continue; neither changes backend dates or overrides registration/submission enforcement. All configured links remain ordinary portal navigation; the application enforces the student cutoff.

Full-page caches can retain previously rendered HTML: exclude these shortcode pages from caching, or expire their cache at the opening/closing boundaries. The application’s server-side date checks remain authoritative regardless of cached marketing copy.

## Exact shortcode mapping

| WordPress shortcode | Application route | Purpose |
| --- | --- | --- |
| `[yes_participation]` | All four below | Participation choices |
| `[yes_participation audience="student"]` | `/register` | Student registration |
| `[yes_participation audience="teacher"]` | `/teachers/register` | Teacher registration |
| `[yes_participation audience="school"]` | `/schools/register` | School registration |
| `[yes_participation audience="dashboard"]` | `/dashboard` | Sign in and continue saved work |
| `[yes_guidelines]` | Local plugin JSON and PDF | 2027 topics, requirements, judging criteria and open clarifications |

All application routes append to the configured origin. Links use ordinary navigation in the current tab, so the application owns its login session and resume behaviour. Existing `APP_ORIGIN`, cookie, ownership and frame-protection checks remain unchanged. The plugin performs no API fetches or server-to-server requests. A URL under a subdirectory is intentionally rejected: the current application's canonical routes assume an origin-root deployment.

## Guidelines provenance

The canonical source is `src/data/guidelines-2027.ts`, transcribed from the team-supplied **YOUTH ECO SUMMIT TOPICS AND GUIDELINES-2027.pdf** and updated with confirmed decisions. The original PDF is bundled unchanged; its SHA-256 is recorded in the JSON. Titles, classes, topics, media requirements, rewards, rubrics and source clarification notes are exported rather than re-entered in PHP. Student registration and competition dates follow the confirmed scope above. On 6 October 2026, the user confirmed Waste to Art for Classes 5–12 in four bands: 5–6, 7–8, 9–10 and 11–12. The user also resolved the AI rule: **AI-generated content in submitted work incurs a 15-point deduction, with no AI-based disqualification; AI research/reference use remains permitted.** These decisions appear under confirmed updates, separate from the remaining questions about art scoring totals and the missing eco-business template. The PHP renderer groups clarification items by the canonical `resolved` flag, so resolved decisions do not appear as awaiting confirmation. The bundled PDF retains its original contradictory wording as source provenance; current web rules use the confirmed decision. The plugin does not detect AI content or perform judging.

## Verification and current hosting inventory

- Build validates unique competition slugs, data completeness, UTC window ordering, the three canonical status states, the local PDF signature and package contents. It compares packaged JSON with the canonical export and hashes the bundled PDF against the supplied file.
- Static checks cover the WordPress capability/settings guards, fixed destination routes, and absence of remote calls, participant-account creation or iframes. These checks do not replace execution in WordPress.
- The local environment has no PHP CLI. PHP syntax and WordPress activation/runtime testing are therefore **not yet verified**; the build will run `php -l` automatically when PHP is available.
- Read-only Hostinger WordPress installation lookups for `youthecosummit` and `compactummedia.com` both returned **401 Unauthenticated** on 6 October 2026. No live installation, WordPress/PHP version, theme, cache plugins or administrator access was verified. No deployment or activation was attempted.
- Still required before activation: confirmed WordPress URL/administrator access; the real hosted portal HTTPS origin; confirmation that its full backend and step-saving flows are operational; a target WordPress smoke test. The existing Compactum static approval preview is not a hosted form backend.

## Retirement

Remove or replace the shortcodes before deactivating the plugin. Deactivation does not delete the origin option or alter any application data. Returning to a full Next.js public site needs no participant-data migration because the temporary WordPress site has not created another data store.

Implementation references: [WordPress Shortcode API](https://developer.wordpress.org/plugins/shortcodes/shortcodes-with-parameters/), [Settings API](https://developer.wordpress.org/plugins/settings/settings-api/), [register_setting](https://developer.wordpress.org/reference/functions/register_setting/), [stylesheet enqueuing](https://developer.wordpress.org/plugins/javascript/enqueuing/).
