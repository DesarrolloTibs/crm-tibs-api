import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Exclude } from 'class-transformer';
import { Role } from 'role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude() // Excluir la contraseña de las respuestas JSON
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.Executive })
  role: Role;

  @Column({ default: true })
  isActive: boolean;
}