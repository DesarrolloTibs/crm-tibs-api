import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Helpdesk } from './helpdesk.entity';

@Entity('ticket_stages')
export class TicketStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  strname: string;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;

  @Column({ type: 'boolean', default: true, name: 'bln_show_dashboard' })
  bln_show_dashboard: boolean;

  @Column({ type: 'uuid' })
  helpdesk_id: string;

  @ManyToOne(() => Helpdesk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'helpdesk_id' })
  helpdesk: Helpdesk;

  @Column({ type: 'integer', default: 0 })
  display_order: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  strcolor: string | null;

  @Column({ type: 'boolean', default: false })
  blninitial: boolean;

  @Column({ type: 'integer', nullable: true })
  intmaxdays: number | null;

  @Column({ type: 'integer', default: 0, nullable: false, name: 'stage_type' })
  stage_type: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;
}
