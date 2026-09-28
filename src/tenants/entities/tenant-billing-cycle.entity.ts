import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Plan } from '../../plans/entities/plan.entity';

@Entity({ name: 'tenant_billing_cycles', schema: 'public' })
export class TenantBillingCycle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 63, nullable: false })
  tenant_id: string;

  @Column({ type: 'integer', nullable: true })
  plan_id: number | null;

  @ManyToOne(() => Plan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan | null;

  @Column({ type: 'varchar', length: 255, nullable: false })
  plan_name: string;

  @Column({ type: 'integer', nullable: false, default: 0 })
  tokens_limit: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false, default: 0 })
  price: number;

  @Column({ type: 'integer', nullable: false, default: 1 })
  billing_period_months: number;

  @Column({ type: 'timestamptz', nullable: false })
  start_date: Date;

  @Column({ type: 'timestamptz', nullable: false })
  end_date: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'closed' | 'superseded';

  @Column({ type: 'varchar', length: 50, nullable: true })
  close_reason: 'renewal_cron' | 'immediate_reset' | 'immediate_keep_date' | 'plan_upgrade' | 'tenant_deleted' | null;

  @Column({ type: 'boolean', default: false })
  allow_extra: boolean;

  @Column({ type: 'integer', nullable: true, default: 0 })
  tokens_used_at_close: number;

  @Column({ type: 'integer', nullable: true, default: 0 })
  tokens_extra_used_at_close: number;

  @Column({ type: 'integer', nullable: true, default: 0 })
  tokens_courtesy_at_close: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
