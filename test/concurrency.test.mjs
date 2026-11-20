import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

async function fixture(t, username = 'manager') {
  const db = openDatabase(':memory:', { demo: true });
  const server = inventoryServer({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => {
    db.close();
    if (error) reject(error);
    else resolve();
  })));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const login = await fetch(origin + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'BepDemo2026!' }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  async function post(path, body, key = randomUUID()) {
    const response = await fetch(origin + '/api/' + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function accepted(path, body, key) {
    const response = await post(path, body, key);
    assert.equal(response.status, 200, path);
    return response.body;
  }
  const stock = (item, location = 'duluth') => ({ ...db.prepare(
    'SELECT on_hand, known, revision FROM stock WHERE location_id = ? AND item_id = ?',
  ).get(location, item) });
  const total = table => db.prepare('SELECT COUNT(*) AS total FROM ' + table).get().total;
  const category = item => db.prepare('SELECT category FROM items WHERE id = ?').get(item).category;
  const sheet = (item, quantity, revision) => ({ location: 'duluth', category: category(item),
    performedBy: 'Regression counter', lines: [{ item, quantity, revision }] });
  return { db, post, accepted, stock, total, sheet };
}

// These requests overlap at the HTTP boundary. The production server serializes
// synchronous SQLite actions; this does not simulate separate database writers.
test('concurrent count sheets with one revision commit exactly one sheet and request', async t => {
  const { db, post, stock, total, sheet } = await fixture(t, 'duluth');
  const before = stock('green-tea');
  const keys = [randomUUID(), randomUUID()];
  const bodies = [sheet('green-tea', '20', before.revision), sheet('green-tea', '21', before.revision)];
  const responses = await Promise.all(bodies.map((body, i) => post('count-sheets', body, keys[i])));
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  const winner = responses.findIndex(row => row.status === 200);
  const counted = Number(bodies[winner].lines[0].quantity) * 1000;
  assert.deepEqual(stock('green-tea'), { on_hand: counted, known: 1, revision: before.revision + 1 });
  for (const table of ['count_sheets', 'count_lines', 'movements', 'requests']) assert.equal(total(table), 1, table);
  const line = db.prepare('SELECT * FROM count_lines').get();
  assert.equal(line.sheet_id, responses[winner].body.id);
  assert.equal(line.before, before.on_hand);
  assert.equal(line.counted, counted);
  const movement = db.prepare('SELECT * FROM movements').get();
  assert.equal(line.movement_id, movement.id);
  assert.equal(movement.type, 'sheet_count');
  assert.equal(movement.reference, line.sheet_id);
  assert.equal(movement.delta, counted - before.on_hand);
  assert.equal(movement.balance, counted);
  assert.equal(movement.actor, 'duluth');
  const saved = db.prepare('SELECT actor, key, result FROM requests').get();
  assert.equal(saved.actor, 'duluth');
  assert.equal(saved.key, keys[winner]);
  assert.deepEqual(JSON.parse(saved.result), responses[winner].body);
});

test('competing transfer batches roll back all documents and movements of the losing dispatch', async t => {
  const { db, post, stock, total } = await fixture(t, 'duluth');
  const tea = stock('green-tea');
  const topping = stock('tapioca');
  const destinations = ['johns-creek', 'norcross'];
  const destinationStocks = destinations.map(location => [stock('green-tea', location), stock('tapioca', location)]);
  const keys = [randomUUID(), randomUUID()];
  const bodies = destinations.map(destination => ({ source: 'duluth', destination, lines: [
    { item: 'tapioca', quantity: '1', unit: 'bag' },
    { item: 'green-tea', quantity: '20', unit: 'bag' },
  ] }));
  const responses = await Promise.all(bodies.map((body, i) => post('transfers', body, keys[i])));
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  const winner = responses.findIndex(row => row.status === 200);
  assert.deepEqual(stock('green-tea'), { ...tea, on_hand: tea.on_hand - 20000, revision: tea.revision + 1 });
  assert.deepEqual(stock('tapioca'), { ...topping, on_hand: topping.on_hand - 1000, revision: topping.revision + 1 });
  destinations.forEach((location, i) => {
    assert.deepEqual([stock('green-tea', location), stock('tapioca', location)], destinationStocks[i]);
  });
  assert.equal(total('transfers'), 2);
  assert.equal(total('movements'), 2);
  assert.equal(total('requests'), 1);
  assert.equal(total('transfer_receipts'), 0);
  const documents = db.prepare('SELECT * FROM transfers ORDER BY rowid').all();
  assert.deepEqual(documents.map(row => row.id), responses[winner].body.lines.map(row => row.id));
  for (const row of documents) {
    assert.equal(row.batch_id, responses[winner].body.id);
    assert.equal(row.destination, destinations[winner]);
    assert.equal(row.received, 0);
    const movement = db.prepare('SELECT * FROM movements WHERE reference = ?').get(row.id);
    assert.equal(movement.type, 'transfer_out');
    assert.equal(movement.delta, -row.sent);
    assert.equal(movement.balance, stock(row.item_id).on_hand);
    assert.equal(movement.actor, 'duluth');
  }
  const saved = db.prepare('SELECT key, result FROM requests').get();
  assert.equal(saved.key, keys[winner]);
  assert.deepEqual(JSON.parse(saved.result), responses[winner].body);
});

test('simultaneous identical receipt retries increment stock and revision once', async t => {
  const { db, post, stock, total } = await fixture(t, 'duluth');
  const before = stock('green-tea');
  const key = randomUUID();
  const body = { line: 'demo-line', quantity: '5', unit: 'bag', receiver: 'Regression receiver' };
  const responses = await Promise.all([post('receipts', body, key), post('receipts', body, key)]);
  assert.deepEqual(responses.map(row => row.status), [200, 200]);
  assert.deepEqual(responses[0].body, responses[1].body);
  assert.deepEqual(stock('green-tea'), { ...before, on_hand: before.on_hand + 5000, revision: before.revision + 1 });
  for (const table of ['receipts', 'movements', 'requests']) assert.equal(total(table), 1, table);
  const receipt = db.prepare('SELECT * FROM receipts').get();
  assert.equal(receipt.id, responses[0].body.id);
  assert.equal(receipt.quantity, 5000);
  assert.equal(db.prepare('SELECT received FROM delivery_lines WHERE id = ?').get('demo-line').received, 5000);
  const movement = db.prepare('SELECT * FROM movements').get();
  assert.equal(movement.reference, receipt.id);
  assert.equal(movement.type, 'supplier_receipt');
  assert.equal(movement.delta, 5000);
  assert.equal(movement.balance, before.on_hand + 5000);
  assert.equal(movement.actor, 'duluth');
  const saved = db.prepare('SELECT actor, key, result FROM requests').get();
  assert.equal(saved.actor, 'duluth');
  assert.equal(saved.key, key);
  assert.deepEqual(JSON.parse(saved.result), responses[0].body);
});

test('reusing a receipt key with a different payload returns conflict without any writes', async t => {
  const { db, post, accepted } = await fixture(t, 'duluth');
  const key = randomUUID();
  const body = { line: 'demo-line', quantity: '5', unit: 'bag', receiver: 'Regression receiver' };
  await accepted('receipts', body, key);
  const state = () => ['stock', 'delivery_lines', 'receipts', 'movements', 'requests'].map(table =>
    db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const before = state();
  assert.equal((await post('receipts', { ...body, quantity: '6' }, key)).status, 409);
  assert.deepEqual(state(), before);
});

test('a later category conflict preserves an earlier committed category without partial failed lines', async t => {
  const { db, post, accepted, stock, total, sheet } = await fixture(t);
  const { id: secondTopping } = await accepted('items', {
    name: 'Regression topping', category: 'Topping', unit: 'bag',
  });
  const freshTopping = stock(secondTopping);
  const staleTopping = stock('tapioca');
  const pending = { ...sheet(secondTopping, '3', freshTopping.revision), lines: [
    { item: secondTopping, quantity: '3', revision: freshTopping.revision },
    { item: 'tapioca', quantity: '8', revision: staleTopping.revision },
  ] };
  await accepted('counts', { location: 'duluth', item: 'tapioca', quantity: '10', unit: 'bag', revision: staleTopping.revision });
  const tea = stock('green-tea');
  const first = await accepted('count-sheets', sheet('green-tea', '22', tea.revision));
  const toppingAfterInterveningCount = stock('tapioca');
  const requests = total('requests');
  const movements = total('movements');
  const key = randomUUID();
  assert.equal((await post('count-sheets', pending, key)).status, 409);
  assert.deepEqual(stock('green-tea'), { ...tea, on_hand: 22000, revision: tea.revision + 1 });
  assert.deepEqual(stock(secondTopping), freshTopping);
  assert.deepEqual(stock('tapioca'), toppingAfterInterveningCount);
  assert.equal(total('count_sheets'), 1);
  assert.equal(total('count_lines'), 1);
  assert.equal(db.prepare('SELECT sheet_id FROM count_lines').get().sheet_id, first.id);
  assert.equal(total('movements'), movements);
  assert.equal(total('requests'), requests);
  assert.equal(db.prepare('SELECT 1 FROM requests WHERE key = ?').get(key), undefined);
});

test('a later standalone count invalidates an older sheet for counted receipts without partial writes', async t => {
  const { db, post, accepted, stock, sheet } = await fixture(t);
  const counted = await accepted('count-sheets', sheet('green-tea', '26', stock('green-tea').revision));
  const receipt = { line: 'demo-line', quantity: '2', unit: 'bag', receiver: 'Regression receiver', countSheet: counted.id };
  // Establish that the same sheet is eligible before the standalone count.
  await accepted('receipts', receipt);
  await accepted('counts', { location: 'duluth', item: 'green-tea', quantity: '25', unit: 'bag', revision: stock('green-tea').revision });
  const state = () => ['stock', 'delivery_lines', 'receipts', 'movements', 'counted_receipts', 'requests'].map(table =>
    db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const before = state();
  assert.equal((await post('receipts', receipt)).status, 409);
  assert.deepEqual(state(), before);
});
