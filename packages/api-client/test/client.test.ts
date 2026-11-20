import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createInventoryClient } from '../src/index.js';

test('requests use current credentials, disable read caching, and preserve caller mutation bytes and key', async () => {
  let token: string | null = 'first-token';
  let account: string | null = 'duluth';
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = createInventoryClient({ baseUrl: 'https://example.test/', getToken: () => token,
    getStaffAccount: () => account, fetch: async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return Response.json({ ok: true });
    } });
  await client.health();
  const input = { account: 'duluth', password: 'test-only-password' };
  await client.action('staff-passwords', input, { key: 'caller-preserved-key' });
  token = null;
  account = null;
  await client.health();
  assert.equal(requests[0]!.url, 'https://example.test/api/health');
  assert.equal(requests[0]!.init.cache, 'no-store');
  assert.equal(new Headers(requests[1]!.init.headers).get('authorization'), 'Bearer first-token');
  assert.equal(new Headers(requests[1]!.init.headers).get('x-staff-account'), 'duluth');
  assert.equal(new Headers(requests[1]!.init.headers).get('idempotency-key'), 'caller-preserved-key');
  assert.equal(requests[1]!.init.body, JSON.stringify(input));
  assert.equal(new Headers(requests[2]!.init.headers).has('authorization'), false);
  assert.equal(new Headers(requests[2]!.init.headers).has('x-staff-account'), false);
});

test('HTTP errors keep status but never retain server payloads or credentials', async () => {
  const sensitive = 'test-only-sensitive-value';
  const client = createInventoryClient({ getToken: () => sensitive,
    fetch: async () => Response.json({ error: sensitive, password: sensitive }, { status: 409 }) });
  await assert.rejects(client.action('staff-passwords', { account: 'duluth', password: sensitive }, { key: 'test-key' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.ok(!JSON.stringify(error).includes(sensitive));
      assert.ok(!String(error).includes(sensitive));
      assert.equal(error.cause, undefined);
      return true;
    });
});

test('network failures and timeouts never automatically replay a mutation', async () => {
  let attempts = 0;
  const offline = createInventoryClient({ fetch: async () => { attempts++; throw new Error('test-only-secret'); } });
  await assert.rejects(offline.action('prices', { item: 'green-tea', cost: 0 }, { key: 'same-key' }),
    (error: unknown) => error instanceof ApiError && error.status === 0 && !String(error).includes('test-only-secret'));
  assert.equal(attempts, 1);
  const slow = createInventoryClient({ timeoutMs: 5, fetch: async (_url, init) => {
    attempts++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  } });
  await assert.rejects(slow.action('prices', { item: 'green-tea', cost: 0 }, { key: 'same-key' }),
    (error: unknown) => error instanceof ApiError && error.status === 0);
  assert.equal(attempts, 2);
});

test('caller cancellation is forwarded and malformed responses produce safe typed errors', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createInventoryClient({ fetch: async (_url, init) => {
    assert.equal(init!.signal!.aborted, true);
    throw new Error('aborted');
  } });
  await assert.rejects(client.health({ signal: controller.signal }), ApiError);
  const malformed = createInventoryClient({ fetch: async () => Response.json({ ok: 'secret-response' }) });
  await assert.rejects(malformed.health(), (error: unknown) =>
    error instanceof ApiError && error.status === 200 && !String(error).includes('secret-response'));
});

