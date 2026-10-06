import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordsModule } from './records/records.module.js';
import { RecordEntity } from './records/record.entity.js';
import { AuthModule } from './auth/auth.module.js';
import { OperatorEntity } from './auth/operator.entity.js';
import { PasskeyCredentialEntity } from './auth/passkey-credential.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? process.env.DATABASE_USERNAME ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'mysecretpassword',
      database: process.env.DATABASE_NAME ?? 'record',
      entities: [RecordEntity, OperatorEntity, PasskeyCredentialEntity],
      synchronize: true,
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    AuthModule,
    RecordsModule,
  ],
})
export class AppModule {}
