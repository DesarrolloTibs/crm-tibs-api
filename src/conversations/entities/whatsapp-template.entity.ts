import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChannelConfig } from './channel-config.entity';

@Entity('whatsapp_templates')
export class WhatsAppTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  channelConfigId: string | null;

  @ManyToOne(() => ChannelConfig, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'channelConfigId' })
  channelConfig?: ChannelConfig | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  templateId: string | null; // ID oficial asignado por Meta Graph API

  @Column({ type: 'varchar', length: 255, default: 'crm_inicio_conversacion' })
  name: string; // Nombre técnico de la plantilla en Meta (minúsculas y guiones bajos)

  @Column({ type: 'varchar', length: 50, default: 'MARKETING' })
  category: string; // 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

  @Column({ type: 'varchar', length: 20, default: 'es' })
  language: string; // Código de idioma de Meta (ej. 'es', 'es_MX')

  @Column({
    type: 'text',
    default: 'Hola {{1}}, ¿cómo estás? Me comunico contigo para dar seguimiento y revisar lo siguiente:',
  })
  bodyText: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  headerText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  footerText: string | null;

  @Column({ type: 'jsonb', nullable: true })
  components: any | null; // Componentes completos de Meta

  @Column({ type: 'varchar', length: 50, default: 'APPROVED' })
  status: string; // 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED'

  @Column({ type: 'boolean', default: true })
  isBase: boolean; // Indica si es la plantilla base predeterminada para iniciar/reanudar chats

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
