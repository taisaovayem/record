
# Hướng dẫn sử dụng
Cần cài đặt Docker nếu chưa có
[Windows](https://docs.docker.com/desktop/setup/install/windows-install/) |
[Macos](https://docs.docker.com/desktop/setup/install/mac-install/) |
[Linux](https://docs.docker.com/desktop/setup/install/linux/)

Cài đặt xong chạy Docker lên, bật tùy chọn động khi mở máy để khỏi phải chạy lại Docker khi khởi động lại máy.
Nếu khởi động lại máy mà Docker chư bật, thì chỉ cẩn chạy phần mềm Docker lên và chạy các container có trong đó là được

Đối với Windows, chạy file `start-windows.bat`

Đối với MacOS/Linux, chạy file `start-macos-linux.sh`

Chỉ cần chạy một lần duy nhất, những lần sử dụng sau không cần phải chạy lại nữa

Sử dụng local, truy cập [http://localhost:8080](http://localhost:8080). Khi dùng từ máy khác hoặc đưa lên Internet, hãy truy cập qua reverse proxy HTTPS đã cấu hình.

# Khi đưa ứng dụng lên Internet, hãy bật passkey, dùng HTTPS cho tên miền và đặt mật khẩu riêng trong `.env`.

## Hướng dẫn dùng phím tắt
`N` để tạo bản ghi mới
`Q` để quét QR đơn
`R` để bắt đầu quay
`S` để lưu và kêt thúc

# Packing Video Manager

A local web app for recording and managing packing videos. The browser captures video with its camera, then uploads the completed recording to the local API. PostgreSQL stores record information; the database and video files persist under this project directory.

## Start the complete app with Docker Compose

Requirements: Docker Engine with the Docker Compose plugin.

```sh
cp .env.example .env
# Generate two different values with `openssl rand -hex 32` and set
# PASSKEY_ENROLLMENT_SECRET and AUTH_SESSION_SECRET in .env.
docker compose up --build
```

Open <http://localhost:8080>. Compose starts the web app, NestJS API, and its own PostgreSQL container. The host ports are bound to loopback only; change `WEB_PORT`, `API_PORT`, or `POSTGRES_PORT` in `.env` if any is already occupied. Inter-container communication uses web `80`, API `3000`, and PostgreSQL `5432`, regardless of host port values.

The Compose database is named `record` and uses user `postgres`. Set `POSTGRES_PASSWORD` in `.env` to change its password. The API connects to PostgreSQL using the Compose service hostname `db` (container `localhost` would refer to the API container itself). The web server proxies `/api` requests to `api:3000` on the private Compose network. The example `.env` runs local Compose in development mode; production requires explicit passkey settings and non-empty secrets.

## Deploy behind the existing Nginx and Cloudflare

For `shopee.saovayem.com`, set these values in `.env` and generate two different secrets with `openssl rand -hex 32`:

```dotenv
NODE_ENV=production
PASSKEY_RP_NAME=Packing Video Manager
PASSKEY_RP_ID=shopee.saovayem.com
PASSKEY_ORIGIN=https://shopee.saovayem.com
PASSKEY_ENROLLMENT_SECRET=<first generated value>
AUTH_SESSION_SECRET=<second generated value>
```

The API stores credentials in `./data/auth`, mounted at `/app/data/auth`, and tracks initialization plus whether a credential has ever been registered in the separate `./data/auth-state` directory. If registered credentials go missing or the credential file becomes empty, the API fails closed and requires restoring the backup. Run the app with the server override so only the `web` container joins the existing external `web_network`; PostgreSQL and API stay on the app's private Compose network:

```sh
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

The existing `nginx-proxy` is already attached to `web_network`. Add this server block inside its `http` section to route the domain to the web container:

```nginx
server {
    listen 80;
    server_name shopee.saovayem.com;

    location / {
        proxy_pass http://packing-record-web:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
    }
}
```

The web container is also bound to a loopback host port for local checks; the Nginx upstream uses the container alias and port, so changing host ports does not change this block. The API and database host mappings are loopback-only. Do not attach the API or database to `web_network`.

Passkeys require the browser to load the site through HTTPS. The Nginx configuration shown above listens on port 80 only; mapping host port `443` by itself does not enable TLS. Use Cloudflare Tunnel or configure a certificate and HTTPS listener at the origin before selecting an encrypted Cloudflare-to-origin mode. Cloudflare Full (strict) requires the origin to accept HTTPS on port 443 with a valid matching certificate. [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

To add the first passkey (or another recovery passkey), run the command inside the API container and open the one-time URL it prints in the browser:

```sh
docker compose -f docker-compose.yml -f docker-compose.server.yml exec api pnpm --filter @packing-video-manager/api auth:enroll
```

Each enrollment authorization expires after ten minutes and can be used once. The browser saves the private key in Google Password Manager; the server file stores the public credential data only. Back up both `./data/auth` and `./data/auth-state` alongside `./data/postgres` and `./data/videos`.

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

The included `.env.example` has the supplied local values. Copy it to `.env` before using the command above, and edit the values if your host database differs. For host development, set `PASSKEY_ORIGIN=http://localhost:5173`; the API listens on port `3000` and Vite serves the web app on port `5173`, proxying `/api` to `http://localhost:3000`. Compose overrides the API database host to `db` and uses `POSTGRES_PASSWORD` for its own database container.

## Record and manage videos

From the list, choose **Tạo bản quay** or press **N**. Enter an order code, or choose **Quét QR** / press **Q** and point the camera at a QR code. The scanned text is inserted into the editable order-code field, where it can be corrected before recording. Duplicate order codes are allowed.

Press **R** to start recording and **S** to stop. Stopping uploads and saves that recording automatically. The browser uses MP4 when supported; otherwise it records in a supported browser format. After the server confirms the save, the app returns to the list and refreshes it for the next packing session. If upload fails, keep the page open and choose **Thử tải lại** to upload the same captured video; it remains in browser memory until a successful save. Action shortcuts are ignored while typing in text fields.

The list is always newest-first and paginated (20 records per page). Search by order code, download a saved video, or select multiple records on the current page and choose delete. Deletion asks for confirmation and removes the associated video files as well as their database records. There is no sort control or archived-video preview.

## Camera access and data backup

Allow camera access when prompted. Browsers permit camera capture on `localhost` and secure HTTPS origins; they generally block it on insecure remote HTTP origins. QR scanning also needs camera permission.

Persistent data lives here:

- `./data/postgres` — PostgreSQL database files.
- `./data/videos` — uploaded video files.
- `./data/auth` — passkey credential file; it contains public keys and credential metadata, not private keys.
- `./data/auth-state` — passkey-store initialization marker; keep it with `./data/auth` during backup and restore.
- `.env` — local configuration (ignored by Git; create it from `.env.example`).

Back up all data directories to preserve records, videos, and passkeys. Stop the stack before copying them so PostgreSQL files and database metadata are consistent. Do not delete these directories when bringing containers down. Compose binds PostgreSQL to host loopback port `5433` by default so it can run alongside a host PostgreSQL server on `5432`; use `localhost` for the host-run API and `db` only for the API running inside Compose.
