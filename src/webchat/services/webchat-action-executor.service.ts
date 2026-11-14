import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Raw } from 'typeorm';
import {
  normalizeText,
  rankEntitiesByRelevance,
  MIN_ENTITY_MATCH_SCORE,
  AMBIGUITY_MARGIN_SCORE,
  EntityScored,
  CRM_ENTITY_STOPWORDS,
  PG_TRANSLATE_EXPRESSION,
} from './webchat-entity-ranker.util';
import { OpportunitiesService } from '../../opportunities/opportunities.service';
import { ActivitiesService } from '../../activities/activities.service';
import { TicketsService } from '../../tickets/tickets.service';
import { ClientsService } from '../../clients/clients.service';
import { CompaniesService } from '../../companies/companies.service';
import { UsersService } from '../../users/users.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../role.enum';
import { BusinessLineOption } from '../../opportunities/entities/business-line-option.entity';
import { DeliveryTypeOption } from '../../opportunities/entities/delivery-type-option.entity';
import { LicensingOption } from '../../opportunities/entities/licensing-option.entity';
import { OpportunityLabel } from '../../opportunities/entities/opportunity-label.entity';
import { TypeActivity } from '../../activities/entities/type-activity.entity';
import { Client, ClientCategory } from '../../clients/entities/client.entity';
import { Company } from '../../companies/entities/company.entity';
import { Opportunity, Currency } from '../../opportunities/entities/opportunity.entity';
import { Stage } from '../../stages/entities/stage.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { Product } from '../../products/entities/product.entity';
import { Expense } from '../../expenses/entities/expense.entity';
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
    @InjectRepository(Stage)
    private readonly stageRepo: Repository<Stage>,
    private readonly expensesService: ExpensesService,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
  ) {}

  /**
   * Obtiene la zona horaria del sistema desde la variable de entorno NOTIFICATION_TIMEZONE.
   */
  getTimezone(): string {
    return process.env.NOTIFICATION_TIMEZONE || 'America/Mexico_City';
  }

  /**
   * Construye un objeto Date en UTC correspondiente a una fecha y hora local exacta
   * en la zona horaria de la empresa (por defecto America/Mexico_City).
   * Resistente a desfases por límites de mes y cambios de horario.
   */
  buildDateInTz(year: number, month1Indexed: number, day: number, hour: number, minute: number): Date {
    const tz = this.getTimezone();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${year}-${pad(month1Indexed)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
    const utcGuess = new Date(`${dateStr}Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(utcGuess);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const tzHour = map.hour === '24' ? 0 : parseInt(map.hour, 10);
    const tzDateStr = `${map.year}-${map.month}-${map.day}T${pad(tzHour)}:${map.minute}:00Z`;
    const tzEquivalentUtc = new Date(tzDateStr);
    const offsetMs = utcGuess.getTime() - tzEquivalentUtc.getTime();
    return new Date(utcGuess.getTime() + offsetMs);
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
    const allowedActions = new Set([
      'createOpportunity',
      'modifyOpportunity',
      'createActivity',
      'modifyActivity',
      'createTicket',
      'createClient',
      'modifyClient',
      'createCompany',
      'modifyCompany',
      'createExpense',
      'modifyExpense',
    ]);
    if (!actionPlan?.action || !allowedActions.has(actionPlan.action)) {
      this.logger.warn(`[WebChat - Action Executor] Acción bloqueada por no pertenecer al catálogo de tools permitidas: '${(actionPlan as any)?.action}'`);
      return {
        answer: `La acción solicitada no está permitida. Únicamente puedo ejecutar operaciones autorizadas sobre Clientes, Empresas, Oportunidades, Actividades, Tickets y Gastos.`,
      };
    }

    // Guardia contra operaciones destructivas o sobre entidades ajenas a las tools permitidas
    const normalizedQ = (originalQuestion || '').toLowerCase().trim();
    const isDestructiveRequest = /\b(elimina|eliminar|borra|borrar|suprime|suprimir|destruye|destruir|drop\s+table|truncate\s+table|delete\s+from)\b/i.test(normalizedQ);
    const isUnauthorizedEntityMutation = /\b(crea|crear|modifica|modificar|actualiza|actualizar|cambia|cambiar|elimina|eliminar|borra|borrar)\s+(?:el\s+|la\s+|un\s+|una\s+|los\s+|las\s+)?(usuario|usuarios|rol|roles|permiso|permisos|tenant|tenants|esquema|schema|suscripci[oó]n|plan\s+saas|contrase[ñn]a|password)\b/i.test(normalizedQ);

    if (isDestructiveRequest || isUnauthorizedEntityMutation) {
      this.logger.warn(
        `[WebChat - Action Executor] Petición con impacto a BD fuera del alcance de tools bloqueada para usuario ${user.username}: "${originalQuestion}"`,
      );
      return {
        answer: 'Por seguridad, el asistente no tiene permitido eliminar registros ni modificar usuarios, roles, permisos o configuraciones de sistema. Solo puedo crear o actualizar Clientes, Empresas, Oportunidades, Actividades, Tickets y Gastos.',
      };
    }

    let params = actionPlan.parameters || {};

    // Si faltan datos en params, enriquecer con el contexto previo de la conversación
    if (conversationHistory && conversationHistory.length > 0) {
      const prevKeys = Object.keys(params);
      params = this.mergeHistoryContext(actionPlan.action, params, conversationHistory);
      if (Object.keys(params).length > prevKeys.length) {
        this.logger.log(`[WebChat - Action Executor] 🔄 Parámetros enriquecidos por historial multi-turno: ${JSON.stringify(params)}`);
      }
    }

    const isActionAiFirst = !actionPlan.thought?.includes('Recuperación');
    this.logger.log(`[WebChat - Action Executor] [${isActionAiFirst ? 'AI-FIRST' : 'FALLBACK HEURISTICO'}] Ejecutando acción '${actionPlan.action}' para usuario ${user.username} (Rol: ${user.role}) | Parámetros: ${JSON.stringify(params)}`);

    switch (actionPlan.action) {
      case 'createOpportunity':
        return this.handleCreateOpportunity(params, user);
      case 'modifyOpportunity':
        return this.handleModifyOpportunity(params, user);
      case 'createActivity':
        return this.handleCreateActivity(params, user, originalQuestion, conversationHistory);
      case 'modifyActivity':
        return this.handleModifyActivity(params, user);
      case 'createTicket':
        return this.handleCreateTicket(params, user);
      case 'createClient':
        return this.handleCreateClient(params, user, originalQuestion);
      case 'modifyClient':
        return this.handleModifyClient(params, user, conversationHistory);
      case 'createCompany':
        return this.handleCreateCompany(params, user, originalQuestion);
      case 'modifyCompany':
        return this.handleModifyCompany(params, user, conversationHistory);
      case 'createExpense':
        return this.handleCreateExpense(params, user, conversationHistory, originalQuestion);
      case 'modifyExpense':
        return this.handleModifyExpense(params, user, conversationHistory, originalQuestion);
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
          const dateSegmentMatch = msg.match(/(?:para\s+el\s+|el\s+|para\s+)?\b(pasado\s+mañana|pasado\s+manana|pasadomañana|pasadomanana|hoy|mañana|manana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|\d{1,2}(?:\s+de|\s+)[a-záéíóú]+|\d{4}-\d{2}-\d{2})\b.*$/i)
            || msg.match(/\b(?:a\s+las?\s+|a\s+la\s+|para\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm)?.*$/i);
          if (dateSegmentMatch && dateSegmentMatch[0]) {
            merged.date = dateSegmentMatch[0].trim();
          }
        }

        // 2. Extraer texto entre comillas o detalle de actividad si falta
        if (!merged.activity && !merged.activityText && !merged.actividad && !merged.asunto && !merged.detalle && !merged.titulo) {
          const quoteMatch = msg.match(/["']([^"']{3,})["']/);
          if (quoteMatch && quoteMatch[1]) {
            merged.activity = quoteMatch[1].trim();
          } else {
            const actMatch = msg.match(/(?:crea(?:r)?|agenda(?:r)?|programa(?:r)?)\s+(?:una\s+)?(llamada|reuni[oó]n|visita|demostraci[oó]n|actividad|cita)\s+(?:para|con)?\s*([^,\.]+)/i);
            if (actMatch) {
              merged.activity = `${actMatch[1]} ${actMatch[2]}`.trim();
              if (!merged.tipoActividad) {
                merged.tipoActividad = actMatch[1].trim();
              }
            }
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
      } else if (action === 'modifyOpportunity') {
        // 1. Extraer nombre/proyecto si falta
        if (!merged.nombreProyecto && !merged.nombre_proyecto && !merged.oportunidad && !merged.opportunity && !merged.proyecto && !merged.id) {
          const oppMatch = msg.match(/(?:oportunidad|cotizaci[oó]n|proyecto)\s+["']?([^"',]+?)["']?(?:\s+de\s+|\s+a\s+|\s+mueve|\s+cambia|$)/i);
          if (oppMatch && oppMatch[1]) {
            const cand = oppMatch[1].trim();
            if (cand.length > 2 && !['prueba', 'nueva', 'esta'].includes(cand.toLowerCase())) {
              merged.nombreProyecto = cand;
            }
          }
          if (!merged.nombreProyecto) {
            const quoteMatch = msg.match(/["']([^"']{3,})["']/);
            if (quoteMatch && quoteMatch[1]) {
              merged.nombreProyecto = quoteMatch[1].trim();
            }
          }
        }

        // 2. Extraer etapa destino si falta
        if (!merged.etapa && !merged.stage && !merged.nuevaEtapa && !merged.targetStage) {
          const stageMatch = msg.match(/(?:muevela\s+a|mueve\s+a|mover\s+a|pasar\s+a|pasa\s+a|pasala\s+a|cambia\s+a|cambiar\s+a|a\s+la\s+etapa|etapa)\s+["']?([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+?)["']?(?:$|\.|\,)/i);
          if (stageMatch && stageMatch[1]) {
            const cand = stageMatch[1].trim();
            if (cand.length >= 3 && !['la', 'una', 'otra'].includes(cand.toLowerCase())) {
              merged.etapa = cand;
            }
          }
        }

        // 3. Extraer cliente/empresa si falta
        if (!merged.cliente && !merged.empresa && !merged.cuenta) {
          const clientMatch = msg.match(/(?:de\s+el\s+cliente|del\s+cliente|de\s+la\s+empresa|para\s+el\s+cliente|de)\s+["']?([^"',]+?)["']?(?:\s+muevela|\s+mueve|\s+cambia|$)/i);
          if (clientMatch && clientMatch[1]) {
            const cand = clientMatch[1].trim();
            if (cand.length > 2 && !['seguimiento', 'reunion', 'llamada', 'visita'].includes(cand.toLowerCase())) {
              merged.cliente = cand;
            }
          }
        }
      }
    }

    // 4. Si es modifyOpportunity y aún no tiene nombre de oportunidad, buscar en respuestas previas del asistente
    if (action === 'modifyOpportunity' && !merged.nombreProyecto && !merged.nombre_proyecto && !merged.oportunidad && !merged.opportunity && !merged.proyecto && !merged.id) {
      const assistantMessages = conversationHistory
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .reverse();

      for (const aMsg of assistantMessages) {
        // Buscar listado de oportunidades: "1. Cotización Red Magic (Pedro Pérez) - $300.00 MXN [Prospecto]"
        const listMatch = aMsg.match(/1\.\s+([^\(\[\n—]+?)(?:\s+\(|\s+—|\s+\[|\n|$)/);
        if (listMatch && listMatch[1]) {
          merged.nombreProyecto = listMatch[1].trim();
          break;
        }
        // Buscar respuesta de modificación/creación previa: "- Proyecto: Cotización Red Magic"
        const projMatch = aMsg.match(/-\s+Proyecto:\s+([^\n]+)/i);
        if (projMatch && projMatch[1]) {
          merged.nombreProyecto = projMatch[1].trim();
          break;
        }
      }
    }

    // 5. Si es modifyClient y no se especificó el cliente objetivo en el turno actual (ej. completando datos en el siguiente turno), recuperar del historial del asistente
    if (action === 'modifyClient' && !merged.id && !merged.clientId && !merged.clienteId && !merged.targetClient && !merged.nombreOriginal && !merged.correoOriginal && !merged.cliente && !merged.client && !merged.nombre) {
      const assistantMessages = conversationHistory
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .reverse();

      for (const aMsg of assistantMessages) {
        const clientMatch = aMsg.match(/-\s+(?:Cliente|Nombre(?:\s+Completo)?):\s+([^\n\(]+)/i);
        if (clientMatch && clientMatch[1]) {
          merged.targetClient = clientMatch[1].trim();
          break;
        }
        const listMatch = aMsg.match(/1\.\s+([^\(\[\n—]+?)(?:\s+\(|\s+—|\s+\[|\n|$)/);
        if (listMatch && listMatch[1]) {
          merged.targetClient = listMatch[1].trim();
          break;
        }
      }
    }

    // 6. Si es modifyCompany y no se especificó la empresa objetivo en el turno actual, recuperar del historial del asistente
    if (action === 'modifyCompany' && !merged.id && !merged.companyId && !merged.empresaId && !merged.targetCompany && !merged.nombreOriginal && !merged.empresa && !merged.company && !merged.nombre) {
      const assistantMessages = conversationHistory
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .reverse();

      for (const aMsg of assistantMessages) {
        const compMatch = aMsg.match(/-\s+(?:Empresa|Nombre(?:\s+Comercial)?):\s+([^\n\(]+)/i);
        if (compMatch && compMatch[1]) {
          merged.targetCompany = compMatch[1].trim();
          break;
        }
        const listMatch = aMsg.match(/1\.\s+([^\(\[\n—]+?)(?:\s+\(|\s+—|\s+\[|\n|$)/);
        if (listMatch && listMatch[1]) {
          merged.targetCompany = listMatch[1].trim();
          break;
        }
      }
    }

    if (action === 'createExpense' || action === 'modifyExpense') {
      const assistantMessages = conversationHistory
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .reverse();
      const lastAssistantMsg = assistantMessages[0] || '';
      const rawCurrentInput = (merged.__rawUserInput || '').toString().trim();
      delete merged.__rawUserInput;

      const pickMatch = rawCurrentInput.match(/^\s*(?:el|la|opci[oó]n|n[uú]mero|#)?\s*(\d+)\s*$/i);
      const pickNumber = pickMatch ? parseInt(pickMatch[1], 10) : null;

      if (pickNumber && pickNumber > 0 && lastAssistantMsg) {
        const optionRegex = new RegExp(`(?:^|\\n)\\s*${pickNumber}\\.\\s+\\*{0,2}([^\\n]+)`, 'i');
        const lineMatch = lastAssistantMsg.match(optionRegex);
        if (lineMatch && lineMatch[1]) {
          const pickedFullLine = lineMatch[1].trim();
          const pickedName = pickedFullLine
            .split(/\s+—\s+|\s+\(|\s+\[|\s+\|\s+/)[0]
            .replace(/\*{1,2}/g, '')
            .trim();

          if (/se encontraron m[uú]ltiples clientes posibles para asociar el gasto/i.test(lastAssistantMsg)) {
            merged.cliente = pickedName;
          } else if (/se encontraron m[uú]ltiples oportunidades posibles para asociar el gasto/i.test(lastAssistantMsg)) {
            merged.oportunidad = pickedName;
          } else if (action === 'modifyExpense' && /encontr[eé] varios gastos que coinciden/i.test(lastAssistantMsg)) {
            merged.targetExpense = pickedName;
            const amountInLine = pickedFullLine.match(/\$([\d,]+(?:\.\d{1,2})?)/);
            if (amountInLine && amountInLine[1]) {
              merged.targetMonto = Number(amountInLine[1].replace(/,/g, ''));
            }
            const dateInLine = pickedFullLine.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/i);
            if (dateInLine && dateInLine[1]) {
              merged.targetFecha = dateInLine[1];
            }
          }
        }
      }

      if (action === 'createExpense') {
        if (!merged.concepto) {
          const conceptFromAssistant =
            lastAssistantMsg.match(/[-•]\s*\*{0,2}Concepto:\*{0,2}\s*([^\n]+)/i) ||
            lastAssistantMsg.match(/del gasto de \*{0,2}"([^"]+)"\*{0,2}/i);
          if (conceptFromAssistant && conceptFromAssistant[1]) {
            merged.concepto = conceptFromAssistant[1].replace(/\*{1,2}/g, '').trim();
          }
        }
        if (merged.monto === undefined || merged.monto === null || merged.monto === '') {
          const amountFromAssistant =
            lastAssistantMsg.match(/[-•]\s*\*{0,2}Monto:\*{0,2}\s*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
            lastAssistantMsg.match(/del gasto por \*{0,2}\$?([\d,]+(?:\.\d{1,2})?)/i);
          if (amountFromAssistant && amountFromAssistant[1]) {
            merged.monto = Number(amountFromAssistant[1].replace(/,/g, ''));
          }
        }
        if (!merged.fecha) {
          const dateFromAssistant = lastAssistantMsg.match(/[-•]\s*\*{0,2}Fecha:\*{0,2}\s*(\d{4}-\d{2}-\d{2})/i);
          if (dateFromAssistant && dateFromAssistant[1]) {
            merged.fecha = dateFromAssistant[1].trim();
          }
        }

        const isAwaitingAssociation =
          /todo gasto debe asociarse a|¿a qu[eé] \*{0,2}cliente\*{0,2} o \*{0,2}oportunidad\*{0,2} deseas asociar este gasto|no se vinculan directamente a empresas|se encontraron m[uú]ltiples (?:clientes|oportunidades) posibles para asociar el gasto/i.test(
            lastAssistantMsg,
          );

        for (const msg of userMessages) {
          if (merged.monto === undefined || merged.monto === null || merged.monto === '') {
            const parsedFromHistory = this.extractAmountFromSentence(msg);
            if (parsedFromHistory !== null) {
              merged.monto = parsedFromHistory;
            }
          }
          if (!merged.fecha) {
            const dateFromHistory = this.extractDateTokenFromText(msg);
            if (dateFromHistory) {
              merged.fecha = dateFromHistory;
            }
          }
          if (!merged.concepto) {
            const cleanedHistConcept = this.extractConceptFromExpenseSentence(msg);
            if (cleanedHistConcept) {
              merged.concepto = cleanedHistConcept;
            }
          }
          if (
            !isAwaitingAssociation &&
            !merged.cliente &&
            !merged.clientName &&
            !merged.client_id &&
            !merged.oportunidad &&
            !merged.opportunity &&
            !merged.opportunity_id
          ) {
            const oppHist = msg.match(
              /\b(?:para\s+la\s+|de\s+la\s+|a\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:por|de\s+\$?\d|monto|fecha|hoy|ayer)|$|[,.])/i,
            );
            if (oppHist && oppHist[1]) {
              merged.oportunidad = oppHist[1].trim();
            } else {
              const cliHist = msg.match(
                /\b(?:para\s+el\s+|del\s+|con\s+(?:el\s+)?|al?\s+)cliente\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:por|de\s+\$?\d|monto|fecha|hoy|ayer)|$|[,.])/i,
              );
              if (cliHist && cliHist[1]) {
                merged.cliente = cliHist[1].trim();
              }
            }
          }
        }
      }

      if (action === 'modifyExpense') {
        if (!merged.targetExpense && !merged.targetConcepto && !merged.expenseId) {
          const identifiedMatch =
            lastAssistantMsg.match(/Identifiqu[eé] el gasto \*{0,2}"?([^"*\n(]+?)"?\*{0,2}\s*\(/i) ||
            lastAssistantMsg.match(/Gasto Registrado Exitosamente[\s\S]*?[-•]\s*\*{0,2}Concepto:\*{0,2}\s*([^\n]+)/i);
          if (identifiedMatch && identifiedMatch[1]) {
            merged.targetExpense = identifiedMatch[1].replace(/\*{1,2}/g, '').trim();
          }
        }

        const hasExplicitChange =
          merged.monto !== undefined ||
          merged.concepto !== undefined ||
          merged.nuevoConcepto !== undefined ||
          merged.fecha !== undefined ||
          merged.nuevaFecha !== undefined ||
          merged.cliente !== undefined ||
          merged.oportunidad !== undefined;

        if (!hasExplicitChange && pickNumber) {
          for (const msg of userMessages) {
            if (merged.monto === undefined) {
              const modAmountMatch =
                msg.match(/\b(?:monto(?:\s+a)?|a|por)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i) ||
                msg.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/i);
              if (modAmountMatch && modAmountMatch[1]) {
                merged.monto = Number(modAmountMatch[1].replace(/,/g, ''));
              }
            }
            if (!merged.nuevaFecha && !merged.fecha) {
              const modDateMatch = msg.match(
                /\b(?:fecha\s+(?:a|por|para|=)\s*|a\s+)(hoy|ayer|anteayer|antier|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+de\s+\d{4})?)\b/i,
              );
              if (modDateMatch && modDateMatch[1]) {
                merged.fecha = modDateMatch[1].trim();
              }
            }
            if (!merged.nuevoConcepto) {
              const modConceptMatch = msg.match(
                /\b(?:nuevo\s+concepto|concepto\s+(?:a|por|=))\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:y\s+monto|monto|fecha|cliente|oportunidad)|$|[,.])/i,
              );
              if (modConceptMatch && modConceptMatch[1]) {
                merged.nuevoConcepto = modConceptMatch[1].trim();
              }
            }
            if (!merged.cliente && !merged.oportunidad) {
              const modOppMatch = msg.match(
                /\b(?:a\s+la\s+|al?\s+|para\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:y\s+|monto|concepto|fecha)|$|[,.])/i,
              );
              if (modOppMatch && modOppMatch[1]) {
                merged.oportunidad = modOppMatch[1].trim();
              } else {
                const modCliMatch = msg.match(
                  /\b(?:al?\s+|para\s+el\s+)cliente\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:y\s+|monto|concepto|fecha)|$|[,.])/i,
                );
                if (modCliMatch && modCliMatch[1]) {
                  merged.cliente = modCliMatch[1].trim();
                }
              }
            }
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
      const resolved = await this.resolveClientOrCompany(oppClientHint);
      if (resolved.company) {
        companyEntity = resolved.company;
        companyId = resolved.company.id;
      }
      if (resolved.client) {
        clientEntity = resolved.client;
        clienteId = resolved.client.id;
        if (!companyId && clientEntity.companyId) companyId = clientEntity.companyId;
      }
    }

    if (!companyId && params.companyId && this.isValidUuid(params.companyId)) {
      companyId = params.companyId;
      companyEntity = await this.companyRepo.findOne({ where: { id: companyId } });
    } else if (!companyId && oppCompanyHint) {
      const resolved = await this.resolveClientOrCompany(oppCompanyHint);
      if (resolved.company) {
        companyEntity = resolved.company;
        companyId = resolved.company.id;
      } else if (resolved.client && !clientEntity) {
        clientEntity = resolved.client;
        clienteId = resolved.client.id;
        if (clientEntity.companyId) companyId = clientEntity.companyId;
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
      canal_origen: 'webchat',
    } as any, user);

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

    let ambiguousOpportunities: Opportunity[] = [];

    if (params.id && this.isValidUuid(params.id)) {
      opp = await this.opportunityRepo.findOne({
        where: { id: params.id },
        relations: ['opportunityProducts', 'stage', 'cliente', 'company', 'linea_negocio', 'tipo_entrega', 'licenciamiento'],
      });
    }

    if (!opp && searchTitle) {
      const oppResolution = await this.resolveOpportunityResolution(searchTitle, user, isExec, companyHint, clientHint);
      opp = oppResolution.item;
      ambiguousOpportunities = oppResolution.ambiguousCandidates;
    }

    // Si hubo múltiples coincidencias ambiguas, solicitar confirmación al usuario
    if (!opp && ambiguousOpportunities.length > 1) {
      const optionsList = ambiguousOpportunities.map((o, idx) => {
        const clienteNom = o.cliente ? `${o.cliente.nombre || ''} ${o.cliente.apellido || ''}`.trim() : (o.empresa || 'Sin cliente');
        const etapaNom = o.stage?.strname || 'Activa';
        const montoStr = new Intl.NumberFormat('es-MX', { style: 'currency', currency: o.moneda || 'MXN' }).format(Number(o.monto_total) || 0);
        return `${idx + 1}. **${o.nombre_proyecto}** (${clienteNom} — ${montoStr} [${etapaNom}])`;
      }).join('\n');

      return {
        answer: `Encontré varias oportunidades activas que coinciden con "${searchTitle}". ¿A cuál de ellas te refieres?\n\n${optionsList}\n\nPor favor, indícame el nombre exacto o número de la oportunidad para aplicar los cambios con seguridad.`,
        data: ambiguousOpportunities.map(o => ({
          'ID': o.id,
          'Proyecto': o.nombre_proyecto,
          'Cliente/Empresa': o.empresa || (o.cliente ? `${o.cliente.nombre || ''} ${o.cliente.apellido || ''}`.trim() : 'N/A'),
          'Monto': new Intl.NumberFormat('es-MX', { style: 'currency', currency: o.moneda || 'MXN' }).format(Number(o.monto_total) || 0),
          'Etapa': o.stage?.strname || 'Activa',
        })),
      };
    }

    // Si aún no encuentra y se especificó empresa/cliente, buscar la más reciente para esa cuenta
    if (!opp && (companyHint || clientHint)) {
      const hint = (companyHint || clientHint).trim();
      const qbAccount = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .where('opp.archived = :archived', { archived: false })
        .andWhere(
          '(opp.empresa ILIKE :hint OR company.nombre ILIKE :hint OR cliente.nombre ILIKE :hint OR CONCAT(cliente.nombre, \' \', COALESCE(cliente.apellido, \'\')) ILIKE :hint OR public.f_unaccent_immutable(opp.empresa) ILIKE public.f_unaccent_immutable(:hint) OR public.f_unaccent_immutable(company.nombre) ILIKE public.f_unaccent_immutable(:hint))',
          { hint: `%${hint}%` }
        );

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

    // H. Cambio de Etapa / Fase (Pipeline)
    const stageHint =
      params.etapa ||
      params.stage ||
      params.nuevaEtapa ||
      params.nuevoStage ||
      params.targetStage ||
      params.etapaId ||
      params.stageId ||
      params.nombreEtapa ||
      params.fase ||
      params.estado;

    if (stageHint) {
      const resolvedStage = await this.resolveStage(String(stageHint), opp.pipeline_id);
      if (resolvedStage) {
        updateData.stage_id = resolvedStage.id;
      } else {
        const activeStages = await this.stageRepo.find({
          where: { pipeline_id: opp.pipeline_id, blnstatus: true },
          order: { display_order: 'ASC' },
        });
        const optionsStr = activeStages.length > 0
          ? activeStages.map(s => `  - ${s.strname}`).join('\n')
          : '  - No hay etapas configuradas';
        return {
          answer: `No encontré la etapa "${stageHint}" en el pipeline de la oportunidad "${opp.nombre_proyecto}". Las etapas disponibles son:\n\n${optionsStr}`,
        };
      }
    }

    // Si no se especificó ningún campo a modificar
    if (Object.keys(updateData).length === 0) {
      return {
        answer: `No se identificó ningún cambio para la oportunidad "${opp.nombre_proyecto}". Puedes indicarme, por ejemplo: cambiar el monto, el nombre o moverla de etapa (ej. "mueve a Calificado").`,
      };
    }

    const updatedOpp = await this.opportunitiesService.update(opp.id, updateData, user);
    const montoDisplay = new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_total || 0);
    const montoLicDisplay = updatedOpp.monto_licenciamiento ? `\n- Monto ${customLabels.licenciamiento}: ` + new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_licenciamiento) : '';
    const montoServDisplay = updatedOpp.monto_servicios ? `\n- Monto ${customLabels.tipoEntrega}: ` + new Intl.NumberFormat('es-MX', { style: 'currency', currency: updatedOpp.moneda || 'MXN' }).format(updatedOpp.monto_servicios) : '';

    const prevStageName = opp.stage?.strname || 'Sin etapa';
    const isStageChanged = updateData.stage_id && updateData.stage_id !== opp.stage_id;
    const stageDisplay = isStageChanged
      ? `${prevStageName} ➔ ${updatedOpp.stage?.strname || 'Nueva Etapa'}`
      : (updatedOpp.stage?.strname || 'Activa');

    return {
      answer: `Oportunidad Modificada Exitosamente\n\n- Proyecto: ${updatedOpp.nombre_proyecto}\n- Monto Total: ${montoDisplay}${montoLicDisplay}${montoServDisplay}\n- Etapa: ${stageDisplay}`,
      data: [{
        'ID': updatedOpp.id,
        'Proyecto': updatedOpp.nombre_proyecto,
        'Monto': montoDisplay,
        'Etapa': updatedOpp.stage?.strname || 'Activa',
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
  async handleCreateActivity(
    params: any,
    user: User,
    originalQuestion?: string,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
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

    // 3. Verificación estricta de Fecha y Hora (Requerida - PROHIBIDO ALUCINAR O ASUMIR)
    // Si la invocación proviene del flujo del usuario (originalQuestion definido) y no se especificó
    // ninguna expresión temporal ni en la consulta ni en el historial reciente, se descartan
    // fechas u horas generadas por alucinación del LLM.
    if (originalQuestion !== undefined) {
      const hasTemporal = this.hasTemporalReference(originalQuestion, conversationHistory);
      if (!hasTemporal) {
        delete params.date;
        delete params.fecha;
        delete params.hora;
        delete params.proposedDate;
        delete params.time;
        delete params.hour;
      }
    }

    const dateRaw = params.date || params.fecha || params.hora || params.proposedDate || params.time;
    if (!dateRaw) {
      missingFields.push('• Fecha y Hora: Especifica para cuándo deseas agendarla (ej. "mañana a las 4pm", "el viernes a las 11:00").');
    }

    const timeExplicit = params.hora || params.time || params.hour || undefined;
    const proposedDate = dateRaw ? this.parseNaturalDate(dateRaw, timeExplicit) : null;
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

    // Si no vinieron explícitos en params, extraer con regex de activityText
    if (!rawCompanyHint && activityText) {
      const matchEmp = activityText.match(/(?:de\s+la\s+empresa|de\s+la\s+cuenta|empresa|cuenta)\s+["']?([^"',]+?)["']?(?:\s+y\s+de\s+tipo|\s+y\s+tipo|\s+mañana|\s+hoy|\s+el\s+|\s+con\s+|\s+para\s+|$)/i);
      if (matchEmp && matchEmp[1]) {
        rawCompanyHint = matchEmp[1].trim();
      }
    }

    if (!rawClientHint && activityText) {
      const matchClient = activityText.match(/(?:para\s+el\s+cliente|para\s+la\s+cuenta|con\s+el\s+cliente|con|para)\s+["']?([A-ZÁÉÍÓÚa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚa-záéíóúñ]+)?)["']?(?:\s+de\s+la\s+empresa|\s+de\s+|\s+y\s+de\s+tipo|\s+y\s+tipo|\s+mañana|\s+hoy|\s+el\s+|$)/i);
      if (matchClient && matchClient[1]) {
        const candidate = matchClient[1].trim();
        if (candidate.length > 2 && !['seguimiento', 'reunion', 'llamada', 'visita', 'correo', 'demostracion'].includes(candidate.toLowerCase())) {
          rawClientHint = candidate;
        }
      }
    }

    // A. Resolución explícita de Empresa primero (si el usuario especificó una empresa, esta toma prioridad)
    if (params.companyId && this.isValidUuid(params.companyId)) {
      companyId = params.companyId;
      companyEntity = await this.companyRepo.findOne({ where: { id: companyId } });
    } else if (rawCompanyHint) {
      companyEntity = await this.resolveCompany(rawCompanyHint);
      if (companyEntity) {
        companyId = companyEntity.id;
      }
    }

    // B. Resolución de Cliente
    if (params.clientId && this.isValidUuid(params.clientId)) {
      clientId = params.clientId;
      clientEntity = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!companyId && clientEntity?.companyId) {
        companyId = clientEntity.companyId;
      }
    } else if (rawClientHint) {
      const resolved = await this.resolveClientOrCompany(rawClientHint);
      if (resolved.client) {
        clientEntity = resolved.client;
        clientId = clientEntity.id;
        // Solo adoptar la empresa del contacto si el usuario NO especificó una empresa distinta
        if (!companyId && clientEntity.companyId) {
          companyId = clientEntity.companyId;
        }
      } else if (resolved.company && !companyId) {
        // Fallback: Si el usuario dijo "cliente X" pero X es en realidad una Empresa registrada (ej. "cliente universidad metropolitana")
        companyEntity = resolved.company;
        companyId = resolved.company.id;
      }
    }

    // C. Oportunidad relacionada (si existe)
    if (params.opportunityId && this.isValidUuid(params.opportunityId)) {
      opportunityId = params.opportunityId;
    } else if (params.oportunidad) {
      const foundOpp = await this.resolveOpportunityByTitle(String(params.oportunidad), user, false, rawCompanyHint, rawClientHint);
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
    const rawReminder = params.recordatorio ?? params.reminder ?? params.reminderTime ?? params.reminderDate;
    const combinedReminderStr = [String(rawReminder || ''), activityText, originalQuestion || ''].join(' ');
    const reminderMention = rawReminder !== undefined || /(?:recordatorio|reordatorio|recordar|alarma)/i.test(combinedReminderStr);

    if (reminderMention || params.reminderTitle) {
      let remDate: string;
      const remLower = combinedReminderStr.toLowerCase();

      // Caso A: Misma hora / Al momento
      if (remLower.includes('misma hora') || remLower.includes('al momento') || remLower.includes('a la misma')) {
        remDate = proposedDate!.toISOString();
      }
      // Caso B: Fecha completa explícita en reminderDate
      else if (params.reminderDate && !isNaN(new Date(params.reminderDate).getTime())) {
        remDate = this.parseNaturalDate(params.reminderDate).toISOString();
      }
      // Caso C: Minutos / Horas antes (ej. "2 horas antes", "30 minutos antes", "1 hora antes")
      else if (/(?:(\d+)\s*(?:horas?|hrs?|h)\s+antes|(\d+)\s*(?:minutos?|mins?|m)\s+antes)/i.test(combinedReminderStr)) {
        const hMatch = combinedReminderStr.match(/(\d+)\s*(?:horas?|hrs?|h)\s+antes/i);
        const mMatch = combinedReminderStr.match(/(\d+)\s*(?:minutos?|mins?|m)\s+antes/i);
        const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
        const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
        const totalOffsetMs = (hours * 60 + minutes) * 60 * 1000;
        remDate = new Date(proposedDate!.getTime() - totalOffsetMs).toISOString();
      }
      // Caso D: Hora específica indicada para el recordatorio (ej. "con recordatorio a la 1 pm", "a las 13:00", o rawReminder = "1 pm")
      else if (
        /(?:recordatorio|reordatorio|recordar|alarma)\s+(?:a\s+las?|para\s+las?|a\s+la|para\s+la)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.test(combinedReminderStr) ||
        (typeof rawReminder === 'string' && /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.test(rawReminder))
      ) {
        const timeMatch = combinedReminderStr.match(/(?:recordatorio|reordatorio|recordar|alarma)\s+(?:a\s+las?|para\s+las?|a\s+la|para\s+la)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) ||
                          String(rawReminder).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

        if (timeMatch) {
          let remHour = parseInt(timeMatch[1], 10);
          const remMinutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          const meridiem = timeMatch[3]?.toLowerCase();

          if (meridiem === 'pm' && remHour < 12) remHour += 12;
          if (meridiem === 'am' && remHour === 12) remHour = 0;
          if (!meridiem && remHour < 8) remHour += 12;

          const tz = this.getTimezone();
          const pParts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour12: false,
          }).formatToParts(proposedDate!);
          const pMap: Record<string, number> = {};
          for (const p of pParts) pMap[p.type] = parseInt(p.value, 10);

          const finalRemDate = this.buildDateInTz(pMap.year, pMap.month, pMap.day, remHour, remMinutes);
          remDate = finalRemDate.toISOString();
        } else {
          const offsetMs = (params.reminderMinutesBefore ? Number(params.reminderMinutesBefore) : 60) * 60 * 1000;
          remDate = new Date(proposedDate!.getTime() - offsetMs).toISOString();
        }
      }
      // Caso E: Default con reminderMinutesBefore o 60 minutos antes
      else {
        const offsetMs = (params.reminderMinutesBefore ? Number(params.reminderMinutesBefore) : 60) * 60 * 1000;
        remDate = new Date(proposedDate!.getTime() - offsetMs).toISOString();
      }

      reminder = {
        title: params.reminderTitle || `Recordatorio: ${activityText}`,
        date: remDate,
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
    } as any, targetUserId === user.id ? user : ({ ...user, id: targetUserId } as User));

    const typeName = createdActivity?.typeActivity?.strname || resolvedType?.name || 'Actividad';
    const dateFormatted = createdActivity?.date
      ? new Date(createdActivity.date).toLocaleString('es-MX', {
          timeZone: this.getTimezone(),
          dateStyle: 'full',
          timeStyle: 'short',
        })
      : proposedDate!.toLocaleString('es-MX', {
          timeZone: this.getTimezone(),
          dateStyle: 'full',
          timeStyle: 'short',
        });

    if (!clientEntity && createdActivity?.client) {
      clientEntity = createdActivity.client;
    }
    if (!companyEntity && createdActivity?.company) {
      companyEntity = createdActivity.company;
    }
    if (!companyEntity && clientEntity?.companyId) {
      companyEntity = await this.companyRepo.findOne({ where: { id: clientEntity.companyId } });
    }

    const contactOrAccount = clientEntity
      ? `${clientEntity.nombre} ${clientEntity.apellido || ''}`.trim() + (companyEntity ? ` (${companyEntity.nombre})` : '')
      : (companyEntity
          ? `${rawClientHint ? `${rawClientHint} ` : ''}(${companyEntity.nombre})`
          : (rawClientHint || null));

    const extraInfo = contactOrAccount ? `\n- Cliente / Cuenta: ${contactOrAccount}` : '';
    let reminderInfo = '';
    if (reminder) {
      const remDateFormatted = new Date(reminder.date).toLocaleString('es-MX', {
        timeZone: this.getTimezone(),
        timeStyle: 'short',
        dateStyle: 'short',
      });
      reminderInfo = `\n- Recordatorio: Activado (${remDateFormatted})`;
    }

    return {
      answer: `Actividad Programada Exitosamente\n\n- Tipo: ${typeName}\n- Detalle: ${createdActivity.activity}\n- Fecha y Hora: ${dateFormatted}\n- Asignada a: ${targetUserName}${extraInfo}${reminderInfo}`,
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
    const targetDateRaw = params.targetDate || params.originalDate || params.currentDate || params.fechaOriginal || params.dateOriginal || params.existingDate;
    const targetTimeRaw = params.targetTime || params.horaOriginal || params.originalTime;
    const targetActivityRaw = params.targetActivity || params.currentActivity || params.originalActivity || params.nombreOriginal || params.searchActivity || params.existingActivity;
    const newActivityRaw = params.newActivity || params.nuevoNombre || params.newName || params.nuevoTitulo || params.newTitle || params.nombreNuevo || params.tituloNuevo;
    const newDateRaw = params.newDate || params.nuevaFecha || params.rescheduleDate || params.newProposedDate;
    const newTimeRaw = params.newTime || params.nuevaHora;
    const genericDate = params.date || params.fecha;
    const genericTime = params.hora || params.time;
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
    const searchDateCandidate = targetDateRaw || targetTimeRaw || (newDateRaw || newTimeRaw ? null : (newActivityRaw ? (genericDate || genericTime) : null)) || ((genericDate || genericTime) && !targetActivityRaw ? (genericDate || genericTime) : null);
    if (!activity && searchDateCandidate) {
      const parsedTarget = this.parseNaturalDate(searchDateCandidate, targetTimeRaw);
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
    const candidateNewDateStr = newDateRaw || newTimeRaw || (targetActivityRaw && (genericDate || genericTime) ? (genericDate || genericTime) : null);
    if (candidateNewDateStr) {
      const newDate = this.parseNaturalDate(candidateNewDateStr, newTimeRaw);
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

    // E. Actualización o Reprogramación de Recordatorio
    if (params.recordatorio || params.reminderTitle) {
      const targetBaseDate = updateDto.date ? new Date(updateDto.date) : new Date(activity.date);
      let remDate: string;
      const remStr = String(params.recordatorio || '').toLowerCase();
      if (remStr.includes('misma hora') || remStr.includes('al momento') || remStr.includes('a la misma')) {
        remDate = targetBaseDate.toISOString();
      } else if (params.reminderDate) {
        remDate = this.parseNaturalDate(params.reminderDate).toISOString();
      } else {
        const offsetMs = (params.reminderMinutesBefore ? Number(params.reminderMinutesBefore) : 60) * 60 * 1000;
        remDate = new Date(targetBaseDate.getTime() - offsetMs).toISOString();
      }
      updateDto.reminder = {
        title: params.reminderTitle || `Recordatorio: ${updateDto.activity || activity.activity}`,
        date: remDate,
      };
    }

    const updated = await this.activitiesService.update(activity.id, updateDto, user);
    const dateFormatted = new Date(updated.date).toLocaleString('es-MX', {
      timeZone: this.getTimezone(),
      dateStyle: 'full',
      timeStyle: 'short',
    });

    let reminderInfo = '';
    const remObj = (updated as any).reminder || updateDto.reminder;
    if (remObj?.date) {
      const remDateFormatted = new Date(remObj.date).toLocaleString('es-MX', {
        timeZone: this.getTimezone(),
        timeStyle: 'short',
        dateStyle: 'short',
      });
      reminderInfo = `\n- Recordatorio: Activado (${remDateFormatted})`;
    }

    return {
      answer: `Actividad Modificada con Éxito\n\n- Detalle: ${updated.activity}\n- Fecha y Hora: ${dateFormatted}${reminderInfo}`,
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
    } as any, user);

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

  // ─── 4. CLIENTES Y EMPRESAS ───────────────────────────────────────────────────

  private parseClientCategory(raw?: string): ClientCategory | undefined {
    if (!raw || typeof raw !== 'string') return undefined;
    const norm = this.normalizeString(raw);
    if (norm.includes('contacto')) return ClientCategory.CONTACTO;
    if (norm.includes('cliente')) return ClientCategory.CLIENTE;
    if (norm.includes('lead') || norm.includes('prospecto')) return ClientCategory.LEAD;
    return undefined;
  }

  private formatProperName(value: string): string {
    if (!value) return '';
    return value
      .trim()
      .split(/\s+/)
      .map(w => {
        if (!w) return '';
        if (w === w.toLowerCase() && /^[a-záéíóúñü]+$/i.test(w)) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return w;
      })
      .join(' ');
  }

  private normalizeSpokenContactText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let result = text.trim();

    if (/\barroba\b/i.test(result)) {
      result = result
        .replace(/\s+arroba\s+/gi, '@')
        .replace(/(\S+)\s+punto\s+(\S+)/gi, '$1.$2')
        .replace(/(\S+)\s+guion\s+bajo\s+(\S+)/gi, '$1_$2')
        .replace(/(\S+)\s+guion\s+(\S+)/gi, '$1-$2');
    }

    const unitsAndTeens: Record<string, number> = {
      cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
      trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
      dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
      veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
      veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
    };
    const tens: Record<string, number> = {
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
      setenta: 70, ochenta: 80, noventa: 90,
    };
    const hundreds: Record<string, number> = {
      cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
      trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
      quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
      setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
      novecientos: 900, novecientas: 900,
    };

    const normWord = (w: string) =>
      w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const tokens = result.split(/\s+/);

    const parseSubHundred = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (unitsAndTeens[w] !== undefined) {
        return { val: String(unitsAndTeens[w]), nextIdx: idx + 1 };
      }
      if (tens[w] !== undefined) {
        const base = tens[w];
        if (idx + 2 < tokens.length && normWord(tokens[idx + 1]) === 'y') {
          const u = normWord(tokens[idx + 2]);
          if (unitsAndTeens[u] !== undefined && unitsAndTeens[u] >= 1 && unitsAndTeens[u] <= 9) {
            return { val: String(base + unitsAndTeens[u]), nextIdx: idx + 3 };
          }
        }
        return { val: String(base), nextIdx: idx + 1 };
      }
      return null;
    };

    const parseNumberGroup = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (/^\d+$/.test(w)) {
        return { val: w, nextIdx: idx + 1 };
      }
      if (hundreds[w] !== undefined) {
        const hVal = hundreds[w];
        if (w === 'cien') {
          return { val: '100', nextIdx: idx + 1 };
        }
        const sub = parseSubHundred(idx + 1);
        if (sub) {
          return { val: String(hVal + parseInt(sub.val, 10)), nextIdx: sub.nextIdx };
        }
        return { val: String(hVal), nextIdx: idx + 1 };
      }
      return parseSubHundred(idx);
    };

    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const groups: string[] = [];
      let curr = i;
      while (curr < tokens.length) {
        const g = parseNumberGroup(curr);
        if (!g) break;
        groups.push(g.val);
        curr = g.nextIdx;
      }
      const joined = groups.join('');
      if (groups.length >= 2 && joined.length >= 7 && joined.length <= 15) {
        out.push(joined);
        i = curr;
      } else {
        out.push(tokens[i]);
        i++;
      }
    }
    return out.join(' ');
  }

  private splitFullName(rawName: string, rawLastName?: string): { nombre: string; apellido: string } {
    const cleaned = (rawName || '')
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:el\s+|la\s+|un\s+|una\s+|al\s+)?(?:cliente|contacto|prospecto|lead)\s+/i, '')
      .trim();

    const explicitLast = (rawLastName || '').replace(/^["']|["']$/g, '').trim();
    if (explicitLast) {
      return { nombre: this.formatProperName(cleaned), apellido: this.formatProperName(explicitLast) };
    }

    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return { nombre: this.formatProperName(cleaned), apellido: '' };
    }
    if (parts.length === 2) {
      return { nombre: this.formatProperName(parts[0]), apellido: this.formatProperName(parts[1]) };
    }
    if (parts.length === 3) {
      return { nombre: this.formatProperName(parts[0]), apellido: this.formatProperName(parts.slice(1).join(' ')) };
    }
    return {
      nombre: this.formatProperName(parts.slice(0, 2).join(' ')),
      apellido: this.formatProperName(parts.slice(2).join(' ')),

    };
  }

  /**
   * Crea un cliente/contacto en el CRM permitiendo guardado parcial (solo requiere el nombre).
   * Respeta RBAC: los ejecutivos asignan automáticamente el registro a su propio usuario.
   */
  async handleCreateClient(params: any, user: User, originalQuestion?: string): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);

    // 1. Asignación de Ejecutivo (RBAC)
    let targetExecutiveId = user.id;
    let targetExecutiveName = user.username;

    if (!isExec && (params.ejecutivo || params.ejecutivoId || params.user || params.userId)) {
      const foundUser = await this.resolveUser(params.ejecutivo || params.ejecutivoId || params.user || params.userId);
      if (foundUser) {
        targetExecutiveId = foundUser.id;
        targetExecutiveName = foundUser.username;
      }
    }

    // 2. Nombre y Apellido (Único dato obligatorio: nombre; permite guardado con datos parciales)
    let rawName = this.normalizeSpokenContactText(String(params.nombre || params.name || params.cliente || params.client || params.contacto || '')).trim();
    const normQuestion = this.normalizeSpokenContactText(originalQuestion || '');
    let embeddedEmail = '';
    let embeddedPhone = '';

    if (!rawName && normQuestion && !/^(?:crea(?:r)?|registra(?:r)?|da(?:r)?\s+de\s+alta|agrega(?:r)?|nuevo|nueva)\s+(?:un\s+|una\s+|el\s+|la\s+|al\s+)?(?:cliente|contacto|prospecto|lead)\s*$/i.test(normQuestion)) {
      rawName = normQuestion
        .replace(/^(?:crea(?:r)?|registra(?:r)?|da(?:r)?\s+de\s+alta|agrega(?:r)?|nuevo|nueva)\s+(?:un\s+|una\s+|el\s+|la\s+|al\s+)?(?:cliente|contacto|prospecto|lead)?\s*/i, '')
        .trim();
    }

    const emailInName = rawName.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailInName) {
      embeddedEmail = emailInName[0].trim();
      rawName = rawName.replace(emailInName[0], '').trim();
    }
    const phoneInName = rawName.match(/\b(\d{7,15})\b/);
    if (phoneInName && phoneInName[1]) {
      embeddedPhone = phoneInName[1].trim();
      rawName = rawName.replace(phoneInName[0], '').replace(/\b(tel[eé]fono|cel(?:ular)?|tel|n[uú]mero|correo|email)\b/gi, '').trim();
    }
    const rawLastName = (params.apellido || params.apellidos || params.lastName || '').trim();
    const { nombre, apellido } = this.splitFullName(rawName, rawLastName);

    if (!nombre || nombre.length < 2) {
      return {
        answer: `Para registrar al cliente o contacto, por favor indícame al menos su Nombre.\n\nTambién puedes compartir los siguientes datos opcionales (el registro puede guardarse aunque la información no esté completa):\n• Apellido\n• Correo electrónico\n• Teléfono\n• Puesto o cargo\n• Empresa\n• Categoría (Lead, Contacto o Cliente)`,
      };
    }

    // 3. Campos opcionales
    const correo = this.normalizeSpokenContactText(String(params.correo || params.email || embeddedEmail || '')).trim() || undefined;
    const telefono = this.normalizeSpokenContactText(String(params.telefono || params.phone || params.celular || params.tel || embeddedPhone || '')).trim() || undefined;
    const puesto = (params.puesto || params.cargo || params.position || '').trim() || undefined;
    let empresa = (params.empresa || params.company || params.compania || params.cuenta || '').trim() || undefined;
    const category = this.parseClientCategory(params.category || params.categoria || params.tipo) || ClientCategory.LEAD;

    // 4. Validación de duplicados por correo o teléfono
    if (correo) {
      const existingEmail = await this.clientRepo.findOne({ where: { correo: ILike(correo) } }).catch(() => null);
      if (existingEmail) {
        const existingFullName = `${existingEmail.nombre} ${existingEmail.apellido || ''}`.trim();
        return {
          answer: `Ya existe un cliente registrado con el correo ${correo} (${existingFullName}). Si deseas actualizar su información, indícame qué datos quieres modificar.`,
        };
      }
    }

    if (telefono) {
      const existingPhone = await this.clientsService.findByPhone(telefono).catch(() => null);
      if (existingPhone) {
        const existingFullName = `${existingPhone.nombre} ${existingPhone.apellido || ''}`.trim();
        return {
          answer: `Ya existe un cliente registrado con el teléfono ${telefono} (${existingFullName}). Si deseas actualizar sus datos, indícame qué cambios deseas realizar.`,
        };
      }
    }

    // 5. Resolución de Empresa (si se proporcionó nombre de empresa, vincula la existente o la crea en ClientsService)
    let companyId: string | undefined = params.companyId && this.isValidUuid(params.companyId) ? params.companyId : undefined;
    if (!companyId && empresa) {
      const resolvedComp = await this.resolveCompany(empresa);
      if (resolvedComp) {
        companyId = resolvedComp.id;
        empresa = resolvedComp.nombre;
        this.logger.log(`[WebChat - createClient] Empresa existente encontrada: "${resolvedComp.nombre}" (ID: ${resolvedComp.id}). Se vinculará al nuevo contacto "${nombre} ${apellido}".`);
      } else {
        this.logger.log(`[WebChat - createClient] La empresa "${empresa}" no existe en el catálogo. Se creará automáticamente en BD y se vinculará al nuevo contacto "${nombre} ${apellido}".`);
      }
    }

    // 6. Guardar el cliente en BD (incluso si faltan datos opcionales)
    const createdClient = await this.clientsService.create({
      nombre,
      apellido: apellido || undefined,
      correo,
      telefono,
      puesto,
      empresa,
      companyId,
      category,
      estatus: true,
      ejecutivo_id: targetExecutiveId,
    });

    const fullName = `${createdClient.nombre} ${createdClient.apellido || ''}`.trim();
    // 7. Identificar campos opcionales pendientes para informar amablemente al usuario
    const companyDisplay = createdClient.empresa || empresa || 'Sin empresa asignada';
    this.logger.log(`[WebChat - createClient] Contacto registrado: "${fullName}" (ID: ${createdClient.id}) | Empresa: "${companyDisplay}" (companyId: ${createdClient.companyId || companyId || 'N/A'}) | Ejecutivo: ${targetExecutiveName}.`);
    // 7. Identificar campos opcionales pendientes para informar amablemente al usuario

    // 7. Identificar campos opcionales pendientes para informar amablemente al usuario
    const pendingFields: string[] = [];
    if (!createdClient.apellido) pendingFields.push('Apellido');
    if (!createdClient.correo) pendingFields.push('Correo electrónico');
    if (!createdClient.telefono) pendingFields.push('Teléfono');
    if (!createdClient.puesto) pendingFields.push('Puesto');
    if (!createdClient.empresa && !createdClient.companyId) pendingFields.push('Empresa');

    const pendingNote = pendingFields.length > 0
      ? `\n\nNota: El cliente se guardó exitosamente con la información proporcionada. Si deseas completar los datos faltantes ahora o más adelante, puedes indicarme: ${pendingFields.join(', ')}.`
      : '';

    return {
      answer: `Cliente Registrado Exitosamente\n\n- Nombre: ${fullName}\n- Categoría: ${createdClient.category || category}\n- Empresa: ${companyDisplay}\n- Correo: ${createdClient.correo || 'No especificado'}\n- Teléfono: ${createdClient.telefono || 'No especificado'}\n- Puesto: ${createdClient.puesto || 'No especificado'}\n- Ejecutivo: ${targetExecutiveName}${pendingNote}`,
      data: [{
        'ID': createdClient.id,
        'Nombre': fullName,
        'Categoría': createdClient.category || category,
        'Empresa': companyDisplay,
        'Correo': createdClient.correo || 'N/A',
        'Teléfono': createdClient.telefono || 'N/A',
        'Puesto': createdClient.puesto || 'N/A',
        'Ejecutivo': targetExecutiveName,
      }],
      dashboardRedirect: {
        tab: 'commercial',
        executiveId: targetExecutiveId,
      },
    };
  }

  /**
   * Modifica un cliente/contacto existente validando pertenencia (RBAC: ejecutivos solo modifican registros propios).
   */
  async handleModifyClient(
    params: any,
    user: User,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);

    const id = params.id || params.clientId || params.clienteId;
    const explicitTarget = params.targetClient || params.nombreOriginal || params.correoOriginal || params.cliente || params.client;
    const searchHint = (explicitTarget || params.nombre || params.name || '').trim();

    let client: Client | null = null;

    if (id && this.isValidUuid(id)) {
      client = await this.clientRepo.findOne({
        where: { id },
        relations: ['company', 'ejecutivo'],
      }).catch(() => null);
    }

    if (!client && searchHint) {
      const resolution = await this.resolveClientResolution(searchHint, user, isExec);
      if (resolution.ambiguousCandidates.length > 1) {
        const listText = resolution.ambiguousCandidates
          .map((c, idx) => {
            const cName = `${c.nombre} ${c.apellido || ''}`.trim();
            const cComp = c.empresa || c.company?.nombre || 'Sin empresa';
            const cEmail = c.correo ? ` — ${c.correo}` : '';
            return `${idx + 1}. ${cName} (${cComp})${cEmail} [${c.category || 'Lead'}]`;
          })
          .join('\n');

        return {
          answer: `Encontré varios clientes que coinciden con "${searchHint}". ¿Cuál de ellos deseas actualizar?\n\n${listText}\n\nPor favor indícame el nombre completo o correo del cliente y el cambio que deseas aplicar.`,
        };
      }
      client = resolution.item;
    }

    if (!client) {
      return {
        answer: searchHint
          ? `No encontré ningún cliente o contacto que coincida con "${searchHint}". Por favor verifica el nombre o correo electrónico.`
          : `Por favor indícame el nombre o correo del cliente que deseas actualizar y los datos que quieres modificar.`,
      };
    }

    // Validación RBAC: Ejecutivo solo puede modificar sus propios registros
    if (isExec && client.ejecutivo_id !== user.id) {
      return {
        answer: `Acceso Denegado: Solo tienes permitido modificar los clientes y contactos asignados a tu propia cuenta.`,
      };
    }

    const updateDto: any = {};

    // 1. Nuevo Nombre / Apellido
    const explicitNewName = (params.nuevoNombre || params.newName || '').trim();
    const explicitNewLastName = (params.nuevoApellido || params.newLastName || params.apellido || params.apellidos || '').trim();

    if (explicitNewName) {
      if (!explicitNewLastName && explicitNewName.includes(' ')) {
        const split = this.splitFullName(explicitNewName);
        updateDto.nombre = split.nombre;
        if (split.apellido) updateDto.apellido = split.apellido;
      } else {
        updateDto.nombre = explicitNewName;
      }
    } else if (explicitTarget && params.nombre) {
      const candidateNewName = String(params.nombre).trim();
      const currentFull = `${client.nombre} ${client.apellido || ''}`.trim();
      if (
        candidateNewName &&
        this.normalizeString(candidateNewName) !== this.normalizeString(client.nombre) &&
        this.normalizeString(candidateNewName) !== this.normalizeString(currentFull)
      ) {
        if (!explicitNewLastName && candidateNewName.includes(' ')) {
          const split = this.splitFullName(candidateNewName);
          updateDto.nombre = split.nombre;
          if (split.apellido) updateDto.apellido = split.apellido;
        } else {
          updateDto.nombre = candidateNewName;
        }
      }
    }

    if (explicitNewLastName && !updateDto.apellido) {
      updateDto.apellido = explicitNewLastName;
    }

    // 2. Correo electrónico (validando unicidad)
    const newEmail = (params.nuevoCorreo || params.newEmail || params.correo || params.email || '').trim();
    if (newEmail && newEmail.toLowerCase() !== (client.correo || '').toLowerCase()) {
      const dup = await this.clientRepo.findOne({ where: { correo: ILike(newEmail) } }).catch(() => null);
      if (dup && dup.id !== client.id) {
        const dupName = `${dup.nombre} ${dup.apellido || ''}`.trim();
        return {
          answer: `No es posible asignar el correo ${newEmail} porque ya está registrado para otro cliente (${dupName}).`,
        };
      }
      updateDto.correo = newEmail;
    }

    // 3. Teléfono
    const newPhone = (params.nuevoTelefono || params.newPhone || params.telefono || params.phone || params.celular || params.tel || '').trim();
    if (newPhone && newPhone !== (client.telefono || '')) {
      updateDto.telefono = newPhone;
    }

    // 4. Puesto / Cargo
    const newPosition = (params.nuevoPuesto || params.newPosition || params.puesto || params.cargo || params.position || '').trim();
    if (newPosition && newPosition !== (client.puesto || '')) {
      updateDto.puesto = newPosition;
    }

    // 5. Empresa
    const newCompanyStr = (params.nuevaEmpresa || params.newCompany || params.empresa || params.company || params.compania || params.cuenta || '').trim();
    if (newCompanyStr) {
      const resolvedComp = await this.resolveCompany(newCompanyStr);
      if (resolvedComp) {
        updateDto.companyId = resolvedComp.id;
        updateDto.empresa = resolvedComp.nombre;
        this.logger.log(`[WebChat - modifyClient] Empresa existente encontrada: "${resolvedComp.nombre}" (ID: ${resolvedComp.id}). Se vinculará al contacto "${client.nombre}".`);
      } else {
        this.logger.log(`[WebChat - modifyClient] La empresa "${newCompanyStr}" no existe en el catálogo. Se creará automáticamente en BD y se vinculará al contacto "${client.nombre}".`);
        updateDto.empresa = newCompanyStr;
        updateDto.ejecutivo_id = client.ejecutivo_id || user.id;
      }
      }

    // 6. Categoría (Lead, Contacto, Cliente)
    const newCat = this.parseClientCategory(params.nuevaCategoria || params.category || params.categoria || params.tipo);
    if (newCat && newCat !== client.category) {
      updateDto.category = newCat;
    }

    // 7. Estatus (Activo / Inactivo)
    const rawStatus = params.estatus !== undefined ? params.estatus : (params.status !== undefined ? params.status : params.activo);
    if (rawStatus !== undefined && rawStatus !== null) {
      if (typeof rawStatus === 'boolean') {
        updateDto.estatus = rawStatus;
      } else {
        const sNorm = this.normalizeString(String(rawStatus));
        if (sNorm === 'true' || sNorm === 'activo' || sNorm === 'activa' || sNorm === '1') {
          updateDto.estatus = true;
        } else if (sNorm === 'false' || sNorm === 'inactivo' || sNorm === 'inactiva' || sNorm === '0') {
          updateDto.estatus = false;
        }
      }
    }

    // 8. Reasignación de Ejecutivo (Solo Admin / SuperAdmin)
    if (!isExec && (params.ejecutivo || params.nuevoEjecutivo || params.ejecutivoId)) {
      const resolvedExec = await this.resolveUser(params.ejecutivo || params.nuevoEjecutivo || params.ejecutivoId);
      if (resolvedExec) {
        updateDto.ejecutivo_id = resolvedExec.id;
      }
    }

    if (Object.keys(updateDto).length === 0) {
      const currentFullName = `${client.nombre} ${client.apellido || ''}`.trim();
      return {
        answer: `Identifiqué al cliente ${currentFullName}, pero no detecté qué dato nuevo deseas asignarle. Por favor indícame qué campo quieres actualizar (nombre, apellido, correo, teléfono, puesto, empresa o categoría).`,
      };
    }

    const updatedClient = await this.clientsService.update(client.id, updateDto);
    const updatedFullName = `${updatedClient.nombre} ${updatedClient.apellido || ''}`.trim();
    this.logger.log(`[WebChat - modifyClient] Contacto actualizado: "${updatedFullName}" (ID: ${updatedClient.id}) | Empresa: "${updatedClient.empresa || client.empresa || 'N/A'}" (companyId: ${updatedClient.companyId || updateDto.companyId || 'N/A'}).`);
    const companyDisplay = updatedClient.empresa || client.empresa || client.company?.nombre || 'Sin empresa asignada';

    return {
      answer: `Cliente Actualizado con Éxito\n\n- Nombre: ${updatedFullName}\n- Categoría: ${updatedClient.category}\n- Empresa: ${companyDisplay}\n- Correo: ${updatedClient.correo || 'No especificado'}\n- Teléfono: ${updatedClient.telefono || 'No especificado'}\n- Puesto: ${updatedClient.puesto || 'No especificado'}`,
      data: [{
        'ID': updatedClient.id,
        'Nombre': updatedFullName,
        'Categoría': updatedClient.category,
        'Empresa': companyDisplay,
        'Correo': updatedClient.correo || 'N/A',
        'Teléfono': updatedClient.telefono || 'N/A',
        'Puesto': updatedClient.puesto || 'N/A',
      }],
      dashboardRedirect: {
        tab: 'commercial',
        executiveId: updatedClient.ejecutivo_id || user.id,
      },
    };
  }

  /**
   * Crea una empresa/cuenta corporativa permitiendo guardado parcial (solo requiere el nombre).
   * Respeta RBAC: los ejecutivos asignan automáticamente la empresa a su propio usuario.
   */
  async handleCreateCompany(params: any, user: User, originalQuestion?: string): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);

    // 1. Asignación de Ejecutivo (RBAC)
    let targetExecutiveId = user.id;
    let targetExecutiveName = user.username;

    if (!isExec && (params.ejecutivo || params.ejecutivoId || params.user || params.userId)) {
      const foundUser = await this.resolveUser(params.ejecutivo || params.ejecutivoId || params.user || params.userId);
      if (foundUser) {
        targetExecutiveId = foundUser.id;
        targetExecutiveName = foundUser.username;
      }
    }

    // 2. Nombre comercial (único campo requerido para guardar)
    let rawName = this.normalizeSpokenContactText(String(params.nombre || params.empresa || params.company || params.name || params.cuenta || '')).trim();
    const normQuestion = this.normalizeSpokenContactText(originalQuestion || '');
    let embeddedEmail = '';
    let embeddedPhone = '';

    if (!rawName && normQuestion && !/^(?:crea(?:r)?|registra(?:r)?|da(?:r)?\s+de\s+alta|agrega(?:r)?|nueva|nuevo)\s+(?:una\s+|la\s+|a\s+la\s+)?(?:empresa|compañ[ií]a|cuenta(?:\s+corporativa)?)\s*$/i.test(normQuestion)) {
      rawName = normQuestion
        .replace(/^(?:crea(?:r)?|registra(?:r)?|da(?:r)?\s+de\s+alta|agrega(?:r)?|nueva|nuevo)\s+(?:una\s+|la\s+|a\s+la\s+)?(?:empresa|compañ[ií]a|cuenta(?:\s+corporativa)?)?\s*/i, '')
        .trim();
    }

    const emailInName = rawName.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailInName) {
      embeddedEmail = emailInName[0].trim();
      rawName = rawName.replace(emailInName[0], '').trim();
    }
    const phoneInName = rawName.match(/\b(\d{7,15})\b/);
    if (phoneInName && phoneInName[1]) {
      embeddedPhone = phoneInName[1].trim();
      rawName = rawName.replace(phoneInName[0], '').replace(/\b(tel[eé]fono|cel(?:ular)?|tel|n[uú]mero|correo|email)\b/gi, '').trim();
    }
    const nombre = rawName
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:la\s+|una\s+|a\s+la\s+)?(?:empresa|compañ[ií]a|cuenta(?:\s+corporativa)?)\s+/i, '')
      .trim();

    if (!nombre || nombre.length < 2) {
      return {
        answer: `Para registrar una nueva empresa, por favor indícame al menos su Nombre comercial o razón social.\n\nOpcionalmente también puedes compartir (el registro se guardará aunque no estén todos los datos):\n• Correo de contacto\n• Teléfono\n• Sitio web (Website)\n• Dirección`,
      };
    }

    // 3. Verificar si ya existe una empresa con el mismo nombre
    const existingCompany = await this.companyRepo.findOne({
      where: { nombre: ILike(nombre) },
    }).catch(() => null);

    if (existingCompany) {
      return {
        answer: `La empresa ${existingCompany.nombre} ya se encuentra registrada en el CRM. Si deseas actualizar su correo, teléfono, sitio web o dirección, indícame los nuevos datos.`,
      };
    }

    // 4. Campos opcionales
    const correo = this.normalizeSpokenContactText(String(params.correo || params.email || embeddedEmail || '')).trim() || undefined;
    const telefono = this.normalizeSpokenContactText(String(params.telefono || params.phone || params.celular || params.tel || embeddedPhone || '')).trim() || undefined;
    const website = (params.website || params.web || params.sitioWeb || '').trim() || undefined;
    const direccion = (params.direccion || params.address || params.ubicacion || '').trim() || undefined;

    // 5. Crear Empresa en BD
    const createdCompany = await this.companiesService.create({
      nombre,
      correo,
      telefono,
      website,
      direccion,
      estatus: true,
      ejecutivo_id: targetExecutiveId,
    });

    // 6. Identificar campos opcionales pendientes para informar al usuario
    const pendingFields: string[] = [];
    if (!createdCompany.correo) pendingFields.push('Correo de contacto');
    if (!createdCompany.telefono) pendingFields.push('Teléfono');
    if (!createdCompany.website) pendingFields.push('Sitio web');
    if (!createdCompany.direccion) pendingFields.push('Dirección');

    const pendingNote = pendingFields.length > 0
      ? `\n\nNota: La empresa se guardó exitosamente con la información proporcionada. Si deseas completar sus datos más adelante, puedes indicarme: ${pendingFields.join(', ')}.`
      : '';

    return {
      answer: `Empresa Registrada Exitosamente\n\n- Empresa: ${createdCompany.nombre}\n- Correo: ${createdCompany.correo || 'No especificado'}\n- Teléfono: ${createdCompany.telefono || 'No especificado'}\n- Sitio Web: ${createdCompany.website || 'No especificado'}\n- Dirección: ${createdCompany.direccion || 'No especificada'}\n- Ejecutivo: ${targetExecutiveName}${pendingNote}`,
      data: [{
        'ID': createdCompany.id,
        'Empresa': createdCompany.nombre,
        'Correo': createdCompany.correo || 'N/A',
        'Teléfono': createdCompany.telefono || 'N/A',
        'Sitio Web': createdCompany.website || 'N/A',
        'Dirección': createdCompany.direccion || 'N/A',
        'Ejecutivo': targetExecutiveName,
      }],
      dashboardRedirect: {
        tab: 'commercial',
        executiveId: targetExecutiveId,
      },
    };
  }

  /**
   * Modifica una empresa existente validando pertenencia (RBAC: ejecutivos solo modifican empresas propias).
   */
  async handleModifyCompany(
    params: any,
    user: User,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);

    const id = params.id || params.companyId || params.empresaId;
    const explicitTarget = params.targetCompany || params.nombreOriginal || params.empresa || params.company || params.cuenta;
    const searchHint = (explicitTarget || params.nombre || params.name || '').trim();

    let company: Company | null = null;

    if (id && this.isValidUuid(id)) {
      company = await this.companyRepo.findOne({
        where: { id },
        relations: ['ejecutivo'],
      }).catch(() => null);
    }

    if (!company && searchHint) {
      const resolution = await this.resolveCompanyResolution(searchHint, user, isExec);
      if (resolution.ambiguousCandidates.length > 1) {
        const listText = resolution.ambiguousCandidates
          .map((comp, idx) => {
            const cEmail = comp.correo ? ` — ${comp.correo}` : '';
            const cPhone = comp.telefono ? ` (${comp.telefono})` : '';
            return `${idx + 1}. ${comp.nombre}${cEmail}${cPhone}`;
          })
          .join('\n');

        return {
          answer: `Encontré varias empresas que coinciden con "${searchHint}". ¿Cuál de ellas deseas actualizar?\n\n${listText}\n\nPor favor indícame el nombre exacto de la empresa y el dato que deseas modificar.`,
        };
      }
      company = resolution.item;
    }

    if (!company) {
      return {
        answer: searchHint
          ? `No encontré ninguna empresa que coincida con "${searchHint}". Por favor verifica el nombre comercial.`
          : `Por favor indícame el nombre de la empresa que deseas actualizar y los campos a modificar.`,
      };
    }

    // Validación RBAC: Ejecutivo solo puede modificar sus propias empresas
    if (isExec && company.ejecutivo_id !== user.id) {
      return {
        answer: `Acceso Denegado: Solo tienes permitido modificar las empresas asignadas a tu propia cuenta.`,
      };
    }

    const updateDto: any = {};

    // 1. Nuevo Nombre Comercial
    const explicitNewName = (params.nuevoNombre || params.newName || '').trim();
    if (explicitNewName && this.normalizeString(explicitNewName) !== this.normalizeString(company.nombre)) {
      updateDto.nombre = explicitNewName;
    } else if (explicitTarget && params.nombre) {
      const candidateNewName = String(params.nombre).trim();
      if (candidateNewName && this.normalizeString(candidateNewName) !== this.normalizeString(company.nombre)) {
        updateDto.nombre = candidateNewName;
      }
    }

    // 2. Correo
    const newEmail = (params.nuevoCorreo || params.newEmail || params.correo || params.email || '').trim();
    if (newEmail && newEmail.toLowerCase() !== (company.correo || '').toLowerCase()) {
      updateDto.correo = newEmail;
    }

    // 3. Teléfono
    const newPhone = (params.nuevoTelefono || params.newPhone || params.telefono || params.phone || params.celular || params.tel || '').trim();
    if (newPhone && newPhone !== (company.telefono || '')) {
      updateDto.telefono = newPhone;
    }

    // 4. Sitio Web
    const newWebsite = (params.nuevoWebsite || params.newWebsite || params.website || params.web || params.sitioWeb || '').trim();
    if (newWebsite && newWebsite !== (company.website || '')) {
      updateDto.website = newWebsite;
    }

    // 5. Dirección
    const newAddress = (params.nuevaDireccion || params.newAddress || params.direccion || params.address || params.ubicacion || '').trim();
    if (newAddress && newAddress !== (company.direccion || '')) {
      updateDto.direccion = newAddress;
    }

    // 6. Estatus
    const rawStatus = params.estatus !== undefined ? params.estatus : (params.status !== undefined ? params.status : params.activo);
    if (rawStatus !== undefined && rawStatus !== null) {
      if (typeof rawStatus === 'boolean') {
        updateDto.estatus = rawStatus;
      } else {
        const sNorm = this.normalizeString(String(rawStatus));
        if (sNorm === 'true' || sNorm === 'activo' || sNorm === 'activa' || sNorm === '1') {
          updateDto.estatus = true;
        } else if (sNorm === 'false' || sNorm === 'inactivo' || sNorm === 'inactiva' || sNorm === '0') {
          updateDto.estatus = false;
        }
      }
    }

    // 7. Reasignación de Ejecutivo (Solo Admin / SuperAdmin)
    if (!isExec && (params.ejecutivo || params.nuevoEjecutivo || params.ejecutivoId)) {
      const resolvedExec = await this.resolveUser(params.ejecutivo || params.nuevoEjecutivo || params.ejecutivoId);
      if (resolvedExec) {
        updateDto.ejecutivo_id = resolvedExec.id;
      }
    }

    if (Object.keys(updateDto).length === 0) {
      return {
        answer: `Identifiqué a la empresa ${company.nombre}, pero no detecté qué campo deseas actualizar. Por favor indícame el nuevo nombre, correo, teléfono, sitio web o dirección.`,
      };
    }

    const updatedCompany = await this.companiesService.update(company.id, updateDto);

    return {
      answer: `Empresa Actualizada con Éxito\n\n- Empresa: ${updatedCompany.nombre}\n- Correo: ${updatedCompany.correo || 'No especificado'}\n- Teléfono: ${updatedCompany.telefono || 'No especificado'}\n- Sitio Web: ${updatedCompany.website || 'No especificado'}\n- Dirección: ${updatedCompany.direccion || 'No especificada'}`,
      data: [{
        'ID': updatedCompany.id,
        'Empresa': updatedCompany.nombre,
        'Correo': updatedCompany.correo || 'N/A',
        'Teléfono': updatedCompany.telefono || 'N/A',
        'Sitio Web': updatedCompany.website || 'N/A',
        'Dirección': updatedCompany.direccion || 'N/A',
      }],
      dashboardRedirect: {
        tab: 'commercial',
        executiveId: updatedCompany.ejecutivo_id || user.id,
      },
    };
  }

  /**
   * Resuelve un cliente por nombre/correo/teléfono detectando ambigüedad y priorizando
   * los registros propios cuando el usuario es Ejecutivo.
   */
  async resolveClientResolution(
    searchHint: string,
    user: User,
    isExec: boolean,
  ): Promise<{ item: Client | null; ambiguousCandidates: Client[] }> {
    const clean = (searchHint || '').replace(/^["']|["']$/g, '').trim();
    if (!clean) return { item: null, ambiguousCandidates: [] };

    if (this.isValidUuid(clean)) {
      const c = await this.clientRepo.findOne({ where: { id: clean }, relations: ['company', 'ejecutivo'] }).catch(() => null);
      return { item: c, ambiguousCandidates: [] };
    }

    const cleanNorm = normalizeText(clean);
    const words = cleanNorm.split(/\s+/).filter(w => w.length >= 2);
    const nonStopWords = words.filter(w => !CRM_ENTITY_STOPWORDS.has(w));
    const wordsToSearch = nonStopWords.length > 0 ? nonStopWords : words;

    const candidateWhere: any[] = [
      { nombre: ILike(`%${clean}%`) },
      { apellido: ILike(`%${clean}%`) },
      { correo: ILike(`%${clean}%`) },
      { telefono: ILike(`%${clean}%`) },
    ];

    if (cleanNorm) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
        { apellido: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
      );
    }

    for (const w of wordsToSearch) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { apellido: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { nombre: ILike(`%${w}%`) },
        { apellido: ILike(`%${w}%`) },
      );
    }

    let candidates: Client[] = [];
    try {
      candidates = await this.clientRepo.find({
        where: candidateWhere,
        relations: ['company', 'ejecutivo'],
        order: { nombre: 'ASC' },
        take: 30,
      });
    } catch {
      candidates = await this.clientRepo.find({
        where: [
          { nombre: ILike(`%${clean}%`) },
          { apellido: ILike(`%${clean}%`) },
          { correo: ILike(`%${clean}%`) },
          ...wordsToSearch.map(w => ({ nombre: ILike(`%${w}%`) })),
          ...wordsToSearch.map(w => ({ apellido: ILike(`%${w}%`) })),
        ],
        relations: ['company', 'ejecutivo'],
        order: { nombre: 'ASC' },
        take: 30,
      }).catch(() => []);
    }

    if (candidates.length === 0) return { item: null, ambiguousCandidates: [] };

    // Si es ejecutivo y hay candidatos propios que coinciden, priorizar el subconjunto propio;
    // si solo existen candidatos de otros ejecutivos, conservarlos para disparar el mensaje explícito de Acceso Denegado.
    const ownCandidates = isExec ? candidates.filter(c => c.ejecutivo_id === user.id) : candidates;
    const pool = isExec && ownCandidates.length > 0 ? ownCandidates : candidates;

    if (pool.length === 1) {
      return { item: pool[0], ambiguousCandidates: [] };
    }

    const ranked = rankEntitiesByRelevance(
      pool,
      clean,
      (c: Client) => [
        `${c.nombre || ''} ${c.apellido || ''}`.trim(),
        c.nombre,
        c.apellido,
        c.correo || '',
        c.telefono || '',
      ],
    );

    if (ranked.length === 0) {
      return { item: pool[0], ambiguousCandidates: [] };
    }

    const best = ranked[0];
    const second = ranked[1];

    if (best && second) {
      const diff = best.score - second.score;
      if (diff < AMBIGUITY_MARGIN_SCORE && second.score >= 500) {
        return {
          item: null,
          ambiguousCandidates: ranked.slice(0, 5).map(r => r.item),
        };
      }
    }

    return { item: best.item, ambiguousCandidates: [] };
  }

  /**
   * Resuelve una empresa por nombre/correo detectando ambigüedad y priorizando
   * las empresas propias cuando el usuario es Ejecutivo.
   */
  async resolveCompanyResolution(
    searchHint: string,
    user: User,
    isExec: boolean,
  ): Promise<{ item: Company | null; ambiguousCandidates: Company[] }> {
    const clean = (searchHint || '').replace(/^["']|["']$/g, '').trim();
    if (!clean) return { item: null, ambiguousCandidates: [] };

    if (this.isValidUuid(clean)) {
      const comp = await this.companyRepo.findOne({ where: { id: clean }, relations: ['ejecutivo'] }).catch(() => null);
      return { item: comp, ambiguousCandidates: [] };
    }

    const cleanNorm = normalizeText(clean);
    const words = cleanNorm.split(/\s+/).filter(w => w.length >= 2);
    const nonStopWords = words.filter(w => !CRM_ENTITY_STOPWORDS.has(w));
    const wordsToSearch = nonStopWords.length > 0 ? nonStopWords : words;

    const candidateWhere: any[] = [
      { nombre: ILike(`%${clean}%`) },
      { correo: ILike(`%${clean}%`) },
    ];

    if (cleanNorm) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
      );
    }

    for (const w of wordsToSearch) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { nombre: ILike(`%${w}%`) },
      );
    }

    let candidates: Company[] = [];
    try {
      candidates = await this.companyRepo.find({
        where: candidateWhere,
        relations: ['ejecutivo'],
        order: { nombre: 'ASC' },
        take: 30,
      });
    } catch {
      candidates = await this.companyRepo.find({
        where: [
          { nombre: ILike(`%${clean}%`) },
          ...wordsToSearch.map(w => ({ nombre: ILike(`%${w}%`) })),
        ],
        relations: ['ejecutivo'],
        order: { nombre: 'ASC' },
        take: 30,
      }).catch(() => []);
    }

    if (candidates.length === 0) return { item: null, ambiguousCandidates: [] };

    const ownCandidates = isExec ? candidates.filter(c => c.ejecutivo_id === user.id) : candidates;
    const pool = isExec && ownCandidates.length > 0 ? ownCandidates : candidates;

    if (pool.length === 1) {
      return { item: pool[0], ambiguousCandidates: [] };
    }

    const ranked = rankEntitiesByRelevance(
      pool,
      clean,
      (comp: Company) => [comp.nombre, comp.correo, comp.telefono, comp.website],
    );

    if (ranked.length === 0) {
      return { item: pool[0], ambiguousCandidates: [] };
    }

    const best = ranked[0];
    const second = ranked[1];

    if (best && second) {
      const diff = best.score - second.score;
      if (diff < AMBIGUITY_MARGIN_SCORE && second.score >= 500) {
        return {
          item: null,
          ambiguousCandidates: ranked.slice(0, 5).map(r => r.item),
        };
      }
    }

    return { item: best.item, ambiguousCandidates: [] };
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
    const tz = this.getTimezone();
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(proposedDate);
    const pMap: Record<string, string> = {};
    for (const p of dateParts) pMap[p.type] = p.value;
    const year = parseInt(pMap.year, 10);
    const month = parseInt(pMap.month, 10);
    const day = parseInt(pMap.day, 10);

    const dayStart = this.buildDateInTz(year, month, day, 0, 0);
    const dayEnd = this.buildDateInTz(year, month, day, 23, 59);
    dayEnd.setSeconds(59, 999);

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

    // Calcular horarios sugeridos en la zona horaria del sistema del tenant
    const suggestedSlots: string[] = [];
    for (let hour = 9; hour <= 17; hour++) {
      const slotCandidate = this.buildDateInTz(year, month, day, hour, 0);
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

  // ============================================================================
  // 8. MÓDULO DE GASTOS (CREATE & MODIFY EN WEBCHAT INTERNO - LECTURA VIA CUBE)
  // ============================================================================

  private getTodayInTzYYYYMMDD(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.getTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value || String(new Date().getFullYear());
    const month = parts.find((p) => p.type === 'month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
    const day = parts.find((p) => p.type === 'day')?.value || String(new Date().getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDaysToYYYYMMDD(ymd: string, deltaDays: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
    const yy = utc.getUTCFullYear();
    const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(utc.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private formatExpenseDateDisplay(fecha: Date | string | null | undefined): string {
    if (!fecha) return this.getTodayInTzYYYYMMDD();
    if (typeof fecha === 'string') {
      const m = fecha.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : fecha;
    }
    if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
      return fecha.toISOString().slice(0, 10);
    }
    return String(fecha);
  }

  private extractDateTokenFromText(text: string): string | null {
    if (!text) return null;
    const match = text.match(
      /\b(?:fecha(?:\s+(?:del|a|para|en|:))?\s*)?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|hoy|ayer|anteayer|antier|hace\s+\d+\s+d[ií]as?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+pasado)\b/i,
    );
    return match && match[1] ? match[1].trim() : null;
  }

  private resolveExpenseDateInput(rawDate?: string | null): string | null {
    if (!rawDate || !String(rawDate).trim()) return null;
    const clean = this.normalizeString(String(rawDate));
    const todayYmd = this.getTodayInTzYYYYMMDD();

    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
    }

    const slashMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
      const dd = slashMatch[1].padStart(2, '0');
      const mm = slashMatch[2].padStart(2, '0');
      const yyyy = slashMatch[3];
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
        return `${yyyy}-${mm}-${dd}`;
      }
    }

    if (clean === 'hoy' || clean === 'el dia de hoy') {
      return todayYmd;
    }
    if (clean === 'ayer') {
      return this.addDaysToYYYYMMDD(todayYmd, -1);
    }
    if (clean === 'anteayer' || clean === 'antier') {
      return this.addDaysToYYYYMMDD(todayYmd, -2);
    }

    const agoMatch = clean.match(/^hace\s+(\d+)\s+dias?$/);
    if (agoMatch) {
      const n = parseInt(agoMatch[1], 10);
      if (!Number.isNaN(n) && n >= 0) {
        return this.addDaysToYYYYMMDD(todayYmd, -n);
      }
    }

    const months: Record<string, number> = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
    };
    const monthMatch = clean.match(/^(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?$/);
    if (monthMatch && months[monthMatch[2]]) {
      const day = Number(monthMatch[1]);
      const month = months[monthMatch[2]];
      const year = monthMatch[3] ? Number(monthMatch[3]) : Number(todayYmd.slice(0, 4));
      if (day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const weekdays: Record<string, number> = {
      domingo: 0,
      lunes: 1,
      martes: 2,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sabado: 6,
    };
    const weekdayMatch = clean.match(/^(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?:\s+pasado)?$/);
    if (weekdayMatch && weekdays[weekdayMatch[1]] !== undefined) {
      const targetDow = weekdays[weekdayMatch[1]];
      const [y, m, d] = todayYmd.split('-').map(Number);
      const todayDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      let diff = todayDow - targetDow;
      if (diff <= 0) diff += 7;
      return this.addDaysToYYYYMMDD(todayYmd, -diff);
    }

    return null;
  }

  private parseSpokenSpanishNumber(raw: string): number | null {
    if (!raw) return null;
    const normalized = this.normalizeString(raw)
      .replace(/[,$]/g, '')
      .replace(/\b(?:pesos|mxn|usd|dolares|de|y)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;
    if (/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      return Number(normalized);
    }

    const wordMap: Record<string, number> = {
      cero: 0,
      un: 1,
      uno: 1,
      una: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
      once: 11,
      doce: 12,
      trece: 13,
      catorce: 14,
      quince: 15,
      dieciseis: 16,
      diecisiete: 17,
      dieciocho: 18,
      diecinueve: 19,
      veinte: 20,
      veintiun: 21,
      veintiuno: 21,
      veintiuna: 21,
      veintidos: 22,
      veintitres: 23,
      veinticuatro: 24,
      veinticinco: 25,
      veintiseis: 26,
      veintisiete: 27,
      veintiocho: 28,
      veintinueve: 29,
      treinta: 30,
      cuarenta: 40,
      cincuenta: 50,
      sesenta: 60,
      setenta: 70,
      ochenta: 80,
      noventa: 90,
      cien: 100,
      ciento: 100,
      doscientos: 200,
      doscientas: 200,
      trescientos: 300,
      trescientas: 300,
      cuatrocientos: 400,
      cuatrocientas: 400,
      quinientos: 500,
      quinientas: 500,
      seiscientos: 600,
      seiscientas: 600,
      setecientos: 700,
      setecientas: 700,
      ochocientos: 800,
      ochocientas: 800,
      novecientos: 900,
      novecientas: 900,
    };

    const tokens = normalized.split(' ');
    let current = 0;
    let total = 0;
    let matchedWord = false;

    for (const tok of tokens) {
      if (tok === 'mil') {
        matchedWord = true;
        total += (current || 1) * 1000;
        current = 0;
      } else if (tok === 'millon' || tok === 'millones') {
        matchedWord = true;
        total += (current || 1) * 1000000;
        current = 0;
      } else if (wordMap[tok] !== undefined) {
        matchedWord = true;
        current += wordMap[tok];
      }
    }

    if (!matchedWord) return null;
    return total + current;
  }

  private extractAmountFromSentence(text: string): number | null {
    if (!text) return null;
    const m =
      text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/\bmonto(?:\s+de)?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i) ||
      text.match(
        /\b(?:de|por|a)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)?\b(?!\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b)/i,
      ) ||
      text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)\b/i);

    if (m && m[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!Number.isNaN(n) && n > 0) return n;
    }

    const spokenPhraseMatch = text.match(
      /\b(?:por|de|monto(?:\s+de)?)\s+((?:(?:un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\w+|veinti?\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to)?|doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s|mil|mill[oó]n|millones)(?:\s+(?:y\s+)?)){1,6})(?=\s+(?:pesos|mxn|usd|en|para|con|el|la|hoy|ayer)|$|[,.])/i,
    );
    if (spokenPhraseMatch && spokenPhraseMatch[1]) {
      const parsedSpoken = this.parseSpokenSpanishNumber(spokenPhraseMatch[1]);
      if (parsedSpoken !== null && parsedSpoken > 0) return parsedSpoken;
    }

    return null;
  }

  private extractConceptFromExpenseSentence(text: string): string | null {
    if (!text) return null;
    if (!/\b(crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?|gastos?|vi[aá]ticos?|reembolsos?)\b/i.test(text)) {
      return null;
    }
    const explicit = text.match(
      /\bconcepto\s*:?\s*["']?([^,.;"'\n]+?)["']?(?=\s+(?:monto|por\s+\$?\d|de\s+\$?\d|fecha|hoy|ayer|cliente|oportunidad)|$|[,.])/i,
    );
    if (explicit && explicit[1]) {
      return explicit[1].trim();
    }
    const cleaned = text
      .replace(
        /^(?:crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?)\s+(?:un\s+|unos\s+)?(?:nuevo\s+)?(?:gastos?|vi[aá]ticos?|reembolsos?)\s*(?:de|por|en)?\s*/i,
        '',
      )
      .replace(/\$?\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?/gi, ' ')
      .replace(/\b(?:para\s+la\s+|de\s+la\s+|a\s+la\s+|en\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+[^,.;]+/gi, ' ')
      .replace(/\b(?:para\s+el\s+|del\s+|con\s+(?:el\s+)?|al?\s+)cliente\s+[^,.;]+/gi, ' ')
      .replace(/\b(?:para\s+el\s+|asignad[oa]\s+(?:a|al)\s+)?ejecutivo\s+[^,.;]+/gi, ' ')
      .replace(
        /\b(?:fecha(?:\s+(?:del|a|para|en|:))?\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|hoy|ayer|anteayer|antier|hace\s+\d+\s+d[ií]as?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+pasado)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(?:de|por|en|con|para|y)\s+/i, '')
      .replace(/\s+(?:de|por|en|con|para|a|del|al|y)$/i, '')
      .trim();

    return cleaned.length >= 2 ? cleaned : null;
  }

  private parseExpenseAmount(rawVal: any, fallbackText?: string): number | null {
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      if (typeof rawVal === 'number' && !Number.isNaN(rawVal)) {
        return rawVal;
      }
      const rawStr = String(rawVal).trim();
      const cleanedNumStr = rawStr
        .replace(/[,$]/g, '')
        .replace(/\b(?:pesos|mxn|usd|d[oó]lares)\b/gi, '')
        .trim();
      if (/^-?\d+(?:\.\d{1,2})?$/.test(cleanedNumStr)) {
        return Number(cleanedNumStr);
      }
      const parsedWord = this.parseSpokenSpanishNumber(rawStr);
      if (parsedWord !== null) {
        return parsedWord;
      }
      const numFromHelper = this.parseNumeric(rawVal);
      if (numFromHelper !== undefined && numFromHelper !== null && !Number.isNaN(numFromHelper)) {
        return numFromHelper;
      }
    }

    if (fallbackText) {
      return this.extractAmountFromSentence(fallbackText);
    }

    return null;
  }

  private async resolveExpenseAssociation(options: {
    clientHint?: string;
    oppHint?: string;
    empresaHint?: string;
    bareTurn2Hint?: string;
    user: User;
    isExec: boolean;
  }): Promise<{
    status: 'resolved' | 'xor_violation' | 'ambiguous' | 'not_found' | 'company_not_supported';
    client?: Client;
    opportunity?: Opportunity;
    answer?: string;
  }> {
    const { clientHint, oppHint, empresaHint, bareTurn2Hint, user, isExec } = options;

    if (clientHint && oppHint) {
      return {
        status: 'xor_violation',
        answer:
          '⚠️ Por regla de negocio del CRM, cada gasto debe asociarse únicamente a un cliente O a una oportunidad, nunca a ambos al mismo tiempo.\n\nPor favor indícame solo uno de los dos (el cliente o la oportunidad) para asociar el gasto.',
      };
    }

    const resolveCompanyClarification = async (companyNameHint: string) => {
      const companyEntity = await this.resolveCompany(companyNameHint);
      if (!companyEntity) return null;

      const companyClients = await this.clientRepo.find({
        where: isExec ? { companyId: companyEntity.id, ejecutivo_id: user.id } : { companyId: companyEntity.id },
        take: 5,
      });

      const listStr =
        companyClients.length > 0
          ? `\n\nClientes disponibles en "${companyEntity.nombre}" para asociar el gasto:\n` +
            companyClients
              .map((c, idx) => `${idx + 1}. ${`${c.nombre || ''} ${c.apellido || ''}`.trim()}${c.correo ? ` (${c.correo})` : ''}`)
              .join('\n')
          : '';

      return {
        status: 'company_not_supported' as const,
        answer: `🏢 Identifiqué la empresa "${companyEntity.nombre}", pero los gastos en el CRM no se vinculan directamente a empresas sino a un cliente o a una oportunidad.${listStr}\n\nPor favor indícame el cliente o la oportunidad exacta para asociar el gasto.`,
      };
    };

    if (oppHint) {
      const oppRes = await this.resolveOpportunityResolution(oppHint, user, isExec);
      if (oppRes.ambiguousCandidates.length > 1) {
        const list = oppRes.ambiguousCandidates
          .map((o, idx) => `${idx + 1}. ${o.nombre_proyecto}`)
          .join('\n');
        return {
          status: 'ambiguous',
          answer: `🤔 Se encontraron múltiples oportunidades posibles para asociar el gasto:\n\n${list}\n\nResponde con el número de la opción o el nombre exacto de la oportunidad.`,
        };
      }
      if (oppRes.item) {
        return { status: 'resolved', opportunity: oppRes.item };
      }
      return {
        status: 'not_found',
        answer: `⚠️ No encontré ninguna oportunidad que coincida con "${oppHint}"${isExec ? ' bajo tu asignación' : ''}.\n\n¿Podrías verificar el nombre de la oportunidad o indicarme el cliente para asociar el gasto?`,
      };
    }

    if (clientHint) {
      const clientRes = await this.resolveClientResolution(clientHint, user, isExec);
      if (clientRes.ambiguousCandidates.length > 1) {
        const list = clientRes.ambiguousCandidates
          .map((c, idx) => `${idx + 1}. ${`${c.nombre || ''} ${c.apellido || ''}`.trim()}${c.correo ? ` (${c.correo})` : ''}`)
          .join('\n');
        return {
          status: 'ambiguous',
          answer: `🤔 Se encontraron múltiples clientes posibles para asociar el gasto:\n\n${list}\n\nResponde con el número de la opción o el nombre completo del cliente.`,
        };
      }
      if (clientRes.item) {
        return { status: 'resolved', client: clientRes.item };
      }
      const companyClarif = await resolveCompanyClarification(clientHint);
      if (companyClarif) return companyClarif;

      return {
        status: 'not_found',
        answer: `⚠️ No encontré ningún cliente que coincida con "${clientHint}"${isExec ? ' bajo tu asignación' : ''}.\n\n¿Podrías verificar el nombre o indicarme la oportunidad para asociar el gasto?`,
      };
    }

    if (empresaHint) {
      const companyClarif = await resolveCompanyClarification(empresaHint);
      if (companyClarif) return companyClarif;
      const clientFallback = await this.resolveClientResolution(empresaHint, user, isExec);
      if (clientFallback.item) {
        return { status: 'resolved', client: clientFallback.item };
      }
    }

    if (bareTurn2Hint) {
      const [clientRes, oppRes] = await Promise.all([
        this.resolveClientResolution(bareTurn2Hint, user, isExec),
        this.resolveOpportunityResolution(bareTurn2Hint, user, isExec),
      ]);

      if (clientRes.item && oppRes.item) {
        return {
          status: 'ambiguous',
          answer: `🤔 "${bareTurn2Hint}" coincide tanto con un cliente (${`${clientRes.item.nombre || ''} ${clientRes.item.apellido || ''}`.trim()}) como con una oportunidad (${oppRes.item.nombre_proyecto}).\n\n¿A cuál deseas asociar el gasto? Indícame "cliente ${clientRes.item.nombre}" u "oportunidad ${oppRes.item.nombre_proyecto}".`,
        };
      }
      if (clientRes.ambiguousCandidates.length > 1 && !oppRes.item) {
        const list = clientRes.ambiguousCandidates
          .map((c, idx) => `${idx + 1}. ${`${c.nombre || ''} ${c.apellido || ''}`.trim()}${c.correo ? ` (${c.correo})` : ''}`)
          .join('\n');
        return {
          status: 'ambiguous',
          answer: `🤔 Se encontraron múltiples clientes posibles para asociar el gasto:\n\n${list}\n\nResponde con el número de la opción o el nombre completo del cliente.`,
        };
      }
      if (oppRes.ambiguousCandidates.length > 1 && !clientRes.item) {
        const list = oppRes.ambiguousCandidates
          .map((o, idx) => `${idx + 1}. ${o.nombre_proyecto}`)
          .join('\n');
        return {
          status: 'ambiguous',
          answer: `🤔 Se encontraron múltiples oportunidades posibles para asociar el gasto:\n\n${list}\n\nResponde con el número de la opción o el nombre exacto de la oportunidad.`,
        };
      }
      if (clientRes.item) {
        return { status: 'resolved', client: clientRes.item };
      }
      if (oppRes.item) {
        return { status: 'resolved', opportunity: oppRes.item };
      }

      const companyClarif = await resolveCompanyClarification(bareTurn2Hint);
      if (companyClarif) return companyClarif;

      return {
        status: 'not_found',
        answer: `⚠️ No encontré ningún cliente ni oportunidad que coincida con "${bareTurn2Hint}" para asociar el gasto.\n\nPor favor indícame el nombre exacto del cliente o de la oportunidad.`,
      };
    }

    return { status: 'not_found' };
  }

  private async resolveExpenseResolution(options: {
    expenseId?: string;
    conceptHint?: string;
    targetFecha?: string | null;
    targetMonto?: number | null;
    user: User;
    isExec: boolean;
  }): Promise<{ item: Expense | null; ambiguousCandidates: Expense[] }> {
    const { expenseId, conceptHint, targetFecha, targetMonto, user, isExec } = options;

    if (expenseId && this.isValidUuid(expenseId)) {
      const exact = await this.expenseRepo.findOne({
        where: { id: expenseId },
        relations: ['client', 'opportunity'],
      });
      return { item: exact || null, ambiguousCandidates: [] };
    }

    const cleanConcept = (conceptHint || '').trim();
    const cleanNorm = this.normalizeString(cleanConcept);
    const words = cleanNorm.split(/\s+/).filter((w) => w.length >= 2);

    const whereConditions: any[] = [];
    if (cleanNorm) {
      whereConditions.push({
        concepto: Raw((alias) => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }),
      });
      for (const w of words) {
        whereConditions.push({
          concepto: Raw((alias) => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }),
        });
      }
    } else if (targetFecha) {
      whereConditions.push({ fecha: targetFecha as any });
    } else if (targetMonto !== null && targetMonto !== undefined) {
      whereConditions.push({ monto: targetMonto });
    }

    if (whereConditions.length === 0) {
      return { item: null, ambiguousCandidates: [] };
    }

    const allCandidates = await this.expenseRepo.find({
      where: whereConditions,
      relations: ['client', 'opportunity'],
      order: { createdAt: 'DESC' },
      take: 25,
    });

    if (allCandidates.length === 0) {
      return { item: null, ambiguousCandidates: [] };
    }

    // Prioridad RBAC: si el ejecutivo tiene coincidencias propias, trabajamos primero sobre sus propios gastos;
    // solo exponemos coincidencias ajenas si no tiene propias, para que handleModifyExpense devuelva Acceso Denegado explícito.
    const ownCandidates = isExec ? allCandidates.filter((e) => e.usuario_id === user.id) : allCandidates;
    let workingSet = ownCandidates.length > 0 ? ownCandidates : allCandidates;

    if (targetFecha) {
      const byDate = workingSet.filter((e) => this.formatExpenseDateDisplay(e.fecha) === targetFecha);
      if (byDate.length > 0) workingSet = byDate;
    }
    if (targetMonto !== null && targetMonto !== undefined) {
      const byAmount = workingSet.filter((e) => Math.abs(Number(e.monto) - targetMonto) < 0.01);
      if (byAmount.length > 0) workingSet = byAmount;
    }

    if (workingSet.length === 1) {
      return { item: workingSet[0], ambiguousCandidates: [] };
    }

    if (cleanConcept) {
      const ranked = rankEntitiesByRelevance(workingSet, cleanConcept, (e: Expense) => [
        e.concepto,
        e.client ? `${e.client.nombre || ''} ${e.client.apellido || ''}`.trim() : null,
        e.opportunity ? e.opportunity.nombre_proyecto : null,
      ]);

      if (ranked.length === 1) {
        return { item: ranked[0].item, ambiguousCandidates: [] };
      }

      if (ranked.length > 1) {
        const topScore = ranked[0].score;
        const secondScore = ranked[1].score;
        if (topScore >= secondScore + 1500) {
          return { item: ranked[0].item, ambiguousCandidates: [] };
        }
        const tied = ranked
          .filter((r) => r.score >= topScore - 1500)
          .slice(0, 6)
          .map((r) => r.item);
        if (tied.length > 1) {
          return { item: null, ambiguousCandidates: tied };
        }
        return { item: tied[0], ambiguousCandidates: [] };
      }
    }

    return { item: null, ambiguousCandidates: workingSet.slice(0, 6) };
  }

  async handleCreateExpense(
    params: any,
    user: User,
    conversationHistory: ConversationHistoryMessage[] = [],
    originalQuestion: string = '',
  ): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const mergedParams = this.mergeHistoryContext(
      'createExpense',
      { ...params, __rawUserInput: originalQuestion },
      conversationHistory,
    );

    // 1. Asignación de responsable (RBAC: Ejecutivo siempre bajo su propio ID; Admin/Superadmin puede asignar)
    let assignedExecutiveUser: User | null = null;
    let targetExecutiveName = user.username || user.email || 'Usuario';

    if (!isExec && (mergedParams.ejecutivo || mergedParams.ejecutivoId || mergedParams.usuario || mergedParams.usuarioId || mergedParams.responsable)) {
      const execSearch =
        mergedParams.ejecutivo || mergedParams.ejecutivoId || mergedParams.usuario || mergedParams.usuarioId || mergedParams.responsable;
      const foundUser = await this.resolveUser(execSearch);
      if (foundUser) {
        assignedExecutiveUser = foundUser;
        targetExecutiveName = foundUser.username || foundUser.email || foundUser.id;
      }
    }

    // 2. Validar concepto y monto
    let concepto = (mergedParams.concepto || mergedParams.concept || mergedParams.descripcion || '').toString().trim();
    if (/^\s*\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(concepto)) {
      concepto = '';
    }

    const monto = this.parseExpenseAmount(mergedParams.monto ?? mergedParams.amount ?? mergedParams.importe, originalQuestion);
    const fechaYmd =
      this.resolveExpenseDateInput(mergedParams.fecha || mergedParams.date) || this.getTodayInTzYYYYMMDD();

    if (!concepto && (monto === null || monto === undefined)) {
      return {
        answer:
          '⚠️ Para registrar el gasto necesito al menos el concepto, el monto y el cliente u oportunidad al que pertenece.\n\nPor ejemplo: "Registra gasto de comida por $500 para el cliente Carlos"',
      };
    }

    if (!concepto) {
      return {
        answer: `¿Cuál es el concepto del gasto por $${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN?\n\n(Nota: Fecha registrada: ${fechaYmd}. Ejemplo: "Comida con cliente", "Gasolina", "Vuelo")`,
      };
    }

    if (monto === null || monto === undefined || Number.isNaN(monto) || monto <= 0) {
      const detail =
        monto !== null && monto <= 0
          ? '⚠️ El monto del gasto debe ser mayor a $0.'
          : '';
      return {
        answer: `${detail ? detail + '\n\n' : ''}¿Cuál es el monto del gasto de "${concepto}"? (ej. "$500 pesos")`,
      };
    }

    // 3. Resolución estricta de relación XOR (Cliente XOR Oportunidad)
    const rawClientHint = (mergedParams.cliente || mergedParams.clientName || mergedParams.contacto || '').toString().trim() || undefined;
    const rawOppHint = (mergedParams.oportunidad || mergedParams.opportunity || mergedParams.proyecto || mergedParams.cotizacion || '').toString().trim() || undefined;
    const rawEmpresaHint = (mergedParams.empresa || mergedParams.company || '').toString().trim() || undefined;

    const lastAssistant =
      conversationHistory
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .reverse()[0] || '';
    const isAwaitingAssociationReply =
      /todo gasto debe asociarse a|¿a qu[eé] \*{0,2}cliente\*{0,2} o \*{0,2}oportunidad\*{0,2} deseas asociar este gasto|no se vinculan directamente a empresas|se encontraron m[uú]ltiples (?:clientes|oportunidades) posibles|para asociar el gasto/i.test(
        lastAssistant,
      );

    let bareTurn2Hint: string | undefined;
    if (!rawClientHint && !rawOppHint && !rawEmpresaHint && isAwaitingAssociationReply && originalQuestion.trim()) {
      const strippedReply = originalQuestion
        .trim()
        .replace(/^(?:para|al?|con|el|la|es|en)\s+/i, '')
        .trim();
      if (
        strippedReply.length >= 2 &&
        !/^\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?$/i.test(strippedReply)
      ) {
        bareTurn2Hint = strippedReply;
      }
    }

    if (!rawClientHint && !rawOppHint && !rawEmpresaHint && !bareTurn2Hint) {
      return {
        answer: `⚠️ Todo gasto debe asociarse a un cliente o a una oportunidad (no ambos).\n\nTengo anotado:\n- Concepto: ${concepto}\n- Monto: $${monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN\n- Fecha: ${fechaYmd}\n\n¿A qué cliente o oportunidad deseas asociar este gasto?`,
      };
    }

    const effectiveLookupUser = assignedExecutiveUser || user;
    const assoc = await this.resolveExpenseAssociation({
      clientHint: rawClientHint,
      oppHint: rawOppHint,
      empresaHint: rawEmpresaHint,
      bareTurn2Hint,
      user: effectiveLookupUser,
      isExec,
    });

    if (assoc.status !== 'resolved') {
      return {
        answer:
          assoc.answer ||
          `¿A qué cliente o oportunidad deseas asociar este gasto de "${concepto}"?`,
      };
    }

    // 4. Persistencia mediante ExpensesService.create (respeta validación XOR + tenant sync)
    try {
      const effectiveCreator: any = assignedExecutiveUser
        ? {
            id: assignedExecutiveUser.id,
            userId: assignedExecutiveUser.id,
            username: assignedExecutiveUser.username,
            email: assignedExecutiveUser.email,
            role: assignedExecutiveUser.role,
          }
        : {
            ...user,
            id: user.id || (user as any).userId,
            userId: (user as any).userId || user.id,
          };

      const createDto: any = {
        fecha: fechaYmd,
        concepto,
        monto,
        client_id: assoc.client ? assoc.client.id : null,
        opportunity_id: assoc.opportunity ? assoc.opportunity.id : null,
      };

      const saved = await this.expensesService.create(createDto, effectiveCreator);

      const linkedLabel = assoc.client
        ? `Cliente: ${`${assoc.client.nombre || ''} ${assoc.client.apellido || ''}`.trim()}`
        : `Oportunidad: ${assoc.opportunity?.nombre_proyecto}`;

      this.logger.log(`[WebChat - Action Executor] Gasto creado: "${concepto}" ($${monto}) por ${targetExecutiveName}`);

      return {
        answer: `✅ Gasto Registrado Exitosamente\n\n- Concepto: ${saved.concepto || concepto}\n- Monto: $${Number(saved.monto ?? monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN\n- Fecha: ${this.formatExpenseDateDisplay(saved.fecha || fechaYmd)}\n- Asociado a: ${linkedLabel}\n- Responsable: ${targetExecutiveName}\n\nSi necesitas ajustar el monto, la fecha o reasignarlo, solo pídemelo.`,
      };
    } catch (error) {
      this.logger.error(`[WebChat - Action Executor] Error creando gasto:`, error);
      return {
        answer: `❌ Ocurrió un error al registrar el gasto: ${error.message || 'Verifica los datos ingresados e inténtalo nuevamente.'}`,
      };
    }
  }

  async handleModifyExpense(
    params: any,
    user: User,
    conversationHistory: ConversationHistoryMessage[] = [],
    originalQuestion: string = '',
  ): Promise<WebchatResponse> {
    const isExec = this.isExecutive(user.role);
    const mergedParams = this.mergeHistoryContext(
      'modifyExpense',
      { ...params, __rawUserInput: originalQuestion },
      conversationHistory,
    );

    const hasExplicitConceptChange =
      Boolean(mergedParams.nuevoConcepto || mergedParams.newConcepto) ||
      /\b(nuevo\s+concepto|concepto\s+(?:a|por|=)|cambia(?:r)?\s+(?:el\s+)?concepto|actualiza(?:r)?\s+(?:el\s+)?concepto|modifica(?:r)?\s+(?:el\s+)?concepto|corrige(?:r)?\s+(?:el\s+)?concepto|renombra(?:r)?)\b/i.test(
        originalQuestion || '',
      );

    const newAmountCandidate = this.parseExpenseAmount(
      mergedParams.monto ?? mergedParams.amount ?? mergedParams.nuevoMonto ?? mergedParams.newMonto,
    );
    const rawDateInput = mergedParams.nuevaFecha || mergedParams.newFecha || mergedParams.fecha || mergedParams.date;
    const rawNewClientHint = (mergedParams.cliente || mergedParams.nuevoCliente || mergedParams.clientName || '').toString().trim() || undefined;
    const rawNewOppHint = (mergedParams.oportunidad || mergedParams.nuevaOportunidad || mergedParams.opportunity || mergedParams.proyecto || '').toString().trim() || undefined;

    const rawExplicitTarget = (
      mergedParams.targetExpense ||
      mergedParams.targetConcepto ||
      mergedParams.conceptoOriginal ||
      ''
    )
      .toString()
      .trim();

    let searchConcept = rawExplicitTarget;
    if (
      !searchConcept &&
      mergedParams.concepto &&
      !hasExplicitConceptChange &&
      (newAmountCandidate !== null || Boolean(rawDateInput) || Boolean(rawNewClientHint) || Boolean(rawNewOppHint))
    ) {
      searchConcept = String(mergedParams.concepto).trim();
    }

    let targetFecha = this.resolveExpenseDateInput(mergedParams.targetFecha || mergedParams.originalDate);
    let targetMonto = this.parseExpenseAmount(mergedParams.targetMonto ?? mergedParams.originalAmount);

    if (searchConcept && !targetFecha && /^(hoy|ayer|anteayer|antier|\d{4}-\d{2}-\d{2})$/i.test(searchConcept)) {
      targetFecha = this.resolveExpenseDateInput(searchConcept);
      searchConcept = '';
    }
    if (searchConcept && targetMonto === null && /^\$?\d+(?:[.,]\d{1,2})?$/.test(searchConcept)) {
      targetMonto = this.parseExpenseAmount(searchConcept);
      searchConcept = '';
    }

    const expenseId = (mergedParams.expenseId || mergedParams.id || '').toString().trim() || undefined;

    if (!expenseId && !searchConcept && !targetFecha && targetMonto === null) {
      return {
        answer:
          '⚠️ Indícame qué gasto deseas modificar (por ejemplo su concepto, fecha o monto original) junto con el cambio que quieres realizar.',
      };
    }

    const resolution = await this.resolveExpenseResolution({
      expenseId,
      conceptHint: searchConcept || undefined,
      targetFecha,
      targetMonto,
      user,
      isExec,
    });

    if (resolution.ambiguousCandidates.length > 1) {
      const list = resolution.ambiguousCandidates
        .map((e, idx) => {
          const relLabel = e.client
            ? `Cliente: ${`${e.client.nombre || ''} ${e.client.apellido || ''}`.trim()}`
            : e.opportunity
              ? `Oportunidad: ${e.opportunity.nombre_proyecto}`
              : 'Sin vínculo';
          return `${idx + 1}. ${e.concepto} — $${Number(e.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN | Fecha: ${this.formatExpenseDateDisplay(e.fecha)} | ${relLabel}`;
        })
        .join('\n');

      return {
        answer: `🤔 Encontré varios gastos que coinciden con "${searchConcept || targetFecha || targetMonto}". ¿Cuál deseas modificar?\n\n${list}\n\nResponde con el número de la opción (ej. "el 1"), o especifica su fecha o monto original.`,
      };
    }

    const targetExpense = resolution.item;
    if (!targetExpense) {
      return {
        answer: `⚠️ No encontré un gasto que coincida con "${searchConcept || targetFecha || targetMonto}". Verifica el concepto o la fecha e inténtalo de nuevo.`,
      };
    }

    // Validación RBAC (Ejecutivo solo puede modificar gastos registrados por sí mismo)
    if (isExec && targetExpense.usuario_id && targetExpense.usuario_id !== user.id) {
      this.logger.warn(
        `[WebChat - Action Executor] Acceso denegado a ${user.username} intentando modificar gasto ajeno ${targetExpense.id}`,
      );
      return {
        answer: `Acceso Denegado: No tienes permisos para modificar el gasto "${targetExpense.concepto}" porque fue registrado por otro usuario.`,
      };
    }

    // Construir campos de actualización (UpdateExpenseDto)
    const updateDto: Record<string, any> = {};

    const newConceptVal = (
      mergedParams.nuevoConcepto ||
      mergedParams.newConcepto ||
      (hasExplicitConceptChange ? mergedParams.concepto : '') ||
      ''
    )
      .toString()
      .trim();
    if (newConceptVal && newConceptVal !== targetExpense.concepto) {
      updateDto.concepto = newConceptVal;
    }

    if (newAmountCandidate !== null && !Number.isNaN(newAmountCandidate)) {
      if (newAmountCandidate <= 0) {
        return {
          answer: '⚠️ El nuevo monto del gasto debe ser mayor a $0.',
        };
      }
      updateDto.monto = newAmountCandidate;
    }

    const isSameDateAsTarget =
      mergedParams.fecha &&
      !mergedParams.nuevaFecha &&
      !mergedParams.newFecha &&
      targetFecha &&
      this.resolveExpenseDateInput(mergedParams.fecha) === targetFecha &&
      !newAmountCandidate &&
      !newConceptVal &&
      !rawNewClientHint &&
      !rawNewOppHint;

    if (rawDateInput && !isSameDateAsTarget) {
      const resolvedNewDate = this.resolveExpenseDateInput(rawDateInput);
      if (resolvedNewDate) {
        updateDto.fecha = resolvedNewDate;
      }
    }

    let resolvedAssocLabel: string | null = null;
    if (rawNewClientHint || rawNewOppHint) {
      const assoc = await this.resolveExpenseAssociation({
        clientHint: rawNewClientHint,
        oppHint: rawNewOppHint,
        user,
        isExec,
      });
      if (assoc.status !== 'resolved') {
        return {
          answer:
            assoc.answer ||
            '⚠️ No pude identificar el nuevo cliente u oportunidad para reasignar el gasto.',
        };
      }
      if (assoc.client) {
        updateDto.client_id = assoc.client.id;
        updateDto.opportunity_id = null;
        resolvedAssocLabel = `Cliente: ${`${assoc.client.nombre || ''} ${assoc.client.apellido || ''}`.trim()}`;
      } else if (assoc.opportunity) {
        updateDto.opportunity_id = assoc.opportunity.id;
        updateDto.client_id = null;
        resolvedAssocLabel = `Oportunidad: ${assoc.opportunity.nombre_proyecto}`;
      }
    }

    if (Object.keys(updateDto).length === 0) {
      return {
        answer: `Identifiqué el gasto "${targetExpense.concepto}" ($${Number(targetExpense.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN — ${this.formatExpenseDateDisplay(targetExpense.fecha)}), pero no detecté qué campo deseas actualizar.\n\nPor favor indícame qué cambio deseas aplicar (ej. "cambia el monto a 650", "cambia la fecha a ayer", "cambia el concepto a ...", o "reasígnalo al cliente ...").`,
      };
    }

    try {
      const updated = await this.expensesService.update(targetExpense.id, updateDto);

      const finalClient = updated.client || (updateDto.client_id ? undefined : targetExpense.client);
      const finalOpp = updated.opportunity || (updateDto.opportunity_id ? undefined : targetExpense.opportunity);

      const assocText =
        resolvedAssocLabel ||
        (finalClient
          ? `Cliente: ${`${finalClient.nombre || ''} ${finalClient.apellido || ''}`.trim()}`
          : finalOpp
            ? `Oportunidad: ${finalOpp.nombre_proyecto}`
            : 'Sin cambio en asociación');

      this.logger.log(`[WebChat - Action Executor] Gasto actualizado: "${targetExpense.id}" por ${user.username}`);

      return {
        answer: `✅ Gasto Actualizado Exitosamente\n\n- Concepto: ${updated.concepto || updateDto.concepto || targetExpense.concepto}\n- Monto: $${Number(updated.monto ?? updateDto.monto ?? targetExpense.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN\n- Fecha: ${this.formatExpenseDateDisplay(updated.fecha || updateDto.fecha || targetExpense.fecha)}\n- Asociado a: ${assocText}`,
      };
    } catch (error) {
      this.logger.error(`[WebChat - Action Executor] Error modificando gasto:`, error);
      return {
        answer: `❌ No pude actualizar el gasto: ${error.message || 'Verifica los datos e inténtalo nuevamente.'}`,
      };
    }
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

  async resolveStage(hint?: string, pipelineId?: string): Promise<Stage | null> {
    if (!hint) return null;
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return null;

    if (this.isValidUuid(clean)) {
      return this.stageRepo.findOne({ where: { id: clean, blnstatus: true } });
    }

    const qb = this.stageRepo.createQueryBuilder('stage')
      .where('stage.blnstatus = :status', { status: true });

    if (pipelineId) {
      qb.andWhere('stage.pipeline_id = :pipelineId', { pipelineId });
    }

    const stages = await qb.orderBy('stage.display_order', 'ASC').getMany();
    if (stages.length === 0) return null;

    const normClean = this.normalizeString(clean);

    // 1. Coincidencia exacta o normalizada
    let matched = stages.find(s => this.normalizeString(s.strname) === normClean);
    if (matched) return matched;

    // 2. Coincidencia parcial
    matched = stages.find(s => {
      const normS = this.normalizeString(s.strname);
      return normS.includes(normClean) || normClean.includes(normS);
    });
    if (matched) return matched;

    // 3. Mapeo semántico común en CRM
    if (normClean.includes('ganad') || normClean.includes('exitos') || normClean.includes('cerrad')) {
      matched = stages.find(s => s.stage_type === 1);
      if (matched) return matched;
    }
    if (normClean.includes('perdid') || normClean.includes('cancelad')) {
      matched = stages.find(s => s.stage_type === 2);
      if (matched) return matched;
    }
    if (normClean.includes('prospect') || normClean.includes('inici') || normClean.includes('nuev')) {
      matched = stages.find(s => s.blninitial) || stages.find(s => s.stage_type === 0);
      if (matched) return matched;
    }

    return null;
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

  /**
   * Resuelve una oportunidad por título retornando tanto el resultado unívoco como
   * posibles candidatos ambiguos para solicitar confirmación si la coincidencia no es contundente.
   */
  async resolveOpportunityResolution(
    searchTitle: string,
    user: User,
    isExec: boolean,
    companyHint?: string,
    clientHint?: string,
  ): Promise<{
    item: Opportunity | null;
    ambiguousCandidates: Opportunity[];
  }> {
    if (!searchTitle || !searchTitle.trim()) {
      return { item: null, ambiguousCandidates: [] };
    }

    const trimmed = searchTitle.replace(/^["']|["']$/g, '').trim();

    const fetchCandidates = async (builder: any): Promise<Opportunity[]> => {
      builder.orderBy('opp.createdAt', 'DESC');
      let res: Opportunity[] = [];
      if (typeof builder.getMany === 'function') {
        res = await builder.getMany();
      }
      if ((!res || res.length === 0) && typeof builder.getOne === 'function') {
        const single = await builder.getOne();
        if (single) res = [single];
      }
      return res || [];
    };

    const evaluateScoredCandidates = (candidates: Opportunity[]): { item: Opportunity | null; ambiguousCandidates: Opportunity[] } => {
      if (!candidates || candidates.length === 0) return { item: null, ambiguousCandidates: [] };
      if (candidates.length === 1) return { item: candidates[0], ambiguousCandidates: [] };

      const ranked = rankEntitiesByRelevance(candidates, trimmed, (o: Opportunity) => [
        o.nombre_proyecto,
        o.empresa,
        o.cliente ? `${o.cliente.nombre || ''} ${o.cliente.apellido || ''}`.trim() : null,
      ]);

      if (ranked.length === 0) {
        return { item: candidates[0], ambiguousCandidates: [] };
      }

      const best = ranked[0];
      const second = ranked[1];

      // Si el primer candidato tiene un match contundente y supera claramente al segundo
      if (best && second) {
        const diff = best.score - second.score;
        // Si ambos están muy parejos en relevancia (diferencia menor al umbral de ambigüedad)
        if (diff < AMBIGUITY_MARGIN_SCORE && second.score >= 500) {
          return {
            item: null,
            ambiguousCandidates: ranked.slice(0, 4).map(r => r.item),
          };
        }
      }

      return { item: best.item, ambiguousCandidates: [] };
    };

    // 1. Buscar en BD usando coincidencia insensible a acentos y mayúsculas
    const qb = this.opportunityRepo.createQueryBuilder('opp')
      .leftJoinAndSelect('opp.stage', 'stage')
      .leftJoinAndSelect('opp.cliente', 'cliente')
      .leftJoinAndSelect('opp.company', 'company')
      .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
      .leftJoinAndSelect('opp.linea_negocio', 'linea_negocio')
      .leftJoinAndSelect('opp.tipo_entrega', 'tipo_entrega')
      .leftJoinAndSelect('opp.licenciamiento', 'licenciamiento')
      .where('opp.archived = :archived', { archived: false })
      .andWhere(
        '(opp.nombre_proyecto ILIKE :title OR public.f_unaccent_immutable(opp.nombre_proyecto) ILIKE public.f_unaccent_immutable(:title))',
        { title: `%${trimmed}%` }
      );

    if (isExec) {
      qb.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
    }

    if (companyHint || clientHint) {
      const hint = (companyHint || clientHint)!.trim();
      qb.andWhere(
        '(opp.empresa ILIKE :hint OR company.nombre ILIKE :hint OR cliente.nombre ILIKE :hint OR CONCAT(cliente.nombre, \' \', COALESCE(cliente.apellido, \'\')) ILIKE :hint OR public.f_unaccent_immutable(opp.empresa) ILIKE public.f_unaccent_immutable(:hint) OR public.f_unaccent_immutable(company.nombre) ILIKE public.f_unaccent_immutable(:hint))',
        { hint: `%${hint}%` }
      );
    }

    const candidates = await fetchCandidates(qb);
    if (candidates.length > 0) {
      const evalRes = evaluateScoredCandidates(candidates);
      if (evalRes.item || evalRes.ambiguousCandidates.length > 0) {
        return evalRes;
      }
    }

    // 2. Si no encontró con el filtro combinado de empresa/cliente, reintentar solo por título
    if (companyHint || clientHint) {
      const qbFallback = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
        .leftJoinAndSelect('opp.linea_negocio', 'linea_negocio')
        .leftJoinAndSelect('opp.tipo_entrega', 'tipo_entrega')
        .leftJoinAndSelect('opp.licenciamiento', 'licenciamiento')
        .where('opp.archived = :archived', { archived: false })
        .andWhere(
          '(opp.nombre_proyecto ILIKE :title OR public.f_unaccent_immutable(opp.nombre_proyecto) ILIKE public.f_unaccent_immutable(:title))',
          { title: `%${trimmed}%` }
        );

      if (isExec) {
        qbFallback.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
      }

      const fbCandidates = await fetchCandidates(qbFallback);
      if (fbCandidates.length > 0) {
        const evalRes = evaluateScoredCandidates(fbCandidates);
        if (evalRes.item || evalRes.ambiguousCandidates.length > 0) {
          return evalRes;
        }
      }
    }

    // 3. Fallback ignorando espacios intermedios y acentos (ej. "cotizacion4" o "redmagic")
    const compactSearch = normalizeText(trimmed).replace(/\s+/g, '');
    if (compactSearch.length >= 2) {
      const qbCompact = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
        .leftJoinAndSelect('opp.linea_negocio', 'linea_negocio')
        .leftJoinAndSelect('opp.tipo_entrega', 'tipo_entrega')
        .leftJoinAndSelect('opp.licenciamiento', 'licenciamiento')
        .where('opp.archived = :archived', { archived: false })
        .andWhere(
          "REPLACE(public.f_unaccent_immutable(opp.nombre_proyecto), ' ', '') ILIKE :compact",
          { compact: `%${compactSearch}%` }
        );

      if (isExec) {
        qbCompact.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
      }

      const compactCandidates = await fetchCandidates(qbCompact);
      if (compactCandidates.length > 0) {
        const evalRes = evaluateScoredCandidates(compactCandidates);
        if (evalRes.item || evalRes.ambiguousCandidates.length > 0) {
          return evalRes;
        }
      }
    }

    // 4. Fallback por tokens significativos o números aislados (ej. "4" en "Cotización 4")
    const stopWords = new Set(['la', 'el', 'los', 'las', 'de', 'del', 'para', 'en', 'con', 'oportunidad', 'proyecto']);
    const rawTokens = trimmed.split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '').trim());
    const tokens = rawTokens.filter(t => (t.length >= 2 || /^\d+$/.test(t)) && !stopWords.has(t.toLowerCase()));

    if (tokens.length > 0) {
      const qbTokens = this.opportunityRepo.createQueryBuilder('opp')
        .leftJoinAndSelect('opp.stage', 'stage')
        .leftJoinAndSelect('opp.cliente', 'cliente')
        .leftJoinAndSelect('opp.company', 'company')
        .leftJoinAndSelect('opp.opportunityProducts', 'opportunityProducts')
        .leftJoinAndSelect('opp.linea_negocio', 'linea_negocio')
        .leftJoinAndSelect('opp.tipo_entrega', 'tipo_entrega')
        .leftJoinAndSelect('opp.licenciamiento', 'licenciamiento')
        .where('opp.archived = :archived', { archived: false });

      if (isExec) {
        qbTokens.andWhere('opp.ejecutivo_id = :userId', { userId: user.id });
      }

      const conditions = tokens.map((_, i) =>
        `(opp.nombre_proyecto ILIKE :tok${i} OR public.f_unaccent_immutable(opp.nombre_proyecto) ILIKE public.f_unaccent_immutable(:tok${i}))`
      ).join(' OR ');

      const paramsObj: Record<string, string> = {};
      tokens.forEach((tok, i) => { paramsObj[`tok${i}`] = `%${tok}%`; });
      qbTokens.andWhere(`(${conditions})`, paramsObj);

      const tokenCandidates = await fetchCandidates(qbTokens);
      if (tokenCandidates.length > 0) {
        const evalRes = evaluateScoredCandidates(tokenCandidates);
        if (evalRes.item || evalRes.ambiguousCandidates.length > 0) {
          return evalRes;
        }
      }
    }

    return { item: null, ambiguousCandidates: [] };
  }

  /**
   * Wrapper retrocompatible que devuelve la oportunidad unívoca si no hay ambigüedad.
   */
  async resolveOpportunityByTitle(
    searchTitle: string,
    user: User,
    isExec: boolean,
    companyHint?: string,
    clientHint?: string,
  ): Promise<Opportunity | null> {
    const res = await this.resolveOpportunityResolution(searchTitle, user, isExec, companyHint, clientHint);
    return res.item;
  }

  /**
   * Obtiene la lista de nombres de tipos de actividad activos para el tenant actual.
   * Utilizado para inyectar el catálogo dinámico en el subagente y sanitizar filtros analíticos.
   */
  async getActiveActivityTypeNames(): Promise<string[]> {
    try {
      const types = await this.typeActivityRepo.find({
        where: { blnstatus: true },
        select: ['strname'],
      });
      return types.map(t => t.strname).filter(Boolean);
    } catch (err: any) {
      this.logger.warn(`[WebchatActionExecutor] Error obteniendo tipos de actividad activos: ${err.message}`);
      return ['Llamada', 'Reunión', 'Demostración', 'Visita', 'Correo'];
    }
  }

  async resolveClientWithScore(hint: string): Promise<{ item: Client | null; score: number }> {
    if (!hint) return { item: null, score: 0 };
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return { item: null, score: 0 };
    if (this.isValidUuid(clean)) {
      const c = await this.clientRepo.findOne({ where: { id: clean } }).catch(() => null);
      return { item: c, score: c ? 10000 : 0 };
    }

    const cleanNorm = normalizeText(clean);
    const words = cleanNorm.split(/\s+/).filter(w => w.length >= 2);
    const nonStopWords = words.filter(w => !CRM_ENTITY_STOPWORDS.has(w));
    const wordsToSearch = nonStopWords.length > 0 ? nonStopWords : words;

    // 1. Coincidencia directa completa
    const direct = await this.clientRepo.findOne({
      where: [
        { nombre: ILike(`%${clean}%`) },
        { apellido: ILike(`%${clean}%`) },
        { correo: ILike(`%${clean}%`) },
        { telefono: ILike(`%${clean}%`) },
      ],
    }).catch(() => null);

    if (direct) {
      const directFullName = normalizeText(`${direct.nombre || ''} ${direct.apellido || ''}`);
      if (directFullName === cleanNorm) {
        return { item: direct, score: 10000 };
      }
    }

    // 2. Búsqueda de candidatos amplia para evaluar con ranking
    const candidateWhere: any[] = [
      { nombre: ILike(`%${clean}%`) },
      { apellido: ILike(`%${clean}%`) },
      { correo: ILike(`%${clean}%`) },
      { telefono: ILike(`%${clean}%`) },
    ];

    // Búsqueda insensible a acentos con Raw PG_TRANSLATE_EXPRESSION en PostgreSQL (SIEMPRE activa)
    if (cleanNorm) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
        { apellido: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
      );
    }

    for (const w of wordsToSearch) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { apellido: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { nombre: ILike(`%${w}%`) },
        { apellido: ILike(`%${w}%`) },
      );
    }

    let candidates: Client[] = [];
    try {
      candidates = await this.clientRepo.find({
        where: candidateWhere,
        order: { nombre: 'ASC' },
        take: 30,
      });
    } catch {
      candidates = await this.clientRepo.find({
        where: [
          { nombre: ILike(`%${clean}%`) },
          { apellido: ILike(`%${clean}%`) },
          ...wordsToSearch.map(w => ({ nombre: ILike(`%${w}%`) })),
          ...wordsToSearch.map(w => ({ apellido: ILike(`%${w}%`) })),
        ],
        order: { nombre: 'ASC' },
        take: 30,
      }).catch(() => []);
    }

    if (direct && !candidates.some(c => c.id === direct.id)) {
      candidates.push(direct);
    }

    // 3. Evaluar y rankear candidatos
    const scored = rankEntitiesByRelevance(
      candidates,
      clean,
      (c: Client) => [
        `${c.nombre || ''} ${c.apellido || ''}`.trim(),
        c.nombre,
        c.apellido,
        c.correo || '',
        c.telefono || '',
      ],
    );

    if (scored.length > 0 && scored[0].score >= MIN_ENTITY_MATCH_SCORE) {
      return { item: scored[0].item, score: scored[0].score };
    }

    return { item: direct || null, score: direct ? 1000 : 0 };
  }

  async resolveClient(hint: string): Promise<Client | null> {
    const res = await this.resolveClientWithScore(hint);
    return res.score >= MIN_ENTITY_MATCH_SCORE ? res.item : (res.score >= 1000 ? res.item : null);
  }

  async resolveCompanyWithScore(hint: string): Promise<{ item: Company | null; score: number }> {
    if (!hint) return { item: null, score: 0 };
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return { item: null, score: 0 };
    if (this.isValidUuid(clean)) {
      const comp = await this.companyRepo.findOne({ where: { id: clean } }).catch(() => null);
      return { item: comp, score: comp ? 10000 : 0 };
    }

    const cleanNorm = normalizeText(clean);
    const words = cleanNorm.split(/\s+/).filter(w => w.length >= 2);
    const nonStopWords = words.filter(w => !CRM_ENTITY_STOPWORDS.has(w));
    const wordsToSearch = nonStopWords.length > 0 ? nonStopWords : words;

    // 1. Coincidencia directa completa
    const direct = await this.companyRepo.findOne({
      where: [
        { nombre: ILike(`%${clean}%`) },
        { correo: ILike(`%${clean}%`) },
      ],
    }).catch(() => null);

    if (direct) {
      const directNorm = normalizeText(direct.nombre);
      if (directNorm === cleanNorm) {
        return { item: direct, score: 10000 };
      }
    }

    // 2. Búsqueda de candidatos amplia para evaluar con ranking
    const candidateWhere: any[] = [
      { nombre: ILike(`%${clean}%`) },
      { correo: ILike(`%${clean}%`) },
    ];

    // Búsqueda insensible a acentos con Raw PG_TRANSLATE_EXPRESSION en PostgreSQL (SIEMPRE activa)
    if (cleanNorm) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${cleanNorm}%` }) },
      );
    }

    for (const w of wordsToSearch) {
      candidateWhere.push(
        { nombre: Raw(alias => `${PG_TRANSLATE_EXPRESSION(alias)} ILIKE :term`, { term: `%${w}%` }) },
        { nombre: ILike(`%${w}%`) },
      );
    }

    let candidates: Company[] = [];
    try {
      candidates = await this.companyRepo.find({
        where: candidateWhere,
        order: { nombre: 'ASC' },
        take: 30,
      });
    } catch {
      candidates = await this.companyRepo.find({
        where: [
          { nombre: ILike(`%${clean}%`) },
          ...wordsToSearch.map(w => ({ nombre: ILike(`%${w}%`) })),
        ],
        order: { nombre: 'ASC' },
        take: 30,
      }).catch(() => []);
    }

    if (direct && !candidates.some(c => c.id === direct.id)) {
      candidates.push(direct);
    }

    // 3. Evaluar y rankear candidatos
    const scored = rankEntitiesByRelevance(
      candidates,
      clean,
      (comp: Company) => [comp.nombre, comp.correo, comp.telefono, comp.website],
    );

    if (scored.length > 0 && scored[0].score >= MIN_ENTITY_MATCH_SCORE) {
      return { item: scored[0].item, score: scored[0].score };
    }

    return { item: direct || null, score: direct ? 1000 : 0 };
  }

  async resolveCompany(hint: string): Promise<Company | null> {
    const res = await this.resolveCompanyWithScore(hint);
    return res.score >= MIN_ENTITY_MATCH_SCORE ? res.item : (res.score >= 1000 ? res.item : null);
  }

  async resolveClientOrCompany(hint: string): Promise<{ client: Client | null; company: Company | null }> {
    if (!hint) return { client: null, company: null };
    const clean = hint.replace(/^["']|["']$/g, '').trim();
    if (!clean) return { client: null, company: null };

    const [clientRes, compRes] = await Promise.all([
      this.resolveClientWithScore(clean),
      this.resolveCompanyWithScore(clean),
    ]);

    // Si la empresa tiene puntuación confiable y es mayor o igual a la del cliente
    if (compRes.item && compRes.score >= MIN_ENTITY_MATCH_SCORE && compRes.score >= clientRes.score) {
      return { client: null, company: compRes.item };
    }

    // Si el cliente tiene puntuación confiable y supera a la empresa
    if (clientRes.item && clientRes.score >= MIN_ENTITY_MATCH_SCORE) {
      return { client: clientRes.item, company: null };
    }

    // Si la empresa superó el umbral pero el cliente no
    if (compRes.item && compRes.score >= MIN_ENTITY_MATCH_SCORE) {
      return { client: null, company: compRes.item };
    }

    return {
      client: clientRes.score >= 1000 ? clientRes.item : null,
      company: compRes.score >= 1000 ? compRes.item : null,
    };
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

  parseNaturalDate(dateInput: any, timeInput?: any): Date {
    if (!dateInput && !timeInput) {
      const d = new Date();
      d.setHours(d.getHours() + 2, 0, 0, 0);
      return d;
    }
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      return dateInput;
    }

    const tz = this.getTimezone();
    const now = new Date();

    // Obtener componentes actuales en la zona horaria del CRM
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const nowMap: Record<string, number> = {};
    for (const p of parts) nowMap[p.type] = parseInt(p.value, 10);

    let targetYear = nowMap.year;
    let targetMonth = nowMap.month - 1; // 0-indexed
    let targetDay = nowMap.day;
    let targetHour = 10;
    let targetMinute = 0;

    const rawDateStr = String(dateInput || '').trim();
    const rawTimeStr = String(timeInput || '').trim();

    // Caso A: Si ya es un ISO string absoluto completo
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawDateStr)) {
      const parsedUtc = new Date(rawDateStr);
      if (!isNaN(parsedUtc.getTime())) {
        this.logger.log(`[WebChat - Temporal Engine] [AI-FIRST FLOW] Entrada ISO 8601 completa: "${rawDateStr}" -> ${parsedUtc.toISOString()}`);
        return parsedUtc;
      }
    }

    // Caso B: Si fecha viene en formato YYYY-MM-DD
    const isoDateMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
    if (isoDateMatch) {
      targetYear = parseInt(isoDateMatch[1], 10);
      targetMonth = parseInt(isoDateMatch[2], 10) - 1;
      targetDay = parseInt(isoDateMatch[3], 10);
      if (isoDateMatch[4]) targetHour = parseInt(isoDateMatch[4], 10);
      if (isoDateMatch[5]) targetMinute = parseInt(isoDateMatch[5], 10);
      this.logger.log(`[WebChat - Temporal Engine] [AI-FIRST FLOW] Fecha normalizada estructurada: "${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}" | Hora: "${rawTimeStr || `${targetHour}:${String(targetMinute).padStart(2, '0')}`}"`);
    } else {
      // Caso C: Fecha en lenguaje natural
      const lower = rawDateStr.toLowerCase();
      const monthNames: Record<string, number> = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
      };
      const dayMap: Record<string, number> = {
        domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
        jueves: 4, viernes: 5, sábado: 6, sabado: 6,
      };

      // 1. Días relativos
      if (
        lower.includes('pasado mañana') ||
        lower.includes('pasado manana') ||
        lower.includes('pasadomañana') ||
        lower.includes('pasadomanana') ||
        lower.includes('day after tomorrow')
      ) {
        const d = new Date(Date.UTC(targetYear, targetMonth, targetDay + 2));
        targetYear = d.getUTCFullYear();
        targetMonth = d.getUTCMonth();
        targetDay = d.getUTCDate();
      } else if (lower.includes('mañana') || lower.includes('manana') || lower.includes('tomorrow')) {
        const d = new Date(Date.UTC(targetYear, targetMonth, targetDay + 1));
        targetYear = d.getUTCFullYear();
        targetMonth = d.getUTCMonth();
        targetDay = d.getUTCDate();
      } else if (lower.includes('hoy') || lower.includes('today')) {
        // hoy mantiene targetDay
      } else {
        // 2. Día exacto con nombre de mes (con o sin 'de', ej. "12 de octubre", "12 octubre", "12 oct")
        const textDateMatch = lower.match(/(?:el\s+)?(\d{1,2})(?:\s+de|\s+)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)(?:\s+(?:de\s+)?(\d{4}))?/i);
        if (textDateMatch && monthNames[textDateMatch[2].toLowerCase()] !== undefined) {
          targetDay = parseInt(textDateMatch[1], 10);
          targetMonth = monthNames[textDateMatch[2].toLowerCase()];
          if (textDateMatch[3]) targetYear = parseInt(textDateMatch[3], 10);
        } else {
          // 3. Día de la semana con número opcional (ej. "viernes 16", "el 16")
          const weekDayWithNumMatch = lower.match(/(?:el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+(\d{1,2})\b/i);
          if (weekDayWithNumMatch) {
            targetDay = parseInt(weekDayWithNumMatch[2], 10);
          } else {
            // Día de la semana solo (ej. "el lunes", "este viernes")
            let matchedDow = false;
            for (const [diaName, targetDow] of Object.entries(dayMap)) {
              if (lower.includes(diaName)) {
                const currentDayOfWeek = new Date(Date.UTC(targetYear, targetMonth, targetDay)).getUTCDay();
                let diff = targetDow - currentDayOfWeek;
                if (diff <= 0) diff += 7;
                const targetD = new Date(Date.UTC(targetYear, targetMonth, targetDay + diff));
                targetYear = targetD.getUTCFullYear();
                targetMonth = targetD.getUTCMonth();
                targetDay = targetD.getUTCDate();
                matchedDow = true;
                break;
              }
            }
            if (!matchedDow) {
              // Día del mes solo: ej. "el 20 a las 3"
              const singleDayMatch = lower.match(/(?:el\s+d[ií]a\s+|el\s+)(\d{1,2})\b/i);
              if (singleDayMatch) {
                targetDay = parseInt(singleDayMatch[1], 10);
              }
            }
          }
        }
      }
    }

    // ── EXTRACCIÓN DE HORA ──
    let stringForTime = rawTimeStr || rawDateStr;

    if (!rawTimeStr) {
      const lowerDate = rawDateStr.toLowerCase();
      // Eliminar día y mes con o sin 'de' (ej: "12 de octubre", "12 octubre", "12 oct")
      const monthRegexStr = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)';
      const replaceMonthRegex = new RegExp('\\b\\d{1,2}(?:\\s+de|\\s+)\\s+' + monthRegexStr + '(?:\\s+(?:de\\s+)?\\d{4})?', 'gi');
      let clean = lowerDate.replace(replaceMonthRegex, ' ');

      // Eliminar día de semana acompañado de número (ej. "viernes 16")
      clean = clean.replace(/\b(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+\d{1,2}\b/gi, ' ');
      // Eliminar días relativos y de la semana
      clean = clean.replace(/\b(hoy|mañana|manana|pasado\s+mañana|pasado\s+manana|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado)\b/gi, ' ');
      // Eliminar "el 20" si fue día del mes
      clean = clean.replace(/(?:el\s+d[ií]a\s+|el\s+)\d{1,2}\b/gi, ' ');

      // Si la frase tiene alarma secundaria ("con recordatorio a las 2 pm"), aislar la actividad principal
      const reminderSplit = clean.split(/\b(?:con\s+)?(?:recordatorio|reordatorio|alarma|recordar)\b/i);
      if (reminderSplit.length > 1 && reminderSplit[0].trim().length > 3) {
        clean = reminderSplit[0];
      } else if (reminderSplit.length > 1) {
        clean = reminderSplit.slice(1).join(' ');
      }
      stringForTime = clean;
    }

    const sLower = stringForTime.toLowerCase();

    if (sLower.includes('mediodía') || sLower.includes('mediodia')) {
      targetHour = 12;
      targetMinute = 0;
    } else if (sLower.includes('medianoche')) {
      targetHour = 0;
      targetMinute = 0;
    } else {
      // 1. Prioridad A: Hora con dos puntos "HH:MM"
      const colonMatch = sLower.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      // 2. Prioridad B: Prefijo explícito "a las / a la / para las" o sufijo explícito "am / pm"
      const explicitMatch = sLower.match(/(?:a\s+las?\s+|de\s+las?\s+|las?\s+|para\s+las?\s+|a\s+la\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
        || sLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
        || sLower.match(/(\d{1,2})\s*(?:hrs?|horas?|h)\b/i);

      const timeCandidate = colonMatch || explicitMatch;

      if (timeCandidate) {
        let hour = parseInt(timeCandidate[1], 10);
        const minutes = timeCandidate[2] ? parseInt(timeCandidate[2], 10) : 0;
        const ampm = timeCandidate[3]?.toLowerCase()
          || (sLower.includes('pm') ? 'pm' : (sLower.includes('am') ? 'am' : null));
        const isPm = ampm === 'pm' || sLower.includes('de la tarde') || sLower.includes('de la noche');
        const isAm = ampm === 'am' || sLower.includes('de la mañana');

        if (isPm && hour < 12) hour += 12;
        if (isAm && hour === 12) hour = 0;
        if (!isPm && !isAm && hour < 8) hour += 12;

        targetHour = hour;
        targetMinute = minutes;
      }
    }

    if (!isoDateMatch) {
      this.logger.log(`[WebChat - Temporal Engine] [REGEX FALLBACK FLOW] Texto natural: "${rawDateStr}" | TimeInput: "${rawTimeStr || 'ninguno'}" -> Resuelto: ${targetDay}/${targetMonth + 1}/${targetYear} a las ${targetHour}:${String(targetMinute).padStart(2, '0')}`);
    }

    const calculatedDate = this.buildDateInTz(targetYear, targetMonth + 1, targetDay, targetHour, targetMinute);
    this.logger.log(`[WebChat - Temporal Engine] [RESULTADO] Fecha calculada en TZ (${tz}): ${calculatedDate.toISOString()}`);
    return calculatedDate;
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

  /**
   * Verifica si el texto proporcionado por el usuario (o su historial reciente)
   * contiene una referencia temporal explícita (días relativos, días de la semana,
   * meses, horas o expresiones horarias). Evita que el sistema asuma o alucine fechas/horas
   * cuando el usuario no las proporcionó.
   */
  hasTemporalReference(text?: string, conversationHistory?: ConversationHistoryMessage[]): boolean {
    if (this.checkTemporalText(text)) return true;

    if (conversationHistory && conversationHistory.length > 0) {
      const userMsgs = conversationHistory
        .filter(m => m.role === 'user')
        .filter(m => Boolean(m?.content));
      for (const msg of userMsgs) {
        if (this.checkTemporalText(msg.content)) {
          return true;
        }
      }
    }

    return false;
  }

  private checkTemporalText(text?: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const t = text.toLowerCase().trim();

    // 1. Días relativos
    if (/\b(hoy|mañana|manana|pasado\s+mañana|pasado\s+manana|pasadomañana|pasadomanana|ayer)\b/i.test(t)) {
      return true;
    }

    // 2. Días de la semana
    if (/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:el|este|pr[oó]ximo|para\s+el)\s+domingo\b/i.test(t) || /\bdomingo\s+(?:a\s+las?|\d{1,2}|pr[oó]ximo)\b/i.test(t)) {
      return true;
    }

    // 3. Meses (excluyendo 'julio' y 'abril' aislados porque son nombres propios de personas)
    if (/\b(enero|febrero|marzo|mayo|junio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:\d{1,2}\s+(?:de\s+)?|el\s+mes\s+de\s+|mediados\s+de\s+|principios\s+de\s+|finales\s+de\s+)(?:julio|abril)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:julio|abril)\s+(?:del?\s+)?\d{4}\b/i.test(t)) {
      return true;
    }
    if (/\b(?:en|para)\s+(?:julio|abril)(?:\s+(?:del?\s+)?\d{4}|[\.,;]|$)/i.test(t)) {
      return true;
    }

    // 4. Horas y momentos del día
    if (/\b(?:a\s+las?|a\s+la|para\s+las?|para\s+la)\s+\d{1,2}(?::\d{2})?/i.test(t)) {
      return true;
    }
    if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|hrs?|horas?)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:mediod[ií]a|medio\s+d[ií]a|en\s+la\s+mañana|en\s+la\s+tarde|en\s+la\s+noche)\b/i.test(t)) {
      return true;
    }

    // 5. Formatos numéricos de fecha
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) {
      return true;
    }
    if (/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(t)) {
      return true;
    }
    if (/\b(?:el|para\s+el|d[ií]a)\s+\d{1,2}\b/i.test(t)) {
      return true;
    }

    // 6. Indicadores de fecha relativa / futura
    if (/\b(?:pr[oó]xim[oa]|siguiente)\s+(?:semana|mes|d[ií]a)\b/i.test(t)) {
      return true;
    }
    if (/\ben\s+\d+\s+(?:d[ií]as|horas|semanas|minutos)\b/i.test(t)) {
      return true;
    }

    return false;
  }
}
