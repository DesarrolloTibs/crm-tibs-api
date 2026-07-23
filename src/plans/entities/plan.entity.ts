import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'plans', schema: 'public' })
export class Plan {
  @PrimaryGeneratedColumn()
  plan_id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  plan_name: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false, default: 0.00 })
  price: number;

  @Column({ type: 'bigint', nullable: false, default: 0 })
  tokens_limit: number;

  @Column({ type: 'integer', nullable: false, default: 1 })
  billing_period_months: number;

  @Column({ type: 'boolean', nullable: false, default: true })
  blnstatus: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;
}
