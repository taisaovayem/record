import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const settingsTable = 'record_retention_settings';
const qualityColumn = 'preferredVideoQuality';

export class AddPreferredVideoQuality1791417600002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(settingsTable);
    if (!table) throw new Error('Cannot add preferred video quality: record_retention_settings is missing.');

    const existing = table.findColumnByName(qualityColumn);
    if (existing) {
      if (existing.type.toLowerCase() !== 'varchar' || existing.length !== '8' || existing.isNullable) {
        throw new Error('Cannot add preferred video quality: record_retention_settings.preferredVideoQuality has an incompatible type.');
      }
      return;
    }

    await queryRunner.addColumn(settingsTable, new TableColumn({
      name: qualityColumn,
      type: 'varchar',
      length: '8',
      default: "'480p'",
    }));
  }

  async down(): Promise<void> {
    throw new Error('Preferred video quality migration rollback is unsupported; user settings were not removed.');
  }
}
