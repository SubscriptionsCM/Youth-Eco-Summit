# 30 September review — implemented 5 October 2026

The dedicated minutes page retains 28 September and adds 30 September as the default tab. Clarifications received on 5 October are labelled separately from the original meeting record.

| Request | Implementation / status |
| --- | --- |
| Shorter mobile homepage | Removed repeated long audience/recognition sections; detailed content remains on dedicated pages. Learning cards, competition formats and Get Involved cards scroll horizontally on mobile. |
| What to expect and photo grids as sliders | Native scroll carousels with touch, mouse drag, keyboard navigation, visible controls and reduced-motion support. Speakers and mobile winner PDFs use the same component. |
| Draggable partner logos | Large logos, drag/swipe and arrows. Follow-up on 5 October removed the Play/Pause control and visible swipe instructions from the partner strip. Logos glide back and forth, pause for browsing, and respect reduced motion. |
| Simple arrows | Plain right/left arrows replace diagonal CTA arrows in public components. |
| Remove Foundation branding | Initiative/footer credits removed. Prominently branded lectern/stage photos replaced with clean archive photographs or typography. Speaker poster sponsor footers are cropped from display. Historical PDFs and original media files are preserved; external press destinations and historical meeting records are unchanged. |
| Drop 2027 from top menu | Removed from the header wordmark. Edition labels remain where relevant to content. |
| Hero positioning and theme | “Asia’s largest youth-led platform” and “Waste segregation, the need of the hour” added. |
| Countdown | Uses 29 January 2027 per 5 October instruction. Counts Indian calendar days without inventing an event start time. The event date still needs final confirmation with the team. |
| Get Involved | Hero anchor, persistent navigation link, homepage section and `/get-involved` page route students, educators/schools and partner organizations. |
| Partner form | `/partners/enquire` persists validated, consented enquiries privately; administration queue supports follow-up statuses. Submission remains disabled on the frontend-only preview. |
| Appropriate competition imagery | Notebook/painting/craft/speaking archive photos retained. Unrelated article/blog/film photos replaced with typographic format cards until suitable approved photos arrive. No invented people or SVGs added. |
| Video in student section | Exploratory request, held until an approved video is supplied. The repeated student section was removed from the homepage; student content remains on its dedicated page. |
| Impact statistics | Explicitly held at the user's request on 5 October. No estimated student/school/city statistics published. |
| School-first registration | Lifetime school record, approval and permanent ID remain prerequisites. Student school autocomplete shows branch location and IDs and submits the selected school UUID. |
| Preserve existing IDs / prevent same-name merges | New identifier registry retains existing imported IDs and reviewed aliases. Names are never identity keys. Import conflicts require review. |
| Preload schools | Import workflow ready; actual data sheet and reconciliation approval still awaited. No school/teacher records fabricated. |
| School-level dashboard | Verified school contacts see linked students, edition registrations and submission status, with filters, pagination and refresh. Private student files and parent contacts are not exposed. |
| Hosting migration | Production requires a Node-capable app/worker host, PostgreSQL, private object storage and live service configuration. The current Hostinger link remains a frontend approval export. Hosting ownership/destination is awaiting clarification. |

## Verification

- Full unit/integration suite: 152 tests in 15 files passed.
- Production Next.js build and frontend review export passed.
- Review export: 303 files, 25 HTML pages; automated internal-link/asset audit and no-backend/noindex checks passed.
- Rendered-text audit found no Foundation branding in exported page text.
- Dedicated minutes tabs, filtering/checklist persistence, keyboard controls and print/copy behavior verified independently.
- Local PostgreSQL recovered from a confirmed stale lock after restart; migration 010 applied successfully to `yes_local_integration` only. School-search and public-config HTTP checks returned 200. Local SMS/email capture, storage emulator, worker and application are running.
- Local website visual browser verification was blocked by the browser tool's URL security policy. No alternate browser access was used to bypass it; layout/interaction code and builds were reviewed instead. No claim of new full visual browser verification is made.

Read [school-and-partner-update.md](school-and-partner-update.md) before deploying the backend. The website launch date is not a competition-entry deadline. Approved rules, policy text and provider configuration remain required for production registration.
