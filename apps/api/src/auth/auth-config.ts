import { isAbsolute, join } from 'node:path';

export interface AuthConfig {
  rpName: string;
  rpID: string;
  origin: string;
  storageDirectory: string;
  stateDirectory: string;
  sessionSecret: string;
  enrollmentSecret: string;
  sessionTtlSeconds: number;
  production: boolean;
}

export const AUTH_CONFIG = 'AUTH_CONFIG';

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const rpName = requiredOrDefault(env.PASSKEY_RP_NAME, 'Packing Video Manager', production, 'PASSKEY_RP_NAME');
  const rpID = requiredOrDefault(env.PASSKEY_RP_ID, 'localhost', production, 'PASSKEY_RP_ID').toLowerCase();
  const origin = requiredOrDefault(env.PASSKEY_ORIGIN, 'http://localhost:5173', production, 'PASSKEY_ORIGIN');
  const storageDirectory = env.PASSKEY_STORAGE_DIR ?? join(process.cwd(), 'data', 'auth');
  const stateDirectory = env.PASSKEY_STATE_DIR ?? join(process.cwd(), 'data', 'auth-state');
  const sessionSecret = requiredOrDefault(env.AUTH_SESSION_SECRET, 'dev-only-session-secret-change-before-production-123456789', production, 'AUTH_SESSION_SECRET');
  const enrollmentSecret = requiredOrDefault(env.PASSKEY_ENROLLMENT_SECRET, 'dev-only-enrollment-secret-change-before-production-123456789', production, 'PASSKEY_ENROLLMENT_SECRET');
  const sessionTtlSeconds = Number(env.AUTH_SESSION_TTL_SECONDS ?? 28800);

  if (!rpName.trim()) throw new Error('PASSKEY_RP_NAME cannot be empty');
  if (!isValidRpId(rpID)) throw new Error('PASSKEY_RP_ID must be a domain name without a scheme, path, or port');
  if (!isAbsolute(storageDirectory)) throw new Error('PASSKEY_STORAGE_DIR must be an absolute path');
  if (!isAbsolute(stateDirectory)) throw new Error('PASSKEY_STATE_DIR must be an absolute path');
  if (!Number.isSafeInteger(sessionTtlSeconds) || sessionTtlSeconds < 60 || sessionTtlSeconds > 604800) {
    throw new Error('AUTH_SESSION_TTL_SECONDS must be an integer between 60 and 604800');
  }
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('AUTH_SESSION_SECRET must contain at least 32 bytes');
  if (Buffer.byteLength(enrollmentSecret) < 32) throw new Error('PASSKEY_ENROLLMENT_SECRET must contain at least 32 bytes');

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error('PASSKEY_ORIGIN must be a valid origin URL');
  }
  if (parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) {
    throw new Error('PASSKEY_ORIGIN must contain only the origin, without a path or trailing slash');
  }
  if (production && parsedOrigin.protocol !== 'https:') throw new Error('PASSKEY_ORIGIN must use HTTPS in production');
  if (!production && parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== 'localhost') {
    throw new Error('Development PASSKEY_ORIGIN must use HTTPS or localhost');
  }
  if (parsedOrigin.hostname !== rpID && !parsedOrigin.hostname.endsWith(`.${rpID}`)) {
    throw new Error('PASSKEY_ORIGIN host must match PASSKEY_RP_ID or be its subdomain');
  }
  if (production && rpID === 'localhost') throw new Error('PASSKEY_RP_ID must be a public domain in production');

  return { rpName, rpID, origin, storageDirectory, stateDirectory, sessionSecret, enrollmentSecret, sessionTtlSeconds, production };
}

function requiredOrDefault(value: string | undefined, fallback: string, production: boolean, name: string): string {
  if (value?.trim()) return value.trim();
  if (production) throw new Error(`${name} is required in production`);
  return fallback;
}

function isValidRpId(value: string): boolean {
  if (!value || value.includes(':') || value.includes('/') || value.startsWith('.') || value.endsWith('.')) return false;
  try {
    return new URL(`https://${value}`).hostname === value;
  } catch {
    return false;
  }
}
