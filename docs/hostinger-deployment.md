# Hostinger deployment

## Deployment on 10 November 2026

The Next.js application is live at https://new.youthecosummit.com/ on Hostinger through LiteSpeed's native Node.js handler and Node 22. The application connects to the existing Supabase database over certificate-verified TLS. Public DNS resolvers and the local resolver confirm an A record named `new` pointing to `145.79.212.116`, with the previous Vercel CNAME absent. HTTP redirects to HTTPS. The public HTTPS page and API endpoints return Hostinger/LiteSpeed headers and a valid Let's Encrypt certificate.

The subdomain document root is `/home/u794443438/domains/youthecosummit.com/public_html/new`. Its `.htaccess` routes to the private application directory `/home/u794443438/yes-hostinger-migration/20261110-092636-083ac9f8a94b/runtime`. The private runtime environment file is outside the document root, with mode `0600` inside a mode `0700` release directory. The owner explicitly approved transferring the existing database connection and authentication secret over SSH.

The existing `default.php` was preserved and copied to the private release directory as `default-before-deploy.php`. Its SHA-256 is `b379ec4e1a18e7b2daaf905a693cd26d6bb117050e9de0ec29a5076ce67f6bef`.

## Build and updates

The SSH account can run the production application. Local server builds exhausted its worker/thread resources, so GitHub Actions builds the Linux standalone bundle with Node 22. The existing validation workflow runs type-checking, tests and the production build before publishing a credential-free `hostinger-standalone` artifact. Artifacts expire after one day.

The installed release is commit `04aad86e2f7a2c73c8c970c309fd162c8b17e54e`. The deployment archive SHA-256 is `1e2a3c8ad7106c0e39b9677aa71abd9b460a7a4553a765c593dd8981d4b0edf3`. The archive includes public assets and the partners carousel scrollbar fix. The startup wrapper loads the private environment before importing the generated standalone server.

For updates, obtain the standalone archive and checksum from a successful workflow run for the intended commit. Verify the checksum and embedded `REVISION`, then upload and extract into a fresh private release directory over SSH. Preserve the current runtime environment privately, verify the new release at the Hostinger origin, and atomically update only the subdomain routing file. Local operational scripts and reports are in the ignored `.local` directory. Local hosting metadata is in the ignored `.hostinger/site.json` file.

The validated build passed 252 tests, with two external-worker tests skipped. [GitHub validation run](https://github.com/SubscriptionsCM/Youth-Eco-Summit/actions/runs/42792933009)

## Origin verification

Direct HTTPS requests to `145.79.212.116` with the subdomain's hostname passed certificate validation and returned Hostinger/LiteSpeed responses for the application.

- The homepage, login and competitions pages returned 200.
- All 15 homepage JavaScript, CSS and font assets returned 200.
- The partner logo and Next.js image optimization returned 200.
- API health reported database configuration present.
- The public school directory returned a total of 125 schools and omitted private contact fields.
- API responses used `Cache-Control: no-store`.
- Private environment and server-file URL checks returned 403 or 404.

The private origin verification report is `.local/hostinger-origin-verification.json`.

Database verification from Hostinger confirmed 5,886 archived records, including 5,494 historical entries, 125 operational school-directory rows and 208 school identifiers. The connection verified the database certificate and the database reported SSL active. Existing archived attachments and activated operational users each remain at zero, consistent with the earlier migration's pending work. The default-page backup and preserved original have matching hashes. Directory and environment-file permissions were verified as `0700` and `0600` respectively.

## Remaining application work

Reference-form submission and email-account flags remain disabled. Historical attachment migration, account activation, notification delivery and complete submission/upload acceptance remain pending from the earlier application migration. This hosting deployment uses the existing Supabase records.

## Recovery

Preserve both the current routing file and private runtime before switching releases. To restore the original Hostinger placeholder, archive the subdomain routing file outside the document root and restore its previous absence, leaving the preserved `default.php` available. For an application rollback, point the subdomain routing file at a previously verified private release. Database snapshot restoration is separate from an application rollback because new records may have arrived after a backup.
