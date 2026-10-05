import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { EnrollmentAuthorizationService } from './enrollment-authorization.service.js';
import { AuthService } from './auth.service.js';
import { constantTimeEqual, SESSION_COOKIE_NAME, SessionService } from './session.service.js';
import { Inject } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly enrollments: EnrollmentAuthorizationService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Get('session')
  session(@Req() request: Request) {
    return { authenticated: this.sessions.verify(this.sessions.cookieFromHeader(request.headers.cookie)) };
  }

  @Post('enrollments/issue')
  async issueEnrollment(@Headers('authorization') authorization: string | undefined) {
    const suppliedSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!constantTimeEqual(suppliedSecret, this.config.enrollmentSecret)) throw new UnauthorizedException();
    return { token: await this.enrollments.create() };
  }

  @Post('register/options')
  async registrationOptions(@Body() body: unknown, @Headers('origin') origin: string | undefined) {
    this.assertBrowserOrigin(origin);
    const authorization = readStringProperty(body, 'authorization');
    return this.auth.registrationOptions(authorization);
  }

  @Post('register/verify')
  async completeRegistration(@Body() body: unknown, @Headers('origin') origin: string | undefined) {
    this.assertBrowserOrigin(origin);
    const authorization = readStringProperty(body, 'authorization');
    const response = readCredentialResponse(body, 'credential') as RegistrationResponseJSON;
    await this.auth.completeRegistration(authorization, response);
    return { verified: true };
  }

  @Post('login/options')
  loginOptions(@Headers('origin') origin: string | undefined) {
    this.assertBrowserOrigin(origin);
    return this.auth.authenticationOptions();
  }

  @Post('login/verify')
  async completeAuthentication(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertBrowserOrigin(origin);
    const credential = readCredentialResponse(body, 'credential') as AuthenticationResponseJSON;
    const session = await this.auth.completeAuthentication(credential);
    response.cookie(SESSION_COOKIE_NAME, session.value, session.options);
    return { authenticated: true };
  }

  @Post('logout')
  logout(@Headers('origin') origin: string | undefined, @Res({ passthrough: true }) response: Response) {
    this.assertBrowserOrigin(origin);
    response.clearCookie(SESSION_COOKIE_NAME, this.sessions.clear());
    return { authenticated: false };
  }

  private assertBrowserOrigin(origin: string | undefined): void {
    if (!origin || origin !== this.config.origin) throw new UnauthorizedException('Request origin is not allowed');
  }
}

function readStringProperty(value: unknown, property: string): string {
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>)[property] !== 'string') {
    throw new UnauthorizedException('Authentication request is invalid');
  }
  return (value as Record<string, string>)[property];
}

function readCredentialResponse(value: unknown, property: string): Record<string, any> {
  if (!value || typeof value !== 'object') throw new UnauthorizedException('Authentication request is invalid');
  const credential = (value as Record<string, unknown>)[property];
  if (!credential || typeof credential !== 'object') throw new UnauthorizedException('Authentication request is invalid');
  const record = credential as Record<string, unknown>;
  const response = record.response;
  if (record.type !== 'public-key' || typeof record.id !== 'string' || !response || typeof response !== 'object') {
    throw new UnauthorizedException('Authentication request is invalid');
  }
  const data = response as Record<string, unknown>;
  if (typeof data.clientDataJSON !== 'string' || (typeof data.signature !== 'string' && typeof data.attestationObject !== 'string')) {
    throw new UnauthorizedException('Authentication request is invalid');
  }
  return record;
}
