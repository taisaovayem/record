# Packing Video Manager

A local web app for recording and managing packing videos. The browser captures video with its camera, then uploads the completed recording to the local API. PostgreSQL stores record information; the database and video files persist under this project directory.

## Start the complete app with Docker Compose

Requirements: Docker Engine with the Docker Compose plugin.

```sh
cp .env.example .env
docker compose up --build
```

Open <http://localhost:8080>. Compose starts the web app, NestJS API, and its own PostgreSQL container. The default published ports are web `8080`, API `3000`, and PostgreSQL `5432`; change `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env` if needed.

The Compose database is named `record` and uses user `postgres`. Set `POSTGRES_PASSWORD` in `.env` to change its password. The API connects to PostgreSQL using the Compose service hostname `db` (container `localhost` would refer to the API container itself). The web server proxies `/api` requests to `api:3000` on the Compose network.

## Run services from the host

For development outside Docker, install Node.js 22 or newer and pnpm 10, then install dependencies:

```sh
pnpm install
```

Host-run API defaults connect to PostgreSQL at `localhost:5432`, with database `record` and user `postgres`. Set `DATABASE_PASSWORD` to the password for your host PostgreSQL instance. The application does not automatically load `.env` when run with `pnpm dev`; in a Bash-compatible shell, load it first:

```sh
set -a
. ./.env
set +a
pnpm dev
```

The included `.env.example` has the supplied local values. Copy it to `.env` before using the command above, and edit the values if your host database differs. For host development, the API listens on port `3000` and Vite serves the web app on port `5173`, proxying `/api` to `http://localhost:3000`. Compose overrides the API database host to `db` and uses `POSTGRES_PASSWORD` for its own database container.

## Record and manage videos

From the list, choose **Tạo bản quay** or press **Alt+N**. Enter an order code, or choose **Quét QR** / press **Alt+Q** and point the camera at a QR code. The scanned text is inserted into the editable order-code field, where it can be corrected before recording. Duplicate order codes are allowed.

Press **Alt+R** to start recording and **Alt+S** to stop. Stopping uploads and saves that recording automatically. The browser uses MP4 when supported; otherwise it records in a supported browser format. After the server confirms the save, the app returns to the list and refreshes it for the next packing session. If upload fails, keep the page open and choose **Thử tải lại** to upload the same captured video; it remains in browser memory until a successful save. Action shortcuts are ignored while typing in text fields.

The list is always newest-first and paginated (20 records per page). Search by order code, download a saved video, or select multiple records on the current page and choose delete. Deletion asks for confirmation and removes the associated video files as well as their database records. There is no sort control or archived-video preview.

## Camera access and data backup

Allow camera access when prompted. Browsers permit camera capture on `localhost` and secure HTTPS origins; they generally block it on insecure remote HTTP origins. QR scanning also needs camera permission.

Persistent data lives here:

- `./data/postgres` — PostgreSQL database files.
- `./data/videos` — uploaded video files.
- `.env` — local configuration (ignored by Git; create it from `.env.example`).

Back up both data directories to preserve the records and videos. Stop the stack before copying them so PostgreSQL files and database metadata are consistent. Do not delete these directories when bringing containers down. Compose provisions its own PostgreSQL database even if a host PostgreSQL server is already installed; use `localhost` for the host-run API and `db` only for the API running inside Compose.
