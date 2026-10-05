import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

interface EnrollmentAuthorization {
  expiresAt: number;
  challenge?: string;
}

@Injectable()
export class EnrollmentAuthorizationService {
  private readonly authorizations = new Map<string, EnrollmentAuthorization>();
  private readonly lifetimeMs = 10 * 60 * 1000;

  async create(): Promise<string> {
    this.removeExpired();
    const token = randomBytes(32).toString('base64url');
    this.authorizations.set(this.hash(token), { expiresAt: Date.now() + this.lifetimeMs });
    return token;
  }

  bindChallenge(token: string, challenge: string): boolean {
    const authorization = this.authorizations.get(this.hash(token));
    if (!authorization || authorization.expiresAt <= Date.now()) {
      if (authorization) this.authorizations.delete(this.hash(token));
      return false;
    }
    authorization.challenge = challenge;
    return true;
  }

  isValid(token: string): boolean {
    const key = this.hash(token);
    const authorization = this.authorizations.get(key);
    if (!authorization || authorization.expiresAt <= Date.now()) {
      this.authorizations.delete(key);
      return false;
    }
    return true;
  }

  challengeFor(token: string): string | undefined {
    const key = this.hash(token);
    const authorization = this.authorizations.get(key);
    if (!authorization || authorization.expiresAt <= Date.now()) {
      this.authorizations.delete(key);
      return undefined;
    }
    return authorization.challenge;
  }

  async consume(token: string, challenge: string): Promise<boolean> {
    const key = this.hash(token);
    const authorization = this.authorizations.get(key);
    if (!authorization || authorization.expiresAt <= Date.now() || !authorization.challenge || authorization.challenge !== challenge) {
      this.authorizations.delete(key);
      return false;
    }
    this.authorizations.delete(key);
    return true;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private removeExpired(): void {
    for (const [key, authorization] of this.authorizations) {
      if (authorization.expiresAt <= Date.now()) this.authorizations.delete(key);
    }
  }
}
