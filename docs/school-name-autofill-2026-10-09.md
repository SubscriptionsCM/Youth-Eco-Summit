# School ID → school name — 9 October 2026

Live WordPress native portal 1.3.5. Selecting an ID in any of the ten competition forms fills its own `text-yes-school` field from the registered record. The field is read-only to avoid mismatches. Changing/clearing the ID clears the previous name; selecting another record updates both fields. Exact canonical/legacy IDs can restore the name on initial load or lookup; partial matches are never selected automatically. Values from saved drafts remain until a successful matching lookup. Existing server-side canonical school name storage is retained.

Verification: PHP lint, JS syntax check, 77 server checks covering all ten competition forms. Live browser: Astha Angel Academy ID fills its name; typing Amity clears the previous name; selecting Amity International School fills the name and canonical ID. Explicit save and reload restore both values. Test-only draft was backed up and removed; no final entry, registration or messages were sent.

Live proof: `docs/images/school-name-autofill-live-20261009.png`.
Backup: `/home/u794443438/yes-deploy-backups/school-autofill-20261009/` contains prior picker JS/PHP and portal version source, plus removed QA data outside public_html.
