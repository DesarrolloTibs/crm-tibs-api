import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, FindOptionsWhere } from 'typeorm';
import { Opportunity, OpportunityStage } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  create(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    const total = (createOpportunityDto.monto_licenciamiento || 0) + (createOpportunityDto.monto_servicios || 0);
    const opportunity = this.opportunityRepository.create({ ...createOpportunityDto, monto_total: total });
    return this.opportunityRepository.save(opportunity);
  }

  findAll(etapa?: OpportunityStage, showArchived = false): Promise<Opportunity[]> {
    const where: FindOptionsWhere<Opportunity> = { archived: showArchived };

    if (etapa) {
      where.etapa = etapa;
    }

    const findOptions: FindManyOptions<Opportunity> = {
      relations: ['cliente', 'ejecutivo'],
      where,
    };

    return this.opportunityRepository.find(findOptions);
  }

  findAllUnfiltered(): Promise<Opportunity[]> {
    const findOptions: FindManyOptions<Opportunity> = {
      relations: ['cliente', 'ejecutivo'],
    };
    return this.opportunityRepository.find(findOptions);
  }

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({ where: { id }, relations: ['cliente', 'ejecutivo'] });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    return opportunity;
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto): Promise<Opportunity> {
    const existingOpportunity = await this.findOne(id);
    
    const newTotal = (updateOpportunityDto.monto_licenciamiento ?? existingOpportunity.monto_licenciamiento) + (updateOpportunityDto.monto_servicios ?? existingOpportunity.monto_servicios);

    const opportunity = await this.opportunityRepository.preload({
      id: id,
      ...updateOpportunityDto,
      monto_total: newTotal,
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: string): Promise<void> {
    const result = await this.opportunityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
  }

  async addProposalDocument(id: string, filePath: string): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.proposalDocumentPath = filePath;
    return this.opportunityRepository.save(opportunity);
  }

  async archive(id: string, archiveOpportunityDto: ArchiveOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.archived = archiveOpportunityDto.archived;
    return this.opportunityRepository.save(opportunity);
  }
}
