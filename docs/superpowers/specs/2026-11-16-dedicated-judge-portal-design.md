# Dedicated judge portal

The owner requested a dedicated portal and confirmed: build it now; the owner adds judges and assignments later. No invitation, new production judge account, real-entry assignment, result publication, participant notification or deadline change is part of setup.

## Design

Use the existing application, password/MFA authentication, private file store and staff authorization. `/judge/login` is the dedicated staff sign-in; `/judge` lists only the authenticated reviewer's assignments; `/judge/[id]` presents the assigned work, competition rubric, deductions, comments and flags. Draft reviews resume, final reviews require confirmation and lock. Closed rounds prevent writes; revoked assignments immediately stop access. Staff can reopen a review with a reason and retained prior review history.

The current legacy judging engine depends on projected student/submission identities that do not exist for real reference-form entries. Do not fabricate those identities or mutate retained source data. Add judging rounds, explicit assignments and reviews referencing either submitted `portal_form_records` or retained `wordpress_records`. Assignment creation captures an immutable presentation and source fingerprint. Only supported competition forms can be assigned; drafts, missing files, mismatched competition and corrupt source checksums fail closed.

The initial competition catalogue uses the ten current 2027 competition rubrics. Preserve marks, art's 90-point total, negative penalties and wording exactly; do not normalize totals or decide winners automatically. Staff explicitly label edition and round before assigning anything. Other historical editions cannot silently inherit these rubrics.

Judges receive reference, competition, class/topic/language/entry-mode metadata and assigned verified files. Contact information, names, school identity, passwords, storage paths, other judges and other reviews are excluded from the judge JSON. Files can contain identifying content; the interface states this instead of promising complete anonymity. Downloads require a current authenticated assignment on every request and use the existing verified stream, private/no-store headers and byte-range support.

`/admin/judging` lets owner/admin invite judges through the existing private enrollment workflow, view active reviewers, create and open/close rounds, search submitted native/archived competition entries, select entries, assign a reviewer, revoke assignments, inspect reviews and reopen a final review with an audit reason. Invitations are sent only by an explicit staff action. Existing Forms inbox and archive remain available. No automatic entry ingestion, email on review or public results is introduced.

## Persistence and security

Additive migration 019 creates rounds, assignments, reviews and immutable reopen history with foreign keys, source exclusivity, uniqueness, status/length checks, RLS enabled and no API-client grants. Existing authenticated server-side role checks recheck active users. Writes use transactions and row locking; optimistic versions reject stale saves and repeated final submissions. Assignment and review changes are audited. A batch assignment is atomic and never silently restores a revoked assignment.

Build mode `NEXT_PUBLIC_JUDGING_MODE=portal` selects the new portal. Legacy assigned mode and its data remain intact; existing manual mode behavior remains testable. Production applies migration before enabling the new build. Existing routing/runtime rollback is retained.

## Verification

Failing tests precede implementation: current native/archived source linkage, identity redaction, frozen rubrics, scoring/deductions, draft/final/reopen behavior, authorization, role deactivation, stale writes, closed rounds, revoked assignments, file integrity and scope. Run complete suite, typecheck, build and isolated browser desktop/mobile acceptance using synthetic local fixtures. Production acceptance uses the existing owner and read-only/empty portal views, preserving the owner's decision to add judges later. No real invitations, assignments or team test messages are sent.

## Alternatives considered

Simply enabling legacy assigned mode would expose an empty judging system. Projecting all historical entries into invented student identities risks incorrect attribution. A source-linked portal reuses authentication/storage while preserving authoritative source records and explicit staff control.
