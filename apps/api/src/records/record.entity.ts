import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'packing_records' })
@Index('idx_packing_records_order_code', ['orderCode'])
export class RecordEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) orderCode!: string;
  @CreateDateColumn({ type: 'timestamptz' }) recordedAt!: Date;
  @Column({ type: 'varchar', length: 255 }) filename!: string;
  @Column({ type: 'varchar', length: 127 }) mimeType!: string;
}
