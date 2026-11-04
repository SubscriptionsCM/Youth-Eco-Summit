# Historical import and reconciliation

Historical imports are private administrator operations. They never infer student identity from a name, school, or guardian phone and never create guardian access or consent records. Keep the reviewed original export in organizer-controlled storage while reconciling counts, dates, identity matches, and missing files.

## Preview

Call `importPreview(db,actor,input)` with:

```json
{
  "source": "organizer-archive",
  "kind": "schools",
  "mapping": { "sourceId": "School Source ID", "name": "School Name" },
  "schoolMatches": { "source-school-1": "new" },
  "rows": [{ "School Source ID": "source-school-1", "School Name": "Historical School", "address": "1 School Road", "city": "Delhi", "state": "Delhi", "postalCode": "110001", "registeredAt": "2018-06-01", "approval": "approved" }]
}
```

The HTTP router exposes this under `/api/admin/imports/preview` and commit under `/api/admin/imports/commit`. Responses use the application's `{data:...}` envelope. Batches contain at most 500 records and 2 MB of mapped input. `mapping` maps canonical field names to source-column names; omitted fields use the canonical name directly. Unmapped, unrelated source columns are discarded.

`source` identifies a stable source system, not a filename that changes on every retry. `sourceId` identifies a source record uniquely within that source and kind. Annual participation records need distinct IDs across editions. Reusing an already imported key produces a duplicate result and does not overwrite the retained record.

The preview returns `{rows:[{id,version,sourceId,status,issues,candidates?}],counts}`. Status is `ready`, `needs_review`, `invalid`, `duplicate`, or `purged`. Permanently deleted source IDs remain deletion markers: preview cannot overwrite them and commit cannot recreate them. Same-name schools may appear as candidates, but no candidate is selected automatically. `schoolMatches` maps a source school ID to an existing school UUID or the explicit choice `new`. Existing matches never overwrite school information. New schools remain pending unless the reviewed source explicitly supplies `approval:"approved"`.

## Supported fields

| Kind | Fields |
| --- | --- |
| `schools` | `sourceId`, `name`, `address`, `city`, `state`, `postalCode`, optional `registeredAt`, `approval` (`approved` or `pending`), `contactName`, `contactRole`, `email`, `phone`, `originalReference` |
| `participations` | `sourceId`, `name`, `class` (1–12), `schoolSourceId`, optional `studentSourceId`, `guardianContact`, `emergencyContact`, `section`, `coordinator`, `createdAt`, `originalReference`; top-level `editionId` is required and must identify a closed or archived edition |
| `submissions` | `sourceId`, `participationSourceId`, `competitionId`, `categoryId`, optional `answers`, `submittedAt`, `originalReference`, `originalState`, `fileReferences` (up to 30 HTTP(S) URLs) |

Import schools before participations, then participations before submissions. Participation `schoolSourceId` resolves through an imported school in the same source; an explicitly reviewed `schoolMatches` entry can select an existing active school instead. A stable `studentSourceId` reuses a student only within the same source. When absent, each participation source ID creates a distinct student. No name or phone matching occurs. Existing students retain their original identity fields, while each edition stores its own name, school, class, section, and coordinator snapshot. Unknown guardian contacts remain empty and do not become verified contacts.

Supplied historical dates are retained; absent dates use the import time and are marked as unknown in provenance. For a matched existing school, `import_rows.payload.summary.sourceRegisteredAt` retains the source registration date while the school's registered date remains unchanged pending an explicit reviewed correction. For schools, a valid `originalReference` is preserved as the new school’s permanent ID, or added as an accepted alias when explicitly matching an existing school. Canonical IDs on existing records are never rewritten. Conflicting IDs block import. Other imported entities receive new platform references and retain original references as provenance. Source contacts are unverified until the ordinary verification process confirms them.

## Commit

Only send selected, reviewed preview rows:

```json
{ "reviewed": true, "rows": [{ "id": "preview-row-uuid", "version": "preview-version-uuid" }] }
```

A newer preview invalidates an older version. Commit rechecks school, edition, and parent availability within transactions. Each row commits independently and returns a reconciliation outcome; successful rows are safe to retry. Response data is `{rows,imported,duplicates,errors,missingFiles}`. Resolve reported errors and preview those source rows again. Confirm expected counts against the source before declaring an edition imported.

Mapped personal-data payloads are cleared from `import_rows` after successful import, leaving identifiers and summary provenance. Pending/invalid previews may still contain mapped personal data and need an organizer-approved retention policy. Historical source-to-student identifiers remain after deletion to prevent an import retry from silently recreating a purged identity; such conflicts require an explicit operator reconciliation.

## File retention boundary

Importing submission metadata does not copy files. Historical entries remain drafts with an imported revision and `imported_submission_history.retention_status` of `unverified` or `missing`. `historical_file_refs` is the repair queue; a source link is not a ready asset. If the configured required file count exceeds the supplied source references, the importer creates missing repair records with inert locators such as `unknown-source:1`. These are identifiers for unresolved originals, not URLs to fetch; the owner local-file repair command can attach the authorized original to their repair IDs. Missing-file counts include those unresolved required originals. The module never fetches arbitrary URLs, executes source code, or issues public file links.

An organizer-controlled retrieval process must retrieve approved source files, pass them through the private storage/integrity/scan pipeline, attach verified retained assets to an audited submission revision, reconcile every source reference, and explicitly verify the historical retention status. Do not mark a repair item retained without a durable verified asset. This retrieval/attachment process remains an operational integration task; this importer does not claim that source files have been copied. Preserve inaccessible/missing status and report those counts until resolved. Verify both database counts and actual retained downloads before claiming complete historical availability.

Derived historical file references and submission provenance are deleted when their submission is permanently purged. Trash does not delete them. Source identity mappings contain internal source IDs and remain to prevent resurrection, while source URLs and historical content stay private and follow parent authorization.
