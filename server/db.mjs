import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const scale = 1000;
export const maxStock = 1_000_000_000 * scale;
export const locations = [
  ['duluth', 'Duluth', 'store'],
  ['johns-creek', 'Johns Creek', 'store'],
  ['norcross', 'Norcross', 'store'],
  ['dl-house', 'Kho DL House', 'warehouse'],
  ['extra', 'Kho Extra', 'warehouse'],
];
const items = [
  ['green-tea', 'TEA-001', 'Trà xanh', 'Trà', 'bag', { bag: 1, case: 12 }],
  ['tapioca', 'TOP-001', 'Trân châu', 'Topping', 'bag', { bag: 1, case: 6 }],
  ['cup-23', 'PKG-023', 'Ly 23 oz', 'Bao bì', 'each', { each: 1, bag: 50, case: 500 }],
];
const balances = [[24, 14, 900], [15, 9, 500], [9, 6, 400], [48, 36, 1500], [12, 8, 300]];
const thresholds = [[8, 5, 250], [6, 4, 200], [5, 3, 150], [12, 12, 500], [4, 3, 100]];

export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const computed = passwordHash(password, salt).split(':')[1];
  return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(path, { demo = false } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.function('search_text', { deterministic: true }, value => String(value ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim());
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL,
      category TEXT NOT NULL, base_unit TEXT NOT NULL, units TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('manager','staff')),
      location_id TEXT REFERENCES locations(id), password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock (
      location_id TEXT REFERENCES locations(id), item_id TEXT REFERENCES items(id),
      on_hand INTEGER NOT NULL CHECK(on_hand >= 0), threshold INTEGER CHECK(threshold >= 0),
      revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(location_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY, location_id TEXT NOT NULL, item_id TEXT NOT NULL,
      type TEXT NOT NULL, delta INTEGER NOT NULL, balance INTEGER NOT NULL,
      actor TEXT NOT NULL REFERENCES users(id), reference TEXT, note TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(location_id, item_id) REFERENCES stock(location_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id),
      supplier TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS delivery_lines (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id),
      item_id TEXT NOT NULL REFERENCES items(id), expected INTEGER NOT NULL CHECK(expected > 0),
      received INTEGER NOT NULL DEFAULT 0 CHECK(received >= 0 AND received <= expected),
      UNIQUE(delivery_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES delivery_lines(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0), note TEXT, created_at TEXT NOT NULL,
      actor TEXT NOT NULL REFERENCES users(id), photo_type TEXT, photo BLOB
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES locations(id),
      destination TEXT NOT NULL REFERENCES locations(id), item_id TEXT NOT NULL REFERENCES items(id),
      sent INTEGER NOT NULL CHECK(sent > 0), received INTEGER NOT NULL DEFAULT 0 CHECK(received >= 0),
      shortage INTEGER NOT NULL DEFAULT 0 CHECK(shortage >= 0),
      dispatched_at TEXT NOT NULL, closed_at TEXT, note TEXT,
      actor TEXT NOT NULL REFERENCES users(id), CHECK(source <> destination)
    );
    CREATE TABLE IF NOT EXISTS transfer_receipts (
      id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES transfers(id),
      quantity INTEGER NOT NULL CHECK(quantity >= 0), discrepancy INTEGER NOT NULL,
      final INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL,
      actor TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS requests (
      actor TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, fingerprint TEXT NOT NULL,
      result TEXT NOT NULL, PRIMARY KEY(actor, key)
    );
    CREATE INDEX IF NOT EXISTS movements_by_location ON movements(location_id, id);
    CREATE INDEX IF NOT EXISTS receipts_by_line ON receipts(line_id);
    CREATE INDEX IF NOT EXISTS transfers_by_source ON transfers(source);
    CREATE INDEX IF NOT EXISTS transfers_by_destination ON transfers(destination);
  `);
  migrateInventory(db);
  if (demo) transaction(db, () => seedDemo(db));
  return db;
}

function migrateInventory(db) {
  transaction(db, () => {
    if (!db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'system_threshold'").get()) {
      db.exec('ALTER TABLE items ADD COLUMN system_threshold INTEGER CHECK(system_threshold >= 0)');
    }
    for (const table of ['receipts', 'transfer_receipts']) {
      if (!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, 'receiver')) {
        db.exec('ALTER TABLE ' + table + ' ADD COLUMN receiver TEXT');
      }
    }
    if (!db.prepare("SELECT 1 FROM pragma_table_info('transfers') WHERE name = 'batch_id'").get()) {
      db.exec('ALTER TABLE transfers ADD COLUMN batch_id TEXT; CREATE INDEX transfers_by_batch ON transfers(batch_id)');
    }
    if (!db.prepare("SELECT 1 FROM pragma_table_info('movements') WHERE name = 'balance_known'").get()) {
      db.exec(`
        ALTER TABLE movements ADD COLUMN balance_known INTEGER NOT NULL DEFAULT 1 CHECK(balance_known IN (0,1));
        ALTER TABLE movements ADD COLUMN delta_known INTEGER NOT NULL DEFAULT 1 CHECK(delta_known IN (0,1));
      `);
    }
    if (db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'supplier'").get()) return;
    db.exec(`
      ALTER TABLE items ADD COLUMN supplier TEXT NOT NULL DEFAULT '';
      ALTER TABLE items ADD COLUMN pack TEXT NOT NULL DEFAULT '';
      ALTER TABLE items ADD COLUMN cost_usd INTEGER CHECK(cost_usd >= 0);
      ALTER TABLE stock ADD COLUMN known INTEGER NOT NULL DEFAULT 1 CHECK(known IN (0,1));
      CREATE TABLE count_sheets (
        id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id),
        category TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id), performed_by TEXT NOT NULL, note TEXT, submitted_at TEXT NOT NULL
      );
      CREATE TABLE count_lines (
        sheet_id TEXT NOT NULL REFERENCES count_sheets(id), item_id TEXT NOT NULL REFERENCES items(id),
        before INTEGER, counted INTEGER NOT NULL CHECK(counted >= 0),
        movement_id INTEGER NOT NULL UNIQUE REFERENCES movements(id), PRIMARY KEY(sheet_id, item_id)
      );
      CREATE TABLE counted_receipts (
        movement_id INTEGER PRIMARY KEY REFERENCES movements(id),
        count_movement_id INTEGER NOT NULL REFERENCES count_lines(movement_id),
        quantity INTEGER NOT NULL CHECK(quantity > 0)
      );
      CREATE TABLE opening_balances (
        location_id TEXT NOT NULL, item_id TEXT NOT NULL, balance INTEGER NOT NULL,
        imported_at TEXT NOT NULL, PRIMARY KEY(location_id, item_id),
        FOREIGN KEY(location_id, item_id) REFERENCES stock(location_id, item_id)
      );
      CREATE INDEX count_sheets_location ON count_sheets(location_id, submitted_at);
      CREATE INDEX counted_receipts_count ON counted_receipts(count_movement_id);
      CREATE INDEX movements_location_item ON movements(location_id, item_id, id);
    `);
  });
}

function seedDemo(db) {
  if (db.prepare('SELECT 1 FROM locations LIMIT 1').get()) return;
  const addLocation = db.prepare('INSERT INTO locations VALUES (?, ?, ?)');
  const addItem = db.prepare('INSERT INTO items (id, sku, name, category, base_unit, units) VALUES (?, ?, ?, ?, ?, ?)');
  const addUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)');
  const addBalance = db.prepare('INSERT INTO stock (location_id, item_id, on_hand, threshold) VALUES (?, ?, ?, ?)');
  locations.forEach(location => addLocation.run(...location));
  items.forEach(([id, sku, name, category, unit, units]) =>
    addItem.run(id, sku, name, category, unit, JSON.stringify(units)));
  addUser.run('manager', 'Quản lý', 'manager', null, passwordHash('BepDemo2026!'));
  locations.forEach(([id, name], index) => {
    addUser.run(id, 'Nhân viên ' + name, 'staff', id, passwordHash('BepDemo2026!'));
    items.forEach(([item], itemIndex) =>
      addBalance.run(id, item, balances[index][itemIndex] * scale, thresholds[index][itemIndex] * scale));
  });
  db.prepare('INSERT INTO deliveries VALUES (?, ?, ?, ?, ?, ?)').run(
    'demo-delivery', 'duluth', 'Nhà cung cấp mẫu', 'Đơn mẫu để thử nhận từng phần',
    new Date().toISOString(), 'manager');
  db.prepare('INSERT INTO delivery_lines (id, delivery_id, item_id, expected) VALUES (?, ?, ?, ?)').run(
    'demo-line', 'demo-delivery', 'green-tea', 12 * scale);
}
