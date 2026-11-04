# Repair retained historical originals

Historical import keeps original source URLs as missing/inaccessible references. It creates no participant access, consent, or successful current submission. An owner operator can copy a legitimately obtained original from a local file into the organizer's private object store with this command:

```powershell
npx tsx scripts/import-file.ts "<historical-file-ref-uuid>" "C:\Approved archive\original.pdf" "<active-owner-contact>"
```

Run it in the authorized organizer maintenance environment with `DATABASE_URL`, private storage credentials, and the scanner configuration from [storage.md](storage.md). The owner contact selects the active owner for the audit record; it is not a password or a public web authorization mechanism. Access to this CLI and its database/storage credentials must be restricted to authorized operators. It does not expose a web endpoint.

First obtain the original through the existing account owner's approved access, and confirm the selected local file corresponds to the source reference. The command never fetches the recorded URL, accepts no HTTP URL as a local path, and does not execute files. A local filesystem path is explicit operator authorization to read that file. The command only prints asset ID and statuses; it does not log source paths, owner contact, signed URLs, or credentials.

An authorized database operator can list unresolved identifiers without exposing the source URL:

```sql
SELECT f.id AS file_ref_id, s.reference AS entry_reference, f.status,
       f.asset_id, f.last_error
FROM historical_file_refs f
JOIN submissions s ON s.id=f.submission_id
WHERE f.status <> 'retained' AND s.trashed_at IS NULL AND NOT s.purging
ORDER BY f.created_at, f.id;
```

The command requires a live imported source record, its original revision 1, and a closed or archived edition. Trashed/purging parents are refused. Approved historical file MIME types and maximum bytes must be configured on the competition. The original historical workflow state remains separately recorded; the CLI never changes the platform entry from draft or fabricates consent.

The copy streams a full SHA256 hash, creates a persisted multipart upload, and transfers bounded parts directly from the local file. Re-running with the same original resumes existing uploaded parts or recovers an object completed before a process crash. A retained original cannot silently be replaced with different bytes. Corrected copies for a quarantined source get new immutable asset keys, while the old quarantined original remains retained for audit and eventual authorized purge.

Completion queues a durable `verify_historical_asset` job and also attempts verification immediately. The worker handler is `verifyHistoricalAsset(db, payload.assetId)` exported by `src/server/historical-files.ts`. It invokes the same streamed size, actual-type, full checksum, malware, and configured video-duration checks used for current entries. A copy is not retained merely because a storage upload succeeded.

Only a ready asset sets its source reference to `retained`. A rejected copy is `inaccessible`; transient failures remain `missing` and are visible on the verification job. Retry the same command after an operational failure, or retry the failed job if transfer already completed. Every source reference must resolve to a ready asset before the history's retention status becomes `verified`. The historical revision records the ready asset IDs and whether its files have been verified; originals stay on revision 1, never on a new participant draft revision. No participant access or consent records are created.

While copying, the CLI holds database locks on the entry and its parents so concurrent Trash/purge cannot delete an in-flight copy. Run large repairs in a maintenance window, use a long-lived Node process rather than a short request handler, and size database connection/transaction limits accordingly. A process killed during transfer leaves a resumable upload with a retained database reference. A crash during the brief initial multipart creation transaction can leave an orphan provider upload, handled by the documented reviewed cleanup process in the storage runbook.

Before production use, exercise a representative large local video, interrupted resume, scanner outage, current-version retrieval, quarantine, and versioned purge against the selected provider. Local adapter tests do not establish provider compatibility or actual archive access permission.
