import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Helpdesk } from './helpdesk.entity';

@Entity('helpdesk_cron_config')
export class HelpdeskCronConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  helpdesk_id: string;

  @ManyToOne(() => Helpdesk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'helpdesk_id' })
  helpdesk: Helpdesk;

  /** 'fixed' = hora fija del día | 'interval' = cada cierto tiempo */
  @Column({ type: 'varchar', length: 20, default: 'fixed' })
  cron_mode: 'fixed' | 'interval';

  /** Hora de ejecución en formato 'HH:MM'. Solo cuando cron_mode = 'fixed'. */
  @Column({ type: 'varchar', length: 5, nullable: true, default: '08:00' })
  cron_time: string | null;

  /** Horas del intervalo. Solo cuando cron_mode = 'interval'. */
  @Column({ type: 'integer', nullable: true })
  cron_interval_hours: number | null;

  /** Minutos del intervalo. Solo cuando cron_mode = 'interval'. */
  @Column({ type: 'integer', nullable: true })
  cron_interval_minutes: number | null;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;
}
