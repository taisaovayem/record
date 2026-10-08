import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordEntity } from './record.entity.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { RecordRetentionService } from './record-retention.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RecordEntity]), AuthModule, SettingsModule],
  controllers: [RecordsController],
  providers: [RecordsService, RecordRetentionService],
})
export class RecordsModule {}
