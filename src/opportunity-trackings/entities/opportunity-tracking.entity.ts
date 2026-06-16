
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { User } from '../../users/entities/user.entity';
import { Stage } from '../../stages/entities/stage.entity';

@Entity('opportunity_trackings')
export class OpportunityTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Opportunity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Column({ type: 'uuid' })
  opportunity_id: string;

  @Column({ type: 'uuid' })
  stage_id: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'stage_id' })
  stage: Stage;

  @CreateDateColumn({ type: 'timestamp' })
  changedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by_id' })
  changedBy: User;

  @Column({ type: 'uuid' })
  changed_by_id: string;
}

