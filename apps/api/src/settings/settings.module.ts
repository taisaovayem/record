import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { RecordRetentionSettingsController } from './record-retention-settings.controller.js';
import { RecordRetentionSettingsEntity } from './record-retention-settings.entity.js';
import { RecordRetentionSettingsService } from './record-retention-settings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RecordRetentionSettingsEntity]), AuthModule],
  controllers: [RecordRetentionSettingsController],
  providers: [RecordRetentionSettingsService],
  exports: [RecordRetentionSettingsService],
})
export class SettingsModule {}
