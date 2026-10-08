import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'record_retention_settings' })
export class RecordRetentionSettingsEntity {
  @PrimaryColumn({ type: 'smallint' }) id = 1;
  @Column({ type: 'boolean', default: false }) autoDeleteRecordsEnabled = false;
  @Column({ type: 'integer', default: 60 }) autoDeleteRecordsAfterDays = 60;
  @Column({ type: 'boolean', default: false }) purgeVideosEnabled = false;
  @Column({ type: 'integer', default: 60 }) purgeVideosAfterDays = 60;
  @Column({ type: 'varchar', length: 8, default: '480p' }) preferredVideoQuality = '480p';
}
