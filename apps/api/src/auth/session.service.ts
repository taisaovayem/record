import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { Inject, Injectable } from '@nestjs/common';
import { normalizeOperatorName } from './operator-name.js';

export const SESSION_COOKIE_NAME = 'packing_session';

export interface SessionCookie {
  value: string;
  options: CookieOptions;
  operatorName: string;
}

export interface SessionIdentity {
  operatorId: string;
  operatorName: string;
}

@Injectable()
export class SessionService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  issue(operatorId: string, operatorName: string): SessionCookie {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      exp: now + this.config.sessionTtlSeconds,
      nonce: randomBytes(16).toString('base64url'),
      operatorId,
      operatorName,
    })).toString('base64url');
    const signature = this.sign(payload);
    return {
      value: `${payload}.${signature}`,
      options: this.cookieOptions(this.config.sessionTtlSeconds * 1000),
      operatorName,
    };
  }

  verify(cookieValue: string | undefined): SessionIdentity | undefined {
    if (!cookieValue) return undefined;
    const separator = cookieValue.lastIndexOf('.');
    if (separator <= 0) return undefined;
    const payload = cookieValue.slice(0, separator);
    const signature = cookieValue.slice(separator + 1);
    const expected = this.sign(payload);
    if (!constantTimeEqual(signature, expected)) return undefined;
    try {
      const session: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!session || typeof session !== 'object') return undefined;
      const value = session as { exp?: unknown; nonce?: unknown; operatorId?: unknown; operatorName?: unknown };
      if (!Number.isSafeInteger(value.exp) || (value.exp as number) <= Math.floor(Date.now() / 1000) || typeof value.nonce !== 'string') return undefined;
      if (typeof value.operatorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operatorId)) return undefined;
      if (typeof value.operatorName !== 'string' || normalizeOperatorName(value.operatorName) !== value.operatorName) return undefined;
      return { operatorId: value.operatorId, operatorName: value.operatorName };
    } catch {
      return undefined;
    }
  }

  clear(): CookieOptions {
    return this.cookieOptions(undefined);
  }

  cookieFromHeader(header: string | undefined): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(payload).digest('base64url');
  }

  private cookieOptions(maxAge: number | undefined): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/',
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length > 4096 || right.length > 4096) return false;
  const leftDigest = createHmac('sha256', 'constant-time-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'constant-time-compare').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
