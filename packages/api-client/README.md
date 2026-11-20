# Inventory API client

Framework-neutral transport for the unchanged legacy `/api/` endpoints. The caller owns token storage, staff selection, drafts, mutation payloads, and idempotency keys.

```ts
import { createInventoryClient, ApiError } from '@bep/api-client';

const client = createInventoryClient({
  baseUrl: '', // Same-origin browser requests; use an absolute origin in Node.
  getToken: () => currentToken,
  getStaffAccount: () => selectedStaffAccount,
});
const status = await client.health();
const snapshot = await client.snapshot();
```

`health`, `login`, `logout`, `snapshot`, `history`, and `report` parse their JSON responses using `@bep/contracts`. `photo` returns an authenticated `Blob`. `action(name, input, { key, signal? })` returns the typed legacy mutation result without transforming the input or adding business validation. Mutations are sent once; retry uncertain outcomes only with the original payload and key. No automatic retry, generated keys, outbox, or persistence is provided.

All requests use `cache: 'no-store'`. Credential callbacks are read for each request. The default timeout is 20 seconds, matching the legacy Web client; all methods accept a final `{ signal }` argument (included with `{ key }` for actions). Cancellation or timeout may occur after the server commits a mutation.

`ApiError.status` preserves HTTP status codes; transport failures use `0`. `kind` distinguishes `http`, `network`, `timeout`, `aborted`, and `response`. Error messages are deliberately generic and do not retain server messages, response bodies, URLs, credentials, payloads, or upstream error causes. Product interfaces should map statuses to appropriate Vietnamese messages.

The packages export TypeScript source. Node tooling uses `tsx`; the Next.js consumer must list both shared packages in `transpilePackages`.
