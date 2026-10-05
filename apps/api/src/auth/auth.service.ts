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
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { CREDENTIAL_STORE, type CredentialStore, type StoredCredential } from './credential-store.js';
import { EnrollmentAuthorizationService } from './enrollment-authorization.service.js';
import { SessionService, type SessionCookie } from './session.service.js';

@Injectable()
export class AuthService {
  private readonly loginChallenges = new Map<string, number>();

  constructor(
    @Inject(CREDENTIAL_STORE) private readonly credentials: CredentialStore,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly enrollments: EnrollmentAuthorizationService,
    private readonly sessions: SessionService,
  ) {}

  async registrationOptions(authorization: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    if (!this.enrollments.isValid(authorization)) {
      throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    }
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpID,
      userID: Buffer.from(await this.credentials.getUserHandle(), 'base64url'),
      userName: 'operator',
      userDisplayName: this.config.rpName,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: (await this.credentials.list()).map((credential) => ({ id: credential.id, transports: credential.transports })),
    });
    if (!this.enrollments.bindChallenge(authorization, options.challenge)) {
      throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    }
    return options;
  }

  async completeRegistration(authorization: string, response: RegistrationResponseJSON): Promise<void> {
    const challenge = this.enrollments.challengeFor(authorization);
    if (!challenge || challenge === 'pending') throw new UnauthorizedException('Enrollment authorization is invalid or expired');
    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo.userVerified) throw new UnauthorizedException('Passkey registration was not verified');
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      if (!await this.enrollments.consume(authorization, challenge)) throw new UnauthorizedException('Enrollment authorization has already been used');
      await this.credentials.add({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports as StoredCredential['transports'],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new BadRequestException('Passkey registration response is invalid');
    }
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

    const credential = await this.credentials.findById(response.id);
    if (!credential) throw new UnauthorizedException('Passkey sign-in failed');
    try {
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
          transports: credential.transports,
        },
      });
      if (!verification.verified || !verification.authenticationInfo.userVerified) throw new UnauthorizedException('Passkey sign-in failed');
      await this.credentials.update({
        ...credential,
        counter: verification.authenticationInfo.newCounter,
        deviceType: verification.authenticationInfo.credentialDeviceType,
        backedUp: verification.authenticationInfo.credentialBackedUp,
      });
      return this.sessions.issue();
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
