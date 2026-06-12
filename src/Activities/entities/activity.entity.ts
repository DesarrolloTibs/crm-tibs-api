import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { Client } from 'src/clients/entities/client.entity';
import { TypeActivity } from './type-activity.entity';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'varchar', length: 80 })
  activity: string;

  @Column({ type: 'int', nullable: true })
  typeActivityId: number | null;

  @ManyToOne(() => TypeActivity, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'typeActivityId' })
  typeActivity: TypeActivity;

  @Column({ type: 'uuid', nullable: true })
  opportunityId: string | null;

  @ManyToOne(() => Opportunity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity: Opportunity;

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'boolean', nullable: true })
  flaghistory: boolean;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}