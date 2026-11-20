# The Bếp Inventory — Project Context

Prepared on 20 November 2026, using the Asia/Bangkok project-chat date.

This is a handoff for the existing application. Read it with the current source and Git diff before starting another task.

## 1. Project Overview

### Purpose and users

**The Bếp Teahouse Inventory** provides a manager web dashboard and Android/iOS staff apps backed by the same inventory database. Managers oversee stores and warehouses. Staff count stock, dispatch transfers, and confirm eligible incoming shipments at their assigned location.

The current locations are Duluth, Johns Creek, Norcross, Kho DL House, and Kho Extra. The first three are stores and the last two are warehouses. Early requirements and the local inventory skill mention three stores. The implemented system and later conversations consistently include all five locations.

The application UI is Vietnamese. Business dates use Atlanta time, `America/New_York`. The developer's chat timezone is Asia/Bangkok.

### Technology and architecture

| Layer | Current implementation |
| --- | --- |
| Frontend | Plain JavaScript ES modules, HTML, CSS, browser DOM rendering |
| Manager and staff views | Shared `web/` source, rendered according to the effective user role |
| Backend | Node.js 24+, ES modules, built-in HTTP server |
| Database | Node's built-in `node:sqlite` synchronous API, SQLite WAL |
| Native shells | Capacitor 8 for Android and iOS |
| Secure token storage | `@aparajita/capacitor-secure-storage`, pinned to 8.0.1 |
| Android build | Gradle, Android SDK Platform 36 in the documented local setup, JDK 21 |
| iOS build | Xcode, Swift Package Manager, app deployment target iOS 15.4 |
| Test tooling | Node test runner and Playwright |
| Dependency tracking | `package.json` and `pnpm-lock.yaml` |

The package version is 0.1.0. Capacitor package ranges are 8.x. The current generated iOS package references Capacitor Swift 8.6.0. There is no React or Next.js application in this repository. Installed React/Vercel skills do not imply that the application uses those technologies or has been deployed to Vercel.

The backend serves the web assets and `/api/` routes from one process. Browser requests normally use a relative API origin. Packaged native builds copy `web/` into `dist/`, write the backend origin into generated `config.js`, and copy assets into the native projects through Capacitor. Android local debug can instead load the backend's web page through ADB port reversal.

SQLite holds balances, transaction history, documents, and receipt image blobs. Browser-local storage holds count drafts and UI context. Native authentication uses the secure native store. Web authentication uses tab-session storage.

### Evidence and scope of this handoff

- **Confirmed source facts** come from the current source, README, scripts, dependency files, and local Git history.
- **User decisions** come from the available conversation in this chat.
- **Historical verification** refers to tool results visible in earlier conversation turns. It does not establish that the current HEAD has passed the same checks.
- **Pending verification** identifies implemented changes whose runtime behavior has not been checked in the available record.
- **Recommendations** are proposed next work, not newly approved feature requirements.

The original conversation that produced the initial application is not fully available. This chat began with an existing project. The full discussions behind the combined launcher and later UI-polish commits are also absent. Their implementations can be inspected, but their original acceptance discussions should not be reconstructed from assumptions. Since this document was first drafted, targeted tests and an Android-emulator session-recovery check have been run; see the dated verification record below. No production deployment or live account actions were performed.

## 2. Original Requirements

### Baseline requirements reflected in source and project documentation

- A shared inventory backend for manager web and Android/iOS staff clients.
- Stock by item and location, physical counts recorded as adjustments, and an audit trail with actor and time.
- Item-specific conversion between units such as cases, bags, and individual pieces.
- Configurable low-stock thresholds and alerts at or below the threshold.
- Supplier deliveries with expected quantities, partial actual receipts, and invoice/delivery-slip photos.
- Transfers that deduct the source on dispatch, track goods in transit, add actual receipts at the destination, and record discrepancies.
- Backend enforcement of manager and location-scoped staff permissions.
- Atomic movements and balances, retry-safe confirmations, and stale-count protection.
- Import of opening balances from a captured Google Sheets dataset, preserving unknown quantities and incomplete units.
- Search, pagination, multi-line deliveries/transfers, grouped counts, weekly usage reports, and USD inventory valuation.

These baseline items are supported by code and README. The available chat does not contain the full original wording of every baseline request.

### Later explicit user requests and changes

1. Read and understand the existing project so future work can build on its architecture and business context.
2. Synchronize stale Android/iOS public assets after changes to `web/`.
3. Base weekly usage on the latest count and its preceding count. An earlier description based on two adjacent calendar weeks was superseded.
4. Set up local Git and connect it to the existing GitHub repository, `giaminh05/The-Bep-Inventory`.
5. Use a separate branch for each change, push it, then merge through a pull request into `main`. Use the exact prefix `Minh/`. The user explicitly rejected the earlier `codex/` branch prefix.
6. Improve mobile manager navigation so the active destination remains accessible, retain keyboard/touch usability, and avoid page-wide horizontal overflow.
7. Restore the count draft's valid category after reload for the correct account and location.
8. Submit all counted categories at the selected location from one confirmation, reducing repeated submission and omitted groups.
9. Hide Previous/Next/status controls when a list has fewer than two pages, preserving the 20-row limit.
10. Allow managers to change staff passwords across all locations and revoke old sessions because former employees could otherwise keep accessing inventory.
11. Keep native staff login through closing, force-stop, reboot, inactivity, and app updates. Use Android Keystore-backed storage and iOS Keychain. Store the session token rather than the password.
12. Make explicit logout revoke the backend session and remove the saved session. Password resets must invalidate every session of the selected staff account, while other accounts and the manager remain usable.
13. At offline startup, show a connection/verification state instead of treating the saved token as verified login. Recover correctly when connectivity returns.
14. Let managers switch into staff accounts and back without signing out or entering staff passwords.
15. Testing has sometimes been delegated to reduce usage. The user has also repeatedly asked this assistant to act as a tester and run focused end-to-end checks. Follow the user's latest explicit request; do not assume testing is categorically forbidden.
16. Keep the current staff tab when switching staff accounts, particularly deliveries and transfers.
17. Enter the count performer's name once and reuse it when changing categories.
18. Improve history lookup by actual count performer, date, and location, with useful filtering/sorting beyond product search.
19. Maintain this root `PROJECT_CONTEXT.md` as a handoff for future agents, including verified behavior, known failures, open investigations, and development workflow.

### Superseded approaches and scope boundaries

- The earlier horizontal manager-tab treatment was subsequently replaced by a mobile `Chức năng` menu in the UI-polish commit. Preserve the current layout when fixing behavior unless the user requests another redesign.
- The old requirement to submit each category manually was replaced by a single confirmation that sends the category requests sequentially.
- Native staff sessions no longer follow the old 12-hour lifetime. Web sessions and manager native sessions retain the 12-hour policy.
- Staff-account switching retains the manager's authenticated session and applies staff permissions on each request. It does not obtain or save the employee's password.
- The user did not approve a framework rewrite, live Google Sheets synchronization, a specific production hosting provider, or an expansion into POS/sales integration in the available conversation.
- No other explicitly rejected product ideas are documented in the available history. Do not invent a rejected-feature list.

## 3. Development Progress

### Implemented in the current code

| Area | Present behavior and evidence |
| --- | --- |
| Stock | Five-location balances, unknown-stock handling, unit conversion, thresholds, system totals, movement ledger |
| Catalog | Manager creates items directly or while creating a delivery, optional case conversion, duplicate validation, add missing units |
| Counts | Per-category drafts, revision checks, partial entries, explicit zero, performer/note, recent count-sheet history |
| Multi-category submission | One confirmation sends each counted category through the existing API, retains unconfirmed drafts and reuses request keys during dialog retry |
| Draft restoration | Account/location-scoped category restoration, scoped manager-switch drafts, legacy draft handling |
| Deliveries | Multi-line orders, partial receipts, receive remaining quantities in one operation, receiver name and receipt photos |
| Transfers | Multi-line dispatch, actual destination receipts, partial receipt, final shortage/overage handling |
| Counted receipts | Manager can link receipt quantity to an already-submitted count to avoid adding stock a second time |
| Reports | Atlanta weeks, latest selected-week sheet count versus preceding sheet count, opening import fallback, movement-based usage and current USD valuation |
| Manager accounts | Staff account list and password rotation with session revocation |
| Native login | Secure saved token, indefinite native staff sessions, server verification on startup/resume, offline recovery and pending logout |
| Manager switching | Manager-to-staff selection, direct staff-to-staff selection, return to manager, backend scoping and delegated-write records |
| UI polish | Responsive design, theme follows device light/dark mode, staff bottom navigation, manager mobile menu, sticky mobile count action, dirty-form discard confirmation, inline feedback |
| Launchers | Separate web/live-aware and Android launchers, plus combined web/Android demo launcher |
| Latest fixes | Preserve staff tab, share count performer across categories, and add history filters/search for the actual performer |

“Implemented” here means the behavior is represented in source. See verification limits below before describing any feature as currently tested.

### Verification record

- Earlier conversation showed API suites growing from 11 to 15, then 16 and 17 passing tests as features were added. The current API test file contains 17 top-level tests.
- The native-session work included passing Chrome checks for restored WebViews, offline startup/logout, and two-device revocation using a mocked native bridge.
- Android debug and unsigned Release APK builds passed during native-session development. An API 36 emulator then passed real native-storage login, force-stop/reopen, reboot/reopen, in-place APK replacement, logout, and reopen after logout.
- iOS unsigned Release compilation passed on a GitHub macOS runner. A separate iOS Simulator run passed login, reopen, reboot, reinstall, logout, and reopen after logout. These were reported from actual Actions results in the prior conversation.
- Staff switching had a passing 17-test API suite and Chrome smoke in the earlier session.
- On 20 November 2026, `npm.cmd test` passed all 17 tests at `8efb6f4`.
- On 20 November 2026, `node scripts/verify-ui.mjs` passed at `8efb6f4`, covering responsive UI, light/dark themes, enlarged text, drafts, dialogs, mobile navigation, and refresh recovery.
- On 20 November 2026, the initial `node scripts/smoke-web.mjs` run timed out at line 242 because `getByText('Xuất chuyển')` matched a hidden `<option>` in the history type selector instead of a visible ledger row. The selector was changed to count matching visible history-table rows. The smoke test then passed.
- During the 20 November cleanup, two generated Android example tests were removed. The instrumented example asserted the old Capacitor package ID and the unit example only asserted `2 + 2`; their corresponding test source metadata, test runner configuration, and JUnit/Espresso dependencies were also removed. The current Android app no longer carries these unused template checks.
- After that cleanup, `npm.cmd test` passed 17/17, `node scripts/smoke-web.mjs` passed, `node scripts/verify-ui.mjs` passed, and Android `:app:assembleDebug` succeeded.
- Additional temporary, in-memory checks on 20 November passed: date-only history filtering, combined history filters, Atlanta day boundaries across winter/summer and both DST changes, Vietnamese browser locale with a Vietnam device timezone, and 52 matching history rows paginated in both sort directions without gaps or duplicates. These ad hoc checks were not committed as test files.
- The history page displays timestamps using the `vi-VN` formatting locale but explicitly fixes the timezone to `America/New_York`. The locale controls presentation, not the timezone. Date filters are inclusive Atlanta calendar days; each optional filter can be used independently and blank fields are omitted from the request.
- The history UI distinguishes `Kiểm kê` (`count`, manager single-item adjustment), `Phiếu kiểm kê` (`sheet_count`, grouped submitted count sheet), and `Tất cả kiểm kê` (both). Keep these definitions clear in labels/help text.
- At the DST fall-back boundary, two distinct events can both display as `01:30` in Atlanta. Filtering is correct, but the current display omits the UTC offset/timezone abbreviation, so those two instants are visually ambiguous. Consider showing an offset only if product requirements call for disambiguation.
- A user-reported case where selecting only 19 Nov still showed 7 Nov was investigated with a fresh in-memory reproduction. The current UI sent `from=2026-11-19&to=2026-11-19`, and the current server returned only 19 Nov. Separately, the user's local listener on port 4170 was an older `node server/http.mjs` process started before the history-filter backend change; attempting `npm.cmd start` returned `EADDRINUSE`. This strongly suggests their running backend had not been restarted and ignored the new filter parameters. After stopping the old listener and restarting, recheck with their actual data if the symptom recurs.
- On 20 November 2026, the focused native-session API test passed. The installed Android API 36 emulator was also tested directly: a staff login stored a token through the native secure-storage plugin; after force-stop and cold relaunch, the same token fingerprint was read, the server returned 200, and the staff view was restored. The user's original report of a lost session on their own device is not yet reproduced there. No physical-device test of that report has been completed in this verification cycle.
- The earlier `4419a66` changes were initially merged without tests. The checks above were run later against merged `8efb6f4`.
- The README still contains an older “iOS not run” result. The earlier iOS verification above supersedes that historical statement, but has not been repeated for later UI changes.

Historical iOS evidence is available in [Release build run](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42955944659) and [Simulator lifecycle run](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42956431684). Those runs verify earlier feature code, not the latest HEAD.

### Current stage and unresolved work

The application is a working local inventory system with web/native development flows and imported operational-data files present locally. Production deployment, distribution signing, store release, and testing on physical phones are not established by the available evidence.

There is no partially written application patch in this session. The latest product changes are merged, and the focused web/API and emulator checks listed above passed. The user's device-specific native-session report remains to be investigated if it persists.

The date-only history filter was verified on the current server with test data. A stale backend process on port 4170 likely explained the earlier report. If filtering still returns out-of-range days, verify the running server's startup time/source revision and ensure the old process has stopped before retesting.

### Current Git and working-tree state

- Repository URL is `https://github.com/giaminh05/The-Bep-Inventory`.
- At the start of this context update, local `main` and the fetched `origin/main` were both at `8efb6f4`. Work for this documentation update is on a new `Minh/update-project-context` branch based on that commit.
- Before creating this document, Git already reported modifications in `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, and `ios/App/CapApp-SPM/Package.swift`.
- Those native files produced line-ending warnings and no substantive diff in the read-only inspection. Their reported modified state was preserved. Do not discard or stage them automatically.
- `.agents/` and `skills-lock.json` are untracked local skill/customization files. Do not stage them with application changes unless explicitly requested.
- A separate worktree exists for `Minh/verify-ios-staff-sessions` under the user's temporary directory. That branch contains historical verification-only workflow/probe files. They are absent from `main` and should not be merged accidentally.
- This task changes only `PROJECT_CONTEXT.md`; preserve the native edits and local skill files. Use the user's `Minh/` branch and merge workflow for the context update.

### Key Git milestones

| Commit | Meaning |
| --- | --- |
| `f36d10f` | Local project baseline |
| `69336a2` | Initial GitHub import through PR #1 |
| `8d61949` | Documented `Minh/` branch workflow |
| `5e6c655` | Mobile navigation, draft restoration, multi-category submission, pagination UX through PR #2 |
| `58ea094` | Manager password-reset feature through PR #3 |
| `8985bbc` | Secure native persistent sessions through PR #4 |
| `ed986c9` | Manager staff-account switching through PR #5 |
| `7874780` | Combined web/Android launcher integration |
| `78a0ae7` | Add one-command web/Android demo launcher |
| `85ccc05` | UI polish through PR #6, implementation commit `31d592a` |
| `8efb6f4` | Latest count/switch/history changes through PR #7, implementation commit `4419a66` |

Use this history to locate changes or plan a restore. A request to restore an application version does not authorize replacing operational database files.

## 4. Important Decisions

### Inventory and validation

- SQLite quantities use integer thousandths, with `scale = 1000`. API quantities are converted back to normal units. Maximum per-location stock is one billion base units.
- Each item has a base stock unit and JSON conversion factors. Quantities allow up to three decimal places. Individual-piece stock must resolve to a whole piece.
- Blank count inputs preserve the balance. Zero confirms no stock. `known = 0` is distinct from confirmed zero and API unknown quantities are `null`.
- New standalone items start with unknown balances. Items created in a delivery have a known zero at the receiving location. Other locations remain unknown.
- `move()` updates stock, increments revision, and inserts a movement. Business actions and their idempotency records run in `BEGIN IMMEDIATE` transactions with rollback on failure.
- Single-item manager counts and category sheets require the current stock revision. A stale revision produces a conflict instead of overwriting intervening receipts/dispatches.
- The server accepts one category per count sheet, with up to 1,000 unique item lines. The client coordinates an all-category submission. Each category is atomic, while the complete multi-category operation can finish partially.
- Each category retry must retain its payload and idempotency key when the outcome is uncertain. Remove only confirmed draft lines, preserving concurrent draft edits.
- Deliveries permit 1–50 unique items. Creating an order does not add stock. Confirmed receipts add only the actual receipt amount and cannot exceed the delivery's expected quantity.
- Transfers permit 1–150 unique items in a batch, require different locations and known sufficient source stock, and deduct source stock at dispatch.
- Destination stock increases by actual confirmed receipts. Final discrepancies need a reason. Overage requires a final receipt. A final zero receipt can close a missing shipment.
- Photos support JPG, PNG, and WebP up to 5 MB, with header validation. They are stored in SQLite and fetched through authorization checks.
- Threshold equality triggers low stock. Null thresholds disable the relevant alert. System totals omit unknown balances and the UI marks incomplete totals as provisional.
- Currency is USD. Unit costs use integer ten-thousandths in SQLite. Missing unit costs and unknown stock make current valuation provisional.

### Counted receipts and reports

- `Đã tính trong phiếu` is a manager operation. It links an actual receipt to the most recent eligible submitted count and records a zero stock delta.
- Linked receipt totals cannot exceed the counted quantity. Transfer linkage also checks that the count was submitted after dispatch.
- Weekly reports identify weeks by Atlanta Monday. For each item/location, the closing count is the last sheet count in the selected week. The opening count is the immediately preceding sheet count, including counts in the same week or across skipped weeks.
- If no prior sheet count exists, a suitable imported opening balance can provide the starting quantity.
- Usage is opening quantity + supplier receipts + transfer receipts − transfer dispatches − closing quantity, between the movement boundaries. Linked counted receipts belong to their count boundary to avoid double counting.
- Missing count boundaries produce unknown usage. Negative usage is flagged for review.
- Report valuation uses current stock and current unit cost even when viewing an earlier week. It is not a historical-price valuation system.
- The current report queries are built around `count_lines`/`count_sheets`. Standalone manager `counts` movements do not create sheet rows. QA should keep this distinction in mind rather than assuming every ledger count appears as a report boundary.

### Authentication, permissions, and switching

- Managers access all five locations, set thresholds/prices, manage catalog/deliveries, inspect history/reports, and reset staff passwords.
- Staff operate at their assigned location. They can submit count sheets and dispatch from that location. They can receive eligible manager-created incoming deliveries/transfers at their destination.
- The original actor's role determines whether a shipment is manager-created. A manager dispatching while switched to staff produces a staff-authored shipment with staff permissions.
- Passwords are salted scrypt hashes. Tokens are random bearer secrets and only their SHA-256 hashes are stored by the backend.
- Native staff login explicitly requests a persistent session. Such sessions have `expires = 0`. Every API request still checks the session row. Web and manager sessions retain a 12-hour expiry.
- Native storage uses Secure Storage 8.0.1 through `Capacitor.nativePromise`, including internal method names. Keychain access value 1 is device-only, with synchronization disabled. Plugin upgrades must account for this pinned bridge contract.
- The storage key includes the backend origin. Changing the backend origin can require sign-in again. Keep app identifiers, signing, and storage namespace stable during ordinary upgrades.
- Capacitor logging is disabled to avoid bridge payload logging. Android backup rules exclude the encrypted preferences file. A revoked backend session stays invalid even if an old token is restored.
- Offline startup retains the token but waits for verification. Explicit offline logout stores a pending-logout record securely, blocks inventory access, and retries server revocation before permitting normal use.
- Manager password reset requires 12–256 characters, rejects the current password, and atomically updates the hash and deletes all sessions for the selected staff account. Other accounts retain their sessions.
- Password-reset idempotency uses a salted fingerprint. Replaying the same confirmed request returns its saved result without revoking newly created sessions again.
- Manager switching uses the manager token plus `X-Staff-Account`. The server verifies the signed-in manager, selects a valid staff account, and uses that staff identity for authorization and stock actions.
- `delegated_actions` stores manager ID, selected staff ID, request key, action, and timestamp. A dedicated UI for inspecting this delegation table has not been implemented.
- Switching mode is client-memory state. Reload re-establishes the actual authenticated user's context. Preserve the current supported staff page during staff-to-staff switching. Returning to manager opens Accounts.

### UI and draft storage

- Current UI follows the existing green/neutral branding and Segoe UI/system typography, device light/dark mode, safe-area spacing, focus behavior, and Vietnamese terminology.
- Manager desktop uses sidebar navigation. Manager mobile uses the `Chức năng` toggle/menu. Staff use three fixed bottom tabs for counts, deliveries, and transfers.
- Shared list pagination stays at 20 rows and hides controls for zero/one page. History additionally uses server batches of 50 ledger entries and a continuation cursor.
- Draft keys include API origin, first catalog item identifier, account, location, and category. Manager-switched drafts add a separate marker. Preserve compatibility with existing keys.
- Category restoration considers available items and location scope. It does not auto-submit a draft.
- The shared performer key is per draft scope and location. It survives category changes and reload. Existing category names provide a legacy fallback. The current behavior retains the shared name after submission until edited.
- History filters include the submitted count performer's name, login account, location, inclusive date range in Atlanta, movement type, and newest/oldest ordering. Each criterion is optional; date-only filtering is supported. The cursor follows movement ID in the selected direction.
- History timestamps use `Intl.DateTimeFormat('vi-VN', { timeZone: 'America/New_York' })`: Vietnamese-style presentation, Atlanta wall-clock time. The server applies the same Atlanta timezone to inclusive `from`/`to` dates. A device set to Vietnam time does not change either behavior.
- History movement labels have distinct semantics: `Kiểm kê` is a standalone manager single-item adjustment; `Phiếu kiểm kê` is a submitted category sheet with performer attribution; `Tất cả kiểm kê` combines both movement types.
- Dirty forms ask before discarding changes. Save/retry feedback and count-draft status should remain visible on narrow screens.

The user's explicit behavior choices above should be carried forward. Changes to stock accounting, role boundaries, native-session lifetime/storage, count submission scope, timezone rules, or draft ownership need a new user requirement rather than an incidental refactor.

## 5. Current Codebase

### Main files and responsibilities

| Path | Responsibility |
| --- | --- |
| `web/app.js` | State, API calls, authentication restore, event handling, dialogs, drafts, lists, staff switching, sequential count submission |
| `web/view.js` | Escaped HTML renderers, navigation, forms/view markup, formatting, history/report/account screens |
| `web/styles.css` | Responsive layout, themes, mobile navigation, tables, dialogs, sticky actions |
| `web/index.html` | App root, module entry, dialog and toast containers |
| `web/config.js` | Browser API-origin configuration |
| `server/http.mjs` | HTTP/static assets, login/logout, bearer authentication, staff delegation, CORS, API dispatch |
| `server/inventory.mjs` | Business actions, authorization, validation, ledger updates, photos, snapshots, history and reports |
| `server/db.mjs` | Schema, additive migrations, transaction helper, password hashing, demo seed |
| `scripts/import-opening.mjs` | One-time validated snapshot import into fresh database and login outputs |
| `scripts/build-mobile.mjs` | Copy web assets into `dist/` and write a validated HTTPS API origin |
| `scripts/open-demo.ps1` | Start/reuse the selected local backend and optionally open the browser |
| `scripts/run-android-local.ps1` | Sync/build Android debug, start/select emulator/device, reverse port, install and launch |
| `scripts/run-web-android-local.ps1` | Open web and Android against the demo backend |
| `Mo-The-Bep.cmd` | Windows web launcher |
| `Mo-The-Bep-Android.cmd` | Windows Android launcher |
| `Mo-The-Bep-Web-Android.cmd` | Combined demo launcher |
| `test/inventory.test.mjs` | HTTP regression tests against disposable in-memory SQLite |
| `scripts/smoke-web.mjs` | Inventory/browser integration smoke, session bridge mocks, account switching |
| `scripts/verify-ui.mjs` | Responsive/theme/large-text/draft/dialog feedback checks with temporary screenshots |
| `capacitor.config.json` | App identity, `dist/` web directory, logging policy |
| `android/`, `ios/` | Native wrappers and platform build configuration |
| `.github/copilot-instructions.md` | Committed branch and integration guidelines |
| `data/` | Local operational/demo databases, snapshot, credentials, and logs, ignored by Git |
| `dist/`, native `public/` directories | Generated web bundles, ignored by Git |

Important native paths include Android's `src/localDemo/` override, `bep_backup_rules.xml`, `bep_data_extraction_rules.xml`, and iOS `App/CapApp-SPM/Package.swift`. The activity/delegate files largely supply the Capacitor shell.

### API surface

| Method and route | Purpose |
| --- | --- |
| `GET /api/health` | Database connectivity check |
| `POST /api/login` | Credentials to a new session, optional native-staff persistence |
| `POST /api/logout` | Revoke the current authenticated session |
| `GET /api/snapshot` | Scoped user, catalog, locations, balances, documents, recent counts, manager account list |
| `GET /api/history` | Manager ledger search with `location`, `before`, `q`, `person`, `from`, `to`, `type`, `order` |
| `GET /api/report` | Manager report with `location` and Monday `week` |
| `GET /api/photos/{id}` | Authorized supplier-receipt photo |
| `POST /api/counts` | Manager single-item count |
| `POST /api/count-sheets` | One category's count sheet |
| `POST /api/thresholds` | Per-location item threshold |
| `POST /api/system-thresholds` | All location thresholds and separate overall threshold |
| `POST /api/prices` | Item's USD unit cost |
| `POST /api/count-units` | Fill a missing stock unit |
| `POST /api/items` | Create catalog item |
| `POST /api/deliveries` | Create supplier order |
| `POST /api/receipts` | Confirm one supplier line receipt |
| `POST /api/delivery-receipts-all` | Confirm remaining delivery lines |
| `POST /api/transfers` | Dispatch one line or multi-item batch |
| `POST /api/transfer-receipts` | Confirm one transfer line |
| `POST /api/transfer-receipts-all` | Confirm remaining lines of a transfer group |
| `POST /api/staff-passwords` | Manager resets selected staff password and revokes its sessions |

Protected endpoints use `Authorization`. Inventory/password actions use `Idempotency-Key`. Manager delegation uses `X-Staff-Account`. Native-origin CORS permits these headers. Login/logout have their own handlers outside the inventory-action dispatcher.

### Database models and relationships

| Table | Role and relationships |
| --- | --- |
| `locations` | Store/warehouse identity |
| `items` | Catalog, units JSON, supplier/pack, optional cost/system threshold |
| `users` | Manager or staff, optional assigned location, password hash |
| `sessions` | Token hash to user, expiry marker, one row per login session |
| `stock` | Composite location/item key, on-hand, threshold, revision, known flag |
| `movements` | Balance ledger, stock composite FK, actor, delta, result, type/reference, timestamp, known flags |
| `deliveries` | Supplier order, receiving location and creator |
| `delivery_lines` | Unique item within delivery, expected and cumulative received quantities |
| `receipts` | Delivery-line receipt, quantity, actor, receiver, optional photo blob/type |
| `transfers` | One item per transfer row, source/destination, sent/received, shortage, close time, optional batch ID |
| `transfer_receipts` | Actual receipts and final discrepancies for transfer rows |
| `requests` | Actor/key composite identity, request fingerprint, saved response for idempotency |
| `delegated_actions` | Manager/staff audit linked to the staff actor/key in `requests` |
| `count_sheets` | Location/category, submitting account, actual performer, note/time |
| `count_lines` | Sheet/item composite identity, before/count quantity, unique movement FK |
| `counted_receipts` | Receipt movement linked to the sheet-count movement and included quantity |
| `opening_balances` | Imported quantity/date per location/item for initial report boundaries |

`openDatabase()` creates base tables, enables foreign keys/WAL/busy timeout, and runs `migrateInventory()`. Migrations inspect existing columns and add fields/tables. There is no migration-version framework. Preserve older database compatibility. Opening a database through this helper can create schema or seed data, so this handoff review did not open operational SQLite files.

### Integration and local run notes

- The Google Sheets integration is a captured JSON snapshot plus importer. The chat previously observed 146 catalog items and matching rows for all five locations. Current live quantities and later catalog changes were not inspected.
- The source sheet is identified in README and the importer. There is no ongoing synchronization service.
- `data/inventory.sqlite` is the imported inventory database. `data/demo.sqlite` is the demo database. Both files exist locally. Their contents were not read for this handoff.
- `data/inventory-logins.json` contains initial credentials only. Password rotation changes the database, so that file is not an up-to-date credential authority. Never copy its contents into chat, docs, code, or PRs.
- Direct `node server/http.mjs` defaults to the demo database and loopback port 4170. The web launcher chooses the imported database on port 4171 when present, unless demo mode is requested.
- The combined web/Android launcher explicitly selects demo mode. Inspect launcher arguments before assuming a running UI uses operational data.
- Android's local-demo override loads a loopback backend page through ADB reversal. Packaged production uses the generated HTTPS API origin.
- On Windows, `npm.cmd start` starts only the web/backend process; it does not build or launch Android. `Mo-The-Bep-Web-Android.cmd` (or `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-web-android-local.ps1`) opens the web UI and Android debug app against the demo backend. `Mo-The-Bep-Android.cmd` launches Android alone.
- The local Android debug WebView loads the running backend's web assets. Browser refresh can pick up changed static JS/CSS, but backend route changes need a Node server restart. If port 4170 is occupied, identify and stop only the intended old listener before starting another server; `EADDRINUSE` means the old server is still active.
- The example HTTPS backend in build documentation is a placeholder. A deployed production origin, TLS setup, signing credentials, and release/distribution status have not been established in this conversation.
- For a future authorized native update, use `npm run build:mobile -- <HTTPS-backend-origin>`, followed by `npx cap sync android` and/or `npx cap sync ios`, then the platform build tools. Preserve existing dependency conventions and review generated-file diffs.

### Environment variable names

Application and build configuration names are `BEP_DB`, `BEP_PORT`, `BEP_HOST`, `BEP_LIVE`, `BEP_ORIGINS`, and `BEP_API_URL`.

QA/browser override names are `BEP_PLAYWRIGHT` and `BEP_CHROME`. Native toolchain names are `ANDROID_HOME` and `JAVA_HOME`. Windows scripts also use standard `USERPROFILE`, `LOCALAPPDATA`, `ProgramFiles`, and `Path` for tool discovery.

This section intentionally records names only. Obtain actual deployment configuration through the user's approved environment.

## 6. Pending Tasks

### Immediate outstanding work

1. If the user still sees lost login on their own Android/iOS device, obtain device/platform/OS, app build/install method, account role, whether it was uninstalled or only swiped/force-stopped, and whether manager reset that password. Reproduce on that device/build. The emulator's native staff token survived force-stop/relaunch; that does not prove the user's build/device follows the same path.
2. Confirm the latest native package is loading the intended backend origin and current web assets. The Android emulator test used the local debug build and backend; physical Android and current iOS lifecycle behavior remain unverified in this cycle.
3. If the history date symptom recurs, verify which process owns port 4170 and restart the Node server after code changes. A second `npm.cmd start` fails with `EADDRINUSE` while an old process is listening; the newly opened browser can otherwise talk to stale backend code.
4. Add committed regression tests for history optional/combined filters, Atlanta date boundaries and pagination. The broader behaviors passed temporary fixtures, but the ad hoc harness is not part of the repository.
5. Preserve and inspect the existing native-file modifications and untracked `.agents/` / `skills-lock.json` before any Git operation; stage only explicitly intended files.

### Remaining release work with incomplete evidence

- Confirm the real backend origin and intended deployment/distribution process if the user asks to release the app.
- Rebuild current code for Android/iOS and verify on physical phones when release validation is authorized. Historical emulator results do not verify later application changes.
- Verify a genuinely version-incremented signed update on devices. Earlier lifecycle checks used in-place installation of the same test artifact.
- Reconcile outdated README verification wording when documentation updates are authorized. No such edits were made in this handoff.

There are no other confirmed user-requested features waiting to be implemented in the available conversation. Do not turn optional future infrastructure or audit UI ideas into mandatory pending features.

## 7. Development Guidelines

### Standing user preferences

- Work within this existing project and inspect current Git changes before editing.
- Use Git to focus on changed/relevant files rather than rereading the entire repository for every task.
- Create a branch from updated `main` named `Minh/<short-description>` for normal changes. Commit and push the feature branch, then merge through a pull request. Do not push unmerged feature changes directly to `main`.
- The user has explicitly requested this assistant to perform tester/end-user checks, including system behavior and usability. Run focused tests when requested; accurately distinguish committed suite results, ad hoc checks, emulator checks, and untested physical-device behavior.
- `.github/copilot-instructions.md` still says to run relevant tests before merging. The later explicit user testing preference controls for this coding agent. Do not silently represent skipped checks as passed.
- Preserve unrelated working-tree edits and operational data. Do not expose passwords, tokens, private credentials, or authentication logs.
- For this specific handoff task, the user narrowed authorization to `PROJECT_CONTEXT.md` only. The ordinary branch/push workflow does not authorize extra changes in this documentation turn.

### Implementation conventions

- Follow the existing ES-module structure and reuse business helpers such as `quantity`, `move`, `allow`, `applyAction`, and `showForm`.
- Keep changes scoped. Avoid opportunistic framework migration, dependency churn, schema rewrites, or broad refactors.
- Use parameterized SQL for user values, escaped HTML through `esc()`, and server-side authorization for every new capability.
- Preserve the API contract for existing callers and handle pre-change databases and drafts.
- Account for partial success, repeated requests, and concurrent stock edits. Keep stock changes and request results consistent.
- Shared rendering replaces much of the DOM. Preserve focus, selected context, async-read guards, and list state when adding UI behavior.
- Reuse the common pagination helper. Preserve mobile overflow handling, safe areas, device themes, and touch-size controls.
- Staff operation scope comes from the backend's effective user, not merely the selected UI location.
- Treat SQL ledger timestamps, entered performer names, submitting accounts, and delegated managers as different facts. Do not conflate them in reports/audits.
- Persistent native tokens belong only in the native secure store. Draft storage may use browser-local storage. Never implement persistent login by saving passwords.

### QA commands for the designated testing agent

Use disposable demo databases or in-memory fixtures. The standard commands are `node --test`, `node scripts/smoke-web.mjs`, and `node scripts/verify-ui.mjs`. Browser tests require Playwright and a compatible browser. The UI verification script writes screenshots to the operating system's temporary directory.

Android verification uses the Gradle tasks for release and local-demo debug builds. iOS requires a supported Xcode/macOS environment and Swift packages. Historic verification workflows are on the separate `Minh/verify-ios-staff-sessions` branch, not in `main`.

Earlier sessions needed elevated tool permission for localhost connections, native builds, Git metadata writes, and external GitHub access in this Windows sandbox. Some tools return a running session ID. Follow the actual current permission rules and command outputs rather than assuming the old environment is unchanged.

The connected GitHub tool previously returned integration-permission errors for creating PRs. Authenticated Git and Git Credential Manager on the machine provided a working fallback. Never print credential-helper output or embed credentials in command text.

## 8. Recommended Next Steps

| Priority | Recommended action | Reason |
| --- | --- | --- |
| 1 | Reproduce the reported native session loss on the user's actual device/build if it persists | The API 36 emulator passed, but the user's device report is still open |
| 2 | Add committed tests for optional history filters, Atlanta date boundaries, and pagination | Current focused coverage was temporary and is not retained in the test suite |
| 3 | Verify native bundle freshness and current platform builds before distribution | Later web/backend changes postdate some historical native verification |
| 4 | Clarify production configuration/signing only when deployment work is requested | The production target and signed release process remain unknown |

This roadmap prioritizes verification and continuity. It does not approve new product features, production data changes, or deployment.

## 9. Context for the Next Codex Session

The latest application commit is merged `8efb6f4` (PR #7). It preserves the staff page on account switching, shares the count performer across categories, and adds actual-performer history filters. The implementation is in `web/app.js`, `web/view.js`, `server/http.mjs`, and `server/inventory.mjs`.

Most recent QA on that commit and subsequent cleanup: 17/17 API tests, `scripts/verify-ui.mjs`, `scripts/smoke-web.mjs`, and Android `:app:assembleDebug` passed. Focused ad hoc history checks covered independent date filtering, Atlanta/DST boundaries, timezone independence from the device, combined criteria, and >50-row pagination. Android native staff login was verified on the API 36 emulator to survive force-stop/cold relaunch with the same secure token. The user's separate device report remains open until reproduced on their device. See section 3 for exact evidence and section 6 for actionable tasks.

The prior date-filter complaint likely involved a stale backend process: current UI and current backend passed 19-Nov-only filtering, while the port-4170 listener at the time predated the backend filter change. Restart the backend after changes; do not start a second server on an occupied port.

At session start, inspect the latest user request and `git status`; preserve the three native-project modifications and untracked `.agents/` / `skills-lock.json` unless directed otherwise. Use a fresh `Minh/` branch based on current `main` and stage only intended files. This context document contains no credentials. Production deployment, current physical-device behavior, and unreported QA outcomes remain unknown.
