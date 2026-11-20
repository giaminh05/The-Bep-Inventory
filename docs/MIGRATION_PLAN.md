# Web, Android, and iOS Migration Plan

Updated: November 20, 2026 (`Asia/Bangkok`). Audit baseline: `a8b2d0b`; M1 branch base: `a04d175`. Status: **M0 and M1 complete; option A and M1 approved on November 20, 2026; M2 concrete scope approval pending; no UI rebuild implemented.**

## 1. Goals and boundaries

Modernize the UI and code structure while preserving inventory workflows, permissions, data, formulas, and compatibility with active clients. Behavioral references are `server/`, `web/`, current tests, `PROJECT_CONTEXT.md`, and the [F01–F18 checklist](CROSS_PLATFORM_AUDIT.md#3-workflow-map-and-parity-checklist).

The initial M0 phase was documentation-only. M1 now authorizes regression tests, disposable fixtures, backup/restore rehearsal tooling, and related documentation. It does not authorize removing the legacy application, production schema/data changes, dependencies, Next/Expo scaffolding or UI code, backend replacement, native sync, deployment configuration changes, or deployment. Proposed later tasks are not automatically approved by choosing option A.

## 2. Architecture options and approved direction

| Option | Components | Benefits | Tradeoffs |
| --- | --- | --- | --- |
| A — Incremental migration, approved November 20, 2026 | Retain API/SQLite; Next.js Web first; keep Capacitor operational; migrate to RN/Expo only after compatibility gates | Fewer simultaneous changes; legacy reference remains available; no backend rewrite | Two temporary UIs; token/draft bridge and old/new client verification required |
| B — Replace all three clients together | Next.js + RN/Expo + shared packages together, existing backend | Consistent UI structure sooner | Large blast radius; API/UI/session failures harder to isolate; iOS or storage bridge failure blocks release |
| C — Retain Capacitor long term | Modernize web/components with React; retain WebView mobile; evaluate an appropriate bundle pipeline | Lower secure-storage/WebView-draft risk; greatest UI reuse | No RN native UI; measure real counting experience; Next server features cannot run directly inside an offline WebView bundle |

Option A is selected for a controlled path toward React Native. If the spike fails session/draft preservation or minimum-OS requirements, return to C or request a new decision; do not silently accept lost data/sessions. Option B was not selected merely to adopt three framework brands together.

### 2.1 Proposed Web architecture

- React + Next.js App Router + TypeScript + Tailwind; selectively use shadcn/ui dialog/form/table primitives while preserving efficient Vietnamese keyboard/touch entry.
- Next.js is a new UI/client, not an inventory-backend replacement. Interactive forms and browser drafts belong in Client Components; never ship `node:sqlite`, password hashing, or secrets in browser bundles.
- During parity work, retain bearer/session policy and use a shared API client. Do not silently introduce cookies/BFF, OAuth, or new lifetimes. SSR auth/BFF requires a separate decision supported by security/operational reasons.
- Authorized inventory/snapshot/history/report responses and photos must not enter a shared user cache or static authenticated-response cache. After mutations use canonical server results/refetch; do not calculate optimistic stock balances that violate revisions.
- Proposed deployment root is `apps/web`, after scope approval. Do not package a Next.js server into Capacitor; legacy Capacitor continues using `web/` during transition.

### 2.2 Conditional mobile proposal

- One React Native/Expo TypeScript app for Android+iOS with native UI; no HTML/shadcn native UI. Reuse contracts, API adapters, validation, and pure domain functions with parity tests.
- Bridging legacy storage requires development builds and native modules/config plugins. Expo Go cannot prove upgrade compatibility from Capacitor.
- Preserve app/bundle IDs, signing identity, and API origin during upgrades. Version and scope token, pending-logout, and localStorage draft migration; never log secrets or delete legacy data on secure-store failure.
- No SDK/version selected. The spike must pin a compatible Expo/RN/React/Node/JDK/Xcode set and compare minimum OS with the actual device fleet. Do not silently raise Android24/iOS15.4.
- Native manager screens exist in current source. Calling the product a “staff app” does not authorize dropping manager permissions/screens. Verify the full supported role matrix or obtain scope-reduction approval.

### 2.3 Shared packages, backend, and database

Retain `server/http.mjs`, `server/inventory.mjs`, `server/db.mjs`, API routes, stock scale, session table, and SQLite during UI migration. SQLite remains the sole inventory authority. Next/Expo do not require PostgreSQL/Supabase.

An additive monorepo is proposed for two new clients sharing types/validation/API code; Turborepo is unnecessary if pnpm workspace scripts suffice. Add paths without moving legacy code:

```text
web/                     # operational legacy Web/Capacitor client
android/ ios/            # unchanged legacy Capacitor native projects
server/                  # existing API/SQLite business authority
apps/web/                # proposed Next.js client, only after approval
apps/mobile/             # proposed Expo client, only after native gates
packages/contracts/      # TypeScript types + runtime schemas for existing API
packages/api-client/     # auth/header/error/retry adapter
packages/domain/         # parity-proven pure functions, no DB/token
test/                    # legacy backend regressions remain operational
docs/                    # audit, parity, ADR, release, and rollback
```

Types do not replace runtime validation. Introduce schemas at the adapter first; backend validation remains authoritative. Share business logic only after input/output parity fixtures pass; do not move SQL transactions/authorization to clients or rewrite the whole server in TS.

### 2.4 Proposed deployment

Next.js on Vercel; Node API on a host/container with persistent disk and a lifecycle suitable for SQLite. Do not put the existing DB into Vercel Functions or `/tmp`: [Vercel filesystem documentation](https://vercel.com/docs/functions/runtimes#file-system-support) explains that files are not shared across instances or durably retained after an instance stops. This supports retaining a separate backend; no hosting provider has been selected.

The new Web client needs a device-accessible HTTPS endpoint; loopback4170/4171 is not a public backend for Vercel/mobile. Separate staging DB/credentials from production; explicitly allowlist staging/production web and legacy native origins in HTTPS/CORS, without wildcarding all previews. Added preview origins need clear expiration/revocation.

Initially use one verified writer service; do not use independent SQLite copies or an unverified network filesystem for DB writes. Change database/hosting only when workload/HA evidence warrants it and approval is obtained.

## 3. Decision gates

| Gate | Decision | Status / impact |
| --- | --- | --- |
| G1 | Choose A/B/C; approve retaining SQLite backend and an additive monorepo direction | Approved November 20, 2026: option A. This selects direction; M2+ implementation remains gated |
| G2 | Approve M1 baseline/contract tests before UI migration | Approved November 20, 2026; M1 complete with34/34 tests and browser/recovery evidence |
| G3 | Establish RN/Expo fleet fit and session/draft preservation | No spike yet; blocks mobile implementation/cutover |
| G4 | If bridging fails: transition method, minimum OS, and re-login UX | Separate decision required; re-login/lost drafts are not accepted by default |
| G5 | Offline-first/realtime/approval/export or new conflict policy | Outside parity; separate specification only when requested |
| G6 | Backend host, domain, environments, app signing, and production rollout | Unconfirmed; separate approval before live changes |

## 4. Milestone and task tracker

Priorities: P0=data protection/parity, P1=functional migration, P2=post-parity optimization. Statuses: **Complete**, **In progress**, **Awaiting approval**, **Not started**, **Blocked**. “Blocked” requires a specific reason/dependency. Paths not yet present are proposed, not created files. M2+ tasks additionally require approval of their concrete implementation scope after M1; G1/G2 alone do not open them.

### M0 — Audit and operating rules (documentation)

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A01 / shared | Audit stack, workflows, scenarios, toolchain | None; P0 | `docs/CROSS_PLATFORM_AUDIT.md` | F01–F18 document rules/validation/DB/platform differences and explicit evidence levels | Source review,22 API tests, smoke/UI, MCP, ad hoc concurrency | Complete |
| A02 / docs | Language policy, scope, preservation rules, tracker | A01; P0 | `AGENTS.md`, `PROJECT_CONTEXT.md`, this file | No false migration completion; preserve historical decisions | Cross-check docs/source and Git scope; user corrected repo language to English/chat Vietnamese on November 20 | Complete |
| A03 / architecture | Present options and first milestone | A01–02; P0 | This file §2–3 | User selects option and approves M1 | Record approval and exact scope | Complete: G1/G2 approved November 20, 2026 |

### M1 — Lock behavioral baseline and prove rollback (first implementation milestone)

M1 is complete. Fresh evidence:34/34 API/file-DB tests, existing smoke/UI suites, three retained browser parity scenarios and Playwright MCP passed. Independent review's backup source-sidecar finding was reproduced RED, fixed, then verified GREEN with the full suite. No inventory policy or operational data changed. See [test matrix](TEST_MATRIX.md), [parity checklist](FEATURE_PARITY.md), and [backup runbook](BACKUP_RESTORE.md).

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T01 / test-business | Retain concurrency/race tests and retry ambiguity | G1/G2; P0 | `test/concurrency.test.mjs` | Same revision200/409; no overdraw; one same-key receipt; a failed category does not roll back committed categories; later standalone count invalidates old sheet receipt linkage | Six HTTP regressions assert ledger/balance/document/request state; full suite34/34 | Complete |
| T02 / test-cross-platform | Retain two-client, stale-view, offline-draft, recovery, and account-ownership tests | T01; P0 | `scripts/verify-parity.mjs`, parity docs | Manual refresh reflects server; stale count rejected; no automatic offline submission; draft scope correct; partial category submission removes only confirmed drafts; uncertain retry applies once | Three browser scenarios, Playwright MCP, existing smoke/UI; two temporary client mutations caught | Complete; native physical-device parity still gated |
| D01 / database | Rehearse backup/restore and supported legacy-schema compatibility | G1/G2; P0 | `docs/BACKUP_RESTORE.md`, `scripts/backup-database.mjs`, `test/db-compatibility.test.mjs` | Includes committed WAL; integrity/FK/balances/ledger/documents agree; old supported schema retains data across repeated opens; rejects existing and source-sidecar output names | Six file-DB tests including abrupt exit, no-clobber and repeated migration; RED/GREEN fix for source-sidecar review finding | Complete on disposable data; real DB backup remains an operational gate |
| T03 / baseline | Complete parity checklist, standard fixtures, evidence map | T01–02, D01; P0 | `docs/FEATURE_PARITY.md`, `docs/TEST_MATRIX.md` | F01–F18 distinguish web/Android/iOS/roles and current/proposed behavior; zero/blank/unknown, units, receipts, reports have oracles | Full API/browser suite + independent review; evidence limits and remaining device/operational gates documented | Complete |

M1 does not install Next/Expo or change schema. Exit: committed baseline tests, passing disposable-data rollback rehearsal, and complete parity inventory. UI migration stays closed while draft/ledger loss remains unexplained.

### M2 — Shared contracts and Web foundation

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| S01 / shared | Additive workspace, contracts, API adapter | M1, G1, scope approval; P0 | `package.json`, `pnpm-lock.yaml`, workspace config, `packages/contracts/`, `packages/api-client/` | Legacy commands work; headers/body/errors/status compatible; schemas do not tighten business rules unintentionally | Contract tests compare payload/result/error401/403/409, unknown/null, same-key replay | Awaiting M2 scope approval; M1 complete |
| S02 / business | Selectively share pure quantity/date/format validation | S01; P0 | `packages/domain/`, fixtures; server only through a separately necessary task | Preserve precision, case/each, Atlanta boundaries, report formula | Table/property tests against legacy; unchanged backend integration | Blocked: S01 |
| W01 / Web | Next/TS/Tailwind/shadcn shell and design tokens | S01; P1 | `apps/web/app/`, components, config, tests | Runs beside legacy; manager/staff layout, Vietnamese, keyboard/focus/loading/errors/themes; no direct DB access | Typecheck, lint, Next build, Playwright320/390/desktop, accessibility checks | Blocked: S01 and UI scope approval |
| W02 / Web-auth | Login/logout/delegation and legacy draft-origin handover | W01, S01; P0 | `apps/web/features/auth/`, storage adapters; legacy export/bridge only if approved | Web12h, correct 403/401; switching preserves staff tab; draft ownership; new origin cannot implicitly read old storage | Two-account/revocation/refresh/origin-transition tests, secure handling; no SSR/cache secrets | Blocked: W01 |

### M3 — Web feature parity in functional slices

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| W03 / Web-count | F02–F06: counting/drafts/multi-category submit | W02, S02; P0 | `apps/web/features/counts/`, stock/, tests | Preserve zero/blank/unknown, case conversion, shared performer, revision/retry/partial success; no new approval flow | Legacy/new fixtures, concurrency, lost response, offline edit, reload, keyboard/focus | Blocked: W02 |
| W04 / Web-stock | F01/F03: catalog, thresholds, system totals | W03; P1 | `apps/web/features/catalog/`, stock/ | Five locations, known semantics, duplicate/item creation/threshold/privilege rules unchanged | API contracts + manager/staff Playwright, rows>20, missing unit | Blocked: W03 |
| W05 / Web-documents | F07–F11: suppliers/transfers/photos/count linkage | W03; P0 | `apps/web/features/deliveries/`, transfers/, photos/ | Partial/all receipts, batch atomicity, staff creator rules, shortage/overage, linked delta0; newer standalone count invalidates old sheet; preserve supplier/transfer timestamp difference | E2E+integration ledger, in-transit, photo permissions, replay,409 remaining, eligibility after standalone count | Blocked: W03 |
| W06 / Web-report | F12–F15: history/reports/prices/accounts | W04–05; P0 | `apps/web/features/history/`, reports/, accounts/ | Distinguish performer/account; Atlanta/DST/pagination; report boundaries; current USD value; password reset |22-test baseline + parity E2E, history>50, multiple same-week counts, two-device revocation | Blocked: W04–05 |
| W07 / UX | Verify entry efficiency and accessibility | W03–06; P1 | Web components/tests, `docs/FEATURE_PARITY.md` | No unnecessary actions; keyboard does not cover submit; clear errors/pending state; no page overflow | Staff walkthrough, large text, screen-reader/focus, weak network, performance measurements | Blocked: W03–06 |

### M4 — Mobile feasibility and native parity

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| N01 / mobile-shared | Expo feasibility spike and token/draft/pending-logout bridge | M1, G1, separate spike approval; P0 | Separate `apps/mobile/` spike, native bridge/config plugin, `docs/adr/` | Legacy `android/ios` untouched; same ID/signing in controlled upgrades; safely read old vault or report failure; fleet OS supported; rollback retains new draft/auth state | Android/iOS signed in-place updates; offline tombstone, multiple accounts, two-way storage continuity along supported rollback path. Expo Go insufficient | Awaiting separate spike approval; M1 complete; result informs G3 |
| N02 / Android | Native auth/lifecycle/counts, then deliveries/transfers/manager parity | N01 pass, G3, S01–02; P0 | Proposed `apps/mobile/features/`, Android config/tests | F01–F15/F18 for supported roles; Keystore, network, back, keyboard, camera/picker, permissions; updates retain data | Development build+ADB/emulator+physical; Maestro/Detox or selected equivalent; kill/reboot/update/logout/revocation | Blocked: N01 |
| N03 / iOS | Native auth/lifecycle/UI parity | N01 pass, G3, S01–02; P0 | Proposed `apps/mobile/`, iOS config/tests | Correct Keychain accessibility, foreground/network, keyboard/safe area, picker, role matrix; no silent OS increase | Xcode/macOS, Simulator+physical/TestFlight; signed legacy update, pending logout, draft restoration | Blocked: N01; macOS/signing required |
| N04 / cross-platform | Same actual API across three staging clients | W06, N02, N03, B01, G6 staging approval; P0 | E2E/native flows, `docs/TEST_MATRIX.md` | One device writes, two refresh correctly; stale count409; receipt replay not duplicated; location rights preserved | Secret-free API logs, DB reconciliation, network interruption on all three; record binary SHA/origin | Blocked: W06, N02, N03, B01, staging approval; production approval unnecessary for staging tests |

After the spike, split N02/N03 into auth, counts, deliveries, transfers, and manager-screen PRs; do not replace all mobile in one PR. If switching to C, plan and obtain approval for Capacitor tasks replacing N01–03; do not mark them complete.

### M5 — Staging deployment and release readiness

| ID / stream | Goal | Dependencies / priority | Files | Acceptance | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B01 / backend | HTTPS host with persistent disk, auth/CORS/proxy/limits/health | M1, G6, staging approval; P0 | Proposed deployment manifests, server config, runbook | API/schema unchanged; previews isolated from production; single writer, disk permissions, restarts, proxy login throttling correct | Staging API, restart, disk capacity/lock/load/error tests, photo body limits, health alerts | Blocked: G6 |
| D02 / database | Backup schedule, retention, offsite/restore, ownership | D01, B01, G6; P0 | Proposed backup config/runbook | Operator-approved RPO/RTO; clear photos/ledger/requests/sessions policy; passing restore drill | Integrity, foreign keys, totals, hash counts; never overwrite live in drill | Blocked: B01/G6; disposable D01 complete |
| P01 / Web-deploy | Vercel-compatible build and isolated preview/staging | W07, B01, G6; P1 | `apps/web/` build/env config, runbook | Build/typecheck/lint pass; NEXT_PUBLIC API origin nonsecret; no shared auth cache; UI rollback ready | Preview E2E, CORS,401/403/409, environment isolation, performance trace | Blocked: W07/B01/G6 |
| P02 / Android-release | Signing/version/environment/distribution process | N02, N04, G6; P0 | Mobile build profiles, Android release runbook | Owner-managed keystore; increased versionCode; same ID; explicit production API | Physical signed update, offline/reboot/revocation; Play testing channel only when approved | Blocked: signing/G6/N04 |
| P03 / iOS-release | Team/provisioning/version/TestFlight process | N03, N04, G6; P0 | Mobile build profiles, iOS release runbook | Team/cert/provisioning owner; increased build; same bundle; approved minimum OS | Signed archive, physical update, TestFlight acceptance when approved | Blocked: Apple account/macOS/G6/N04 |
| P04 / cutover | Pilot then rollout with rollback/reconciliation | D02, P01–03, parity sign-off; P0 | `docs/RELEASE_RUNBOOK.md`, `PROJECT_CONTEXT.md` | Explicit production approval; no dual writes; no lost transactions/drafts; retire legacy only after accepted observation period | Pilot metrics, error/conflict logs, DB comparison, rollback rehearsal; platform owner sign-off | Blocked: production not approved |

### M6 — Optimization and work beyond parity

Only after parity and measurement: optimize large snapshots/SQL/indexes, list virtualization/native rendering, web bundles, and request waterfalls; do not introduce stale-stock caches. Realtime, offline-first durable outbox, export, approval, and new conflict rules need separate G5 tasks/specifications. PostgreSQL/HA also requires workload evidence, a schema/data migration plan, and separate approval.

## 5. Test strategy and parity oracles

| Group | Baseline to preserve | Additions after approval | Acceptance level |
| --- | --- | --- | --- |
| Unit/domain | Integer scale1000, whole each, price scale10000, Atlanta dates | Boundary fixtures, missing/invalid units, zero/blank/unknown, Unicode, DST; compare legacy helpers | Equivalent results/errors, not UI snapshots alone |
| API/DB |22 existing tests | Concurrency, durable restart/supported old-schema copies, rollback failure, stale remaining, key mismatch/replay | Consistent balance+revision+ledger+documents+requests after success/failure |
| Web E2E |smoke + verify-ui | Two accounts/contexts, partial multi-category submit, lost response, reload retry, origin drafts, full roles | Correct outcomes/data, not visible elements alone |
| Native |Historical evidence insufficient for rebuild | Android/iOS storage/lifecycle/signed update, picker permissions, offline foreground, large fonts | Record physical devices, binary IDs/build/signature/env; mocks do not replace devices |
| Synchronization |Same API, manual refresh | Web/Android/iOS pairs, different source/destination, stale revisions, timeout after commit | No lost updates or same-key duplicates; no realtime promise |
| Reports/search |Latest/preceding sheets, opening fallback, counted receipts, Atlanta history | Same/skipped weeks, both DST changes, pagination50/51, empty optional filters, current valuation | Compare totals, movement boundaries, performer/actor, not text alone |
| Persistence/recovery |SQLite file implementation | Consistent backup/restore, restart after commit, disposable crash/fault injection | Restorable/reconciled data; no live crash tests |
| Error/security |401/403/409, rate-limit, photo auth | Expired/revoked tokens, staff header misuse, invalid payloads, large photos, network loss, disk-full | Preserve server authority, prevent secret leaks/wrong draft deletion |

Record deviations in `docs/FEATURE_PARITY.md`: workflow ID, expected, actual, platform/build, evidence, severity, and approver decision. Do not change expected results to hide formula errors. Never use production as a fixture.

## 6. Checkpoints, backup, and rollback

1. Audit source baseline is `a8b2d0b`; separate documentation branch; preserve 297 pre-staged skills. Use `Minh/<task>` or an approved isolated worktree for code; commit only task files.
2. No new operational DB backup was taken during M0. M1 rehearses SQLite Online Backup or an equivalent consistent method. Copying only a live `.sqlite` with active WAL is not a complete backup.
3. Keep legacy clients/API operational and pilot UI rollout. Send each mutation to one authoritative API; do not shadow-write from both clients.
4. UI/code rollback returns to a legacy client/deployment with the latest backend/data. Restoring an old database would remove new transactions and is not a UI rollback.
5. Native rollback cannot assume installation of a lower APK/IPA version; prepare a higher-version forward fix or predesigned routing/feature flags. Do not uninstall for rollback because Keystore/drafts may be lost.
6. Keep old storage until migration is verified. After RN changes drafts/accounts/tokens/logout state, a forward fix returning to legacy UI must consume the new state without reviving invalid tokens, pending logout, or drafts. N01 must prove a compatibility adapter/reverse migration for the supported rollback path. If impossible, present limits and obtain approval before cutover; retaining the old vault alone is not proof of safe rollback.
7. Database restore is for data incidents only, after approval, writer shutdown/traffic isolation, and reconciliation of transactions since backup. Never silently restore live.
8. Record commit/build/env, test results, rollback triggers, and owner at every milestone. Do not retire legacy in the PR that introduces a new client.

## 7. Open risks and production readiness

- Reported real-phone session loss remains unreproduced; confirm device/OS/build/install method/backend origin before native cutover.
- SecureStore/localStorage formats and namespaces differ between frameworks/origins. Storage continuity is a data gate.
- Authenticated snapshots remain stale until refresh; manual refresh is retained. Realtime improvements require approval.
- Retry keys do not survive app crashes; preserve and report current support without promising universal exactly-once execution.
- SQLite local disk needs backup, monitoring, load tests, and suitable hosting; no evidence yet requires replacing it.
- Fleet OS, Apple team/Android keystore, production DNS/TLS/host, cost, distribution, and RPO/RTO remain unknown. They were unnecessary for M1 approval but must be resolved before G3/G6.
- Current iOS build/physical verification needs macOS. Old APK/IPA tests do not verify latest HEAD; matching source bundles do not verify installed configuration.
- README's statement that iOS was never run is outdated; unchanged under M0's allowlist. Context distinguishes historical evidence.

## 8. Approved first milestone and next gate

**On November 20, 2026, the user approved option A and M1: baseline/parity locking plus disposable-data backup/rollback rehearsal.** Deliverables are regression tests/fixtures, a contract/parity matrix, and a restore procedure exercised on copies. UI/backend rewrites and live deployment remain outside approval.

After M1, present the concrete first `apps/web` PR scope and a separate native spike. Do not estimate release dates before fleet/signing/hosting and spike evidence. Option C remains a decision to revisit before committing to native rewrite costs.

## 9. Milestone log

| Date | Milestone | Result |
| --- | --- | --- |
|2026-11-20|Baseline PR#8|22 API tests; history filters/Atlanta/pagination; no production logic changes|
|2026-11-20|M0 audit|Source/platform/workflow audit;22 API+smoke+UI+MCP; three concurrency checks; AGENTS/context/audit/plan; no migrated features|
|2026-11-20|G1/G2 approval|User approved option A and M1; M1 in progress; M2+ scope, UI code, native spike, and production remain gated|
|2026-11-20|Language correction|English repository/Git/GitHub work; Vietnamese user chat/reports|
|2026-11-20|M1 complete|34/34 API/file-DB tests; three new browser scenarios plus smoke/UI/MCP passed; backup WAL/restore/schema/crash rehearsal on temporary files; source-sidecar safety fix verified RED/GREEN; no migrated UI or operational data changes|

Official sources and evidence limits are in [audit §9](CROSS_PLATFORM_AUDIT.md#9-official-technical-sources-consulted-on-november-20-2026). Reverify versions/documentation before installing anything in a later milestone.
