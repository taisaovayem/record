import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

const recordsTable = 'packing_records';
const settingsTable = 'record_retention_settings';

export class AddRecordRetentionSchema1791417600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureRecordColumns(queryRunner);
    await this.ensureRecordIndex(queryRunner);
    await this.ensureSettingsTable(queryRunner);
    await queryRunner.query(
      `INSERT INTO "${settingsTable}" ("id", "autoDeleteRecordsEnabled", "autoDeleteRecordsAfterDays", "purgeVideosEnabled", "purgeVideosAfterDays") VALUES (1, false, 60, false, 60) ON CONFLICT ("id") DO NOTHING`,
    );
  }

  async down(): Promise<void> {
    throw new Error('Retention schema rollback is unsupported; record and settings data were not removed.');
  }

  private async ensureRecordColumns(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable(recordsTable);
    if (!table) throw new Error('Cannot migrate retention schema: packing_records is missing; run the baseline migration first.');

    const createdAt = table.findColumnByName('createdAt');
    if (!createdAt) {
      await queryRunner.addColumn(recordsTable, new TableColumn({
        name: 'createdAt',
        type: 'timestamptz',
        default: 'CURRENT_TIMESTAMP',
      }));
    } else {
      this.assertColumn(table, recordsTable, 'createdAt', 'timestamptz', false);
    }

    table = await queryRunner.getTable(recordsTable);
    if (!table) throw new Error('Cannot migrate retention schema: packing_records disappeared during migration.');
    if (!table.findColumnByName('deletedAt')) {
      await queryRunner.addColumn(recordsTable, new TableColumn({ name: 'deletedAt', type: 'timestamptz', isNullable: true }));
    } else {
      this.assertColumn(table, recordsTable, 'deletedAt', 'timestamptz', true);
    }

    table = await queryRunner.getTable(recordsTable);
    if (!table) throw new Error('Cannot migrate retention schema: packing_records disappeared during migration.');
    if (!table.findColumnByName('videoPurgedAt')) {
      await queryRunner.addColumn(recordsTable, new TableColumn({ name: 'videoPurgedAt', type: 'timestamptz', isNullable: true }));
    } else {
      this.assertColumn(table, recordsTable, 'videoPurgedAt', 'timestamptz', true);
    }
  }

  private async ensureRecordIndex(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(recordsTable);
    if (!table) throw new Error('Cannot migrate retention schema: packing_records is missing.');
    const existing = table.indices.find((index) =>
      index.columnNames.length === 2 && index.columnNames[0] === 'deletedAt' && index.columnNames[1] === 'createdAt',
    );
    if (existing) {
      if (existing.isUnique) throw new Error('Cannot migrate retention schema: the deletedAt/createdAt index must not be unique.');
      return;
    }
    await queryRunner.createIndex(recordsTable, new TableIndex({
      name: 'idx_packing_records_deleted_created',
      columnNames: ['deletedAt', 'createdAt'],
    }));
  }

  private async ensureSettingsTable(queryRunner: QueryRunner): Promise<void> {
    if (!await queryRunner.hasTable(settingsTable)) {
      await queryRunner.createTable(new Table({
        name: settingsTable,
        columns: [
          new TableColumn({ name: 'id', type: 'smallint', isPrimary: true }),
          new TableColumn({ name: 'autoDeleteRecordsEnabled', type: 'boolean', default: 'false' }),
          new TableColumn({ name: 'autoDeleteRecordsAfterDays', type: 'integer', default: '60' }),
          new TableColumn({ name: 'purgeVideosEnabled', type: 'boolean', default: 'false' }),
          new TableColumn({ name: 'purgeVideosAfterDays', type: 'integer', default: '60' }),
        ],
      }));
      return;
    }

    const table = await queryRunner.getTable(settingsTable);
    if (!table) throw new Error('Cannot migrate retention schema: record_retention_settings is unavailable.');
    this.assertColumn(table, settingsTable, 'id', 'smallint', false);
    this.assertColumn(table, settingsTable, 'autoDeleteRecordsEnabled', 'boolean', false);
    this.assertColumn(table, settingsTable, 'autoDeleteRecordsAfterDays', 'integer', false);
    this.assertColumn(table, settingsTable, 'purgeVideosEnabled', 'boolean', false);
    this.assertColumn(table, settingsTable, 'purgeVideosAfterDays', 'integer', false);
    if (table.primaryColumns.length !== 1 || table.primaryColumns[0].name !== 'id') {
      throw new Error('Cannot migrate retention schema: record_retention_settings must have a primary key on id.');
    }
  }

  private assertColumn(table: Table, tableName: string, name: string, expectedType: string, nullable: boolean): void {
    const column = table.findColumnByName(name);
    if (!column) throw new Error(`Cannot migrate retention schema: ${tableName}.${name} is missing.`);
    const type = this.normalizeType(column.type);
    if (type !== expectedType || column.isNullable !== nullable) {
      throw new Error(`Cannot migrate retention schema: ${tableName}.${name} has an incompatible type or nullability.`);
    }
  }

  private normalizeType(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized === 'timestamp with time zone') return 'timestamptz';
    if (normalized === 'int4') return 'integer';
    return normalized;
  }
}
