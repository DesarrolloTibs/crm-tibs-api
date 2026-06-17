import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, FindOptionsWhere, Brackets } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityFile } from './entities/opportunity-file.entity';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { UsersService } from 'src/users/users.service';
import { User } from 'src/users/entities/user.entity';
import { Role } from '../role.enum';
import { OpportunityTrackingsService } from 'src/opportunity-trackings/opportunity-trackings.service';
import { ClientsService } from 'src/clients/clients.service';
import { Client, ClientCategory } from 'src/clients/entities/client.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Stage } from '../stages/entities/stage.entity';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(OpportunityFile)
    private readonly opportunityFileRepository: Repository<OpportunityFile>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Pipeline)
    private readonly pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    private readonly usersService: UsersService,
    private readonly opportunityTrackingsService: OpportunityTrackingsService,
    private readonly clientsService: ClientsService,
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    const { contactIds, ...dtoWithoutContacts } = createOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;
    const total = (dtoWithoutContacts.monto_licenciamiento || 0) + (dtoWithoutContacts.monto_servicios || 0);
    const opportunityData = { ...dtoWithoutContacts, monto_total: total } as any;

    // Si la moneda no es USD, nos aseguramos de que tipoCambio sea nulo.
    if (opportunityData.moneda !== 'USD') {
      opportunityData.tipoCambio = 0;
    }

    // Resolver pipeline por defecto si no se proporciona
    if (!opportunityData.pipeline_id) {
      const mainPipeline = await this.pipelineRepository.findOne({
        where: {},
        order: { dtmcreated: 'ASC' },
      });
      if (!mainPipeline) {
        throw new InternalServerErrorException('El Pipeline Principal no existe en la base de datos.');
      }
      opportunityData.pipeline_id = mainPipeline.id;
    }

    // Resolver etapa por defecto (etapa inicial) si no se proporciona
    if (!opportunityData.stage_id) {
      const initialStage = await this.stageRepository.findOne({
        where: { pipeline_id: opportunityData.pipeline_id, blninitial: true, blnstatus: true }
      });
      if (!initialStage) {
        throw new InternalServerErrorException('No se configuró una etapa inicial activa para este pipeline.');
      }
      opportunityData.stage_id = initialStage.id;
    }

    // Validar que la etapa exista y pertenezca al pipeline
    const selectedStage = await this.stageRepository.findOne({ where: { id: opportunityData.stage_id } });
    if (!selectedStage) {
      throw new NotFoundException(`La etapa con ID "${opportunityData.stage_id}" no existe.`);
    }
    if (selectedStage.pipeline_id !== opportunityData.pipeline_id) {
      throw new BadRequestException('La etapa seleccionada no pertenece al pipeline de la oportunidad.');
    }

    const opportunity = this.opportunityRepository.create({
      ...opportunityData,
      stage_entered_at: new Date(),
    } as any) as unknown as Opportunity;

    // Si hay ids de contacto, los cargamos.
    if (contactIds && contactIds.length > 0) {
      opportunity.contacts = await this.clientRepository.find({
        where: contactIds.map(id => ({ id }))
      });
    } else if (opportunityData.cliente_id) {
      // Fallback para cliente_id (contacto individual)
      opportunity.contacts = await this.clientRepository.find({
        where: { id: opportunityData.cliente_id }
      });
    }

    const savedOpportunity: Opportunity = await this.opportunityRepository.save(opportunity);

    // Create the initial tracking record
    await this.opportunityTrackingsService.create({
      opportunity_id: savedOpportunity.id,
      stage_id: savedOpportunity.stage_id,
      changed_by_id: savedOpportunity.ejecutivo_id,
    });

    if (selectedStage.strname === 'Ganada') {
      if (savedOpportunity.cliente_id) {
        await this.clientsService.update(savedOpportunity.cliente_id, {
          category: ClientCategory.CLIENTE,
        });
      }
      if (savedOpportunity.contacts && savedOpportunity.contacts.length > 0) {
        for (const contact of savedOpportunity.contacts) {
          await this.clientsService.update(contact.id, {
            category: ClientCategory.CLIENTE,
          });
        }
      }
    }

    // Cargar la relación stage completa antes de retornar
    return this.findOne(savedOpportunity.id);
  }

  findAll(
    stage_id?: string,
    showArchived = false,
  ): Promise<Opportunity[]> {
    const currentYear = new Date().getFullYear();
    const excludedStageNames = ['Ganada', 'Perdida', 'Cancelada', 'Standby'];

    const qb = this.opportunityRepository.createQueryBuilder('opportunity');

    qb.leftJoinAndSelect('opportunity.cliente', 'cliente')
      .leftJoinAndSelect('opportunity.ejecutivo', 'ejecutivo')
      .leftJoinAndSelect('opportunity.company', 'company')
      .leftJoinAndSelect('opportunity.contacts', 'contacts')
      .leftJoinAndSelect('opportunity.stage', 'stage')
      .where('opportunity.archived = :showArchived', { showArchived });

    if (stage_id) {
      qb.andWhere('opportunity.stage_id = :stage_id', { stage_id });
    } else {
      qb.andWhere(new Brackets(sqb => {
          sqb.where('stage.strname NOT IN (:...excludedStageNames)', { excludedStageNames })
             .orWhere(
                 `(
                     SELECT EXTRACT(YEAR FROM MAX(ot."changedAt"))
                     FROM opportunity_trackings ot
                     WHERE ot.opportunity_id = opportunity.id
                     AND ot.stage_id = opportunity.stage_id
                 ) >= :currentYear`, { currentYear }
             );
      }));
    }

    return qb.getMany();
  }

  async findAllUnfiltered(currentUser: User): Promise<Opportunity[]> {
    const currentUserId = currentUser.id || (currentUser as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario actual.');
    }

    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    const where: FindOptionsWhere<Opportunity> = {};

    if (fullCurrentUser.role !== Role.Admin) {
      where.ejecutivo_id = fullCurrentUser.id;
    }

    const findOptions: FindManyOptions<Opportunity> = {
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage'],
      where,
    };
    return this.opportunityRepository.find(findOptions);
  }

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage'],
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    return opportunity;
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto): Promise<Opportunity> {
    const existingOpportunity = await this.findOne(id);
    if (!existingOpportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    const originalStageId = existingOpportunity.stage_id;
    const { contactIds, ...dtoWithoutContacts } = updateOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;

    const opportunity = await this.opportunityRepository.preload({
      id: id,
      ...dtoWithoutContacts,
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    // Recalculamos el monto total y aplicamos la lógica del tipo de cambio.
    opportunity.monto_total = (opportunity.monto_licenciamiento ?? 0) + (opportunity.monto_servicios ?? 0);

    if (opportunity.moneda !== 'USD') {
      opportunity.tipoCambio = 0;
    }

    if (contactIds !== undefined) {
      if (contactIds.length > 0) {
        opportunity.contacts = await this.clientRepository.find({
          where: contactIds.map(id => ({ id }))
        });
      } else {
        opportunity.contacts = [];
      }
    }

    // Validar etapa si se está actualizando
    let selectedStage: Stage | null = existingOpportunity.stage;
    if (updateOpportunityDto.stage_id && updateOpportunityDto.stage_id !== originalStageId) {
      selectedStage = await this.stageRepository.findOne({ where: { id: updateOpportunityDto.stage_id } });
      if (!selectedStage) {
        throw new NotFoundException(`La etapa con ID "${updateOpportunityDto.stage_id}" no existe.`);
      }
      if (selectedStage.pipeline_id !== (opportunity.pipeline_id || existingOpportunity.pipeline_id)) {
        throw new BadRequestException('La etapa seleccionada no pertenece al pipeline de la oportunidad.');
      }
      opportunity.stage_entered_at = new Date();
    }
    
    const savedOpportunity = await this.opportunityRepository.save(opportunity);

    if (updateOpportunityDto.stage_id && updateOpportunityDto.stage_id !== originalStageId) {
      await this.opportunityTrackingsService.create({
        opportunity_id: savedOpportunity.id,
        stage_id: savedOpportunity.stage_id,
        changed_by_id: savedOpportunity.ejecutivo_id,
      });
    }

    if (selectedStage && selectedStage.strname === 'Ganada') {
      if (savedOpportunity.cliente_id) {
        await this.clientsService.update(savedOpportunity.cliente_id, {
          category: ClientCategory.CLIENTE,
        });
      }
      if (savedOpportunity.contacts && savedOpportunity.contacts.length > 0) {
        for (const contact of savedOpportunity.contacts) {
          await this.clientsService.update(contact.id, {
            category: ClientCategory.CLIENTE,
          });
        }
      }
    }

    return this.findOne(savedOpportunity.id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.opportunityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
  }

  async addOpportunityFile(
    opportunityId: string,
    fileName: string,
    filePath: string,
    title?: string,
    date?: string,
  ): Promise<Opportunity> {
    const opportunity = await this.findOne(opportunityId);
    
    const opportunityFile = this.opportunityFileRepository.create({
      opportunityId,
      fileName,
      filePath,
      title: title || null,
      date: date ? new Date(date) : null,
    });

    await this.opportunityFileRepository.save(opportunityFile);
    return this.findOne(opportunityId);
  }

  async getOpportunityFile(opportunityId: string, fileId: string): Promise<OpportunityFile> {
    const file = await this.opportunityFileRepository.findOne({
      where: { id: fileId, opportunityId },
    });
    if (!file) {
      throw new NotFoundException(`El archivo con ID "${fileId}" no fue encontrado para esta oportunidad.`);
    }
    return file;
  }

  async deleteOpportunityFile(opportunityId: string, fileId: string): Promise<Opportunity> {
    const file = await this.getOpportunityFile(opportunityId, fileId);

    // Eliminar archivo físico
    const absolutePath = join(process.cwd(), file.filePath);
    if (existsSync(absolutePath)) {
      try {
        unlinkSync(absolutePath);
      } catch (err) {
        console.error(`Error deleting physical file at ${absolutePath}:`, err);
      }
    }

    await this.opportunityFileRepository.remove(file);
    return this.findOne(opportunityId);
  }

  async archive(id: string, archiveOpportunityDto: ArchiveOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.archived = archiveOpportunityDto.archived;
    return this.opportunityRepository.save(opportunity);
  }
}

