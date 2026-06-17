import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Interaction } from '../../interactions/entities/interaction.entity';
import { Reminder } from '../../reminders/entities/reminder.entity';
import { User } from '../../users/entities/user.entity';
import { OpportunityTracking } from '../../opportunity-trackings/entities/opportunity-tracking.entity';
import { Company } from '../../companies/entities/company.entity';
import { Pipeline } from '../../pipelines/entities/pipeline.entity';
import { Stage } from '../../stages/entities/stage.entity';
import { OpportunityFile } from './opportunity-file.entity';

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

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  cliente_id: string | null;

  @ManyToOne(() => Client, { eager: true, nullable: true }) // eager load client details
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  empresa: string | null;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => Company, { nullable: true, eager: true })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @ManyToMany(() => Client, { cascade: true, eager: true })
  @JoinTable({
    name: 'opportunity_contacts',
    joinColumn: { name: 'opportunitiesId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'clientsId', referencedColumnName: 'id' }
  })
  contacts: Client[];


  @Column({ type: 'uuid', nullable: true }) // Assuming ejecutivo_id is a user ID
  ejecutivo_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ejecutivo_id' })
  ejecutivo: User;

  @Column({ type: 'uuid', nullable: false })
  pipeline_id: string;

  @ManyToOne(() => Pipeline)
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column({ type: 'uuid', nullable: false })
  stage_id: string;

  @ManyToOne(() => Stage, { eager: true })
  @JoinColumn({ name: 'stage_id' })
  stage: Stage;

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

  @OneToMany(() => OpportunityFile, (file) => file.opportunity, { eager: true })
  files: OpportunityFile[];

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

  @Column({ type: 'date', nullable: true, name: 'estimated_closure_date' })
  estimated_closure_date: Date;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'stage_entered_at' })
  stage_entered_at: Date | null;

  @OneToMany(() => OpportunityTracking, (tracking) => tracking.opportunity)
  tracking: OpportunityTracking[];
}
