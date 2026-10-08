import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

const recordsTable = 'packing_records';
const operatorsTable = 'operators';
const credentialsTable = 'passkey_credentials';

export class CreateBaselineSchema1791417600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureOperators(queryRunner);
    await this.ensureRecords(queryRunner);
    await this.ensureCredentials(queryRunner);
    await this.ensureRecordOperatorForeignKey(queryRunner);
    await this.ensureCredentialOperatorForeignKey(queryRunner);
    await this.ensureIndexes(queryRunner);
  }

  async down(): Promise<void> {
    throw new Error('Baseline schema rollback is unsupported; no application tables were removed.');
  }

  private async ensureOperators(queryRunner: QueryRunner): Promise<void> {
    if (!await queryRunner.hasTable(operatorsTable)) {
      await queryRunner.createTable(new Table({
        name: operatorsTable,
        columns: [
          new TableColumn({ name: 'id', type: 'uuid', isPrimary: true }),
          new TableColumn({ name: 'name', type: 'varchar', length: '255' }),
        ],
      }));
      return;
    }

    const table = await this.requireTable(queryRunner, operatorsTable);
    this.assertColumns(table, operatorsTable, [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'name', type: 'varchar', length: '255', nullable: false },
    ]);
    this.assertPrimaryKey(table, operatorsTable, 'id');
  }

  private async ensureRecords(queryRunner: QueryRunner): Promise<void> {
    if (!await queryRunner.hasTable(recordsTable)) {
      await queryRunner.createTable(new Table({
        name: recordsTable,
        columns: [
          new TableColumn({ name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' }),
          new TableColumn({ name: 'orderCode', type: 'varchar', length: '255' }),
          new TableColumn({ name: 'recordedAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' }),
          new TableColumn({ name: 'captureId', type: 'uuid', isNullable: true }),
          new TableColumn({ name: 'filename', type: 'varchar', length: '255' }),
          new TableColumn({ name: 'mimeType', type: 'varchar', length: '127' }),
          new TableColumn({ name: 'operatorId', type: 'uuid', isNullable: true }),
        ],
      }));
      return;
    }

    let table = await this.requireTable(queryRunner, recordsTable);
    this.assertColumns(table, recordsTable, [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'orderCode', type: 'varchar', length: '255', nullable: false },
      { name: 'recordedAt', type: 'timestamptz', nullable: false },
      { name: 'filename', type: 'varchar', length: '255', nullable: false },
      { name: 'mimeType', type: 'varchar', length: '127', nullable: false },
    ]);
    this.assertPrimaryKey(table, recordsTable, 'id');

    if (!table.findColumnByName('captureId')) {
      await queryRunner.addColumn(recordsTable, new TableColumn({ name: 'captureId', type: 'uuid', isNullable: true }));
    } else {
      this.assertColumns(table, recordsTable, [{ name: 'captureId', type: 'uuid', nullable: true }]);
    }

    table = await this.requireTable(queryRunner, recordsTable);
    if (!table.findColumnByName('operatorId')) {
      await queryRunner.addColumn(recordsTable, new TableColumn({ name: 'operatorId', type: 'uuid', isNullable: true }));
    } else {
      this.assertColumns(table, recordsTable, [{ name: 'operatorId', type: 'uuid', nullable: true }]);
    }
  }

  private async ensureCredentials(queryRunner: QueryRunner): Promise<void> {
    if (!await queryRunner.hasTable(credentialsTable)) {
      await queryRunner.createTable(new Table({
        name: credentialsTable,
        columns: [
          new TableColumn({ name: 'id', type: 'varchar', length: '1023', isPrimary: true }),
          new TableColumn({ name: 'publicKey', type: 'text' }),
          new TableColumn({ name: 'counter', type: 'integer', default: '0' }),
          new TableColumn({ name: 'transports', type: 'jsonb', isNullable: true }),
          new TableColumn({ name: 'deviceType', type: 'varchar', length: '32' }),
          new TableColumn({ name: 'backedUp', type: 'boolean', default: 'false' }),
          new TableColumn({ name: 'operatorId', type: 'uuid' }),
        ],
      }));
      return;
    }

    const table = await this.requireTable(queryRunner, credentialsTable);
    this.assertColumns(table, credentialsTable, [
      { name: 'id', type: 'varchar', length: '1023', nullable: false },
      { name: 'publicKey', type: 'text', nullable: false },
      { name: 'counter', type: 'integer', nullable: false },
      { name: 'transports', type: 'jsonb', nullable: true },
      { name: 'deviceType', type: 'varchar', length: '32', nullable: false },
      { name: 'backedUp', type: 'boolean', nullable: false },
      { name: 'operatorId', type: 'uuid', nullable: false },
    ]);
    this.assertPrimaryKey(table, credentialsTable, 'id');
  }

  private async ensureRecordOperatorForeignKey(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(recordsTable) && await this.hasOrphanedOperator(queryRunner, recordsTable)) {
      throw new Error('Cannot adopt database: packing_records.operatorId contains IDs missing from operators. Repair those references before migrating.');
    }
    await this.ensureForeignKey(queryRunner, recordsTable, 'operatorId', operatorsTable, 'RESTRICT', 'fk_packing_records_operator_id');
  }

  private async ensureCredentialOperatorForeignKey(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasOrphanedOperator(queryRunner, credentialsTable)) {
      throw new Error('Cannot adopt database: passkey_credentials.operatorId contains IDs missing from operators. Repair those references before migrating.');
    }
    await this.ensureForeignKey(queryRunner, credentialsTable, 'operatorId', operatorsTable, 'CASCADE', 'fk_passkey_credentials_operator_id');
  }

  private async ensureForeignKey(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    referencedTable: string,
    onDelete: 'RESTRICT' | 'CASCADE',
    name: string,
  ): Promise<void> {
    const table = await this.requireTable(queryRunner, tableName);
    const existing = table.foreignKeys.find((foreignKey) =>
      foreignKey.columnNames.length === 1 && foreignKey.columnNames[0] === columnName &&
      foreignKey.referencedTableName === referencedTable && foreignKey.referencedColumnNames[0] === 'id',
    );
    if (existing) {
      if (existing.onDelete?.toUpperCase() !== onDelete) {
        throw new Error(`Cannot adopt database: ${tableName}.${columnName} has an incompatible foreign-key delete rule.`);
      }
      return;
    }
    await queryRunner.createForeignKey(tableName, new TableForeignKey({
      name,
      columnNames: [columnName],
      referencedTableName: referencedTable,
      referencedColumnNames: ['id'],
      onDelete,
    }));
  }

  private async ensureIndexes(queryRunner: QueryRunner): Promise<void> {
    await this.ensureIndex(queryRunner, recordsTable, 'idx_packing_records_order_code', ['orderCode'], false);
    await this.assertUniqueCaptureIds(queryRunner);
    await this.ensureIndex(queryRunner, recordsTable, 'idx_packing_records_capture_id', ['captureId'], true);
    await this.ensureIndex(queryRunner, credentialsTable, 'idx_passkey_credentials_operator_id', ['operatorId'], false);
  }

  private async ensureIndex(
    queryRunner: QueryRunner,
    tableName: string,
    name: string,
    columnNames: string[],
    isUnique: boolean,
  ): Promise<void> {
    const table = await this.requireTable(queryRunner, tableName);
    const existing = table.indices.find((index) =>
      index.columnNames.length === columnNames.length && index.columnNames.every((column, position) => column === columnNames[position]),
    );
    if (existing) {
      if (existing.isUnique !== isUnique) throw new Error(`Cannot adopt database: index on ${tableName}.${columnNames.join(',')} has incompatible uniqueness.`);
      return;
    }
    await queryRunner.createIndex(tableName, new TableIndex({ name, columnNames, isUnique }));
  }

  private async assertUniqueCaptureIds(queryRunner: QueryRunner): Promise<void> {
    const duplicate = await queryRunner.query(
      'SELECT 1 FROM "packing_records" WHERE "captureId" IS NOT NULL GROUP BY "captureId" HAVING COUNT(*) > 1 LIMIT 1',
    );
    if (duplicate.length) {
      throw new Error('Cannot adopt database: duplicate packing_records.captureId values prevent the required unique index. Resolve duplicates before migrating.');
    }
  }

  private async hasOrphanedOperator(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM "${tableName}" AS child LEFT JOIN "operators" AS parent ON parent."id" = child."operatorId" WHERE child."operatorId" IS NOT NULL AND parent."id" IS NULL LIMIT 1`,
    );
    return rows.length > 0;
  }

  private async requireTable(queryRunner: QueryRunner, tableName: string): Promise<Table> {
    const table = await queryRunner.getTable(tableName);
    if (!table) throw new Error(`Cannot adopt database: required table ${tableName} is unavailable.`);
    return table;
  }

  private assertColumns(
    table: Table,
    tableName: string,
    expected: Array<{ name: string; type: string; length?: string; nullable: boolean }>,
  ): void {
    for (const requirement of expected) {
      const column = table.findColumnByName(requirement.name);
      if (!column) throw new Error(`Cannot adopt database: ${tableName}.${requirement.name} is missing.`);
      if (this.normalizeType(column.type) !== this.normalizeType(requirement.type) ||
          (requirement.length !== undefined && column.length !== requirement.length) ||
          column.isNullable !== requirement.nullable) {
        throw new Error(`Cannot adopt database: ${tableName}.${requirement.name} has an incompatible type, length, or nullability.`);
      }
    }
  }

  private assertPrimaryKey(table: Table, tableName: string, columnName: string): void {
    if (table.primaryColumns.length !== 1 || table.primaryColumns[0].name !== columnName) {
      throw new Error(`Cannot adopt database: ${tableName} must have a primary key on ${columnName}.`);
    }
  }

  private normalizeType(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized === 'character varying') return 'varchar';
    if (normalized === 'timestamp with time zone') return 'timestamptz';
    if (normalized === 'int4') return 'integer';
    return normalized;
  }
}
