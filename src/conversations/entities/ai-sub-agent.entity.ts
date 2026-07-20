import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_sub_agents')
export class AiSubAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  key: string; // 'comercial' | 'seguimiento' | 'soporte_atencion' | 'general' o claves personalizadas

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  context: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tools: string[] | null; // Array de nombres de herramientas permitidas (ej: ['registerContact', 'createOpportunity'])

  @Column({ type: 'float', default: 0.7 })
  temperature: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
