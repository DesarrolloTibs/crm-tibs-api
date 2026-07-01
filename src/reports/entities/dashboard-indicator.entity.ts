import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('dashboard_indicators')
export class DashboardIndicator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 50, default: 'count' })
  type: 'count' | 'sum'; // count = count items, sum = sum monto_total (opportunities only)

  @Column({ type: 'uuid', nullable: true, name: 'pipeline_id' })
  pipeline_id: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'helpdesk_id' })
  helpdesk_id: string | null;

  @Column({ type: 'simple-array', nullable: true })
  stage_ids: string[]; // List of stage IDs

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string; // e.g. blue, green, purple, orange, red

  @Column({ type: 'integer', default: 0 })
  display_order: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
