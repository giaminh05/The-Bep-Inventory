import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
// @ts-expect-error The unchanged legacy backend is JavaScript.
import { openDatabase } from '../../../server/db.mjs';
// @ts-expect-error The unchanged legacy backend is JavaScript.
import { inventoryServer } from '../../../server/http.mjs';
import { ApiError, createInventoryClient } from '../src/index.js';

async function fixture(t: TestContext) {
  const db = openDatabase(':memory:', { demo: true });
  const server = inventoryServer({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error?: Error) => {
    db.close();
    if (error) reject(error); else resolve();
  })));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function signedIn(username: string) {
    let token: string | null = null;
    let account: string | null = null;
    const client = createInventoryClient({ baseUrl, getToken: () => token, getStaffAccount: () => account });
    token = (await client.login({ username, password: 'BepDemo2026!' })).token;
    return { client, delegate: (value: string | null) => { account = value; } };
  }
  return { db, baseUrl, signedIn };
}

test('real manager and staff snapshots parse without leaking manager fields into staff scope', async t => {
  const { signedIn } = await fixture(t);
  const manager = await signedIn('manager');
  const snapshot = await manager.client.snapshot();
  assert.equal(snapshot.locations.length, 5);
  assert.equal(snapshot.accounts!.length, 5);
  assert.equal(snapshot.items[0]!.cost, null);
  assert.equal(snapshot.deliveries[0]!.manager_created, 1);
  const staff = await signedIn('duluth');
  const scoped = await staff.client.snapshot();
  assert.equal(scoped.accounts, undefined);
  assert.equal(scoped.items[0]!.cost, undefined);
  assert.ok(scoped.stock.every(row => row.location_id === 'duluth'));
  manager.delegate('norcross');
  assert.equal((await manager.client.snapshot()).user.id, 'norcross');
  manager.delegate(null);
  assert.equal((await manager.client.snapshot()).user.role, 'manager');
});

test('real mutations replay the same key once and expose 401, 403, and 409 as typed statuses', async t => {
  const { db, baseUrl, signedIn } = await fixture(t);
  await assert.rejects(createInventoryClient({ baseUrl }).snapshot(), status(401));
  const { client } = await signedIn('manager');
  const input = { location: 'duluth', item: 'green-tea', quantity: '0', unit: 'bag', revision: 0 };
  const key = randomUUID();
  const result = await client.action('counts', input, { key });
  assert.deepEqual(result, { onHand: 0, delta: -24 });
  assert.deepEqual(await client.action('counts', input, { key }), result);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movements').get().n, 1);
  await assert.rejects(client.action('counts', input, { key: randomUUID() }), status(409));
  await assert.rejects(client.action('counts', { ...input, quantity: '1' }, { key }), status(409));
  const staff = await signedIn('duluth');
  await assert.rejects(staff.client.history(), status(403));
  await client.logout();
  await assert.rejects(client.snapshot(), status(401));
});

test('real history and reports retain null unknown quantities, numeric zero, and Atlanta date filters', async t => {
  const { db, signedIn } = await fixture(t);
  const { client } = await signedIn('manager');
  db.prepare("UPDATE stock SET known = 0 WHERE location_id = 'duluth' AND item_id = 'green-tea'").run();
  assert.equal((await client.snapshot()).stock.find(row => row.location_id === 'duluth' && row.item_id === 'green-tea')!.on_hand, null);
  const item = (await client.snapshot()).items.find(row => row.id === 'green-tea')!;
  await client.action('count-sheets', { location: 'duluth', category: item.category, performedBy: 'Fixture counter',
    lines: [{ item: item.id, quantity: 0, revision: 0 }] }, { key: randomUUID() });
  db.prepare("UPDATE movements SET created_at = '2026-11-16T04:30:00.000Z'").run();
  db.prepare("UPDATE count_sheets SET submitted_at = '2026-11-16T04:30:00.000Z'").run();
  const history = await client.history({ location: 'duluth', from: '2026-11-15', to: '2026-11-15', order: 'oldest', type: 'counts' });
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0]!.delta, null);
  assert.equal(history.entries[0]!.balance, 0);
  assert.equal(history.entries[0]!.delta_known, 0);
  assert.equal(history.entries[0]!.balance_known, 1);
  assert.equal((await client.history({ from: '2026-11-16' })).entries.length, 0);
  const report = await client.report({ location: 'duluth', week: '2026-11-09' });
  const row = report.rows.find(value => value.item_id === item.id)!;
  assert.equal(row.beginning, null);
  assert.equal(row.ending, 0);
  assert.equal(row.onHand, 0);
  assert.equal(row.value, null);
  assert.equal(row.endingAt, '2026-11-16T04:30:00.000Z');
});

test('real supplier photos and completed transfers parse nested nullable fields and numeric flags', async t => {
  const { signedIn } = await fixture(t);
  const { client } = await signedIn('manager');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
  const receipt = await client.action('receipts', { line: 'demo-line', quantity: '1', unit: 'bag',
    receiver: 'Fixture receiver', photo: png, countSheet: null }, { key: randomUUID() });
  const photo = await client.photo(receipt.id);
  assert.equal(photo.type, 'image/png');
  assert.ok(photo.size > 8);
  const dispatched = await client.action('transfers', { source: 'duluth', destination: 'norcross',
    lines: [{ item: 'green-tea', quantity: '1', unit: 'bag' }] }, { key: randomUUID() });
  assert.ok('lines' in dispatched);
  const transferId = dispatched.lines[0]!.id;
  const staff = await signedIn('norcross');
  await staff.client.action('transfer-receipts', { transfer: transferId, quantity: '1', unit: 'bag',
    final: false, receiver: 'Fixture receiver', countSheet: null }, { key: randomUUID() });
  const snapshot = await client.snapshot();
  const supplierReceipt = snapshot.deliveries[0]!.lines[0]!.receipts[0]!;
  assert.equal(supplierReceipt.has_photo, 1);
  assert.equal(supplierReceipt.note, null);
  const transfer = snapshot.transfers.find(row => row.id === transferId)!;
  assert.equal(transfer.manager_created, 1);
  assert.equal(transfer.in_transit, 0);
  assert.equal(transfer.receipts[0]!.final, 1);
  assert.equal(transfer.receipts[0]!.note, null);
  assert.equal(transfer.receipts[0]!.actor, 'norcross');
  await assert.rejects(staff.client.photo(receipt.id), status(403));
});

function status(expected: number) {
  return (error: unknown) => error instanceof ApiError && error.status === expected;
}
