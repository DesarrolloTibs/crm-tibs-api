import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('channel_configs')
export class ChannelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  channel: string; // 'whatsapp' | 'facebook' | 'instagram'

  @Column({ type: 'varchar', length: 255 })
  name: string; // Friendly name for the account

  @Column({ type: 'varchar', length: 255, nullable: true })
  appId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  accountId: string | null; // WhatsApp Business Account ID or Facebook Page ID or Instagram Account ID

  @Column({ type: 'varchar', length: 255, nullable: true })
  phoneNumberId: string | null; // Specific to WhatsApp

  @Column({ type: 'varchar', length: 2048, nullable: true })
  accessToken: string | null; // Meta access token

  @Column({ type: 'varchar', length: 255, nullable: true })
  verifyToken: string | null; // Webhook verification token

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
