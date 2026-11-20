# Inventory wire contracts

Runtime Zod schemas and inferred TypeScript response types describe the existing API emitted by `server/http.mjs` and `server/inventory.mjs`. Objects preserve additional server fields. Schemas do not coerce quantities, dates, or boolean flags.

- Unknown quantities remain `null`; known zero remains `0`.
- SQLite flags (`known`, `manager_created`, `has_photo`, transfer receipt `final`, and history known flags) remain numeric `0 | 1`.
- Derived flags (`low`, `system_low`, report `opening`) remain booleans.
- Staff snapshots omit manager-only item costs/system thresholds and `accounts`.
- Dates remain the exact server strings. Atlanta business dates and report boundaries stay authoritative on the server.

`ActionInputs`/`ActionResults` map every existing mutation endpoint. These types guide callers without introducing new runtime business validation. Server revision checks, authorization, unit conversion, transactions, and idempotency remain authoritative. Mutations are not parsed by response schemas in this foundation stage; their generic result type reflects the selected legacy action.

Integration tests in `@bep/api-client` exercise these schemas against the unchanged HTTP server using disposable in-memory SQLite fixtures.
