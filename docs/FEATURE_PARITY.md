# Feature parity baseline

Baseline application: `a8b2d0b`. Milestone: M1. Approved architecture: option A, incremental clients with the existing Node/SQLite authority. This checklist describes current behavior to preserve; it does not approve new workflows or claim any feature has migrated.

## Evidence labels

- **API tested**: the stated scenario is exercised through the real HTTP server against disposable SQLite.
- **Browser tested**: Playwright exercises the current `web/` client with disposable data; this is not proof of native storage.
- **Source only**: implementation inspected, scenario not exercised by the retained tests listed here.
- **Historical native**: earlier build/lifecycle evidence recorded in `PROJECT_CONTEXT.md`, not the latest signed device release.
- **Pending migration**: the replacement client does not exist yet; no parity sign-off.

## Workflow acceptance checklist

| ID | Workflow and immutable acceptance criteria | Retained evidence | Android/iOS boundary | New client status |
| --- | --- | --- | --- | --- |
| F01 | Manager catalog creation; duplicate validation; independent items unknown at all five locations; delivery-created item known-zero only at its destination | `test/inventory.test.mjs`: standalone catalog and delivery catalog creation; browser catalog flows in `scripts/smoke-web.mjs` | Shared WebView implementation; actual native form/device acceptance pending | Pending migration |
| F02 | Item-specific unit factors; scale1000; up to three decimals; whole `each`; missing-unit repair only for an empty base unit | Inventory tests for cases, transfer units and invalid input; source `quantity()`/`count-units` | Same server validation on all clients; no local native authority | Pending migration |
| F03 | Five locations; unknown differs from zero; low-stock at or below threshold; null disables; system threshold separate from per-location sums | Inventory threshold/system-total tests; browser stock/threshold smoke | Same API; native latest physical checks pending | Pending migration |
| F04 | Blank count leaves stock; zero counts empty; drafts keep owner/location/category/unit/revision; shared performer survives category changes; delegation drafts remain separate | Inventory partial sheets; smoke/UI drafts; `scripts/verify-parity.mjs` offline persistence and account/delegation isolation | WebView localStorage does not automatically migrate to RN storage | Pending migration |
| F05 | One confirmation sends counted categories sequentially; one category is atomic; confirmed categories remain committed when another conflicts; preserve unconfirmed drafts | `test/concurrency.test.mjs`: later category conflict; `scripts/verify-parity.mjs`: partial multi-category submission and lost committed response | Queue/key survive same-dialog retry, not a process restart; preserve this boundary | Pending migration |
| F06 | Manager-only standalone adjustment checks revision; conflicting counts must not overwrite another movement | Inventory stale-count tests; concurrency same-revision count sheets; browser stale draft rejection | Manager native has the same server role rules; do not silently omit manager functions | Pending migration |
| F07 | Manager supplier orders contain 1–50 unique lines; creating an order does not increase stock | Inventory multi-item delivery/catalog tests; browser autocomplete/new item flows | Shared rules; native file picker not involved until receipt | Pending migration |
| F08 | Partial supplier receipt increases only confirmed actual amount; cumulative cannot exceed expected; receiver required; photo validation/authorization; receive-all verifies remaining snapshot | Inventory partial/photo/invalid rollback/idempotency tests; browser receiving/photo smoke | Actual camera/library permission handling on signed Android/iOS pending | Pending migration |
| F09 | Dispatch deducts source immediately, never destination; known sufficient stock; multi-item batch atomic; staff source scoped | Inventory transfer/batch tests; concurrency competing batches verifies no orphan documents/ledger | Shared API; not proof of multiple backend processes writing one file | Pending migration |
| F10 | Actual destination receipts, partial in-transit quantity, final shortage/overage reason, final-zero closure and receive-all behavior | Inventory shortage/overage/batch and recipient-authorization tests; browser transfer smoke; edge cases not present in those tests remain source-only | Staff may receive only manager-authored incoming shipments at its location | Pending migration |
| F11 | Counted receipt records actual quantity with stock delta0; linked totals bounded; newest count across standalone/sheet types must be an eligible sheet; transfer date rule differs from supplier | Inventory counted-receipt reports; concurrency later standalone count invalidation; source for supplier/transfer timestamp asymmetry | Do not tighten the supplier timestamp rule as an incidental port | Pending migration |
| F12 | Manager-only history: optional/intersecting filters, actual performer vs actor, Atlanta inclusive days/DST, movement-ID ordering, 50-row cursor and 20-row UI pages | Five tests in `test/history.test.mjs`; browser history/search/pagination smoke | Device locale/timezone must not redefine the business date | Pending migration |
| F13 | Atlanta Monday week; ending latest selected-week sheet, beginning immediately preceding sheet/opening fallback; usage formula and counted receipts; current stock/current USD valuation | Inventory Atlanta/report/counted receipts tests; source and audit formula; browser reports smoke | Standalone manager count is not a sheet report boundary | Pending migration |
| F14 | Web/manager sessions12h; native staff indefinite but server-revocable; native verify before use; pending offline logout blocks access; same-dialog uncertain save reuses operation | Inventory auth/session tests; native bridge mocks in smoke; parity lost-response replay | Keystore/Keychain bridge, force-stop/reboot/signed update require native evidence; historical evidence is limited to recorded revisions | Pending migration |
| F15 | Manager reset revokes only selected staff sessions; repeat reset key does not revoke fresh sessions again; delegated staff permissions/audit; preserve staff tab and return manager context | Inventory account/reset/delegation tests; browser smoke and parity delegated-draft isolation | New mobile must transfer token and pending logout without reviving revoked state | Pending migration |
| F16 | One-time captured Sheets import only into new outputs; preserve unknown units/counts/opening boundaries; never overwrite operational files | Importer source review; not rerun in M1, existing data untouched | Operator CLI, not a mobile workflow; no live sync assumed | Pending migration |
| F17 | Export and approval are absent; submitted counts apply directly; do not invent approval states or exports under parity | API/client inventory and source audit | Absent on all clients, not a migration requirement | No new feature approved |
| F18 | Vietnamese UI; staff three tabs, manager responsive menu; keyboard/focus/touch/safe areas; device theme/large text; loading/error feedback; no page-wide horizontal overflow | `scripts/verify-ui.mjs`, smoke, parity mobile390px | Native navigation/keyboard behavior needs device acceptance after migration | Pending migration |

## Canonical fixtures and outcomes

- Demo stock at Duluth: green-tea24 bags, tapioca14 bags, cups900 each. Case mappings remain item-specific. Fresh test servers use `:memory:` and the existing demo seed.
- Two sheets with revision0 and distinct keys: one200, one409; exactly one sheet/line/movement/request and one revision increment.
- Two batches each dispatching topping1 and tea20 from Duluth: only one commits; tea4 and topping13 remain; no destination stock increase or losing-batch orphan rows.
- Supplier receipt5/12 bags: add5 once, outstanding7; simultaneous same-key requests return the same result. Changed quantity with the same key returns409 with no writes.
- Partial client queue: tea27 commits; a competing manager count sets topping16; pending topping13 is rejected and its original draft/revision retained. No rollback of the tea count.
- Lost successful tea29 response: the draft remains until retry; retry confirms the same operation, with exactly one sheet/movement/request/revision increment.
- Offline open form: tea27 and performer persist locally; reconnect/reload does not submit; manager count30 followed by staff refresh marks draft stale. Other account/delegation does not inherit it.
- History fixtures and Atlanta boundaries are literal test inputs in `test/history.test.mjs`, including both fall-back01:30 instants and123 matching rows.
- File-backed backup/schema/crash fixtures are defined in `test/db-compatibility.test.mjs`; recovery does not use `data/`.

## Approval and deviation log

| Date | Item | Decision |
| --- | --- | --- |
|2026-11-20|G1/G2|User approved option A and M1; no production changes, native rewrite or new conflict/offline policy approved|
|2026-11-20|Language|Repository documentation and Git/GitHub metadata in English; user chat in Vietnamese; Vietnamese application UI preserved|
|2026-11-20|M1 behavior|Characterization coverage only; no intentional inventory workflow changes|

For every migration deviation, add workflow ID, platform/build/environment, expected/actual result, reproducible evidence, severity, owner and explicit approval. A green baseline suite alone does not sign off the replacement UI. Never change expected results to hide a changed business calculation.
