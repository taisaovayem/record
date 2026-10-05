import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookie = this.sessions.cookieFromHeader(request.headers.cookie);
    if (!this.sessions.verify(cookie)) throw new UnauthorizedException('Authentication required');
    return true;
  }
}
