import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('ai_agent_configs')
export class AiAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  context: string | null;

  @Column({ type: 'text', nullable: true })
  defaultReplies: string | null;

  @Column({ type: 'float', default: 0.7 })
  temperature: number;

  @Column({ type: 'varchar', length: 50, default: 'gemini' })
  modelProvider: string; // 'gemini' | 'openai' | 'watsonx'

  @Column({ type: 'varchar', length: 100, default: 'gemini-1.5-flash' })
  modelName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  openaiApiKey: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  openaiEndpoint: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  openaiApiVersion: string | null;

  @Column({ type: 'varchar', length: 100, default: 'text-embedding-ada-002' })
  openaiEmbeddingModel: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  geminiApiKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  watsonxApiKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  watsonxProjectId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  watsonxRegion: string | null;

  @Column({ type: 'varchar', length: 100, default: 'ibm/slate-125m-english-rtrvr' })
  watsonxEmbeddingModel: string;

  @Column({ type: 'integer', default: 60 })
  reminderOffsetMinutes: number;

  @Column({ type: 'integer', default: 2048 })
  maxNewTokens: number;

  @Column({ type: 'uuid', nullable: true })
  defaultUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultUserId' })
  defaultUser: User | null;
}
