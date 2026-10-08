import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { UpdateRecordRetentionSettingsDto } from './record-retention-settings.dto.js';
import { RecordRetentionSettingsService } from './record-retention-settings.service.js';

@Controller('settings/retention')
@UseGuards(AuthGuard)
export class RecordRetentionSettingsController {
  constructor(private readonly settings: RecordRetentionSettingsService) {}

  @Get()
  getSettings() {
    return this.settings.getSettings();
  }

  @Put()
  saveSettings(@Body() body: UpdateRecordRetentionSettingsDto) {
    return this.settings.saveSettings(body);
  }
}
