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

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_name: string | null;

  @Column({ type: 'uuid', nullable: true })
  client_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  client_name: string | null;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  channel: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model_name: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;
}
