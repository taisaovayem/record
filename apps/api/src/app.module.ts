import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordsModule } from './records/records.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { databaseOptions } from './database/database-options.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      ...databaseOptions(),
      migrationsRun: true,
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    AuthModule,
    RecordsModule,
    SettingsModule,
  ],
})
export class AppModule {}
