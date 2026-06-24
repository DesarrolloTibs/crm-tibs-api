import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Generated } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { Helpdesk } from './helpdesk.entity';
import { TicketStage } from './ticket-stage.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  @Generated('increment')
  ticket_number: number;

  @Column({ type: 'varchar', length: 255 })
  strtitle: string;

  @Column({ type: 'varchar', length: 255 })
  tipo_incidencia: string;

  @Column({ type: 'text' })
  description: string;

  @CreateDateColumn({ type: 'timestamp' })
  fecha_apertura: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_cierre: Date | null;

  @Column({ type: 'text', nullable: true })
  notas_resolucion: string | null;

  @Column({ type: 'integer', default: 1 })
  priority: number; // 1, 2, or 3

  @Column({ type: 'boolean', default: false })
  alert_sent: boolean;

  @Column({ type: 'uuid', nullable: true })
  cliente_id: string | null;

  @ManyToOne(() => Client, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ type: 'uuid', nullable: true })
  responsable_id: string | null;

  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsable_id' })
  responsable: User | null;

  @Column({ type: 'uuid' })
  helpdesk_id: string;

  @ManyToOne(() => Helpdesk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'helpdesk_id' })
  helpdesk: Helpdesk;

  @Column({ type: 'uuid' })
  stage_id: string;

  @ManyToOne(() => TicketStage, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stage_id' })
  stage: TicketStage;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  stage_entered_at: Date;

  // External client contact info if they aren't registered yet
  @Column({ type: 'varchar', length: 255, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactPhone: string | null;
}
