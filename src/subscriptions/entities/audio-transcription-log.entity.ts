import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'audio_transcription_logs', schema: 'public' })
export class AudioTranscriptionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', nullable: true })
  tenant_id: number | null;

  @Column({ type: 'varchar', length: 63, nullable: false })
  tenant_schema: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  channel: string;

  @Column({ type: 'varchar', length: 50, nullable: false, default: 'ibm_stt' })
  provider: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false, default: 0 })
  duration_seconds: number;

  @Column({ type: 'integer', nullable: false, default: 0 })
  audio_bytes: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime_type: string | null;

  @Column({ type: 'boolean', nullable: false, default: true })
  has_speech: boolean;

  @Column({ type: 'boolean', nullable: false, default: true })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  message_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  client_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
