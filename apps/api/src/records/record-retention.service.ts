import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { RecordRetentionSettingsService } from '../settings/record-retention-settings.service.js';
import { RecordEntity } from './record.entity.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const videoDirectory = () => process.env.VIDEO_STORAGE_DIR ?? join(process.cwd(), 'data', 'videos');

@Injectable()
export class RecordRetentionService {
  private readonly logger = new Logger(RecordRetentionService.name);

  constructor(
    @InjectRepository(RecordEntity)
    private readonly records: Repository<RecordEntity>,
    private readonly settings: RecordRetentionSettingsService,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async runRetention(): Promise<void> {
    const runAt = new Date();
    try {
      const settings = await this.settings.getSettings();

      if (settings.autoDeleteRecordsEnabled) {
        const cutoff = new Date(runAt.getTime() - settings.autoDeleteRecordsAfterDays * DAY_IN_MS);
        await this.records.update(
          { deletedAt: IsNull(), createdAt: LessThanOrEqual(cutoff) },
          { deletedAt: runAt },
        );
      }

      if (settings.purgeVideosEnabled) {
        const cutoff = new Date(runAt.getTime() - settings.purgeVideosAfterDays * DAY_IN_MS);
        const dueRecords = await this.records.find({
          where: { deletedAt: LessThanOrEqual(cutoff), videoPurgedAt: IsNull() },
          order: { deletedAt: 'ASC' },
        });

        for (const record of dueRecords) {
          try {
            await rm(join(videoDirectory(), record.filename), { force: true });
            await this.records.update(
              { id: record.id, videoPurgedAt: IsNull() },
              { videoPurgedAt: runAt },
            );
          } catch (error) {
            this.logger.error(
              `Could not purge video for soft-deleted record ${record.id}`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Could not run record retention job', error instanceof Error ? error.stack : undefined);
    }
  }
}
