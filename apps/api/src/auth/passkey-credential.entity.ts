import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { AuthenticatorTransport, CredentialDeviceType } from '@simplewebauthn/server';
import { OperatorEntity } from './operator.entity.js';

@Entity({ name: 'passkey_credentials' })
@Index('idx_passkey_credentials_operator_id', ['operatorId'])
export class PasskeyCredentialEntity {
  @PrimaryColumn({ type: 'varchar', length: 1023 }) id!: string;
  @Column({ type: 'text' }) publicKey!: string;
  @Column({ type: 'integer', default: 0 }) counter!: number;
  @Column({ type: 'jsonb', nullable: true }) transports!: AuthenticatorTransport[] | null;
  @Column({ type: 'varchar', length: 32 }) deviceType!: CredentialDeviceType;
  @Column({ type: 'boolean', default: false }) backedUp!: boolean;
  @Column({ type: 'uuid' }) operatorId!: string;

  @ManyToOne(() => OperatorEntity, (operator) => operator.credentials, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'operatorId' }) operator!: OperatorEntity;
}
