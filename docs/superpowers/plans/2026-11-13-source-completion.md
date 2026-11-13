# Source-faithful completion plan

**Goal:** Preserve the current WordPress source in Supabase/private Hostinger storage and copy only legal/judging configuration that actually exists.

**Architecture:** The existing append-only delta and immutable version import remain authoritative. Add a filesystem-only archive streaming import using the existing sealed-object writer; retain multipart behavior for existing callers. No new legal text, judge privileges, jury rounds or final cutover is inferred from missing source configuration.

- [x] Inspect published pages, portal settings, source theme/plugins and current source snapshot.
- [x] Compare current records/attachments with the retained archive and classify additions/changes/missing source records.
- [x] Reproduce streaming-import requirements with failing tests (single retained copy, corruption refusal, native upload bypass refusal).
- [ ] Implement and test the archive-only streaming adapter; review its security boundaries.
- [ ] Share only verified identical sealed file bytes while preserving every path and metadata.
- [ ] Preview, copy and rehash the 74 new attachments; append new records and immutable user versions.
- [ ] Re-run import idempotency and verify originals, versions, files, relationships, RLS and private downloads.
- [ ] Finish source-matched legal/judging configuration if the required source material or owner details are supplied; otherwise report the exact absent prerequisites.
- [ ] Record the synchronization checkpoint and remaining cutover dependency, then publish reviewed code and report.

The source lacks published privacy/terms and configured judge accounts/rounds. Questions for approved text and manual-versus-assigned judging were sent while independent sync work continues. Missing old records stay retained. WordPress remains active; this synchronization is a checkpoint, not a write freeze or domain cutover.
