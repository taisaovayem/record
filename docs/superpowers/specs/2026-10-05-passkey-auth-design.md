# Passkey Authentication Design

## Purpose

Protect the Packing Video Manager when it is published on the internet under a Cloudflare-managed domain. A single operator signs in with a passkey saved by Google Password Manager. The application has no user accounts or user table. Registered passkey credentials are persisted as a JSON file in a host-mounted directory so the file store can later be replaced by a database-backed credential store.

## Agreed requirements

- The app will be accessed through a domain with HTTPS, with Cloudflare managing DNS and sitting in front of the app.
- Authentication is only an access gate for using the app. There are no user profiles, roles, or per-user record ownership.
- The operator authorizes adding a passkey by running a command on the server.
- The passkey is created in a browser WebAuthn ceremony and stored in Google Password Manager. Its private key never goes to the server.
- The server stores credential data in a file under a directory mounted from the host by Docker Compose, not in PostgreSQL.
- The storage boundary should allow switching to a database repository in the future without changing the WebAuthn protocol or auth routes.
- All record-management API operations require an authenticated session. Login, logout, and the explicitly authorized passkey enrollment flow remain available without an existing session.

## Architecture

Implement an authentication module with separate WebAuthn ceremony handling, credential storage, and session handling. The credential repository interface supports finding credentials for authentication and adding a credential after verified registration. Its initial implementation reads and writes a JSON file in `PASSKEY_STORAGE_DIR` (defaulting to `./data/auth` outside Docker and `/app/data/auth` in Compose). Writes use a temporary file and atomic rename; the containing directory is created if absent. Compose mounts `./data/auth:/app/data/auth`.

The file contains a stable opaque user handle for the app's one shared identity and one or more credential records. Each record includes the WebAuthn credential ID, public key, signature counter, and any metadata needed by the selected WebAuthn library. It contains no private key. Multiple credentials allow the operator to add a recovery passkey by running the same enrollment command again.

The backend exposes WebAuthn registration and authentication option/verification endpoints, plus logout. A registration command run in the API container creates a short-lived, single-use enrollment authorization. The operator opens the resulting enrollment URL and completes registration with the browser and Google Password Manager. The authorization is bound to the ceremony and consumed after success; registration challenges and enrollment authorizations expire and are invalidated after use. Enrollment availability is not open to ordinary visitors.

Login uses a discoverable credential for the app's fixed identity, with user verification required. On successful verification, the API issues a short-lived authenticated session in an `HttpOnly`, `Secure`, `SameSite` cookie. The API validates that cookie on protected requests. Logout clears the cookie. The session signing secret is supplied through environment configuration, and production startup fails clearly when required security configuration is missing or invalid. Browser-origin validation is applied to authentication state-changing endpoints.

The React app first checks whether the session is authenticated. If not, it presents a passkey sign-in screen; after successful login it shows the existing record-management app. It also provides the enrollment page used only with the one-time authorization from the server command. No record or user schema is added to PostgreSQL.

The WebAuthn relying-party ID and expected origin are explicit configuration values (for example, `PASSKEY_RP_ID` and `PASSKEY_ORIGIN`). The relying-party ID is the app's domain, and the expected origin is its HTTPS origin. The web/API deployment must preserve that origin relationship through Cloudflare and the reverse proxy.

## API and data behavior

- Unauthenticated record API calls return HTTP 401 and do not read, create, download, or delete records.
- Authentication challenges are unpredictable, short-lived, bound to their ceremony, and accepted once.
- Registration accepts credentials only after verifying the expected challenge, origin, relying-party ID, and required user verification. Persist only validated credential material.
- Authentication verifies the signature using the stored public key and checks the expected challenge, origin, relying-party ID, and user-verification result before issuing a session.
- The credential file is updated atomically so an interrupted write cannot corrupt the previous valid credential set.
- Invalid, expired, reused, or malformed enrollment authorizations are rejected without changing the credential file.
- Authentication responses do not reveal whether a particular credential ID is registered.

## Deployment and operations

Docker Compose mounts `./data/auth` to the API container. The directory is included in backup guidance alongside PostgreSQL and video data. The application documentation explains that public deployment requires HTTPS and that `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` must exactly match the configured domain and origin. Cloudflare DNS alone does not configure the origin; the deployment must use an HTTPS-capable Cloudflare setup and a secure connection from Cloudflare to the origin.

The API must remain the enforcement point even if the web UI is bypassed. Protected API routes are guarded directly, including when requests reach the API port without passing through the web server. Cookies are always marked secure in production. CORS is restricted to the configured application origin rather than allowing arbitrary origins.

## Failure handling

- Missing or invalid passkey configuration prevents production startup with a clear configuration error.
- Missing credential storage is initialized as an empty store; malformed or unreadable credential data fails closed and does not silently reset registered credentials.
- Expired challenges or enrollment authorizations require the operator to restart the ceremony.
- An enrollment command or browser ceremony interrupted before successful verification does not add a credential.
- If the file cannot be safely updated, registration fails and leaves the prior credential file intact.
- Expired or invalid sessions receive HTTP 401 and return the user to the sign-in screen.
- A lost session-signing secret invalidates existing sessions but does not remove registered credentials.

## Out of scope

User accounts, per-user permissions, password or email login, database persistence for credentials, credential management UI, automatic Cloudflare provisioning, deployment of certificates/reverse proxies, and any change to video record behavior beyond requiring authentication.

## Acceptance criteria

1. Docker Compose mounts a host directory for passkey credential storage, and registered credentials survive API container recreation.
2. Running the documented server command authorizes one passkey enrollment ceremony; visitors without that authorization cannot register credentials.
3. A passkey can be created with Google Password Manager on the configured HTTPS domain, and no private key is sent to or stored by the server.
4. The credential file stores the public credential material required for later authentication and can contain multiple passkeys for the shared app identity.
5. A registered passkey signs the operator in, and the session survives normal page navigation while remaining in a secure HTTP-only cookie.
6. Unauthenticated callers cannot use any record API operation, including by calling the API directly.
7. Invalid challenges, origins, relying-party IDs, signatures, expired/reused enrollment authorizations, and invalid sessions are rejected.
8. The existing record workflow behaves the same after authentication.
9. The README documents HTTPS/domain configuration, enrollment, the mounted auth-data directory, and its backup requirement.
10. Credential storage is behind an interface that permits a later database implementation without changing the browser's WebAuthn ceremony contract.
