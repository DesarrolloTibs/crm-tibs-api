import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Interaction } from '../../interactions/entities/interaction.entity';
import { User } from '../../users/entities/user.entity';
import { OpportunityTracking } from '../../opportunity-trackings/entities/opportunity-tracking.entity';
import { Company } from '../../companies/entities/company.entity';
import { Pipeline } from '../../pipelines/entities/pipeline.entity';
import { Stage } from '../../stages/entities/stage.entity';
import { OpportunityFile } from './opportunity-file.entity';
import { Product } from '../../products/entities/product.entity';
import { OpportunityProduct } from './opportunity-product.entity';
import { BusinessLineOption } from './business-line-option.entity';
import { DeliveryTypeOption } from './delivery-type-option.entity';
import { LicensingOption } from './licensing-option.entity';

export enum Currency {
  USD = 'USD',
  MXN = 'MXN',
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

  @Column({ type: 'uuid', nullable: true })
  linea_negocio_id: string | null;

  @ManyToOne(() => BusinessLineOption, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linea_negocio_id' })
  linea_negocio: BusinessLineOption | null;

  @Column({ type: 'uuid', nullable: true })
  tipo_entrega_id: string | null;

  @ManyToOne(() => DeliveryTypeOption, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tipo_entrega_id' })
  tipo_entrega: DeliveryTypeOption | null;

  @Column({ type: 'uuid', nullable: true })
  licenciamiento_id: string | null;

  @ManyToOne(() => LicensingOption, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'licenciamiento_id' })
  licenciamiento: LicensingOption | null;

  @OneToMany(() => Interaction, (interaction) => interaction.opportunity)
  interactions: Interaction[];

  @Column({ type: 'varchar', length: 512, nullable: true, name: 'proposal_document_path' })
  proposalDocumentPath: string;

  @OneToMany(() => OpportunityFile, (file) => file.opportunity, { eager: true })
  files: OpportunityFile[];

  @OneToMany(() => OpportunityProduct, (op) => op.opportunity, { eager: true, cascade: true })
  opportunityProducts: OpportunityProduct[];

  @Column({ type: 'boolean', default: false, name: 'archived' })
  archived: boolean;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Tipo de cambio aplicado si la moneda es USD',
  })
  tipoCambio: number | null;

  @Column({ type: 'date', nullable: true, name: 'estimated_closure_date' })
  estimated_closure_date: Date;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'stage_entered_at' })
  stage_entered_at: Date | null;

  @Column({ type: 'integer', default: 1 })
  priority: number;

  @OneToMany(() => OpportunityTracking, (tracking) => tracking.opportunity)
  tracking: OpportunityTracking[];
}
