import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketInteraction } from './entities/ticket-interaction.entity';
import { CreateTicketInteractionDto } from './dto/create-ticket-interaction.dto';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class TicketInteractionsService {
  constructor(
    @InjectRepository(TicketInteraction)
    private readonly ticketInteractionRepository: Repository<TicketInteraction>,
  ) {}

  private async ensureColumns() {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    try {
      await this.ticketInteractionRepository.query(`
        CREATE TABLE IF NOT EXISTS "${tenantSchema}".ticket_interactions (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          ticket_id uuid NOT NULL,
          comment text NULL,
          content text NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_ticket_interactions PRIMARY KEY (id)
        );
        ALTER TABLE "${tenantSchema}".ticket_interactions ADD COLUMN IF NOT EXISTS "comment" text;
        ALTER TABLE "${tenantSchema}".ticket_interactions ALTER COLUMN "content" DROP NOT NULL;
      `);
    } catch (e) {}
  }


  async create(dto: CreateTicketInteractionDto): Promise<TicketInteraction> {
    await this.ensureColumns();
    const interaction = this.ticketInteractionRepository.create(dto);
    return this.ticketInteractionRepository.save(interaction);
  }

  async findAllByTicket(ticketId: string): Promise<TicketInteraction[]> {
    await this.ensureColumns();
    return this.ticketInteractionRepository.find({
      where: { ticket_id: ticketId },
      order: { createdAt: 'DESC' },
    });
  }

  async remove(id: string): Promise<void> {
    const result = await this.ticketInteractionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Ticket interaction with ID "${id}" not found`);
    }
  }
}

