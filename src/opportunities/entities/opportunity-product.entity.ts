import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('opportunity_products')
export class OpportunityProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  opportunityId: string;

  @ManyToOne(() => Opportunity, (o) => o.opportunityProducts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity: Opportunity;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cantidad: number;
}
