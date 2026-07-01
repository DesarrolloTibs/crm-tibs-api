import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { TicketStage } from './ticket-stage.entity';

@Entity('helpdesks')
export class Helpdesk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  strname: string;

  @Column({ type: 'text', nullable: true })
  strdescription: string | null;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;

  @OneToMany(() => TicketStage, (stage) => stage.helpdesk)
  stages: TicketStage[];

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;
}
