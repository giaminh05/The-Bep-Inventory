import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openDatabase } from '../../../server/db.mjs';
import { applyAction, readHistory, readReport } from '../../../server/inventory.mjs';
import { atlantaDay, atlantaWeek, quantityToScaled, usageBetweenCounts } from '../src/index.ts';

test('shared quantity conversion preserves legacy count acceptance and scaled results', () => {
  const db = openDatabase(':memory:', { demo: true });
  const user = db.prepare("SELECT id,role,location_id FROM users WHERE id='manager'").get();
  const cases = [
    ['green-tea', '2', 'case', 24000],
    ['green-tea', '0.125', 'case', 1500],
    ['green-tea', '0', 'bag', 0],
    ['green-tea', 1.125, 'bag', 1125],
    ['green-tea', '1000000000', 'bag', 1000000000000],
    ['cup-23', '2', 'bag', 100000],
    ['cup-23', '0.02', 'bag', 1000],
    ['cup-23', '0.001', 'bag', null],
    ['green-tea', '1.0001', 'bag', null],
    ['green-tea', '-1', 'bag', null],
    ['green-tea', '1e3', 'bag', null],
    ['green-tea', '', 'bag', null],
    ['green-tea', false, 'bag', null],
    ['green-tea', '1', 'unknown', null],
    ['green-tea', '1000000001', 'bag', null],
    ['green-tea', '1000000000', 'case', null],
  ] as const;
  try {
    for (const [item, input, unit, expected] of cases) {
      const row = db.prepare('SELECT base_unit,units FROM items WHERE id=?').get(item);
      const definition = { baseUnit: row.base_unit, units: JSON.parse(row.units) };
      const revision = db.prepare("SELECT revision FROM stock WHERE location_id='duluth' AND item_id=?").get(item).revision;
      const legacy = () => applyAction(db, user, 'counts', randomUUID(), {
        location: 'duluth', item, quantity: input, unit, revision,
      });
      const shared = () => quantityToScaled(definition, input, unit, { allowZero: true });
      if (expected === null) {
        assert.throws(legacy, { status: 400 }, String(input));
        assert.throws(shared, { status: 400 }, String(input));
      } else {
        assert.equal(shared(), expected, `${item}/${unit}/${input}`);
        assert.equal(legacy().onHand * 1000, expected);
      }
    }
  } finally { db.close(); }
});

test('shared quantity validation preserves receipt zero restrictions and explicit maximums', () => {
  const tea = { baseUnit: 'bag', units: { bag: 1, case: 12 } };
  assert.throws(() => quantityToScaled(tea, '0', 'bag'), { status: 400 });
  assert.equal(quantityToScaled(tea, '0', 'bag', { allowZero: true }), 0);
  assert.equal(quantityToScaled(tea, '2', 'bag', { maximum: 2000 }), 2000);
  assert.throws(() => quantityToScaled(tea, '2.001', 'bag', { maximum: 2000 }), { status: 400 });
});

test('Atlanta helpers preserve literal DST days and the server report week boundaries', () => {
  const cases = [
    ['2026-11-09T04:59:59Z', '2026-11-08', '2026-11-02'],
    ['2026-11-09T05:00:00Z', '2026-11-09', '2026-11-09'],
    ['2026-07-13T03:59:59Z', '2026-07-12', '2026-07-06'],
    ['2026-07-13T04:00:00Z', '2026-07-13', '2026-07-13'],
    ['2026-03-08T06:59:59Z', '2026-03-08', '2026-03-02'],
    ['2026-03-08T07:00:00Z', '2026-03-08', '2026-03-02'],
    ['2026-11-01T05:30:00Z', '2026-11-01', '2026-10-26'],
    ['2026-11-01T06:30:00Z', '2026-11-01', '2026-10-26'],
  ];
  for (const [timestamp, day, week] of cases) {
    assert.equal(atlantaDay(timestamp), day);
    assert.equal(atlantaWeek(timestamp), week);
    const db = openDatabase(':memory:', { demo: true });
    try {
      const manager = db.prepare("SELECT id,role,location_id FROM users WHERE id='manager'").get();
      const sheet = applyAction(db, manager, 'count-sheets', randomUUID(), {
        location: 'duluth', category: 'Trà', performedBy: 'Domain parity',
        lines: [{ item: 'green-tea', quantity: '25', revision: 0 }],
      });
      db.prepare('UPDATE count_sheets SET submitted_at=? WHERE id=?').run(timestamp, sheet.id);
      db.prepare('UPDATE movements SET created_at=? WHERE reference=?').run(timestamp, sheet.id);
      const report = readReport(db, manager, 'duluth', week);
      assert.equal(report.rows.find(row => row.item_id === 'green-tea').ending, 25);
      const history = readHistory(db, manager, 'duluth', null, '', { from: day, to: day });
      assert.equal(history.entries.length, 1);
    } finally { db.close(); }
  }
});

test('usage preserves missing count boundaries, explicit zero and negative outcomes', () => {
  assert.equal(usageBetweenCounts({ beginning: 24, ending: 20, purchases: 5, incoming: 3, outgoing: 2 }), 10);
  assert.equal(usageBetweenCounts({ beginning: 0, ending: 0 }), 0);
  assert.equal(usageBetweenCounts({ beginning: null, ending: 0, purchases: 5 }), null);
  assert.equal(usageBetweenCounts({ beginning: 10, ending: null }), null);
  assert.equal(usageBetweenCounts({ beginning: 2, ending: 5 }), -3);
  assert.equal(usageBetweenCounts({ beginning: 0.1, ending: 0.3, purchases: 0.2 }), 0);

  const db = openDatabase(':memory:', { demo: true });
  try {
    const manager = db.prepare("SELECT id,role,location_id FROM users WHERE id='manager'").get();
    db.prepare("INSERT INTO opening_balances VALUES ('duluth','green-tea',24000,'2026-11-01T12:00:00Z')").run();
    applyAction(db, manager, 'receipts', randomUUID(), {
      line: 'demo-line', quantity: '5', unit: 'bag', receiver: 'Domain parity',
    });
    const sheet = applyAction(db, manager, 'count-sheets', randomUUID(), {
      location: 'duluth', category: 'Trà', performedBy: 'Domain parity',
      lines: [{ item: 'green-tea', quantity: '26', revision: 1 }],
    });
    db.prepare('UPDATE count_sheets SET submitted_at=? WHERE id=?').run('2026-11-19T15:00:00Z', sheet.id);
    const row = readReport(db, manager, 'duluth', '2026-11-16').rows.find(row => row.item_id === 'green-tea');
    assert.equal(row.usage, 3);
    assert.equal(usageBetweenCounts({ beginning: row.beginning, ending: row.ending, purchases: row.purchases,
      incoming: row.incoming, outgoing: row.outgoing }), 3);
  } finally { db.close(); }
});
