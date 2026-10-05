# Passkey Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a Google Password Manager passkey sign-in before anyone can use the app, with credentials persisted outside PostgreSQL in a Docker-mounted file.

**Architecture:** Add a NestJS auth module using SimpleWebAuthn for registration and authentication, a file-backed credential repository behind an interface, and HMAC-signed secure session cookies. A server CLI issues one-time enrollment authorization; the browser completes WebAuthn registration. Guard the records API and gate the React app on session state.

**Tech Stack:** NestJS 11, React, TypeScript, `@simplewebauthn/server` and `@simplewebauthn/browser` 14.x, Node 22, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-05-passkey-auth-design.md`

## Global Constraints

- The application has no user accounts or user table.
- The private key never goes to or is stored by the server.
- The server stores credential ID, public key, signature counter, and required metadata in a mounted file directory, not PostgreSQL.
- All record-management API operations require an authenticated session, including direct requests to the API container.
- Registration is possible only with short-lived, single-use authorization issued by a server command.
- Use the configured HTTPS origin and relying-party ID for WebAuthn verification.
- Credential writes use a temporary file and atomic rename; malformed credential data fails closed.
- Authenticated sessions use `HttpOnly`, `Secure`, `SameSite` cookies and a configured session signing secret.
- `@simplewebauthn/server` 14.x requires Node.js 22 or newer, matching this repository's Node 22 runtime. [Official package documentation](https://simplewebauthn.dev/docs/packages/server)

## Review Focus

- Missing, malformed, and empty credential files must not silently erase registered credentials; cover in Task 1's repository behavior.
- Concurrent or repeated enrollment-token use must never register more than one credential; cover in Task 2's enrollment authorization handling.
- A valid signature with a wrong challenge, origin, relying-party ID, or missing user verification must not create a session; cover in Task 2's verification handling.
- Expired session cookies and invalid signatures must be rejected; cover in Task 2's session handling.
- Calling records endpoints directly, bypassing the web proxy/UI, must still require authentication; cover in Task 2's guard integration.

---

### Task 1: Credential storage and auth configuration

**Files:**
- Create: `apps/api/src/auth/credential-store.ts`
- Create: `apps/api/src/auth/file-credential-store.ts`
- Create: `apps/api/src/auth/auth-config.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- `CredentialStore.getUserHandle(): Promise<string>`
- `CredentialStore.list(): Promise<StoredCredential[]>`
- `CredentialStore.findById(id: string): Promise<StoredCredential | undefined>`
- `CredentialStore.add(credential: StoredCredential): Promise<void>`
- `StoredCredential` contains `id`, `publicKey` (base64url), `counter`, `transports`, `deviceType`, and `backedUp`.
- `AuthConfig` exposes `rpName`, `rpID`, `origin`, `storageDirectory`, `sessionSecret`, `enrollmentSecret`, and `sessionTtlSeconds` after validating environment variables.

- [ ] Add `@simplewebauthn/server@^14` and `@simplewebauthn/browser@^14` to the relevant workspace packages and update the lockfile.
- [ ] Implement `FileCredentialStore` to initialize an absent store with a stable random user handle, validate the JSON structure, and atomically persist additions without replacing valid data on failure.
- [ ] Implement configuration loading for `PASSKEY_RP_NAME`, `PASSKEY_RP_ID`, `PASSKEY_ORIGIN`, `PASSKEY_STORAGE_DIR`, `PASSKEY_ENROLLMENT_SECRET`, `AUTH_SESSION_SECRET`, and `AUTH_SESSION_TTL_SECONDS`; use development localhost defaults only outside production and fail startup in production when required values are absent or invalid.

### Task 2: WebAuthn ceremonies, enrollment CLI, sessions, and API guard

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/auth/session.service.ts`
- Create: `apps/api/src/auth/enrollment-authorization.service.ts`
- Create: `apps/api/src/auth/enroll.cli.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/records/records.module.ts`
- Modify: `apps/api/src/records/records.controller.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- `AuthService.registrationOptions(authorization: string): Promise<PublicKeyCredentialCreationOptionsJSON>`
- `AuthService.completeRegistration(authorization: string, response: RegistrationResponseJSON): Promise<void>`
- `AuthService.authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON>`
- `AuthService.completeAuthentication(response: AuthenticationResponseJSON): Promise<SessionCookie>`
- `SessionService.issue(): SessionCookie`, `SessionService.verify(cookie: string): boolean`, `SessionService.clear(): CookieOptions`
- `EnrollmentAuthorizationService.create(): Promise<string>` and `consume(token: string): Promise<boolean>`; authorizations are single-use and expire.

- [ ] Add `AuthModule` and an API command `pnpm --filter @packing-video-manager/api auth:enroll`. The CLI calls a private API issuance route over loopback, authenticated with `PASSKEY_ENROLLMENT_SECRET` shared through the container environment, and prints a one-time enrollment URL/token; the running API keeps authorization state so CLI and server processes share it without writing private-key material.
- [ ] Implement registration using discoverable credentials and required user verification; bind challenge state to the one-time authorization; validate response challenge, origin, RP ID, and verification before persisting credential material.
- [ ] Implement username-less authentication using the stored credentials; validate challenge, origin, RP ID, signature, and user verification, then update the credential counter and issue a signed session cookie.
- [ ] Implement expiring HMAC-signed sessions with constant-time signature comparison, secure cookie options, and logout cookie clearing.
- [ ] Expose `GET /api/auth/session`, secret-protected `POST /api/auth/enrollments/issue`, `POST /api/auth/register/options`, `POST /api/auth/register/verify`, `POST /api/auth/login/options`, `POST /api/auth/login/verify`, and `POST /api/auth/logout`; issue the browser URL as `/enroll#<token>`, validate same-origin requests on state-changing browser auth routes, and avoid credential-existence leaks.
- [ ] Apply `AuthGuard` to `RecordsController` so every record operation is protected at the API layer even when the API port is called directly; keep login/logout/enrollment routes outside this guard and protect the enrollment-issuance route with `PASSKEY_ENROLLMENT_SECRET`.
- [ ] Configure CORS for the exact `PASSKEY_ORIGIN` and register the auth module in `AppModule`.

### Task 3: Sign-in and enrollment pages

**Files:**
- Create: `apps/web/src/api/auth.ts`
- Create: `apps/web/src/components/SignIn.tsx`
- Create: `apps/web/src/components/PasskeyEnrollment.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `getSession(): Promise<{ authenticated: boolean }>`
- `loginWithPasskey(): Promise<void>` performs options and verify calls with `startAuthentication()`.
- `registerPasskey(token: string): Promise<void>` performs registration options and verify calls with `startRegistration()`.
- `logout(): Promise<void>` clears the session through the API.

- [ ] Implement the auth API client with `credentials: 'include'` and clear handling of HTTP 401 responses.
- [ ] Gate `App` on session lookup: show `SignIn` when unauthenticated, existing record screens when authenticated, and a loading/error state while checking or when the API is unavailable.
- [ ] Implement passkey login through `@simplewebauthn/browser`, then refresh session state; provide a logout action.
- [ ] Implement an enrollment route/page that reads the one-time token from the URL fragment, submits the browser registration ceremony, and reports success or expired/invalid authorization without displaying the token in server request URLs.

### Task 4: Docker, production routing, and operator documentation

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.server.yml`
- Modify: `.env.example`
- Modify: `apps/web/nginx.conf`
- Modify: `README.md`

- [ ] Mount `./data/auth:/app/data/auth` into the API and set `PASSKEY_STORAGE_DIR=/app/data/auth`.
- [ ] Keep the default local Compose setup independent of the server's network; in `docker-compose.server.yml`, keep PostgreSQL/API on the app's private network and connect only web to external `web_network` with alias `packing-record-web`.
- [ ] Document adding a `server_name shopee.saovayem.com` block to the existing Nginx configuration, proxying to `http://packing-record-web:80`; the existing `nginx-proxy` is already on `web_network`, so no other container or network needs to be reconnected.
- [ ] Document that inter-container traffic uses container ports (web `80`, API `3000`, PostgreSQL `5432`), independent of host-published ports. Host port mappings can be set to unused values in `.env`, or disabled for services that do not need host access.
- [ ] Document required production values for RP name, RP ID, exact HTTPS origin, and high-entropy enrollment and session secrets; ensure Compose passes them to the API.
- [ ] Configure the web proxy to forward the original host/protocol headers needed by the deployment while keeping API authorization enforced in NestJS. Keep HTTPS termination at Cloudflare Tunnel or an HTTPS-configured origin so the browser origin remains HTTPS and secure cookies work.
- [ ] Document the Cloudflare HTTPS/origin requirement, the enrollment command and browser flow, recovery passkeys, auth-data backup, and that DNS alone does not secure the connection to the origin.
- [ ] Document that exposing the API port does not bypass authentication and that production cookies require HTTPS.

## Implementation Handoff

Implement the tasks in order. Keep the storage contract independent from the WebAuthn ceremony logic so a future database repository can replace `FileCredentialStore`. Do not add a user entity or alter record ownership behavior.
