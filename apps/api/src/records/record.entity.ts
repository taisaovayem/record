import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OperatorEntity } from '../auth/operator.entity.js';

@Entity({ name: 'packing_records' })
@Index('idx_packing_records_order_code', ['orderCode'])
@Index('idx_packing_records_capture_id', ['captureId'], { unique: true })
@Index('idx_packing_records_deleted_created', ['deletedAt', 'createdAt'])
export class RecordEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) orderCode!: string;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) recordedAt!: Date;
  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) videoPurgedAt!: Date | null;
  @Column({ type: 'uuid', nullable: true }) captureId!: string | null;
  @Column({ type: 'varchar', length: 255 }) filename!: string;
  @Column({ type: 'varchar', length: 127 }) mimeType!: string;
  @Column({ type: 'uuid', nullable: true }) operatorId!: string | null;
  @ManyToOne(() => OperatorEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'operatorId' }) operator!: OperatorEntity | null;
}
