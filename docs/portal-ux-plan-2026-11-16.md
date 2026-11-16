# Portal usability implementation plan

Improve the existing admin, participant, school/educator and judge interfaces using the current Youth Eco Summit purple/ivory branding. Keep existing routes, roles, form schemas, validation, mutations and records intact. No production invitations, submissions or assignments will be created by verification.

- [x] Capture existing desktop/mobile layouts with synthetic role fixtures; inspect the existing flows.
- [x] Add grouped role-aware workspace navigation, current-location cues and a compact mobile menu. Keep the public website unchanged.
- [x] Replace technical admin overview labels with useful linked totals and task shortcuts using existing APIs. Improve inbox filtering, results and record-detail focus.
- [x] Organize participant saved work into searchable drafts, submissions and earlier entries; give school/educator workflows clear entry points without inventing new account roles.
- [x] Apply consistent responsive tables, form spacing, readable headings, status labels and pagination. Keep judge scoring and account permissions unchanged.
- [x] Verify navigation, keyboard access, filters and role boundaries with focused tests; compare built desktop/mobile screenshots using seeded local data and run full CI.
- [x] Review changes, deploy a validated artifact to Hostinger with rollback retained, verify production read-only views and data preservation, and document results.

Implementation boundaries: shared navigation/status helpers and workspace components; existing admin, reference dashboard/inbox and judge components; scoped workspace CSS. No database migrations or dependency additions are required.
