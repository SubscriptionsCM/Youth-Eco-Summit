# Searchable school ID — 8 October 2026

Deployed to the live WordPress site as yes-native-portal 1.3.1.

- Competition entry school gate searches the existing registered-school directory as the user types a school name, canonical ID or legacy ID.
- Suggestions show the school name, canonical ID and city/state. Selecting one fills the existing school_id field with its canonical ID.
- The same enhancement attaches at render time to text-yes-school-id in all ten prepared competition forms, preserving field names, required flags and saved/prefilled values.
- Canonical school-ID search now supports partial matches. Final school validation remains an exact registered-ID lookup.
- Search requests are debounced and cancelled on new input; stale responses cannot overwrite newer queries. The picker supports mouse/touch selection, arrow keys, Enter and Escape.
- The native frontend integration filters inline scripts by handle. The picker uses a yes-native-portal-prefixed handle so its localized search endpoint survives that filter.
- No forms were activated and no competition submission settings were changed.

Verification: JavaScript syntax check, all four changed PHP files linted, 57 school-picker checks and 173 existing competition-flow checks passed. Live browser verified search by name, search by partial canonical ID, mouse selection, keyboard selection and the server's acceptance of the selected registered school. No records or verification messages were created.

Backup: /home/u794443438/yes-deploy-backups/school-combobox-20261008/

![Live school ID dropdown](images/school-id-dropdown-20261008.png)
