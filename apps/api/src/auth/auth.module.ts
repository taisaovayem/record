import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTH_CONFIG, loadAuthConfig } from './auth-config.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { EnrollmentAuthorizationService } from './enrollment-authorization.service.js';
import { SessionService } from './session.service.js';
import { OperatorEntity } from './operator.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([OperatorEntity])],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    AuthService,
    AuthGuard,
    EnrollmentAuthorizationService,
    SessionService,
  ],
  exports: [AuthGuard, SessionService],
})
export class AuthModule {}
