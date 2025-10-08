import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, FindOptionsWhere, IsNull } from 'typeorm';
import { Opportunity, OpportunityStage } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { UsersService } from 'src/users/users.service';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'role.enum';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly usersService: UsersService,
  ) {}

  create(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    const total = (createOpportunityDto.monto_licenciamiento || 0) + (createOpportunityDto.monto_servicios || 0);
    const opportunityData = { ...createOpportunityDto, monto_total: total };

    // Si la moneda no es USD, nos aseguramos de que tipoCambio sea nulo.
    if (opportunityData.moneda !== 'USD') {
      opportunityData.tipoCambio = 0;
    }
    const opportunity = this.opportunityRepository.create(opportunityData);
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

  async findAllUnfiltered(currentUser: User): Promise<Opportunity[]> {
    // 1. Obtenemos el ID del usuario de forma segura desde el payload del token.
    const currentUserId = currentUser.id || (currentUser as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario actual.');
    }

    // 2. Cargamos la entidad completa del usuario para obtener su rol.
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
console.log('Full Current User:', fullCurrentUser); // Debug log
    const where: FindOptionsWhere<Opportunity> = {};

    // 3. Usamos la información completa y fiable para la lógica de autorización.
    if (fullCurrentUser.role !== Role.Admin) {
      where.ejecutivo_id = fullCurrentUser.id;
    }

    const findOptions: FindManyOptions<Opportunity> = {
      relations: ['cliente', 'ejecutivo'],
      where,
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
    const opportunity = await this.opportunityRepository.preload({
      id: id,
      ...updateOpportunityDto,
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    // Recalculamos el monto total y aplicamos la lógica del tipo de cambio.
    opportunity.monto_total = (opportunity.monto_licenciamiento ?? 0) + (opportunity.monto_servicios ?? 0);

    if (opportunity.moneda !== 'USD') {
      opportunity.tipoCambio = 0;
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

  async getProposalDocumentPath(id: string): Promise<string> {
    const opportunity = await this.findOne(id);
    if (!opportunity.proposalDocumentPath) {
      throw new NotFoundException(`Proposal document not found for opportunity with ID "${id}"`);
    }
    return opportunity.proposalDocumentPath;
  }
}
