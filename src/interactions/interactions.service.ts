import { Injectable } from '@nestjs/common';
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
    await this.interactionRepository.update(id, updateInteractionDto);
    const updatedInteraction = await this.interactionRepository.findOne({ where: { id } });
    if (!updatedInteraction) {
      throw new Error('Interaction not found');
    }
    return updatedInteraction;
  }

  async remove(id: string): Promise<void> {
    await this.interactionRepository.delete(id);
  }
}
