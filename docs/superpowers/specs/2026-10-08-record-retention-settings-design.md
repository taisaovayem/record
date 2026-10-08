# Record Retention Settings Design

## Purpose

Add global retention settings for packing records and their original video files. Operators can configure the settings from a new screen. A daily NestJS scheduled job applies enabled retention rules while keeping soft-deleted record rows in PostgreSQL.

## Agreed requirements

- Add a Settings screen accessible from a button beside Logout in the authenticated footer.
- The screen has two independent switches and day-count inputs:
  - Automatically soft-delete a record after a configured number of days from its creation.
  - Permanently remove the original video file after a configured number of days since the record was soft-deleted.
- Each day count defaults to 60. A disabled switch disables its day input and its corresponding automated action.
- Show tooltips with the agreed explanations: “Xóa bản ghi sau khi tạo xx ngày” and “Xóa vĩnh viễn video gốc sau khi bản ghi bị xóa xx ngày”.
- Save settings to persistent storage. After a successful save, return to the existing home/list screen.
- Run retention work daily at 00:00 Vietnam time (`Asia/Ho_Chi_Minh`). Compare full timestamps; do not treat a partial day as a full day.
- Manual record deletion becomes soft deletion. It hides the record from the normal list but keeps its database row and video file.
- When video retention is due, delete only the video file. Keep the record row and all record metadata in PostgreSQL, marked as soft-deleted.
- If either automated setting is disabled, its scheduled action does nothing.
- The existing authentication guard protects settings APIs; settings are global to the application because no roles or per-operator settings exist.
- Initial switch state is off for both rules. The Settings UI still shows 60 in each day-count input.

## Data model

Add a singleton retention-settings entity/table with a stable singleton key, booleans for each rule, and positive integer day counts defaulting to 60. Persist one shared settings row for all operators.

Extend `packing_records` with:

- `createdAt`, a server-generated timestamp used by the automatic record-retention rule. `recordedAt` remains the time supplied for the recording and is not used to calculate record age.
- `deletedAt`, nullable timestamp marking when the record was soft-deleted, whether by a user or the automatic rule.
- `videoPurgedAt`, nullable timestamp marking successful removal of the original video file. The database row remains after this is set.

Add a composite index on `(deletedAt, createdAt)`. It supports finding undeleted records old enough for automatic soft deletion and deleted records due for video cleanup. Keep the existing order-code and capture-ID indexes.

## API and user interface

Add authenticated endpoints to read and update the singleton retention settings. Validate that switches are booleans and enabled day counts are positive integers from 1 through 36,500. The API returns the saved settings.

Add a Settings view to the React app. Place its navigation button beside Logout. Each setting has a switch, a day input enabled only when its switch is on, and a tooltip. Saving shows errors in place on failure; on success, return to the list screen.

The existing bulk-delete endpoint will set `deletedAt` for active records rather than deleting their database rows or video files. Repeated deletion of an already deleted record is reported as not found/already deleted. The normal list and video download endpoints exclude soft-deleted records. The download endpoint also rejects records whose video has been purged.

## Scheduled retention behavior

Add `@nestjs/schedule` and register a daily job at `0 0 * * *` in `Asia/Ho_Chi_Minh`.

At each run:

1. Load the persisted retention settings; if they do not exist, create/use defaults with both rules disabled and both durations at 60 days.
2. If automatic record deletion is enabled, set `deletedAt` for active records whose `createdAt` is at or before the exact cutoff (`run time - configured days`).
3. If video deletion is enabled, find soft-deleted records whose `deletedAt` is at or before the exact cutoff and whose `videoPurgedAt` is null. Remove each corresponding video file, then set `videoPurgedAt`. Do not delete the database row.
4. Log failures per record and leave `videoPurgedAt` null when file removal fails, so the next daily run retries it.

Settings are read on each run, so changes apply without restarting the API. If the API is unavailable at midnight, overdue records are processed on the next scheduled run using the same timestamp cutoffs.

## Failure handling and compatibility

- A failed settings save leaves the user on the Settings screen and displays an error.
- A failed video removal leaves the soft-deleted database row intact and eligible for retry.
- A missing video file counts as successfully purged; the job records `videoPurgedAt` and retains the row.
- Soft-deleted records do not appear in normal search/list results and cannot be downloaded.
- Existing rows receive a server-side `createdAt` default during schema synchronization; existing rows remain active and are not automatically deleted until they meet the configured age threshold.
- No endpoint or UI for restoring soft-deleted records is included.

## Out of scope

- Hard deletion of `packing_records` rows.
- Record restoration or a trash/archive screen.
- Per-operator retention policies or role-based settings access.
- Configurable schedule time or frequency.
- Permanent deletion of files outside the application-managed video directory.

## Acceptance criteria

1. An authenticated operator can open Settings from the footer, load the persisted settings, change either rule and duration, save, and return to the list.
2. Disabled retention rules do not change records or files.
3. Manual bulk deletion marks records as soft-deleted, hides them from the normal list, and retains both database rows and videos.
4. At daily 00:00 Vietnam time, enabled automatic record retention soft-deletes only rows whose `createdAt` has reached the exact age cutoff.
5. At the same schedule, enabled video retention removes only files whose records have been soft-deleted for the exact configured duration.
6. Video cleanup preserves each `packing_records` row, including its `deletedAt`, and marks successful cleanup with `videoPurgedAt`.
7. A video deletion failure is retried on a later run without losing the corresponding database row.
8. Normal list, search, and download do not expose soft-deleted records or purged video files.
