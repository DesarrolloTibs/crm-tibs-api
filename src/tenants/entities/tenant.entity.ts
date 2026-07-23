import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Plan } from '../../plans/entities/plan.entity';

@Entity({ name: 'tenants', schema: 'public' })
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 63, unique: true, nullable: false })
  schema_name: string;

  @Column({ type: 'integer', nullable: true })
  plan_id: number | null;

  @ManyToOne(() => Plan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan | null;

  @Column({ type: 'timestamptz', nullable: true })
  next_renewal_date: Date | null;

  @Column({ type: 'boolean', nullable: false, default: true })
  is_active: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  allow_extra: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  logo: string | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
