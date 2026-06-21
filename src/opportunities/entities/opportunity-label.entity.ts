import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('tbloportunitylabels')
export class OpportunityLabel {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strname: string;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;

  @Column({ type: 'timestamp', nullable: true })
  dtmlastmodified: Date;

  @Column({ type: 'uuid', nullable: true })
  uuidlastmodifiedby: string;
}
