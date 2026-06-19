import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tblicensings')
export class LicensingOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  strname: string;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;
}
