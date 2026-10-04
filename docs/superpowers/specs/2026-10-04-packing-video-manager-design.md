# Packing Video Manager Design

## Purpose

Build a self-hosted web application for recording and managing one-time videos of packing ecommerce orders. A single operator opens the local web app without signing in, enters or scans an order code, records the packing process once, and can later find and download the saved video.

## Agreed requirements

- Monorepo in this repository: NestJS API, React web client, PostgreSQL database.
- Docker Compose starts the complete application. PostgreSQL data and video files persist in project directories mounted into containers.
- No external object storage, authentication, sessions, video thumbnails, or archived-video preview player.
- Each record stores an order code, recording timestamp, and video file reference. Duplicate order codes are allowed; add a non-unique index for search.
- The list shows order code and recording time, supports order-code search, and is paginated with newest records first. There is no sort control.
- The user can select multiple old records and delete them in one action. Ask for confirmation before deletion; deleting a record also removes its associated video file.
- The new-record flow has an editable order-code input, QR scanning that fills the input with the scanned text, and start/stop recording actions.
- Provide keyboard shortcuts to start a new recording from the list, open QR scanning, start recording, and stop recording. Show shortcut hints in the UI and do not trigger action shortcuts while the user is typing in an input or textarea.
- After stop, save the recording automatically. On successful save, return to the list and refresh it for the next recording session.
- Preserve the captured browser blob until the server confirms save; offer retry of that same blob after an upload failure, so a one-time packing event does not need to be repeated.
- Prefer MP4 when supported by the browser. Otherwise use a recording MIME type supported by that browser and retain its correct file extension and content type.

## Architecture

The React client requests camera access and records locally with the browser MediaRecorder API. On stop, it uploads the completed blob as a multipart request to NestJS. This keeps the camera lifecycle in the browser and avoids a long-lived media streaming connection; the browser-held blob remains available for retry until the API confirms persistence.

NestJS validates the order code and uploaded file, generates a safe server-side filename, writes the file to the mounted video directory, and persists record metadata in PostgreSQL. The API exposes paginated newest-first listing and order-code search, record creation/upload, file download, and bulk deletion. Bulk deletion removes database rows and their corresponding files, with filesystem and database errors handled so partial failures can be reported and retried safely.

The React app contains a paginated record list with search, selection and bulk-delete controls, plus the recording flow with QR scanning, camera permission/error states, recording controls, upload progress, and retry after upload failure. QR scanning uses a browser-compatible library and copies the decoded string into the editable order-code field.

## Data and API behavior

- A record has a generated ID, order code, timestamp, storage filename, and MIME type.
- Order code is indexed but not unique.
- List endpoint accepts page, page size, and optional order-code query; results are always ordered by recording timestamp descending, with a stable ID tie-breaker.
- Upload endpoint creates the metadata record only after the video has been safely written. Use a temporary file and atomic rename so interrupted writes do not appear as valid records.
- Download endpoint streams the original saved file with a suitable content type and download filename.
- Bulk delete accepts record IDs and reports deleted and failed IDs, allowing the UI to refresh and explain partial failure.

## Persistence and local operation

Compose mounts PostgreSQL's data directory and the application's video directory from the project into their respective containers. The repository includes environment examples and instructions for starting and stopping the stack. The API and web app are exposed on documented local ports.

## Failure handling

- Camera unavailable or permission denied: keep the form usable and show a clear error; do not discard the order code.
- Unsupported recording format: choose the first browser-supported configured MIME type and store its actual MIME type and extension.
- Upload failure: keep the captured blob and allow retry without starting another recording.
- Database failure after file write: remove the orphan temporary/final file where possible and return an error.
- Bulk deletion failure: report per-record outcome and refresh the list; do not claim failed items were deleted.
- Missing video file: return a clear not-found response for download; keep record deletion available.

## Out of scope

User accounts, concurrent-user coordination, cloud storage, video transcoding, thumbnails, playback previews, configurable sort order, and duplicate-order prevention.

## Acceptance criteria

1. A user can start the app with Docker Compose and saved records/videos survive container recreation.
2. A user can enter an order code, optionally populate it from a QR scan, record, stop, and have the video saved without another confirmation step.
3. If upload fails, the same captured video can be retried without re-recording.
4. The list supports order-code search and pagination, always showing newest records first, with duplicate order codes allowed.
5. A user can download a saved video and can select and delete multiple records in one confirmed action.
6. The four recording workflow actions have keyboard shortcuts that do not interfere with text entry.
