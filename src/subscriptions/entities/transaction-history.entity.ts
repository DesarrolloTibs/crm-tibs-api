import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('transaction_history')
export class TransactionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', nullable: false, default: 0 })
  prompt_tokens: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  completion_tokens: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  total_tokens: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  fecha_procesamiento: Date;

  @Column({ type: 'boolean', nullable: false, default: false })
  is_extra: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  action_name: string | null;
}
