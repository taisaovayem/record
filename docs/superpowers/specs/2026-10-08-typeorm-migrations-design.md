# TypeORM Database Migrations Design

## Purpose

Replace TypeORM schema synchronization with tracked, versioned PostgreSQL migrations. A fresh database must be created from migrations at API startup. Existing databases created by the application's previous `synchronize: true` behavior must be adopted and upgraded without deleting records, passkeys, settings, or videos.

## Current schema history

The repository has no migration files or migration history table configured. The API currently enables `synchronize: true` and registers these entities:

- `packing_records`: UUID ID, order code, recording timestamp, capture ID, filename, MIME type, and nullable operator ID; order-code and capture-ID indexes.
- `operators`: UUID ID and name.
- `passkey_credentials`: credential ID, public key, counter, transports, device type, backup status, operator ID, and operator index.
- `record_retention_settings`: singleton ID, two disabled-by-default rules, and two day counts defaulting to 60.
- The current uncommitted retention work also adds `createdAt`, `deletedAt`, `videoPurgedAt`, and their composite index to `packing_records`.

Older repository versions had `packing_records` without `captureId` and `operatorId`; those columns can be safely added as nullable. The initial record fields (`id`, `orderCode`, `recordedAt`, `filename`, and `mimeType`) are required for adoption. File-backed passkey credentials are not in PostgreSQL and are not imported by this work.

## Migration architecture

Set `synchronize: false`. Define a shared PostgreSQL connection configuration used by both the NestJS TypeORM module and a TypeORM CLI `DataSource`. Store compiled migration files in a deterministic path and use a dedicated `migrations` tracking table.

Run pending migrations automatically when the API initializes (`migrationsRun: true`). Provide a manual migration command for operators and local setup, using the same connection configuration and migration list.

### Baseline/adoption migration

Add a baseline migration that supports both an empty database and known legacy schemas:

- On an empty database, create the current base tables (`packing_records`, `operators`, and `passkey_credentials`) and their primary keys, foreign keys, and indexes.
- When `packing_records` already exists, inspect the required legacy columns before changing the schema. If required columns are missing or incompatible, stop with a clear error before destructive changes.
- For a recognized legacy record table, preserve every row and add only safe nullable additions (`captureId`, `operatorId`) that are absent. Create missing operator/passkey tables and expected indexes/foreign keys without replacing existing tables or data.
- If the database already satisfies the baseline, perform no table/data rewrite. TypeORM records this migration in its migration tracking table after the migration completes, thereby adopting the existing schema.
- If an existing auth table is present but structurally incompatible, fail with an actionable error rather than dropping or rewriting credentials.

### Retention migration

Add a separate idempotent migration for retention schema:

- Add `createdAt`, `deletedAt`, and `videoPurgedAt` to `packing_records` if missing, then add the composite `(deletedAt, createdAt)` index if missing.
- If `createdAt` must be added to old records, initialize those rows to the migration time; if the column already exists, preserve its values. This avoids treating old rows as immediately eligible for automatic deletion.
- Create `record_retention_settings` if absent and insert the default singleton (both rules disabled, each duration 60) only when no singleton row exists. Preserve existing saved settings if the table/row already exists.
- Use idempotent schema checks so databases previously synchronized to the current application schema can pass through and have both migrations recorded without data loss.

### Migration history and rollback safety

Use TypeORM's migration tracking table to record successful migrations. Migrations must not drop existing records, operator accounts, passkeys, retention settings, or video files during rollback. Destructive schema rollback is out of scope; down migrations should be explicitly non-destructive and documented.

## Deployment and operation

- A brand-new Compose database is initialized by migrations when the API starts; `synchronize` remains disabled.
- An existing database is inspected/adopted and then advanced through pending migrations during the same startup.
- Starting the API with an unsupported schema fails clearly and leaves existing data intact.
- Document how to inspect migration history and run migrations explicitly for local/server operations.
- No migration imports auth credentials from the old file store, moves videos, or deletes project data directories.

## Out of scope

- Importing credentials from the former file-backed auth store.
- Rebuilding/replacing an incompatible database automatically.
- Dropping tables or columns to roll back a migration.
- Supporting arbitrary third-party schemas that do not match a known repository version.

## Acceptance criteria

1. `synchronize` is disabled for runtime and CLI database connections.
2. A fresh PostgreSQL database can be created by the tracked migration set when the API starts.
3. A current database created by `synchronize: true` retains all rows and existing retention settings; migrations are recorded and the API starts without re-creating its tables.
4. A recognized older record-only schema is preserved and safely upgraded with nullable capture/operator fields, operator/passkey tables, and retention schema.
5. If `createdAt` is newly added, old rows receive the migration timestamp; existing values are never overwritten.
6. Existing settings rows and all existing videos remain untouched.
7. An incompatible schema causes a clear startup failure before destructive data changes.
8. A documented manual migration command uses the same migrations as automatic startup.
