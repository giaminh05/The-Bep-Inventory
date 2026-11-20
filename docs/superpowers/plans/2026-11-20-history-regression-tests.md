# History Regression Tests Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved test-only change.

**Goal:** Retain regression coverage for optional history filters, Atlanta dates, and pagination.

**Architecture:** Exercise the real HTTP server with an isolated in-memory SQLite database per test. Use API-created count sheets for performer attribution and deterministic database fixtures for timestamps and larger ledgers. Keep production source unchanged.

**Tech Stack:** Node test runner, built-in fetch, node:sqlite.

**Spec:** PROJECT_CONTEXT.md sections 4, 6, and 8; user-approved recommendation to add history regression tests.

## Global Constraints

- Preserve operational data, credentials, configuration, and unrelated staged skills.
- Work on `Minh/history-regression-tests` in the existing checkout, as approved.
- No production behavior changes, dependencies, or framework migration.
- Business dates are inclusive calendar days in `America/New_York`.

## Review Focus

- Blank filters must behave like omitted filters.
- Performer search must include actual count performer and submitting account.
- Independent date limits must not require the other limit.
- Invalid dates, ranges, types, order, and cursors must return 400.
- Staff must not obtain the manager ledger, including with filters.

### Task 1: HTTP history regression coverage

**Files:** Create `test/history.test.mjs`; no production files modified.

**Interfaces:** Consume `openDatabase(':memory:', { demo: true })` and `inventoryServer({ db })`. Exercise `GET /api/history` with bearer authentication; assert exact movement IDs, attribution, and continuation cursors.

- [x] Add optional/combined filter tests using count sheets, single-item counts, supplier receipts, and decoy rows.
- [x] Add fixed winter/summer and spring/fall DST date fixtures, including the two repeated fall-back clock times.
- [x] Add 123 matching rows interspersed with nonmatches; follow returned cursors to exhaustion in newest and oldest order and assert no gaps or duplicates.
- [x] Add validation and staff-authorization cases.
- [x] Run focused tests and the full API suite. Existing behavior should pass; failures trigger investigation before any product change.
- [x] Run the focused suite with device/process timezone `Asia/Ho_Chi_Minh` to check independence from local timezone.
- [x] Review assertions against representative regressions: ignored filters, UTC date filtering, reversed sorting, or inclusive cursor comparison must be detected.
- [ ] Commit only the test and this plan; preserve the pre-existing staged index entries.

This is coverage of existing behavior, not a feature implementation; no artificial production change will be made to create a failing test. The prior review established a passing baseline of 17 API tests and the browser smoke suite.

## Verification record

- Focused history suite: 5/5 passed, including with `TZ=Asia/Ho_Chi_Minh`.
- Full API suite: 22/22 passed.
- Temporary copies of the backend were mutated independently for each of the four representative regressions above; assertions caught all four. Original production files were unchanged, and the temporary fixtures were removed.
- Independent review: no actionable findings.
- Scope: only this plan and `test/history.test.mjs`; the existing 297 staged skill files remain outside this change.
