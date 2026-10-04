import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'packing_records' })
@Index('idx_packing_records_order_code', ['orderCode'])
@Index('idx_packing_records_capture_id', ['captureId'], { unique: true })
export class RecordEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) orderCode!: string;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) recordedAt!: Date;
  @Column({ type: 'uuid', nullable: true }) captureId!: string | null;
  @Column({ type: 'varchar', length: 255 }) filename!: string;
  @Column({ type: 'varchar', length: 127 }) mimeType!: string;
}
