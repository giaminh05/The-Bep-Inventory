import { chmodSync, closeSync, fsyncSync, linkSync, lstatSync, mkdtempSync, openSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

function requireAbsent(path) {
  try { lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Destination or SQLite sidecar already exists.');
}

async function main() {
  if (process.argv.length !== 4) throw new Error('Expected source and fresh destination paths.');
  const source = realpathSync(resolve(process.argv[2]));
  const requested = resolve(process.argv[3]);
  const parent = realpathSync(dirname(requested));
  const destination = join(parent, basename(requested));
  const identity = path => process.platform === 'win32' ? path.toLowerCase() : path;
  if (!statSync(source).isFile() || ['', '-wal', '-shm', '-journal'].some(suffix =>
    identity(source + suffix) === identity(destination))) throw new Error('Invalid source or destination.');
  for (const suffix of ['', '-wal', '-shm', '-journal']) requireAbsent(destination + suffix);

  // sqlite.backup overwrites its target. Keep that target private, then publish
  // with a hard link: creating the final name fails atomically if it exists.
  const staging = mkdtempSync(join(parent, '.bep-backup-'));
  const temporary = join(staging, 'database.sqlite');
  let sourceDb;
  let verifyDb;
  try {
    chmodSync(staging, 0o700);
    // Do not use openDatabase here: it performs application schema migrations.
    sourceDb = new DatabaseSync(source, { readOnly: true });
    sourceDb.exec('PRAGMA busy_timeout = 5000');
    await backup(sourceDb, temporary);
    sourceDb.close();
    sourceDb = undefined;
    chmodSync(temporary, 0o600);
    verifyDb = new DatabaseSync(temporary, { readOnly: true });
    const integrity = verifyDb.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok'
        || verifyDb.prepare('PRAGMA foreign_key_check').all().length !== 0) {
      throw new Error('Backup validation failed.');
    }
    verifyDb.close();
    verifyDb = undefined;
    const descriptor = openSync(temporary, 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    for (const suffix of ['', '-wal', '-shm', '-journal']) requireAbsent(destination + suffix);
    linkSync(temporary, destination);
  } finally {
    verifyDb?.close();
    sourceDb?.close();
    // Delete only the private directory created above, never a caller's path.
    const target = realpathSync(staging);
    const child = relative(parent, target);
    if (!isAbsolute(target) || !child || child.startsWith('..') || isAbsolute(child)
        || dirname(target) !== parent || !basename(target).startsWith('.bep-backup-')) {
      throw new Error('Unsafe staging cleanup path.');
    }
    rmSync(target, { recursive: true, force: true });
  }
  console.log('Backup verified. A new database file was created.');
}

try { await main(); } catch {
  // Do not log SQLite errors, file paths, SQL, credentials or database content.
  console.error('Backup failed. Check source access, a fresh destination, SQLite integrity, free space and hard-link support.');
  process.exitCode = 1;
}
