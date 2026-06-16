import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Stage } from '../../stages/entities/stage.entity';

@Entity('tblpipelinescatalog')
export class Pipeline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true, nullable: false })
  strname: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strdescription: string | null;

  @Column({ type: 'boolean', default: true, nullable: false })
  blnstatus: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmcreated: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  dtmlastmodified: Date;

  @Column({ type: 'int', default: 1 })
  intlastmodifiedby: number;

  @OneToMany(() => Stage, (stage) => stage.pipeline)
  stages: Stage[];
}
