import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_calendar_integrations')
export class UserCalendarIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  provider: 'google' | 'outlook';

  @Column({ type: 'varchar', length: 255 })
  email: string;

  // OAuth Credentials (Google / Microsoft Outlook)
  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;


  // Configuración de sincronización
  @Column({ type: 'varchar', length: 255, nullable: true })
  calendarId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookSubscriptionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  webhookExpiration: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  syncToken: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
