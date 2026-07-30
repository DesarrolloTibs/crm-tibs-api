import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tbltypeactivities')
export class TypeActivity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar'})
  strname: string;

  @Column({ type: 'boolean'})
  blnstatus: boolean;

}
