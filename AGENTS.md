# The Bếp Inventory Development Instructions

## Language and communication

- Communicate with the user in Vietnamese, including progress updates, explanations, approval questions, and completion reports. Switch chat to English only when explicitly requested.
- Use English for repository and Git/GitHub work: documentation (including `AGENTS.md`, `PROJECT_CONTEXT.md`, audits and plans), code comments, commit messages, pull request titles/descriptions, and GitHub text. This permanent policy records the user's correction on November 20, 2026. Preserve framework names, paths, APIs, identifiers, and programming syntax.
- Source code, variables, functions, and APIs follow English naming conventions. Product UI remains Vietnamese under the existing business requirements.
- Explain technical decisions, risks, and deployment steps to the user in clear Vietnamese; distinguish verified facts, source-based inferences, and proposals.
- Each milestone report covers completed work; migrated features, if any; changed files; tests and verified workflows; updated documentation; remaining issues/risks; and next steps.

## Start of each session

1. Read `PROJECT_CONTEXT.md`, then `docs/MIGRATION_PLAN.md` for migration work; read README, `.github/copilot-instructions.md`, and relevant instructions.
2. Check current Git status, branch, history, and diff. Do not treat handoff status as current Git status.
3. Read relevant code, schema, and tests before editing. Confirm behavior from actual source and executed checks.
4. Break large requests into smaller tasks with dependencies, acceptance criteria, and tests. Present major architectural decisions for user approval before implementation.

## Current migration authorization

- On November 20, 2026, the user approved option A and M1 (G1/G2): incremental migration retaining the API/SQLite backend and legacy clients, starting with behavioral regression tests, parity evidence, and disposable-data backup/restore rehearsal.
- M0 documentation is complete; M1 is in progress. M1 permits necessary regression tests, disposable fixtures, backup/restore tooling, and related documentation. It does not authorize Next.js/Expo UI implementation, dependency installation/upgrades, application behavior changes, production schema/data changes, native project changes, or deployment configuration changes.
- Do not scaffold Next.js/Expo, run `cap sync` or `expo prebuild`, or deploy without the applicable later approval. M2+ tasks retain their scope/dependency gates; choosing option A does not authorize every planned task.
- Reading status and testing disposable data are permitted; do not test writes against the operational database.
- Documentation or M1 approval does not authorize production deployment, real-data changes, or business policy changes.

## Tools and process

- Use Superpowers where relevant: brainstorming/architecture before major changes, writing-plans for plans, systematic-debugging for failures, TDD for behavior changes, and verification-before-completion before success claims.
- Use subagents for independent work when useful; give each task explicit scope and write ownership, avoiding shared-file edits.
- Apply Vercel React/Next.js best practices when React/Next.js source exists. The current application uses plain JavaScript; framework rules are not a reason to rewrite it.
- Apply React Native/Expo best practices after mobile migration approval, along with suitable mobile design guidance. Do not use shadcn/ui or DOM elements as native components.
- Use Playwright MCP for relevant browser testing together with existing Playwright suites. A mocked Capacitor bridge is not native-device evidence.
- Use suitable Android emulators/devices, ADB, and Gradle. For iOS use Xcode, Simulator/devices, or a macOS runner. Verify native lifecycle on actual signed builds before release.
- Verify current official framework documentation when selecting versions, minimum OS, or deployment architecture; record dates and sources. Do not install/upgrade dependencies during an audit.

## Preserve business behavior and data

- Preserve all five locations: Duluth, Johns Creek, Norcross, Kho DL House, and Kho Extra; retain backend manager/staff scope enforcement.
- Do not change workflows, formulas, conversions, permissions, session lifetimes, draft ownership, or conflict handling without approval.
- Keep `known=false` distinct from zero and a blank count distinct from entering `0`; preserve item-specific units and precision.
- Preserve `revision`, transactions, the ledger, `Idempotency-Key`, server validation, and actor auditing. Do not move stock-write authority to clients.
- Each category count is currently one transaction; submitting several categories can partially succeed. Do not silently make the queue all-or-nothing or auto-merge it.
- Do not introduce last-write-wins, add competing counts together, an automatically sending outbox, approval workflows, or realtime sync. These require separate business design/approval.
- Business timezone is `America/New_York`; user communication timezone is `Asia/Bangkok`. Reports retain current count-sheet boundaries rather than calendar-week snapshots.
- Maintain old-client APIs during migration; preserve payload/key when retrying an uncertain outcome. Idempotency does not deduplicate every newly generated key.
- Do not reset, overwrite-import, or delete databases, edit old ledger entries, or make incompatible schema changes without explicit approval.
- Before real-data changes, obtain a verified, consistent SQLite backup including committed WAL data and restore-test a copy. A Git checkpoint does not replace a database backup.
- Native tokens belong in secure storage; do not store passwords to keep users logged in. A Capacitor-to-RN transition must prove token, pending-logout, and draft continuity; do not assume Expo SecureStore can read the old vault.
- Never print or include credentials/tokens, login files, or authentication logs in chat, documentation, commits, or PRs. Record environment variable names only; never expose secret values even if a tool example does so.

## Git and change safety

- Preserve `.github/copilot-instructions.md`: new branches from `main`, named `Minh/<short-description>`; never use `Codex`/`Copilot` prefixes.
- Commit/push feature branches and integrate through pull requests; do not push unmerged feature work directly to `main`. Retain architecture and production approval gates.
- Propose an isolated branch/worktree for migration; do not move or discard user changes. Stage/commit only task paths; do not use `git add .` when unrelated changes exist.
- `.agents/` and `skills-lock.json` may contain previously staged customization; do not include them in application commits unless requested.
- Avoid unrelated changes, wholesale framework rewrites, dependency churn, and hand edits to generated files. Ask before destructive actions or major architecture changes.
- UI/code rollback must retain transactions created after rollout. Do not restore an old database merely to roll back a UI.

## Testing and documentation

- Run appropriate checks before claiming completion; report failures and unrun checks. API suite: `npm.cmd test` on Windows or `node --test`.
- Browser suites: `node scripts/smoke-web.mjs`, `node scripts/verify-ui.mjs`. Use `:memory:` or disposable fixtures, never the operational database; keep QA images in temporary storage.
- Regression coverage must address counts, unit conversion, stale revisions, concurrent writes, idempotency, authorization, partial receipts/transfers, counted receipts, history/Atlanta/DST, reports, and network failures.
- New shared-logic unit tests require parity fixtures against the old implementation; add DB/API integration tests and native tests for secure storage, force-stop/reboot/update/logout.
- Distinguish new checks from historical evidence, in-memory tests from restart persistence, browser mocks from native execution, and simulators from physical devices.
- Update `PROJECT_CONTEXT.md` and task status in `docs/MIGRATION_PLAN.md` after meaningful implementation changes or milestone completion. Minor formatting/cosmetic changes may omit this.
- Do not claim migration completion from source or mockups alone; verify the relevant platform parity checklist and record every deviation.
