import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tblbusinesslines')
export class BusinessLineOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  strname: string;

  @Column({ type: 'boolean', default: true })
  blnstatus: boolean;
}
