import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'varchar', length: 50 })
  sender: string; // 'contact' | 'agent' | 'user' | 'system'

  @Column({ type: 'uuid', nullable: true })
  senderUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'senderUserId' })
  senderUser: User | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 50, default: 'sent' })
  status: string; // 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

  @Column({ type: 'varchar', length: 50, default: 'text' })
  messageType: string; // 'text' | 'template' | 'document' | 'image'

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalMessageId: string | null; // ID de mensaje de Meta (wamid)

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
