# The Bếp Inventory — Project Context

Updated November 20, 2026, using the user communication timezone `Asia/Bangkok`. This is a living handoff for the operational application; read it with actual source, current Git status/diff, and `AGENTS.md` at the start of each session.

## 1. Current status and latest request

The project has manager/staff Web interfaces, Android/iOS Capacitor clients, a Node.js backend, and SQLite. The user requested an audit and a migration design for modern interfaces across all three platforms while preserving all business behavior and data.

**On November 20, 2026, the user approved architecture option A and M1 (G1/G2).** M0 audit/documentation and **M1 baseline/recovery checks are complete**. No feature has been migrated. Option A means incremental Next.js Web migration, retaining the API/SQLite backend and operational Capacitor clients, with React Native/Expo only after native compatibility gates. Architecture direction approval is not blanket approval to execute M2+.

M1 authorizes regression tests, disposable fixtures, backup/restore rehearsal tooling, and related documentation. Next.js/Expo UI code, dependency changes, application behavior changes, production schema/data changes, native project changes, deployment configuration, and deployment remain outside current approval. Never write to the operational DB for tests.

The user's language correction on November 20 is permanent: **English for repository/Git/GitHub work; Vietnamese for chat and user-facing reports.** Product UI remains Vietnamese.

Related documents:

- [Permanent instructions](AGENTS.md).
- [Audit, workflows, and test evidence](docs/CROSS_PLATFORM_AUDIT.md).
- [Architecture, milestones, approval gates, and rollback](docs/MIGRATION_PLAN.md).
- [Completed history regression plan](docs/superpowers/plans/2026-11-20-history-regression-tests.md).
- [Feature parity and canonical fixtures](docs/FEATURE_PARITY.md), [test matrix](docs/TEST_MATRIX.md), and [backup/restore runbook](docs/BACKUP_RESTORE.md).

## 2. Operational overview and architecture

The Bếp Teahouse Inventory serves Duluth, Johns Creek, Norcross, Kho DL House, and Kho Extra. The first three are stores; the last two are warehouses. The initial skill/request mentioned three stores; implementation and subsequent decisions require all five locations.

The UI is Vietnamese. Business dates/reports use `America/New_York` (Atlanta), not device timezone or Bangkok communication timezone.

| Layer | Current state |
| --- | --- |
| Web | Plain JavaScript ES modules, HTML/CSS, DOM rendering; shared source by effective role |
| Backend | Node.js >=24, ESM, built-in HTTP server; serves both `web/` and `/api/` |
| Database | Synchronous `node:sqlite`, SQLite WAL, foreign keys, busy timeout; stock/documents/ledger/photo BLOBs in one DB |
| Android/iOS | Capacitor8; installed 8.6.0; secure-storage pinned 8.0.1 |
| Android | minSdk24, compile/target36, Gradle8.14.3, AGP8.13.0; local JDK21; version1.0/code1 |
| iOS | Xcode+SPM; app deployment target15.4, version1.0/build1; SPM exact Capacitor8.6.0 |
| QA | Node test runner, Playwright1.65.0, Playwright MCP |
| Dependency tracking | `package.json` version0.1.0, `pnpm-lock.yaml`; no React/Next/RN/Expo yet |

Browser requests normally use a relative API origin. Standard mobile builds copy `web/` into `dist/`, write the HTTPS backend origin into generated `config.js`, then copy assets into native projects. Local Android debug can load the backend page directly through ADB reverse instead of the packaged bundle.

Web tokens live in tab `sessionStorage`; native staff tokens use secure storage. Drafts/UI context use browser/WebView localStorage. Mobile has no independent inventory database.

## 3. Source map and entry points

| Path | Responsibility |
| --- | --- |
| `web/app.js` | State/API/auth restore, events/dialogs, drafts, sequential count submission, staff switching |
| `web/view.js` | Escaped HTML rendering, navigation, forms, history/reports/accounts, formatting |
| `web/styles.css`, `web/index.html`, `web/config.js` | Responsive/theme, app containers, API origin |
| `server/http.mjs` | HTTP/static, auth, sessions, delegation, CORS, API dispatch |
| `server/inventory.mjs` | Validation/permissions, stock movements/documents, history/reports/snapshot |
| `server/db.mjs` | Schema, additive migrations, transactions, hashing, demo seed |
| `scripts/import-opening.mjs` | One-time captured-Sheets-JSON import into a new DB and new initial-login output |
| `scripts/build-mobile.mjs` | Asset copy and HTTPS API-origin generation |
| `scripts/open-demo.ps1` | Start/reuse local backend with the correct profile |
| `scripts/run-android-local.ps1` | Debug sync/build, emulator/device selection, ADB reverse, install/launch |
| `scripts/run-web-android-local.ps1` | Web/Android launcher sharing a demo backend |
| `test/inventory.test.mjs` |17 API/inventory tests using memory DB at audit baseline|
| `test/history.test.mjs` |5 history/filter/date/pagination/authorization regressions at audit baseline|
| `scripts/smoke-web.mjs`, `scripts/verify-ui.mjs` |Browser integration/native bridge mocks and UI/responsive QA|
| `android/`, `ios/` |Capacitor shells/configuration; no separate native business layer|
| `.github/copilot-instructions.md` |Existing branch/commit/PR rules; preserve|
| `data/` |Operational/demo DBs, snapshots, local credentials/logs; Git-ignored|
| `dist/`, native `public/` |Generated bundles; Git-ignored|

Read APIs: `GET /api/health`, `/api/snapshot`, `/api/history`, `/api/report`, `/api/photos/{id}`. Auth: `POST /api/login`, `/api/logout`.

Actions under `POST /api/`: `counts`, `count-sheets`, `thresholds`, `system-thresholds`, `prices`, `count-units`, `items`, `deliveries`, `receipts`, `delivery-receipts-all`, `transfers`, `transfer-receipts`, `transfer-receipts-all`, `staff-passwords`.

Protected routes require bearer tokens; actions use `Idempotency-Key`; manager delegation uses `X-Staff-Account`. Photos are not public. Native CORS origins include `https://localhost` and `capacitor://localhost`.

The audit lists all 17 tables/relationships. Main groups: catalog/locations/users/sessions; stock/movements; deliveries/lines/receipts; transfers/receipts; count_sheets/lines/counted_receipts; opening_balances; requests/delegated_actions. `openDatabase()` can create/migrate/seed schema; do not use it for read-only operational DB inspection.

## 4. Business rules and decisions to preserve

### 4.1 Stock, conversion, thresholds, and catalog

- Quantities use integer scale1000, up to three decimal places, item-specific units, and whole-item results for base `each`. Stock must remain nonnegative and at most 1 billion base units.
- `known=false` differs from zero: API returns unknown/null. Blank count fields leave stock unchanged; entering 0 confirms none left.
- Standalone new items start unknown everywhere. Items created in deliveries start known-zero at the destination and unknown elsewhere. Receiving into unknown stock keeps it unknown.
- Catalog supports creation and adding a missing base unit; do not infer full edit/delete/category CRUD. Preserve SKU/duplicate/case-size validation.
- Low stock means known and `on_hand <= threshold`; null disables that threshold. System threshold is independent of summed per-location thresholds; totals sum known stock and display `Tạm tính` when any location is unknown.
- USD base-unit prices use integer scale10000; current valuation is provisional when price/stock is missing. This is not historical cost accounting.

### 4.2 Counts, transactions, and retry

- `move()` updates stock, increments revision, and inserts actor/time/delta/balance/reference/note/known flags into the ledger.
- `applyAction()` saves the action and idempotency result inside `BEGIN IMMEDIATE`; failure rolls back the whole action. Requests are unique per actor/key; reusing a key with a different payload returns 409. Fingerprints preserve the payload and delegated manager identity.
- Standalone manager counts and count sheets check `revision` within the transaction; stale writes return409 rather than overwrite intervening transactions. Never auto-merge competing counts.
- One category per sheet,1–1000 unique lines matching that category; performer required; only entered items change.
- One UI confirmation submits every counted category at the selected location **sequentially**. Categories are individually atomic; the queue can partially succeed. Preserve progress messaging and unconfirmed drafts.
- For an uncertain outcome, retry the same payload/key within the dialog. Queue/keys currently live only in memory and do not survive kill/reload. Do not claim exactly-once behavior for every new request/key.
- Remove only confirmed draft lines that have not been concurrently edited. Never auto-submit restored drafts.

### 4.3 Supplier deliveries, transfers, and photos

- Manager creates deliveries with 1–50 unique items; creation does not increase stock. Receipts increase actual quantity without exceeding expected; partial receipts and all-outstanding receipts are supported.
- Transfers use 1–150 unique lines per batch; source differs from destination and has known, sufficient stock. Dispatch immediately reduces source; destination increases only by actual receipts. Batch dispatch/receive-all is atomic per action.
- Staff operate only within their authorized location. Staff can receive incoming shipments only when the creator is a manager. Shipments created by a manager switched to staff remain staff-authored.
- Final shortage/overage requires a reason; overage requires final closure; final zero can close short; full receipt closes automatically. Store discrepancy separately without inflating destination stock.
- Receive-all checks IDs/outstanding snapshots before writes. Receiver required. Photos:JPEG/PNG/WebP<=5MB, magic-header validation, SQLite storage, authorized reads; supplier batch photo attaches to the first receipt.
- Manager-only `Đã tính trong phiếu`:the sheet count must be the latest count movement for that item/location across both `count` and `sheet_count`; a newer standalone manager count invalidates the old sheet. Cumulative linked receipts<=counted quantity; transfers additionally require count time not before dispatch. Supplier receipts currently do not compare count time with delivery creation. Preserve that difference during porting. Receipts retain quantity, stock delta0, and increment revision.

### 4.4 Reports and history

- Weeks start Monday in Atlanta. End is the last sheet count in the selected week; start is the immediately preceding sheet, even within the same week or across skipped weeks. A valid opening import can provide the first boundary if no prior sheet exists.
- `usage = beginning + supplier_receipts + transfer_in - transfer_out - ending`, using movement boundaries. Counted receipts are attributed to count boundaries to avoid double counting.
- Missing boundaries mean unknown usage; negative usage warns. Standalone manager `count` has no count_lines and does not become a report sheet boundary.
- Report valuation always uses **current** stock and prices, even for historical weeks.
- History supports independent/combined item/SKU/note/actual performer/account/location/inclusive Atlanta date/type/order filters; Vietnamese normalization; movement-ID cursors; server batches 50; UI pages 20.
- `Kiểm kê`=`count`, `Phiếu kiểm kê`=`sheet_count`, `Tất cả kiểm kê`=both. Label changes must preserve these meanings.
- Timestamps use `vi-VN` and Atlanta timezone. Two fall-back instants can both display 01:30 because UI lacks an offset; filtering remains correct.

### 4.5 Auth, delegation, drafts, and native lifecycle

- Passwords use salted scrypt; bearer tokens are random; backend stores SHA256 token hashes. Staff native login with `native:true` has `expires=0`; web and native manager sessions remain12h. Every API checks the session row; indefinite does not mean irrevocable.
- Staff password reset is manager-only,12–256 characters, and must differ from old password. It atomically updates the hash and deletes all sessions for that account only; other accounts/manager remain usable. Same-key replay does not revoke new sessions again; reset fingerprints are salted.
- Manager switching keeps the manager token and chooses effective staff through the header. Backend enforces staff permissions and logs both identities in delegated_actions on writes. No dedicated delegation UI. Reload restores authenticated manager context; staff-to-staff keeps a supported tab; returning to manager opens Accounts.
- Native secure-storage8.0.1 uses internal bridge methods and keys containing backend origin; iOS device-only/unlocked/syncfalse; Android Keystore/encrypted preferences. Do not accidentally change plugin, origin, ID, signature, or namespace.
- Native cold start/resume verifies tokens with the server. Offline retains the token without opening verified inventory. Offline logout persists pending logout first, blocks inventory, retries revocation online, then clears the record.
- Capacitor logging is disabled; Android backup excludes encrypted preferences. Backend revocation wins even if an old token is restored.
- Draft localStorage scope includes API origin + first catalog item ID + account + location + category, with a separate manager-switch marker. Preserve legacy draft compatibility/name fallback. Shared performer is scoped by scope/location and currently remains after submission until edited.
- Preserve manager desktop/sidebar and mobile `Chức năng` menu, staff's final three tabs, sticky counting action, safe areas, theme, focus, dirty-form confirmation, inline errors, and 20-row pagination hidden when fewer than two pages exist.

## 5. Feature status and critical scenarios

Audit F01–F18 includes workflow-specific evidence labels. Summary:

| Area | Status and limits |
| --- | --- |
| Stock/catalog/counts/receipts/transfers/accounts/history/reports |Implemented; API/browser checks verify audit scenarios, not every physical device|
| Concurrent counts |Implemented/verified on one server/memory DB:same revision, different keys=>200/409, one sheet|
| Competing dispatch and idempotent receipts |Implemented/retained regression tests: no negative stock or orphan losing-batch rows; one receipt per same key|
| Multi-category transaction |Partial:atomic per category, not all-or-nothing queue|
| Cross-device sync |Shared backend/manual refresh verified; realtime push absent; all three WAN binaries unknown|
| Offline counts |Partial:open screen can edit/save drafts; full cold startup and durable outbox/auto-sync absent|
| Offline startup/logout auth |Implemented; browser bridge mocks pass; current physical cycle unknown|
| Concurrent configuration edits |Transactions exist; price/threshold revision locks absent; no added conflict policy|
| Persistence/backup/restore/HA |M1 disposable file tests verify WAL backup, restore/reopen, abrupt-exit recovery and supported legacy schema; operational backup/HA/load remain unverified|
| Import/export/approval |One-time Sheets snapshot importer exists; not rerun; live sync/export/approval absent|
| Native packaging |Shells exist; four common web-file hashes match current bundles; installed APK/IPA/signing/physical behavior unconfirmed|
| Migration stack |Next.js/TypeScript/Tailwind/shadcn and RN/Expo unimplemented; option A selected but UI implementation gated|

## 6. Test evidence and historical progress

### 6.1 M0 audit results at baseline a8b2d0b

- `npm.cmd test`: **22/22 pass**,17 inventory+5 history.
- `node scripts/smoke-web.mjs`:inventory/browser flows and native bridge mock restore/offline logout/two-device revocation pass.
- `node scripts/verify-ui.mjs`:themes, mobile navigation, large text, drafts, dialog dismissal, refresh recovery pass; screenshots in OS temp, not committed.
- Playwright MCP:staff390px, vi-VN, Vietnam timezone; offline entry 27 retained as draft; online reload restored 27; manager API update 30; staff refresh showed stale line; no page overflow/JS errors.
- Ad hoc HTTP/memory:same-revision counts 200/409, one sheet; two dispatches 10 against 14=>200/409, balance 4; two same-key receipts=>same result, one receipt.
- app.js/view.js/styles.css/index.html hashes matched web/dist/Android public/iOS public. This does not verify config.js or installed binaries.
- No operational DB opening, native build/sync, physical-device check, reimport, backup restore, or infrastructure changes during M0.

These ad hoc/MCP checks were not committed as tests during the documentation-only audit; M1 is now approved to capture regressions. PR#8 committed history coverage:optional/combined filters, Atlanta winter/summer/DST, pagination123 matching rows, cursor boundary50, validation, and staff denial. Earlier 5/5 passed with TZ=Asia/Ho_Chi_Minh, and all four mutations were caught in temporary backend copies:remove person filter, UTC dates, reverse sorting, inclusive cursor. No production source was mutated.

M0 evidence above is historical. Fresh M1 execution evidence is recorded separately below.

### 6.2 Historical evidence, not a latest native-build result

- API suite grew 11→15→16→17; staff switching previously passed 17 API+Chrome smoke.
- Native-session development passed Android debug/unsigned Release; API36 emulator login, force-stop, reboot, in-place APK replacement, logout/reopen. On November 20, emulator cold relaunch read the same token fingerprint, server returned 200, and staff view restored.
- iOS unsigned Release and Simulator lifecycle (login/reopen/reboot/reinstall/logout/reopen) ran on macOS Actions: [Release build](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42955944659),[Simulator lifecycle](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42956431684). Historical revisions, not rerun against latest UI/HEAD.
- At 8efb6f4 on November 20:17 API, smoke/UI passed. Initial smoke selector for `Xuất chuyển` matched a hidden option; changed to visible history rows and passed.
- Cleanup d3f933f removed two unhelpful Android example tests (old package ID and 2+2), associated test metadata/runner/JUnit/Espresso. Afterwards 17 API+smoke+UI and Android assembleDebug passed.
- Earlier ad hoc history checks covered date-only/combined, Atlanta winter/summer/DST, Vietnam locale, and 52-row bidirectional pagination; PR#8 now commits history regression coverage.
- 4419a66 merged before tests;8efb6f4 checks came later. Do not claim those checks ran at the earlier merge.
- README still says iOS was never run; this context records newer historical evidence. README stayed outside M0's allowlist.

### 6.3 M1 completion evidence, November 20, 2026

- `npm.cmd test`: **34/34 passed**: 17 original inventory, 5 history, 6 concurrency, 6 file-backed backup/schema/recovery tests.
- `scripts/verify-parity.mjs`: **3/3 browser scenarios passed**: offline draft/reload and account/delegation isolation; partial multi-category retention after a real conflict; retry following a real server commit whose response was deliberately dropped.
- Existing `scripts/smoke-web.mjs` and `scripts/verify-ui.mjs`: passed again against the unchanged application implementation.
- Playwright MCP: mobile390px, Vietnam locale/timezone; offline draft27 restored, explicit count submission applied once, stock27 and one sheet, no page errors.
- Two temporary client mutations were caught: skipping confirmed-draft cleanup and allocating a new key for an uncertain retry. Temporary source copies were removed; operational `web/` was never edited.
- `scripts/backup-database.mjs` adds an explicit-source/fresh-destination Online Backup CLI using a read-only source, integrity/FK validation, private staging and exclusive no-clobber publication. Existing outputs, aliases, destination sidecars and source-sidecar filenames are refused. No production backup job or scheduling was enabled.
- Backup fixtures retain committed active WAL state and exclude unfinished writes, restore to a new path, reopen, recover from child exit73, and migrate one supported original schema additively across repeated openings. No operational database was read, copied, migrated or restored.
- Independent review found a source-sidecar destination bug in the new helper. Root added a failing regression, reproduced the issue, rejected those names (case-insensitively on Windows), then passed 6/6 DB tests and the full34/34 suite. Review of other M1 code found no additional actionable issues. This was a helper fix, not an inventory policy change.
- [FEATURE_PARITY.md](docs/FEATURE_PARITY.md), [TEST_MATRIX.md](docs/TEST_MATRIX.md) and [BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) retain the oracles, commands, remaining platform gates and operational limitations.
- Source baseline for M1: merged documentation PR#9 at `a04d175`; work branch `Minh/migration-m1-baseline`. Existing `server/`, `web/`, native projects, package files and configuration remain unchanged. The pre-existing 297 staged skill assets were excluded.
- No Next.js/Expo client, native bridge or live deployment was implemented. Physical-device signed updates, multi-process/load and actual power-loss testing remain pending. Next step: obtain approval of the concrete M2 contracts/Web-foundation scope.

## 7. Open issues and known risks

1. User reported lost login on a physical phone; emulator passes, but exact device/build not reproduced. Need OS, role, build/install method, uninstall versus force-stop, API origin, and password-reset history; never request passwords/tokens.
2. A November 19-only filter once showed November 7:fresh fixtures/current server sent correct from/to and returned only November 19; listener4170 was an old backend and a new start hit EADDRINUSE. Likely cause, not proof for all real data. Restart the correct backend after server changes; do not kill unrelated processes.
3. RN upgrade risks token/logout tombstone/WebView draft incompatibility with Expo SecureStore/AsyncStorage; same app ID is insufficient. A new Vercel web origin also cannot read old localhost drafts automatically.
4. Request keys exist only in dialogs; no durable outbox or semantic dedup for every new key. Do not silently add auto-retry/merge as existing policy.
5. One synchronous backend process supports action atomicity; multi-query snapshot/report reads have no explicit read transaction for multi-process operation. Stress/load/HA untested.
6. Importer is one-time snapshot-only; current live item counts/quantities were not reread. Initial-login files are not current-password authority.
7. Production backend/domain/TLS/Vercel project, Android signing/Apple team/TestFlight/store release, and RPO/RTO unconfirmed. Do not silently choose providers or raise minimum OS.
8. Requests table has no cleanup policy; measure SQLite photo growth and document/snapshot performance before release rather than silently changing storage/DB.

## 8. Local run, environment, and deployment

- `data/inventory.sqlite`:imported operational data; `data/demo.sqlite`:demo. WAL/SHM can contain new commits; copying the main file alone is not a consistent backup.
- `data/inventory-logins.json`:initial credentials; never print in chat/docs/PRs; password reset makes it stale. `data/sheet-opening.json`:captured dataset; live Sheet not accessed during audit.
- Direct `node server/http.mjs` defaults to demo, loopback4170. `Mo-The-Bep.cmd`/open-demo selects imported DB4171 when present unless `-Demo`.
- `Mo-The-Bep-Web-Android.cmd` always uses demo; `Mo-The-Bep-Android.cmd` follows launcher arguments. `npm.cmd start` runs only web/backend, not Android builds.
- Android local overlay loads127.0.0.1:4170/staff through ADB reverse to backend4170/4171. Packaged native uses a real HTTPS API origin; example.com in docs is a placeholder.
- Web/debug static assets can refresh on reload; backend changes require server restart. Check listener/start time after EADDRINUSE; opening a browser does not prove a new server is running.
- Approved future native build flow:`npm run build:mobile -- <HTTPS-backend-origin>`, `npx cap sync android`/`ios`, then Gradle/Xcode. These write generated/native files and were not run during audit or authorized by M1.
- Preserve app ID/signature/storage namespace, Capacitor logging none, and backup exclusions. The iOS app target15.4 is the actual current minimum; Package.swift .v 15 alone is insufficient.

Configuration names:`BEP_DB`, `BEP_PORT`, `BEP_HOST`, `BEP_LIVE`, `BEP_ORIGINS`, `BEP_API_URL`; QA overrides `BEP_PLAYWRIGHT`, `BEP_CHROME`; toolchains `ANDROID_HOME`, `JAVA_HOME`. Record names only, not secrets or production values.

## 9. Decision and Git history

### 9.1 User decisions before migration

- Preserve the existing project; no framework rewrite without a request; no approved live Sheets sync/POS/sales integration. The new request opened rebuild evaluation; November 20 approval selects option A and M1 only, not later UI implementation.
- Branches use `Minh/` from main, commit/push then merge through PR; codex/Copilot prefixes rejected. Do not bundle unrelated customization.
- Consumption uses latest sheet count and immediately preceding count, replacing the earlier interpretation of two adjacent calendar weeks.
- Manager mobile horizontal tabs were replaced by the `Chức năng` menu; preserve keyboard/touch/focus and no whole-page overflow.
- Restore drafts by account/location/category; one confirmation submits all counted categories rather than forcing individual submission; backend remains atomic per category.
- Pagination20; hide Previous/Next/status below two pages.
- Manager can reset staff passwords at any location and revoke sessions; native staff sessions must survive close/force-stop/reboot/update, while explicit logout/password reset revokes.
- Offline startup does not treat a stored token as verified; offline logout blocks inventory then revokes online. Never store passwords.
- Manager switches to staff without another login/staff password; staff-to-staff preserves deliveries/transfers tab; returning to manager opens Accounts.
- Shared performer name spans categories; history clearly searches actual performer/account/date/location.
- A separate tester was once used to reduce cost; later the user requested direct assistant testing. Do not infer a general testing ban or omit QA.
- Maintain a living handoff with evidence, open bugs, and workflows. An old handoff-only PROJECT_CONTEXT.md restriction is historical; current scope is §1.
- November 20 language correction:repository/Git/GitHub English; user chat/reports Vietnamese.

### 9.2 Important commits

| Commit | Milestone |
| --- | --- |
|f36d10f|Local baseline|
|69336a2|Initial GitHub import via PR#1|
|8d61949|Document Minh/ branch workflow|
|5e6c655|PR#2 navigation, draft restore, multi-category, pagination|
|58ea094|PR#3 staff password reset|
|8985bbc|PR#4 secure persistent native sessions|
|ed986c9|PR#5 manager switching|
|7874780 /78a0ae7|Combined Web/Android launcher and one-command demo|
|85ccc05 /31d592a|PR#6 UI polish|
|8efb6f4 /4419a66|PR#7 preserve staff tab, shared performer, history filters|
|2142e27 /d3cc61c|Expanded context handoff|
|62b9182 /d3f933f|Android test scaffolding cleanup|
|a8b2d0b /25c5483|PR#8 five history regressions,22/22 API suite|
|a04d175 /5ecc96e|PR#9 audit/architecture plan, English repository language policy, recorded G1/G2 approval|

Repository:`https://github.com/giaminh05/The-Bep-Inventory`. At audit start, main/origin/main=`a8b2d0b`; documentation branch `Minh/cross-platform-migration-audit`.297 skill/customization files were staged before the task and excluded from migration commits. Three native files had line-ending-only changes in an earlier handoff; the fresh audit began without application/native diff. Always inspect actual status.

Historical worktree `Minh/verify-ios-staff-sessions` in OS temp contains verification-only workflows/probes absent from main; do not merge accidentally. Rolling back code does not authorize reverting/deleting operational data.

The pre-audit English handoff is available at `a8b2d0b:PROJECT_CONTEXT.md`. M0's Vietnamese rewrite retained historical decisions and moved the detailed workflow map into the audit; this English version follows the user's language correction and records G1/G2 approval.

## 10. Next work and handoff

1. M1 is complete: retained concurrency/cross-client/offline-draft regressions, parity/test matrix, and disposable backup/restore/schema/recovery rehearsal. No inventory behavior, live schema/data or deployment changes.
2. Obtain approval for the concrete M2 scope: additive TypeScript contracts/API adapter and a Next.js Web foundation alongside legacy. Start with contracts before migrating count behavior; no backend/DB rewrite.
3. A separately approved RN/Expo spike must prove token/draft/pending-logout continuity, signed updates, and minimum OS before native migration. Revisit the architecture if it fails.
4. Staging/production/signing/hosting/backup retention require separate approvals at their gates. Operational backup execution and restore have not been performed or authorized by the disposable rehearsal.

After meaningful milestones, update context/tracker and report actual files/tests/workflows/risks. Implemented does not mean verified. A merged branch is not architecture approval. Preserve source/data/permissions and use small, verified tasks.
