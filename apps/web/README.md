# Web foundation (W01)

This workspace is the incremental Next.js App Router foundation. The operational plain-JavaScript clients and API/SQLite backend remain authoritative. W01 introduces no inventory, authentication, or draft migration and does not replace the existing application.

## Run locally

From the repository root, install with the pinned pnpm workspace tooling and run:

```powershell
npm run web:dev
```

Open `http://localhost:3000`. Routes are `/`, `/preview/manager`, and `/preview/staff`. Preview links only select a layout; they grant no manager or staff privileges. The previews contain no inventory quantities, authenticated fetches, mutation controls, or storage access.

An unset `BEP_API_ORIGIN` deliberately selects no backend. To check health against an explicitly chosen disposable local or otherwise approved environment, copy `.env.example` to `.env.local`, set the server-only variable, and restart Next.js. Only HTTPS origins or loopback HTTP origins are accepted; credentials, paths other than `/`, query strings, and fragments fail configuration validation. No production origin is supplied or inferred. Never store credentials in the variable.

`next.config.ts` rewrites same-origin `/api/:path*` requests to the selected backend. For production, set the same `BEP_API_ORIGIN` explicitly at build time and when starting the application. Rewrites and preview connection status are captured during the build, so changing the origin requires rebuilding before restarting. The browser health island calls `createInventoryClient({ baseUrl: '' }).health()`, which uses uncached transport. It checks once per mount and permits manual retry after a failure; there is no polling. Health success indicates API availability only, not authentication or inventory access. The selected backend also supplies the explicit link to the existing application. Backend source and CORS settings are unchanged.

## Architecture and presentation

- Layouts, pages, cards, navigation and preview contents are Server Components. Only the health check and framework error recovery use client components.
- CSS custom properties expose semantic tokens compatible with later shadcn-style components. Small button, card, and input primitives accept native props without a component-library runtime. No dialog library is introduced before an actual dialog needs one.
- The manager shell provides a desktop sidebar and a native HTML disclosure menu on narrow screens. The staff shell provides three mobile navigation tabs linking to the actual preview sections. These tabs are preview navigation, not migrated business workflows.
- System font stacks and CSS illustration require no font service, image server, or remote asset. System dark mode, reduced motion, visible keyboard focus, skip navigation, text resizing, wrapping, and safe-area insets are supported.
- Shared TypeScript source is transpiled through `transpilePackages`. The app can be built for a future Vercel deployment; no deployment, project link, or hosting configuration is performed by W01. Backend selection is build/start configuration and requires a rebuild when changed for a production build.

## Checks

```powershell
npx --yes pnpm@10.34.9 --filter @bep/web typecheck
npx --yes pnpm@10.34.9 --filter @bep/web lint
npx --yes pnpm@10.34.9 --filter @bep/web test
npx --yes pnpm@10.34.9 --filter @bep/web build
```

The pure origin validator tests do not contact a backend. Browser verification must cover 320px, 390px and desktop widths, dark mode, large text, keyboard navigation, the manager menu, staff navigation, missing/unavailable/successful health status, retry, and not-found routing. Test backend writes only with disposable fixtures.

## Scope remaining

W02 authentication, session continuity, draft ownership/restoration and uncertain-outcome handling are not implemented here. Counts, receiving, transfers, reports, history, accounts, authorization behavior, and native clients remain in their legacy implementations until their separately gated migration work. Preview completion is not business-feature parity or release readiness.
