import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';

export enum ActivityType {
  CORREO = 'Correo',
  PRESENTACION_SERVICIOS_PRESENCIAL = 'Presentación Servicios Presencial',
  PRESENTACION_SERVICIOS_EN_LINEA = 'Presentación Servicios En Línea',
  EVENTO = 'Evento',
  SEGUIMIENTO_OPORTUNIDAD = 'Seguimiento Oportunidad',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

   @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'varchar', length: 80 })
  activity: string;

  @Column({ type: 'enum', enum: ActivityType })
  activityType: ActivityType;

  @Column({ type: 'uuid', nullable: true })
  opportunityId: string | null;

  @ManyToOne(() => Opportunity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity: Opportunity;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}