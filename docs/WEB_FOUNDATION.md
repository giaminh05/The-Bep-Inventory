# M2 Web and shared-package foundation

Date:2026-11-20. Baseline: `25ac7a5`. User approved the shared TypeScript/API layer followed by the Next.js foundation. Implementation covers S01, S02 and W01. W02 authentication/session/draft-origin migration and M3 inventory screens are not part of this slice.

## What runs beside legacy

- Existing `server/`, `web/`, `android/` and `ios/` remain in place and unchanged. Root `npm start` and mobile build commands retain their existing meaning.
- `packages/contracts` describes actual API response shapes with Zod4.6.7 and inferred TypeScript types. It preserves null unknown quantities, numeric0/1 flags, optional manager fields and additional server fields. Mutation types describe the wire API; they do not introduce new runtime business restrictions.
- `packages/api-client` provides storage-free `createInventoryClient`, with per-request credentials, no-store transport, default20s timeout, cancellation and safe errors. The caller owns every mutation key/payload and uncertain-outcome decision; there are no automatic retries or generated keys. Read/auth responses are runtime-validated; mutation results currently use the typed action result map.
- `packages/domain` contains pure, parity-tested scaled-quantity, Atlanta-day/week and usage helpers. The legacy backend remains authoritative and does not import or replace its implementation with these helpers yet. Count-boundary selection, SQL transactions and authorization stay on the server.
- `apps/web` is Next16.4.6/React19.3.1/TypeScript5.9.3/Tailwind4.3.5. Routes `/`, `/preview/manager`, `/preview/staff` show Vietnamese, read-only layout previews, empty states and an optional health check. Preview role links grant no privileges and do not access inventory. Small reusable UI primitives expose shadcn-compatible semantic tokens; no dialog/component runtime is added without a real need.

This foundation does not migrate authentication, credential storage, count drafts, forms, reports or stock writes. Existing operational screens remain the way to perform inventory work. No React Native/Expo client, native storage bridge or live deployment was created.

## Workspace and reproducible tooling

The repository already had `pnpm-lock.yaml` format9; pnpm10.34.9 is pinned in `packageManager` to retain that format. The machine initially had no pnpm executable, so root convenience commands invoke the pinned version through `npx`; no global package-manager installation is needed.

```powershell
npx --yes pnpm@10.34.9 install --frozen-lockfile --ignore-scripts
npm run web:dev
```

Open `http://localhost:3000/`. Use workspace/root scripts rather than invoking the Next CLI with the repository root as its working directory; the app configuration and TypeScript helper imports are evaluated in `apps/web`.

New package versions are exact. Existing root dependency ranges and resolved Capacitor core/android/ios/CLI8.6.0, secure-storage8.0.1 and Playwright1.65.0 are preserved. No `package-lock.json` was introduced. TypeScript5.9.3 and the compatible ESLint9 toolchain are pinned for this initial integration rather than moving to newer compiler/package-manager majors simultaneously. Native build compatibility after the workspace installation has not been rerun; no native project files were changed.

`npm test` explicitly runs legacy `test/*.test.mjs`; otherwise recent Node versions also discover TypeScript package tests without their intended runner. Shared tests use `tsx`; this is a test-runner boundary, not a reduction of the existing suite.

## Explicit environment selection

No backend is selected by default. The unconfigured Web build displays that state, sends no inventory request, stores no credentials and offers no fake login or data-entry form.

For an authorized environment, set **server-only** `BEP_API_ORIGIN` in `apps/web/.env.local` or the process environment. Use an HTTPS origin or HTTP loopback; no credentials, path, query, fragment or whitespace. See `apps/web/.env.example`. Do not commit `.env.local`, actual secrets or production configuration.

The same value must be present for the production build and start:

```powershell
$env:BEP_API_ORIGIN = '<EXPLICIT_AUTHORIZED_API_ORIGIN>'
npm run web:build
npm run web:start
```

Remove the variable to build the unconfigured preview. A changed origin requires a new production build because Next captures rewrites and static route output. Same-origin `/api/:path*` rewrites forward to the selected existing API; backend code/CORS/auth rules are unchanged. The only current UI call is uncached health, once per mount with manual retry. Health availability is not authentication or inventory access.

Next routes are compatible with a future Vercel app-root build; no Vercel project, hosting setup, production origin or deployment was created. SQLite is still outside the Next app.

## Verification commands and evidence

```powershell
npm test
npm run test:shared
npm run test:web-config
npm run typecheck
npm run web:lint
npm run web:build
npm run test:web-foundation
node scripts/smoke-web.mjs
node scripts/verify-parity.mjs
node scripts/verify-ui.mjs
```

M2 verification:

- Legacy API/database tests:34/34 passed.
- Shared contract/client/domain tests:14/14 passed. Real HTTP/memory DB cases include manager/staff/delegation, null/zero/flags, denied statuses, same-key replay, photo and transfer documents, and legacy parity helpers. `countSheet:null` is retained for real receipt inputs.
- Origin and fixture-environment tests:4/4 passed, including malformed origin syntax that `URL()` would otherwise normalize away and actual Next dotenv precedence with temporary `.env.local`/`.env.production` files.
- Workspace/Web typechecks, Web ESLint and optimized production build passed.
- `verify-next-foundation.mjs` builds both unconfigured and explicitly configured variants against an owned in-memory backend. It verifies no default connection/storage, routes, mobile/desktop navigation at320/390/1440px, five locations, no inventory inputs, dark mode,125% text, skip link, health no-store, real backend outage/restart/manual retry,404 behavior and no inventory/session writes. Screenshots are in OS temp.
- Existing browser smoke, parity and UI suites passed after the workspace installation.
- Independent shared-package review found no new blocking issues; root corrected the default timeout to the legacy20s and permitted null receipt linkage before final checks.
- Final review found that deleting a fixture's backend environment key still allowed Next dotenv fallback. A new test reproduced selection of the canary file's origin; the harness now supplies an explicit empty value for unconfigured builds. The regression passed after the fix, followed by typecheck/lint, the complete legacy/shared suites and the production browser harness. No real environment file was read or overwritten for the regression fixture.

The foundation browser script rebuilds `apps/web/.next` for fixture origins; do not deploy or manually reuse that build as an environment-specific release. Rebuild explicitly for your intended origin afterwards. Fixtures never open `data/` or infer `BEP_DB`; generated images and test servers are temporary.

Runtime execution of the framework error boundary, signed native builds, actual devices, multi-process backend scaling, origin draft transfer and production deployment remain unverified/unimplemented at their later gates. M2 foundation completion is not migrated workflow parity or production readiness.

## Next approved-scope boundary

Present W02 as the next concrete slice: login/logout/delegation, session lifetimes,401/403 behavior, per-account draft ownership and a separately designed old-origin draft handover. Native spike approval and production environment/signing approval remain separate. No implicit cookie/BFF conversion, outbox, realtime sync or new conflict policy follows from this foundation.

Reference docs checked2026-11-20: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Tailwind Next/PostCSS](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [shadcn manual setup](https://ui.shadcn.com/docs/installation/manual). Exact package versions/engine/peer metadata were checked against the npm registry before installation.
