import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historySchema, reportSchema, stockSchema } from '../src/index.js';

test('stock wire contracts preserve null versus zero and additional server fields', () => {
  const unknown = { location_id: 'duluth', item_id: 'fixture', on_hand: null, threshold: null,
    revision: 0, known: 0, low: false, latest_count: null, future_field: 'preserved' };
  assert.deepEqual(stockSchema.parse(unknown), unknown);
  assert.equal(stockSchema.parse({ ...unknown, on_hand: 0, known: 1 }).on_hand, 0);
  assert.equal(stockSchema.safeParse({ ...unknown, known: false }).success, false);
});

test('history and reports keep nullable count boundaries and integer wire flags', () => {
  const entry = { id: 1, location_id: 'duluth', item_id: 'fixture', type: 'sheet_count', delta: null, balance: 0,
    actor: 'manager', reference: null, note: null, created_at: '2026-11-16T04:30:00Z', balance_known: 1,
    delta_known: 0, actor_name: 'Fixture manager', performed_by: null, already_counted: null };
  assert.deepEqual(historySchema.parse({ entries: [entry], next: null }).entries[0], entry);
  const row = { location_id: 'duluth', item_id: 'fixture', beginning: null, ending: 0, opening: false,
    beginningAt: null, endingAt: '2026-11-16T04:30:00Z', usage: null,
    purchases: 0, incoming: 0, outgoing: 0, onHand: 0, value: null };
  assert.deepEqual(reportSchema.parse({ week: '2026-11-09', rows: [row] }).rows[0], row);
});
