# Cross-Platform System Audit

This document preserves the M0 legacy baseline. Subsequent M1 checks and the M2 shared packages/Next preview are additive; see [WEB_FOUNDATION.md](WEB_FOUNDATION.md) and the current context/tracker for their implementation and fresh evidence. The operational client/backend/native source described below remains unchanged.

Audit date: November 20, 2026, communication timezone `Asia/Bangkok`. Baseline: `a8b2d0b` (PR#8). Documentation branch: `Minh/cross-platform-migration-audit`.

This document preserves the M0 audit results below. Subsequent approval on November 20 selected option A and M1 (G1/G2); M1 is in progress. This does not turn historical audit evidence into fresh M1 verification or approve Next.js/Expo UI implementation/production changes.

## 1. Scope and evidence levels

Reviewed `server/`, `web/`, tests, launch/build/import scripts, Android/iOS configuration, README, handoff, Git instructions, and available history. No root `AGENTS.md` existed before this task. Early conversation history is incomplete; do not infer unrecorded requirements. Did not open the operational database through `openDatabase()`, which performs migrations.

Labels used below:

- **Implemented and verified**:checks executed during the audit, with environment limits stated.
- **Implemented but unverified**:source exists, but the relevant scenario was not exercised.
- **Partially implemented**:only part of the scenario is supported.
- **Not implemented**:no corresponding path exists in audited source/API.
- **Unknown**:environment or physical-device evidence is missing.

“Not implemented” does not automatically make a feature an approved addition.

## 2. Current stack and structure

| Component | Verified current state |
| --- | --- |
| Web | JavaScript ES modules, HTML/CSS, DOM rendering; no React/Next.js/TypeScript/Tailwind |
| Backend | Node >=24, `node:http`, ESM; audit machine Node 26.13.0 |
| Database | `node:sqlite`, SQLite WAL, foreign keys, busy timeout 5000 ms; integer stock scale1000 |
| Android/iOS | Shared `web/` in Capacitor8.6.0; secure-storage exactly pinned 8.0.1 |
| Android | App ID `com.thebepteahouse.inventory`, minSdk24, compile/target36, versionName1.0/code1; AGP8.13.0, Gradle8.14.3; no release signing configured in source |
| iOS | Same bundle ID; app target15.4, version1.0/build1; SPM exact Capacitor8.6.0; Automatic signing without DEVELOPMENT_TEAM in project |
| QA | Node test runner, Playwright1.65.0, working Playwright MCP |
| Dependencies | Capacitor core/android/ios/CLI8.6.0; secure-storage8.0.1; Playwright1.65.0; nothing installed during audit |
| Toolchain | Windows has Java21, adb1.0.41/platform-tools37.0.1, SDK Platform36; no `xcodebuild` on PATH |
| Infrastructure | Local launchers exist; production backend, Vercel project, TLS, signed distribution, and store release unconfirmed |

`web/app.js`:state, auth, API, drafts, dialogs, events. `web/view.js`:escaped HTML/formatting. `web/styles.css`:responsive/theme. `server/http.mjs`:HTTP/auth/CORS. `server/inventory.mjs`:business behavior. `server/db.mjs`:schema/migration/transactions. `scripts/import-opening.mjs`:snapshot importer. `scripts/build-mobile.mjs`:copies web assets and writes HTTPS API origin into `dist/config.js`.

Database has 17 tables:`locations`, `items`, `users`, `sessions`, `stock`, `movements`, `deliveries`, `delivery_lines`, `receipts`, `transfers`, `transfer_receipts`, `requests`, `delegated_actions`, `count_sheets`, `count_lines`, `counted_receipts`, `opening_balances`. Catalog/schema confirmed from `server/db.mjs`, not the operational DB. No migration-version framework.

## 3. Workflow map and parity checklist

Each ID must be compared during migration. Evidence applies only to the stated checks, not every aspect of physical-phone UX.

| ID / workflow | User action | Rules and validation | Database/API | Outcome and evidence |
| --- | --- | --- | --- | --- |
| F01 Catalog | Manager creates standalone item or item within delivery; chooses category/SKU/unit/case size | Name/category required; duplicate SKU blocked; conditional duplicate-item validation; positive integer case size, different from base case | `POST items`, `deliveries`; `items`, stock rows for all five locations in transaction | Standalone item starts unknown; delivery-created item known-zero at destination, unknown elsewhere. API tests verify; no separate item edit/delete or category CRUD |
| F02 Units/quantities | Select item unit; manager adds missing unit | Scale1000, max 3 decimals; item-specific factor; whole items for base `each`; nonnegative; stock<=1 billion base units | `quantity()`, `count-units`; `items.units/base_unit`, scaled integers | Correct bag/case/each conversion; no guessing ambiguous package size. Existing API cases verified; no independent unit-test module |
| F03 Stock/alerts | Manager chooses one/all locations; staff sees authorized location through forms | Five locations; unknown differs from 0; low if known and on_hand<=threshold; null disables threshold; total omits unknown and shows `Tạm tính` | `GET snapshot`; `items/stock`; `thresholds/system-thresholds` manager-only | Location/system totals and thresholds; API+browser smoke verified |
| F04 Count drafts | Select location/category; enter quantity/unit, performer, note; switch/reload | Blank leaves stock;0 confirms empty; scope API/catalog/account/location/category; separate manager-switch marker; shared performer within scope | `localStorage` only, no stock writes; lines retain revision | Correct owner/category draft restoration; smoke/UI+MCP verified. Not server-synchronized drafts |
| F05 Multi-category submission | Click `Kiểm tra và gửi`, review categories, confirm once | One category per API sheet;1–1000 unique category-matching lines; fresh revisions; performer required; sequential client requests | `count-sheets`; `count_sheets/count_lines/stock/movements/requests`; one transaction/category | Delete confirmed, unedited draft lines only; partial success possible. Existing API/browser checks verify supported cases; no post-submit manager approval |
| F06 Standalone adjustment | Manager enters actual count and note for item/location | Fresh revision; zero valid; staff prohibited | `counts`; stock+revision and `count` movement | Stock becomes entered count; delta/actor/time logged. No count_sheet; stale-revision API tests verify |
| F07 Supplier delivery | Manager creates 1–50 unique items, destination, supplier, expected quantities | Valid units, quantity>0; new-item validation; no duplicate lines | `deliveries`, `delivery_lines`, `requests`; can create item in same transaction | No stock increase on creation; API tests verify |
| F08 Supplier receipt | Enter actual, receiver, note, optional photo; receive one line or all outstanding | Staff limited to own location and manager-created delivery; actual>0, cumulative<=expected; batch checks unchanged outstanding; JPG/PNG/WebP<=5MB with header check | `receipts/delivery-receipts-all`; receipt/photo BLOB, line cumulative, stock+movement+request | Only actual increases stock; correct outstanding; authorized photos; invalid photo rolls back. API+smoke; unknown stock remains unknown |
| F09 Transfer dispatch | Staff dispatches from assigned location or manager from any; select multiple items | Different source/destination;1–150 unique lines; known, sufficient source; quantity>0 | `transfers`; batch/rows, source reduction via `move`, request in same transaction | Immediate source reduction; no destination increase; atomic batch; no negative stock. API+ad hoc concurrency |
| F10 Transfer receipt | Enter actual, receiver, closure; receive all remaining if sufficient | Destination permission; staff only receives manager-created shipment; overage requires final; final shortage/overage needs reason; final zero allowed | `transfer-receipts/transfer-receipts-all`; receipt, received/shortage/closed_at, stock+ledger+request | Adds actual; reduces in-transit; final discrepancy stored; same-key replay does not add again. API verified |
| F11 Already counted receipt | Manager selects `Đã tính trong phiếu` on individual receipt | Sheet must be latest count across both `count`/`sheet_count` for item/location; newer standalone count invalidates old sheet; linked sum<=counted; transfer count not before dispatch; staff prohibited | `postReceipt/latestCount`; receipt retained, movement delta0, `counted_receipts` links count movement | No double stock addition; report allocation uses count boundary. Existing API cases verified; post-standalone-count eligibility inferred from source |
| F12 History | Manager filters item/SKU/note/performer/account/location/date/type/order; loads more | Inclusive Atlanta dates; independent filters; Vietnamese normalization; count differs from sheet_count; movement-ID cursor | `GET history`, joins movement/user/item/location/count; batch50, reads 51 for next | Actual performer and submitting account shown;20 UI rows/page; five history tests+smoke verified. No dedicated delegated_actions UI |
| F13 Reports/prices | Manager selects week/location, views usage, enters USD unit price | Atlanta Monday weeks; end=last sheet in selected week; start=immediately prior sheet; opening fallback; missing boundary=>unknown | `GET report`, `prices`; `count_lines/sheets`, movements, opening, counted_receipts; cost integer1/10000USD | Usage=start+purchases+incoming-outgoing-end; valuation uses current stock/prices, not historical prices. API verified; negative usage warns |
| F14 Login/logout | Login, reverify, online/offline native logout | Salted scrypt; backend SHA256 token; native staff `expires=0`, web/manager12h;20 failed attempts/IP/minute; every API checks session | `login/logout/snapshot`; users/sessions; browser sessionStorage, native SecureStorage | Pending native logout persisted, inventory blocked, revocation retried; API/smoke mock verified. Physical-device issue remains open |
| F15 Accounts/delegation | Manager resets staff password; switches staff/staff/manager | Password12–256, different from old; revoke selected staff sessions only; manager token+`X-Staff-Account`, backend staff rights | `staff-passwords`; users/sessions/requests; writes add `delegated_actions` | Same-key password replay does not revoke new sessions; staff tab preserved; return opens Accounts; API/smoke verified |
| F16 Import | Operator imports captured Google Sheets JSON into new outputs | Validate source/header/catalog/location/unit/quantity; reject existing DB/login output; NOT COUNTED=>unknown | `scripts/import-opening.mjs`; schema then locations/items/stock/opening/users transaction; new credentials output | One-time import, no live sync. Source audited; not rerun; current operational row counts unknown |
| F17 Export/approval | Look for data export and count approval | No CSV/XLSX/PDF export endpoint/UI or pending count-approval state found | No corresponding action | Not implemented; do not add by default during migration |
| F18 UX/operations | Manager/mobile menu, three staff tabs, search/pages, dialogs, refresh | No whole-page overflow; retain focus/keyboard/touch; dirty-form confirm; failed drafts retained; device theme | `web/app.js`, `view.js`, `styles.css`; no DB changes | UI/smoke 320/390px, theme/large text/draft/refresh failures; entry productivity not evaluated on every physical device |

### Web / Android / iOS workflow differences

F01–F13, F15, and F18 share source/API across platforms; account determines rights, not platform. Source supports native manager login; do not drop manager screens without approval. There is no separate native inventory algorithm to port.

- Web:URL/backend normally same origin; sessionStorage tokens, localStorage drafts; browser file input.
- Standard Android:`dist/` bundle copied into assets/public, HTTPS API; Keystore/encrypted-preferences token; WebView file chooser/keyboard. Local debug loads backend `/staff` via ADB reverse, a different route from packaged builds.
- iOS:public bundle, HTTPS API; device-only Keychain token; WKWebView/iOS picker/permissions; macOS/Xcode required. Latest native lifecycle not rerun.
- F14 differs by storage/lifetime as above; native staff persists, native manager does not. F04/F05 localStorage does not automatically migrate to RN AsyncStorage. F16 is a backend CLI without client import UI; F17 absent on all three.
- Shared photo-selection UI exists; actual OS-specific picker/permission behavior was not verified in the audit.

## 4. Four critical scenario groups

| Scenario | Current classification | Evidence and limits |
| --- | --- | --- |
| A1 Two staff count same item/revision | Implemented and verified | Concurrent HTTP requests, different keys:200/409, one sheet; revision checked in `BEGIN IMMEDIATE`; no automatic merge |
| A2 Replay same key/payload | Implemented and verified | Two same-key receipts return same result, one row; requests UNIQUE(actor, key), result+stock atomic |
| A3 Same intent, new key after reload | Partially implemented | Key/queue only in dialog memory; no durable operation identity. Revision usually blocks stale counts; no universal semantic dedup for new keys |
| A4 Concurrent threshold/price/catalog | Partially implemented | Transactions prevent partial writes; price/threshold lack revision checks. Sequential valid updates can retain the later value; load/multi-process untested |
| B1 Shared data source | Implemented and verified | Same backend; stock write then GET/API/browser sees new result; no separate mobile DB |
| B2 Push changes to other devices | Not implemented | No polling/WebSocket/SSE; other views retain old snapshot until refresh; native start/resume reverifies |
| B3 Failed refresh/stale draft detection | Implemented and verified | Retains old data, inline error; MCP manager update then staff refresh shows stale line; server quantity30, draft27 retained |
| B4 Three actual binaries over WAN | Unknown | Browser/mocked native does not prove installed APK/IPA origin/build; device/staging matrix needed |
| C1 Offline entry on open screen | Partially implemented | MCP offline entry 27 retained locally and restored after online reload; no offline server submission |
| C2 Full offline cold-start count form | Not implemented | No verified offline catalog/snapshot store; native waits for verification, blocks inventory; browser lacks service worker |
| C3 Auto-sending outbox/conflict merge on reconnect | Not implemented | No durable outbox, background sync, auto-merge, auto-submit; user retries in dialog |
| C4 Native offline startup/logout | Implemented and verified in browser mock | Smoke stored-token/offline recovery/logout tombstone/revoke; physical native unknown |
| D1 Atomic stock/ledger/idempotency | Implemented and verified | BEGIN IMMEDIATE, rollback, constraints; invalid-photo/batch and same-key API tests; not HA/disaster-recovery proof |
| D2 Competing dispatches | Implemented and verified | Two transfers 10 bags against 14:200/409, balance 4, no negative stock; ad hoc memory HTTP |
| D3 Multiple categories per submission | Partially implemented | Category-level atomicity, not queue atomicity; unfinished drafts survive partial success; preserve policy |
| D4 Persistence/recovery/multi-process load | Implemented but not fully verified | Local SQLite file/WAL exists; fresh suite uses memory; no backup restore, crash/power-loss, lock stress, or disk-full audit tests |

Client `readVersion` discards old fetch results after context changes; it is not a distributed version or realtime guarantee. One Node process uses synchronous transactions without yielding between statements; multi-query snapshot/report reads lack explicit read transactions, so consistent multi-process snapshots remain unproven.

## 5. Integrity, security, and decisions still needed

- `stock` has location/item composite key; ledger references stock/user; count_lines keys sheet/item and unique movement; delivery lines unique delivery/item; requests keys actor/key. SQL values are parameterized; HTML uses `esc()`.
- Idempotency fingerprint includes action+JSON payload and delegated manager when present; same key/different payload=>409. Adapters must not silently reorder/reformat retry payloads.
- Supplier counted receipts do not compare count time with delivery creation; transfers require count not before dispatch. Preserve the difference; stricter validation is a business change requiring approval.
- `move()` updates balance, revision, and ledger in the transaction; photos/documents/requests participate in the calling action transaction. Stale counts never automatically overwrite inventory.
- Performer, submitting account, and delegated manager are separate identities. Ledger/history is not tamper-proof against someone who can edit the DB file.
- No confirmed realtime sync, full offline-first, approval, export, separate category CRUD, item edit/delete, backup scheduler, or CI release workflow on `main`. Do not add all by default.
- Schema migration checks columns and returns early when `items.supplier` exists; it does not repair arbitrary partially missing/corrupt schemas. Supported legacy-schema fixtures are needed before adapter/backend changes.
- Login throttling is in-memory per IP; evaluate trusted proxy/multiple instances before production. Unchanged in audit. CORS is browser policy, not authentication.
- Photos reside in SQLite; evaluate growth/backup/proxy body limits before release. Do not silently split object storage or change DB.
- Initial credential files do not reflect password resets; do not read/infer operational credentials from them.

## 6. Native migration and data continuity

During audit, four files `app.js/view.js/styles.css/index.html` matched across web, dist, Android public, and iOS public. SHA256 prefixes respectively:`41898800f7f87658`, `12275cb2d9ea902b`, `6e3f1866554777c4`, `23bdbb14881f84ab`. This does not verify `config.js`, built APK/IPA, or installed binaries.

Current bridge calls secure-storage8.0.1 `SecureStorage.internal*`; key `bep-session-v1:`+backend origin; record includes token and optionally `logout:true`; iOS `accessibleWhenUnlockedThisDeviceOnly`, no sync. Android preferences `WSSecureStorageSharedPreferences` are excluded from backup/device transfer.

Expo SecureStore also uses native secure storage, but format/key/service/alias compatibility with Capacitor is unproven. A separately approved spike must safely read the legacy vault and write the new store, including pending logout; otherwise request a re-login decision. Same app ID does not prove session continuity. WebView localStorage drafts need a transfer adapter too; the same-origin policy prevents a new Vercel origin reading old-origin localStorage.

Preserving app ID, signing key/team, backend origin, and namespace is necessary. Verify signed Android in-place and iOS TestFlight/device updates with increased versions and no uninstall. Verify Expo/RN minimum OS against fleet; do not raise iOS15.4/Android24 merely because scaffolding defaults differ.

## 7. Checks executed during M0 audit

| Check | Result | Scope |
| --- | --- | --- |
| `npm.cmd test` |22/22 pass|17 inventory+5 history, in-memory SQLite|
| `node scripts/smoke-web.mjs` |Pass|Browser workflows, permissions, native bridge mock, restore/offline logout/revocation|
| `node scripts/verify-ui.mjs` |Pass|Theme, mobile menu, large text, drafts/dialogs/refresh; OS-temp images|
| Playwright MCP |Pass|Staff390px vi-VN/Vietnam timezone; offline draft27, online reload retains 27, manager API update 30, refresh stale warning; no JS errors/overflow|
| Ad hoc concurrent counts |Pass|Same revision/different keys:200/409, exactly one sheet|
| Ad hoc concurrent transfers |Pass|Two requests 10 against 14:200/409, balance 4|
| Ad hoc same-key receipt |Pass|Two same-key requests:same result, exactly one receipt|
| Native config/hash/tool inventory |Compared|No native build/sync in this audit|
| Physical Android/iOS lifecycle, signed update |Not run|Historical mocks/emulators are insufficient|
| Reimport, file DB restart, backup restore, load |Not run|Operational data untouched|

Concurrency ad hoc and MCP checks were not saved as regressions during M0 because it allowed documentation writes only. M1 was subsequently approved and completed on November 20: six retained concurrency tests, three browser parity scenarios, six file-backed backup/schema/recovery tests, and a34/34 full suite. See [test matrix](TEST_MATRIX.md), [feature parity](FEATURE_PARITY.md), [backup runbook](BACKUP_RESTORE.md), and the separate M1 evidence in `PROJECT_CONTEXT.md`. The M0 table above remains historical. No inventory behavior, operational database, native project, dependency or infrastructure changed. UI images are temporary artifacts, not committed.

## 8. Checkpoint, Git scope, and audit limitations

- Pre-audit source checkpoint:`a8b2d0b`, repository `giaminh05/The-Bep-Inventory`; separate audit branch retains baseline. Historical `Minh/verify-ios-staff-sessions` worktree in OS temp is not integrated.
-297 skill files were staged before the task; do not edit/stage/commit them. SHA256 of `git ls-files --stage -- .agents skills-lock.json`:`bb31699166c9dd9a5ebf9fe0bcf665abafa6aba25101d93a5222ae08fa887f66` for final comparison.
- DB and WAL/SHM left in place, not opened/edited/imported. No operational DB backup created; code checkpoints are not data backups. Consistent backup/restore rehearsal is required before migration rollout.
- M0 changed documentation only. The architecture in `MIGRATION_PLAN.md` was a proposal during audit. The later November 20 G1/G2 approval selected option A and M1 only; M2+ implementation, Next/Expo UI, native spike, and production retain separate gates.
- Repository/Git/GitHub text now uses English per the user's November 20 correction; chat/reports remain Vietnamese.

## 9. Official technical sources consulted on November 20, 2026

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying): Node/container/static choices; does not require replacing the business backend.
- [Next.js Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): interaction/browser-state boundaries during UI migration.
- [Vercel Functions runtimes, filesystem](https://vercel.com/docs/functions/runtimes#file-system-support): function-local SQLite is not a persistent shared database. Retaining an API host with persistent disk is a project-specific inference.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/): native modules/real compatibility testing require a development binary.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): OS-specific secure storage/lifecycle; does not prove access to a Capacitor vault.
- [Expo SDK58 release](https://expo.dev/changelog/sdk-58): audit recorded current SDK58/RN0.88 and newer toolchains; no project version selected or installed.
- [SQLite Online Backup](https://www.sqlite.org/backup.html): consistent backups; rehearse on copies rather than treating a live main-file-only copy as complete while WAL is active.
