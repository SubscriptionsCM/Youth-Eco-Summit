# Current WordPress presentation reference

The public presentation is sourced from youthecosummit.com as requested on 12 November 2026. It covers the 15 public marketing routes, their section order and wording, source styles, original images, desktop/mobile background video, fonts and winner documents. The versioned `src/data/live-presentation.json` contains only reviewed public content and source hashes. Media lives under the new `public/reference-20261112/` namespace; original application assets were retained.

`LiveReferencePage` renders the reviewed public content through the existing application. Local controls provide video play/pause and visibility/motion handling, partner animation/manual browsing, speaker navigation, three winner editions with 256 published highlights and original PDFs, participation tabs and FAQ disclosures. The shared header/footer match the source while keeping the existing account menu and sign-out behavior. Account, registration, entry, staff, API and private storage implementations remain in place. Contact links use the working app contact form; the showcase continues reading the existing approved-publications API rather than freezing participant records into a snapshot.

Source executable scripts, tracking integrations, form actions and transient account state are excluded. Runtime credentials, private exports and database data are not inputs to this presentation import. Source-specific loading placeholders are resolved or replaced with the existing working app action/feed.

## Reproduce a reviewed public update

The operator scripts require Python, `beautifulsoup4`, and the existing Node development dependencies plus Chrome. The winners capture uses a fresh Playwright browser. They are not run in CI or at application startup, and use public HTTPS endpoints without credentials:

```text
python scripts/capture-live-presentation.py
node scripts/capture-live-winners.mjs
node scripts/capture-live-footer.mjs
python scripts/sync-live-presentation.py
```

Capture results stay in the Git-ignored `.local/source-design-20261112/` directory. Review changes before committing the generated public JSON, CSS and media. This is an explicit versioned update, not automatic publication of future source-site changes. Keep transactional pages on their existing components.

CI checks public route coverage, absence of active source scripts/forms/handlers, original asset hashes, local anchors, preserved form/feed destinations and actual DOM control behavior. Actual desktop/mobile browser comparisons are recorded in `docs/design-qa.md`; DOM simulation and HTTP success alone do not establish visual parity.

Each public route also replays its original stylesheet order in an ordinary route-owned style element. This preserves route-specific cascades and removes the override on navigation. The shared stylesheet remains the baseline for the app shell and transactional pages.

Rendered footer copy is captured separately because the source currently publishes different footer wording on the homepage/competitions and the other public routes. Rendered page labels take precedence over stale source server markup where they differ.
