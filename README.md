# Packing Video Manager

A local web app for recording and managing packing videos. The browser records with its camera and uploads each completed video to the local API. PostgreSQL stores record information; video files and database data are persisted under this project directory.

## Run with Docker Compose

Requirements: Docker Engine with the Docker Compose plugin.

```sh
cp .env.example .env
docker compose up --build
```

Open <http://localhost:8080>. The web app is served on port `8080`, the API on `3000`, and PostgreSQL on `5432` by default. Change `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env` if those ports are already in use.

Compose starts its own PostgreSQL container with database `record` and user `postgres`. Set `POSTGRES_PASSWORD` in `.env` to configure its password. Inside Compose, the API connects to the database hostname `db`; `localhost` inside a container refers to that container itself.

The database files are stored in `./data/postgres`, and uploaded videos are stored in `./data/videos`. Keep or back up these directories to preserve records and videos. Do not remove them when taking the containers down.

## Run services from the host

Install Node.js 22 or newer and pnpm 10, then install workspace dependencies:

```sh
pnpm install
```

For host-run development, the API must connect to PostgreSQL at `localhost` using database `record`, user `postgres`, and the password configured for that database. The provided `.env.example` documents these values; Compose itself uses the `db` hostname for its API container.

Start the API and web development servers from the repository root:

```sh
pnpm dev
```

The API uses port `3000`; the web development server uses its configured Vite port. The web app proxies `/api` requests to the API during development.

## Camera access

Allow camera access when prompted by the browser. Camera capture is available on `localhost` and on secure HTTPS origins; browsers generally block camera access from an insecure remote HTTP origin.

## Data and configuration

- `./data/postgres`: persistent PostgreSQL database files.
- `./data/videos`: uploaded packing videos.
- `.env`: local Compose overrides (copy from `.env.example`; this file is ignored by Git).

The Compose stack uses a separate PostgreSQL container even if a PostgreSQL server is already installed on the host. To run only the API on the host, configure it to use the host database address `localhost`; do not use the Compose-only hostname `db` from a host process.
