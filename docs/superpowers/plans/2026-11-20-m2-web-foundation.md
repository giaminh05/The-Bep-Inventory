# M2 shared contracts and Web foundation implementation plan

> Use Superpowers execution, test-first implementation, and an independent final review. The user approved this milestone on2026-11-20 after completing M1.

**Goal:** Add typed contracts, a framework-neutral API adapter, tested pure helpers and a Next.js preview foundation beside the existing application.

**Spec:** `docs/MIGRATION_PLAN.md` S01, S02 and W01; the user's approval of shared TypeScript contracts/API adapter followed by the Next.js foundation. W02 authentication/persistence/origin draft handover remains a separate slice. No inventory CRUD, schema, backend algorithm, native configuration or production deployment changes.

**Architecture:** Add pnpm workspaces without moving legacy paths. Existing Node/SQLite remains authoritative. Shared packages export TypeScript source for Next/tsx. New Web routes show clearly labeled manager/staff previews with empty states; they never masquerade as authenticated roles or display fake inventory. An optional explicit backend origin enables a no-cache health check/proxy and a link to the existing app. No backend origin is assumed, and no operational database is opened for tests.

## Constraints and review focus

- Preserve all original Capacitor8.6.0 and secure-storage8.0.1 lock resolutions and root start/mobile commands; retain existing staged skill index entries.
- Preserve null/unknown values, integer0/1 flags, optional manager fields, API status401/403/409, supplied idempotency keys and payload identity. Client errors must not leak server-echoed secrets.
- No automatic mutation retries, credential persistence, backend permission changes or shared authenticated caching.
- Pin pnpm10.34.9 (compatible lockfile9), TypeScript5.9.3, Next16.4.6, React19.3.1 and Tailwind4.3.5 after registry/official-doc checks. New package versions are exact; existing application dependency ranges stay unchanged.
- Production-style preview/config must not silently connect to local or live data. Backend origin rejects credentials, path/query/hash and insecure non-loopback HTTP.
- Browser matrix:320/390/1440 widths, light/dark/large text/keyboard focus, navigation, health loading/unconfigured/error/retry; no false inventory actions or auth claims.

## Task1 — Additive workspace and shared API contracts (S01)

Files: root package/workspace/TypeScript configuration, `packages/contracts/`, `packages/api-client/`.

- [x] Establish package manifests and test runner while preserving legacy tests as an explicit `test/*.test.mjs` suite; new shared TS tests run separately.
- [x] Write runtime schema/API tests before implementation, including real manager/staff snapshots, history/report, denied roles, key replay and conflict.
- [x] Implement Zod response contracts and inferred types from existing server output; mutation types follow current API without adding business restrictions.
- [x] Implement injected-fetch client with per-request credentials, no-store, timeout, explicit caller key and sanitized structured errors; expose `health()` for the Web island.
- [x] Verify shared tests/typechecks plus unchanged full legacy suite.

## Task2 — Pure domain parity (S02)

Files: `packages/domain/src/`, package manifest/tsconfig, `packages/domain/test/`.

- [x] Test quantity precision/unit/each/zero/range behavior against literal fixtures and the real legacy count action.
- [x] Test Atlanta day/week boundaries and report usage against hand-calculated fixtures and the existing report implementation.
- [x] Implement pure quantity/date/usage helpers only; do not replace server functions or assume standalone counts are report boundaries.
- [x] Run shared tests and typecheck. Existing server remains unchanged.

## Task3 — Next.js preview foundation (W01)

Files: `apps/web/` (Next App Router, Tailwind, small reusable UI), `scripts/verify-next-foundation.mjs`, `docs/WEB_FOUNDATION.md`.

- [x] Write backend-origin guard tests; implement explicit optional origin config and Next API rewrites.
- [x] Add Vietnamese manager/staff preview shells, accessible responsive navigation, themes, loading/error/not-found states and a shared-client health status with retry.
- [x] Keep Server Components by default; use small client islands; no remote fonts or image dependency; use shadcn-compatible token/component conventions where appropriate.
- [x] Build, lint and typecheck; run production-server browser checks against an in-memory test backend, including server-down/retry and unconfigured setup.
- [x] Run Playwright MCP and existing legacy API/browser regression checks; document features still pending and rollback by retaining old app.

## Completion

- [x] Independent review; resolve Important findings with failing tests first and full verification.
- [x] Update `AGENTS.md`, context, parity/test matrix and migration tracker in English with exact evidence and scope. User chat remains Vietnamese.
- [x] Commit only M2 paths, push `Minh/m2-web-foundation`, integrate through an English PR after checks. Preserve all unrelated staged skills.

Sources checked2026-11-20: official Next installation/Server-Client Components, Tailwind Next/PostCSS guide, shadcn manual setup, npm registry exact version/engine/peer metadata. pnpm10 is deliberately pinned to preserve the existing lockfile format rather than adopting latest pnpm12.
