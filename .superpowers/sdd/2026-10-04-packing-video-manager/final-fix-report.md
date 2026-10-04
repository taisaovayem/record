# Final fix wave report

## Changes

- Added a synchronous recorder-start guard and a visible camera-permission state. Cancelling or unmounting invalidates a pending camera request; late streams are stopped before recorder creation or state changes.
- Each completed capture now retains one UUID `captureId`, stop-time `recordedAt`, MIME type, blob, and order code through upload retries.
- Added nullable unique `captureId` persistence, while retaining the existing non-unique `orderCode` index. Upload retries resolve an existing capture rather than creating another row. Ambiguous database-save outcomes preserve the published file for recovery.
- Reworked bulk deletion around an atomic `.deleting` rename. Metadata is deleted only after the video becomes a tombstone; a failed delete restores the tombstone when the row remains. Startup reconciles tombstones by restoring them for extant rows or removing them for absent rows.
- Added multipart validation and persistence for browser stop timestamps, with a server-time fallback when the field is absent.
- Changed the Compose PostgreSQL host mapping and `.env.example` default to `5433:5432`; API-in-Compose remains on internal port 5432 and host-run API settings remain `localhost:5432`.

## Verification

- `pnpm typecheck` — passed for API and web workspaces.
- `pnpm build` — passed; Nest API build and Vite production build completed.
- `docker compose config` — passed; resolved PostgreSQL host publication is `5433 -> 5432` and API internal `DATABASE_PORT` is `5432`.
- `docker compose build` — passed for API and web images.
- `git diff --check` — passed.

No tests were added or run, per the task instruction.

## Unresolved issues

None identified by the requested static, build, and Compose checks. Browser camera permission and real device recording still require manual exercise in a browser.

## Command output excerpts

```text
$ pnpm typecheck
Scope: 2 of 3 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done

$ pnpm build
apps/api build: Done
apps/web build: ✓ built in 3.07s
apps/web build: Done

$ docker compose config
... db ports: published: "5433", target: 5432
... api DATABASE_PORT: "5432"

$ docker compose build
Image packing-video-manager-worktree-api Built
Image packing-video-manager-worktree-web Built
```

## Deterministic retry follow-up

- Server filenames now use `SHA-256(captureId)` plus an allowlisted video extension when an idempotency key is supplied. A retry whose prior database outcome was ambiguous therefore reuses and atomically replaces the same final file instead of creating a second orphan. Legacy uploads without a capture ID retain random filenames.
- Browser-style uploads must supply `captureId` and `recordedAt` together; the compatibility fallback applies only when both fields are absent.

```text
$ pnpm --filter @packing-video-manager/api typecheck
> tsc --noEmit

$ pnpm typecheck
apps/api typecheck: Done
apps/web typecheck: Done

$ pnpm build
apps/api build: Done
apps/web build: ✓ built in 3.17s
apps/web build: Done
```
