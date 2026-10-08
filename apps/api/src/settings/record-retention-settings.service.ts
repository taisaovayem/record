import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateRecordRetentionSettingsDto } from './record-retention-settings.dto.js';
import { RecordRetentionSettingsEntity } from './record-retention-settings.entity.js';

const DEFAULT_SETTINGS = {
  id: 1,
  autoDeleteRecordsEnabled: false,
  autoDeleteRecordsAfterDays: 60,
  purgeVideosEnabled: false,
  purgeVideosAfterDays: 60,
};

export interface RetentionSettings {
  autoDeleteRecordsEnabled: boolean;
  autoDeleteRecordsAfterDays: number;
  purgeVideosEnabled: boolean;
  purgeVideosAfterDays: number;
}

@Injectable()
export class RecordRetentionSettingsService {
  constructor(
    @InjectRepository(RecordRetentionSettingsEntity)
    private readonly repository: Repository<RecordRetentionSettingsEntity>,
  ) {}

  async getSettings(): Promise<RetentionSettings> {
    const current = await this.repository.findOneBy({ id: 1 });
    if (current) return this.toPublicSettings(current);

    try {
      await this.repository.insert(DEFAULT_SETTINGS);
    } catch (error) {
      const concurrent = await this.repository.findOneBy({ id: 1 });
      if (concurrent) return this.toPublicSettings(concurrent);
      throw error;
    }

    return this.toPublicSettings(await this.repository.findOneByOrFail({ id: 1 }));
  }

  async saveSettings(input: UpdateRecordRetentionSettingsDto): Promise<RetentionSettings> {
    const saved = await this.repository.save(this.repository.create({ id: 1, ...input }));
    return this.toPublicSettings(saved);
  }

  private toPublicSettings(entity: RecordRetentionSettingsEntity): RetentionSettings {
    return {
      autoDeleteRecordsEnabled: entity.autoDeleteRecordsEnabled,
      autoDeleteRecordsAfterDays: entity.autoDeleteRecordsAfterDays,
      purgeVideosEnabled: entity.purgeVideosEnabled,
      purgeVideosAfterDays: entity.purgeVideosAfterDays,
    };
  }
}
