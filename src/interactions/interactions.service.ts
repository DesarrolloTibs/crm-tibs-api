import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInteractionDto } from './dto/create-interaction.dto';
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
}