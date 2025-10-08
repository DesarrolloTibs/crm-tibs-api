import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Interaction } from '../../interactions/entities/interaction.entity';
import { Reminder } from '../../reminders/entities/reminder.entity';
import { User } from '../../users/entities/user.entity';

export enum OpportunityStage {
  NUEVO = 'Nuevo',
  DESCUBRIMIENTO = 'Descubrimiento',
  ESTIMACION = 'Estimación',
  PROPUESTA = 'Propuesta',
  NEGOCIACION = 'Negociación',
  GANADA = 'Ganada',
  PERDIDA = 'Perdida',
  CANCELADA = 'Cancelada',
}

export enum Currency {
  USD = 'USD',
  MXN = 'MXN',
}

export enum BusinessLine {
  DATOS = 'Datos',
  DESARROLLO = 'Desarrollo',
  RH = 'RH',
}

export enum DeliveryType {
  PROYECTO = 'Proyecto',
  LICENCIA = 'Licencia',
  ASIGNACION = 'Asignacion',
  BOLSA_DE_HORAS = 'Bolsa de Horas',
}

export enum Licensing {
  NO_APLICA = 'No Aplica',
  MICROSOFT = 'Microsoft',
  IBM = 'IBM',
  QLIK = 'Qlik',
  ALTERYX = 'Alteryx',
  KNIME = 'KNIME',
}

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre_proyecto: string;

  @Column({ type: 'uuid' })
  cliente_id: string;

  @ManyToOne(() => Client, { eager: true }) // eager load client details
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client;

  @Column({ type: 'varchar', length: 255 })
  empresa: string;

  @Column({ type: 'uuid', nullable: true }) // Assuming ejecutivo_id is a user ID
  ejecutivo_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ejecutivo_id' })
  ejecutivo: User;

  @Column({ type: 'enum', enum: OpportunityStage, default: OpportunityStage.NUEVO })
  etapa: OpportunityStage;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_licenciamiento: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_servicios: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_total: number;

  @Column({ type: 'enum', enum: Currency, default: Currency.USD })
  moneda: Currency;

  @Column({ type: 'enum', enum: BusinessLine })
  linea_negocio: BusinessLine;

  @Column({ type: 'enum', enum: DeliveryType })
  tipo_entrega: DeliveryType;


  @Column({ type: 'enum', enum: Licensing, nullable: true })
  licenciamiento: Licensing;

  @OneToMany(() => Interaction, (interaction) => interaction.opportunity)
  interactions: Interaction[];

  @Column({ type: 'varchar', length: 512, nullable: true, name: 'proposal_document_path' })
  proposalDocumentPath: string;

  @OneToMany(() => Reminder, (reminder) => reminder.opportunity)
  reminders: Reminder[];

  @Column({ type: 'boolean', default: false, name: 'archived' })
  archived: boolean;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true, // Permite que el valor sea NULL en la base de datos
    comment: 'Tipo de cambio aplicado si la moneda es USD',
  })
  tipoCambio: number | null; // Le dice a TypeScript que la propiedad puede ser un número o nulo
}
