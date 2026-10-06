# Database Operator Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the initial operator account and passkey in PostgreSQL, include operator ID and name in sessions, show the signed-in name in the app footer, and attribute new packing records to that operator.

**Architecture:** Add a minimal `OperatorEntity` and a `PasskeyCredentialEntity` with a many-to-one ownership relation. Registration collects a name, creates the first operator and verified credential in one database transaction, then signed sessions carry the operator UUID and name. The API writes the UUID to new records and the web footer displays the session name. Remove file-backed credential storage and its Compose mounts; retain the existing one-time enrollment authorization and WebAuthn checks.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17, `@simplewebauthn` 14, React 19, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-06-database-operator-auth-design.md`

## Global Constraints

- Persist account and public passkey credential data in the existing PostgreSQL database.
- The account contains only a stable ID and the operator's required name.
- Initial enrollment creates one account and its first passkey; it is not a general account-creation mechanism.
- Do not import the current JSON credential store or retain its Compose mounts/configuration.
- Record identity comes from the verified session, never from a client-supplied operator ID.
- Display the operator name from the verified session in place of the fixed footer product label.
- Do not add or run automated tests unless explicitly requested; use type checks/build and documented manual flow verification.

## Review Focus

- Missing, blank, or overlong operator name is rejected before starting a registration ceremony.
- Registration authorization is expired, reused, or races with another first enrollment; at most one operator and credential can be created.
- The verified registration transaction fails midway; neither an empty account nor an orphan credential remains.
- Invalid or expired session cannot supply an operator ID to record creation.
- Existing records have no operator ID when TypeORM adds the new field; schema synchronization must not require a data backfill.

---

### Task 1: Add database entities and wire TypeORM

**Files:**
- Create: `apps/api/src/auth/operator.entity.ts`
- Create: `apps/api/src/auth/passkey-credential.entity.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/records/record.entity.ts`

**Interfaces:**
- Produces `OperatorEntity { id: string; name: string }` mapped to table `operators`; the UUID primary key is allocated during registration options so it can also be the WebAuthn user handle.
- Produces `PasskeyCredentialEntity` mapped to `passkey_credentials`, storing credential ID, public key, counter, transports, device type, backed-up status, and required `operatorId` relation. Credential ID is unique.
- `RecordEntity` gains nullable `operatorId: string | null` and a many-to-one relation to `OperatorEntity` with `onDelete: 'RESTRICT'`; nullable supports existing rows without backfill while API-created rows will always set the value.

- [ ] Define `OperatorEntity` with a UUID primary key, required trimmed 1–255-character name, and one-to-many credential relation.
- [ ] Define `PasskeyCredentialEntity` with unique credential ID and PostgreSQL-safe columns for all stored WebAuthn metadata; index its owner ID.
- [ ] Add the nullable operator foreign key to `RecordEntity`, preserving old rows without a database data conversion.
- [ ] Register the operator repository with `AuthModule` and all entities with the root TypeORM connection; resolve passkey repositories from the transaction manager.
- [ ] Run `pnpm --filter @packing-video-manager/api typecheck` and inspect the synchronized schema definitions for UUID types, uniqueness, and delete behavior.

### Task 2: Replace file store with database-backed first enrollment and login

**Files:**
- Create: `apps/api/src/auth/operator-name.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth-config.ts`
- Modify: `apps/api/src/auth/enrollment-authorization.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/session.service.ts`
- Delete: `apps/api/src/auth/credential-store.ts`
- Delete: `apps/api/src/auth/file-credential-store.ts`

**Interfaces:**
- `AuthService.registrationOptions(authorization: string, name: string)` validates the name and one-time token, rejects enrollment if an operator exists, allocates an operator UUID for the WebAuthn `userID`, and binds the challenge and pending account details to the authorization.
- `AuthService.completeRegistration(authorization: string, response: RegistrationResponseJSON)` verifies the ceremony and atomically inserts the operator and first credential.
- Authentication resolves `response.id` to a credential and owning operator, verifies with stored credential material, persists updated counter/device metadata, and returns a session for that operator.

- [ ] Extend the one-time enrollment state to bind pending operator UUID, normalized name, and challenge to the issued token; reject expired/reused tokens and repeated initial registration. Refuse rebinding a token that already has a challenge.
- [ ] Update registration endpoints to require the operator name at `/auth/register/options` and retain the same authorization-bound name through `/auth/register/verify`.
- [ ] Replace `CREDENTIAL_STORE` and `FileCredentialStore` use with TypeORM repositories and a `DataSource.transaction` that takes a PostgreSQL transaction advisory lock for the single operator slot, checks that no operator exists, then inserts the operator and credential together only after successful WebAuthn verification. This prevents two independently issued enrollment links from creating two accounts concurrently.
- [ ] Use the operator UUID bytes as WebAuthn `userID`; preserve the required user verification, expected origin, RP ID, and generic login failure behavior.
- [ ] Update PostgreSQL credential counter, device type, and backup metadata on successful authentication.
- [ ] Sign operator UUID and name into the session and have verification return that identity only after signature and expiry checks.
- [ ] Remove file-only auth storage configuration along with the file credential store provider and implementation.
- [ ] Run API typecheck and build; manually inspect that failed verification does not persist rows and that duplicate/second enrollment is rejected.

### Task 3: Put operator identity in sessions and attribute records

**Files:**
- Modify: `apps/api/src/auth/session.service.ts`
- Modify: `apps/api/src/auth/auth.guard.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/records/records.controller.ts`
- Modify: `apps/api/src/records/records.service.ts`

**Interfaces:**
- `SessionService.issue(operatorId: string, operatorName: string)` signs an operator UUID and name into the session payload.
- `SessionService.verify(cookieValue?: string)` returns `{ operatorId: string; operatorName: string }` or `undefined` (invalid/expired sessions do not produce identity).
- `GET /auth/session` returns `{ authenticated: true; name: string }` for a valid session, preserving `{ authenticated: false }` for an invalid one.
- `AuthGuard` attaches verified `operatorId` to the Express request; record upload calls `RecordsService.create(operatorId, orderCode, upload, captureId?, recordedAt?)`.

- [ ] Change session verification from boolean to verified identity while retaining signature comparison, expiry, cookie, and logout behavior.
- [ ] Keep `GET /auth/session` response compatible with the web client by returning `{ authenticated: true }` only when a verified operator ID is present.
- [ ] Return the signed session's operator name from `GET /auth/session` and from successful login verification so the client can render it without an extra lookup.
- [ ] Attach only the verified operator ID to guarded requests and reject malformed IDs as unauthenticated.
- [ ] Pass the guard-provided ID through upload controller to `RecordsService.create` and set `RecordEntity.operatorId` before save.
- [ ] Preserve the record list, download, and delete response shape unless an existing consumer explicitly needs the new field.
- [ ] Run API typecheck/build and manually verify an unauthenticated request cannot create a record and an authenticated upload persists the session operator UUID.

### Task 4: Collect the name in enrollment UI and remove file-storage deployment setup

**Files:**
- Modify: `apps/web/src/components/PasskeyEnrollment.tsx`
- Modify: `apps/web/src/components/SignIn.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/api/auth.ts`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- `registerPasskey(authorization: string, name: string): Promise<void>` sends the same entered name to the options request; verify remains bound to the issued authorization.
- Enrollment UI requires a non-empty operator name and shows success only after the API confirms persistence.
- `App` stores the name returned by login/session responses and displays it in the footer in place of `Packing Video Manager`.
- API configuration no longer exposes `PASSKEY_STORAGE_DIR` or `PASSKEY_STATE_DIR`; Compose no longer mounts `data/auth` or `data/auth-state`.

- [ ] Add a labeled Vietnamese name input to the enrollment page, disable registration for blank input, and send the entered name with registration options; server validation trims it and rejects names longer than 255 characters.
- [ ] Update the API client registration function signature and payload.
- [ ] Extend the auth API response types to provide the verified operator name, and update `SignIn`'s success callback to pass it to `App`.
- [ ] Store the operator name in `App` when login succeeds or an existing session is restored; render it in the existing footer label while preserving the user's footer placement change.
- [ ] Remove file-only auth storage configuration and Compose auth directory environment variables and mounts; keep PostgreSQL and video mounts unchanged.
- [ ] Update README setup/enrollment/backup guidance to explain first enrollment name, PostgreSQL credential storage, and no auth-directory backup requirement; remove text about adding recovery passkeys and backing up auth JSON/state files.
- [ ] Run web and API typechecks/builds, then manually walk through issuing the one-time URL, registering with a name, signing in, and confirming a record receives the operator ID.

### Task 5: Final review and integration checks

**Files:**
- Review all files listed in Tasks 1–4.

- [ ] Search application source, Compose configuration, `.env.example`, and active README guidance for remaining references to `FileCredentialStore`, `CREDENTIAL_STORE`, `PASSKEY_STORAGE_DIR`, `PASSKEY_STATE_DIR`, `data/auth`, and `data/auth-state`; remove obsolete references while leaving superseded historical specs/plans intact.
- [ ] Review TypeORM registration and foreign-key behavior, including nullable attribution for pre-existing record rows and required attribution for new API writes.
- [ ] Run `pnpm typecheck` and `pnpm build`; report results without running automated tests.
- [ ] Review the final diff for accidental changes to session security, WebAuthn validation, record API response shape, or persistent data directories.
