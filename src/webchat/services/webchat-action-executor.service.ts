import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { OpportunitiesService } from '../../opportunities/opportunities.service';
import { ActivitiesService } from '../../activities/activities.service';
import { TicketsService } from '../../tickets/tickets.service';
import { ClientsService } from '../../clients/clients.service';
import { CompaniesService } from '../../companies/companies.service';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../role.enum';
import { BusinessLineOption } from '../../opportunities/entities/business-line-option.entity';
import { DeliveryTypeOption } from '../../opportunities/entities/delivery-type-option.entity';
import { LicensingOption } from '../../opportunities/entities/licensing-option.entity';
import { OpportunityLabel } from '../../opportunities/entities/opportunity-label.entity';
import { TypeActivity } from '../../activities/entities/type-activity.entity';
import { Client } from '../../clients/entities/client.entity';
import { Company } from '../../companies/entities/company.entity';
import { Opportunity, Currency } from '../../opportunities/entities/opportunity.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { Product } from '../../products/entities/product.entity';
import { WebchatActionPlan, WebchatResponse, ConversationHistoryMessage } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatActionExecutorService {
  private readonly logger = new Logger('WebchatActionExecutorService');

  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly ticketsService: TicketsService,
    private readonly clientsService: ClientsService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    @InjectRepository(BusinessLineOption)
    private readonly businessLineRepo: Repository<BusinessLineOption>,
    @InjectRepository(DeliveryTypeOption)
    private readonly deliveryTypeRepo: Repository<DeliveryTypeOption>,
    @InjectRepository(LicensingOption)
    private readonly licensingRepo: Repository<LicensingOption>,
    @InjectRepository(OpportunityLabel)
    private readonly opportunityLabelRepo: Repository<OpportunityLabel>,
    @InjectRepository(TypeActivity)
    private readonly typeActivityRepo: Repository<TypeActivity>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  /**
   * Obtiene la zona horaria del sistema desde la variable de entorno NOTIFICATION_TIMEZONE.
   */
  getTimezone(): string {
    return process.env.NOTIFICATION_TIMEZONE || 'America/Mexico_City';
  }

  /**
   * Despacha la ejecución del plan de acción según el tipo de herramienta solicitada.
   * Si la acción viene incompleta debido a un flujo conversacional multi-turno,
   * fusiona los parámetros y entidades del historial reciente del usuario.
   */
  async executeAction(
    actionPlan: WebchatActionPlan,
    user: User,
    originalQuestion: string,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
    this.logger.log(`[WebChat - Action Executor] Ejecutando acción '${actionPlan.action}' para usuario ${user.username} (Rol: ${user.role})`);
    let params = actionPlan.parameters || {};

    // Si faltan datos en params, enriquecer con el contexto previo de la conversación
    if (conversationHistory && conversationHistory.length > 0) {
      params = this.mergeHistoryContext(actionPlan.action, params, conversationHistory);
    }

    switch (actionPlan.action) {
      case 'createOpportunity':
        return this.handleCreateOpportunity(params, user);
      case 'modifyOpportunity':
        return this.handleModifyOpportunity(params, user);
      case 'createActivity':
        return this.handleCreateActivity(params, user);
      case 'modifyActivity':
        return this.handleModifyActivity(params, user);
      case 'createTicket':
        return this.handleCreateTicket(params, user);
      default:
        return {
          answer: `No reconozco la acción '${(actionPlan as any).action}'. ¿Podrías indicarme qué deseas realizar?`,
        };
    }
  }

  /**
   * Fusiona datos de mensajes previos del usuario cuando responde en turnos sucesivos
   * a solicitudes de datos faltantes (ej: indicando tipo, fecha o cliente).
   */
  private mergeHistoryContext(
    action: string,
    params: any,
    conversationHistory: ConversationHistoryMessage[],
  ): any {
    const merged = { ...params };
    const userMessages = conversationHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .reverse();

    for (const msg of userMessages) {
      if (action === 'createActivity') {
        // 1. Extraer fecha/hora si no está presente
        if (!merged.date && !merged.fecha && !merged.hora && !merged.proposedDate) {
          const dateMatch = msg.match(/(?:para\s+el\s+|el\s+|para\s+)?(hoy|mañana|manana|pasado\s+mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|\d{1,2}\s+de\s+[a-z]+|\d{4}-\d{2}-\d{2})(?:\s+(?:a\s+las\s+|las\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i);
          if (dateMatch && dateMatch[0]) {
            merged.date = dateMatch[0].trim();
          }
        }

        // 2. Extraer texto entre comillas o detalle de actividad si falta
        if (!merged.activity && !merged.activityText && !merged.actividad && !merged.asunto && !merged.detalle && !merged.titulo) {
          const quoteMatch = msg.match(/["']([^"']{3,})["']/);
          if (quoteMatch && quoteMatch[1]) {
            merged.activity = quoteMatch[1].trim();
          }
        }

        // 3. Extraer cliente/empresa si falta
        if (!merged.cliente && !merged.empresa && !merged.client && !merged.company && !merged.cuenta) {
          const clientMatch = msg.match(/(?:con\s+el\s+cliente|con\s+la\s+empresa|con\s+el\s+contacto|para\s+el\s+cliente|para\s+la\s+empresa|con|para)\s+["']?([^"',]+?)["']?(?:\s+llamada|\s+titulada|\s+para|\s+el|\s+a\s+las|$)/i);
          if (clientMatch && clientMatch[1]) {
            const cand = clientMatch[1].trim();
            if (cand.length > 2 && !['seguimiento', 'reunion', 'llamada', 'visita', 'correo', 'demostracion'].includes(cand.toLowerCase())) {
              merged.cliente = cand;
            }
          }
        }

        // 4. Extraer tipo de actividad si falta
        if (!merged.tipoActividad && !merged.tipo_actividad && !merged.typeActivity && !merged.tipo) {
          const typeMatch = msg.match(/\b(reuni[oó]n|llamada|visita|demostraci[oó]n|demo)\b/i);
          if (typeMatch && typeMatch[1]) {
            merged.tipoActividad = typeMatch[1].trim();
          }
        }

        // 5. Extraer correo electrónico si fue solicitado o proporcionado
        if (!merged.correo && !merged.email) {
          const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) {
            merged.correo = emailMatch[0].trim();
          }
        }
      } else if (action === 'createOpportunity') {
        // Extraer nombreProyecto si falta
        if (!merged.nombreProyecto && !merged.nombre_proyecto && !merged.title && !merged.proyecto) {
          const quoteMatch = msg.match(/["']([^"']{3,})["']/);
          if (quoteMatch && quoteMatch[1]) {
            merged.nombreProyecto = quoteMatch[1].trim();
          }
        }
        // Extraer empresa/cliente si falta
        if (!merged.cliente && !merged.empresa && !merged.cuenta) {
          const empMatch = msg.match(/(?:para\s+el\s+cliente|para\s+la\s+empresa|cliente|empresa|cuenta)\s+["']?([^"',]+?)["']?/i);
          if (empMatch && empMatch[1]) {
            merged.empresa = empMatch[1].trim();
          }
        }
      }
    }

    return merged;
  }

  // ─── 1. OPORTUNIDADES ──────────────────────────────────────────────────────────

  /**
   * Obtiene los nombres de etiqueta dinámicos configurados para Oportunidades (GET /api/opportunity-labels).
   * Respeta los nombres personalizados configurados por la organización para Línea de Negocio, Tipo de Entrega y Licenciamiento.
   */
  async getOpportunityCustomLabels(): Promise<{
    lineaNegocio: string;
    tipoEntrega: string;
    licenciamiento: string;
  }> {
    const defaultLabels = {
      lineaNegocio: 'Línea de Negocio',
      tipoEntrega: 'Tipo de Entrega',
      licenciamiento: 'Licenciamiento',
    };

    try {
      const labels = await this.opportunityLabelRepo.find({ where: { blnstatus: true } });
      for (const label of labels) {
        const key = (label.field_key || '').toLowerCase().trim();
        const name = (label.strname || '').trim();
        if (!name) continue;

        if (
          key === 'linea_negocio' ||
          (!key && (label.id === 'f509fa84-0b73-45f8-b3ab-b8471e98822e' || name.toLowerCase().includes('linea') || name.toLowerCase().includes('negocio')))
        ) {
          defaultLabels.lineaNegocio = name;
        } else if (
          key === 'tipo_entrega' ||
          (!key && (label.id === '7d90d810-74d3-4613-882d-8e814a029db5' || name.toLowerCase().includes('entrega') || name.toLowerCase().includes('servicio')))
        ) {
          defaultLabels.tipoEntrega = name;
        } else if (
          key === 'licenciamiento' ||
          (!key && (label.id === 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f' || name.toLowerCase().includes('licencia')))
        ) {
          defaultLabels.licenciamiento = name;
        }
      }
    } catch (e) {}

    return defaultLabels;
  }

  /**
   * Crea una oportunidad validando campos requeridos sin alucinar ni asignar datos al azar.
   * Si faltan datos indispensables (monto, cliente/empresa, línea de negocio, tipo de entrega),
   * solicita la información faltante al usuario mostrando las opciones activas disponibles
   * y utilizando los nombres dinámicos de etiqueta configurados en el CRM (GET /api/opportunity-labels).
   */
  async handleCreateOpportunity(params: any, user: User): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const missingFields: string[] = [];
    const customLabels = await this.getOpportunityCustomLabels();

    // 1. Asignación de Ejecutivo (RBAC)
    let targetExecutiveId = user.id;
    let targetExecutiveName = user.username;

    if (!isExec && (params.ejecutivo || params.ejecutivoId || params.responsable)) {
      const execSearch = params.ejecutivo || params.ejecutivoId || params.responsable;
      const foundUser = await this.resolveUser(execSearch);
      if (foundUser) {
        targetExecutiveId = foundUser.id;
        targetExecutiveName = foundUser.username;
      }
    }

    // 2. Nombre del Proyecto
    const nombreProyecto = (params.nombreProyecto || params.nombre_proyecto || params.title || params.proyecto || '').trim();
    if (!nombreProyecto || nombreProyecto.length < 3) {
      missingFields.push('• Nombre del Proyecto: Indica el nombre o concepto de la oportunidad (ej. "Implementación CRM", "Renovación de Licencias").');
    }

    // 3. Cliente y Empresa
    let clienteId: string | undefined = undefined;
    let companyId: string | undefined = undefined;
    let clientEntity: Client | null = null;
    let companyEntity: Company | null = null;

    const oppClientHint = (params.cliente || params.client || params.contacto || '').toString().trim();
    const oppCompanyHint = (params.empresa || params.company || params.cuenta || params.account || '').toString().trim();

    if (params.clienteId && this.isValidUuid(params.clienteId)) {
      clienteId = params.clienteId;
      clientEntity = await this.clientRepo.findOne({ where: { id: clienteId } });
      if (clientEntity?.companyId) companyId = clientEntity.companyId;
    } else if (oppClientHint) {
      clientEntity = await this.resolveClient(oppClientHint);
      if (clientEntity) {
        clienteId = clientEntity.id;
        if (clientEntity.companyId) companyId = clientEntity.companyId;
      } else {
        // Fallback: Si el usuario dijo "cliente X" pero X está registrado como Empresa
        companyEntity = await this.resolveCompany(oppClientHint);
        if (companyEntity) companyId = companyEntity.id;
      }
    }

    if (!companyId && params.companyId && this.isValidUuid(params.companyId)) {
      companyId = params.companyId;
      companyEntity = await this.companyRepo.findOne({ where: { id: companyId } });
    } else if (!companyId && oppCompanyHint) {
      companyEntity = await this.resolveCompany(oppCompanyHint);
      if (companyEntity) {
        companyId = companyEntity.id;
      } else if (!clientEntity) {
        clientEntity = await this.resolveClient(oppCompanyHint);
        if (clientEntity) {
          clienteId = clientEntity.id;
          if (clientEntity.companyId) companyId = clientEntity.companyId;
        }
      }
    }

    if (!clienteId && !companyId) {
      const hint = oppClientHint || oppCompanyHint;
      if (hint) {
        missingFields.push(`• Cliente / Empresa no encontrado: No encontré ningún cliente o empresa con el nombre "${hint}". Por favor verifica el nombre o indica una cuenta registrada.`);
      } else {
        missingFields.push('• Cliente o Empresa: Especifica a qué cliente o empresa pertenece la oportunidad.');
      }
    }

    // 4. Monto (Opcional: si no se especifica se mantiene en 0 o totalPrice de productos sin bloquear la creación)
    const resolvedProducts = await this.resolveProductItems(params);
    let montoTotal = this.parseNumeric(params.montoTotal ?? params.monto_total ?? params.monto ?? params.valor ?? params.precio);
    if (montoTotal === 0 && resolvedProducts.totalPrice > 0) {
      montoTotal = resolvedProducts.totalPrice;
    }

    // 5. Moneda
    const rawMoneda = (params.moneda || 'MXN').toUpperCase().trim();
    const moneda = rawMoneda === 'USD' ? Currency.USD : Currency.MXN;

    // 6. Línea de Negocio / Etiqueta Dinámica (validar contra catálogo real de la BD)
    const lineaNegocioHint =
      params.lineaNegocio ||
      params.linea_negocio ||
      params.linea_negocio_id ||
      params.linea ||
      params[customLabels.lineaNegocio] ||
      params[customLabels.lineaNegocio.toLowerCase()] ||
      params.division ||
      params.area;

    const resolvedBL = await this.resolveBusinessLine(lineaNegocioHint);
    if (!resolvedBL) {
      const activeBLs = await this.businessLineRepo.find({ where: { blnstatus: true }, order: { strname: 'ASC' } });
      const optionsStr = activeBLs.length > 0
        ? activeBLs.map(b => `  - ${b.strname}`).join('\n')
        : '  - General';
      missingFields.push(`• ${customLabels.lineaNegocio}: Selecciona una de las opciones activas en el CRM:\n${optionsStr}`);
    }

    // 7. Tipo de Entrega / Etiqueta Dinámica (validar contra catálogo real de la BD)
    const tipoEntregaHint =
      params.tipoEntrega ||
      params.tipo_entrega ||
      params.tipo_entrega_id ||
      params.entrega ||
      params[customLabels.tipoEntrega] ||
      params[customLabels.tipoEntrega.toLowerCase()] ||
      params.modalidad ||
      params.servicio;

    const resolvedDT = await this.resolveDeliveryType(tipoEntregaHint);
    if (!resolvedDT) {
      const activeDTs = await this.deliveryTypeRepo.find({ where: { blnstatus: true }, order: { strname: 'ASC' } });
      const optionsStr = activeDTs.length > 0
        ? activeDTs.map(d => `  - ${d.strname}`).join('\n')
        : '  - Estándar';
      missingFields.push(`• ${customLabels.tipoEntrega}: Selecciona una de las opciones disponibles:\n${optionsStr}`);
    }

    // 8. Licenciamiento / Etiqueta Dinámica (validar contra catálogo real de la BD)
    const licensingHint =
      params.licenciamiento ||
      params.licenciamiento_id ||
      params.licencia ||
      params.software ||
      params.suscripcion ||
      params.suscripción ||
      params[customLabels.licenciamiento] ||
      params[customLabels.licenciamiento.toLowerCase()];

    const resolvedLic = await this.resolveLicensing(licensingHint);
    if (!resolvedLic) {
      const activeLics = await this.licensingRepo.find({ where: { blnstatus: true }, order: { strname: 'ASC' } });
      const optionsStr = activeLics.length > 0
        ? activeLics.map(l => `  - ${l.strname}`).join('\n')
        : '  - Estándar';
      missingFields.push(`• ${customLabels.licenciamiento}: Selecciona una de las opciones disponibles:\n${optionsStr}`);
    }

    // 9. Si faltan datos requeridos, DETENER Y SOLICITAR INFORMACIÓN AL USUARIO
    if (missingFields.length > 0) {
      const oppLabel = nombreProyecto ? ` la oportunidad "${nombreProyecto}"` : ' una nueva oportunidad';
      const companyLabel = companyEntity ? ` para ${companyEntity.nombre}` : (clientEntity ? ` para ${clientEntity.nombre}` : '');
      return {
        answer: `Para poder crear${oppLabel}${companyLabel}, por favor indícame los siguientes datos requeridos:\n\n${missingFields.join('\n\n')}`,
      };
    }

    const description = (params.descripcion || params.description || `Creada vía WebChat interno por ${user.username}`).trim();

    let montoLic = this.parseNumeric(params.montoLicenciamiento ?? params.monto_licenciamiento ?? params[customLabels.licenciamiento] ?? params.licencia);
    let montoServ = this.parseNumeric(params.montoServicios ?? params.monto_servicios ?? params[customLabels.tipoEntrega] ?? params.servicios);

    if (montoLic > 0 || montoServ > 0) {
      montoTotal = montoLic + montoServ;
    } else if (montoTotal > 0 && montoLic === 0 && montoServ === 0) {
      montoServ = montoTotal;
    }

    // 10. Crear Oportunidad mediante OpportunitiesService con datos completos y reales
    const createdOpp = await this.opportunitiesService.create({
      nombre_proyecto: nombreProyecto,
      description,
      moneda,
      linea_negocio_id: resolvedBL!.id,
      tipo_entrega_id: resolvedDT!.id,
      licenciamiento_id: resolvedLic!.id,
      cliente_id: clienteId,
      companyId,
      ejecutivo_id: targetExecutiveId,
      monto_total: montoTotal,
      monto_licenciamiento: montoLic,
      monto_servicios: montoServ,
      productItems: resolvedProducts.items.length > 0 ? resolvedProducts.items : undefined,
      productIds: resolvedProducts.items.length > 0 ? resolvedProducts.items.map(i => i.productId) : undefined,
      priority: params.priority !== undefined ? Number(params.priority) : 1,
    } as any, { id: user.id } as User);

    const clientDisplay = clientEntity ? `${clientEntity.nombre} ${clientEntity.apellido || ''}`.trim() : (companyEntity ? companyEntity.nombre : 'Sin asignar');
    const montoDisplay = new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(createdOpp.monto_total || 0);

    return {
      answer: `Oportunidad Creada con Éxito\n\n- Proyecto: ${createdOpp.nombre_proyecto}\n- Monto: ${montoDisplay}\n- ${customLabels.lineaNegocio}: ${resolvedBL!.name}\n- ${customLabels.tipoEntrega}: ${resolvedDT!.name}\n- ${customLabels.licenciamiento}: ${resolvedLic!.name}\n- Cliente / Cuenta: ${clientDisplay}\n- Ejecutivo Asignado: ${targetExecutiveName}\n- Etapa: ${createdOpp.stage?.strname || 'Nueva Oportunidad'}`,
      data: [{
        'ID': createdOpp.id,
        'Proyecto': createdOpp.nombre_proyecto,
        'Monto': montoDisplay,
        [customLabels.lineaNegocio]: resolvedBL!.name,
        [customLabels.tipoEntrega]: resolvedDT!.name,
        [customLabels.licenciamiento]: resolvedLic!.name,
        'Cliente': clientDisplay,
        'Ejecutivo': targetExecutiveName,
      }],
      dashboardRedirect: {
        tab: 'commercial',
        pipelineId: createdOpp.pipeline_id,
        executiveId: targetExecutiveId,
      },
    };
  }

  /**
   * Modifica una oportunidad existente validando pertenencia (RBAC).
   */
  /**
   * Modifica una oportunidad existente validando pertenencia (RBAC).
   * Permite encontrar la oportunidad por ID, nombre, o por cuenta/empresa,
   * y actualizar monto total, monto de licenciamiento, monto de servicios, catálogos, etc.
   */
  async handleModifyOpportunity(params: any, user: User): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const customLabels = await this.getOpportunityCustomLabels();

    // 1. Identificar la Oportunidad
    let searchTitle = (
      params.nombreProyecto ||
      params.nombre_proyecto ||
      params.oportunidad ||
      params.opportunity ||
      params.opportunityName ||
      params.proyecto ||
      params.project ||
      params.targetOpportunity ||
      params.title ||
      params.nombre ||
      ''
    ).toString().replace(/^["']|["']$/g, '').trim();

    const companyHint = (params.empresa || params.company || params.cuenta || params.account || '').toString().replace(/^["']|["']$/g, '').trim();
    const clientHint = (params.cliente || params.client || params.contacto || '').toString().replace(/^["']|["']$/g, '').trim();

    let opp: Opportunity | null = null;

    if (params.id && this.isValidUuid(params.id)) {
      opp = await this.opportunityRepo.findOne({
        where: { id: params.id },
        relations: ['opportunityProducts', 'stage', 'cliente', 'company', 'linea_negocio', 'tipo_entrega', 'licenciamiento'],
      });
    }

    if (!opp && searchTitle) {
      const qb = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
        .leftJoinAndSelect('opp.linea_negocio', 'linea_negocio')
        .leftJoinAndSelect('opp.tipo_entrega', 'tipo_entrega')
        .leftJoinAndSelect('opp.licenciamiento', 'licenciamiento')
        .where('opp.archived = :archived', { archived: false })
        .andWhere('opp.nombre_proyecto ILIKE :title', { title: `%${searchTitle}%` });

      if (isExec) {
        qb.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
      }

      if (companyHint || clientHint) {
        const hint = companyHint || clientHint;
        qb.andWhere(
          '(opp.empresa ILIKE :hint OR company.nombre ILIKE :hint OR cliente.nombre ILIKE :hint)',
          { hint: `%${hint}%` }
        );
      }

      opp = await qb.orderBy('opp.createdAt', 'DESC').getOne();

      // Si no encontró con el filtro combinado de empresa, intentar solo por título
      if (!opp && (companyHint || clientHint)) {
        const qbFallback = this.opportunityRepo.createQueryBuilder('opp')
          .leftJoinAndSelect('opp.stage', 'stage')
          .leftJoinAndSelect('opp.cliente', 'cliente')
          .leftJoinAndSelect('opp.company', 'company')
          .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
          .where('opp.archived = :archived', { archived: false })
          .andWhere('opp.nombre_proyecto ILIKE :title', { title: `%${searchTitle}%` });

        if (isExec) {
          qbFallback.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
        }
        opp = await qbFallback.orderBy('opp.createdAt', 'DESC').getOne();
      }
    }

    // Si aún no encuentra y se especificó empresa/cliente, buscar la más reciente para esa cuenta
    if (!opp && (companyHint || clientHint)) {
      const hint = companyHint || clientHint;
      const qbAccount = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .where('opp.archived = :archived', { archived: false })
        .andWhere('(opp.empresa ILIKE :hint OR company.nombre ILIKE :hint OR cliente.nombre ILIKE :hint)', { hint: `%${hint}%` });

      if (isExec) {
        qbAccount.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
      }
      opp = await qbAccount.orderBy('opp.createdAt', 'DESC').getOne();
    }

    if (!opp) {
      const searchDisplay = searchTitle || companyHint || clientHint || params.id || 'los datos proporcionados';
      return {
        answer: `No encontré ninguna oportunidad activa que coincida con "${searchDisplay}". ¿Podrías verificar el nombre o ID?`,
      };
    }

    // 2. Validación de Permisos (RBAC para Ejecutivo)
    if (isExec && opp.ejecutivo_id !== user.id) {
      return {
        answer: `Acceso Denegado: No tienes permisos para modificar la oportunidad "${opp.nombre_proyecto}" porque está asignada a otro ejecutivo.`,
      };
    }

    // 3. Preparar campos a actualizar
    const updateData: any = {};

    // A. Nombre y descripción
    const newName =
      params.nuevoNombre ||
      params.newTitle ||
      params.nuevoTitulo ||
      params.nuevoProyecto ||
      params.newName ||
      params.nombreNuevo ||
      (params.id && (params.nombreProyecto || params.nombre_proyecto));

    if (newName) updateData.nombre_proyecto = newName.trim();
    if (params.descripcion || params.description) updateData.description = (params.descripcion || params.description).trim();

    // B. Montos (Licenciamiento, Servicios y Total)
    let montoLic = this.parseNumeric(
      params.montoLicenciamiento ??
      params.monto_licenciamiento ??
      params.licenciamiento ??
      params[customLabels.licenciamiento] ??
      params[customLabels.licenciamiento.toLowerCase()] ??
      params.montoLicencia ??
      params.software
    );

    let montoServ = this.parseNumeric(
      params.montoServicios ??
      params.monto_servicios ??
      params.servicios ??
      params[customLabels.tipoEntrega] ??
      params[customLabels.tipoEntrega.toLowerCase()] ??
      params.montoServicio
    );

    const genericAmount = this.parseNumeric(
      params.montoTotal ??
      params.monto ??
      params.monto_total ??
      params.valor ??
      params.cantidad ??
      params.precio
    );

    let hasLicAmountUpdate = false;
    let hasServAmountUpdate = false;

    // Buscar en todas las llaves y valores de params si se indicó licenciamiento o servicios
    for (const [k, v] of Object.entries(params)) {
      if (['id', 'nombreproyecto', 'nombre_proyecto', 'oportunidad', 'proyecto'].includes(k.toLowerCase())) continue;
      const keyLower = k.toLowerCase();
      const valStr = String(v || '').toLowerCase();
      const isLic = keyLower.includes('licenc') || keyLower.includes('lincenc') || keyLower.includes('software') || keyLower === customLabels.licenciamiento.toLowerCase() || valStr.includes('licenc') || valStr.includes('lincenc') || valStr.includes('software');
      const isServ = keyLower.includes('servic') || keyLower.includes('entrega') || keyLower === customLabels.tipoEntrega.toLowerCase() || valStr.includes('servic') || valStr.includes('entrega');

      const extractedNum = this.parseNumeric(v);
      if (extractedNum > 0) {
        if (isLic) {
          montoLic = extractedNum;
          hasLicAmountUpdate = true;
        } else if (isServ) {
          montoServ = extractedNum;
          hasServAmountUpdate = true;
        }
      }
    }

    if (montoLic > 0) {
      updateData.monto_licenciamiento = montoLic;
      hasLicAmountUpdate = true;
    }

    if (montoServ > 0) {
      updateData.monto_servicios = montoServ;
      hasServAmountUpdate = true;
    }

    if (genericAmount > 0) {
      if (!hasLicAmountUpdate && !hasServAmountUpdate) {
        const paramsStr = JSON.stringify(params).toLowerCase();
        if (paramsStr.includes('licenc') || paramsStr.includes('lincenc') || paramsStr.includes('software')) {
          updateData.monto_licenciamiento = genericAmount;
          hasLicAmountUpdate = true;
        } else if (paramsStr.includes('servic') || paramsStr.includes('entrega')) {
          updateData.monto_servicios = genericAmount;
          hasServAmountUpdate = true;
        } else {
          updateData.monto_total = genericAmount;
          updateData.monto_servicios = genericAmount;
        }
      }
    }

    if (hasLicAmountUpdate || hasServAmountUpdate) {
      const currentLic = updateData.monto_licenciamiento !== undefined ? updateData.monto_licenciamiento : (Number(opp.monto_licenciamiento) || 0);
      const currentServ = updateData.monto_servicios !== undefined ? updateData.monto_servicios : (Number(opp.monto_servicios) || 0);
      updateData.monto_total = currentLic + currentServ;
    }

    if (params.moneda) updateData.moneda = params.moneda.toUpperCase() === 'USD' ? Currency.USD : Currency.MXN;

    // E. Catálogos Dinámicos
    const blHint = params.lineaNegocio || params.linea_negocio || params[customLabels.lineaNegocio] || params.division;
    if (blHint) {
      const resolvedBL = await this.resolveBusinessLine(blHint);
      if (resolvedBL) updateData.linea_negocio_id = resolvedBL.id;
    }

    const dtHint = params.tipoEntrega || params.tipo_entrega || params[customLabels.tipoEntrega] || params.modalidad;
    if (dtHint) {
      const resolvedDT = await this.resolveDeliveryType(dtHint);
      if (resolvedDT) updateData.tipo_entrega_id = resolvedDT.id;
    }

    // F. Reasignación de ejecutivo (Solo Admin)
    if (!isExec && (params.ejecutivo || params.ejecutivoId)) {
      const foundUser = await this.resolveUser(params.ejecutivo || params.ejecutivoId);
      if (foundUser) updateData.ejecutivo_id = foundUser.id;
    }

    // G. Productos agregados o modificados
    if (params.nombreProducto || params.productItems) {
      const resolved = await this.resolveProductItems(params);
      if (resolved.items.length > 0) {
        updateData.productItems = resolved.items;
      }
    }

    const updatedOpp = await this.opportunitiesService.update(opp.id, updateData, { id: user.id } as User);
    const montoDisplay = new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_total || 0);
    const montoLicDisplay = updatedOpp.monto_licenciamiento ? `\n- Monto ${customLabels.licenciamiento}: ` + new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_licenciamiento) : '';
    const montoServDisplay = updatedOpp.monto_servicios ? `\n- Monto ${customLabels.tipoEntrega}: ` + new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_servicios) : '';

    return {
      answer: `Oportunidad Modificada Exitosamente\n\n- Proyecto: ${updatedOpp.nombre_proyecto}\n- Monto Total: ${montoDisplay}${montoLicDisplay}${montoServDisplay}\n- Etapa: ${updatedOpp.stage?.strname || 'Activa'}`,
      data: [{
        'ID': updatedOpp.id,
        'Proyecto': updatedOpp.nombre_proyecto,
        'Monto': montoDisplay,
        [customLabels.licenciamiento]: updatedOpp.monto_licenciamiento ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_licenciamiento) : '$0.00',
        [customLabels.tipoEntrega]: updatedOpp.monto_servicios ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_servicios) : '$0.00',
      }],
      dashboardRedirect: {
        tab: 'commercial',
        pipelineId: updatedOpp.pipeline_id,
      },
    };
  }

  // ─── 2. ACTIVIDADES ───────────────────────────────────────────────────────────

  /**
   * Crea una actividad validando campos requeridos, checkAvailability de agenda y RBAC.
   * Si falta la fecha, el detalle o el tipo de actividad, solicita los datos al usuario.
   */
  async handleCreateActivity(params: any, user: User): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const missingFields: string[] = [];

    // 1. Asignación de Asesor (RBAC)
    let targetUserId = user.id;
    let targetUserName = user.username;

    if (!isExec && (params.ejecutivo || params.userId || params.responsable)) {
      const foundUser = await this.resolveUser(params.ejecutivo || params.userId || params.responsable);
      if (foundUser) {
        targetUserId = foundUser.id;
        targetUserName = foundUser.username;
      }
    }

    // 2. Detalle / Asunto de la Actividad
    let activityText = (
      params.activity ||
      params.activityText ||
      params.actividad ||
      params.asunto ||
      params.detalle ||
      params.motivo ||
      params.titulo ||
      params.title ||
      params.description ||
      params.descripcion ||
      params.nombre ||
      params.name ||
      params.subject ||
      ''
    ).toString().replace(/^["']|["']$/g, '').trim();

    if (!activityText || activityText.length < 3) {
      for (const [k, v] of Object.entries(params)) {
        if (['date', 'fecha', 'hora', 'tipoactividad', 'tipo', 'typeactivity', 'cliente', 'empresa', 'ejecutivo', 'userid'].includes(k.toLowerCase())) continue;
        if (typeof v === 'string' && v.trim().length >= 3) {
          activityText = v.replace(/^["']|["']$/g, '').trim();
          break;
        }
      }
    }

    if (!activityText || activityText.length < 3) {
      missingFields.push('• Detalle / Asunto: Indica el motivo de la actividad (ej. "Reunión de seguimiento comercial", "Llamada técnica").');
    }

    // 3. Fecha y Hora en zona horaria de NOTIFICATION_TIMEZONE (Requerida - no inventar al azar)
    const dateRaw = params.date || params.fecha || params.hora || params.proposedDate || params.time;
    if (!dateRaw) {
      missingFields.push('• Fecha y Hora: Especifica para cuándo deseas agendarla (ej. "mañana a las 4pm", "el viernes a las 11:00").');
    }

    const proposedDate = dateRaw ? this.parseNaturalDate(dateRaw) : null;
    if (dateRaw && (!proposedDate || isNaN(proposedDate.getTime()))) {
      missingFields.push('• Fecha y Hora no válida: Por favor indica una fecha y hora clara (ej. "mañana a las 10am", "2026-09-01 a las 16:00").');
    }

    // 4. Tipo de Actividad (validar contra catálogo real o inferir de texto)
    const typeHint = params.tipoActividad || params.tipo_actividad || params.typeActivity || params.type_activity || params.typeActivityId || params.tipo || params.type;
    const resolvedType = await this.resolveTypeActivity(typeHint, activityText);
    if (!resolvedType) {
      const activeTypes = await this.typeActivityRepo.find({ where: { blnstatus: true }, order: { strname: 'ASC' } });
      const optionsStr = activeTypes.length > 0
        ? activeTypes.map(t => `  - ${t.strname}`).join('\n')
        : '  - Reunión\n  - Llamada\n  - Visita';
      missingFields.push(`• Tipo de Actividad: Selecciona uno de los tipos activos:\n${optionsStr}`);
    }

    // Si faltan datos requeridos, DETENER Y SOLICITAR INFORMACIÓN AL USUARIO
    if (missingFields.length > 0) {
      return {
        answer: `Para agendar la actividad, por favor proporciona los siguientes datos requeridos:\n\n${missingFields.join('\n\n')}`,
      };
    }

    // 5. Verificación de Disponibilidad (checkAvailability)
    const availability = await this.checkAvailability(targetUserId, proposedDate!);
    if (!availability.available) {
      const formattedLocal = proposedDate!.toLocaleString('es-MX', { timeZone: this.getTimezone(), dateStyle: 'full', timeStyle: 'short' });
      const slotsText = availability.suggestedSlots && availability.suggestedSlots.length > 0
        ? `\n\nHorarios libres sugeridos:\n${availability.suggestedSlots.map(s => `- ${s}`).join('\n')}`
        : '';
      return {
        answer: `Conflicto de Horario: El horario propuesto (${formattedLocal}) ya está ocupado en la agenda de ${targetUserName}.${slotsText}\n\n¿Deseas programarla en uno de los horarios sugeridos?`,
      };
    }

    // 6. Cliente, Empresa y Oportunidad (Opcionales: si el usuario los proporciona, se relacionan)
    let clientId: string | undefined = undefined;
    let companyId: string | undefined = undefined;
    let opportunityId: string | undefined = undefined;
    let clientEntity: Client | null = null;
    let companyEntity: Company | null = null;

    // Extraer pistas de cliente / empresa de parámetros
    let rawClientHint = (params.cliente || params.client || params.contacto || params.contact || '').toString().trim();
    let rawCompanyHint = (params.empresa || params.company || params.cuenta || params.account || '').toString().trim();

    // Si no vinieron explícitos en params, buscar si en el texto de la actividad se indicó ej. "para el cliente X", "con X", "de X"
    if (!rawClientHint && !rawCompanyHint && activityText) {
      const matchFor = activityText.match(/(?:para\s+el\s+cliente|para\s+la\s+cuenta|para\s+la\s+empresa|para|con)\s+["']?([^"',]+?)["']?(?:\s+y\s+de\s+tipo|\s+y\s+tipo|\s+mañana|\s+hoy|\s+el\s+|$)/i);
      if (matchFor && matchFor[1]) {
        const candidate = matchFor[1].trim();
        if (candidate.length > 2 && !['seguimiento', 'reunion', 'llamada', 'visita', 'correo', 'demostracion'].includes(candidate.toLowerCase())) {
          rawClientHint = candidate;
        }
      }
    }

    // A. Resolución de Cliente
    if (params.clientId && this.isValidUuid(params.clientId)) {
      clientId = params.clientId;
      clientEntity = await this.clientRepo.findOne({ where: { id: clientId } });
      if (clientEntity?.companyId) companyId = clientEntity.companyId;
    } else if (rawClientHint) {
      clientEntity = await this.resolveClient(rawClientHint);
      if (clientEntity) {
        clientId = clientEntity.id;
        if (clientEntity.companyId) companyId = clientEntity.companyId;
      } else {
        // Fallback: Si el usuario dijo "cliente X" pero X es una Empresa registrada (ej. "cliente universidad metropolitana")
        companyEntity = await this.resolveCompany(rawClientHint);
        if (companyEntity) companyId = companyEntity.id;
      }
    }

    // B. Resolución de Empresa
    if (!companyId && params.companyId && this.isValidUuid(params.companyId)) {
      companyId = params.companyId;
      companyEntity = await this.companyRepo.findOne({ where: { id: companyId } });
    } else if (!companyId && rawCompanyHint) {
      companyEntity = await this.resolveCompany(rawCompanyHint);
      if (companyEntity) {
        companyId = companyEntity.id;
      } else if (!clientEntity) {
        clientEntity = await this.resolveClient(rawCompanyHint);
        if (clientEntity) {
          clientId = clientEntity.id;
          if (clientEntity.companyId) companyId = clientEntity.companyId;
        }
      }
    }

    // C. Oportunidad relacionada (si existe)
    if (params.opportunityId && this.isValidUuid(params.opportunityId)) {
      opportunityId = params.opportunityId;
    } else if (params.oportunidad) {
      const foundOpp = await this.opportunityRepo.findOne({ where: { nombre_proyecto: ILike(`%${params.oportunidad}%`) } });
      if (foundOpp) {
        opportunityId = foundOpp.id;
        if (!clientId && foundOpp.cliente_id) clientId = foundOpp.cliente_id;
        if (!companyId && foundOpp.companyId) companyId = foundOpp.companyId;
      }
    }

    // D. Resolución de contacto pendiente desde oportunidad o clientId
    if (clientId && !clientEntity) {
      clientEntity = await this.clientRepo.findOne({ where: { id: clientId } });
    }

    let contactEntities: Client[] = [];
    if (Array.isArray(params.contactIds) && params.contactIds.length > 0) {
      const validContactUuids = params.contactIds.filter((id: any) => this.isValidUuid(id));
      if (validContactUuids.length > 0) {
        contactEntities = await this.clientRepo.find({
          where: validContactUuids.map((id: string) => ({ id })),
        });
      }
    }

    // E. Validación obligatoria de correo electrónico para actividades asociadas a contactos
    const contactsToCheck: Client[] = [];
    if (clientEntity) {
      contactsToCheck.push(clientEntity);
    }
    for (const c of contactEntities) {
      if (!contactsToCheck.some(existing => existing.id === c.id)) {
        contactsToCheck.push(c);
      }
    }

    if (contactsToCheck.length > 0) {
      let providedEmail = (params.correo || params.email || '').toString().trim();
      if (!providedEmail && activityText) {
        const emailMatch = activityText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          providedEmail = emailMatch[0].trim();
        }
      }

      if (providedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail)) {
        for (const c of contactsToCheck) {
          if (!c.correo || !c.correo.trim()) {
            c.correo = providedEmail.toLowerCase();
            await this.clientRepo.save(c);
            break;
          }
        }
      }

      const contactsWithoutEmail = contactsToCheck.filter(c => !c.correo || !c.correo.trim());
      if (contactsWithoutEmail.length > 0) {
        const missingNames = contactsWithoutEmail
          .map(c => `"${(`${c.nombre || ''} ${c.apellido || ''}`).trim() || 'Contacto'}"`)
          .join(', ');
        return {
          answer: `Para agendar la actividad con el contacto ${missingNames}, es obligatorio que tenga un correo electrónico asignado en el CRM.\n\nPor favor, proporciona el correo electrónico del contacto para poder registrarlo y completar la creación de la actividad.`,
        };
      }
    }

    // 7. Recordatorio opcional
    let reminder: any = undefined;
    if (params.recordatorio || params.reminderTitle) {
      const offsetMs = 60 * 60 * 1000;
      const remDate = new Date(proposedDate!.getTime() - offsetMs).toISOString();
      reminder = {
        title: params.reminderTitle || `Recordatorio: ${activityText}`,
        date: params.reminderDate || remDate,
      };
    }

    // 8. Crear la Actividad con datos reales validados
    const createdActivity = await this.activitiesService.create({
      activity: activityText,
      date: proposedDate!.toISOString(),
      typeActivityId: resolvedType!.id,
      clientId: clientId || null,
      companyId: companyId || null,
      opportunityId: opportunityId || null,
      contactIds: params.contactIds || undefined,
      reminder,
    } as any, { id: targetUserId } as User);

    const typeName = createdActivity.typeActivity?.strname || resolvedType!.name || 'Actividad';
    const dateFormatted = new Date(createdActivity.date).toLocaleString('es-MX', {
      timeZone: this.getTimezone(),
      dateStyle: 'full',
      timeStyle: 'short',
    });

    if (!clientEntity && createdActivity.client) {
      clientEntity = createdActivity.client;
    }
    if (!companyEntity && createdActivity.company) {
      companyEntity = createdActivity.company;
    }
    if (!companyEntity && clientEntity?.companyId) {
      companyEntity = await this.companyRepo.findOne({ where: { id: clientEntity.companyId } });
    }

    const contactOrAccount = clientEntity
      ? `${clientEntity.nombre} ${clientEntity.apellido || ''}`.trim() + (companyEntity ? ` (${companyEntity.nombre})` : '')
      : (companyEntity ? companyEntity.nombre : null);

    const extraInfo = contactOrAccount ? `\n- Cliente / Cuenta: ${contactOrAccount}` : '';

    return {
      answer: `Actividad Programada Exitosamente\n\n- Tipo: ${typeName}\n- Detalle: ${createdActivity.activity}\n- Fecha y Hora: ${dateFormatted}\n- Asignada a: ${targetUserName}${extraInfo}`,
      data: [{
        'ID': createdActivity.id,
        'Tipo': typeName,
        'Detalle': createdActivity.activity,
        'Fecha': dateFormatted,
        'Cliente': contactOrAccount || 'Sin asignar',
        'Usuario': targetUserName,
      }],
      dashboardRedirect: {
        tab: 'activities',
        dateStart: proposedDate!.toISOString().split('T')[0],
      },
    };
  }

  /**
   * Modifica una actividad existente validando pertenencia (RBAC) y checkAvailability si cambia la fecha.
   * Permite encontrar la actividad por ID, ventana horaria (ej. "a las 3", "las 15:00"), nombre actual o agenda de hoy.
   */
  async handleModifyActivity(params: any, user: User): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);

    // 1. Extraer y normalizar parámetros de búsqueda y actualización
    const id = params.id || params.activityId;
    const targetDateRaw = params.targetDate || params.originalDate || params.currentDate || params.fechaOriginal || params.targetTime || params.horaOriginal || params.dateOriginal || params.existingDate;
    const targetActivityRaw = params.targetActivity || params.currentActivity || params.originalActivity || params.nombreOriginal || params.searchActivity || params.existingActivity;
    const newActivityRaw = params.newActivity || params.nuevoNombre || params.newName || params.nuevoTitulo || params.newTitle || params.nombreNuevo || params.tituloNuevo;
    const newDateRaw = params.newDate || params.nuevaFecha || params.rescheduleDate || params.newProposedDate || params.nuevaHora || params.newTime;
    const genericDate = params.date || params.fecha || params.hora || params.time;
    const genericActivity = params.activity || params.activityText || params.description || params.actividad || params.nombre || params.title;

    let activity: Activity | null = null;

    // Estrategia 1: Búsqueda por ID directo
    if (id) {
      try {
        activity = await this.activityRepo.findOne({ where: { id }, relations: ['typeActivity'] });
      } catch {
        activity = null;
      }
    }

    // Estrategia 2: Búsqueda por Ventana Horaria / Fecha Objetivo (ej. "a las 3", "las 15:00 de hoy")
    const searchDateCandidate = targetDateRaw || (newDateRaw ? null : (newActivityRaw ? genericDate : null)) || (genericDate && !targetActivityRaw ? genericDate : null);
    if (!activity && searchDateCandidate) {
      const parsedTarget = this.parseNaturalDate(searchDateCandidate);
      if (parsedTarget && !isNaN(parsedTarget.getTime())) {
        const windowStart = new Date(parsedTarget.getTime() - 75 * 60 * 1000);
        const windowEnd = new Date(parsedTarget.getTime() + 75 * 60 * 1000);

        const qb = this.activityRepo.createQueryBuilder('activity')
          .leftJoinAndSelect('activity.typeActivity', 'typeActivity')
          .where('activity.date BETWEEN :start AND :end', { start: windowStart.toISOString(), end: windowEnd.toISOString() });

        if (isExec) {
          qb.andWhere('activity.userId = :userId', { userId: user.id });
        } else if (params.user || params.ejecutivo || params.userId) {
          const targetUser = await this.resolveUser(params.user || params.ejecutivo || params.userId);
          if (targetUser) qb.andWhere('activity.userId = :userId', { userId: targetUser.id });
        }

        const matches = await qb.getMany();
        if (matches.length === 1) {
          activity = matches[0];
        } else if (matches.length > 1) {
          if (targetActivityRaw) {
            const textMatch = matches.find(m => m.activity && m.activity.toLowerCase().includes(targetActivityRaw.toLowerCase()));
            if (textMatch) activity = textMatch;
          }
          if (!activity) {
            matches.sort((a, b) => Math.abs(new Date(a.date).getTime() - parsedTarget.getTime()) - Math.abs(new Date(b.date).getTime() - parsedTarget.getTime()));
            activity = matches[0];
          }
        }
      }
    }

    // Estrategia 3: Búsqueda por Texto del Nombre Actual de la Actividad
    const searchActivityText = targetActivityRaw || (newDateRaw ? genericActivity : null) || (targetDateRaw ? null : genericActivity);
    if (!activity && searchActivityText) {
      const qb = this.activityRepo.createQueryBuilder('activity')
        .leftJoinAndSelect('activity.typeActivity', 'typeActivity')
        .where('activity.activity ILIKE :text', { text: `%${searchActivityText.trim()}%` });

      if (isExec) {
        qb.andWhere('activity.userId = :userId', { userId: user.id });
      } else if (params.user || params.ejecutivo || params.userId) {
        const targetUser = await this.resolveUser(params.user || params.ejecutivo || params.userId);
        if (targetUser) qb.andWhere('activity.userId = :userId', { userId: targetUser.id });
      }

      qb.orderBy('activity.date', 'DESC');
      activity = await qb.getOne();
    }

    // Estrategia 4: Fallback a actividades de hoy si el usuario tiene programadas
    if (!activity) {
      const tz = this.getTimezone();
      const now = new Date();
      const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const startOfDay = new Date(nowInTz);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(nowInTz);
      endOfDay.setHours(23, 59, 59, 999);

      const qb = this.activityRepo.createQueryBuilder('activity')
        .leftJoinAndSelect('activity.typeActivity', 'typeActivity')
        .where('activity.date BETWEEN :start AND :end', { start: startOfDay.toISOString(), end: endOfDay.toISOString() });

      if (isExec || !params.user) {
        qb.andWhere('activity.userId = :userId', { userId: user.id });
      }

      const todaysActivities = await qb.getMany();
      if (todaysActivities.length === 1) {
        activity = todaysActivities[0];
      }
    }

    if (!activity) {
      return {
        answer: `No se encontró ninguna actividad que coincida con los datos proporcionados.`,
      };
    }

    // 2. Validación de Permisos (RBAC para Ejecutivo)
    if (isExec && activity.userId !== user.id) {
      return {
        answer: `Acceso Denegado: No tienes permisos para modificar actividades programadas para otros ejecutivos.`,
      };
    }

    // 3. Procesar Actualizaciones
    const updateDto: any = {};

    // A. Actualización de Fecha / Hora (Reprogramación con checkAvailability)
    const candidateNewDateStr = newDateRaw || (targetActivityRaw && genericDate ? genericDate : null);
    if (candidateNewDateStr) {
      const newDate = this.parseNaturalDate(candidateNewDateStr);
      if (newDate && !isNaN(newDate.getTime())) {
        const diffMs = Math.abs(newDate.getTime() - new Date(activity.date).getTime());
        if (diffMs > 60000) { // Si la fecha/hora es distinta
          const availability = await this.checkAvailability(activity.userId, newDate, activity.id);
          if (!availability.available) {
            const formattedLocal = newDate.toLocaleString('es-MX', { timeZone: this.getTimezone(), dateStyle: 'full', timeStyle: 'short' });
            const slotsText = availability.suggestedSlots && availability.suggestedSlots.length > 0
              ? `\n\n Horarios libres sugeridos: \n${availability.suggestedSlots.map(s => `- ${s}`).join('\n')}`
              : '';
            return {
              answer: `Conflicto de Horario: La nueva fecha propuesta (${formattedLocal}) ya está ocupada en la agenda.${slotsText}`,
            };
          }
          updateDto.date = newDate.toISOString();
        }
      }
    }

    // B. Actualización de Nombre / Descripción
    let nextActivityName: string | null = null;
    if (newActivityRaw) {
      nextActivityName = newActivityRaw.trim();
    } else if (genericActivity) {
      const cleanGeneric = genericActivity.trim();
      // Si genericActivity es diferente del nombre actual y no fue el criterio exclusivo de búsqueda
      if (cleanGeneric.toLowerCase() !== activity.activity.trim().toLowerCase()) {
        nextActivityName = cleanGeneric;
      }
    }

    if (nextActivityName) {
      updateDto.activity = nextActivityName;
    }

    // C. Actualización de Tipo de Actividad
    if (params.tipoActividad || params.typeActivityId) {
      updateDto.typeActivityId = await this.resolveTypeActivityId(params.tipoActividad || params.typeActivityId);
    }

    // D. Actualización de Cliente / Empresa (Opcional)
    if (params.clientId && this.isValidUuid(params.clientId)) {
      updateDto.clientId = params.clientId;
    } else if (params.cliente) {
      const foundClient = await this.resolveClient(params.cliente);
      if (foundClient) updateDto.clientId = foundClient.id;
    }

    if (params.companyId && this.isValidUuid(params.companyId)) {
      updateDto.companyId = params.companyId;
    } else if (params.empresa || params.cuenta) {
      const foundCompany = await this.resolveCompany(params.empresa || params.cuenta);
      if (foundCompany) updateDto.companyId = foundCompany.id;
    }

    const updated = await this.activitiesService.update(activity.id, updateDto, { id: user.id } as User);
    const dateFormatted = new Date(updated.date).toLocaleString('es-MX', {
      timeZone: this.getTimezone(),
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return {
      answer: `Actividad Modificada con Éxito\n\n- Detalle: ${updated.activity}\n- Fecha y Hora: ${dateFormatted}`,
      data: [{
        'ID': updated.id,
        'Detalle': updated.activity,
        'Fecha': dateFormatted,
      }],
      dashboardRedirect: {
        tab: 'activities',
      },
    };
  }

  // ─── 3. TICKETS ───────────────────────────────────────────────────────────────

  /**
   * Crea un ticket validando campos requeridos sin inventar información.
   * Si falta el título, la descripción o el tipo de incidencia, solicita los datos al usuario.
   */
  async handleCreateTicket(params: any, user: User): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const missingFields: string[] = [];

    // 1. Responsable Asignado (RBAC)
    let responsableId = user.id;
    let responsableName = user.username;

    if (!isExec && (params.responsable || params.responsableId || params.ejecutivo)) {
      const foundUser = await this.resolveUser(params.responsable || params.responsableId || params.ejecutivo);
      if (foundUser) {
        responsableId = foundUser.id;
        responsableName = foundUser.username;
      }
    }

    // 2. Título / Asunto
    const title = (params.title || params.strtitle || params.asunto || params.titulo || '').trim();
    if (!title || title.length < 3) {
      missingFields.push('• **Título o Asunto**: Describe brevemente el problema o solicitud (ej. *"Falla en inicio de sesión"*, *"Error en generación de factura"*).');
    }

    // 3. Descripción de la Incidencia
    let description = (params.description || params.descripcion || params.detalle || '').trim();
    if (!description || description.length < 5) {
      // Si el título contiene suficiente detalle (> 15 caracteres), usarlo como descripción inicial si no se proporcionó otra
      if (title && title.length >= 15) {
        description = title;
      } else {
        missingFields.push('• **Descripción del Problema**: Proporciona el detalle de la falla o motivo de la solicitud de soporte.');
      }
    }

    // 4. Tipo de Incidencia / Categoría (Default a 'Soporte Técnico' si no se especifica)
    const tipoIncidencia = (params.tipo_incidencia || params.category || params.tipo || params.categoria || 'Soporte Técnico').trim();

    // 5. Cliente (Opcional, pero se resuelve si fue enviado)
    let clienteId: string | undefined = undefined;
    let clientEntity: Client | null = null;

    if (params.clienteId && this.isValidUuid(params.clienteId)) {
      clienteId = params.clienteId;
      clientEntity = await this.clientRepo.findOne({ where: { id: clienteId } });
    } else if (params.cliente) {
      clientEntity = await this.resolveClient(params.cliente);
      if (clientEntity) clienteId = clientEntity.id;
    }

    // Si faltan datos requeridos, DETENER Y SOLICITAR INFORMACIÓN AL USUARIO
    if (missingFields.length > 0) {
      return {
        answer: `Para poder levantar el ticket de soporte, por favor proporciona los siguientes datos requeridos:\n\n${missingFields.join('\n\n')}`,
      };
    }

    // 6. Prioridad (0 a 3, default 1: Normal)
    let priority = 1;
    if (params.priority !== undefined) {
      const pNum = Number(params.priority);
      if (!isNaN(pNum) && pNum >= 0 && pNum <= 3) priority = pNum;
    } else if (params.urgente || (title + ' ' + description).toLowerCase().includes('urgente') || (title + ' ' + description).toLowerCase().includes('alta')) {
      priority = 3;
    }

    // 7. Crear el Ticket con datos reales
    const createdTicket = await this.ticketsService.create({
      strtitle: title,
      description,
      tipo_incidencia: tipoIncidencia,
      priority,
      cliente_id: clienteId,
      responsable_id: responsableId,
      contactName: clientEntity ? `${clientEntity.nombre} ${clientEntity.apellido || ''}`.trim() : (params.contacto || undefined),
      contactEmail: clientEntity?.correo || params.correo || undefined,
      contactPhone: clientEntity?.telefono || params.telefono || undefined,
    } as any, { id: user.id } as User);

    const priorityNames = ['Baja', 'Normal', 'Media', 'Alta'];
    const priorityDisplay = priorityNames[createdTicket.priority ?? 1] || 'Normal';

    return {
      answer: `Ticket de Soporte Creado\n\n- Folio: #${createdTicket.ticket_number || createdTicket.id.substring(0, 8)}\n- Título: ${createdTicket.strtitle}\n- Tipo: ${createdTicket.tipo_incidencia}\n- Prioridad: ${priorityDisplay}\n- Responsable: ${responsableName}`,
      data: [{
        'Folio': `#${createdTicket.ticket_number || 'N/A'}`,
        'Título': createdTicket.strtitle,
        'Tipo': createdTicket.tipo_incidencia,
        'Prioridad': priorityDisplay,
        'Responsable': responsableName,
      }],
      dashboardRedirect: {
        tab: 'support',
        helpdeskId: createdTicket.helpdesk_id,
      },
    };
  }

  // ─── 4. VERIFICACIÓN DE DISPONIBILIDAD (checkAvailability) ─────────────────────

  /**
   * Verifica la disponibilidad de horario de un asesor con una ventana de 60 minutos.
   */
  async checkAvailability(
    targetUserId: string,
    proposedDate: Date,
    excludeActivityId?: string,
  ): Promise<{ available: boolean; suggestedSlots?: string[]; message?: string }> {
    const dayStart = new Date(proposedDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(proposedDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const dayActivities = await this.activitiesService.findByUserAndDate(targetUserId, dayStart, dayEnd);
    const filteredActivities = excludeActivityId
      ? dayActivities.filter(a => a.id !== excludeActivityId)
      : dayActivities;

    const CONFLICT_WINDOW_MS = 60 * 60 * 1000;
    const conflicting = filteredActivities.filter(act => {
      const diff = Math.abs(new Date(act.date).getTime() - proposedDate.getTime());
      return diff < CONFLICT_WINDOW_MS;
    });

    if (conflicting.length === 0) {
      return { available: true, message: 'Horario disponible.' };
    }

    // Calcular horarios sugeridos en la zona horaria del sistema
    const tz = this.getTimezone();
    const suggestedSlots: string[] = [];
    const baseDateString = proposedDate.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

    for (let hour = 9; hour <= 17; hour++) {
      const padHour = String(hour).padStart(2, '0');
      // Construir timestamp representativo del slot en zona horaria local
      const slotCandidate = new Date(`${baseDateString}T${padHour}:00:00`);
      // Ajustar con la hora convertida exacta
      const hasConflict = filteredActivities.some(act => {
        return Math.abs(new Date(act.date).getTime() - slotCandidate.getTime()) < CONFLICT_WINDOW_MS;
      });

      if (!hasConflict && Math.abs(slotCandidate.getTime() - proposedDate.getTime()) >= CONFLICT_WINDOW_MS) {
        suggestedSlots.push(slotCandidate.toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }));
        if (suggestedSlots.length >= 3) break;
      }
    }

    return {
      available: false,
      suggestedSlots,
      message: 'El horario propuesto tiene conflicto con otra actividad.',
    };
  }

  private normalizeString(str?: string | null): string {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  // ─── 5. HELPERS DE RESOLUCIÓN DE CATÁLOGOS Y ENTIDADES ─────────────────────────

  async resolveBusinessLine(hint?: string): Promise<{ id: string; name: string } | null> {
    if (!hint) return null;
    const clean = hint.trim();
    if (this.isValidUuid(clean)) {
      const bl = await this.businessLineRepo.findOne({ where: { id: clean, blnstatus: true } });
      if (bl) return { id: bl.id, name: bl.strname };
    }
    const all = await this.businessLineRepo.find({ where: { blnstatus: true } });
    const normClean = this.normalizeString(clean);
    const matched = all.find(b => {
      const normB = this.normalizeString(b.strname);
      return normB === normClean || normB.includes(normClean) || normClean.includes(normB);
    });
    if (matched) return { id: matched.id, name: matched.strname };
    return null;
  }

  async resolveBusinessLineId(hint?: string): Promise<string> {
    const resolved = await this.resolveBusinessLine(hint);
    return resolved ? resolved.id : '';
  }

  async resolveDeliveryType(hint?: string): Promise<{ id: string; name: string } | null> {
    if (!hint) return null;
    const clean = hint.trim();
    if (this.isValidUuid(clean)) {
      const dt = await this.deliveryTypeRepo.findOne({ where: { id: clean, blnstatus: true } });
      if (dt) return { id: dt.id, name: dt.strname };
    }
    const all = await this.deliveryTypeRepo.find({ where: { blnstatus: true } });
    const normClean = this.normalizeString(clean);
    const matched = all.find(d => {
      const normD = this.normalizeString(d.strname);
      return normD === normClean || normD.includes(normClean) || normClean.includes(normD);
    });
    if (matched) return { id: matched.id, name: matched.strname };
    return null;
  }

  async resolveDeliveryTypeId(hint?: string): Promise<string> {
    const resolved = await this.resolveDeliveryType(hint);
    return resolved ? resolved.id : '';
  }

  async resolveLicensing(hint?: string): Promise<{ id: string; name: string } | null> {
    if (!hint) return null;
    const clean = hint.trim();
    if (this.isValidUuid(clean)) {
      const lic = await this.licensingRepo.findOne({ where: { id: clean, blnstatus: true } });
      if (lic) return { id: lic.id, name: lic.strname };
    }
    const all = await this.licensingRepo.find({ where: { blnstatus: true } });
    const normClean = this.normalizeString(clean);
    const matched = all.find(l => {
      const normL = this.normalizeString(l.strname);
      return normL === normClean || normL.includes(normClean) || normClean.includes(normL);
    });
    if (matched) return { id: matched.id, name: matched.strname };
    return null;
  }

  async resolveLicensingId(hint?: string): Promise<string> {
    const resolved = await this.resolveLicensing(hint);
    return resolved ? resolved.id : '';
  }

  async resolveTypeActivity(hint?: string | number, fallbackText?: string): Promise<{ id: number; name: string } | null> {
    const allActive = await this.typeActivityRepo.find({ where: { blnstatus: true } });
    if (allActive.length === 0) return null;

    if (hint !== undefined && hint !== null) {
      if (typeof hint === 'number' && hint > 0) {
        const ta = allActive.find(t => t.id === hint);
        if (ta) return { id: ta.id, name: ta.strname };
      }
      const str = String(hint).trim();
      if (str) {
        const num = Number(str);
        if (!isNaN(num) && num > 0 && !str.includes('-')) {
          const ta = allActive.find(t => t.id === num);
          if (ta) return { id: ta.id, name: ta.strname };
        }
        const normHint = this.normalizeString(str);
        const matched = allActive.find(t => {
          const normT = this.normalizeString(t.strname);
          return normT === normHint || normT.includes(normHint) || normHint.includes(normT);
        });
        if (matched) return { id: matched.id, name: matched.strname };
      }
    }

    // Si no se pasó hint explícito de tipo pero en el texto de la actividad se menciona (ej. "Reunión", "Llamada", "Visita")
    if (fallbackText) {
      const normText = this.normalizeString(fallbackText);
      const matched = allActive.find(t => {
        const normT = this.normalizeString(t.strname);
        return normText.includes(normT);
      });
      if (matched) return { id: matched.id, name: matched.strname };
    }

    return null;
  }

  async resolveTypeActivityId(hint?: string | number, fallbackText?: string): Promise<number> {
    const resolved = await this.resolveTypeActivity(hint, fallbackText);
    return resolved ? resolved.id : 1;
  }

  async resolveClient(hint: string): Promise<Client | null> {
    if (!hint) return null;
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return null;
    if (this.isValidUuid(clean)) {
      return this.clientRepo.findOne({ where: { id: clean } });
    }
    // 1. Coincidencia directa completa en nombre, apellido, correo, telefono o empresa
    const direct = await this.clientRepo.findOne({
      where: [
        { nombre: ILike(`%${clean}%`) },
        { apellido: ILike(`%${clean}%`) },
        { correo: ILike(`%${clean}%`) },
        { telefono: ILike(`%${clean}%`) },
        { empresa: ILike(`%${clean}%`) },
      ],
    });
    if (direct) return direct;

    // 2. Si son múltiples palabras (ej. "Juan Pérez"), buscar en nombre y apellido
    const words = clean.split(/\s+/).filter(w => w.length > 1);
    if (words.length > 1) {
      const match = await this.clientRepo.findOne({
        where: [
          { nombre: ILike(`%${words[0]}%`), apellido: ILike(`%${words[1]}%`) },
          { nombre: ILike(`%${words[0]}%`) },
        ],
      });
      if (match) return match;
    }
    return null;
  }

  async resolveCompany(hint: string): Promise<Company | null> {
    if (!hint) return null;
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return null;
    if (this.isValidUuid(clean)) {
      return this.companyRepo.findOne({ where: { id: clean } });
    }
    // 1. Coincidencia directa completa en nombre, correo o telefono
    const direct = await this.companyRepo.findOne({
      where: [
        { nombre: ILike(`%${clean}%`) },
        { correo: ILike(`%${clean}%`) },
      ],
    });
    if (direct) return direct;

    // 2. Si son múltiples palabras (ej. "Universidad Metropolitana"), buscar por la primera palabra representativa
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      for (const w of words) {
        if (['sociedad', 'anonima', 'capital', 'variable', 'empresa', 'grupo', 'de', 'la', 'el', 'los', 'las'].includes(w.toLowerCase())) continue;
        const match = await this.companyRepo.findOne({
          where: { nombre: ILike(`%${w}%`) },
        });
        if (match) return match;
      }
    }
    return null;
  }

  async resolveUser(hint: string): Promise<User | null> {
    if (!hint) return null;
    const clean = hint.trim().toLowerCase();
    if (this.isValidUuid(clean)) {
      return this.usersService.findOneById(clean).catch(() => null);
    }
    const all: User[] = (await this.usersService.findAllActive().catch(() => [])) || [];
    const found = all.find((u: User) =>
      (u.username && u.username.toLowerCase().includes(clean)) ||
      (u.email && u.email.toLowerCase().includes(clean))
    );
    return found || null;
  }

  async resolveProductItems(params: any): Promise<{ items: Array<{ productId: string; cantidad: number }>; totalPrice: number }> {
    const items: Array<{ productId: string; cantidad: number }> = [];
    let totalPrice = 0;

    if (Array.isArray(params.productItems) && params.productItems.length > 0) {
      for (const item of params.productItems) {
        const qty = Number(item.cantidad) || 1;
        if (item.productId && this.isValidUuid(item.productId)) {
          items.push({ productId: item.productId, cantidad: qty });
          const prod = await this.productRepo.findOne({ where: { id: item.productId } });
          if (prod) totalPrice += (Number(prod.precioBase) || 0) * qty;
        } else if (item.nombreProducto || item.nombre) {
          const pName = item.nombreProducto || item.nombre;
          const prod = await this.productRepo.findOne({ where: { nombre: ILike(`%${pName}%`), status: true } });
          if (prod) {
            items.push({ productId: prod.id, cantidad: qty });
            totalPrice += (Number(prod.precioBase) || 0) * qty;
          }
        }
      }
    } else if (params.nombreProducto || params.producto) {
      const pName = params.nombreProducto || params.producto;
      const qty = Number(params.cantidad) || 1;
      const prod = await this.productRepo.findOne({ where: { nombre: ILike(`%${pName}%`), status: true } });
      if (prod) {
        items.push({ productId: prod.id, cantidad: qty });
        totalPrice += (Number(prod.precioBase) || 0) * qty;
      }
    }

    return { items, totalPrice };
  }

  parseNaturalDate(dateInput: any): Date {
    if (!dateInput) {
      const d = new Date();
      d.setHours(d.getHours() + 2, 0, 0, 0);
      return d;
    }
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      return dateInput;
    }
    const str = String(dateInput).trim();
    const parsedDirect = new Date(str);
    if (!isNaN(parsedDirect.getTime()) && str.includes('T')) {
      return parsedDirect;
    }

    const tz = this.getTimezone();
    const now = new Date();
    const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));

    const lower = str.toLowerCase();
    const targetDate = new Date(nowInTz);

    if (lower.includes('mañana') || lower.includes('manana')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
      targetDate.setDate(targetDate.getDate() + 2);
    } else {
      const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado'];
      for (let d = 0; d < dias.length; d++) {
        const diaName = dias[d];
        if (lower.includes(diaName)) {
          const currentDay = targetDate.getDay();
          const targetDay = d > 6 ? (d === 8 ? 6 : 3) : (d === 4 ? 3 : d);
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7;
          targetDate.setDate(targetDate.getDate() + diff);
          break;
        }
      }
    }

    // Extraer hora (ej. "a las 3", "de las 3", "las 15:00", "4pm", "11:30 am", "3")
    const timeMatch = lower.match(/(?:a\s+las\s+|de\s+las\s+|las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (!meridiem && hour < 8) hour += 12; // Asumir horario laboral de tarde si dice ej. "a las 3" -> 15:00

      targetDate.setHours(hour, minutes, 0, 0);
    } else {
      targetDate.setHours(10, 0, 0, 0); // Default 10:00 AM
    }

    return targetDate;
  }

  parseNumeric(value: any): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    const clean = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  isValidUuid(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }

  isExecutive(role: string): boolean {
    const r = (role || '').toLowerCase().trim();
    return r === 'executive' || r === 'ejecutivo';
  }
}
