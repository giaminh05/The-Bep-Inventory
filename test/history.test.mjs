import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

async function fixture(t) {
  const db = openDatabase(':memory:', { demo: true });
  const server = inventoryServer({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => {
    db.close();
    if (error) reject(error);
    else resolve();
  })));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(path, { token, body, status = 200 } = {}) {
    const response = await fetch(origin + '/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token && { Authorization: 'Bearer ' + token }),
        ...(body !== undefined && { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status, path);
    return response.json();
  }
  async function login(username) {
    return (await request('login', { body: { username, password: 'BepDemo2026!' } })).token;
  }
  const token = await login('manager');
  const history = (filters = {}, status = 200, actor = token) =>
    request('history?' + new URLSearchParams(filters), { token: actor, status });
  // Timestamp and large-ledger fixtures do not change balances or operational data.
  const insert = db.prepare(`INSERT INTO movements
    (location_id, item_id, type, delta, balance, actor, reference, note, created_at)
    VALUES (?, ?, ?, 0, 24000, 'manager', NULL, ?, ?)`);
  function movement(timestamp, { location = 'duluth', item = 'green-tea', type = 'count', note = '' } = {}) {
    return Number(insert.run(location, item, type, note, timestamp).lastInsertRowid);
  }
  return { db, token, request, login, history, movement };
}

test('history filters work independently and combine by intersection', async t => {
  const { db, token, request, history, movement } = await fixture(t);
  const sheet = await request('count-sheets', { token, body: {
    location: 'duluth', category: 'Trà', performedBy: 'Đặng Ánh', note: 'Kiểm cuối ngày',
    lines: [{ item: 'green-tea', quantity: '24', revision: 0 }],
  } });
  const sheetId = db.prepare('SELECT movement_id FROM count_lines WHERE sheet_id = ?').get(sheet.id).movement_id;
  db.prepare('UPDATE movements SET created_at = ? WHERE id = ?').run('2026-11-19T15:00:00Z', sheetId);
  const older = movement('2026-11-07T15:00:00Z', { location: 'norcross', item: 'tapioca', note: 'Đối chiếu' });
  const receipt = movement('2026-11-19T16:00:00Z', { type: 'supplier_receipt' });
  const later = movement('2026-11-20T15:00:00Z', { location: 'johns-creek', item: 'cup-23' });
  const cases = [
    [{}, [later, receipt, older, sheetId]],
    [{ person: '', from: '', to: '', type: '', order: '', location: '', q: '' }, [later, receipt, older, sheetId]],
    [{ from: '2026-11-19' }, [later, receipt, sheetId]],
    [{ to: '2026-11-19' }, [receipt, older, sheetId]],
    [{ from: '2026-11-19', to: '2026-11-19' }, [receipt, sheetId]],
    [{ person: 'dang anh' }, [sheetId]],
    [{ person: 'manager' }, [later, receipt, older, sheetId]],
    [{ location: 'norcross' }, [older]],
    [{ q: 'TOP-001' }, [older]],
    [{ q: 'doi chieu' }, [older]],
    [{ q: 'dang anh' }, [sheetId]],
    [{ type: 'sheet_count' }, [sheetId]],
    [{ type: 'count' }, [later, older]],
    [{ type: 'counts' }, [later, older, sheetId]],
    [{ type: 'supplier_receipt' }, [receipt]],
    [{ person: 'dang anh', location: 'duluth', q: 'TEA-001', type: 'counts',
      from: '2026-11-19', to: '2026-11-19', order: 'oldest' }, [sheetId]],
    [{ person: 'dang anh', location: 'norcross' }, []],
    [{ q: 'no matching product' }, []],
  ];
  for (const [filters, expected] of cases) {
    const result = await history(filters);
    assert.deepEqual(result.entries.map(row => row.id), expected, JSON.stringify(filters));
    assert.equal(result.next, null);
  }
  const [entry] = (await history({ person: 'dang anh' })).entries;
  assert.equal(entry.performed_by, 'Đặng Ánh');
  assert.equal(entry.actor, 'manager');
  assert.equal(entry.actor_name, 'Quản lý');
});

test('history includes complete Atlanta calendar days across seasons and DST changes', async t => {
  const { history, movement } = await fixture(t);
  const days = [
    ['2026-01-15', '2026-01-15T05:00:00Z', '2026-01-16T05:00:00Z'],
    ['2026-07-15', '2026-07-15T04:00:00Z', '2026-07-16T04:00:00Z'],
    ['2026-03-08', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
    ['2026-11-01', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
  ];
  for (const [day, start, end] of days) {
    const before = movement(new Date(Date.parse(start) - 1).toISOString());
    const first = movement(start);
    const last = movement(new Date(Date.parse(end) - 1).toISOString());
    const after = movement(end);
    const ids = (await history({ from: day, to: day })).entries.map(row => row.id);
    assert.deepEqual(ids, [last, first], day);
    assert.ok(!ids.includes(before) && !ids.includes(after));
  }
  const first0130 = movement('2026-11-01T05:30:00Z');
  const second0130 = movement('2026-11-01T06:30:00Z');
  const ids = (await history({ from: '2026-11-01', to: '2026-11-01' })).entries.map(row => row.id);
  assert.ok(ids.includes(first0130) && ids.includes(second0130), 'both fall-back 01:30 instants belong to Atlanta November 1');
});

test('filtered history pagination has no gaps or duplicates in either direction', async t => {
  const { history, movement } = await fixture(t);
  const expected = [];
  for (let index = 0; index < 123; index++) {
    // Deliberately alternate timestamps: ordering and continuation follow ledger IDs.
    expected.push(movement(index % 2 ? '2026-11-19T15:00:00Z' : '2026-11-19T16:00:00Z', { note: 'target' }));
    movement('2026-11-19T15:00:00Z', { location: 'norcross', note: 'target' });
    movement('2026-11-19T15:00:00Z', { type: 'supplier_receipt', note: 'target' });
    movement('2026-11-20T15:00:00Z', { note: 'target' });
    movement('2026-11-19T15:00:00Z', { note: 'excluded' });
  }
  for (const order of ['oldest', 'newest']) {
    const collected = [];
    const sizes = [];
    let cursor;
    for (let page = 0; page < 4; page++) {
      const result = await history({ location: 'duluth', q: 'target', type: 'count',
        from: '2026-11-19', to: '2026-11-19', order, ...(cursor !== undefined && { before: cursor }) });
      const ids = result.entries.map(row => row.id);
      sizes.push(ids.length);
      collected.push(...ids);
      if (result.next === null) break;
      assert.equal(result.next, ids.at(-1));
      cursor = result.next;
    }
    assert.deepEqual(sizes, [50, 50, 23], order);
    assert.deepEqual(collected, order === 'oldest' ? expected : [...expected].reverse(), order);
    assert.equal(new Set(collected).size, expected.length);
  }
});

test('history pagination returns a terminal cursor for exactly fifty matches', async t => {
  const { history, movement } = await fixture(t);
  for (let index = 0; index < 50; index++) movement('2026-11-19T15:00:00Z');
  for (const order of ['oldest', 'newest']) {
    const result = await history({ order });
    assert.equal(result.entries.length, 50);
    assert.equal(result.next, null);
    const end = await history({ order, before: result.entries.at(-1).id });
    assert.deepEqual(end, { entries: [], next: null });
  }
});

test('history rejects invalid filters and denies staff access', async t => {
  const { history, login } = await fixture(t);
  for (const filters of [
    { from: '2026-02-30' }, { to: '2026-13-01' }, { from: '19/11/2026' },
    { from: '2026-11-20', to: '2026-11-19' }, { type: 'unknown' }, { order: 'ascending' },
    { before: '-1' }, { before: '1.5' }, { before: 'not-a-cursor' }, { before: '9007199254740992' },
    { before: '0', order: 'newest' },
  ]) {
    const result = await history(filters, 400);
    assert.equal(typeof result.error, 'string', JSON.stringify(filters));
  }
  assert.deepEqual(await history({ before: '0', order: 'oldest' }), { entries: [], next: null });
  const staff = await login('duluth');
  await history({}, 403, staff);
  await history({ location: 'duluth', from: '2026-11-19', type: 'counts' }, 403, staff);
});
