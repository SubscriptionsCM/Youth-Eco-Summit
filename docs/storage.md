# Private retained files

Originals live in an organizer-owned private S3-compatible bucket. No browser-visible download URLs are generated. Every `GET` or `HEAD /api/media/:assetId` rechecks the current actor, parent records, assignment, revision, Trash and purge state through `assetAccess`. Bytes already delivered cannot be recalled. Only allowlisted raster images and video are inline; documents, source code and archives download as attachments with `nosniff` and restrictive CSP. Single byte ranges support video seeking.

For reviewed historical references, use the owner-only [local original repair workflow](historical-file-repair.md). It preserves the original historical revision and uses the same verification pipeline without granting participant access or fabricating consent.

An organizer may separately approve selected submitted files for public release using publication `assetIds` and explicit `mediaApproved:true`. Public gallery media uses `/api/public/showcase/:publicationId/media/:assetId`, never a storage URL. The gateway checks active approval, exact current revision, selected ready assets, all parent Trash/purge states, and the latest separate publication consent of the lead and every team member on every GET and HEAD, including video ranges. The gallery listing uses the same live checks. Responses use generated filenames, safe inline formats, pinned verified object versions/ETags, and `no-store`; withdrawn or unavailable work returns 404. This public release is distinct from authenticated private previews. Already downloaded public bytes cannot be recalled.

## Configuration

| Variable | Purpose |
| --- | --- |
| `S3_BUCKET` | Private retained-object bucket; required |
| `S3_REGION` | Signing region; required |
| `S3_ENDPOINT` | Optional S3-compatible API endpoint |
| `S3_FORCE_PATH_STYLE` | Set `true` for providers requiring path-style addressing |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Standard AWS SDK credential chain, or use workload identity |
| `FILE_SCAN_URL` | HTTPS service accepting raw file bytes by POST |
| `FILE_SCAN_TOKEN` | Optional scanner bearer secret |
| `FILE_SCAN_TIMEOUT_MS` | Scanner timeout, default 600000 ms; coordinate infrastructure limits |
| `STORAGE_DEV_SKIP_SCAN` | `true` enables bypass only with `APP_ENV=development` and `NODE_ENV` other than production |

Absent storage or scanner configuration leaves uploads or verification closed. A scanner outage records `failed`, and the durable `verify_asset` job throws for retry; content rejection records terminal `quarantined`. Admin operational views must show both. Production must never set the development bypass. The selected provider must support multipart upload, version listing/deletion, conditional GET and ranged reads. Validate these against the chosen service before opening registration.

Configure the bucket to block all public access. Browser CORS allows only the platform origin, `PUT`, and the headers needed by signed part uploads; expose `ETag`. Server credentials need create/upload/list/complete/abort multipart permissions, object reads, version reads/list/deletion, and bucket version listing. Enable versioning and encryption according to the organizer's approved retention policy. Never apply object expiration rules to retained files or Trash.

## API and browser integration

All JSON uses `{data: ...}`. API mutations use the platform's authenticated, CSRF-protected catch-all route. File names are metadata, never storage keys.

1. Compute a full-file SHA256 hex checksum. `POST /api/uploads/start` with `{submissionId, originalName, byteSize, checksum}` returns `{id,status,partSize,partCount}`. Start validates draft ownership, configured file count and maximum bytes. Store the asset ID locally with file size/checksum so a reload can resume only the same local file.
2. `GET /api/uploads/:id` returns `{id,status,partSize,partCount,parts:[{partNumber,size,etag}],error?,needsCompletion?}`. Uploaded parts come directly from storage. If storage completed before a server crash committed its database record, `needsCompletion:true` tells the client to call the completion endpoint immediately, skipping part uploads. Do not persist signed URLs; sign again when resuming.
3. `POST /api/uploads/:id/parts` with `{partNumber}` returns `{url,expiresIn:300}`. Upload exactly the corresponding `partSize` slice using PUT; the last slice may be shorter. XHR upload events provide progress. The URL authorizes only one upload part and is short lived. Part signing rechecks ownership and editable draft revision. An issued upload URL can remain usable until expiry, but completion and media access always recheck authorization.
4. `POST /api/uploads/:id/complete` with `{}` validates actual provider-listed consecutive parts and lengths, completes the multipart object, pins its ETag/version, and durably enqueues verification. A retry recovers an already-completed object without replacing it. Response is `{id,status:'processing',partSize,partCount}`. Poll upload status until `ready`; `processing` is never submission success. A failed verification can be retried through this endpoint while the entry remains editable. Quarantined files require corrected replacement uploads.
5. Use `/api/media/:id` for preview or add `?download=1` for attachment. Do not expose storage keys or signed read URLs. Ownership and all object data reads are reauthorized by the server.

To replace a failed or unwanted current-draft file, `POST /api/uploads/:id/trash` with `{reason}`. This retains its object and audit history. `POST /api/uploads/:id/restore` with `{}` restores it while the same draft revision remains editable and the file count permits it. A finalized revision's file cannot be removed independently. Keep the returned asset ID in the draft UI to expose recovery; trashed uploads do not appear in the ordinary status endpoint.

If a replacement has already been submitted, an owner or administrator can recover the discarded file using `POST /api/uploads/:id/recover` with `{reason}` (3–2000 characters). This requires restored, non-purging parent records and an existing immutable revision snapshot that excludes the file. The response is `{data:{id,trashed:false,archived:true,revision}}`. Recovery preserves original file metadata and records the recovery reason and previous Trash details in the audit trail. It never changes the snapshot, scores, or public selection. Recovered discarded files are available only in the administrator archive; participant and judge media access requires immutable snapshot membership for finalized revisions. Processing/failed assets reenter verification, quarantined assets remain unavailable, and incomplete uploads cannot be resumed against a finalized revision.

The worker calls `verifyAsset(db, payload.assetId)` for `kind='verify_asset'`. It streams the entire object through SHA256 with a bounded 128 KiB sniffing buffer, checks exact expected bytes, detects actual format, then streams a second pinned read to the security scanner. Unknown binary is rejected even if a caller labels it harmless. Explicitly permitted UTF-8 source text is stored as `text/plain` and always downloaded; submitted code is never executed. Archives need scanner recursive archive inspection, decompression limits, and malware handling. Sniffing is format detection, not malware detection. Formats requiring more than the bounded prefix may fail closed; validate the approved catalogue with representative files.

Scanner request headers: `Content-Type: application/octet-stream`, `Content-Length`, `X-Content-SHA256`, `X-Content-Type`, optional bearer authorization. Success JSON must include `{clean:true,sha256:"<full hash>",engine?:"...",durationSeconds?:number}`. `{clean:false}` quarantines. A non-2xx or ambiguous result fails closed and retries. When `config.files.maxDurationSeconds` is set for video, the scanner must return a positive finite verified duration within that maximum. The scanner needs an isolated environment; do not execute submitted source or active document content.

## Retention, purge and recovery

Assets retain immutable generated keys and submission revision. A draft asset uses `submission.revision + 1`; submission locks the revision. Ordinary deletion is database Trash, preserving the object. No background deletion or automatic Trash expiry exists.

`purgeObjects(keys)` is only called by the authorized tracked purge job after marking parents inaccessible. It validates exact generated keys, aborts matching incomplete multipart uploads, deletes every version and delete marker, checks per-object provider errors, then verifies the key is absent. Any inability to list versions or delete locked versions fails the job rather than claiming completion. Retry storage deletion before committing the final database purge. Reference and parent checks belong to the domain purge transaction. There are currently no generated preview copies; register their keys in this deletion manifest if added later.

Abandoned parts must not use a blanket lifecycle deadline that interrupts valid resumable uploads. No abandoned-upload deletion runs automatically. Operators must review upload status and `last_activity_at`, agree a grace period, exclude retained assets and active resumable sessions, and use a separately documented cleanup process. A DB failure after multipart creation can leave orphan parts; the same review must reconcile those provider-side uploads.

Restore drills must recover both database records and object versions, then reapply completed purge tombstones before enabling access. Provider backups follow the approved backup retention schedule and cannot be represented as instantly erased. Staging gates include interruption/resume of realistic large videos, scanner quarantine/outage recovery, revoked judge access between range requests, provider versioned purge failures, and a representative data-plus-file backup restore.

References: [S3 multipart part listing](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html), [file-type content detection](https://github.com/sindresorhus/file-type).
