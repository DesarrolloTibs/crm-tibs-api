import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, FindOptionsWhere, Brackets } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityFile } from './entities/opportunity-file.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { StorageService } from '../storage/storage.service';
import type { Response } from 'express';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { InteractionsService } from '../interactions/interactions.service';
import { Company } from '../companies/entities/company.entity';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { BusinessLineOption } from './entities/business-line-option.entity';
import { DeliveryTypeOption } from './entities/delivery-type-option.entity';
import { LicensingOption } from './entities/licensing-option.entity';
import { OpportunityLabel } from './entities/opportunity-label.entity';
import { UsersService } from 'src/users/users.service';
import { User } from 'src/users/entities/user.entity';
import { Role } from '../role.enum';
import { OpportunityTrackingsService } from 'src/opportunity-trackings/opportunity-trackings.service';
import { ClientsService } from 'src/clients/clients.service';
import { Client, ClientCategory } from 'src/clients/entities/client.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Stage } from '../stages/entities/stage.entity';
import { Product } from '../products/entities/product.entity';
import { NotificationsService } from '../notifications/notifications.service';

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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly usersService: UsersService,
    private readonly opportunityTrackingsService: OpportunityTrackingsService,
    private readonly clientsService: ClientsService,
    private readonly storageService: StorageService,
    private readonly interactionsService: InteractionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto, user?: User): Promise<Opportunity> {
    const { contactIds, productIds, ...dtoWithoutContacts } = createOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;

    let productsPriceSum = 0;
    let selectedProducts: Product[] = [];
    if (productIds && productIds.length > 0) {
      selectedProducts = await this.productRepository.find({
        where: productIds.map(id => ({ id }))
      });
      productsPriceSum = selectedProducts.reduce((sum, p) => sum + (Number(p.precioBase) || 0), 0);
    }

    let convertedProductsPrice = productsPriceSum;
    if (dtoWithoutContacts.moneda === 'USD' && dtoWithoutContacts.tipoCambio && Number(dtoWithoutContacts.tipoCambio) > 0) {
      convertedProductsPrice = productsPriceSum / Number(dtoWithoutContacts.tipoCambio);
    }

    const total = (dtoWithoutContacts.monto_licenciamiento || 0) + (dtoWithoutContacts.monto_servicios || 0) + convertedProductsPrice;
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
      products: selectedProducts,
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

    // Registrar la creación en el historial
    const username = user?.username || 'Sistema';
    const initialStage = await this.stageRepository.findOne({ where: { id: savedOpportunity.stage_id } });
    const initialComment = `El usuario ${username} creó la oportunidad con la etapa inicial "${initialStage?.strname || 'N/A'}".`;
    await this.interactionsService.create({
      opportunity_id: savedOpportunity.id,
      comment: initialComment,
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

    // Si la oportunidad tiene un ejecutivo asignado, le notifica únicamente a él. Si no tiene, no notifica a nadie.
    if (savedOpportunity.ejecutivo_id) {
      await this.notificationsService.createAndSendNotification(
        savedOpportunity.ejecutivo_id,
        'Nueva Oportunidad Creada',
        `Se ha creado la oportunidad "${savedOpportunity.nombre_proyecto}".`,
        'opportunity_created',
        savedOpportunity.id,
      );
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
      .leftJoinAndSelect('opportunity.products', 'products')
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
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage', 'products'],
      where,
    };
    return this.opportunityRepository.find(findOptions);
  }

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage', 'products'],
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    return opportunity;
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto, user?: User): Promise<Opportunity> {
    const existingOpportunity = await this.findOne(id);
    if (!existingOpportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    const originalStageId = existingOpportunity.stage_id;
    const { contactIds, productIds, ...dtoWithoutContacts } = updateOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;

    // Detectar cambios antes de aplicar el preload
    const changes: string[] = [];
    const username = user?.username || 'Sistema';

    // Obtener etiquetas de oportunidad desde base de datos de manera dinámica para que coincidan con la configuración del catálogo
    const labelRepo = this.opportunityRepository.manager.getRepository(OpportunityLabel);
    const labels = await labelRepo.find();
    
    const getLabelNameByKey = (key: 'linea_negocio' | 'tipo_entrega' | 'licenciamiento', defaultName: string) => {
      const label = labels.find(l => l.field_key === key);
      return label && label.strname ? label.strname : defaultName;
    };

    const labelLicenciamiento = getLabelNameByKey('licenciamiento', 'Licenciamiento');
    const labelServicios = getLabelNameByKey('tipo_entrega', 'Servicios');
    const labelLineaNegocio = getLabelNameByKey('linea_negocio', 'Línea de negocio');
    const labelTipoEntrega = getLabelNameByKey('tipo_entrega', 'Tipo de entrega');

    if (updateOpportunityDto.nombre_proyecto !== undefined && updateOpportunityDto.nombre_proyecto !== existingOpportunity.nombre_proyecto) {
      changes.push(`- Nombre del proyecto: "${existingOpportunity.nombre_proyecto}" -> "${updateOpportunityDto.nombre_proyecto}"`);
    }
    if (updateOpportunityDto.description !== undefined && updateOpportunityDto.description !== existingOpportunity.description) {
      changes.push(`- Descripción: "${existingOpportunity.description || 'Sin descripción'}" -> "${updateOpportunityDto.description || 'Sin descripción'}"`);
    }
    if (updateOpportunityDto.moneda !== undefined && updateOpportunityDto.moneda !== existingOpportunity.moneda) {
      changes.push(`- Moneda: "${existingOpportunity.moneda}" -> "${updateOpportunityDto.moneda}"`);
    }
    if (updateOpportunityDto.monto_licenciamiento !== undefined && Number(updateOpportunityDto.monto_licenciamiento) !== Number(existingOpportunity.monto_licenciamiento)) {
      changes.push(`- Monto ${labelLicenciamiento}: $${existingOpportunity.monto_licenciamiento} -> $${updateOpportunityDto.monto_licenciamiento}`);
    }
    if (updateOpportunityDto.monto_servicios !== undefined && Number(updateOpportunityDto.monto_servicios) !== Number(existingOpportunity.monto_servicios)) {
      changes.push(`- Monto ${labelServicios}: $${existingOpportunity.monto_servicios} -> $${updateOpportunityDto.monto_servicios}`);
    }
    if (updateOpportunityDto.tipoCambio !== undefined && Number(updateOpportunityDto.tipoCambio) !== Number(existingOpportunity.tipoCambio)) {
      changes.push(`- Tipo de cambio: ${existingOpportunity.tipoCambio || 'N/A'} -> ${updateOpportunityDto.tipoCambio || 'N/A'}`);
    }
    if (updateOpportunityDto.estimated_closure_date !== undefined) {
      const existingDate = existingOpportunity.estimated_closure_date ? new Date(existingOpportunity.estimated_closure_date).toISOString().split('T')[0] : 'N/A';
      const newDate = updateOpportunityDto.estimated_closure_date ? new Date(updateOpportunityDto.estimated_closure_date).toISOString().split('T')[0] : 'N/A';
      if (existingDate !== newDate) {
        changes.push(`- Fecha estimada de cierre: ${existingDate} -> ${newDate}`);
      }
    }

    if (updateOpportunityDto.priority !== undefined && updateOpportunityDto.priority !== existingOpportunity.priority) {
      changes.push(`- Prioridad: ${existingOpportunity.priority} -> ${updateOpportunityDto.priority}`);
    }
    if (updateOpportunityDto.stage_id !== undefined && updateOpportunityDto.stage_id !== existingOpportunity.stage_id) {
      const oldStage = await this.stageRepository.findOne({ where: { id: existingOpportunity.stage_id } });
      const newStage = await this.stageRepository.findOne({ where: { id: updateOpportunityDto.stage_id } });
      changes.push(`- Etapa: "${oldStage?.strname || 'N/A'}" -> "${newStage?.strname || 'N/A'}"`);
    }
    if (updateOpportunityDto.pipeline_id !== undefined && updateOpportunityDto.pipeline_id !== existingOpportunity.pipeline_id) {
      const oldPipeline = await this.pipelineRepository.findOne({ where: { id: existingOpportunity.pipeline_id } });
      const newPipeline = await this.pipelineRepository.findOne({ where: { id: updateOpportunityDto.pipeline_id } });
      changes.push(`- Pipeline: "${oldPipeline?.strname || 'N/A'}" -> "${newPipeline?.strname || 'N/A'}"`);
    }
    if (updateOpportunityDto.ejecutivo_id !== undefined && updateOpportunityDto.ejecutivo_id !== existingOpportunity.ejecutivo_id) {
      const oldEjecutivo = await this.usersService.findOneById(existingOpportunity.ejecutivo_id).catch(() => null);
      const newEjecutivo = await this.usersService.findOneById(updateOpportunityDto.ejecutivo_id).catch(() => null);
      changes.push(`- Ejecutivo: "${oldEjecutivo?.username || 'N/A'}" -> "${newEjecutivo?.username || 'N/A'}"`);
    }
    if (updateOpportunityDto.cliente_id !== undefined && updateOpportunityDto.cliente_id !== existingOpportunity.cliente_id) {
      const oldCliente = existingOpportunity.cliente;
      const newCliente = updateOpportunityDto.cliente_id ? await this.clientRepository.findOne({ where: { id: updateOpportunityDto.cliente_id } }) : null;
      const oldClienteName = oldCliente ? `${oldCliente.nombre} ${oldCliente.apellido}` : 'N/A';
      const newClienteName = newCliente ? `${newCliente.nombre} ${newCliente.apellido}` : 'N/A';
      changes.push(`- Cliente: "${oldClienteName}" -> "${newClienteName}"`);
    }
    if (updateOpportunityDto.companyId !== undefined && updateOpportunityDto.companyId !== existingOpportunity.companyId) {
      const oldCompany = existingOpportunity.company;
      const newCompany = updateOpportunityDto.companyId ? await this.clientRepository.manager.getRepository(Company).findOne({ where: { id: updateOpportunityDto.companyId } }) : null;
      changes.push(`- Empresa: "${oldCompany?.nombre || 'N/A'}" -> "${newCompany?.nombre || 'N/A'}"`);
    }
    if (updateOpportunityDto.linea_negocio_id !== undefined && updateOpportunityDto.linea_negocio_id !== existingOpportunity.linea_negocio_id) {
      const oldOption = existingOpportunity.linea_negocio;
      const newOption = updateOpportunityDto.linea_negocio_id ? await this.opportunityRepository.manager.getRepository(BusinessLineOption).findOne({ where: { id: updateOpportunityDto.linea_negocio_id } }) : null;
      changes.push(`- ${labelLineaNegocio}: "${oldOption?.strname || 'N/A'}" -> "${newOption?.strname || 'N/A'}"`);
    }
    if (updateOpportunityDto.tipo_entrega_id !== undefined && updateOpportunityDto.tipo_entrega_id !== existingOpportunity.tipo_entrega_id) {
      const oldOption = existingOpportunity.tipo_entrega;
      const newOption = updateOpportunityDto.tipo_entrega_id ? await this.opportunityRepository.manager.getRepository(DeliveryTypeOption).findOne({ where: { id: updateOpportunityDto.tipo_entrega_id } }) : null;
      changes.push(`- ${labelTipoEntrega}: "${oldOption?.strname || 'N/A'}" -> "${newOption?.strname || 'N/A'}"`);
    }
    if (updateOpportunityDto.licenciamiento_id !== undefined && updateOpportunityDto.licenciamiento_id !== existingOpportunity.licenciamiento_id) {
      const oldOption = existingOpportunity.licenciamiento;
      const newOption = updateOpportunityDto.licenciamiento_id ? await this.opportunityRepository.manager.getRepository(LicensingOption).findOne({ where: { id: updateOpportunityDto.licenciamiento_id } }) : null;
      changes.push(`- ${labelLicenciamiento}: "${oldOption?.strname || 'N/A'}" -> "${newOption?.strname || 'N/A'}"`);
    }
    if (productIds !== undefined) {
      const existingProductNames = (existingOpportunity.products || []).map(p => p.nombre).sort().join(', ');
      const selectedProducts = productIds.length > 0 ? await this.productRepository.find({ where: productIds.map(uid => ({ id: uid })) }) : [];
      const newProductNames = selectedProducts.map(p => p.nombre).sort().join(', ');
      if (existingProductNames !== newProductNames) {
        changes.push(`- Productos: [${existingProductNames || 'Ninguno'}] -> [${newProductNames || 'Ninguno'}]`);
      }
    }

    const opportunity = await this.opportunityRepository.preload({
      id: id,
      ...dtoWithoutContacts,
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    let productsPriceSum = 0;
    if (productIds !== undefined) {
      if (productIds.length > 0) {
        const selectedProducts = await this.productRepository.find({
          where: productIds.map(uid => ({ id: uid }))
        });
        opportunity.products = selectedProducts;
        productsPriceSum = selectedProducts.reduce((sum, p) => sum + (Number(p.precioBase) || 0), 0);
      } else {
        opportunity.products = [];
      }
    } else {
      productsPriceSum = (existingOpportunity.products || []).reduce((sum, p) => sum + (Number(p.precioBase) || 0), 0);
    }

    let convertedProductsPrice = productsPriceSum;
    const currentMoneda = opportunity.moneda !== undefined ? opportunity.moneda : existingOpportunity.moneda;
    const currentTipoCambio = opportunity.tipoCambio !== undefined ? opportunity.tipoCambio : existingOpportunity.tipoCambio;

    if (currentMoneda === 'USD' && currentTipoCambio && Number(currentTipoCambio) > 0) {
      convertedProductsPrice = productsPriceSum / Number(currentTipoCambio);
    }

    opportunity.monto_total = (opportunity.monto_licenciamiento ?? existingOpportunity.monto_licenciamiento ?? 0) + (opportunity.monto_servicios ?? existingOpportunity.monto_servicios ?? 0) + convertedProductsPrice;

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

    // Registrar cambios en el historial (interacciones)
    if (changes.length > 0) {
      const comment = `El usuario ${username} modificó la oportunidad:\n${changes.join('\n')}`;
      await this.interactionsService.create({
        opportunity_id: id,
        comment,
      });

      // Solo notifica al ejecutivo asignado. Si la oportunidad no tiene ejecutivo, no notifica a nadie.
      if (savedOpportunity.ejecutivo_id) {
        if (updateOpportunityDto.ejecutivo_id !== undefined && updateOpportunityDto.ejecutivo_id !== existingOpportunity.ejecutivo_id) {
          await this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Asignación de Oportunidad',
            `Te han asignado la oportunidad "${savedOpportunity.nombre_proyecto}".`,
            'opportunity_assigned',
            savedOpportunity.id,
          );
        } else if (updateOpportunityDto.stage_id && updateOpportunityDto.stage_id !== originalStageId) {
          await this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Movimiento de Oportunidad',
            `La oportunidad "${savedOpportunity.nombre_proyecto}" fue movida a la etapa "${selectedStage?.strname || 'N/A'}".`,
            'opportunity_moved',
            savedOpportunity.id,
          );
        } else {
          await this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Oportunidad Actualizada',
            `Se han actualizado datos en la oportunidad "${savedOpportunity.nombre_proyecto}".`,
            'opportunity_updated',
            savedOpportunity.id,
          );
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
    file: Express.Multer.File,
    title?: string,
    date?: string,
  ): Promise<Opportunity> {
    await this.findOne(opportunityId);
    
    const relativePath = file.path.replace(/\\/g, '/');
    const filePath = await this.storageService.uploadFile(file.path, relativePath);

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

    await this.storageService.deleteFile(file.filePath);

    await this.opportunityFileRepository.remove(file);
    return this.findOne(opportunityId);
  }

  async downloadFile(filePath: string, fileName: string, res: Response): Promise<void> {
    return this.storageService.downloadFile(filePath, res, fileName);
  }

  async archive(id: string, archiveOpportunityDto: ArchiveOpportunityDto, user?: User): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const oldStatus = opportunity.archived;
    opportunity.archived = archiveOpportunityDto.archived;
    const saved = await this.opportunityRepository.save(opportunity);

    if (oldStatus !== archiveOpportunityDto.archived) {
      const username = user?.username || 'Sistema';
      const comment = `El usuario ${username} ${archiveOpportunityDto.archived ? 'archivó' : 'desarchivó'} la oportunidad.`;
      await this.interactionsService.create({
        opportunity_id: id,
        comment,
      });
    }
    return saved;
  }
}

