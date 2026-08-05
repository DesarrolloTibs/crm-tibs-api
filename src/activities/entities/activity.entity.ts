import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { Client } from '../../clients/entities/client.entity';
import { TypeActivity } from './type-activity.entity';
import { Company } from '../../companies/entities/company.entity';


@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'text' })
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

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @ManyToMany(() => Client, { cascade: true, eager: true })
  @JoinTable({
    name: 'activity_contacts',
    joinColumn: { name: 'activitiesId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'clientsId', referencedColumnName: 'id' }
  })
  contacts: Client[];


  @Column({ type: 'boolean', nullable: true })
  flaghistory: boolean;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalEventId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  externalProvider: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  externalLastSyncedAt: Date | null;
}