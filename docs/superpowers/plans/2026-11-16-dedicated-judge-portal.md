# Dedicated Judge Portal Implementation Plan

> Execute sequentially with test-driven development and verification-before-completion. No additional agents are required.

**Goal:** Provide a dedicated secure judge portal for real submitted forms, ready for owner-managed onboarding and assignment.

**Architecture:** Add source-linked rounds, assignments and reviews; reuse existing MFA and verified private downloads. Keep legacy judging records intact. Add focused judge and staff screens with a portal build mode.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL/Supabase, private Hostinger storage, Vitest/PGlite and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-dedicated-judge-portal-design.md`

## Global constraints

- No production invitations, judge accounts, assignments, result publications, team notifications or changed deadlines during setup.
- Additive schema only; retained submissions, identities, file bytes and legacy judging data stay intact.
- Current 2027 competition rubrics retain their original marks, penalties and 90-point art totals.
- Judge data and file authorization are assignment-scoped and rechecked server-side.

## Task 1: Source-linked judging service

- [x] Add failing `tests/judge-portal.test.ts` for staff setup, native/archive source snapshots, scoring lifecycle, access denials and file scope.
- [x] Run the focused tests and observe the missing-service failures.
- [x] Add migration `019_dedicated_judging.sql`, domain scoring/presentation helpers and `src/server/judge-portal.ts`.
- [x] Add `src/server/judge-portal-route.ts` and wire `/api/judging` through existing authenticated routing. Expose the existing verified file streamer without changing its authorization callers.
- [x] Run focused service and private-storage regression tests, then typecheck. Confirm real source records are unchanged by review operations.

## Task 2: Judge and owner interfaces

- [x] Add failing navigation/component checks for portal mode, dedicated sign-in and staff management routes.
- [x] Implement focused judge login, queue/review and owner management components. Use existing form controls, errors, auth gates and native invitation API.
- [x] Wire `/judge/login`, `/judge`, `/judge/[id]`, `/admin/judging` and account navigation; preserve manual/legacy test modes.
- [x] Verify mobile layout, score bounds, keyboard labels, draft/final confirmation and staff setup with synthetic local data.

## Task 3: Release and acceptance

- [x] Run full unit/integration suite, typecheck and production build; review security-sensitive changes.
- [x] Commit the feature, push the authorized repository branch and verify Linux CI/standalone packaging.
- [x] Apply migration through the private Hostinger runtime; verify RLS/grants and migration checksum. No seed judges or assignments.
- [x] Deploy the verified standalone artifact with portal mode, preserving rollback and private runtime configuration.
- [x] Verify live dedicated login, anonymous/participant gates and owner management/empty queue at desktop/mobile. Confirm no setup notifications or real review assignments were created.
- [x] Record completed coverage and remaining owner onboarding steps in the deployment report.
