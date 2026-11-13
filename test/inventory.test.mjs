import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

const password = 'BepDemo2026!';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

async function fixture(t) {
  const db = openDatabase(':memory:', { demo: true });
  const server = inventoryServer({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => {
    db.close();
    if (error) reject(error);
    else resolve();
  })));
  const url = 'http://127.0.0.1:' + server.address().port;

  async function request(path, { token, body, key, status = 200, method, headers = {} } = {}) {
    const response = await fetch(url + '/api/' + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...headers, ...(token && { Authorization: 'Bearer ' + token }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(key && { 'Idempotency-Key': key }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status, response.status === status ? path : await response.text());
    return response;
  }
  async function login(username, native = false) {
    const response = await request('login', { body: { username, password, native } });
    const { token, persistent } = await response.json();
    return {
      token, persistent,
      snapshot: async () => (await request('snapshot', { token })).json(),
      history: async (query = '') => (await request('history' + query, { token })).json(),
      post: async (path, body, status = 200, key = randomUUID()) =>
        (await request(path, { token, body, key, status })).json(),
    };
  }
  return { login, request, url, db };
}

function stock(snapshot, location, item) {
  return snapshot.stock.find(row => row.location_id === location && row.item_id === item);
}

test('manager switches to staff permissions and delegated writes record both accounts', async t => {
  const { db, login, request } = await fixture(t);
  const manager = await login('manager');
  const staff = await login('duluth');
  const headers = { 'X-Staff-Account': 'duluth' };
  await request('snapshot', { token: staff.token, headers, status: 403 });
  await request('snapshot', { token: manager.token, headers: { 'X-Staff-Account': 'manager' }, status: 404 });
  const scoped = await (await request('snapshot', { token: manager.token, headers })).json();
  assert.equal(scoped.user.id, 'duluth');
  assert.equal(scoped.accounts, undefined);
  assert.ok(scoped.stock.length && scoped.stock.every(row => row.location_id === 'duluth'));
  const key = randomUUID();
  await request('staff-passwords', { token: manager.token, headers, key, body: {}, status: 403 });
  const body = { location: 'duluth', category: 'Trà', performedBy: 'Kiểm kê',
    lines: [{ item: 'green-tea', quantity: '24', unit: 'bag', revision: stock(scoped, 'duluth', 'green-tea').revision }] };
  await request('count-sheets', { token: manager.token, headers, key, body: { ...body, location: 'norcross' }, status: 403 });
  const send = () => request('count-sheets', { token: manager.token, headers, key, body });
  assert.deepEqual(await (await send()).json(), await (await send()).json());
  await request('count-sheets', { token: staff.token, key, body, status: 409 });
  const audit = db.prepare('SELECT manager_id, staff_id, action FROM delegated_actions WHERE request_key = ?').get(key);
  assert.deepEqual({ ...audit }, { manager_id: 'manager', staff_id: 'duluth', action: 'count-sheets' });
  assert.equal((await manager.snapshot()).user.role, 'manager');
});

test('manager rotates a staff password and revokes only that account’s sessions', async t => {
  const { db, login, request } = await fixture(t);
  const manager = await login('manager');
  const duluth = await login('duluth', true);
  const secondDevice = await login('duluth', true);
  const norcross = await login('norcross', true);
  const snapshot = await manager.snapshot();
  assert.deepEqual(new Set(snapshot.accounts.map(account => account.location_id)), new Set(snapshot.locations.map(place => place.id)));
  assert.ok(snapshot.accounts.every(account => Object.keys(account).sort().join(',') === 'id,location_id,name'));
  assert.equal((await duluth.snapshot()).accounts, undefined);

  const updated = { account: 'duluth', password: randomUUID() };
  await duluth.post('staff-passwords', updated, 403);
  await manager.post('staff-passwords', { ...updated, account: 'manager' }, 404);
  await manager.post('staff-passwords', { ...updated, password: 'too short' }, 400);
  await manager.post('staff-passwords', { ...updated, password }, 400);
  const key = randomUUID();
  assert.deepEqual(await manager.post('staff-passwords', updated, 200, key), { ok: true });
  for (const device of [duluth, secondDevice]) {
    await request('snapshot', { token: device.token, status: 401 });
    await device.post('count-sheets', {}, 401);
  }
  await request('login', { body: { username: 'duluth', password }, status: 401 });
  const { token } = await (await request('login', { body: { username: 'duluth', password: updated.password } })).json();
  await manager.post('staff-passwords', updated, 200, key);
  await manager.post('staff-passwords', { ...updated, password: randomUUID() }, 409, key);
  await request('snapshot', { token });
  await norcross.snapshot();
  await manager.snapshot();

  const stored = db.prepare('SELECT fingerprint, result FROM requests WHERE actor = ? AND key = ?').get('manager', key);
  assert.match(stored.fingerprint, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.deepEqual(JSON.parse(stored.result), { ok: true });
});

test('only native staff sessions persist and each can be logged out independently', async t => {
  const { db, login, request } = await fixture(t);
  const first = await login('duluth', true);
  const second = await login('duluth', true);
  const manager = await login('manager', true);
  const web = await login('duluth');
  assert.equal(first.persistent, true);
  assert.equal(second.persistent, true);
  assert.equal(manager.persistent, undefined);
  assert.equal(web.persistent, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions WHERE expires = 0').get().total, 2);

  db.exec('UPDATE sessions SET expires = 1 WHERE expires > 0');
  await login('norcross'); // Expired-session cleanup must retain native staff sessions.
  await request('snapshot', { token: web.token, status: 401 });
  await request('snapshot', { token: manager.token, status: 401 });
  await first.snapshot();
  await request('logout', { token: first.token, method: 'POST' });
  await request('snapshot', { token: first.token, status: 401 });
  await second.snapshot();
});

test('standalone catalog creation enables scoped weekly counts in cases', async t => {
  const { login } = await fixture(t);
  const manager = await login('manager');
  const staff = await login('duluth');
  const item = { name: 'Siro thử', category: 'Syrup', unit: 'bottle', caseSize: 6 };
  await staff.post('items', item, 403);
  await manager.post('items', { ...item, caseSize: 1.5 }, 400);
  await manager.post('items', { ...item, unit: 'case' }, 400);
  const { id } = await manager.post('items', item);
  const initial = await manager.snapshot();
  assert.deepEqual(initial.items.find(row => row.id === id).units, { bottle: 1, case: 6 });
  assert.ok(initial.stock.filter(row => row.item_id === id).every(row => row.on_hand === null));
  const line = { item: id, quantity: 1, unit: 'case', revision: 0 };
  const sheet = { location: 'duluth', category: 'Syrup', performedBy: 'Nhân viên Duluth' };
  await staff.post('count-sheets', { ...sheet, lines: [{ ...line, unit: 'bag' }] }, 400);
  await staff.post('count-sheets', { ...sheet, lines: [line] });
  const after = await manager.snapshot();
  assert.equal(stock(after, 'duluth', id).on_hand, 6);
  assert.equal(stock(after, 'johns-creek', id).on_hand, null);
  assert.equal(after.counts[0].lines[0].counted, 6);
});

test('a manager can add a catalog item with a delivery and stock changes only at receipt', async t => {
  const { login } = await fixture(t);
  const manager = await login('manager');
  const staff = await login('duluth');
  const newItem = { name: 'Bột khoai tím', category: 'POWDER', unit: 'bag' };
  const order = { location: 'duluth', supplier: 'Nhà cung cấp mới',
    lines: [{ newItem, unit: 'bag', quantity: 5 }] };
  await staff.post('deliveries', order, 403);
  await manager.post('deliveries', { ...order, lines: [...order.lines, { item: 'green-tea', unit: 'bag', quantity: 0 }] }, 400);
  assert.ok(!(await manager.snapshot()).items.some(item => item.name === newItem.name));
  const key = randomUUID();
  const created = await manager.post('deliveries', order, 200, key);
  assert.deepEqual(await manager.post('deliveries', order, 200, key), created);
  await manager.post('deliveries', order, 409);
  const before = await manager.snapshot();
  const item = before.items.find(item => item.name === newItem.name);
  assert.equal(item.sku, '');
  assert.equal(item.supplier, order.supplier);
  assert.equal(stock(before, 'duluth', item.id).on_hand, 0);
  assert.equal(stock(before, 'johns-creek', item.id).on_hand, null);
  await staff.post('receipts', { line: created.lineIds[0], quantity: 2, unit: 'bag', receiver: 'Nhân viên Duluth' });
  const after = await manager.snapshot();
  assert.equal(stock(after, 'duluth', item.id).on_hand, 2);
  assert.equal(after.deliveries.find(row => row.id === created.id).lines[0].outstanding, 3);
});

test('partial supplier receipt updates only the confirmed amount and protects the photo', async t => {
  const { login, request } = await fixture(t);
  const duluth = await login('duluth');
  const johns = await login('johns-creek');
  const manager = await login('manager');
  const before = await duluth.snapshot();
  assert.equal(stock(before, 'duluth', 'green-tea').on_hand, 24);
  assert.equal(before.deliveries[0].lines[0].outstanding, 12);
  const body = { line: 'demo-line', quantity: '5', unit: 'bag', photo: png, receiver: '  Người nhận Duluth  ' };
  await johns.post('receipts', body, 403);
  await duluth.post('receipts', { ...body, receiver: '  ' }, 400);
  const key = randomUUID();
  const [confirmed, retry] = await Promise.all([
    duluth.post('receipts', body, 200, key), duluth.post('receipts', body, 200, key),
  ]);
  assert.deepEqual(retry, confirmed);
  assert.deepEqual({ ...confirmed, id: undefined }, { id: undefined, received: 5, outstanding: 7, onHand: 29 });
  await duluth.post('receipts', { ...body, quantity: '6' }, 409, key);
  await manager.post('receipts', { ...body, quantity: '8' }, 409);
  const snapshot = await duluth.snapshot();
  assert.equal(snapshot.deliveries[0].lines[0].receipts.length, 1);
  assert.equal(snapshot.deliveries[0].lines[0].receipts[0].receiver, 'Người nhận Duluth');
  assert.equal(stock(snapshot, 'duluth', 'green-tea').on_hand, 29);
  const image = await request('photos/' + confirmed.id, { token: duluth.token });
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(png.split(',')[1], 'base64'));
  await request('photos/' + confirmed.id, { token: johns.token, status: 403 });
  await request('photos/' + confirmed.id, { status: 401 });
  await request('history', { token: duluth.token, status: 403 });
  const { entries } = await manager.history('?location=duluth&q=tra%20xanh');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].delta, 5);
  assert.equal(entries[0].actor, 'duluth');
});

test('count at and below a location threshold raises the alert and rejects stale edits', async t => {
  const { login } = await fixture(t);
  const manager = await login('manager');
  const norcross = await login('norcross');
  const threshold = { location: 'norcross', item: 'tapioca', quantity: '4', unit: 'bag' };
  const initial = await manager.snapshot();
  assert.equal(initial.locations.length, 5);
  assert.equal(initial.stock.length, 15);
  await norcross.post('thresholds', threshold, 403);
  await manager.post('thresholds', threshold);
  const count = { ...threshold, revision: 0, note: 'Kiểm kê cuối ca' };
  await norcross.post('counts', count, 403);
  assert.deepEqual(await manager.post('counts', count), { onHand: 4, delta: -2 });
  await manager.post('counts', count, 409);
  const snapshot = await manager.snapshot();
  assert.deepEqual(snapshot.stock.filter(row => row.low).map(row => [row.location_id, row.item_id]), [['norcross', 'tapioca']]);
  assert.equal((await norcross.snapshot()).stock.length, 3);
  await manager.post('counts', { ...count, revision: 1, quantity: '3' });
  assert.equal(stock(await manager.snapshot(), 'norcross', 'tapioca').low, true);
  const adjustment = (await manager.history('?location=norcross')).entries.at(-1);
  assert.equal(adjustment.note, 'Kiểm kê cuối ca');
  assert.equal(adjustment.actor, 'manager');
  assert.equal(adjustment.balance, 4);
  assert.ok(Date.parse(adjustment.created_at));
  await manager.post('thresholds', { ...threshold, quantity: '2' });
  assert.equal(stock(await manager.snapshot(), 'norcross', 'tapioca').low, false);
  await manager.post('thresholds', { ...threshold, quantity: null });
  assert.equal(stock(await manager.snapshot(), 'norcross', 'tapioca').threshold, null);
});

test('manager can save all five thresholds and a separate alert for the system total', async t => {
  const { login, db } = await fixture(t);
  const manager = await login('manager');
  const staff = await login('duluth');
  const body = { item: 'green-tea', total: 107,
    locations: { duluth: 24, 'johns-creek': 14, norcross: 9, 'dl-house': null, extra: 0 } };
  await staff.post('system-thresholds', body, 403);
  await manager.post('system-thresholds', body);
  const alert = async () => (await manager.snapshot()).items.find(item => item.id === body.item);
  assert.equal((await alert()).system_low, false);
  await manager.post('system-thresholds', { ...body, total: 108 });
  const snapshot = await manager.snapshot();
  assert.equal((await alert()).system_low, true);
  assert.deepEqual(snapshot.stock.filter(row => row.item_id === body.item && row.low).map(row => row.location_id).sort(),
    ['duluth', 'norcross']);
  await manager.post('system-thresholds', { ...body, locations: { ...body.locations, duluth: 0, extra: -1 } }, 400);
  assert.equal(stock(await manager.snapshot(), 'duluth', body.item).threshold, 24);
  assert.equal((await alert()).system_threshold, 108);
  db.prepare("UPDATE stock SET known = 0 WHERE item_id = ? AND location_id = 'extra'").run(body.item);
  await manager.post('system-thresholds', { ...body, total: 100 });
  assert.equal((await alert()).system_low, true);
  db.prepare('UPDATE stock SET known = 0 WHERE item_id = ?').run(body.item);
  assert.equal((await alert()).system_low, false);
});

test('transfer Duluth to Johns Creek deducts on dispatch and closes with a recorded shortage', async t => {
  const { login } = await fixture(t);
  const duluth = await login('duluth');
  const johns = await login('johns-creek');
  const extra = await login('extra');
  const manager = await login('manager');
  const dispatch = { source: 'duluth', destination: 'johns-creek', item: 'cup-23', unit: 'bag', quantity: '2' };
  await johns.post('transfers', dispatch, 403);
  await duluth.post('transfers', { ...dispatch, unit: 'case', quantity: '3' }, 409);
  assert.equal((await duluth.snapshot()).transfers.length, 0);
  const key = randomUUID();
  const sent = await duluth.post('transfers', dispatch, 200, key);
  assert.deepEqual(await duluth.post('transfers', dispatch, 200, key), sent);
  assert.equal(sent.onHand, 800);
  assert.equal(sent.inTransit, 100);
  assert.equal((await extra.snapshot()).transfers.length, 0);
  assert.equal(stock(await johns.snapshot(), 'johns-creek', 'cup-23').on_hand, 500);
  const receipt = { transfer: sent.id, unit: 'each', quantity: '60', final: false, receiver: 'Người nhận' };
  await duluth.post('transfer-receipts', receipt, 403);
  await johns.post('transfer-receipts', receipt, 403);
  const first = await manager.post('transfer-receipts', receipt);
  assert.equal(first.onHand, 560);
  assert.equal(first.inTransit, 40);
  const final = { ...receipt, quantity: '30', final: true };
  await manager.post('transfer-receipts', final, 400);
  const finalKey = randomUUID();
  const confirmed = await manager.post('transfer-receipts', { ...final, note: 'Thiếu 10 ly' }, 200, finalKey);
  assert.deepEqual(await manager.post('transfer-receipts', { ...final, note: 'Thiếu 10 ly' }, 200, finalKey), confirmed);
  assert.equal(confirmed.onHand, 590);
  assert.equal(confirmed.inTransit, 0);
  assert.equal(confirmed.discrepancy, -10);
  await manager.post('transfer-receipts', final, 409);
  const [ticket] = (await johns.snapshot()).transfers;
  assert.equal(ticket.received, 90);
  assert.equal(ticket.shortage, 10);
  assert.equal(ticket.receipts.length, 2);
  assert.equal(ticket.receipts[0].note, 'Thiếu 10 ly');
  assert.equal((await manager.history('?location=duluth')).entries.length, 1);
  assert.equal((await manager.history('?location=johns-creek')).entries.length, 2);
});

test('creating a multi-item order leaves stock unchanged and invalid photos roll back confirmation', async t => {
  const { login } = await fixture(t);
  const warehouse = await login('dl-house');
  const manager = await login('manager');
  const draft = { location: 'dl-house', supplier: 'Supplier A', lines: [
    { item: 'green-tea', unit: 'case', quantity: '1.5' },
    { item: 'cup-23', unit: 'each', quantity: '100' },
  ] };
  await warehouse.post('deliveries', draft, 403);
  const order = await manager.post('deliveries', draft);
  const snapshot = await warehouse.snapshot();
  assert.equal(stock(snapshot, 'dl-house', 'green-tea').on_hand, 48);
  assert.equal(snapshot.deliveries[0].lines[0].outstanding, 18);
  assert.equal(snapshot.deliveries[0].lines.length, 2);
  await warehouse.post('receipts', { line: order.lineIds[0], quantity: '1', unit: 'case', receiver: 'Kho',
    photo: 'data:image/png;base64,YWJj' }, 400);
  assert.equal((await manager.history('?location=dl-house')).entries.length, 0);
  assert.equal((await warehouse.snapshot()).deliveries[0].lines[0].outstanding, 18);
  await warehouse.post('receipts', { line: order.lineIds[0], quantity: '1', unit: 'bag', receiver: 'Kho' });
  const full = { delivery: order.id, receiver: 'Kho', lines: [
    { id: order.lineIds[0], outstanding: 17 }, { id: order.lineIds[1], outstanding: 100 },
  ] };
  const key = randomUUID();
  await warehouse.post('delivery-receipts-all', { ...full, receiver: '' }, 400);
  await warehouse.post('delivery-receipts-all', { ...full, lines: [{ id: order.lineIds[0], outstanding: 18 }, full.lines[1]] }, 409);
  const result = await warehouse.post('delivery-receipts-all', full, 200, key);
  assert.deepEqual(await warehouse.post('delivery-receipts-all', full, 200, key), result);
  await warehouse.post('delivery-receipts-all', full, 409);
  assert.deepEqual(result.receipts.map(receipt => receipt.onHand), [66, 1600]);
});

test('native CORS accepts the packaged origins and sessions can be revoked', async t => {
  const { login, request, db } = await fixture(t);
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const response = await request('snapshot', { method: 'OPTIONS', status: 204, headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  await request('snapshot', { method: 'OPTIONS', status: 403, headers: { Origin: 'https://other.example' } });
  const user = await login('extra');
  db.prepare('UPDATE sessions SET expires = ? WHERE user_id = ?').run(Date.now() - 1, 'extra');
  await request('snapshot', { token: user.token, status: 401 });
  const renewed = await login('extra');
  await request('snapshot', { token: renewed.token });
  await request('logout', { token: renewed.token, method: 'POST' });
  await request('snapshot', { token: renewed.token, status: 401 });
});

test('login rejects further attempts from an address after twenty failures', async t => {
  const { request } = await fixture(t);
  for (let attempt = 0; attempt < 20; attempt++) {
    await request('login', { body: { username: 'unknown', password }, status: 401 });
  }
  const response = await request('login', { body: { username: 'unknown', password }, status: 429 });
  assert.equal((await response.json()).error, 'Thử đăng nhập lại sau một phút.');
});

test('Atlanta Monday boundary assigns counts to the correct report week', async t => {
  const { login, request, db } = await fixture(t);
  const manager = await login('manager');
  const duluth = await login('duluth');
  const submit = quantity => duluth.post('count-sheets', {
    location: 'duluth', category: 'Trà', performedBy: 'Kiểm kê biên tuần',
    lines: [{ item: 'green-tea', quantity, revision: quantity === '25' ? 0 : 1 }],
  });
  const sunday = await submit('25');
  db.prepare('UPDATE count_sheets SET submitted_at = ? WHERE id = ?')
    .run('2026-11-09T04:59:59Z', sunday.id);
  const monday = await submit('28');
  db.prepare('UPDATE count_sheets SET submitted_at = ? WHERE id = ?')
    .run('2026-11-09T05:00:00Z', monday.id);

  const previous = await (await request('report?location=duluth&week=2026-11-02', { token: manager.token })).json();
  const current = await (await request('report?location=duluth&week=2026-11-09', { token: manager.token })).json();
  assert.equal(previous.week, '2026-11-02');
  assert.equal(previous.rows.find(row => row.item_id === 'green-tea').ending, 25);
  assert.equal(current.week, '2026-11-09');
  assert.equal(current.rows.find(row => row.item_id === 'green-tea').beginning, 25);
  assert.equal(current.rows.find(row => row.item_id === 'green-tea').ending, 28);
});

test('partial count sheets save explicit zero, leave other rows untouched, and reject a stale batch', async t => {
  const { login, db } = await fixture(t);
  const duluth = await login('duluth');
  db.exec("UPDATE items SET category = 'Trà' WHERE id = 'tapioca'");
  db.exec("UPDATE stock SET known = 0, on_hand = 0 WHERE location_id = 'duluth' AND item_id = 'green-tea'");
  const sheet = { location: 'duluth', category: 'Trà', performedBy: 'Kiểm kê cuối tuần', lines: [
    { item: 'green-tea', quantity: '0', revision: 0 },
  ] };
  await duluth.post('count-sheets', { ...sheet, location: 'johns-creek' }, 403);
  await duluth.post('count-sheets', { ...sheet, lines: [] }, 400);
  const key = randomUUID();
  const posted = await duluth.post('count-sheets', sheet, 200, key);
  assert.deepEqual(await duluth.post('count-sheets', sheet, 200, key), posted);
  await duluth.post('count-sheets', { ...sheet, lines: [
    { item: 'tapioca', quantity: '1', revision: 0 }, ...sheet.lines,
  ] }, 409);
  const snapshot = await duluth.snapshot();
  assert.equal(snapshot.counts.length, 1);
  assert.equal(snapshot.counts[0].performed_by, sheet.performedBy);
  assert.deepEqual(snapshot.counts[0].lines, [{ item_id: 'green-tea', before: null, counted: 0 }]);
  assert.equal(stock(snapshot, 'duluth', 'green-tea').on_hand, 0);
  assert.equal(stock(snapshot, 'duluth', 'tapioca').on_hand, 14);
});

test('counted receipts preserve stock and count once in the correct weekly report', async t => {
  const { login, request, db } = await fixture(t);
  const manager = await login('manager');
  const duluth = await login('duluth');
  const johns = await login('johns-creek');
  const submit = (location, category, item, quantity, revision) => ({
    location, category, performedBy: 'Kiểm kê', lines: [{ item, quantity, revision }],
  });
  const beginning = await duluth.post('count-sheets', submit('duluth', 'Trà', 'green-tea', '24', 0));
  db.prepare('UPDATE count_sheets SET submitted_at = ? WHERE id = ?').run('2026-10-18T20:00:00Z', beginning.id);
  const ending = await duluth.post('count-sheets', submit('duluth', 'Trà', 'green-tea', '26', 1));
  db.prepare('UPDATE count_sheets SET submitted_at = ? WHERE id = ?').run('2026-11-08T20:00:00Z', ending.id);
  const body = { line: 'demo-line', quantity: '5', unit: 'bag', countSheet: ending.id, receiver: 'Người nhận' };
  await manager.post('receipts', { ...body, countSheet: beginning.id }, 409);
  await manager.post('receipts', { ...body, countSheet: 'draft-id' }, 409);
  await duluth.post('receipts', body, 403);
  const key = randomUUID();
  const receipt = await manager.post('receipts', body, 200, key);
  assert.deepEqual(await manager.post('receipts', body, 200, key), receipt);
  assert.equal(receipt.onHand, 26);
  assert.equal(receipt.outstanding, 7);
  assert.equal((await manager.history('?location=duluth')).entries[0].already_counted, 5);
  await duluth.post('prices', { item: 'green-tea', cost: '3.25' }, 403);
  await manager.post('prices', { item: 'green-tea', cost: '3.25' });
  await request('report', { token: duluth.token, status: 403 });
  const report = await (await request('report?location=duluth&week=2026-11-02', { token: manager.token })).json();
  const tea = report.rows.find(row => row.item_id === 'green-tea');
  assert.deepEqual([tea.beginning, tea.purchases, tea.ending, tea.usage, tea.value], [24, 5, 26, 3, 84.5]);
  assert.equal(tea.beginningAt, '2026-10-18T20:00:00Z');
  assert.equal(tea.endingAt, '2026-11-08T20:00:00Z');
  assert.equal(report.rows.find(row => row.item_id === 'tapioca').usage, null);

  await manager.post('receipts', { line: 'demo-line', quantity: '4', unit: 'bag', receiver: 'Người nhận' });
  const latest = await duluth.post('count-sheets', submit('duluth', 'Trà', 'green-tea', '28', 4));
  db.prepare('UPDATE count_sheets SET submitted_at = ? WHERE id = ?').run('2026-11-09T02:00:00Z', latest.id);
  await manager.post('receipts', { line: 'demo-line', quantity: '3', unit: 'bag', receiver: 'Người nhận' });
  const updated = await (await request('report?location=duluth&week=2026-11-02', { token: manager.token })).json();
  const updatedTea = updated.rows.find(row => row.item_id === 'green-tea');
  assert.deepEqual([updatedTea.beginning, updatedTea.purchases, updatedTea.ending, updatedTea.usage, updatedTea.onHand],
    [26, 4, 28, 2, 31]);
  assert.equal(updatedTea.beginningAt, tea.endingAt);
  assert.equal(updatedTea.endingAt, '2026-11-09T02:00:00Z');

  const sent = await duluth.post('transfers', { source: 'duluth', destination: 'johns-creek',
    item: 'cup-23', unit: 'each', quantity: '20' });
  const counted = await johns.post('count-sheets', submit('johns-creek', 'Bao bì', 'cup-23', '515', 0));
  const received = await manager.post('transfer-receipts', { transfer: sent.id, unit: 'each', quantity: '20',
    final: true, countSheet: counted.id, receiver: 'Người nhận' });
  assert.equal(received.onHand, 515);
  assert.equal(received.inTransit, 0);
});

test('a transfer batch posts atomically and only the assigned recipient can confirm a manager shipment', async t => {
  const { login } = await fixture(t);
  const manager = await login('manager');
  const duluth = await login('duluth');
  const johns = await login('johns-creek');
  const dispatch = { source: 'duluth', destination: 'johns-creek', lines: [
    { item: 'green-tea', unit: 'bag', quantity: '2' },
    { item: 'cup-23', unit: 'each', quantity: '901' },
  ] };
  await duluth.post('transfers', dispatch, 409);
  const before = await duluth.snapshot();
  assert.equal(before.transfers.length, 0);
  assert.equal(stock(before, 'duluth', 'green-tea').on_hand, 24);
  dispatch.lines[1].quantity = '20';
  const sent = await manager.post('transfers', dispatch);
  assert.deepEqual(sent.lines.map(row => row.onHand), [22, 880]);
  assert.ok((await johns.snapshot()).transfers.every(line => line.batch_id === sent.id));
  const full = { transfer: sent.id, receiver: 'Người nhận Johns Creek',
    lines: sent.lines.map(row => ({ id: row.id, outstanding: row.inTransit })) };
  await duluth.post('transfer-receipts-all', full, 403);
  const received = await johns.post('transfer-receipts-all', full);
  assert.deepEqual(received.receipts.map(row => row.onHand), [17, 520]);
  await johns.post('transfer-receipts-all', full, 409);
});

test('transfer overage requires a final receipt and records the surplus discrepancy', async t => {
  const { login } = await fixture(t);
  const duluth = await login('duluth');
  const manager = await login('manager');
  const johns = await login('johns-creek');
  const transfer = await duluth.post('transfers', {
    source: 'duluth', destination: 'johns-creek', item: 'cup-23', unit: 'bag', quantity: '2',
  });
  const receipt = {
    transfer: transfer.id, quantity: '110', unit: 'each', final: false, receiver: 'Người nhận',
  };
  await manager.post('transfer-receipts', receipt, 409);
  const unchanged = (await johns.snapshot()).transfers[0];
  assert.equal(unchanged.in_transit, 100);
  assert.equal(unchanged.receipts.length, 0);
  assert.equal(stock(await johns.snapshot(), 'johns-creek', 'cup-23').on_hand, 500);

  await manager.post('transfer-receipts', { ...receipt, final: true }, 400);
  const result = await manager.post('transfer-receipts', { ...receipt, final: true, note: 'Nhận dư 10 cái' });
  assert.equal(result.onHand, 610);
  assert.equal(result.inTransit, 0);
  assert.equal(result.discrepancy, 10);
  const closed = (await johns.snapshot()).transfers[0];
  assert.ok(closed.closed_at);
  assert.equal(closed.shortage, 0);
  assert.equal(closed.discrepancy, 10);
  assert.equal(closed.receipts.length, 1);
});
