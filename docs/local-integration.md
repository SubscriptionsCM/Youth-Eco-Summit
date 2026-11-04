# Local integration runtime

This runtime connects the existing application to a dedicated PostgreSQL database, local SMS/email capture, and a Moto S3 test server. It does not change the production database, storage, delivery, authorization, or scanner implementations.

## Addresses and data

| Service | Local location | Retention |
| --- | --- | --- |
| Next.js development application | `http://127.0.0.1:3010` | Application process |
| PostgreSQL | `127.0.0.1:5432`, database `yes_local_integration` | Persistent local PostgreSQL data |
| Delivery capture | `http://127.0.0.1:4011/sms` and `/email` | `.local/inbox/messages.jsonl` persists |
| Moto S3 | `http://127.0.0.1:4012`, bucket `yes-local-integration` | **In memory: uploaded objects disappear when Moto restarts** |

PostgreSQL records can outlive the local uploaded objects they reference. Restarting Moto does not restore previous upload bytes. Keep it running during a review, or recreate the test uploads after restarting. A real persistent S3-compatible service is required for deployment and retention testing. MinIO was not installed on this machine.

`.env.local` holds a random authentication secret, separate random delivery tokens, and local configuration. It is ignored by Git, has mode `0600`, and must never be deployed. It does not override `NODE_ENV`; the application must run with `next dev`. Files under `.local/` are also ignored by Git. The private inbox and Moto log have mode `0600`; local runtime directories have mode `0700`.

## Set up

Prerequisites: the repository's Node dependencies, Node with `util.parseEnv`, Python with `venv`, and PostgreSQL accepting the current operating-system user on loopback port 5432 with permission to create the dedicated local database.

Run from the project directory:

```sh
python3 -m venv .local/moto-venv
.local/moto-venv/bin/python -m pip install 'moto[server]==5.2.2'
node scripts/local-setup.mjs
```

Setup creates `.env.local` only when absent. Existing local secrets remain unchanged. It applies the repository's checksummed migrations and the normal seed script, which creates four **unapproved** content drafts. It does not publish content, open registration, create competitions, fabricate consent, or add users. It never resets the database.

The emulator dependency is isolated inside `.local/moto-venv`; the root `package.json` and lockfile are unaffected. [Moto's server-mode documentation](https://docs.getmoto.org/en/latest/docs/server_mode.html) describes this local AWS-compatible test service.

## Start

Use separate terminals for services, worker, and the development application:

```sh
node scripts/local-services.mjs
```

```sh
node scripts/local-run.mjs worker
```

```sh
npm run dev -- --hostname 127.0.0.1 --port 3010
```

The local services wrapper starts two independent children. They can also be run separately with `node scripts/local-delivery.mjs` and `node scripts/local-storage.mjs`. This lets the storage process be restarted without stopping capture. Ctrl+C stops only the processes started in that terminal. The scripts do not start, stop, or replace Next.js themselves.

Reapply later migrations or seed drafts with `node scripts/local-run.mjs migrate` and `node scripts/local-run.mjs seed`. The wrapper loads and validates `.env.local` before executing the existing scripts. Worker execution also uses this validation.

## OTP and email capture

The application's normal server-side webhook delivery path sends to the loopback capture server. Both endpoints require their matching bearer token from `.env.local`; unauthenticated calls return `401`. The capture service has no outbound messaging integration and sends no real SMS or email. Its health endpoint is `GET http://127.0.0.1:4011/health` and reveals no captured content.

Each line of `.local/inbox/messages.jsonl` is an independent JSON object:

```json
{"kind":"sms","to":"<local test phone>","code":"<six digits>","expiresIn":300,"receivedAt":"<ISO timestamp>"}
{"kind":"email","to":"<local test email>","subject":"<subject>","body":"<body>","receivedAt":"<ISO timestamp>"}
```

Local tests can read the most recent matching message directly from that private file. Do not log OTPs, invitation links, credentials, or enrollment URIs to shared output. No public inbox route exists. The normal OTP expiry, resend interval, attempt limits, CSRF validation and session rules remain active.

## Storage and scanning

Moto is configured with bucket versioning, public-access blocking configuration, and upload CORS allowing only `http://127.0.0.1:3010`. Both local services bind only to `127.0.0.1`. The existing AWS SDK and `S3Store` implementation communicate with Moto using path-style requests; no alternate production storage code or compatibility shim was added. The deliberately fake emulator credentials in the local file are not cloud credentials.

`STORAGE_DEV_SKIP_SCAN=true` is present only in this local development configuration. The existing scanner permits it only when `APP_ENV=development` and `NODE_ENV` is not `production`. This skips malware scanning and does not demonstrate scanner behavior or validate video durations. File-size, checksum, format, ownership, revision and access checks remain in the application. Production needs the configured real scanner and must not use this local environment file.

The local scripts require `YES_LOCAL_RUNTIME=true`, refuse production/non-development environments, and validate the exact loopback application, database, delivery and storage addresses before performing work. They reject inherited remote scanner URLs and AWS session credentials. The database target is fixed to `yes_local_integration`.

## Verified on 29 September 2026

- PostgreSQL 17.10: all eight migrations applied; four unapproved content drafts seeded.
- Capture health returns `200`; missing bearer authorization returns `401`; private file modes checked.
- Moto 5.2.2 using the application's AWS SDK: multipart create, part upload, `ListParts`, completion, version IDs, conditional ranged reads, listing two object versions, deleting all versions, listing multipart uploads, and aborting an upload.
- Initial evaluation of S3rver was rejected because `ListParts` returned `405` and versioned retention APIs were incomplete. The active runtime uses Moto instead.

These checks verify a local emulator, not real cloud IAM, bucket retention, backups, live delivery, or malware scanning. Those remain deployment checks against the selected providers.
