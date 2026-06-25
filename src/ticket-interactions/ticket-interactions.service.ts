import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketInteraction } from './entities/ticket-interaction.entity';
import { CreateTicketInteractionDto } from './dto/create-ticket-interaction.dto';

@Injectable()
export class TicketInteractionsService {
  constructor(
    @InjectRepository(TicketInteraction)
    private readonly ticketInteractionRepository: Repository<TicketInteraction>,
  ) {}

  async create(dto: CreateTicketInteractionDto): Promise<TicketInteraction> {
    const interaction = this.ticketInteractionRepository.create(dto);
    return this.ticketInteractionRepository.save(interaction);
  }

  async findAllByTicket(ticketId: string): Promise<TicketInteraction[]> {
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
