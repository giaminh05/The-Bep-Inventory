import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction } from '../server/db.mjs';

const backupScript = fileURLToPath(new URL('../scripts/backup-database.mjs', import.meta.url));
const dbModule = new URL('../server/db.mjs', import.meta.url).href;
const stamp = '2026-11-19T12:00:00.000Z';
const photo = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 19]);

function temporaryDirectory(t) {
  const root = realpathSync(tmpdir());
  const directory = mkdtempSync(join(root, 'bep-db-rehearsal-'));
  t.after(() => {
    const target = realpathSync(directory);
    const child = relative(root, target);
    assert.ok(isAbsolute(target) && child && !child.startsWith('..') && !isAbsolute(child));
    assert.ok(target.startsWith(root + sep));
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}

function runBackup(source, destination) {
  return spawnSync(process.execPath, [backupScript, source, destination], { encoding: 'utf8', timeout: 30_000 });
}

function checkedDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function addFixture(db) {
  transaction(db, () => {
    db.exec(`
      INSERT INTO locations VALUES ('duluth','Duluth','store'), ('extra','Kho Extra','warehouse');
      INSERT INTO items (id,sku,name,category,base_unit,units) VALUES ('tea','TEA-1','Tea','Tea','bag','{"bag":1,"case":12}');
      INSERT INTO users VALUES ('manager','Manager','manager',NULL,'synthetic-test-only');
      INSERT INTO sessions VALUES ('synthetic-session-hash','manager',0);
      INSERT INTO stock (location_id,item_id,on_hand,threshold,revision,known) VALUES ('duluth','tea',12345,1000,7,1),('extra','tea',0,NULL,0,0);
      INSERT INTO movements (id,location_id,item_id,type,delta,balance,actor,reference,note,created_at,balance_known,delta_known)
        VALUES (1,'duluth','tea','sheet_count',12345,12345,'manager','sheet','fixture','${stamp}',1,1);
      INSERT INTO count_sheets VALUES ('sheet','duluth','Tea','manager','Test operator','fixture','${stamp}');
      INSERT INTO count_lines VALUES ('sheet','tea',0,12345,1);
      INSERT INTO deliveries VALUES ('delivery','duluth','Test supplier','fixture','${stamp}','manager');
      INSERT INTO delivery_lines VALUES ('line','delivery','tea',2000,1000);
      INSERT INTO transfers (id,source,destination,item_id,sent,received,shortage,dispatched_at,actor,batch_id)
        VALUES ('transfer','duluth','extra','tea',1000,500,0,'${stamp}','manager','batch');
      INSERT INTO transfer_receipts VALUES ('transfer-receipt','transfer',500,0,0,'fixture','${stamp}','manager','Test receiver');
      INSERT INTO opening_balances VALUES ('duluth','tea',0,'${stamp}');
      INSERT INTO requests VALUES ('manager','fixture-key','fixture-fingerprint','{"ok":true}');
    `);
    db.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?,?)').run('receipt', 'line', 1000, 'fixture', stamp, 'manager', 'image/png', photo, 'Test receiver');
  });
}

function assertFixture(db) {
  assert.deepEqual({ ...db.prepare("SELECT on_hand,revision,known FROM stock WHERE location_id='duluth'").get() }, { on_hand: 12345, revision: 7, known: 1 });
  assert.deepEqual({ ...db.prepare("SELECT on_hand,known FROM stock WHERE location_id='extra'").get() }, { on_hand: 0, known: 0 });
  assert.deepEqual({ ...db.prepare('SELECT delta,balance,actor,reference FROM movements').get() }, { delta: 12345, balance: 12345, actor: 'manager', reference: 'sheet' });
  for (const table of ['count_sheets', 'count_lines', 'deliveries', 'delivery_lines', 'receipts', 'transfers', 'transfer_receipts', 'opening_balances', 'requests', 'sessions']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 1, table);
  }
  assert.equal(db.prepare('SELECT received FROM delivery_lines').get().received, 1000);
  assert.equal(db.prepare('SELECT received FROM transfers').get().received, 500);
  assert.deepEqual(Buffer.from(db.prepare('SELECT photo FROM receipts').get().photo), photo);
  assert.deepEqual({ ...db.prepare('SELECT key,fingerprint,result FROM requests').get() }, { key: 'fixture-key', fingerprint: 'fixture-fingerprint', result: '{"ok":true}' });
}

test('online backup includes committed active WAL and restores documents, ledger, photo and replay records after reopening', t => {
  const directory = temporaryDirectory(t);
  const source = join(directory, 'source.sqlite');
  const destination = join(directory, 'backup.sqlite');
  const restored = join(directory, 'restored.sqlite');
  const writer = openDatabase(source);
  try {
    writer.exec('PRAGMA wal_autocheckpoint = 0');
    addFixture(writer);
    assert.ok(statSync(source + '-wal').size > 32);
    writer.exec("BEGIN IMMEDIATE; UPDATE stock SET on_hand=999999 WHERE location_id='duluth'");
    // A raw main-file copy loses committed WAL; the separate uncommitted write must stay out.
    const result = runBackup(source, destination);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Backup verified\./);
    const backup = checkedDatabase(destination);
    try { assertFixture(backup); } finally { backup.close(); }
    writer.exec('ROLLBACK');
    assert.equal(runBackup(destination, restored).status, 0);
  } finally {
    if (writer.isTransaction) writer.exec('ROLLBACK');
    writer.close();
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = openDatabase(restored);
    try {
      assertFixture(db);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { db.close(); }
  }
});

test('backup refuses same path, existing destination/alias/sidecars and missing source without overwriting bytes', t => {
  const directory = temporaryDirectory(t);
  const source = join(directory, 'source.sqlite');
  const db = openDatabase(source);
  addFixture(db);
  db.close();
  const original = createHash('sha256').update(readFileSync(source)).digest('hex');
  const occupied = join(directory, 'occupied.sqlite');
  writeFileSync(occupied, 'KEEP');
  const alias = join(directory, 'alias.sqlite');
  linkSync(source, alias);
  const sidecar = join(directory, 'sidecar.sqlite');
  writeFileSync(sidecar + '-wal', 'KEEP WAL');
  const missing = join(directory, 'missing.sqlite');
  for (const [input, output] of [[source, source], [source, occupied], [source, alias], [source, sidecar], [missing, join(directory, 'not-created.sqlite')]]) {
    const result = runBackup(input, output);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /synthetic-session-hash|fixture-fingerprint|synthetic-test-only/);
  }
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), original);
  assert.equal(readFileSync(occupied, 'utf8'), 'KEEP');
  assert.equal(readFileSync(sidecar + '-wal', 'utf8'), 'KEEP WAL');
  assert.equal(existsSync(sidecar), false);
  assert.equal(existsSync(missing), false);
  assert.equal(existsSync(join(directory, 'not-created.sqlite')), false);
});

test('backup rejects source sidecar names before a later SQLite write can delete the backup', t => {
  const directory = temporaryDirectory(t);
  const source = join(directory, 'source.sqlite');
  const db = new DatabaseSync(source);
  db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE fixture (id INTEGER PRIMARY KEY); INSERT INTO fixture VALUES (1)');
  db.close();
  const original = createHash('sha256').update(readFileSync(source)).digest('hex');
  const suffixes = ['-wal', '-shm', '-journal'];
  if (process.platform === 'win32') suffixes.push('-JOURNAL');
  for (const suffix of suffixes) {
    const destination = source + suffix;
    const result = runBackup(source, destination);
    assert.notEqual(result.status, 0, 'must reject SQLite-managed source filename: ' + suffix);
    assert.equal(existsSync(destination), false);
  }
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), original);
  const reopened = new DatabaseSync(source);
  try {
    reopened.exec('INSERT INTO fixture VALUES (2)');
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM fixture').get().n, 2);
  } finally { reopened.close(); }
});

test('invalid SQLite or foreign-key violations fail validation without publishing a backup', t => {
  const directory = temporaryDirectory(t);
  const invalid = join(directory, 'invalid.sqlite');
  writeFileSync(invalid, 'not a SQLite database');
  const foreignKey = join(directory, 'foreign-key.sqlite');
  const db = new DatabaseSync(foreignKey);
  db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (42)');
  db.close();
  for (const source of [invalid, foreignKey]) {
    const destination = source + '.backup';
    const result = runBackup(source, destination);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /^Backup failed\./);
    assert.equal(existsSync(destination), false);
  }
});

test('hard exit after WAL commit recovers the committed transaction and excludes the unfinished write', t => {
  const directory = temporaryDirectory(t);
  const source = join(directory, 'crash.sqlite');
  const destination = join(directory, 'recovered-backup.sqlite');
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { openDatabase, transaction } from ${JSON.stringify(dbModule)};
    const stamp = ${JSON.stringify(stamp)};
    const photo = Buffer.from(${JSON.stringify([...photo])});
    ${addFixture.toString()}
    const db = openDatabase(process.argv[1]);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA wal_autocheckpoint=0');
    addFixture(db);
    db.exec("BEGIN IMMEDIATE; UPDATE stock SET on_hand=999999 WHERE location_id='duluth'");
    process.exit(73);
  `, source], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.status, 73, child.stderr);
  assert.ok(statSync(source + '-wal').size > 32);
  const result = runBackup(source, destination);
  assert.equal(result.status, 0, result.stderr);
  const backup = checkedDatabase(destination);
  try { assertFixture(backup); } finally { backup.close(); }
  const recovered = openDatabase(source);
  try { assertFixture(recovered); } finally { recovered.close(); }
  const reopened = checkedDatabase(source);
  try { assertFixture(reopened); } finally { reopened.close(); }
});

// Frozen pre-additive inventory schema, not derived from current migration code.
// This is one supported predecessor shape, not an arbitrary partial/broken DB.
const legacySchema = `
  PRAGMA foreign_keys=ON;
  CREATE TABLE locations (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL);
  CREATE TABLE items (id TEXT PRIMARY KEY,sku TEXT UNIQUE,name TEXT NOT NULL,category TEXT NOT NULL,base_unit TEXT NOT NULL,units TEXT NOT NULL);
  CREATE TABLE users (id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('manager','staff')),location_id TEXT REFERENCES locations(id),password TEXT NOT NULL);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE stock (location_id TEXT REFERENCES locations(id),item_id TEXT REFERENCES items(id),on_hand INTEGER NOT NULL CHECK(on_hand>=0),threshold INTEGER CHECK(threshold>=0),revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(location_id,item_id));
  CREATE TABLE movements (id INTEGER PRIMARY KEY,location_id TEXT NOT NULL,item_id TEXT NOT NULL,type TEXT NOT NULL,delta INTEGER NOT NULL,balance INTEGER NOT NULL,actor TEXT NOT NULL REFERENCES users(id),reference TEXT,note TEXT,created_at TEXT NOT NULL,FOREIGN KEY(location_id,item_id) REFERENCES stock(location_id,item_id));
  CREATE TABLE deliveries (id TEXT PRIMARY KEY,location_id TEXT NOT NULL REFERENCES locations(id),supplier TEXT NOT NULL,note TEXT,created_at TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id));
  CREATE TABLE delivery_lines (id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL REFERENCES deliveries(id),item_id TEXT NOT NULL REFERENCES items(id),expected INTEGER NOT NULL CHECK(expected>0),received INTEGER NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=expected),UNIQUE(delivery_id,item_id));
  CREATE TABLE receipts (id TEXT PRIMARY KEY,line_id TEXT NOT NULL REFERENCES delivery_lines(id),quantity INTEGER NOT NULL CHECK(quantity>0),note TEXT,created_at TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id),photo_type TEXT,photo BLOB);
  CREATE TABLE transfers (id TEXT PRIMARY KEY,source TEXT NOT NULL REFERENCES locations(id),destination TEXT NOT NULL REFERENCES locations(id),item_id TEXT NOT NULL REFERENCES items(id),sent INTEGER NOT NULL CHECK(sent>0),received INTEGER NOT NULL DEFAULT 0 CHECK(received>=0),shortage INTEGER NOT NULL DEFAULT 0 CHECK(shortage>=0),dispatched_at TEXT NOT NULL,closed_at TEXT,note TEXT,actor TEXT NOT NULL REFERENCES users(id),CHECK(source<>destination));
  CREATE TABLE transfer_receipts (id TEXT PRIMARY KEY,transfer_id TEXT NOT NULL REFERENCES transfers(id),quantity INTEGER NOT NULL CHECK(quantity>=0),discrepancy INTEGER NOT NULL,final INTEGER NOT NULL,note TEXT,created_at TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id));
  CREATE TABLE requests (actor TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,key));
`;

test('supported legacy schema upgrades additively with data intact and repeated reopening is idempotent', t => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(legacySchema);
  legacy.exec(`
    INSERT INTO locations VALUES ('duluth','Duluth','store'),('extra','Kho Extra','warehouse');
    INSERT INTO items VALUES ('tea','TEA-1','Tea','Tea','bag','{"bag":1,"case":12}');
    INSERT INTO users VALUES ('manager','Manager','manager',NULL,'synthetic-legacy-only');
    INSERT INTO sessions VALUES ('synthetic-legacy-hash','manager',0);
    INSERT INTO stock VALUES ('duluth','tea',12345,1000,7),('extra','tea',0,NULL,0);
    INSERT INTO movements VALUES (9,'duluth','tea','count',12345,12345,'manager','old-reference','old-note','${stamp}');
    INSERT INTO deliveries VALUES ('delivery','duluth','Test supplier','old-note','${stamp}','manager');
    INSERT INTO delivery_lines VALUES ('line','delivery','tea',2000,1000);
    INSERT INTO transfers VALUES ('transfer','duluth','extra','tea',1000,500,0,'${stamp}',NULL,'old-note','manager');
    INSERT INTO transfer_receipts VALUES ('transfer-receipt','transfer',500,0,0,'old-note','${stamp}','manager');
    INSERT INTO requests VALUES ('manager','old-key','old-fingerprint','{"ok":true}');
  `);
  legacy.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?)').run('receipt', 'line', 1000, 'old-note', stamp, 'manager', 'image/png', photo);
  const projections = legacy.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({ name }) => {
    const columns = legacy.prepare('SELECT name FROM pragma_table_info(?)').all(name).map(column => '"' + column.name + '"').join(',');
    const sql = `SELECT ${columns} FROM ${name} ORDER BY rowid`;
    return { sql, rows: legacy.prepare(sql).all() };
  });
  legacy.close();
  let schema;
  let allRows;
  for (let attempt = 0; attempt < 3; attempt++) {
    const migrated = openDatabase(path);
    try {
      for (const { sql, rows } of projections) assert.deepEqual(migrated.prepare(sql).all(), rows);
      assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.deepEqual({ ...migrated.prepare('SELECT known,revision FROM stock WHERE location_id=?').get('duluth') }, { known: 1, revision: 7 });
      assert.deepEqual({ ...migrated.prepare('SELECT balance_known,delta_known FROM movements').get() }, { balance_known: 1, delta_known: 1 });
      assert.deepEqual({ ...migrated.prepare('SELECT supplier,pack,cost_usd,system_threshold FROM items').get() }, { supplier: '', pack: '', cost_usd: null, system_threshold: null });
      assert.equal(migrated.prepare('SELECT receiver FROM receipts').get().receiver, null);
      assert.equal(migrated.prepare('SELECT receiver FROM transfer_receipts').get().receiver, null);
      assert.equal(migrated.prepare('SELECT batch_id FROM transfers').get().batch_id, null);
      for (const table of ['count_sheets', 'count_lines', 'counted_receipts', 'opening_balances', 'delegated_actions']) {
        assert.equal(migrated.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
      }
      const currentSchema = migrated.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all();
      const currentRows = migrated.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
        .map(({ name }) => ({ name, rows: migrated.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() }));
      if (attempt === 0) { schema = currentSchema; allRows = currentRows; }
      else { assert.deepEqual(currentSchema, schema); assert.deepEqual(currentRows, allRows); }
    } finally { migrated.close(); }
  }
});
