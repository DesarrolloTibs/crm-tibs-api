import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ClientCategory {
  CONTACTO = 'Contacto',
  LEAD = 'Lead',
  CLIENTE = 'Cliente',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'varchar', length: 255 })
  apellido: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  correo: string;

  @Column({ type: 'varchar', length: 255 })
  empresa: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  puesto: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string;

  @Column({
    type: 'enum',
    enum: ClientCategory,
    default: ClientCategory.LEAD,
  })
  category: ClientCategory;

  @Column({ type: 'boolean', default: true })
  estatus: boolean;

  @Column({ type: 'uuid', nullable: true })
  ejecutivo_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ejecutivo_id' })
  ejecutivo: User;
}
