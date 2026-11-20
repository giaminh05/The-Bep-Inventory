# SQLite backup and restore rehearsal

Date: 2026-11-20. Scope: M1 / D01, disposable fixtures only. No operational database was opened, copied, backed up, migrated, restored or crash-tested for this milestone. No application, schema, deployment or dependency change is introduced by this runbook.

## What is available

`scripts/backup-database.mjs` uses Node's SQLite Online Backup API with a read-only source connection. It does not call the application's `openDatabase()` initializer, run migrations, seed demo data or modify business records. The backup covers the complete `main` database, including stock revisions and known flags, ledger, documents, photo BLOBs, idempotency records, users, password hashes and sessions. It is sensitive data even though the command prints no database content.

The destination parent directory must already exist. The command rejects an existing destination (including a symlink or hard-link alias), the same source/destination path, source-sidecar names (`source-wal`, `source-shm`, `source-journal`, with case-insensitive comparison on Windows), and existing destination `-wal`, `-shm` or `-journal` files. SQLite owns sidecar filenames and may overwrite/delete them during normal writes, so they cannot be backup destinations. A missing source is an error; it is never initialized as an empty database.

Node's backup API can overwrite its target, so the command writes inside a private staging directory in the destination parent, validates `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, flushes the staged database file, then publishes it using an exclusive hard link. An existing final name cannot be overwritten even by two simultaneous runs. The staging directory is removed only after its resolved absolute path is checked. File mode `0600` and directory mode `0700` are requested; on Windows, the owner must verify restrictive NTFS ACLs on the destination parent because POSIX modes do not configure Windows access control.

The source connection is opened read-only; SQLite may still use or create WAL shared-memory sidecars when the directory permissions and SQLite recovery state permit it. This is not an immutable-file reader. If the source cannot be safely opened read-only, the command fails rather than opening it read-write.

## Run the disposable rehearsal

From the repository root, with the project's supported Node runtime (Node >=24):

```powershell
node --test test/db-compatibility.test.mjs
```

This creates every database in a uniquely named operating-system temporary directory, then closes handles and removes only that verified directory. It does not inspect `data/` or depend on `BEP_DB`.

The six tests verify:

1. An open WAL writer has committed fixture data and an unfinished stock update. Backup includes committed WAL state and excludes the unfinished update. Restore to another new file and two application reopenings preserve stock/known/revision, ledger references, count sheets/lines, partial supplier/transfer documents, photo bytes, opening balances, requests and sessions.
2. Same-path, existing-file, hard-link alias, destination-sidecar and missing-source refusal preserves existing bytes and never creates a missing source.
3. Source-sidecar destination names are rejected before opening the source. The fixture uses rollback-journal mode and a subsequent ordinary write; Windows also checks uppercase filename variants.
4. Invalid SQLite input and foreign-key violations are rejected without publishing a final database.
5. A child process commits fixture data to WAL, begins an unfinished transaction and exits immediately with code 73 without closing SQLite. Backup and subsequent application recovery preserve the committed data; another read-only reopening still agrees.
6. A frozen predecessor schema with the original 12 core tables is opened through the current initializer. Additive columns/tables appear with expected defaults; every original column value, including photo BLOBs, session rows and requests, survives. Three reopenings retain the same schema and all data.

These are file-backed tests. The crash drill is an abrupt process exit, not a host power-loss, damaged-storage or physical-device test. Fixture documents are storage fixtures; domain/API accounting parity is covered by the inventory regression suites. One supported predecessor shape does not establish repair support for arbitrary partially migrated or damaged schemas.

## Command template for an authorized rehearsal

Replace placeholders with explicit absolute paths to disposable or separately authorized source and fresh output files. Never paste secrets into a command line. Neither source nor destination is inferred from an environment variable.

```powershell
node scripts/backup-database.mjs '<ABSOLUTE_DISPOSABLE_SOURCE_PATH>' '<ABSOLUTE_NEW_BACKUP_PATH>'
if ($LASTEXITCODE -ne 0) { throw 'Backup did not report success; investigate before proceeding.' }
```

Success prints `Backup verified. A new database file was created.` Failure prints a generic diagnostic and returns a nonzero status without printing SQL, file paths or data. Preserve the status and elapsed time in the drill record. A filesystem/cleanup failure after publication could leave a complete final file despite nonzero status; inspect it read-only, do not delete or overwrite it automatically. An interrupted command can leave a private `.bep-backup-*` staging directory; an operator should resolve and verify that exact path before removing it. Never recursively delete a path assembled from untrusted input.

Use a trusted local filesystem whose hard-link and SQLite locking semantics have been verified. Hard-link failure, permission problems, disk-full, unreadable WAL/recovery state or invalid integrity/FK results cause failure; there is no overwrite/copy fallback. Do not run against a network-mounted database based solely on the local rehearsal result. Keep other processes from creating destination sidecars or opening the output before the command finishes. The helper cannot defend against a privileged actor replacing directories or files during the run.

## WAL consistency and writers

A plain copy of the main `.sqlite` file while WAL is active can omit committed transactions. Do not copy the main file alone and label it a consistent backup. Do not manually remove or separately combine source `-wal`/`-shm` files. This helper delegates snapshot consistency to SQLite's Online Backup API.

An existing writer may continue committing during online backup. Other-connection commits can restart the backup; no fixed start-time snapshot or bounded completion time is promised. The result is one SQLite-consistent database, not an application-wide snapshot of external systems. For a drill requiring exact reconciliation to a known business cutoff, pause writes through an approved procedure, record the cutoff/last committed movement and request identifiers through a protected process, finish backup, then resume writes. Do not print user/session/request content to general logs. Continuous write pressure, disk contention and lock waits need measurements on the eventual host; the small disposable drill does not measure production capacity.

The helper backs up only `main`; attached databases, external assets, runtime configuration, signing material and other services are outside this backup. Current photo storage is inside SQLite. No automatic backup scheduling, retention, encryption, offsite copy, restore routing or session-revocation policy is added.

## Restore to a new path and validate

A restore rehearsal creates another new database using the same validated helper:

```powershell
node scripts/backup-database.mjs '<ABSOLUTE_AUTHORIZED_BACKUP_PATH>' '<ABSOLUTE_NEW_RESTORE_PATH>'
if ($LASTEXITCODE -ne 0) { throw 'Restore copy did not report success; do not start an application against it.' }
```

This performs another Online Backup read plus integrity/FK validation; it does not replace a running database. First reconcile a disposable restored database against the protected fixture manifest: stock quantity/known/revision, ledger count and balances, document expected/received/closed state, photo lengths/hashes, count-sheet boundaries, and saved request key/fingerprint/result. Check hashes or aggregates in a protected tool without exporting credentials, tokens, session hashes or authentication logs. Close and reopen the file and repeat the checks. Rehearsal tests supply an automated fixture oracle; real data requires an authorized, separately reviewed reconciliation manifest.

Only after validation, an isolated test backend may use a restored **disposable** fixture at a new path, with separate port and traffic isolation. The normal application initializer performs schema migration when opening writable databases; do not use it as a read-only inspection tool for an operational backup. Do not expose restored users or session state to other environments or contact clients with restored credentials.

## Operational restore gate and unresolved ownership

M1 does not authorize live restore or production backup execution. A future incident restore requires an explicitly authorized owner and incident plan: stop/cut off all writers, preserve the current database and its consistent WAL state, choose and validate a recovery point on a new path, reconcile transactions committed after that recovery point, decide how restored sessions and revocations will be handled, then approve routing to the new file. Never restore an old database to roll back UI/code; keep transactions committed after rollout. Avoid dual writers during cutover and retain a protected audit of decisions.

Before production use, the operations owner must set and approve:

- RPO (maximum acceptable lost time/transactions), RTO (maximum recovery duration), recovery-point selection and reconciliation responsibilities.
- Backup cadence, retention, monitoring/failed-job alerts, free-space budget, encryption, access controls and offsite storage.
- Verified local filesystem, deployed Node/SQLite version, writer pause/cutoff procedure, transfer checksum verification and restore isolation.
- Session/password-reset/revocation implications, incident/cutover/rollback authority, and periodic restore drill acceptance evidence.

No RPO/RTO value or production readiness is claimed. Timing on synthetic local fixtures does not establish either target.

## References checked on 2026-11-20

- [Node.js SQLite Online Backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options): available since Node 22.16/23.8, accepts an open database, can overwrite its target, and may restart after changes by other connections.
- [Node.js SQLite read-only connection option](https://nodejs.org/api/sqlite.html): `readOnly: true` fails when a database does not exist.
- [SQLite Online Backup API](https://www.sqlite.org/backup.html) and [WAL read-only databases](https://www.sqlite.org/wal.html#read_only_databases): consistency and source-side WAL access constraints.

Local execution for this milestone used Node v26.13.0 on Windows. The project's minimum runtime is not upgraded by this work.
