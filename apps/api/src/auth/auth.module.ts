import { Module } from '@nestjs/common';
import { AUTH_CONFIG, loadAuthConfig } from './auth-config.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CREDENTIAL_STORE } from './credential-store.js';
import { EnrollmentAuthorizationService } from './enrollment-authorization.service.js';
import { FileCredentialStore } from './file-credential-store.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    {
      provide: CREDENTIAL_STORE,
      useFactory: (config: ReturnType<typeof loadAuthConfig>) => new FileCredentialStore(config.storageDirectory),
      inject: [AUTH_CONFIG],
    },
    AuthService,
    AuthGuard,
    EnrollmentAuthorizationService,
    SessionService,
  ],
  exports: [AuthGuard, SessionService],
})
export class AuthModule {}
