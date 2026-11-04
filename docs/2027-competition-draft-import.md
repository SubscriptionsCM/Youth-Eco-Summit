# 2027 competition drafts

The user authorized carrying the existing competition formats forward for the 2027 programme. The eight names come from the official [2026 winner list](https://youthecosummit.com/wp-content/uploads/2026/02/Final-Winner-sheet2026.pdf): Essay, Article Writing, Blog Writing, Short Film Making, Spoken Word (Monologue), Painting, Waste to Art and Eco-Business Model. See [source audit](current-competition-source-audit.md) for edition differences and missing rules.

## Run locally

```sh
node scripts/local-run.mjs migrate
npm run local:competition-drafts
```

Both commands use the existing marked `.env.local` configuration. The importer separately enforces the local environment guard, which permits only the development database `yes_local_integration` on `127.0.0.1:5432` and the configured local integration services. It refuses production or a different database. It is not a production seeding command.

The import creates one **draft** edition, `Youth Eco Summit 2027`, and eight version-one **draft** competitions. Entry dates, registration dates and event date remain `NULL`. No eligibility bands, individual/team policy, entry limits, form fields or upload restrictions are supplied. The config stores provenance and the outstanding review fields; guidelines identify the record as an unconfirmed 2027 draft. An audit event records newly created IDs. Existing fixtures and published records are preserved.

The importer is transactional and idempotent. Re-running preserves record IDs and any edits rather than replacing them, including a renamed edition with its provenance intact. It refuses conflicting 2027 editions or an imported edition that is no longer a draft. It never approves a competition or opens registration.

Migration `009_competition_draft_dates.sql` permits missing dates only on draft competitions. Approved/closed records still require dates, and the original closing-after-opening constraint remains. The admin approval action additionally rejects missing dates and incomplete rules.

## Before entries open

The organizer must confirm the 2027 rules and dates. The existing versioned competition workflow creates a new configured version under the same edition and slug; keep imported version one as provenance, and configure version two with the confirmed title, guidelines, dates and full rules. Only then use the separate approval action. Registration also requires independently configured consent and edition dates before the edition can open.

Drafts do not appear in `/api/public/config`, and cannot accept submissions. The public editorial programme can describe the eight formats independently; it must not use these unconfirmed records as open entry forms.
