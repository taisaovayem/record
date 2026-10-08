# Record Retention Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global record and video retention settings, soft-delete records, and purge only video files at the configured schedule while retaining database rows.

**Architecture:** Store one global settings row in PostgreSQL. Add server creation, soft deletion, and video-purged timestamps to records. NestJS Schedule runs at midnight Vietnam time and applies each enabled retention rule. The React app adds an authenticated settings screen and APIs.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, `@nestjs/schedule`, React 19, TypeScript, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-08-record-retention-settings-design.md`

## Global Constraints

- Both switches start disabled; both day counts default to 60.
- A record becomes automatically soft-deleted based on server `createdAt`, not client `recordedAt`.
- Manual deletion marks a record soft-deleted and retains its video.
- Purging a video never deletes its `packing_records` row.
- The scheduler runs daily at `0 0 * * *` in `Asia/Ho_Chi_Minh` and compares full timestamps against exact cutoffs.
- When video removal fails, leave the row eligible for a later retry.
- Soft-deleted rows are omitted from the normal list and cannot be downloaded.
- Settings are global and available to authenticated operators.
- Day counts must be integers from 1 through 36,500.

## Review Focus

- Invalid, fractional, zero, or over-limit day values must be rejected by the settings API.
- A disabled automatic rule must not soft-delete otherwise old active records.
- A disabled video rule must not remove files, even for old soft-deleted records.
- Failed and missing-file cleanup must retain the database row; failed cleanup remains retryable and missing-file cleanup is marked complete.
- Existing rows must get a usable server `createdAt` without changing `recordedAt` or being soft-deleted during schema synchronization.

---

### Task 1: Add persistent retention settings and authenticated API

**Files:**
- Create: `apps/api/src/settings/record-retention-settings.entity.ts`
- Create: `apps/api/src/settings/record-retention-settings.dto.ts`
- Create: `apps/api/src/settings/record-retention-settings.service.ts`
- Create: `apps/api/src/settings/record-retention-settings.controller.ts`
- Create: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/app.module.ts` (register the settings entity in TypeORM's explicit `entities` list and register `SettingsModule`)

**Interfaces:**
- `GET /settings/retention` returns `{ autoDeleteRecordsEnabled, autoDeleteRecordsAfterDays, purgeVideosEnabled, purgeVideosAfterDays }`.
- `PUT /settings/retention` accepts the same fields and returns the persisted values.
- Entity `RecordRetentionSettingsEntity` uses the singleton primary key `id = 1`; boolean fields default to `false`, and day fields default to `60`.
- `RecordRetentionSettingsService.getSettings()` returns the singleton row, creating it from defaults if absent. `saveSettings(input)` validates and persists a complete settings value.

- [x] Add the singleton TypeORM entity and DTO validation for boolean switches and integer day values in the inclusive range 1–36,500.
- [x] Implement lazy creation of the default row and full settings replacement in `RecordRetentionSettingsService`.
- [x] Add authenticated GET and PUT endpoints under `settings/retention`, importing `AuthModule` in `SettingsModule`.
- [x] Register the settings entity in `AppModule`'s explicit TypeORM entity list and register `SettingsModule`.

### Task 2: Add record lifecycle fields and soft-delete behavior

**Files:**
- Modify: `apps/api/src/records/record.entity.ts`
- Modify: `apps/api/src/records/records.service.ts`

**Interfaces:**
- Add `createdAt: Date`, `deletedAt: Date | null`, and `videoPurgedAt: Date | null` to `RecordEntity`.
- Add composite index `idx_packing_records_deleted_created` on `['deletedAt', 'createdAt']`.
- `removeMany(ids)` continues returning `{ deletedIds, failures }`, but sets `deletedAt` instead of renaming/removing video files or deleting rows.

- [x] Add server-defaulted `createdAt` and nullable `deletedAt`/`videoPurgedAt` columns and the composite index.
- [x] Filter `deletedAt IS NULL` in `list()` and reject downloads for soft-deleted records or records with `videoPurgedAt` set.
- [x] Replace `removeMany()`'s hard-delete/tombstone flow with soft deletion of active rows while preserving per-ID failure results.
- [x] Leave existing upload behavior and `recordedAt` semantics unchanged.

### Task 3: Add scheduled retention processing

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/records/record-retention.service.ts`
- Modify: `apps/api/src/records/records.module.ts` (import `SettingsModule` and register the retention provider)

**Interfaces:**
- `RecordRetentionService.runRetention()` loads the current settings and runs enabled rules using a single captured run timestamp.
- `SettingsModule` exports `RecordRetentionSettingsService` so `RecordsModule` can load the global settings.
- Automatic cutoff is `runAt - autoDeleteRecordsAfterDays * 24 hours`; only active records with `createdAt <= cutoff` receive `deletedAt = runAt`.
- Video cutoff is `runAt - purgeVideosAfterDays * 24 hours`; only records with `deletedAt <= cutoff` and `videoPurgedAt IS NULL` are considered.

- [x] Add `@nestjs/schedule` to the API package and register `ScheduleModule.forRoot()` once in `AppModule`.
- [x] Add `RecordRetentionService` to `RecordsModule`, injecting record and settings repositories.
- [x] Implement automatic soft deletion using exact timestamp cutoffs and skip this query when its switch is disabled.
- [x] Implement per-record video removal under the configured video directory; mark `videoPurgedAt` after successful removal, treat missing files as complete, and log other failures while preserving retry eligibility.
- [x] Schedule `runRetention()` daily with `@Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })`.

### Task 4: Add the Settings screen and client API

**Files:**
- Create: `apps/web/src/api/settings.ts`
- Create: `apps/web/src/components/Settings.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/RecordList.tsx` (update deletion confirmation and outcome copy for soft deletion)
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `getRetentionSettings()` calls `GET /settings/retention` and returns the four settings fields from Task 1.
- `saveRetentionSettings(settings)` calls `PUT /settings/retention` with the same four fields.
- `Settings` receives `onSaved` and `onCancel`; successful save calls `onSaved`, which returns the app to the list screen.

- [x] Implement the client settings type and GET/PUT API helpers using the existing API base URL and auth-expiry behavior.
- [x] Implement the Settings view with two independent switches, 60-day defaults from the API, inputs disabled when their switch is off, Vietnamese tooltips, loading/error states, and a Save action.
- [x] Add `settings` to the authenticated screen state and place the Settings navigation button beside Logout in the footer.
- [x] Return to the list screen only after a successful save; keep the view and entered values on failure.
- [x] Update bulk-delete confirmation/results to explain that records are hidden and videos are retained.
- [x] Add responsive styles consistent with existing panels, fields, switches, buttons, and notices.

### Task 5: Update project documentation

**Files:**
- Modify: `README.md`

- [x] Document the two global retention settings, disabled/60-day defaults, soft-delete behavior, and that video cleanup retains database rows.
- [x] Document the daily midnight Vietnam-time schedule and that missed runs catch up at the next scheduled execution.

## Execution Notes

- Implement in task order so the persistence contract exists before retention processing and the UI consumes the finalized API shape.
- Do not hard-delete `packing_records` rows in any retention path.
- Automated record soft deletion and video-file purging are independent switches; manual soft deletion remains available regardless of either switch.
- No tests are added or run as part of this plan.
