import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { ChannelConfig } from './channel-config.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  channel: string; // 'whatsapp' | 'messenger' | 'instagram'

  @Column({ type: 'varchar', length: 255 })
  externalId: string; // Phone number or page scoped ID

  @Column({ type: 'varchar', length: 255 })
  clientName: string; // Profile nickname/apodo

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'clientId' })
  client: Client | null;

  @Column({ type: 'uuid', nullable: true })
  assignedUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'assignedUserId' })
  assignedUser: User | null;

  @Column({ type: 'boolean', default: true })
  botActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  channelConfigId: string | null;

  @ManyToOne(() => ChannelConfig, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'channelConfigId' })
  channelConfig: ChannelConfig | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastCustomerMessageAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  /**
   * Verifica si la ventana de conversación con el cliente sigue activa.
   * Por defecto evalúa 23 horas para dejar un margen de seguridad de 1 hora antes de que Meta corte la sesión.
   */
  isCustomerWindowActive(safetyHours: number = 23): boolean {
    if (this.channel !== 'whatsapp') return true;
    if (!this.lastCustomerMessageAt) return false;
    const diffMs = Date.now() - new Date(this.lastCustomerMessageAt).getTime();
    return diffMs < safetyHours * 60 * 60 * 1000;
  }
}
