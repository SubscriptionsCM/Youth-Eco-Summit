=== Youth Eco Summit Participation Bridge ===
Contributors: compactummedia
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

WordPress participation links and the supplied 2027 competition guidelines.

== Description ==

The plugin links to the separately hosted Youth Eco Summit application. It does not implement participant authentication, forms, uploads or saved records inside WordPress. The existing application's PostgreSQL database remains the source of truth; media remains in its configured object storage.

No browser API calls, remote server requests, iframes, tracking scripts, API keys or WordPress participant accounts are introduced. Only one administrator setting is stored: the public HTTPS origin of the portal.

The bundled guideline JSON is generated from src/data/guidelines-2027.ts in the application source. The original supplied PDF is included. The shared src/data/participation-window.ts supplies the confirmed student-registration and competition-submission deadline: 5 November 2026, 11:59 p.m. IST. School and teacher registration remain available beyond this deadline; their configured links are never disabled by the student window. PHP chooses the upcoming/open/closed student status at render time by comparing UTC Unix timestamps, independent of WordPress timezone settings. Unresolved source inconsistencies remain labelled.

The confirmed AI rule applies a 15-point deduction to AI-generated submission content. AI use for research or reference remains permitted; AI use does not trigger disqualification. This resolved decision appears with confirmed updates to the unchanged original PDF. The plugin displays guidelines only; human reviewers apply judging rules, and the plugin does not perform AI detection or scoring.

== Installation ==

1. Upload the generated ZIP through Plugins > Add New > Upload Plugin. Activate only on the intended WordPress installation.
2. Under Settings > Youth Eco Summit, enter the HTTPS origin of the deployed, tested application (for example https://participate.example.org). No path, password, query string or token is accepted.
3. Add [yes_participation] to a Shortcode block on the participation page.
4. Add [yes_guidelines] to a Shortcode block on the guidelines page, or to the same page below the participation block.
5. Verify each destination with real application hosting. A static approval-preview origin cannot save forms.

Without a configured origin, visitors see the participation schedule, an explicit message that portal links are not connected on this page, and the guidelines PDF link. Administrators additionally see a configuration link. No fake registration form is shown. Displaying the open participation schedule does not connect or deploy the portal.

== Shortcodes ==

[yes_participation]
[yes_participation audience="student"]
[yes_participation audience="teacher"]
[yes_participation audience="school"]
[yes_participation audience="dashboard"]
[yes_guidelines]

The routes are /register, /teachers/register, /schools/register and /dashboard respectively. Links open normally in the current tab. Login and saved-form behaviour are owned by the application.

== Updates and removal ==

Rebuild this ZIP from the application's canonical guidelines and participation window whenever they change; replace the plugin and clear page caches. Exclude shortcode pages from full-page caching, or expire their cache at participation-window boundaries so rendered status cannot remain stale. Backend date checks remain authoritative. Deactivation removes shortcode behaviour, so remove/replace the shortcodes when retiring the bridge. The plugin never modifies or deletes application data. Its single origin setting is retained on deactivation.

== Verification status ==

Package contents and generated guideline data are verified during the build. A PHP CLI / WordPress runtime is required for PHP syntax and activation testing. Check docs/wordpress-temporary.md in the application handoff for the verification actually performed and current hosting limitations.
