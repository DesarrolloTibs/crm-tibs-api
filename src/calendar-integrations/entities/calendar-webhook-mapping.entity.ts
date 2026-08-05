import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('calendar_webhooks_mapping', { schema: 'public' })
export class CalendarWebhookMapping {
  @PrimaryColumn({ type: 'varchar', length: 255, name: 'subscription_id' })
  subscriptionId: string;

  @Column({ type: 'varchar', length: 63, name: 'tenant_schema' })
  tenantSchema: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  provider: 'google' | 'outlook';

  @Column({ type: 'timestamptz', nullable: true, name: 'expires_at' })
  expiresAt: Date | null;
}
