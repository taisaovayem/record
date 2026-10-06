import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

interface EnrollmentAuthorization {
  expiresAt: number;
  challenge?: string;
  operatorId?: string;
  operatorName?: string;
}

export interface PendingOperatorRegistration {
  operatorId: string;
  operatorName: string;
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

  bindChallenge(token: string, challenge: string, pending: PendingOperatorRegistration): boolean {
    const authorization = this.authorizations.get(this.hash(token));
    if (!authorization || authorization.expiresAt <= Date.now()) {
      if (authorization) this.authorizations.delete(this.hash(token));
      return false;
    }
    if (authorization.challenge) return false;
    authorization.challenge = challenge;
    authorization.operatorId = pending.operatorId;
    authorization.operatorName = pending.operatorName;
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

  registrationFor(token: string, challenge: string): PendingOperatorRegistration | undefined {
    const key = this.hash(token);
    const authorization = this.authorizations.get(key);
    if (!authorization || authorization.expiresAt <= Date.now() || authorization.challenge !== challenge || !authorization.operatorId || !authorization.operatorName) {
      if (authorization?.expiresAt && authorization.expiresAt <= Date.now()) this.authorizations.delete(key);
      return undefined;
    }
    return { operatorId: authorization.operatorId, operatorName: authorization.operatorName };
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
