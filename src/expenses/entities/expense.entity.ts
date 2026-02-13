import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { User } from '../../users/entities/user.entity';

@Entity('expenses')
export class Expense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'date' })
    fecha: Date;

    @Column({ type: 'varchar', length: 255 })
    concepto: string;

    @Column({ type: 'decimal', precision: 18, scale: 2 })
    monto: number;

    @Column({ type: 'uuid', nullable: true })
    client_id: string | null;

    @ManyToOne(() => Client, { nullable: true })
    @JoinColumn({ name: 'client_id' })
    client: Client | null;

    @Column({ type: 'uuid', nullable: true })
    opportunity_id: string | null;

    @ManyToOne(() => Opportunity, { nullable: true })
    @JoinColumn({ name: 'opportunity_id' })
    opportunity: Opportunity | null;

    @Column({ type: 'uuid', nullable: true })
    usuario_id: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'usuario_id' })
    usuario: User;

    @Column({ type: 'varchar', nullable: true })
    receiptUrl: string | null;

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}
