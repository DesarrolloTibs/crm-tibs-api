import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { Pipeline } from '../../pipelines/entities/pipeline.entity';

@Entity('tblstagescatalog')
@Unique(['pipeline_id', 'strname'])
export class Stage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, nullable: false })
  strname: string;

  @Column({ type: 'boolean', default: true, nullable: false })
  blnstatus: boolean;

  @Column({ type: 'boolean', default: true, name: 'bln_show_dashboard' })
  bln_show_dashboard: boolean;

  @Column({ type: 'uuid', nullable: false })
  pipeline_id: string;

  @ManyToOne(() => Pipeline, (pipeline) => pipeline.stages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column({ type: 'integer', default: 0, nullable: false })
  display_order: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  strcolor: string | null;

  @Column({ type: 'boolean', default: false, nullable: false })
  blninitial: boolean;

  @Column({ type: 'integer', nullable: true, name: 'intmaxdays' })
  intmaxdays: number | null;

  @Column({ type: 'integer', default: 0, nullable: false, name: 'stage_type' })
  stage_type: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;
}
