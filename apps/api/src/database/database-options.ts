import { join } from 'node:path';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { OperatorEntity } from '../auth/operator.entity.js';
import { PasskeyCredentialEntity } from '../auth/passkey-credential.entity.js';
import { RecordEntity } from '../records/record.entity.js';
import { RecordRetentionSettingsEntity } from '../settings/record-retention-settings.entity.js';

export function databaseOptions(): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? process.env.DATABASE_USERNAME ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'mysecretpassword',
    database: process.env.DATABASE_NAME ?? 'record',
    entities: [RecordEntity, OperatorEntity, PasskeyCredentialEntity, RecordRetentionSettingsEntity],
    migrations: [join(__dirname, 'migrations', '*.js')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
  };
}
