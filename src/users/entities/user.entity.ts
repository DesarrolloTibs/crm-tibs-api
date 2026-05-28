import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OpportunityTracking } from '../../opportunity-trackings/entities/opportunity-tracking.entity';


import { Exclude } from 'class-transformer';
import { Role } from 'role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude() // Excluir la contraseña de las respuestas JSON
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.Executive })
  role: Role;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'reset_password_token' })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'reset_password_expires' })
  resetPasswordExpires: Date | null;

  @OneToMany(() => OpportunityTracking, (tracking) => tracking.changedBy)
  opportunityTrackings: OpportunityTracking[];
}