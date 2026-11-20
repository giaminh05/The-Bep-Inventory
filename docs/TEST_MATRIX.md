# Regression test matrix

M1 baseline; last reviewed2026-11-20. Repository/Git text uses English; application labels in tests remain Vietnamese. All commands below use disposable fixtures and must not be redirected to operational databases.

## Retained automated checks

| Layer / command | Coverage | Expected evidence | Limits |
| --- | --- | --- | --- |
| `npm.cmd test` (Windows) / `node --test` | Inventory API, history, concurrency, file-backed backup/restore/schema recovery | All discovered tests pass; exact count recorded in the context after the run | HTTP concurrency is one synchronous backend process; does not prove multi-writer HA |
| `node --test test/concurrency.test.mjs` | Six count/dispatch/receipt/category/count-linkage regressions | 200/409 outcomes plus stock, revision, document, ledger and idempotency assertions | Memory SQLite, not durability |
| `node --test test/history.test.mjs` | Five filter/Atlanta/DST/pagination/validation/authorization regressions | Exact IDs/cursors and attribution | Browser date rendering is separately checked |
| `node --test test/db-compatibility.test.mjs` | Online backup with active WAL, fresh-output safety, restore/reopen, supported old schema and hard-exit recovery | SQLite integrity/FK checks and canonical data reconciliation | Temporary files; not production backup certification or disk/power-loss testing |
| `node scripts/smoke-web.mjs` | Existing manager/staff inventory flows, search/pagination, photos, reset/delegation and native-session bridge mocks | PASS and no page errors | Mock secure storage is not real Keystore/Keychain |
| `node scripts/verify-ui.mjs` | Light/dark,320/390px, large text, draft restoration, dialog dismissal and refresh errors | PASS; temporary screenshot directory | Screenshots are review artifacts, not proof of operational efficiency on every phone |
| `node scripts/verify-parity.mjs` | Offline edit/reload; two-client stale revision; account/delegation draft isolation; partial queue retention; lost committed response/retry | Three PASS scenarios, UI outcomes plus real DB assertions | Current web client only; intercepted lost network response is deliberate fault injection after real server commit |
| Playwright MCP | Focused interactive checks against disposable server | Scenario/build/env and observed results recorded in context | Browser tool response is not evidence for installed APK/IPA |

Browser scripts use installed Playwright/Chromium. Existing overrides: `BEP_PLAYWRIGHT` where supported and `BEP_CHROME` for the browser executable. No new dependencies or package-manager migration are required by M1. Browser profiles/screenshots and file DB fixtures are temporary, outside operational data.

## Required platform and role matrix

| Client | Manager | Direct staff | Manager acting as staff | Offline/resume | Migration sign-off |
| --- | --- | --- | --- | --- | --- |
| Current desktop/mobile browser | API+smoke/UI | API+smoke/parity | API+smoke/parity | Open-form draft tests; no cold-start offline inventory | Legacy baseline only |
| Current Android Capacitor | Shared source, physical acceptance pending | Historical emulator storage/lifecycle checks only | Shared server checks, physical pending | Native bridge mock in browser; physical current build pending | Not signed off for replacement |
| Current iOS Capacitor | Shared source, physical acceptance pending | Historical macOS/Simulator checks only | Shared server checks, physical pending | Native bridge mock in browser; physical current build pending | Not signed off for replacement |
| New Next.js Web | Pending | Pending | Pending | Pending legacy-origin draft transition | No client implemented |
| New Android RN/Expo | Pending G3 | Pending G3 | Pending G3 | Token/draft/tombstone upgrade and rollback tests required | No client implemented |
| New iOS RN/Expo | Pending G3 | Pending G3 | Pending G3 | Keychain/draft/signed-update compatibility required | No client implemented |

For every supported role, pair a valid location with a denied location and assert server responses, not merely hidden buttons. Also test session revocation, changed context while a read is pending, explicit logout, blank/zero/unknown quantities, missing units/prices, partial receipts, batch rollback and count boundaries.

## Failure and environment matrix

| Condition | Existing retained oracle | Remaining gate |
| --- | --- | --- |
| Two users count the same revision | Exactly one count commits; loser409, no partial rows | Multi-process/load characterization before scaling backend |
| Two users dispatch scarce source stock | Winner batch commits, loser rolls back every line; stock never negative | Staging concurrency/load and lock handling |
| Duplicate transport request | Same actor/key/payload returns saved response and one movement | Durable cross-restart client operation identity is not implemented or newly approved |
| Server commits, response is lost | Same-dialog retry succeeds using existing result; draft cleared after confirmation only | App-kill after ambiguous response remains a documented limitation |
| Offline after form load | Local draft remains, no automatic write; stale revision requires re-entry | Cold-start offline catalog/outbox/auto-merge are outside approved parity |
| Reconnect / other device writes | Manual refresh detects changed revision; old draft is preserved | Three real binaries/WAN staging matrix at N04 |
| Vietnam locale/timezone vs Atlanta business days | History/API fixtures and browser timezone settings | Native date picker/format/device acceptance |
| Backup during committed WAL state | New backup restores data and passes integrity/FK checks | Approved operational backup owner/schedule/retention/RPO/RTO and restore drill |
| Process exits after committed writes | Disposable child process recovery and repeated online backup | Actual power loss, disk-full, filesystem corruption and disaster recovery not certified |
| Supported old schema opens twice | Additive migration preserves fixture rows without duplicate migrations | Inventory of actual operational schema versions before any live migration |
| Signed native update / rollback | No new M1 device test | Android Keystore/iOS Keychain plus edited drafts/token/logout state on physical phones; no uninstall shortcut |

## Execution and review record

Verified on2026-11-20 with Node26.13.0 on Windows:

- Full API/file database suite: **34/34 passed** (17 original inventory,5 history,6 concurrency,6 file-backed database/recovery tests).
- Existing browser smoke and UI verification: **passed**.
- New browser parity script: **3/3 scenarios passed**.
- Playwright MCP: offline draft restored after reconnect/reload; explicit submission applied once, stock27 and one sheet; no page errors.
- Two deliberate regressions in temporary copies of `web/app.js` were caught by the browser parity script: retaining a confirmed draft and allocating a new key for an uncertain retry. The working application source was not modified; temporary copies were removed.
- Independent review identified a source-sidecar output-path flaw in the new backup helper. A regression failed first; the guard was fixed, the DB suite passed6/6, and the full suite passed34/34. Source-sidecar names are not safe backup filenames even when they do not currently exist.
- Operational data, current native projects, dependencies and deployment infrastructure were unchanged. Current physical-device/native signed-update checks remain pending.

Run focused checks while developing, then one complete API suite and the relevant browser suites for final verification. Capture command, exit status, test count, source commit and evidence limits in `PROJECT_CONTEXT.md`; do not report partial output as a completed suite. Tests may fail initially for harness reasons: record the cause and rerun without weakening business assertions.

M1 adds characterization coverage around existing production behavior; it is not a Next.js/Expo implementation. Before each new migration slice, use [FEATURE_PARITY.md](FEATURE_PARITY.md) as the acceptance oracle and [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for approval gates. Before live recovery, follow [BACKUP_RESTORE.md](BACKUP_RESTORE.md) and obtain the separate operational approval.
