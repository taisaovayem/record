# Packing Video Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a local-first packing video manager with one-time browser recording, searchable paginated records, downloads, and confirmed bulk deletion.

**Architecture:** A pnpm monorepo contains a NestJS API and React/Vite client. The browser records via MediaRecorder and uploads the completed blob; NestJS writes files to a mounted directory and stores metadata in PostgreSQL. Compose runs PostgreSQL, API, and web, while local host development can connect to PostgreSQL at `localhost`.

**Tech Stack:** Node.js, pnpm workspaces, NestJS, TypeORM, PostgreSQL, React, Vite, TypeScript, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-04-packing-video-manager-design.md`

## Global Constraints

- Duplicate order codes are allowed; order code has a non-unique database index.
- List results are ordered by recording timestamp descending with a stable ID tie-breaker, and are paginated without a sort control.
- Videos are stored in a project-mounted directory; PostgreSQL data is also persisted in a project-mounted directory.
- The browser owns camera permission and MediaRecorder capture; upload the completed blob after stop and keep it available for retry until save succeeds.
- Prefer MP4 only when supported; store the actual MIME type and matching extension.
- No login, sessions, external object storage, thumbnail, or archived-video preview.
- Runtime database name is `record`, user is `postgres`, password comes from `POSTGRES_PASSWORD` (default for the supplied local setup: `mysecretpassword`). Use `localhost` from host-run API and Compose service hostname `db` from containers.
- Compose provisions its own PostgreSQL service and shares its network with API and web services.
- Do not add or run tests unless requested; use type/build/config checks for verification.

## Review Focus

- **Interrupted or failed upload:** the captured blob remains retryable and no record is shown until saved. Verify through API/UI type and build checks and explicit code-path review.
- **Duplicate order code and SQL search text:** duplicates remain insertable; search is parameterized and uses the non-unique index. Verify entity and query implementation.
- **Bulk deletion with missing files or database errors:** per-ID failures are reported and only confirmed removals disappear from the refreshed list. Verify service and UI outcome handling.
- **Unsupported camera/MIME and denied permissions:** show a useful error without clearing the order code; use a supported media type. Verify capture flow branches by code review.
- **Shortcut while editing text:** action keys do not disrupt input/textarea typing. Verify shortcut guards by code review.

---

## File Map and Interfaces

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`: workspace commands and shared TypeScript baseline.
- `apps/api/**`: NestJS configuration, records API, PostgreSQL entity, uploads, downloads, and deletion.
- `apps/web/**`: React/Vite UI, recording/QR flow, list, shortcuts, and HTTP client.
- `docker-compose.yml`, `.env.example`, `.gitignore`: local and Compose settings, persistent data directories, and generated-file exclusions.
- `README.md`: startup, environment, camera permissions, keyboard shortcuts, and data locations.

API contract shared by frontend and backend:

- `GET /api/records?page=1&limit=20&search=<text>` returns `{ items: RecordSummary[], total: number, page: number, limit: number, totalPages: number }`.
- `RecordSummary` is `{ id: string, orderCode: string, recordedAt: string, mimeType: string, originalName: string }`.
- `POST /api/records` accepts browser multipart fields `orderCode`, `captureId`, `recordedAt`, and `video`; legacy callers may omit both `captureId` and `recordedAt` and use the compatibility server timestamp fallback.
- `GET /api/records/:id/download` streams the saved original file as an attachment.
- `DELETE /api/records/bulk` accepts `{ ids: string[] }` and returns `{ deletedIds: string[], failures: { id: string, reason: string }[] }`.
- API origin is `/api`; web container proxies `/api` to the NestJS service.

## Tasks

### Task 1: Monorepo foundation and Compose runtime

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `docker-compose.yml`, `.env.example`, `.gitignore`
- Create: `README.md` (initial run instructions)

**Interfaces:**
- Produces root scripts `dev`, `build`, `typecheck` and workspaces `apps/api`, `apps/web`.
- Compose services are `db`, `api`, `web`; API uses `DATABASE_HOST=db`, web proxies `/api` to `api`.
- Default PostgreSQL database/user are `record`/`postgres`; password is interpolated from `POSTGRES_PASSWORD`.
- Mount PostgreSQL data at `./data/postgres` and video files at `./data/videos`.

- [ ] Create workspace manifests and shared TypeScript configuration with Node-compatible ESM settings.
- [ ] Add Compose services, health/dependency wiring, persistent mounts, environment interpolation, and web-to-API proxy routing.
- [ ] Add `.env.example` with the supplied local credentials and host database address; ensure `.env`, `data/`, dependencies, and build output are ignored.
- [ ] Document host-run API connection (`localhost`) versus Compose API connection (`db`), ports, camera permission requirement, data directories, and startup commands.
- [ ] Verify manifests parse and `docker compose config` succeeds when Docker Compose is available.

### Task 2: NestJS records API and file persistence

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/Dockerfile`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/records/records.module.ts`, `records.controller.ts`, `records.service.ts`, `record.entity.ts`, `dto/list-records.dto.ts`, `dto/bulk-delete.dto.ts`

**Interfaces:**
- Consumes: root workspace and Compose environment from Task 1.
- Produces: the API contract in “File Map and Interfaces”, including matching pagination and partial bulk-delete result shapes.

- [ ] Set up NestJS, TypeORM PostgreSQL configuration from environment, and the record entity with generated ID, order code, timestamp, filename, MIME type, and a non-unique order-code index.
- [ ] Implement parameterized case-insensitive order-code search, page/limit bounds, descending timestamp plus ID ordering, and the documented response shape.
- [ ] Implement multipart upload with order-code validation, safe generated filename, MIME/extension selection, temporary write plus atomic rename, and metadata persistence only after the file is safely written.
- [ ] Implement download streaming with attachment headers and clear not-found handling.
- [ ] Implement bulk delete with per-ID results and safe file/database failure handling.
- [ ] Add API Docker image and runtime configuration that works with Compose `db` and host-run `localhost`.
- [ ] Verify API TypeScript build and inspect entity/query/file error paths.

### Task 3: React recording and record management UI

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/Dockerfile`
- Create: `apps/web/src/main.tsx`, `App.tsx`, `api/records.ts`, `components/RecordList.tsx`, `components/Recorder.tsx`, `hooks/useShortcuts.ts`, `styles.css`

**Interfaces:**
- Consumes: API contract from “File Map and Interfaces”; `/api` is same-origin in Compose and configurable for host dev.
- Produces: web service listening on the Compose web port and serving the React app with `/api` proxying.

- [ ] Scaffold React/Vite app and API client with typed list, upload, download, and bulk-delete methods matching Task 2.
- [ ] Build paginated newest-first list with order-code search, selection, select-page controls, confirmed multi-delete, download buttons, loading/error states, and page refresh after changes.
- [ ] Build editable order-code capture form, QR scanner that inserts its raw decoded string, camera permission handling, recording control, progress, and local retry retention for a failed upload.
- [ ] Choose an MP4 MediaRecorder MIME type when supported; otherwise choose a supported type and upload its actual MIME type and extension.
- [ ] Implement `Alt+N` for new recording, `Alt+Q` for QR scan, `Alt+R` to start, and `Alt+S` to stop; display key hints and ignore shortcuts during text entry.
- [ ] On successful upload, return to the list and reload page one; never discard a failed-upload blob.
- [ ] Add production web image/proxy configuration and verify React TypeScript build and production bundle.

### Task 4: Cross-stack integration and operator documentation

**Files:**
- Modify: `README.md`, root scripts/manifests only as needed to integrate Tasks 1–3.
- Modify: task-owned files only for contract fixes discovered during integration.

**Interfaces:**
- Consumes: all services and contracts from Tasks 1–3.
- Produces: one-command Compose startup and complete user-facing operating instructions.

- [ ] Confirm frontend request/response types match the NestJS API and Compose proxy paths.
- [ ] Confirm local database configuration connects by `localhost` while Compose API resolves PostgreSQL by `db`.
- [ ] Document pagination, QR scanning, shortcut keys, retry behavior, deleting records, and backup locations.
- [ ] Run root typecheck/build and `docker compose config`; review final changed files for credential leakage and generated artifacts.
