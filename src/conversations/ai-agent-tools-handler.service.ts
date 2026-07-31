import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { Conversation } from './entities/conversation.entity';
import { Client } from '../clients/entities/client.entity';
import { ProductFile } from '../products/entities/product-file.entity';
import { Product } from '../products/entities/product.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ActivitiesService } from '../activities/activities.service';
import { TicketsService } from '../tickets/tickets.service';
import { ClientsService } from '../clients/clients.service';
import { RagService } from '../rag/rag.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PhoneUtils } from '../common/utils/phone.utils';
import { Currency } from '../opportunities/entities/opportunity.entity';
import { BusinessLineOption } from '../opportunities/entities/business-line-option.entity';
import { DeliveryTypeOption } from '../opportunities/entities/delivery-type-option.entity';
import { LicensingOption } from '../opportunities/entities/licensing-option.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { QUOTATION_EVENTS } from '../common/events/quotation.events';

/**
 * Handles the execution of all AI agent tools that interact with CRM services.
 * Separated from AiAgentOrchestratorService by the Single Responsibility Principle.
 */
@Injectable()
export class AiAgentToolsHandlerService {
  private readonly logger = new Logger('AiAgentToolsHandlerService');

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ProductFile)
    private readonly productFileRepository: Repository<ProductFile>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly ticketsService: TicketsService,
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
    readonly ragService: RagService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Dispatches a tool call to the corresponding CRM service.
   */
  async executeTool(name: string, input: any, conversation: Conversation, config: AiAgentConfig): Promise<any> {
    try {
      switch (name) {
        case 'consult_product_catalog':
        case 'consultProductCatalog': {
          const queryText = input.query || input.search || input.productName || '';
          this.logger.log(`[executeTool] Ejecutando búsqueda RAG y catálogo de productos para: '${queryText}'`);
          const ragResults = await this.ragService.searchSimilar(queryText, 3);
          const cubeResults = await this.queryCubeProducts(queryText);
          return { status: 'SUCCESS', query: queryText, ragDocs: ragResults, catalogProducts: cubeResults };
        }

        case 'createOpportunity': {
          const userEntity = conversation.assignedUserId ? { id: conversation.assignedUserId } as User : undefined;

          let cleanMonto = 0;
          if (input.montoTotal !== undefined && input.montoTotal !== null) {
            if (typeof input.montoTotal === 'number') {
              cleanMonto = input.montoTotal;
            } else {
              const strVal = String(input.montoTotal).replace(/[^0-9.-]/g, '');
              const parsed = parseFloat(strVal);
              cleanMonto = isNaN(parsed) ? 0 : parsed;
            }
          }

          const finalProductIds: string[] = input.productIds || [];
          let matchedProducts: Array<{ id: string; nombre: string }> = [];
          if (input.nombreProducto) {
            matchedProducts = await this.findProductsFromSemanticLayer(input.nombreProducto);
          }
          if (matchedProducts.length === 0 && input.nombreProyecto) {
            matchedProducts = await this.findProductsFromSemanticLayer(input.nombreProyecto);
          }
          if (matchedProducts.length > 0) {
            this.logger.log(`Productos asociados automáticamente vía Capa Semántica Cube.dev: ${matchedProducts.map(p => p.nombre).join(', ')}`);
            for (const p of matchedProducts) {
              if (!finalProductIds.includes(p.id)) finalProductIds.push(p.id);
            }
          }

          let businessLineId = 'default';
          if (input.lineaNegocio) {
            try {
              const blRepo = this.aiAgentConfigRepository.manager.getRepository(BusinessLineOption);
              const bl = await blRepo.findOne({ where: { strname: input.lineaNegocio, blnstatus: true } });
              if (bl) {
                businessLineId = bl.id;
              } else {
                const blApprox = await blRepo.createQueryBuilder('bl')
                  .where('LOWER(bl.strname) LIKE :name', { name: `%${input.lineaNegocio.toLowerCase()}%` })
                  .andWhere('bl.blnstatus = :status', { status: true })
                  .getOne();
                if (blApprox) businessLineId = blApprox.id;
              }
            } catch (err: any) {
              this.logger.error(`Error al buscar lineaNegocio por nombre: ${err.message}`);
            }
          }

          let deliveryTypeId = 'default';
          if (input.tipoEntrega) {
            try {
              const dtRepo = this.aiAgentConfigRepository.manager.getRepository(DeliveryTypeOption);
              const dt = await dtRepo.findOne({ where: { strname: input.tipoEntrega, blnstatus: true } });
              if (dt) {
                deliveryTypeId = dt.id;
              } else {
                const dtApprox = await dtRepo.createQueryBuilder('dt')
                  .where('LOWER(dt.strname) LIKE :name', { name: `%${input.tipoEntrega.toLowerCase()}%` })
                  .andWhere('dt.blnstatus = :status', { status: true })
                  .getOne();
                if (dtApprox) deliveryTypeId = dtApprox.id;
              }
            } catch (err: any) {
              this.logger.error(`Error al buscar tipoEntrega por nombre: ${err.message}`);
            }
          }

          let licensingId: string | undefined = undefined;
          if (input.licenciamiento) {
            try {
              const licRepo = this.aiAgentConfigRepository.manager.getRepository(LicensingOption);
              const lic = await licRepo.findOne({ where: { strname: input.licenciamiento, blnstatus: true } });
              if (lic) {
                licensingId = lic.id;
              } else {
                const licApprox = await licRepo.createQueryBuilder('lic')
                  .where('LOWER(lic.strname) LIKE :name', { name: `%${input.licenciamiento.toLowerCase()}%` })
                  .andWhere('lic.blnstatus = :status', { status: true })
                  .getOne();
                if (licApprox) licensingId = licApprox.id;
              }
            } catch (err: any) {
              this.logger.error(`Error al buscar licenciamiento por nombre: ${err.message}`);
            }
          }

          const productItems = finalProductIds.map((id) => ({ productId: id, cantidad: input.cantidad || 1 }));

          const opp = await this.opportunitiesService.create({
            nombre_proyecto: input.nombreProyecto,
            description: input.descripcion || 'Creado por Agente IA',
            monto_total: cleanMonto,
            moneda: input.moneda || Currency.USD,
            cliente_id: conversation.clientId || undefined,
            ejecutivo_id: conversation.assignedUserId || undefined,
            linea_negocio_id: businessLineId,
            tipo_entrega_id: deliveryTypeId,
            licenciamiento_id: licensingId,
            productItems: productItems.length > 0 ? productItems : undefined,
            productIds: finalProductIds,
          } as any, userEntity);

          this.eventEmitter.emit(QUOTATION_EVENTS.SEND_TO_CHANNEL, {
            opportunityId: opp.id,
            conversationId: conversation.id,
          });
          this.logger.log(`Evento de PDF de cotización emitido para la oportunidad ${opp.id}`);
          return { status: 'SUCCESS', message: 'Oportunidad creada con éxito y PDF de cotización transmitido al canal', opportunityId: opp.id, productsAddedCount: finalProductIds.length };
        }

        case 'modifyOpportunity': {
          let cleanMonto: number | undefined = undefined;
          if (input.montoTotal !== undefined && input.montoTotal !== null) {
            if (typeof input.montoTotal === 'number') {
              cleanMonto = input.montoTotal;
            } else {
              const strVal = String(input.montoTotal).replace(/[^0-9.-]/g, '');
              const parsed = parseFloat(strVal);
              cleanMonto = isNaN(parsed) ? 0 : parsed;
            }
          }

          const existingOpp = await this.opportunitiesService.findOne(input.id).catch(() => null);
          if (!existingOpp) {
            return { status: 'ERROR', message: `Oportunidad con ID ${input.id} no encontrada.` };
          }

          // 1. Construir mapa con los productos existentes { productId -> cantidad }
          const itemMap = new Map<string, number>();
          if (existingOpp.opportunityProducts && existingOpp.opportunityProducts.length > 0) {
            for (const op of existingOpp.opportunityProducts) {
              if (op.productId) {
                itemMap.set(op.productId, Number(op.cantidad || 1));
              }
            }
          }

          // 2. Si la IA envía un producto específico a agregar/actualizar
          const targetProductName = input.nombreProducto || input.nombreProyecto;
          const targetQty = Number(input.cantidad) > 0 ? Number(input.cantidad) : 1;

          if (targetProductName) {
            const matchedProducts = await this.findProductsFromSemanticLayer(targetProductName);
            if (matchedProducts.length > 0) {
              for (const p of matchedProducts) {
                // Agregar el producto sin borrar los existentes (o actualizar cantidad si ya estaba)
                itemMap.set(p.id, targetQty);
                this.logger.log(`[modifyOpportunity] Añadido/Actualizado producto '${p.nombre}' (ID: ${p.id}) con cantidad ${targetQty} en oportunidad ${input.id}`);
              }
            }
          }

          // 3. Soporte para array explícito de productItems si la IA lo proporciona
          if (Array.isArray(input.productItems) && input.productItems.length > 0) {
            for (const item of input.productItems) {
              if (item.productId) {
                itemMap.set(item.productId, Number(item.cantidad) || 1);
              } else if (item.nombreProducto) {
                const matched = await this.findProductsFromSemanticLayer(item.nombreProducto);
                for (const p of matched) {
                  itemMap.set(p.id, Number(item.cantidad) || 1);
                }
              }
            }
          }

          const updatedProductItems = Array.from(itemMap.entries()).map(([productId, cantidad]) => ({
            productId,
            cantidad,
          }));

          const opp = await this.opportunitiesService.update(input.id, {
            nombre_proyecto: input.nombreProyecto || undefined,
            description: input.descripcion || undefined,
            monto_total: cleanMonto || undefined,
            productItems: updatedProductItems.length > 0 ? updatedProductItems : undefined,
          });

          this.eventEmitter.emit(QUOTATION_EVENTS.SEND_TO_CHANNEL, {
            opportunityId: opp.id,
            conversationId: conversation.id,
          });
          return {
            status: 'SUCCESS',
            message: `Oportunidad modificada con éxito. Total de productos en la cotización: ${opp.opportunityProducts?.length || 0}. PDF de cotización actualizado transmitido al canal.`,
            opportunityId: opp.id,
            productsCount: opp.opportunityProducts?.length || 0,
          };
        }

        case 'sendQuotationPdf': {
          let targetOppId = input?.opportunityId;
          if (!targetOppId && conversation.clientId) {
            const clientOpps = await this.opportunitiesService.findByClientId(conversation.clientId);
            if (clientOpps && clientOpps.length > 0) targetOppId = clientOpps[0].id;
          }
          if (!targetOppId) {
            return { status: 'ERROR', message: 'No hay una oportunidad activa en esta conversación para generar la cotización en PDF.' };
          }
          this.eventEmitter.emit(QUOTATION_EVENTS.SEND_TO_CHANNEL, { opportunityId: targetOppId, conversationId: conversation.id });
          return { status: 'SUCCESS', message: 'Cotización en PDF generada y transmitida exitosamente al chat del cliente.', opportunityId: targetOppId };
        }

        case 'registerContact':
        case 'updateContact': {
          const email = input.correo || null;
          const phone = input.telefono ? String(input.telefono).trim() : null;
          const oldClientId = conversation.clientId;
          let client: Client | null = null;

          if (phone) client = await this.clientsService.findByPhone(phone);

          if (client) {
            if (input.nombre && !input.nombre.toLowerCase().includes('visitante')) {
              const names = this.splitFullName(input.nombre);
              client.nombre = names.nombre;
              if (names.apellido) client.apellido = names.apellido;
            }
            if (email) client.correo = email;
            await this.clientRepository.save(client);
          } else if (conversation.clientId) {
            client = await this.clientRepository.findOne({ where: { id: conversation.clientId } });
            if (client) {
              if (phone) client.telefono = phone;
              if (email) client.correo = email;
              if (input.nombre && !input.nombre.toLowerCase().includes('visitante')) {
                const names = this.splitFullName(input.nombre);
                client.nombre = names.nombre;
                if (names.apellido) client.apellido = names.apellido;
              }
              await this.clientRepository.save(client);
            }
          }

          if (!client) {
            const names = this.splitFullName(input.nombre || 'Visitante');
            client = await this.clientsService.create({
              nombre: names.nombre,
              apellido: names.apellido,
              correo: email,
              telefono: phone,
              ejecutivo_id: conversation.assignedUserId || undefined,
            } as any);
          }

          conversation.client = client;
          conversation.clientId = client.id;
          conversation.clientName = `${client.nombre} ${client.apellido || ''}`.trim();

          await this.clientRepository.manager.getRepository(Conversation)
            .createQueryBuilder()
            .update(Conversation)
            .set({ clientId: client.id, clientName: conversation.clientName })
            .where('id = :id', { id: conversation.id })
            .execute();

          if (oldClientId && oldClientId !== client.id) {
            await this.deleteTemporaryClientIfUnused(oldClientId, client.id);
          }

          return {
            status: 'SUCCESS',
            message: 'Contacto identificado y actualizado correctamente en el CRM',
            clientId: client.id,
            clientName: conversation.clientName,
            client: { id: client.id, nombre: client.nombre, apellido: client.apellido, correo: client.correo, telefono: client.telefono },
          };
        }

        case 'createActivity': {
          const clientId = conversation.clientId;
          if (!clientId) {
            return { status: 'ERROR', message: 'No hay ningún contacto registrado y vinculado a este chat para poder agendar una actividad.' };
          }

          const activeOpportunities = await this.opportunitiesService.findByClientId(clientId);
          let finalOpportunityId = input.opportunityId;

          if (finalOpportunityId) {
            const belongsToClient = activeOpportunities.some(opp => opp.id === finalOpportunityId);
            if (!belongsToClient) {
              return { status: 'ERROR', message: `La oportunidad con ID '${finalOpportunityId}' no pertenece a este cliente o no es válida.` };
            }
          } else {
            if (activeOpportunities.length === 1) {
              finalOpportunityId = activeOpportunities[0].id;
            } else if (activeOpportunities.length > 1) {
              const oppList = activeOpportunities.map(opp => `- ${opp.nombre_proyecto} (ID: ${opp.id}, Etapa: ${opp.stage?.strname || 'Activo'})`).join('\n');
              return { status: 'ERROR', message: `El cliente tiene múltiples oportunidades activas. Debes pedirle al cliente que aclare a cuál de ellas se refiere antes de agendar la actividad.\nOportunidades disponibles:\n${oppList}` };
            }
          }

          let targetUserId = conversation.assignedUserId || config.defaultUserId;
          if (!targetUserId) {
            const activeUsers = await this.usersService.findAllActive().catch(() => []);
            if (activeUsers && activeUsers.length > 0) {
              targetUserId = activeUsers[0].id;
            }
          }
          const userEntity = targetUserId ? ({ id: targetUserId } as User) : ({ id: conversation.assignedUserId } as User);

          let remDate = input.reminderDate;
          if (input.reminderTitle && !remDate) {
            const actDate = new Date(input.date);
            const offsetMs = (config.reminderOffsetMinutes || 60) * 60 * 1000;
            remDate = new Date(actDate.getTime() - offsetMs).toISOString();
          }

          const activity = await this.activitiesService.create({
            activity: input.activityText,
            date: input.date,
            typeActivityId: input.typeActivityId,
            opportunityId: finalOpportunityId || null,
            clientId,
            reminder: input.reminderTitle ? { title: input.reminderTitle, date: remDate } : undefined,
          } as any, userEntity);

          return { status: 'SUCCESS', message: `Actividad y recordatorio programados con éxito ${finalOpportunityId ? 'y asociados a la oportunidad ' + finalOpportunityId : ''}`, activityId: activity.id };
        }

        case 'createTicket': {
          const userEntity = conversation.assignedUserId ? { id: conversation.assignedUserId } as User : undefined;
          const ticket = await this.ticketsService.create({
            strtitle: input.title,
            tipo_incidencia: input.category || 'Soporte Técnico',
            description: input.description || 'Creado por Agente IA',
            priority: input.priority || 1,
            cliente_id: conversation.clientId || undefined,
            contactName: conversation.clientName || undefined,
            contactPhone: conversation.externalId || undefined,
            responsable_id: conversation.assignedUserId || undefined,
          } as any, userEntity);
          return { status: 'SUCCESS', message: 'Ticket de soporte técnico creado con éxito', ticketId: ticket.id, ticketNumber: ticket.ticket_number };
        }

        case 'checkAvailability': {
          const proposedDate = new Date(input.proposedDate);
          if (isNaN(proposedDate.getTime())) {
            return { status: 'ERROR', message: 'Fecha propuesta inválida. Envía una fecha ISO 8601 válida.' };
          }

          const advisorId = conversation.assignedUserId;
          if (!advisorId) {
            return { status: 'AVAILABLE', available: true, message: 'Sin asesor asignado — el horario está disponible.' };
          }

          const dayStart = new Date(proposedDate);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(proposedDate);
          dayEnd.setUTCHours(23, 59, 59, 999);

          const dayActivities = await this.activitiesService.findByUserAndDate(advisorId, dayStart, dayEnd);

          const CONFLICT_WINDOW_MS = 60 * 60 * 1000;
          const conflicting = dayActivities.filter(act => {
            if (act.clientId && conversation.clientId && act.clientId === conversation.clientId) {
              return false;
            }
            const diff = Math.abs(new Date(act.date).getTime() - proposedDate.getTime());
            return diff < CONFLICT_WINDOW_MS;
          });

          if (conflicting.length === 0) {
            return { status: 'AVAILABLE', available: true, message: 'El horario está disponible.', proposedDateUTC: proposedDate.toISOString() };
          }

          const tzOffset = this.getMexicoCityUTCOffset(proposedDate);
          const BIZ_START_LOCAL = 8;
          const BIZ_END_LOCAL = 18;
          const businessStartUTC = BIZ_START_LOCAL - tzOffset;
          const businessEndUTC = BIZ_END_LOCAL - tzOffset;

          const allSlots: Date[] = [];
          for (let h = businessStartUTC; h < businessEndUTC; h++) {
            const slotH = h % 24;
            const slotDay = h >= 24 ? 1 : 0;
            const slot = new Date(dayStart);
            slot.setUTCDate(slot.getUTCDate() + slotDay);
            slot.setUTCHours(slotH, 0, 0, 0);
            allSlots.push(slot);
          }

          const freeSlots = allSlots.filter(slot =>
            !dayActivities.some(act => Math.abs(new Date(act.date).getTime() - slot.getTime()) < CONFLICT_WINDOW_MS)
          );

          freeSlots.sort((a, b) => Math.abs(a.getTime() - proposedDate.getTime()) - Math.abs(b.getTime() - proposedDate.getTime()));

          const suggestions = freeSlots.slice(0, 3).map(slot => ({
            utc: slot.toISOString(),
            local: slot.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: true }),
          }));

          return { status: 'UNAVAILABLE', available: false, message: 'El horario solicitado ya está ocupado.', suggestedSlots: suggestions };
        }

        case 'requestHumanHandoff': {
          const reason = input.reason || 'Derivación a ejecutivo especializado solicitada';
          this.logger.log(`[Tool requestHumanHandoff] Solicitada derivación a ejecutivo especializado. Motivo: ${reason}`);
          return {
            status: 'SUCCESS',
            isHandedOff: true,
            message: `Derivación a ejecutivo especializado registrada con éxito. Motivo: ${reason}. Procede a responder amablemente al cliente mediante final_answer informándole que ha sido derivado con un ejecutivo especializado que lo atenderá personalmente.`,
          };
        }

        default:
          return { status: 'ERROR', message: `Herramienta '${name}' no reconocida.` };
      }
    } catch (error: any) {
      this.logger.error(`Error ejecutando herramienta ${error.message || error}`);
      return { status: 'ERROR', message: error.message || 'Error desconocido' };
    }
  }

  /** Queries Cube.dev semantic layer for products matching a keyword. */
  async queryCubeProducts(queryText: string): Promise<any[]> {
    const cubeApiUrl = process.env.CUBE_API_URL || 'http://localhost:4000';
    try {
      const cleanKeyword = queryText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
      const stopwords = new Set(['dame', 'quiero', 'informacion', 'del', 'producto', 'productos', 'sobre', 'que', 'empiezan', 'con', 'modelo', 'especificaciones', 'detalles', 'buscar', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'para', 'en', 'y', 'o', 'a', 'caracteristicas', 'tienes', 'tienen', 'disponible', 'disponibles', 'catalogo', 'precios', 'precio', 'costo', 'cotizacion', 'comprar', 'venta', 'adquirir', 'fichas', 'ficha', 'manual', 'manuales', 'disponibilidad', 'ver', 'mostrar', 'listar', 'lista', 'cuales', 'servicios', 'servicio', 'articulos', 'articulo', 'dispositivos', 'dispositivo', 'cosas']);
      const words = cleanKeyword.split(/\s+/).filter(w => w.length >= 2 && !stopwords.has(w));
      const hasSearchTerm = words.length > 0;
      const topTerms = hasSearchTerm ? words.sort((a, b) => b.length - a.length).slice(0, 3) : [];

      const filters: any[] = [{ member: 'Productos.status', operator: 'equals', values: ['true'] }];
      if (hasSearchTerm && topTerms.length > 0) {
        filters.push({ member: 'Productos.nombre', operator: 'contains', values: [topTerms[0].toLowerCase()] });
      }

      const tenantSchema = TenantContextService.getTenantSchema() || 'public';
      const token = this.generateCubeToken(tenantSchema);

      const response = await fetch(`${cubeApiUrl}/cubejs-api/v1/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token, 'x-tenant-schema': tenantSchema, 'x-tenant-id': tenantSchema },
        body: JSON.stringify({ query: { measures: ['Productos.count'], dimensions: ['Productos.id', 'Productos.nombre', 'Productos.descripcion', 'Productos.precioBase', 'Productos.unidadMedida', 'Productos.observaciones', 'Productos.status'], filters }, securityContext: { tenantSchema } }),
      });

      if (!response.ok) {
        this.logger.warn(`Error de respuesta de Cube.dev: ${await response.text()}`);
        return [];
      }

      const data: any = await response.json();
      if (data && data.data) {
        return data.data.map((p: any) => ({
          content: `[PRODUCTO EN EL CATALOGO - CAPA SEMÁNTICA CUBE.DEV]\nNombre del Producto: ${p['Productos.nombre']}\nPrecio Base: $${p['Productos.precioBase'] ?? 0} MXN por ${p['Productos.unidadMedida'] || 'Pieza'}\nUnidad de Medida: ${p['Productos.unidadMedida'] || 'Pieza'}\nObservaciones / Notas de Cotización (MENCIONAR OBLIGATORIAMENTE AL CLIENTE): ${p['Productos.observaciones']?.trim() || 'Sin observaciones'}\nDescripción del Producto: ${p['Productos.descripcion'] || 'Sin descripción'}\nEstado: ${p['Productos.status'] === 'true' || p['Productos.status'] === true ? 'Activo' : 'Inactivo'}`,
          metadata: { source: 'cube-semantic-layer', productId: p['Productos.id'], productName: p['Productos.nombre'], precioBase: p['Productos.precioBase'] },
        }));
      }
      return [];
    } catch (error: any) {
      this.logger.warn(`No se pudo conectar a la capa semántica de Cube.dev (${cubeApiUrl}): ${error.message}`);
      return [];
    }
  }

  /** Queries Cube.dev by product key (slug from embeddings). */
  async queryCubeProductsByKey(productKey: string): Promise<any[]> {
    return this.queryCubeProducts(productKey.replace(/-/g, ' ').toLowerCase());
  }

  /** Finds products using Cube.dev semantic layer with DB fallback. */
  async findProductsFromSemanticLayer(searchText: string): Promise<Array<{ id: string; nombre: string }>> {
    if (!searchText || searchText.trim().length < 2) return [];
    try {
      const cubeDocs = await this.queryCubeProducts(searchText);
      const semanticProducts: Array<{ id: string; nombre: string }> = [];
      for (const doc of cubeDocs) {
        if (doc.metadata?.productId) semanticProducts.push({ id: doc.metadata.productId, nombre: doc.metadata.productName || 'Producto' });
      }
      if (semanticProducts.length > 0) {
        this.logger.log(`[Capa Semántica Cube.dev] Productos encontrados para '${searchText}': ${semanticProducts.map(p => p.nombre).join(', ')}`);
        return semanticProducts;
      }
    } catch (err: any) {
      this.logger.warn(`Error al consultar la capa semántica de Cube.dev para productos: ${err.message}`);
    }
    const dbFallback = await this.findProductsByKeywords(searchText);
    return dbFallback.map(p => ({ id: p.id, nombre: p.nombre }));
  }

  /** Synchronises existing PDF product files to RAG vector store. */
  async syncExistingProductFilesToRag(): Promise<void> {
    try {
      this.logger.log('Iniciando sincronización retrospectiva de fichas técnicas PDF al RAG vectorial...');
      const files = await this.productFileRepository.find({ relations: ['product'] });
      const fs = require('fs');
      for (const pf of files) {
        if (pf.filePath && (pf.filePath.toLowerCase().endsWith('.pdf') || pf.fileName.toLowerCase().endsWith('.pdf'))) {
          try {
            const productKey = pf.product.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const pathCandidates = [pf.filePath, `./${pf.filePath}`];
            let fileBuffer: Buffer | null = null;
            for (const p of pathCandidates) {
              if (fs.existsSync(p)) { fileBuffer = fs.readFileSync(p); break; }
            }
            if (fileBuffer) await this.ragService.ingestPdf(fileBuffer, pf.fileName, productKey);
          } catch (e: any) {
            this.logger.warn(`No se pudo sincronizar el archivo PDF '${pf.fileName}': ${e.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Error en la sincronización retrospectiva de PDFs a RAG: ${err.message}`);
    }
  }

  /** Synchronises all active catalogue products to RAG vector store. */
  async syncCatalogProductsToRag(): Promise<void> {
    try {
      this.logger.log('Iniciando sincronización retrospectiva de productos del catálogo SQL a pgvector...');
      const products = await this.productFileRepository.manager.find(Product, { where: { status: true } });
      let syncedCount = 0;
      for (const product of products) {
        await this.ragService.ingestProduct(product.id, product.nombre, product.descripcion, product.precioBase as number | null, product.unidadMedida, product.observaciones);
        syncedCount++;
      }
      this.logger.log(`Sincronización de catálogo finalizada. Se indexaron ${syncedCount} productos en pgvector.`);
    } catch (err: any) {
      this.logger.error(`Error en la sincronización retrospectiva del catálogo a RAG: ${err.message}`);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private splitFullName(fullName: string): { nombre: string; apellido: string } {
    const trimmed = fullName.trim();
    const index = trimmed.indexOf(' ');
    if (index === -1) return { nombre: trimmed, apellido: '' };
    return { nombre: trimmed.substring(0, index).trim(), apellido: trimmed.substring(index + 1).trim() };
  }

  private getMexicoCityUTCOffset(date: Date): number {
    const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const localMs = new Date(date.toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getTime();
    return Math.round((localMs - utcMs) / (1000 * 60 * 60));
  }

  private generateCubeToken(tenantSchemaOverride?: string): string {
    const crypto = require('crypto');
    const secret = 'crmtibs_secret_key_2026_xyz';
    const schema = tenantSchemaOverride || TenantContextService.getTenantSchema() || 'public';
    const payload = { exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60), tenantSchema: schema };
    const base64url = (str: string) => Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${signatureInput}.${signature}`;
  }

  private async findProductsByKeywords(searchText: string): Promise<Product[]> {
    if (!searchText || searchText.trim().length < 2) return [];
    try {
      const productRepo = this.aiAgentConfigRepository.manager.getRepository(Product);
      const cleanText = searchText.toLowerCase().trim();
      let products = await productRepo.createQueryBuilder('p').where('LOWER(p.nombre) LIKE :name', { name: `%${cleanText}%` }).andWhere('p.status = :status', { status: true }).getMany();
      if (products.length > 0) return products;
      const stopWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'para', 'con', 'sin', 'un', 'una', 'por', 'compra', 'interes', 'cotizacion', 'piezas', 'piezas/unidades']);
      const words = cleanText.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 2 && !stopWords.has(w));
      if (words.length === 0) return [];
      const qb = productRepo.createQueryBuilder('p').where('p.status = :status', { status: true });
      const wordConditions = words.map((_, idx) => `LOWER(p.nombre) LIKE :word_${idx}`);
      qb.andWhere(`(${wordConditions.join(' OR ')})`);
      const params: Record<string, any> = { status: true };
      words.forEach((w, idx) => { params[`word_${idx}`] = `%${w}%`; });
      qb.setParameters(params);
      const candidates = await qb.getMany();
      candidates.sort((a, b) => {
        const nameA = a.nombre.toLowerCase();
        const nameB = b.nombre.toLowerCase();
        const matchesA = words.filter(w => nameA.includes(w)).length;
        const matchesB = words.filter(w => nameB.includes(w)).length;
        return matchesB - matchesA;
      });
      return candidates;
    } catch (err: any) {
      this.logger.error(`Error en findProductsByKeywords: ${err.message}`);
      return [];
    }
  }

  private async deleteTemporaryClientIfUnused(oldClientId: string, newClientId: string): Promise<void> {
    if (!oldClientId || oldClientId === newClientId) return;
    try {
      const oldClient = await this.clientRepository.findOne({ where: { id: oldClientId } });
      if (!oldClient) return;
      const oldPhoneClean = PhoneUtils.cleanDigits(oldClient.telefono);
      const newClient = await this.clientRepository.findOne({ where: { id: newClientId } });
      const newPhoneClean = PhoneUtils.cleanDigits(newClient?.telefono);
      const isSamePhoneOrEmpty = !oldPhoneClean || (newPhoneClean && (oldPhoneClean === newPhoneClean || PhoneUtils.extractSubscriberSuffix(oldPhoneClean) === PhoneUtils.extractSubscriberSuffix(newPhoneClean)));
      if (!isSamePhoneOrEmpty) {
        this.logger.log(`No se elimina cliente previo ${oldClientId} porque posee un teléfono distinto (${oldClient.telefono}).`);
        return;
      }
      await this.clientRepository.manager.createQueryBuilder().update(Conversation).set({ clientId: newClientId }).where('clientId = :oldClientId', { oldClientId }).execute();
      try { await this.clientRepository.manager.createQueryBuilder().update('opportunities').set({ cliente_id: newClientId }).where('cliente_id = :oldClientId', { oldClientId }).execute(); } catch (_) {}
      try { await this.clientRepository.manager.createQueryBuilder().update('tickets').set({ clientId: newClientId }).where('clientId = :oldClientId', { oldClientId }).execute(); } catch (_) {}
      try { await this.clientRepository.manager.createQueryBuilder().update('activities').set({ clientId: newClientId }).where('clientId = :oldClientId', { oldClientId }).execute(); } catch (_) {}
      await this.clientRepository.delete(oldClientId);
      this.logger.log(`Cliente temporal (${oldClientId}) desvinculado y re-enlazado a ${newClientId} fue eliminado con éxito del CRM.`);
    } catch (err: any) {
      this.logger.warn(`No se pudo eliminar el cliente temporal ${oldClientId}: ${err.message}`);
    }
  }
}
