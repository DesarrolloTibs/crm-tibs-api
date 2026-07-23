import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Plan } from '../../plans/entities/plan.entity';

@Entity({ name: 'tenant_renewal_queue', schema: 'public' })
export class TenantRenewalQueue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 63, nullable: false })
  tenant_id: string;

  @Column({ type: 'integer', nullable: false })
  plan_id: number;

  @ManyToOne(() => Plan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @Column({ type: 'integer', nullable: false, default: 1 })
  billing_period_months: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
