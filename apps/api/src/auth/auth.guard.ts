import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService, type SessionIdentity } from './session.service.js';

export interface AuthenticatedRequest extends Request {
  operator: SessionIdentity;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = this.sessions.cookieFromHeader(request.headers.cookie);
    const identity = this.sessions.verify(cookie);
    if (!identity) throw new UnauthorizedException('Authentication required');
    request.operator = identity;
    return true;
  }
}
