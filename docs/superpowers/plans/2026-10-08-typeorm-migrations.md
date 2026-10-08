# TypeORM Database Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TypeORM schema synchronization with startup-run migrations that create new databases and safely adopt known existing schemas.

**Architecture:** Share PostgreSQL connection/entity/migration settings between Nest runtime and a TypeORM CLI `DataSource`. The first migration establishes/adopts the base record/auth schema; the next idempotently adds retention schema. The API runs pending migrations before serving requests, while an explicit CLI command can run or inspect the same migration set.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17, TypeScript NodeNext, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-08-typeorm-migrations-design.md`

## Global Constraints

- `synchronize` must be `false` in runtime and CLI database connections.
- The API must run pending migrations automatically during startup.
- Existing data in `packing_records`, `operators`, `passkey_credentials`, and `record_retention_settings` must be preserved.
- Known legacy `packing_records` tables may lack nullable `captureId` and `operatorId`; add those safely.
- If `createdAt` is newly added, initialize existing records to migration time; preserve it if already present.
- Insert retention defaults only when the singleton row is absent; both rules are disabled and both durations are 60 days.
- Incompatible or orphaned existing schemas must fail clearly without dropping or rewriting data.
- Migration rollback must not drop existing rows, tables, settings, credentials, or videos.
- Keep the current PostgreSQL connection environment variable names and defaults.

## Review Focus

- Empty database: base entities and retention schema are created, and all migrations are recorded.
- Existing complete schema: migration history is adopted without rewriting or truncating existing rows.
- Known record-only schema: legacy rows remain intact while nullable capture/operator columns and absent auth tables are added safely.
- Existing settings and preexisting `createdAt` values are preserved; defaults/backfill apply only when data is absent.
- Missing required columns, incompatible auth tables, or orphaned operator references cause an actionable error before destructive DDL.

---

### Task 1: Share runtime and CLI database configuration

**Files:**
- Create: `apps/api/src/database/database-options.ts`
- Create: `apps/api/src/database/data-source.ts`

**Interfaces:**
- `databaseOptions()` returns the shared PostgreSQL host, port, username, password, database, entity list, migration glob, `migrationsTableName: 'typeorm_migrations'`, and `synchronize: false`.
- The CLI `DataSource` imports the same options and does not enable automatic `migrationsRun`.
- Compiled migrations resolve from `dist/database/migrations/*.js`.

- [x] Implement shared database options using the existing environment names/defaults and all four current entity classes.
- [x] Add the CLI `DataSource` from the shared options, targeting compiled migration files and the `typeorm_migrations` history table.

### Task 2: Add the base schema and legacy adoption migration

**Files:**
- Create: `apps/api/src/database/migrations/1791417600000-CreateBaselineSchema.ts`

**Interfaces:**
- Migration class `CreateBaselineSchema1791417600000` implements TypeORM `MigrationInterface`.
- `up(queryRunner)` creates the base tables on a new database; adopts a recognized record-only/current schema by adding only absent safe structures; and returns without rewriting rows when the schema already satisfies the base.
- The baseline covers base `packing_records`, `operators`, and `passkey_credentials` tables, their primary/foreign keys, and existing order-code, capture-ID, and credential-operator indexes.
- `down(queryRunner)` throws an explicit unsupported-revert error; it never drops adopted tables or rows.

- [x] Check for `packing_records`; if absent, create the base table with UUID ID, order code, recorded timestamp, nullable capture ID/operator ID, filename, and MIME type.
- [x] If the table exists, validate required legacy columns/types first; stop with a clear migration error if incompatible.
- [x] Add missing nullable `captureId` and `operatorId` columns only after validation, without changing existing row values.
- [x] Create missing `operators` and `passkey_credentials` tables on legacy record-only databases; validate already-present auth tables and reject incompatible ones.
- [x] Ensure required foreign keys and indexes exist; check for orphaned non-null operator references before adding the record foreign key.
- [x] Make `down()` throw an explicit unsupported-revert error so TypeORM cannot report a destructive baseline rollback as complete.

### Task 3: Add the retention schema migration

**Files:**
- Create: `apps/api/src/database/migrations/1791417600001-AddRecordRetentionSchema.ts`

**Interfaces:**
- Migration class `AddRecordRetentionSchema1791417600001` implements TypeORM `MigrationInterface`.
- `up(queryRunner)` idempotently adds `createdAt`, `deletedAt`, `videoPurgedAt`, the composite index, the settings table, and the default row when absent.
- `down(queryRunner)` throws an explicit unsupported-revert error; it never drops retention columns or values.

- [x] Add `createdAt` with a server timestamp default only if absent, preserving any existing values.
- [x] Add nullable `deletedAt` and `videoPurgedAt` only if absent; create index `(deletedAt, createdAt)` only if missing.
- [x] Validate any preexisting retention columns/settings table before using them; fail with a clear incompatibility error rather than allowing a broken runtime schema.
- [x] Create `record_retention_settings` only if absent and insert singleton defaults (`id = 1`, both switches false, both day counts 60) with conflict-safe semantics.
- [x] Make `down()` throw an explicit unsupported-revert error so retention values and record lifecycle fields cannot be removed accidentally.

### Task 4: Replace synchronization with automatic startup migrations

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Nest TypeORM root configuration spreads `databaseOptions()` and sets `migrationsRun: true`, retry settings, and `synchronize: false`.
- Package script `migration:run` runs TypeORM CLI against `dist/database/data-source.js`.
- Package script `migration:show` shows applied/pending migrations from the same compiled DataSource.

- [x] Replace duplicated inline connection/entity configuration in `AppModule` with `databaseOptions()` and enable `migrationsRun`.
- [x] Add explicit `migration:run` and `migration:show` scripts that use the compiled CLI DataSource; local developers build first, while production containers already contain compiled files.
- [x] Ensure the existing Docker runtime image contains compiled migrations and the TypeORM CLI dependencies needed by automatic startup and manual commands.

### Task 5: Document migration operations and legacy adoption

**Files:**
- Modify: `README.md`

- [x] Document automatic startup migrations and the manual `migration:run` / `migration:show` commands.
- [x] Explain how empty databases are created, how known existing schemas are adopted/recorded, what happens to old `createdAt` values, and that incompatible schemas fail without destructive changes.
- [x] State that file-backed passkey credentials are not imported and existing database/video directories must not be deleted.

## Execution Notes

- Implement in task order: the runtime and CLI must share migration discovery before startup execution is enabled.
- TypeORM records each migration after `up()` succeeds; idempotent adoption lets existing databases acquire migration history without table replacement.
- No tests are added or run as part of this plan.
