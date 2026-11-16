# WordPress synchronization — 16 November 2026

**Completed and verified.** New source form records and attachments are retained and the completed competition entries are available for owner assignment in the [judge management portal](https://new.youthecosummit.com/admin/judging). Existing archive rows, file metadata and immutable versions were preserved.

The consistent source export completed **16 November 2026 at 10:47:47 IST**. Final source comparison at **16 November 2026 at 11:21:28 IST** found no additional, missing or changed submission rows or metadata since that export. All 3,884 source entry rows and 34,144 entry-metadata rows matched; the source user count remained 265.

## Imported data

| Item | Added | Final retained total |
| --- | ---: | ---: |
| Form records | 108: 60 completed entries and 48 drafts | 6,000 entry records |
| Archived WordPress users | 16 | 265 user records |
| All archive records | **124** | **6,440** |
| Private attachments | **45 / 320,629,221 bytes** | **714 / 5,236,953,780 bytes** |
| Immutable changed-record versions | **9** | **30** |

The 108 new form records include 63 competition records: **40 completed entries and 23 drafts**. The other 45 are student, educator, school or nomination records. Competition drafts are preserved and excluded from judging. WordPress user records are archived data; the sync did not create new application logins or grant staff privileges.

Nineteen existing source user observations differ from the original archive: nine new versions were appended and ten observations were already retained. Originals were not replaced. No changed submission payload or attachment identity conflict required replacement.

## Preservation and verification

| Check | Result |
| --- | --- |
| Pre-existing archive | **Pass**: all 6,316 original records, 669 attachment rows and 21 prior versions retained with unchanged payloads and metadata. A private baseline was saved before import. |
| Record checksums | **Pass**: every retained record/version checksum verified; version lineage matches its original record. All 4,189 current source observations were found as originals or matching immutable versions. |
| Attachments | **Pass**: all 714 retained files were read back and verified against exact byte length and SHA-256, with source/entry relationships checked. All 45 new source paths were verified read-only before copying. |
| Source absences | **Pass**: all 2,251 retained identities outside the current source inventory remain preserved. This includes 2,124 entry/form/option identities in the delta comparison plus 125 school and two post baseline identities outside those compared categories. No source absence caused a deletion. |
| Duplicate protection | **Pass**: record retry inserted zero rows; version retry inserted zero versions. |
| Judge readiness | **Pass**: all 40 newly completed competition entries passed the deployed source-to-rubric mapping and required-file checks and were found in the live owner assignment picker. All 23 new competition drafts were excluded from that picker. |
| Live attachment access | **Pass**: all 45 new attachments returned authorized exact-length/SHA-256 HEAD metadata and byte-identical protected ranges. A complete 31,627-byte sample download matched its full checksum. A valid owner download grant was denied anonymously. Production responses enforced no-store, attachment disposition and nosniff. |
| Database/runtime security | **Pass**: no disabled public-table RLS or PUBLIC/anon/authenticated table grants. Database TLS/CA configuration and private runtime mode 0600 remain intact. |
| Runtime and background work | **Pass**: existing application revision remains active; 18 notification jobs and 26 file-verification jobs complete, with no pending/running/failed jobs. Existing 21 delivered/provider-accepted notifications remain unchanged. |
| Upload capacity | **Pass**: a preflight shortfall was resolved by sharing only SHA-identical inactive compiled build copies, reclaiming 121,213,848 bytes while preserving paths, contents and modes. Source WordPress, private user files and active runtime files were excluded from replacement. The import-plus-reserve preflight succeeded, and a fresh 360 MiB temporary write succeeded after import and was removed. No paid upgrade was made. |

Integrity verification completed **16 November 2026 at 11:04:54 IST**; live owner/API/file checks completed **16 November 2026 at 11:18:54 IST**. The synchronization created **no judge accounts, invitations, rounds, assignments, final submissions or team notifications**. Existing application users, native form records and source submission files were retained. No application code change or redeployment was required.

## Using the imported entries

Open **Manage judging**, create/select a 2027 competition round, choose **Preserved WordPress submissions**, refresh/search and assign the required completed entries to an enrolled reviewer. Judge dashboards show only explicitly assigned work; the sync does not automatically distribute entries or publish results. Registration records and drafts remain available in the protected WordPress archive.

Original WordPress submission dates remain retained in the protected record details. After this sync, the picker presentation was corrected in release `7823a40c9bf4103e61ef3f92d5fdc23845030ab3` to show and sort by the original source submission date, with import time separate. No archived records were rewritten. See [the verified date correction report](judge-picker-date-fix-2026-11-16.md).

This is a verified synchronization checkpoint. WordPress remains live; subsequent activity requires a later catch-up. No continuous synchronization or source write freeze was introduced. The current application revision is `aca0008cfee695271ad36b2728f9622688d5e6de`.

Private source manifests, locator checks, preservation baseline, import/retry results, row/metadata comparisons, hashes and HTTP checks are Git-ignored under `.local/wordpress-sync-20261116/` and the timestamped source capture. Credentials, user payloads, filenames and private download grants are excluded from this report.
