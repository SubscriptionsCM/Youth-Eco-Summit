# Searchable state and union territory dropdown — 8 October 2026

Updated the live WordPress forms on youthecosummit.com using the current production portal (1.2.0) as the baseline.

School registration, school nomination, and partner enquiry address-state text fields now render as searchable Forminator dropdowns. Student and educator registration already have searchable State/UT dropdowns with the complete list and were retained.

The new address dropdown offers 36 alphabetically sorted names. India's administrative count is confirmed by the [Government of India fact sheet](https://www.cgihambantota.gov.in/page/fact-sheet-india/). The combined Dadra and Nagar Haveli and Daman and Diu territory appears as one option. Existing ampersand spelling is recognized when restoring saved data.

Implementation: `wordpress/yes-native-portal/includes/india-state-select.php`, included by the portal main file. It uses Forminator's existing Select2 controls and adds no new JS, CSS, or SVGs. The original address field names, required status, labels, and backend storage remain intact. Unknown older free-text draft answers are preserved visibly for correction; final submission requires a recognized selection. Partial drafts remain savable.

Verification: searched “Lad”, selected Ladakh, advanced to the next step, confirmed its value in the original WordPress address data, reloaded the private draft, and confirmed Ladakh remained selected. Empty required selection prevented advancement. Seven focused server checks passed. No final registration or verification message was sent. The synthetic test draft's final saved record (2837) was privately backed up and removed.

Screenshot: `docs/images/searchable-state-dropdown-20261008.png`.

Private rollback backup: `/home/u794443438/yes-deploy-backups/state-dropdown-20261008/before-portal.php`. The live change adds one module include; it preserves all pre-existing portal handlers, including SMS/email verification and draft saving. Roll back the added include rather than deploying an older local portal copy.
