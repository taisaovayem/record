import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { Inject, Injectable } from '@nestjs/common';

export const SESSION_COOKIE_NAME = 'packing_session';

export interface SessionCookie {
  value: string;
  options: CookieOptions;
}

@Injectable()
export class SessionService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  issue(): SessionCookie {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ exp: now + this.config.sessionTtlSeconds, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
    const signature = this.sign(payload);
    return { value: `${payload}.${signature}`, options: this.cookieOptions(this.config.sessionTtlSeconds * 1000) };
  }

  verify(cookieValue: string | undefined): boolean {
    if (!cookieValue) return false;
    const separator = cookieValue.lastIndexOf('.');
    if (separator <= 0) return false;
    const payload = cookieValue.slice(0, separator);
    const signature = cookieValue.slice(separator + 1);
    const expected = this.sign(payload);
    if (!constantTimeEqual(signature, expected)) return false;
    try {
      const session: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!session || typeof session !== 'object') return false;
      const expiry = (session as { exp?: unknown }).exp;
      const nonce = (session as { nonce?: unknown }).nonce;
      return Number.isSafeInteger(expiry) && (expiry as number) > Math.floor(Date.now() / 1000) && typeof nonce === 'string';
    } catch {
      return false;
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
