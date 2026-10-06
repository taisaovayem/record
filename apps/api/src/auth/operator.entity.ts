import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { PasskeyCredentialEntity } from './passkey-credential.entity.js';

@Entity({ name: 'operators' })
export class OperatorEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;

  @OneToMany(() => PasskeyCredentialEntity, (credential) => credential.operator)
  credentials!: PasskeyCredentialEntity[];
}
