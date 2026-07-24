import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AiAgentService } from '../conversations/ai-agent.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Stage } from '../stages/entities/stage.entity';

import { TicketStage } from '../tickets/entities/ticket-stage.entity';

/**
 * Mapeo de entidades Cube.dev y el campo de filtro por ejecutivo.
 * null = sin filtro (global), 'BLOCKED' = acceso prohibido para ejecutivos.
 */
const ENTITY_SECURITY_MAP: Record<string, string | null> = {
  Oportunidades: 'Oportunidades.ejecutivoId',
  Actividades: 'Actividades.userId',
  Gastos: 'Gastos.usuarioId',
  Tickets: 'Tickets.responsableId',
  Clientes: null,       // Global
  Productos: null,       // Global (catálogo)
  Usuarios: 'BLOCKED',  // Solo admins
};

interface CubeQueryPlan {
  thought: string;
  cubeQuery: {
    measures?: string[];
    dimensions?: string[];
    filters?: any[];
    order?: Record<string, string> | Array<[string, string]>;
    limit?: number;
    timeDimensions?: any[];
  };
  responseTemplate?: string;
  dashboardRedirect?: {
    tab?: string;
    executiveId?: string;
    dateStart?: string;
    dateEnd?: string;
    pipelineId?: string;
    helpdeskId?: string;
  } | null;
}

export interface WebchatResponse {
  answer: string;
  data?: Record<string, any>[];
  dashboardRedirect?: {
    tab?: string;
    executiveId?: string;
    dateStart?: string;
    dateEnd?: string;
    pipelineId?: string;
    helpdeskId?: string;
  } | null;
}

@Injectable()
export class WebchatService {
  private readonly logger = new Logger('WebchatService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    @InjectRepository(TicketStage)
    private readonly ticketStageRepository: Repository<TicketStage>,
    private readonly dataSource: DataSource,
  ) {}


  /**
   * Procesa una consulta de lenguaje natural del usuario autenticado del CRM.
   */
  async processQuery(
    question: string,
    userId: string,
    userRole: string,
    username: string,
    conversationHistory?: { role: string; content: string }[],
  ): Promise<WebchatResponse> {
    try {
      // 1. Generar system prompt con schemas de Cube.dev
      const systemPrompt = this.buildSystemPrompt(userId, userRole, username);

      // 2. Construir el historial de conversación para contexto
      let historyText = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historyText = conversationHistory
          .slice(-6) // Últimos 6 mensajes para contexto
          .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
          .join('\n');
      }

      // 3. Prompt final para Text-to-CubeQuery
      const fullPrompt = `${systemPrompt}

${historyText ? `[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n` : ''}
[CONSULTA DEL USUARIO]
${question}

Genera tu respuesta JSON:`;

      // 4. Llamar al LLM
      let llmResponse = await this.aiAgentService.invokeLanguageModel(fullPrompt, 0.1);
      this.logger.log(`[WebChat - LLM Raw] ${llmResponse.substring(0, 300)}`);

      llmResponse = this.aiAgentService.sanitizeJsonOutput(llmResponse);

      // 5. Parsear la respuesta del LLM
      let queryPlan: CubeQueryPlan;
      try {
        queryPlan = JSON.parse(llmResponse);
      } catch (parseErr) {
        this.logger.warn(`[WebChat] No se pudo parsear respuesta del LLM como JSON. Intentando respuesta directa.`);
        // Si el LLM no devolvió JSON, intentar extraer una respuesta de texto
        const answerMatch = llmResponse.match(/"answer"\s*:\s*"([^"]+)"/i);
        if (answerMatch) {
          return { answer: answerMatch[1] };
        }
        return { answer: 'Lo siento, no pude procesar tu consulta. ¿Podrías reformularla?' };
      }

      // 6. Si no hay cubeQuery, es una respuesta directa (saludo, aclaración, etc.)
      if (!queryPlan.cubeQuery || Object.keys(queryPlan.cubeQuery).length === 0) {
        return {
          answer: queryPlan.responseTemplate || queryPlan.thought || 'No entendí tu consulta. ¿Podrías ser más específico?',
          dashboardRedirect: queryPlan.dashboardRedirect,
        };
      }

      // 7. Detectar entidades usadas en la query y aplicar filtros de seguridad
      const cubeQuery = queryPlan.cubeQuery;
      if (userRole === 'executive' || userRole === 'Ejecutivo') {
        this.applySecurityFilters(cubeQuery, userId);
      }
      this.sanitizeFilters(cubeQuery, userId, userRole);



      // 8. Ejecutar query contra Cube.dev
      const cubeData = await this.executeCubeQuery(cubeQuery);

      if (!cubeData || cubeData.length === 0) {
        return {
          answer: 'No se encontraron resultados para tu consulta. ¿Quieres intentar con otros filtros?',
          data: [],
          dashboardRedirect: queryPlan.dashboardRedirect,
        };
      }

      // 9. Formatear la respuesta con el LLM
      let formattedAnswer = await this.formatResults(question, cubeData, queryPlan);
      formattedAnswer = this.deduplicateResponseLines(formattedAnswer);

      // 10. Garantizar redirección inteligente al dashboard por defecto si es una query analítica
      let dashboardRedirect = queryPlan.dashboardRedirect;
      if (!dashboardRedirect) {
        const allMembers = [
          ...(cubeQuery.measures || []),
          ...(cubeQuery.dimensions || []),
        ];
        const hasTickets = allMembers.some(m => m.startsWith('Tickets.'));
        const hasCommercial = allMembers.some(m => m.startsWith('Oportunidades.') || m.startsWith('Actividades.') || m.startsWith('Gastos.'));

        if (hasTickets || hasCommercial) {
          dashboardRedirect = {
            tab: hasTickets ? 'support' : 'commercial',
          };
        }
      }

      // Si tenemos redirección (auto-generada o del LLM), la enriquecemos con los filtros reales de la consulta
      if (dashboardRedirect) {
        // 1. Extraer ejecutivoId, pipelineId, helpdeskId de los filtros de la query
        for (const filter of cubeQuery.filters || []) {
          if (filter.operator === 'equals' && Array.isArray(filter.values) && filter.values.length > 0) {
            const val = filter.values[0];
            const member = filter.member;

            if (
              member === 'Oportunidades.ejecutivoId' ||
              member === 'Actividades.userId' ||
              member === 'Gastos.usuarioId' ||
              member === 'Tickets.responsableId'
            ) {
              if (!dashboardRedirect.executiveId) {
                dashboardRedirect.executiveId = val;
              }
            } else if (member === 'Oportunidades.pipelineId') {
              if (!dashboardRedirect.pipelineId) {
                dashboardRedirect.pipelineId = val;
              }
            } else if (member === 'Tickets.helpdeskId') {
              if (!dashboardRedirect.helpdeskId) {
                dashboardRedirect.helpdeskId = val;
              }
            }
          }
        }

        // 2. Si el rol es ejecutivo y no se ha definido executiveId, forzar su propio ID
        if (userRole === 'executive' && !dashboardRedirect.executiveId) {
          dashboardRedirect.executiveId = userId;
        }

        // 3. Extraer filtros de fecha si faltan
        if (!dashboardRedirect.dateStart || !dashboardRedirect.dateEnd) {
          const timeDimension = cubeQuery.timeDimensions?.[0];
          if (timeDimension?.dateRange) {
            if (Array.isArray(timeDimension.dateRange) && timeDimension.dateRange.length === 2) {
              dashboardRedirect.dateStart = dashboardRedirect.dateStart || timeDimension.dateRange[0];
              dashboardRedirect.dateEnd = dashboardRedirect.dateEnd || timeDimension.dateRange[1];
            } else if (typeof timeDimension.dateRange === 'string') {
              const dates = this.parsePredefinedDateRange(timeDimension.dateRange);
              if (dates) {
                dashboardRedirect.dateStart = dashboardRedirect.dateStart || dates.start;
                dashboardRedirect.dateEnd = dashboardRedirect.dateEnd || dates.end;
              }
            }
          } else {
            const dateFilters = cubeQuery.filters?.filter(
              (f: any) => f.member.endsWith('.createdAt') || f.member.endsWith('.fecha') || f.member.endsWith('.fechaApertura')
            );
            for (const filter of dateFilters || []) {
              if (filter.operator === 'inDateRange' && Array.isArray(filter.values) && filter.values.length === 2) {
                dashboardRedirect.dateStart = dashboardRedirect.dateStart || filter.values[0];
                dashboardRedirect.dateEnd = dashboardRedirect.dateEnd || filter.values[1];
              }
            }
          }
        }
      }

      formattedAnswer = await this.resolveStageUuidsInText(formattedAnswer);

      return {
        answer: formattedAnswer,
        data: cubeData,
        dashboardRedirect,
      };

    } catch (error: any) {
      this.logger.error(`[WebChat] Error procesando consulta: ${error.message}`, error.stack);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      return { answer: 'Ocurrió un error al procesar tu consulta. Por favor intenta de nuevo.' };
    }
  }

  /**
   * Reemplaza automáticamente cualquier UUID de etapa/stage presente en el texto
   * por su nombre legible (ej. "ff4266df-..." -> "Negociación").
   */
  private async resolveStageUuidsInText(text: string): Promise<string> {
    if (!text) return text;
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const matches = text.match(uuidRegex);
    if (!matches || matches.length === 0) return text;

    let resolvedText = text;
    for (const uuid of matches) {
      const stage = await this.stageRepository.findOne({ where: { id: uuid } });
      if (stage) {
        resolvedText = resolvedText.replace(new RegExp(uuid, 'g'), `"${stage.strname}"`);
        continue;
      }
      const ticketStage = await this.ticketStageRepository.findOne({ where: { id: uuid } });
      if (ticketStage) {
        resolvedText = resolvedText.replace(new RegExp(uuid, 'g'), `"${ticketStage.strname}"`);
      }
    }
    return resolvedText;
  }

  /**
   * Parsea un rango de fecha predefinido a fechas absolutas YYYY-MM-DD.
   */
  private parsePredefinedDateRange(range: string): { start: string; end: string } | null {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const format = (d: Date) => d.toISOString().split('T')[0];

    const rangeLower = range.toLowerCase();
    if (rangeLower.includes('month') && rangeLower.includes('this')) {
      return {
        start: format(new Date(currentYear, currentMonth, 1)),
        end: format(new Date(currentYear, currentMonth + 1, 0)),
      };
    }
    if (rangeLower.includes('month') && rangeLower.includes('last')) {
      return {
        start: format(new Date(currentYear, currentMonth - 1, 1)),
        end: format(new Date(currentYear, currentMonth, 0)),
      };
    }
    if (rangeLower.includes('year') && rangeLower.includes('this')) {
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
      };
    }
    return null;
  }

  /**
   * Construye el system prompt que describe todos los schemas de Cube.dev disponibles.
   */
  private buildSystemPrompt(userId: string, userRole: string, username: string): string {
    const now = new Date();
    const mexicoCityISO = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fechaHoy = `${diasSemana[mexicoCityISO.getDay()]} ${mexicoCityISO.getDate()} de ${meses[mexicoCityISO.getMonth()]} de ${mexicoCityISO.getFullYear()}`;
    const horaActual = mexicoCityISO.toTimeString().slice(0, 5);

    const roleDescription = userRole === 'admin'
      ? 'ADMINISTRADOR — Puede consultar datos globales de toda la organización sin restricciones.'
      : `EJECUTIVO (ID: ${userId}) — Solo puede ver datos vinculados a él. Los filtros de seguridad se aplican automáticamente.`;

    return `Eres el Asistente de Consultas Analíticas del CRM. Tu tarea es traducir preguntas en lenguaje natural a queries de Cube.dev y devolver respuestas estructuradas.

[USUARIO ACTUAL]
Nombre: ${username}
Rol: ${roleDescription}
Fecha: ${fechaHoy} — Hora: ${horaActual} (Ciudad de México)

[REGLAS OBLIGATORIAS]
1. Responde SIEMPRE con un único objeto JSON válido. Sin texto antes ni después.
2. Si la consulta no requiere datos (saludo, despedida, pregunta sobre ti), usa responseTemplate sin cubeQuery.
3. JAMÁS inventes datos. Solo consulta mediante cubeQuery.
4. Si el usuario pide ver algo en el dashboard o gráfica, incluye dashboardRedirect con los filtros correspondientes.
5. Cuando el usuario diga "mis" o "yo", se refiere a sus propios datos (el filtro de seguridad se aplica automáticamente por el sistema).
6. ${userRole === 'executive' ? 'Este usuario es EJECUTIVO. NO puede consultar la entidad Usuarios. Si lo intenta, responde con un mensaje de acceso denegado en responseTemplate.' : 'Este usuario es ADMIN. Puede consultar todas las entidades sin restricción.'}

[SCHEMAS DE CUBE.DEV DISPONIBLES]

1. **Oportunidades** (tabla: opportunities)
   - Measures: count, montoTotalSum, montoLicenciamientoSum, montoServiciosSum
   - Dimensions: id, nombreProyecto, descripcion, clienteId, ejecutivoId, pipelineId, stageId, montoTotal, moneda, archived, estimatedClosureDate, createdAt, priority
   - Joins: Clientes (via clienteId), Usuarios (via ejecutivoId), Etapas (via stageId)

2. **Etapas** (tabla: tblstagescatalog — Nombres legibles de etapas de Oportunidades)
   - Measures: count
   - Dimensions: id, nombre, pipelineId

3. **Actividades** (tabla: activities)
   - Measures: count
   - Dimensions: id, actividad, fecha, typeActivityId, opportunityId, clientId, userId
   - Joins: Clientes (via clientId), Oportunidades (via opportunityId), Usuarios (via userId), TiposActividad (via typeActivityId)

4. **Clientes** (tabla: clients)
   - Measures: count
   - Dimensions: id, nombre, apellido, correo, telefono, category, estatus

5. **Productos** (tabla: products)
   - Measures: count, precioBaseMax, precioBaseMin
   - Dimensions: id, nombre, descripcion, precioBase, requiereAnalisis, status

6. **Gastos** (tabla: expenses)
   - Measures: count, montoSum
   - Dimensions: id, concepto, monto, fecha, usuarioId, clientId, opportunityId, receiptUrl, createdAt
   - Joins: Clientes (via clientId), Oportunidades (via opportunityId), Usuarios (via usuarioId)

7. **Tickets** (tabla: tickets — Mesa de Ayuda)
   - Measures: count
   - Dimensions: id, ticketNumber (representa el folio del ticket, ej: folio 1, ticket 1, folio 00001), titulo, tipoIncidencia, description, priority, fechaApertura, fechaCierre, notasResolucion, alertSent, archived, clienteId, responsableId, helpdeskId, stageId, stageEnteredAt, contactName, contactEmail
   - Joins: Clientes (via clienteId), Usuarios (via responsableId), EtapasTicket (via stageId)
   - Priority: 1=Bajo, 2=Medio, 3=Alto

8. **EtapasTicket** (tabla: ticket_stages — Nombres legibles de etapas de Tickets/Mesa de Ayuda)
   - Measures: count
   - Dimensions: id, nombre

9. **Usuarios** (tabla: users) ${userRole === 'executive' ? '— ⛔ ACCESO RESTRINGIDO para tu rol' : ''}
   - Measures: count
   - Dimensions: id, username, correo, role, status

10. **TiposActividad** (tabla: tbltypeactivities — Catálogo de tipos de actividad)
    - Measures: count
    - Dimensions: id, nombre, status

[INSTRUCCIÓN CRÍTICA DE JOINS PARA NOMBRES DE ETAPAS / STAGES]
JAMÁS muestres un UUID técnico o identificador de base de datos como "stageId" (ejemplo: "ff4266df-fd36-43e2-bc5f-bc0b2fdc59ae") en tus respuestas. 
Para obtener el NOMBRE de la etapa de una oportunidad, DEBES hacer join con el cubo Etapas e incluir "Etapas.nombre" en tus dimensions (ejemplo: dimensions: ["Oportunidades.nombreProyecto", "Etapas.nombre"]).
Para obtener el NOMBRE de la etapa de un ticket, DEBES hacer join con el cubo EtapasTicket e incluir "EtapasTicket.nombre" en tus dimensions (ejemplo: dimensions: ["Tickets.ticketNumber", "EtapasTicket.nombre"]).
En tu responseTemplate usa siempre "{Etapas.nombre}" o "{EtapasTicket.nombre}" en lugar de "{stageId}" o "{Oportunidades.stageId}".

[INSTRUCCIÓN CRÍTICA DE JOINS PARA NOMBRES DE USUARIO]
Para obtener el nombre de un ejecutivo (en oportunidades), responsable (en tickets) o creador (en actividades o gastos), debes hacer join con el cubo Usuarios y agregar "Usuarios.username" en tus dimensions. JAMÁS intentes usar campos ficticios como "Oportunidades.ejecutivoNombre" o "Tickets.responsableName" en tu cubeQuery, ya que causará errores fatales de compilación. Por ejemplo, para obtener el responsable del ticket 1 debes usar: dimensions: ["Usuarios.username", "Tickets.tipoIncidencia"].

[INSTRUCCIÓN CRÍTICA PARA FOLIOS DE TICKETS]
En el sistema, los tickets se identifican y buscan por su "folio" o "número de ticket" (representado por la dimensión Tickets.ticketNumber). Si el usuario pregunta por un "folio" (ej: "folio 5" o "folio 00005"), debes mapearlo a la dimensión "Tickets.ticketNumber" utilizando únicamente el valor numérico (ej: "5").

[INSTRUCCIÓN CRÍTICA DE JOINS PARA TIPOS DE ACTIVIDAD]
JAMÁS muestres el "typeActivityId" (un número como 1, 2 o 3) en tus respuestas ni en la tabla. Para obtener el NOMBRE del tipo de actividad, DEBES hacer join con el cubo TiposActividad e incluir "TiposActividad.nombre" en tus dimensions en lugar de "Actividades.typeActivityId". Ejemplo: dimensions: ["Actividades.actividad", "Actividades.fecha", "TiposActividad.nombre"].


[FORMATO DE RESPUESTA JSON]
{
  "thought": "Análisis breve de la intención del usuario y la query que generaré.",
  "cubeQuery": {
    "measures": ["Entidad.measure"],
    "dimensions": ["Entidad.dimension"],
    "filters": [
      { "member": "Entidad.dimension", "operator": "equals|contains|gt|lt|gte|lte|inDateRange|beforeDate|afterDate", "values": ["valor"] }
    ],
    "order": { "Entidad.measure": "desc" },
    "limit": 10,
    "timeDimensions": [
      { "dimension": "Entidad.fechaCampo", "dateRange": ["2026-01-01", "2026-12-31"], "granularity": "month" }
    ]
  },
  "responseTemplate": "Texto para formatear la respuesta al usuario con los resultados.",
  "dashboardRedirect": {
    "tab": "commercial|helpdesk",
    "executiveId": "uuid-del-ejecutivo",
    "dateStart": "YYYY-MM-DD",
    "dateEnd": "YYYY-MM-DD",
    "pipelineId": "uuid-del-pipeline",
    "helpdeskId": "uuid-del-helpdesk"
  }
}

[EJEMPLOS]
- "¿Cuántas oportunidades tengo este mes?" →
  {"thought": "Cuenta de oportunidades del mes actual", "cubeQuery": {"measures": ["Oportunidades.count"], "timeDimensions": [{"dimension": "Oportunidades.createdAt", "dateRange": "This month"}]}, "responseTemplate": "Este mes tienes {Oportunidades.count} oportunidades registradas."}

- "Top 5 clientes que más he vendido en marzo" →
  {"thought": "Top 5 clientes por monto de oportunidades en marzo", "cubeQuery": {"measures": ["Oportunidades.montoTotalSum"], "dimensions": ["Clientes.nombre", "Clientes.apellido"], "timeDimensions": [{"dimension": "Oportunidades.createdAt", "dateRange": ["2026-03-01", "2026-03-31"]}], "order": {"Oportunidades.montoTotalSum": "desc"}, "limit": 5}, "responseTemplate": "Top 5 clientes con más ventas en marzo:"}

- "Muéstrame mis ventas de marzo en el dashboard" →
  {"thought": "Redirigir al dashboard con filtros", "cubeQuery": {}, "responseTemplate": "Te llevo al dashboard con los filtros de marzo aplicados.", "dashboardRedirect": {"tab": "commercial", "dateStart": "2026-03-01", "dateEnd": "2026-03-31"}}

- "¿A quién está asignado el folio 1 y qué tipo de incidencia es?" →
  {"thought": "Buscar información del ticket con folio 1 y su responsable asignado", "cubeQuery": {"dimensions": ["Usuarios.username", "Tickets.tipoIncidencia"], "filters": [{"member": "Tickets.ticketNumber", "operator": "equals", "values": ["1"]}], "limit": 1}, "responseTemplate": "El ticket con folio 1 está asignado a {Usuarios.username} y es de tipo {Tickets.tipoIncidencia}."}

- "Hola, ¿qué puedes hacer?" →
  {"thought": "El usuario saluda y pregunta capacidades", "cubeQuery": {}, "responseTemplate": "¡Hola! Soy tu asistente de consultas del CRM. Puedo ayudarte a consultar información sobre oportunidades, actividades, clientes, productos, gastos y tickets de mesa de ayuda. También puedo redirigirte al dashboard con filtros aplicados. ¿Qué deseas consultar?"}`;
  }

  /**
   * Aplica filtros de seguridad automáticos para usuarios ejecutivos.
   */
  private applySecurityFilters(cubeQuery: CubeQueryPlan['cubeQuery'], userId: string): void {
    const allMembers = [
      ...(cubeQuery.measures || []),
      ...(cubeQuery.dimensions || []),
      ...(cubeQuery.filters || []).map((f: any) => f.member),
      ...(cubeQuery.timeDimensions || []).map((td: any) => td.dimension),
    ];

    // Detectar qué entidades están siendo consultadas
    const entities = new Set<string>();
    for (const member of allMembers) {
      if (typeof member === 'string' && member.includes('.')) {
        entities.add(member.split('.')[0]);
      }
    }

    // Verificar si alguna entidad está bloqueada
    const hasTransactionalEntities = entities.has('Oportunidades') || 
                                     entities.has('Actividades') || 
                                     entities.has('Gastos') || 
                                     entities.has('Tickets') || 
                                     entities.has('Clientes');

    for (const entity of entities) {
      const securityField = ENTITY_SECURITY_MAP[entity];
      if (securityField === 'BLOCKED') {
        // Bloquear solo si no se acompaña de una entidad transaccional (ej: el usuario intentó consultar la lista general de usuarios)
        if (!hasTransactionalEntities) {
          throw new ForbiddenException(`No tienes permisos para consultar la entidad "${entity}".`);
        }
      }
    }

    // Agregar filtros de seguridad por ejecutivo
    if (!cubeQuery.filters) {
      cubeQuery.filters = [];
    }

    for (const entity of entities) {
      const securityField = ENTITY_SECURITY_MAP[entity];
      if (securityField && securityField !== 'BLOCKED') {
        // Verificar que no exista ya un filtro para este campo
        const alreadyFiltered = cubeQuery.filters.some(
          (f: any) => f.member === securityField
        );
        if (!alreadyFiltered) {
          cubeQuery.filters.push({
            member: securityField,
            operator: 'equals',
            values: [userId],
          });
          this.logger.log(`[WebChat - Security] Filtro añadido: ${securityField} = ${userId}`);
        }
      }
    }
  }

  /**
   * Sanitiza los filtros generados por el LLM para evitar errores de sintaxis UUID en base de datos.
   */
  private sanitizeFilters(cubeQuery: CubeQueryPlan['cubeQuery'], userId: string, userRole: string): void {
    if (!cubeQuery.filters) return;

    const securityFields = [
      'Oportunidades.ejecutivoId',
      'Actividades.userId',
      'Gastos.usuarioId',
      'Tickets.responsableId',
    ];

    const placeholders = new Set([
      'current_user_id',
      'my_user_id',
      'user_id',
      'me',
      'yo',
      'usuario_actual',
    ]);

    cubeQuery.filters = cubeQuery.filters.map((filter: any) => {
      // Si es un filtro sobre campos de ejecutivo
      if (securityFields.includes(filter.member)) {
        // Ejecutivos: forzar estrictamente su ID real para prevenir accesos no autorizados o fallos de placeholder
        if (userRole === 'executive') {
          return {
            ...filter,
            operator: 'equals',
            values: [userId],
          };
        }

        // Administradores: si el LLM usó un placeholder genérico o un UUID inválido, reemplazarlo con su ID actual
        if (Array.isArray(filter.values)) {
          const hasInvalidOrPlaceholder = filter.values.some((v: any) =>
            typeof v === 'string' && (placeholders.has(v.toLowerCase()) || !this.isValidUuid(v))
          );
          if (hasInvalidOrPlaceholder) {
            return {
              ...filter,
              operator: 'equals',
              values: [userId],
            };
          }
        }
      }
      return filter;
    });
  }

  /**
   * Valida si un string cumple con la estructura estándar de un UUID.
   */
  private isValidUuid(uuid: string): boolean {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  }

  /**
   * Ejecuta una query contra la REST API de la Capa Semántica (Cube.dev).
   */
  private async executeCubeQuery(cubeQuery: CubeQueryPlan['cubeQuery']): Promise<any[]> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    try {
      let orderFormatted = cubeQuery.order;
      if (orderFormatted && !Array.isArray(orderFormatted)) {
        orderFormatted = Object.entries(orderFormatted);
      }

      const queryPayload: any = {};
      if (cubeQuery.measures && cubeQuery.measures.length > 0) queryPayload.measures = cubeQuery.measures;
      if (cubeQuery.dimensions && cubeQuery.dimensions.length > 0) queryPayload.dimensions = cubeQuery.dimensions;
      if (cubeQuery.filters && cubeQuery.filters.length > 0) queryPayload.filters = cubeQuery.filters;
      if (orderFormatted) queryPayload.order = orderFormatted;
      if (cubeQuery.limit) queryPayload.limit = cubeQuery.limit;
      if (cubeQuery.timeDimensions && cubeQuery.timeDimensions.length > 0) {
        cubeQuery.timeDimensions = this.sanitizeTimeDimensions(cubeQuery.timeDimensions);
      }
      if (cubeQuery.timeDimensions && cubeQuery.timeDimensions.length > 0) queryPayload.timeDimensions = cubeQuery.timeDimensions;

      this.logger.log(`[WebChat - Cube Query] ${JSON.stringify(queryPayload)}`);

      const token = this.aiAgentService.getCubeApiToken(tenantSchema);

      const response = await fetch('http://127.0.0.1:4000/cubejs-api/v1/load', {

        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'x-tenant-schema': tenantSchema,
          'x-tenant-id': tenantSchema,
        },
        body: JSON.stringify({
          query: queryPayload,
          securityContext: { tenantSchema },
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        return data?.data || [];
      } else {
        const errText = await response.text();
        this.logger.error(`[WebChat - Capa Semántica Error] ${errText}`);
      }
    } catch (error: any) {
      this.logger.error(`[WebChat - Capa Semántica conexión fallida] ${error.message}`);
    }

    return [];
  }

  /**
   * Sanitiza los timeDimensions generados por el LLM para evitar fechas inválidas
   * que causan errores de PostgreSQL ("invalid input syntax for type timestamp").
   */
  private sanitizeTimeDimensions(timeDimensions: any[]): any[] {
    // Rangos predefinidos válidos que acepta Cube.js
    const validPredefinedRanges = new Set([
      'today', 'yesterday', 'this week', 'last week', 'this month', 'last month',
      'this quarter', 'last quarter', 'this year', 'last year',
      'last 7 days', 'last 30 days', 'last 90 days', 'last 365 days',
    ]);

    const isValidDateString = (val: string): boolean => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const d = new Date(val + 'T00:00:00Z');
        return !isNaN(d.getTime());
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
        const d = new Date(val);
        return !isNaN(d.getTime());
      }
      return false;
    };

    return timeDimensions
      .map((td: any) => {
        if (!td.dimension) return null;

        // Si no hay dateRange, es válido (solo granularity)
        if (!td.dateRange) return td;

        // dateRange como string predefinido (ej: "This month")
        if (typeof td.dateRange === 'string') {
          const normalized = td.dateRange.toLowerCase().trim();
          if (validPredefinedRanges.has(normalized)) {
            return { ...td, dateRange: td.dateRange };
          }
          // Intentar detectar rangos en español u otros patrones comunes
          if (normalized.includes('este mes') || normalized.includes('mes actual')) {
            return { ...td, dateRange: 'This month' };
          }
          if (normalized.includes('mes pasado') || normalized.includes('último mes') || normalized.includes('ultimo mes')) {
            return { ...td, dateRange: 'Last month' };
          }
          if (normalized.includes('este año') || normalized.includes('año actual') || normalized.includes('este ano')) {
            return { ...td, dateRange: 'This year' };
          }
          if (normalized.includes('año pasado') || normalized.includes('último año') || normalized.includes('ano pasado')) {
            return { ...td, dateRange: 'Last year' };
          }
          if (normalized.includes('esta semana') || normalized.includes('semana actual')) {
            return { ...td, dateRange: 'This week' };
          }
          if (normalized.includes('semana pasada') || normalized.includes('última semana')) {
            return { ...td, dateRange: 'Last week' };
          }
          if (normalized === 'hoy' || normalized === 'today') {
            return { ...td, dateRange: 'Today' };
          }
          if (normalized === 'ayer' || normalized === 'yesterday') {
            return { ...td, dateRange: 'Yesterday' };
          }
          // Si es una fecha válida sola, convertirla a array de un día
          if (isValidDateString(td.dateRange)) {
            return { ...td, dateRange: [td.dateRange, td.dateRange] };
          }
          // Valor no reconocido: eliminar dateRange para evitar crash
          this.logger.warn(`[WebChat - Sanitize] dateRange inválido removido: "${td.dateRange}"`);
          const { dateRange, ...rest } = td;
          return Object.keys(rest).length > 1 ? rest : null;
        }

        // dateRange como array [start, end]
        if (Array.isArray(td.dateRange)) {
          const validDates = td.dateRange.filter((v: any) => typeof v === 'string' && isValidDateString(v));
          if (validDates.length === 2) {
            return { ...td, dateRange: validDates };
          }
          if (validDates.length === 1) {
            return { ...td, dateRange: [validDates[0], validDates[0]] };
          }
          this.logger.warn(`[WebChat - Sanitize] dateRange array inválido removido: ${JSON.stringify(td.dateRange)}`);
          const { dateRange, ...rest } = td;
          return Object.keys(rest).length > 1 ? rest : null;
        }

        // Cualquier otro tipo: eliminar
        this.logger.warn(`[WebChat - Sanitize] dateRange tipo desconocido removido: ${JSON.stringify(td.dateRange)}`);
        const { dateRange, ...rest } = td;
        return Object.keys(rest).length > 1 ? rest : null;
      })
      .filter(Boolean);
  }

  /**
   * Formatea los resultados crudos de Cube.dev en una respuesta amigable usando el LLM.
   */
  private async formatResults(
    originalQuestion: string,
    cubeData: any[],
    queryPlan: CubeQueryPlan,
  ): Promise<string> {
    // Si hay exactamente 1 resultado y un template, usamos formato directo
    if (cubeData.length === 1 && queryPlan.responseTemplate) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate);
    }

    // Para cualquier otro caso, usamos el LLM para generar solo un resumen breve
    // (la tabla ya muestra los detalles completos al usuario)
    const truncatedData = cubeData.slice(0, 20);
    const formatPrompt = `Eres un asistente amigable del CRM. El usuario preguntó: "${originalQuestion}".

[DATOS REALES DE LA BASE DE DATOS]
Número de registros devueltos: ${truncatedData.length}
Datos:
${JSON.stringify(truncatedData, null, 2)}

${queryPlan.responseTemplate ? `Sugerencia de estructura: ${queryPlan.responseTemplate}` : ''}

[INSTRUCCIONES DE FORMATO]
- Los datos detallados ya se muestran al usuario en una tabla aparte, así que TÚ SOLO debes generar un BREVE RESUMEN de 1 o 2 oraciones.
- Ejemplo: "Se encontraron 3 tickets abiertos." o "Tienes 5 oportunidades activas este mes con un monto total de $120,000."
- NUNCA listes los registros uno por uno. La tabla ya lo hace.
- NUNCA muestres nombres técnicos de campos ni placeholders como {Tickets.count}.
- Si hay datos monetarios, incluye el total formateado con $ y separadores de miles.
- Responde SOLO con el resumen breve, sin prefijos ni explicaciones adicionales.`;

    try {
      const formatted = await this.aiAgentService.invokeLanguageModel(formatPrompt, 0.3);
      return formatted.trim() || this.simpleFormat(cubeData, queryPlan.responseTemplate);
    } catch (err) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate);
    }
  }

  private simpleFormat(data: any[], template?: string): string {
    if (data.length === 0) return 'No se encontraron resultados.';

    if (data.length === 1) {
      const row = data[0];
      if (template) {
        let formatted = template;
        
        // Iterar sobre todos los campos de la fila e interpolarlos en el template
        for (const [key, val] of Object.entries(row)) {
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          let displayVal = '';
          
          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) {
              displayVal = '';
            } else if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) {
              displayVal = 'Sin asignar';
            } else if (keyLower.includes('nombre') || keyLower.includes('name')) {
              displayVal = 'Sin nombre';
            } else if (isMonto) {
              displayVal = '$0';
            } else if (keyLower.includes('count') || keyLower.includes('sum')) {
              displayVal = '0';
            } else {
              displayVal = 'No especificado';
            }
          } else {
            displayVal = typeof val === 'number'
              ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
              : String(val);
          }

          // Reemplazo del placeholder completo (ej: {Oportunidades.count})
          const placeholder = `{${key}}`;
          formatted = formatted.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);

          // Reemplazo del placeholder corto sin el prefijo del cubo (ej: {count})
          const cleanKey = key.split('.').pop() || key;
          const cleanPlaceholder = `{${cleanKey}}`;
          formatted = formatted.replace(new RegExp(cleanPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);
        }
        return formatted;
      }
      
      const values = Object.entries(row)
        .map(([key, val]) => {
          const cleanKey = key.split('.').pop() || key;
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          let displayVal = '';
          
          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) {
              displayVal = '';
            } else if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) {
              displayVal = 'Sin asignar';
            } else if (keyLower.includes('nombre') || keyLower.includes('name')) {
              displayVal = 'Sin nombre';
            } else if (isMonto) {
              displayVal = '$0';
            } else if (keyLower.includes('count') || keyLower.includes('sum')) {
              displayVal = '0';
            } else {
              displayVal = 'No especificado';
            }
          } else {
            displayVal = typeof val === 'number'
              ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
              : String(val);
          }
          return displayVal !== '' ? `**${cleanKey}**: ${displayVal}` : '';
        })
        .filter(v => v !== '')
        .join(' | ');
      return values;
    }

    const rows = data.map((row, i) => {
      const vals = Object.entries(row)
        .map(([key, val]) => {
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) return '';
            if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) return 'Sin asignar';
            if (keyLower.includes('nombre') || keyLower.includes('name')) return 'Sin nombre';
            if (isMonto) return '$0';
            if (keyLower.includes('count') || keyLower.includes('sum')) return '0';
            return 'No especificado';
          }
          return typeof val === 'number'
            ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
            : String(val);
        })
        .filter(v => v !== '')
        .join(' — ');
      return `${i + 1}. ${vals}`;
    }).join('\n');

    return template ? `${template}\n\n${rows}` : rows;
  }

  /**
   * Elimina duplicados de líneas de respuesta formateadas por el LLM.
   */
  private deduplicateResponseLines(text: string): string {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const resultLines: string[] = [];
    let listIndex = 1;

    for (const line of lines) {
      const isListItem = /^\s*\d+[\.\)\-]\s*/.test(line);
      const cleanLine = line
        .replace(/^\s*\d+[\.\)\-]\s*/, '')
        .replace(/^\s*[\-\*•]\s*/, '')
        .trim()
        .toLowerCase();

      if (cleanLine.length === 0) {
        resultLines.push(line);
        continue;
      }

      if (seen.has(cleanLine)) {
        continue;
      }

      const isHeader = cleanLine.endsWith(':') || cleanLine.includes('aquí tiene') || cleanLine.includes('top');
      if (!isHeader) {
        seen.add(cleanLine);
      }

      if (isListItem && !isHeader) {
        const indent = line.match(/^\s*/)?.[0] || '';
        const separator = line.match(/^\s*\d+([\.\)\-])/)?.[1] || '.';
        const lineContent = line.replace(/^\s*\d+[\.\)\-]\s*/, '');
        resultLines.push(`${indent}${listIndex}${separator} ${lineContent}`);
        listIndex++;
      } else {
        resultLines.push(line);
      }
    }

    return resultLines.join('\n');
  }
}
