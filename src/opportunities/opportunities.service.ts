import { Injectable, Logger, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, FindOptionsWhere, Brackets } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityFile } from './entities/opportunity-file.entity';
import { OpportunityProduct } from './entities/opportunity-product.entity';
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
import { PipelinesGateway } from '../pipelines/pipelines.gateway';

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger('OpportunitiesService');
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(OpportunityFile)
    private readonly opportunityFileRepository: Repository<OpportunityFile>,
    @InjectRepository(OpportunityProduct)
    private readonly opportunityProductRepository: Repository<OpportunityProduct>,
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
    private readonly pipelinesGateway: PipelinesGateway,
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto, user?: User): Promise<Opportunity> {
    const { contactIds, productIds, productItems, ...dtoWithoutContacts } = createOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;

    // Resolver productos con cantidades
    let productsPriceSum = 0;
    let resolvedProductItems: Array<{ productId: string; cantidad: number; precioBase: number }> = [];

    if (productItems && productItems.length > 0) {
      // Nuevo formato: { productId, cantidad }
      const ids = productItems.map(pi => pi.productId);
      const products = await this.productRepository.find({ where: ids.map(id => ({ id })) });
      const productMap = new Map(products.map(p => [p.id, p]));
      for (const pi of productItems) {
        const product = productMap.get(pi.productId);
        if (product) {
          const qty = pi.cantidad || 1;
          resolvedProductItems.push({ productId: product.id, cantidad: qty, precioBase: Number(product.precioBase) || 0 });
          productsPriceSum += qty * (Number(product.precioBase) || 0);
        }
      }
    } else if (productIds && productIds.length > 0) {
      // Formato legacy: array de UUIDs (cantidad = 1 por defecto)
      const selectedProducts = await this.productRepository.find({ where: productIds.map(id => ({ id })) });
      for (const p of selectedProducts) {
        resolvedProductItems.push({ productId: p.id, cantidad: 1, precioBase: Number(p.precioBase) || 0 });
        productsPriceSum += Number(p.precioBase) || 0;
      }
    }

    let convertedProductsPrice = productsPriceSum;
    if (dtoWithoutContacts.moneda === 'USD' && dtoWithoutContacts.tipoCambio && Number(dtoWithoutContacts.tipoCambio) > 0) {
      convertedProductsPrice = productsPriceSum / Number(dtoWithoutContacts.tipoCambio);
    }

    let total = (Number(dtoWithoutContacts.monto_licenciamiento) || 0) + (Number(dtoWithoutContacts.monto_servicios) || 0) + convertedProductsPrice;
    if (total === 0 && Number(dtoWithoutContacts.monto_total) > 0) {
      total = Number(dtoWithoutContacts.monto_total);
      if (!dtoWithoutContacts.monto_servicios && !dtoWithoutContacts.monto_licenciamiento) {
        (dtoWithoutContacts as any).monto_servicios = total;
      }
    }
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

    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    // Validar e inyectar valores por defecto para linea_negocio_id
    if (!opportunityData.linea_negocio_id || opportunityData.linea_negocio_id === 'default') {
      const blRepo = this.opportunityRepository.manager.getRepository(BusinessLineOption);
      const defaultBL = await blRepo.findOne({
        where: { blnstatus: true },
        order: { strname: 'ASC' }
      });
      opportunityData.linea_negocio_id = defaultBL ? defaultBL.id : null;
    } else if (!isUuid(opportunityData.linea_negocio_id)) {
      throw new BadRequestException('El ID de Línea de negocio no tiene un formato UUID válido.');
    }

    // Validar e inyectar valores por defecto para tipo_entrega_id
    if (!opportunityData.tipo_entrega_id || opportunityData.tipo_entrega_id === 'default') {
      const dtRepo = this.opportunityRepository.manager.getRepository(DeliveryTypeOption);
      const defaultDT = await dtRepo.findOne({
        where: { blnstatus: true },
        order: { strname: 'ASC' }
      });
      opportunityData.tipo_entrega_id = defaultDT ? defaultDT.id : null;
    } else if (!isUuid(opportunityData.tipo_entrega_id)) {
      throw new BadRequestException('El ID de Tipo de entrega no tiene un formato UUID válido.');
    }

    // Validar e inyectar valores por defecto para licenciamiento_id
    if (!opportunityData.licenciamiento_id || opportunityData.licenciamiento_id === 'default') {
      const licRepo = this.opportunityRepository.manager.getRepository(LicensingOption);
      const defaultLic = await licRepo.findOne({
        where: { blnstatus: true },
        order: { strname: 'ASC' }
      });
      opportunityData.licenciamiento_id = defaultLic ? defaultLic.id : null;
    } else if (!isUuid(opportunityData.licenciamiento_id)) {
      throw new BadRequestException('El ID de Licenciamiento no tiene un formato UUID válido.');
    }

    // Validar formato de cliente_id y ejecutivo_id si existen
    if (opportunityData.cliente_id && !isUuid(opportunityData.cliente_id)) {
      throw new BadRequestException('El ID de Cliente no tiene un formato UUID válido.');
    }
    if (opportunityData.ejecutivo_id && !isUuid(opportunityData.ejecutivo_id)) {
      throw new BadRequestException('El ID de Ejecutivo no tiene un formato UUID válido.');
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

    // Guardar OpportunityProducts con cantidad
    if (resolvedProductItems.length > 0) {
      const oppProducts = resolvedProductItems.map(pi => this.opportunityProductRepository.create({
        opportunityId: savedOpportunity.id,
        productId: pi.productId,
        cantidad: pi.cantidad,
      }));
      await this.opportunityProductRepository.save(oppProducts);
    }

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
      const creatorName = user?.username || 'Sistema';
      const assignMessage = `Te han asignado la oportunidad <strong>${savedOpportunity.nombre_proyecto}</strong>. El usuario <strong>${creatorName}</strong> creó la oportunidad y te asignó como ejecutivo responsable.`;

      await this.notificationsService.createAndSendNotification(
        savedOpportunity.ejecutivo_id,
        'Nueva Oportunidad Creada',
        assignMessage,
        'opportunity_created',
        savedOpportunity.id,
      );
    }

    // Cargar la relación stage completa antes de retornar
    const fullOpportunity = await this.findOne(savedOpportunity.id);
    this.pipelinesGateway.emitOpportunityCreated(fullOpportunity);
    return fullOpportunity;
  }

  findAll(
    stage_id?: string,
    showArchived = false,
    startDate?: string,
    endDate?: string,
  ): Promise<Opportunity[]> {
    const currentYear = new Date().getFullYear();
    const excludedStageNames = ['Ganada', 'Perdida', 'Cancelada', 'Standby'];

    const qb = this.opportunityRepository.createQueryBuilder('opportunity');

    qb.leftJoinAndSelect('opportunity.cliente', 'cliente')
      .leftJoinAndSelect('opportunity.ejecutivo', 'ejecutivo')
      .leftJoinAndSelect('opportunity.company', 'company')
      .leftJoinAndSelect('opportunity.contacts', 'contacts')
      .leftJoinAndSelect('opportunity.stage', 'stage')
      .leftJoinAndSelect('opportunity.opportunityProducts', 'opportunityProducts')
      .leftJoinAndSelect('opportunityProducts.product', 'product')
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

    if (startDate) {
      qb.andWhere('opportunity.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      qb.andWhere('opportunity.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });
    }

    return qb.getMany();
  }

  async findAllUnfiltered(currentUser: User): Promise<Opportunity[]> {
    const currentUserId = currentUser?.id || (currentUser as any)?.userId;
    const userRole = currentUser?.role || (currentUser as any)?.userRole || (currentUser as any)?.role;

    const roleStr = String(userRole || '').toLowerCase();
    const where: FindOptionsWhere<Opportunity> = {};

    if (roleStr !== 'admin' && roleStr !== 'superadmin') {
      if (currentUserId) {
        where.ejecutivo_id = currentUserId;
      }
    }



    const findOptions: FindManyOptions<Opportunity> = {
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage', 'opportunityProducts', 'opportunityProducts.product'],
      where,
    };
    return this.opportunityRepository.find(findOptions);
  }


  async findOne(id: string): Promise<Opportunity> {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found (invalid UUID format)`);
    }
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['cliente', 'ejecutivo', 'company', 'contacts', 'stage', 'opportunityProducts', 'opportunityProducts.product'],
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    return opportunity;
  }

  async findByClientId(clientId: string): Promise<Opportunity[]> {
    if (!clientId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
      return [];
    }
    return this.opportunityRepository.createQueryBuilder('opportunity')
      .leftJoin('opportunity.contacts', 'contact')
      .leftJoinAndSelect('opportunity.stage', 'stage')
      .where('opportunity.cliente_id = :clientId', { clientId })
      .orWhere('contact.id = :clientId', { clientId })
      .getMany();
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto, user?: User): Promise<Opportunity> {
    const existingOpportunity = await this.findOne(id);
    if (!existingOpportunity) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }

    const originalStageId = existingOpportunity.stage_id;
    const originalStageName = existingOpportunity.stage ? existingOpportunity.stage.strname : 'N/A';
    const { contactIds, productIds, productItems, ...dtoWithoutContacts } = updateOpportunityDto;
    delete (dtoWithoutContacts as any).stage_entered_at;

    // Detectar cambios antes de aplicar el preload
    const changes: string[] = [];
    const username = user?.username || 'Sistema';
    let oldEjecutivoName = 'Sin asignar';
    let newEjecutivoName = 'Sin asignar';

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
    const auditPromises: Promise<any>[] = [];

    const isStageChanged = updateOpportunityDto.stage_id !== undefined && updateOpportunityDto.stage_id !== existingOpportunity.stage_id;
    const isPipelineChanged = updateOpportunityDto.pipeline_id !== undefined && updateOpportunityDto.pipeline_id !== existingOpportunity.pipeline_id;
    const isEjecutivoChanged = updateOpportunityDto.ejecutivo_id !== undefined && updateOpportunityDto.ejecutivo_id !== existingOpportunity.ejecutivo_id;
    const isClienteChanged = updateOpportunityDto.cliente_id !== undefined && updateOpportunityDto.cliente_id !== existingOpportunity.cliente_id;
    const isCompanyChanged = updateOpportunityDto.companyId !== undefined && updateOpportunityDto.companyId !== existingOpportunity.companyId;
    const isLineaNegocioChanged = updateOpportunityDto.linea_negocio_id !== undefined && updateOpportunityDto.linea_negocio_id !== existingOpportunity.linea_negocio_id;
    const isTipoEntregaChanged = updateOpportunityDto.tipo_entrega_id !== undefined && updateOpportunityDto.tipo_entrega_id !== existingOpportunity.tipo_entrega_id;
    const isLicenciamientoChanged = updateOpportunityDto.licenciamiento_id !== undefined && updateOpportunityDto.licenciamiento_id !== existingOpportunity.licenciamiento_id;

    const [
      oldStage, newStage,
      oldPipeline, newPipeline,
      oldEjecutivo, newEjecutivo,
      newCliente, newCompany,
      newLineaNegocio, newTipoEntrega, newLicenciamiento
    ] = await Promise.all([
      isStageChanged ? this.stageRepository.findOne({ where: { id: existingOpportunity.stage_id } }) : null,
      isStageChanged ? this.stageRepository.findOne({ where: { id: updateOpportunityDto.stage_id } }) : null,
      isPipelineChanged ? this.pipelineRepository.findOne({ where: { id: existingOpportunity.pipeline_id } }) : null,
      isPipelineChanged ? this.pipelineRepository.findOne({ where: { id: updateOpportunityDto.pipeline_id } }) : null,
      isEjecutivoChanged && existingOpportunity.ejecutivo_id ? this.usersService.findOneById(existingOpportunity.ejecutivo_id).catch(() => null) : null,
      isEjecutivoChanged && updateOpportunityDto.ejecutivo_id ? this.usersService.findOneById(updateOpportunityDto.ejecutivo_id).catch(() => null) : null,
      isClienteChanged && updateOpportunityDto.cliente_id ? this.clientRepository.findOne({ where: { id: updateOpportunityDto.cliente_id } }) : null,
      isCompanyChanged && updateOpportunityDto.companyId ? this.clientRepository.manager.getRepository(Company).findOne({ where: { id: updateOpportunityDto.companyId } }) : null,
      isLineaNegocioChanged && updateOpportunityDto.linea_negocio_id ? this.opportunityRepository.manager.getRepository(BusinessLineOption).findOne({ where: { id: updateOpportunityDto.linea_negocio_id } }) : null,
      isTipoEntregaChanged && updateOpportunityDto.tipo_entrega_id ? this.opportunityRepository.manager.getRepository(DeliveryTypeOption).findOne({ where: { id: updateOpportunityDto.tipo_entrega_id } }) : null,
      isLicenciamientoChanged && updateOpportunityDto.licenciamiento_id ? this.opportunityRepository.manager.getRepository(LicensingOption).findOne({ where: { id: updateOpportunityDto.licenciamiento_id } }) : null,
    ]);

    if (isStageChanged) {
      changes.push(`- Etapa: "${oldStage?.strname || 'N/A'}" -> "${newStage?.strname || 'N/A'}"`);
    }
    if (isPipelineChanged) {
      changes.push(`- Pipeline: "${oldPipeline?.strname || 'N/A'}" -> "${newPipeline?.strname || 'N/A'}"`);
    }
    if (isEjecutivoChanged) {
      oldEjecutivoName = oldEjecutivo?.username || 'Sin asignar';
      newEjecutivoName = newEjecutivo?.username || 'Sin asignar';
      changes.push(`- Ejecutivo: "${oldEjecutivoName}" -> "${newEjecutivoName}"`);
    }
    if (isClienteChanged) {
      const oldCliente = existingOpportunity.cliente;
      const oldClienteName = oldCliente ? `${oldCliente.nombre} ${oldCliente.apellido}` : 'N/A';
      const newClienteName = newCliente ? `${newCliente.nombre} ${newCliente.apellido}` : 'N/A';
      changes.push(`- Cliente: "${oldClienteName}" -> "${newClienteName}"`);
    }
    if (isCompanyChanged) {
      const oldCompany = existingOpportunity.company;
      changes.push(`- Empresa: "${oldCompany?.nombre || 'N/A'}" -> "${newCompany?.nombre || 'N/A'}"`);
    }
    if (isLineaNegocioChanged) {
      const oldOption = existingOpportunity.linea_negocio;
      changes.push(`- ${labelLineaNegocio}: "${oldOption?.strname || 'N/A'}" -> "${newLineaNegocio?.strname || 'N/A'}"`);
    }
    if (isTipoEntregaChanged) {
      const oldOption = existingOpportunity.tipo_entrega;
      changes.push(`- ${labelTipoEntrega}: "${oldOption?.strname || 'N/A'}" -> "${newTipoEntrega?.strname || 'N/A'}"`);
    }
    if (isLicenciamientoChanged) {
      const oldOption = existingOpportunity.licenciamiento;
      changes.push(`- ${labelLicenciamiento}: "${oldOption?.strname || 'N/A'}" -> "${newLicenciamiento?.strname || 'N/A'}"`);
    }
    const hasProductChanges = productItems !== undefined || productIds !== undefined;
    if (hasProductChanges) {
      const existingProductNames = (existingOpportunity.opportunityProducts || []).map(op => op.product?.nombre || '').sort().join(', ');
      let newProductNames = existingProductNames;
      if (productItems && productItems.length > 0) {
        const ids = productItems.map(pi => pi.productId);
        const products = await this.productRepository.find({ where: ids.map(uid => ({ id: uid })) });
        newProductNames = products.map(p => p.nombre).sort().join(', ');
      } else if (productIds && productIds.length > 0) {
        const products = await this.productRepository.find({ where: productIds.map(uid => ({ id: uid })) });
        newProductNames = products.map(p => p.nombre).sort().join(', ');
      } else {
        newProductNames = '';
      }
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
    if (hasProductChanges) {
      // Eliminar productos actuales
      await this.opportunityProductRepository.delete({ opportunityId: id });

      if (productItems && productItems.length > 0) {
        const ids = productItems.map(pi => pi.productId);
        const products = await this.productRepository.find({ where: ids.map(uid => ({ id: uid })) });
        const productMap = new Map(products.map(p => [p.id, p]));
        const newOppProducts = productItems
          .filter(pi => productMap.has(pi.productId))
          .map(pi => this.opportunityProductRepository.create({
            opportunityId: id,
            productId: pi.productId,
            cantidad: pi.cantidad || 1,
          }));
        await this.opportunityProductRepository.save(newOppProducts);
        productsPriceSum = productItems.reduce((sum, pi) => {
          const product = productMap.get(pi.productId);
          return sum + ((pi.cantidad || 1) * (Number(product?.precioBase) || 0));
        }, 0);
      } else if (productIds && productIds.length > 0) {
        // Formato legacy: array de UUIDs (cantidad = 1)
        const products = await this.productRepository.find({ where: productIds.map(uid => ({ id: uid })) });
        const newOppProducts = products.map(p => this.opportunityProductRepository.create({
          opportunityId: id,
          productId: p.id,
          cantidad: 1,
        }));
        await this.opportunityProductRepository.save(newOppProducts);
        productsPriceSum = products.reduce((sum, p) => sum + (Number(p.precioBase) || 0), 0);
      }
    } else {
      productsPriceSum = (existingOpportunity.opportunityProducts || []).reduce((sum, op) => {
        return sum + (Number(op.cantidad || 1) * (Number(op.product?.precioBase) || 0));
      }, 0);
    }

    let convertedProductsPrice = productsPriceSum;
    const currentMoneda = opportunity.moneda !== undefined ? opportunity.moneda : existingOpportunity.moneda;
    const currentTipoCambio = opportunity.tipoCambio !== undefined ? opportunity.tipoCambio : existingOpportunity.tipoCambio;

    let total = (Number(opportunity.monto_licenciamiento ?? existingOpportunity.monto_licenciamiento) || 0) + (Number(opportunity.monto_servicios ?? existingOpportunity.monto_servicios) || 0) + convertedProductsPrice;
    if (total === 0 && Number(updateOpportunityDto.monto_total) > 0) {
      total = Number(updateOpportunityDto.monto_total);
      if (updateOpportunityDto.monto_servicios === undefined && updateOpportunityDto.monto_licenciamiento === undefined) {
        opportunity.monto_servicios = total;
      }
    } else if (updateOpportunityDto.monto_total !== undefined && Number(updateOpportunityDto.monto_total) > 0 && updateOpportunityDto.monto_licenciamiento === undefined && updateOpportunityDto.monto_servicios === undefined) {
      total = Number(updateOpportunityDto.monto_total);
      if (!opportunity.monto_servicios && !opportunity.monto_licenciamiento) {
        opportunity.monto_servicios = total;
      }
    }

    opportunity.monto_total = total;

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

    // Registrar cambios e interacciones en segundo plano para no bloquear la respuesta HTTP (TTFB fast)
    if (changes.length > 0) {
      const comment = `El usuario ${username} modificó la oportunidad:\n${changes.join('\n')}`;
      this.interactionsService.create({
        opportunity_id: id,
        comment,
      }).catch(err => this.logger.error(`Error al registrar interacción en segundo plano: ${err.message}`));

      // Solo notifica al ejecutivo asignado. Si la oportunidad no tiene ejecutivo, no notifica a nadie.
      if (savedOpportunity.ejecutivo_id) {
        const notificationChanges = changes.map(c => c.replace(/\s*->\s*/, ' a ').replace(/^- /, '• '));
        const changesText = notificationChanges.join('\n');
        const detailMessage = `El usuario ${username} modificó la oportunidad "${savedOpportunity.nombre_proyecto}":\n${changesText}`;

        if (updateOpportunityDto.ejecutivo_id !== undefined && updateOpportunityDto.ejecutivo_id !== existingOpportunity.ejecutivo_id) {
          const assignMessage = `Te han asignado la oportunidad <strong>${savedOpportunity.nombre_proyecto}</strong>. El usuario <strong>${username}</strong> modificó la oportunidad ${savedOpportunity.nombre_proyecto}.<br/><br/>Ejecutivo: de <strong>${oldEjecutivoName} -> ${newEjecutivoName}</strong>.`;

          this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Asignación de Oportunidad',
            assignMessage,
            'opportunity_assigned',
            savedOpportunity.id,
          ).catch(err => this.logger.error(`Error al enviar notificación de asignación: ${err.message}`));
        } else if (updateOpportunityDto.stage_id && updateOpportunityDto.stage_id !== originalStageId) {
          const newStageName = selectedStage ? selectedStage.strname : 'N/A';
          const moveMessage = `El usuario <strong>${username}</strong> realizó una actualización en la oportunidad <strong>${savedOpportunity.nombre_proyecto}</strong>.<br/><br/><strong>Cambio realizado:</strong><br/><br/>Etapa: de <strong>${originalStageName} -> ${newStageName}</strong>.<br/><br/>Ingresa a la plataforma para ver el detalle del movimiento.`;

          this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Movimiento de Oportunidad',
            moveMessage,
            'opportunity_moved',
            savedOpportunity.id,
          ).catch(err => this.logger.error(`Error al enviar notificación de movimiento: ${err.message}`));
        } else {
          const formattedChanges = changes.map(c => {
            let cleaned = c.replace(/^- /, '');
            const parts = cleaned.split(/\s*->\s*/);
            if (parts.length === 2) {
              const colonIndex = parts[0].indexOf(':');
              if (colonIndex !== -1) {
                const label = parts[0].substring(0, colonIndex).trim();
                const originalVal = parts[0].substring(colonIndex + 1).replace(/"/g, '').trim();
                const newVal = parts[1].replace(/"/g, '').trim();
                return `${label}: de <strong>${originalVal} -> ${newVal}</strong>.`;
              }
            }
            return cleaned;
          }).join('<br/>');

          const updateMessage = `El usuario <strong>${username}</strong> realizó una actualización en la oportunidad <strong>${savedOpportunity.nombre_proyecto}</strong>.<br/><br/><strong>Cambio realizado:</strong><br/><br/>${formattedChanges}<br/><br/>Ingresa a la plataforma para revisar los cambios y dar el seguimiento correspondiente, si es necesario.`;

          this.notificationsService.createAndSendNotification(
            savedOpportunity.ejecutivo_id,
            'Oportunidad Actualizada',
            updateMessage,
            'opportunity_updated',
            savedOpportunity.id,
          ).catch(err => this.logger.error(`Error al enviar notificación de actualización: ${err.message}`));
        }
      }
    }

    const fullOpportunity = await this.findOne(savedOpportunity.id);
    this.pipelinesGateway.emitOpportunityUpdated(fullOpportunity);
    return fullOpportunity;
  }

  async remove(id: string): Promise<void> {
    const result = await this.opportunityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Opportunity with ID "${id}" not found`);
    }
    this.pipelinesGateway.emitOpportunityDeleted(id);
  }

  async addOpportunityFile(
    opportunityId: string,
    fileName: string,
    file: Express.Multer.File,
    user: User,
    title?: string,
    date?: string,
  ): Promise<Opportunity> {
    const opportunity = await this.findOne(opportunityId);
    
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

    // Registrar en el historial
    const username = user?.username || 'Sistema';
    await this.interactionsService.create({
      opportunity_id: opportunityId,
      comment: `El usuario ${username} subió el archivo "${fileName}".`,
    });

    // Notificar al ejecutivo asignado
    if (opportunity.ejecutivo_id) {
      await this.notificationsService.createAndSendNotification(
        opportunity.ejecutivo_id,
        'Archivo Agregado a Oportunidad',
        `El usuario ${username} agregó el archivo "${fileName}" a la oportunidad "${opportunity.nombre_proyecto}".`,
        'opportunity_file_added',
        opportunity.id,
      );
    }

    const fullOpportunity = await this.findOne(opportunityId);
    this.pipelinesGateway.emitOpportunityUpdated(fullOpportunity);
    return fullOpportunity;
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

  async deleteOpportunityFile(opportunityId: string, fileId: string, user: User): Promise<Opportunity> {
    const opportunity = await this.findOne(opportunityId);
    const file = await this.getOpportunityFile(opportunityId, fileId);

    await this.storageService.deleteFile(file.filePath);

    await this.opportunityFileRepository.remove(file);

    // Registrar en el historial
    const username = user?.username || 'Sistema';
    await this.interactionsService.create({
      opportunity_id: opportunityId,
      comment: `El usuario ${username} eliminó el archivo "${file.fileName}".`,
    });

    // Notificar al ejecutivo asignado
    if (opportunity.ejecutivo_id) {
      const deleteMessage = `El usuario <strong>${username}</strong> eliminó el archivo:<br/><strong>${file.fileName}</strong> de la oportunidad <strong>${opportunity.nombre_proyecto}</strong>.<br/><br/>Si este archivo era necesario para el seguimiento de la oportunidad, ingresa a la plataforma para revisar el historial de cambios o realizar las acciones correspondientes.`;

      await this.notificationsService.createAndSendNotification(
        opportunity.ejecutivo_id,
        'Archivo Eliminado de Oportunidad',
        deleteMessage,
        'opportunity_file_deleted',
        opportunity.id,
      );
    }

    const fullOpportunity = await this.findOne(opportunityId);
    this.pipelinesGateway.emitOpportunityUpdated(fullOpportunity);
    return fullOpportunity;
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
    const fullOpportunity = await this.findOne(saved.id);
    this.pipelinesGateway.emitOpportunityUpdated(fullOpportunity);
    return fullOpportunity;
  }
}

