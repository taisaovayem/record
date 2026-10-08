import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { EnrollmentAuthorizationService } from './enrollment-authorization.service.js';
import { normalizeOperatorName } from './operator-name.js';
import { OperatorEntity } from './operator.entity.js';
import { PasskeyCredentialEntity } from './passkey-credential.entity.js';
import { SessionService, type SessionCookie } from './session.service.js';

@Injectable()
export class AuthService {
  private readonly loginChallenges = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly enrollments: EnrollmentAuthorizationService,
    private readonly sessions: SessionService,
  ) {}

  async registrationOptions(authorization: string, name: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const operatorName = normalizeOperatorName(name);
    if (!operatorName) {
      throw new BadRequestException('name must contain between 1 and 255 characters');
    }
    if (!this.enrollments.isValid(authorization)) {
      throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    }
    const operatorId = randomUUID();
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpID,
      userID: Buffer.from(operatorId.replaceAll('-', ''), 'hex'),
      userName: operatorName,
      userDisplayName: operatorName,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    if (!this.enrollments.bindChallenge(authorization, options.challenge, { operatorId, operatorName })) {
      throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    }
    return options;
  }

  async completeRegistration(authorization: string, response: RegistrationResponseJSON): Promise<void> {
    const challenge = this.enrollments.challengeFor(authorization);
    if (!challenge || challenge === 'pending') throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    const pending = this.enrollments.registrationFor(authorization, challenge);
    if (!pending) throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new BadRequestException('Passkey registration response is invalid');
    }
    if (!verification.verified || !verification.registrationInfo.userVerified) throw new UnauthorizedException('Passkey registration was not verified');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    if (!await this.enrollments.consume(authorization, challenge)) throw new UnauthorizedException('Enrollment authorization has already been used');

    await this.dataSource.transaction(async (manager) => {
      const operator = manager.create(OperatorEntity, { id: pending.operatorId, name: pending.operatorName });
      await manager.save(operator);
      const passkey = manager.create(PasskeyCredentialEntity, {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        operatorId: operator.id,
      });
      await manager.save(passkey);
    });
  }

  async authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    this.removeExpiredChallenges();
    if (this.loginChallenges.size >= 1000) this.loginChallenges.delete(this.loginChallenges.keys().next().value!);
    const options = await generateAuthenticationOptions({ rpID: this.config.rpID, userVerification: 'required' });
    this.loginChallenges.set(options.challenge, Date.now() + 5 * 60 * 1000);
    return options;
  }

  async completeAuthentication(response: AuthenticationResponseJSON): Promise<SessionCookie> {
    const challenge = this.challengeFromResponse(response);
    const expiresAt = this.loginChallenges.get(challenge);
    this.loginChallenges.delete(challenge);
    if (!expiresAt || expiresAt <= Date.now()) throw new UnauthorizedException('Passkey sign-in failed');

    try {
      return await this.dataSource.transaction(async (manager) => {
        const credentials = manager.getRepository(PasskeyCredentialEntity);
        const credential = await credentials.findOne({
          where: { id: response.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!credential) throw new UnauthorizedException('Passkey sign-in failed');
        const operator = await manager.findOne(OperatorEntity, { where: { id: credential.operatorId } });
        if (!operator) throw new UnauthorizedException('Passkey sign-in failed');
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: this.config.origin,
          expectedRPID: this.config.rpID,
          requireUserVerification: true,
          credential: {
            id: credential.id,
            publicKey: Buffer.from(credential.publicKey, 'base64url'),
            counter: credential.counter,
            transports: credential.transports ?? undefined,
          },
        });
        if (!verification.verified || !verification.authenticationInfo.userVerified) throw new UnauthorizedException('Passkey sign-in failed');
        credential.counter = verification.authenticationInfo.newCounter;
        credential.deviceType = verification.authenticationInfo.credentialDeviceType;
        credential.backedUp = verification.authenticationInfo.credentialBackedUp;
        await credentials.save(credential);
        return this.sessions.issue(operator.id, operator.name);
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Passkey sign-in failed');
    }
  }

  private challengeFromResponse(response: AuthenticationResponseJSON): string {
    try {
      const data: unknown = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
      if (!data || typeof data !== 'object' || typeof (data as { challenge?: unknown }).challenge !== 'string') throw new Error();
      return (data as { challenge: string }).challenge;
    } catch {
      throw new UnauthorizedException('Passkey sign-in failed');
    }
  }

  private removeExpiredChallenges(): void {
    for (const [challenge, expiresAt] of this.loginChallenges) {
      if (expiresAt <= Date.now()) this.loginChallenges.delete(challenge);
    }
  }
}
