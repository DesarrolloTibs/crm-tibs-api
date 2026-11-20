import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UpdateInteractionDto } from './dto/update-interaction.dto';
import { Interaction } from './entities/interaction.entity';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionRepository: Repository<Interaction>,
  ) {}

  create(createInteractionDto: CreateInteractionDto): Promise<Interaction> {
    const interaction = this.interactionRepository.create(createInteractionDto);
    return this.interactionRepository.save(interaction);
  }

  findAllByOpportunity(opportunityId: string): Promise<Interaction[]> {
    return this.interactionRepository.find({
      where: { opportunity_id: opportunityId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, updateInteractionDto: UpdateInteractionDto): Promise<Interaction> {
    const existing = await this.interactionRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Interacción con ID "${id}" no encontrada.`);
    }
    Object.assign(existing, updateInteractionDto);
    return this.interactionRepository.save(existing);
  }

  async remove(id: string): Promise<void> {
    const result = await this.interactionRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Interacción con ID "${id}" no encontrada.`);
    }
  }
}
