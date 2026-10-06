# Database Operator Authentication Design

## Purpose

Replace file-backed passkey credential storage with PostgreSQL, create a minimal operator account during the initial one-time passkey enrollment, and record the authenticated operator ID on each new packing record. The deployment will start with fresh authentication data; existing credential files will not be imported.

## Agreed requirements

- Keep passkey-based authentication and the existing one-time enrollment link workflow.
- The initial enrollment page asks for the operator's name.
- Successful initial registration creates one operator account and associates the verified passkey with it.
- The operator account needs only a stable ID and name. No email, password, roles, or account-management UI are required.
- Store account and public passkey credential data in the existing PostgreSQL database.
- Include the operator ID in authenticated sessions and store it on records created by that operator.
- Start authentication storage fresh. Do not import the current JSON credential store or retain its Compose mounts/configuration.

## Data model

Add an operator account entity with a UUID primary key and required display name. Add a passkey credential entity for the WebAuthn credential ID, public key, signature counter, transports, device type, backup status, and owning operator ID. Credential IDs are unique and each passkey belongs to one operator. Use the operator UUID as the stable WebAuthn user handle so no additional handle field is needed.

Add the operator ID to `packing_records`, associated with the operator account that created the record. The relation must preserve record attribution and avoid deleting an account that is referenced by records. Records created after initial enrollment always have an operator ID.

## Enrollment and authentication flow

The existing server command continues to issue a short-lived, single-use enrollment URL. The enrollment page collects the operator name and sends it with the registration ceremony. The backend verifies the challenge, origin, relying-party ID, and user verification as it does today, then persists the operator account and verified credential together. Initial enrollment is rejected once an operator account exists; enrollment does not become a general account-creation mechanism.

Login looks up the submitted credential in PostgreSQL, verifies it using its stored public data, updates the signature counter and metadata, and issues a signed session containing the operator ID. The authentication guard exposes the verified operator ID to protected handlers. Record creation uses that ID from the authenticated session, never a client-supplied ID.

Existing challenge expiry, enrollment authorization checks, browser-origin validation, secure cookie settings, and generic login failure behavior remain in effect.

## Storage and deployment

Use TypeORM entities and the existing PostgreSQL connection for account and credential persistence. Remove the file credential-store provider and its implementation, file-only auth storage configuration, and the `data/auth` and `data/auth-state` API volume mounts. Keep the video and PostgreSQL data volumes. Update the README to explain first-time enrollment, the required operator name, database-backed credential storage, and which directories need backup.

There is no credential-file import, old-schema data conversion, or automated reset of PostgreSQL/video data in this change. Operators start authentication from a new enrollment using the documented one-time link.

## Failure handling

- Registration must not create an account or credential unless WebAuthn verification succeeds.
- Account and first credential persistence must be atomic so a failed save cannot leave a usable empty account.
- Duplicate credential IDs and repeated initial enrollment are rejected.
- Invalid/expired/reused enrollment authorizations and invalid WebAuthn ceremonies remain rejected.
- Missing or invalid session signatures do not produce an operator identity; protected requests continue to return HTTP 401.
- Record creation fails if it cannot associate the authenticated operator with the saved record.

## Out of scope

Multiple operator accounts, roles, password/email login, a passkey management UI, recovery-passkey enrollment after bootstrap, credential-file migration, and destructive deletion/reset of persistent database or video directories.

## Acceptance criteria

1. A fresh deployment can issue an enrollment link and collect a non-empty operator name.
2. A successfully verified first passkey creates exactly one operator account and its credential in PostgreSQL.
3. No passkey credential JSON or auth-state file is created or mounted by Compose.
4. The registered passkey can authenticate; credential counters/metadata update in PostgreSQL.
5. The signed session identifies the operator, and the API derives identity only from the verified session.
6. Every newly created record stores the authenticated operator UUID in `packing_records`.
7. Repeated initial enrollment, invalid ceremonies, and unauthenticated record writes are rejected.
8. README and Compose configuration describe and run the database-backed, fresh-enrollment flow.
