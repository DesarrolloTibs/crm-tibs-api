import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { WebchatEntityMatcherService } from './webchat-entity-matcher.service';
import { CubeQuery, CubeQueryPlan, RouterClassification, WebchatDomain } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatQueryPlannerService {
  private readonly logger = new Logger('WebchatQueryPlannerService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly entityMatcher: WebchatEntityMatcherService,
  ) {}

  /**
   * Parsea la respuesta del Agente Orquestador (Router) y extrae la clasificación de dominio e intención.
   */
  parseRouterClassification(rawLlmResponse: string, question: string): RouterClassification {
    const sanitized = this.aiAgentService.sanitizeJsonOutput(rawLlmResponse);

    try {
      const parsed = JSON.parse(sanitized);
      const domain: WebchatDomain = parsed.domain || this.inferDomainFromQuestion(question);
      let intent = parsed.intent || (domain === 'CONVERSATIONAL' ? 'CONVERSATIONAL' : (domain === 'ACTION_EXECUTION' ? 'ACTION_EXECUTION' : 'ANALYTICAL'));

      let actionPlan = parsed.actionPlan || null;
      if (!actionPlan && (parsed.action || domain === 'ACTION_EXECUTION' || intent === 'ACTION_EXECUTION')) {
        const actionType = parsed.action || this.inferActionTypeFromQuestion(question);
        if (actionType) {
          actionPlan = {
            action: actionType,
            parameters: parsed.parameters || parsed.params || parsed.data || {},
            thought: parsed.thought,
          };
          intent = 'ACTION_EXECUTION';
        }
      }

      return {
        thought: parsed.thought || 'Ruteo automático del orquestador.',
        intent: intent,
        domain: domain,
        canonicalSearchTerm: parsed.canonicalSearchTerm || (domain === 'VAGUE_SEARCH' ? question.trim() : undefined),
        responseTemplate: parsed.responseTemplate,
        actionPlan,
        dashboardRedirect: parsed.dashboardRedirect,
      };
    } catch (parseErr) {
      this.logger.warn(`[QueryPlanner - Router] Error parseando JSON de Router. Aplicando heurística.`);

      // Heurística si el LLM devolvió texto plano
      if (this.entityMatcher.isVagueQuery(question)) {
        return {
          intent: 'VAGUE_SEARCH',
          domain: 'VAGUE_SEARCH',
          canonicalSearchTerm: question.trim(),
          thought: 'Heurística de búsqueda vaga.',
        };
      }

      const inferredDomain = this.inferDomainFromQuestion(question);
      const isAction = inferredDomain === 'ACTION_EXECUTION';
      let actionPlan = null;
      if (isAction) {
        const actionType = this.inferActionTypeFromQuestion(question);
        if (actionType) {
          actionPlan = {
            action: actionType,
            parameters: this.extractBasicActionParams(question, actionType),
            thought: 'Recuperación heurística de acción.',
          };
        }
      }

      return {
        intent: inferredDomain === 'CONVERSATIONAL' ? 'CONVERSATIONAL' : (isAction ? 'ACTION_EXECUTION' : 'ANALYTICAL'),
        domain: inferredDomain,
        thought: 'Recuperación de ruteo por coincidencia de palabras clave.',
        responseTemplate: inferredDomain === 'CONVERSATIONAL' ? rawLlmResponse : undefined,
        actionPlan,
      };
    }
  }

  /**
   * Infiere el dominio adecuado a partir de palabras clave en caso de fallo de JSON en el Router.
   */
  inferDomainFromQuestion(question: string): WebchatDomain {
    const q = (question || '').toLowerCase().trim();

    // Verbos de acción imperativos
    const actionRegex = /^(crea|crear|genera|generar|registra|registrar|agenda|agendar|programa|programar|modifica|modificar|actualiza|actualizar|cambia|cambiar|levanta|levantar|abre|abrir|pon|poner|asigna|asignar)\b/i;
    if (actionRegex.test(q)) {
      return 'ACTION_EXECUTION';
    }

    if (q.includes('ticket') || q.includes('incidencia') || q.includes('soporte') || q.includes('folio')) {
      return 'TICKETS';
    }
    if (q.includes('gasto') || q.includes('viático') || q.includes('viatico') || q.includes('comprobante')) {
      return 'GASTOS';
    }
    if (q.includes('actividad') || q.includes('agenda') || q.includes('reunion') || q.includes('reunión') || q.includes('llamada') || q.includes('evento')) {
      return 'ACTIVIDADES';
    }
    if (q.includes('empresa') || q.includes('cliente') || q.includes('contacto') || q.includes('cuenta')) {
      return 'CLIENTES_EMPRESAS';
    }
    if (q.includes('producto') || q.includes('precio') || q.includes('catálogo') || q.includes('catalogo')) {
      return 'PRODUCTOS';
    }
    if (q.includes('hola') || q.includes('buenos') || q.includes('buenas') || q.includes('ayuda') || q.includes('quién eres') || q.includes('gracias')) {
      return 'CONVERSATIONAL';
    }
    return 'OPORTUNIDADES'; // Dominio principal por defecto
  }

  /**
   * Infiere el tipo de acción a partir del texto de la consulta.
   */
  inferActionTypeFromQuestion(question: string): 'createOpportunity' | 'modifyOpportunity' | 'createActivity' | 'modifyActivity' | 'createTicket' | null {
    const q = (question || '').toLowerCase();
    const isModify = q.includes('modifica') || q.includes('actualiza') || q.includes('cambia') || q.includes('reprograma') || q.includes('mueve');

    if (q.includes('actividad') || q.includes('reunion') || q.includes('reunión') || q.includes('llamada') || q.includes('cita') || q.includes('agenda') || q.includes('programa')) {
      return isModify ? 'modifyActivity' : 'createActivity';
    }
    if (q.includes('ticket') || q.includes('incidencia') || q.includes('soporte') || q.includes('reporte') || q.includes('falla')) {
      return 'createTicket';
    }
    if (q.includes('oportunidad') || q.includes('cotizacion') || q.includes('cotización') || q.includes('proyecto') || q.includes('venta') || q.includes('monto')) {
      return isModify ? 'modifyOpportunity' : 'createOpportunity';
    }
    return 'createOpportunity';
  }

  /**
   * Extrae parámetros básicos de la pregunta en caso de rescate heurístico.
   */
  private extractBasicActionParams(question: string, actionType: string): Record<string, any> {
    const q = question.trim();
    const params: Record<string, any> = {};

    if (actionType === 'createOpportunity' || actionType === 'modifyOpportunity') {
      params.nombreProyecto = q.replace(/^(crea|crear|genera|registra|modifica|actualiza)\s+(una\s+)?(oportunidad|cotizacion|cotización|proyecto)?\s*(para|de)?/i, '').trim();
    } else if (actionType === 'createActivity' || actionType === 'modifyActivity') {
      params.activity = q;
      params.date = 'mañana a las 10am';
    } else if (actionType === 'createTicket') {
      params.title = q.replace(/^(crea|crear|levanta|levantar|abre|abrir|reporta)\s+(un\s+)?(ticket|incidencia|reporte)?\s*(por|de)?/i, '').trim() || q;
    }
    return params;
  }

  /**
   * Procesa la respuesta sin procesar del LLM y la convierte en un CubeQueryPlan validado.
   */
  parsePlanFromLlm(rawLlmResponse: string, question: string): CubeQueryPlan {
    const sanitized = this.aiAgentService.sanitizeJsonOutput(rawLlmResponse);

    try {
      const plan: CubeQueryPlan = JSON.parse(sanitized);

      // Si el LLM no categorizó la intención explícitamente pero la consulta es corta/vaga
      if (!plan.intent && this.entityMatcher.isVagueQuery(question)) {
        plan.intent = 'VAGUE_SEARCH';
        plan.canonicalSearchTerm = plan.canonicalSearchTerm || question.trim();
      }

      return plan;
    } catch (parseErr) {
      this.logger.warn(`[QueryPlanner] No se pudo parsear JSON directo del LLM. Aplicando recuperación.`);

      // Intento 2: Buscar bloques JSON completos o parciales en el texto crudo
      try {
        const jsonMatch = rawLlmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleaned = this.aiAgentService.sanitizeJsonOutput(jsonMatch[0]);
          const recoveredPlan = JSON.parse(cleaned);
          if (recoveredPlan && (recoveredPlan.cubeQuery || recoveredPlan.cubeQueries || recoveredPlan.intent)) {
            return recoveredPlan;
          }
        }
      } catch (jsonErr) {
        // Continuar con heurística si falla el bloque JSON
      }

      // Intento de recuperación de respuesta directa si el LLM devolvió texto plano
      const answerMatch = rawLlmResponse.match(/"responseTemplate"\s*:\s*"([^"]+)"/i) ||
                          rawLlmResponse.match(/"answer"\s*:\s*"([^"]+)"/i);

      // Si tiene plantilla pero NO contiene placeholders de Cube.dev (ej. saludo o texto estático)
      if (answerMatch && !answerMatch[1].includes('{')) {
        return {
          intent: 'CONVERSATIONAL',
          responseTemplate: answerMatch[1],
        };
      }

      // Si la consulta parece una búsqueda de nombre simple
      if (this.entityMatcher.isVagueQuery(question)) {
        return {
          intent: 'VAGUE_SEARCH',
          canonicalSearchTerm: question.trim(),
          thought: 'Recuperación automática para consulta vaga.',
        };
      }

      // Si la consulta contenía palabras de oportunidades/ventas perdidas o ganadas, construir plan analítico de respaldo
      const qLower = (question || '').toLowerCase();
      if (qLower.includes('perdida') || qLower.includes('perdido')) {
        return {
          intent: 'ANALYTICAL',
          detectedEntity: 'Oportunidades',
          canonicalSearchTerm: question.trim(),
          cubeQuery: {
            measures: ['Oportunidades.count', 'Oportunidades.montoTotalMxnSum'],
            dimensions: [
              'Oportunidades.nombreProyecto',
              'Usuarios.username',
              'Oportunidades.cuentaOCliente',
              'Oportunidades.montoTotal',
              'Oportunidades.moneda',
              'Etapas.nombre',
            ],
            filters: [
              { member: 'Etapas.stageType', operator: 'equals', values: ['2'] },
              { member: 'Oportunidades.archived', operator: 'equals', values: ['false'] },
            ],
            order: { 'Oportunidades.montoTotalMxnSum': 'desc' },
          },
          responseTemplate: 'Oportunidades perdidas registradas:',
        };
      }

      if (qLower.includes('venta') || qLower.includes('ganada') || qLower.includes('ganado')) {
        return {
          intent: 'ANALYTICAL',
          detectedEntity: 'Oportunidades',
          canonicalSearchTerm: question.trim(),
          cubeQuery: {
            measures: ['Oportunidades.count', 'Oportunidades.montoTotalMxnSum'],
            dimensions: [
              'Oportunidades.nombreProyecto',
              'Usuarios.username',
              'Oportunidades.cuentaOCliente',
              'Oportunidades.montoTotal',
              'Oportunidades.moneda',
              'Etapas.nombre',
            ],
            filters: [
              { member: 'Etapas.stageType', operator: 'equals', values: ['1'] },
              { member: 'Oportunidades.archived', operator: 'equals', values: ['false'] },
            ],
            order: { 'Oportunidades.montoTotalMxnSum': 'desc' },
          },
          responseTemplate: 'Ventas ganadas registradas:',
        };
      }

      return {
        intent: 'CONVERSATIONAL',
        thought: 'Fallo al parsear JSON del LLM.',
        responseTemplate: 'Lo siento, no pude interpretar correctamente tu consulta. ¿Podrías reformularla?',
      };
    }
  }

  /**
   * Extrae y divide las consultas generadas por el LLM si abarcan múltiples temas/cubos primarios.
   */
  extractAndSplitQueries(queryPlan: CubeQueryPlan): CubeQuery[] {
    let rawQueries: CubeQuery[] = [];
    if (queryPlan.cubeQueries && Array.isArray(queryPlan.cubeQueries) && queryPlan.cubeQueries.length > 0) {
      rawQueries = queryPlan.cubeQueries;
    } else if (queryPlan.cubeQuery && Object.keys(queryPlan.cubeQuery).length > 0) {
      rawQueries = [queryPlan.cubeQuery];
    }

    if (rawQueries.length === 0) return [];

    const finalQueries: CubeQuery[] = [];
    // Entidades raíz no vinculables entre sí en una sola agregación
    const ROOT_CUBES = ['Oportunidades', 'Tickets', 'Actividades', 'Gastos', 'Productos', 'Empresas'];

    for (const q of rawQueries) {
      if (!q) continue;

      const measures = q.measures || [];
      const rootCubesInMeasures = new Set<string>();
      for (const m of measures) {
        if (typeof m === 'string' && m.includes('.')) {
          const cube = m.split('.')[0];
          if (ROOT_CUBES.includes(cube)) {
            rootCubesInMeasures.add(cube);
          }
        }
      }

      // Solo dividimos si una sola query intenta medir simultáneamente más de una entidad raíz no vinculable (ej: Oportunidades.count y Tickets.count)
      if (rootCubesInMeasures.size > 1) {
        this.logger.log(`[QueryPlanner - MultiCube Split] Dividiendo consulta multi-cubo independiente con raíces: ${Array.from(rootCubesInMeasures).join(', ')}`);
        for (const primaryCube of rootCubesInMeasures) {
          const splitQ: CubeQuery = {};

          splitQ.measures = q.measures?.filter((m: string) => m.startsWith(`${primaryCube}.`));
          splitQ.dimensions = q.dimensions?.filter((m: string) =>
            m.startsWith(`${primaryCube}.`) || !ROOT_CUBES.some(rc => rc !== primaryCube && m.startsWith(`${rc}.`))
          );
          splitQ.filters = q.filters?.filter((f: any) =>
            f.member && (f.member.startsWith(`${primaryCube}.`) || !ROOT_CUBES.some(rc => rc !== primaryCube && f.member.startsWith(`${rc}.`)))
          );
          splitQ.timeDimensions = q.timeDimensions?.filter((td: any) =>
            td.dimension && td.dimension.startsWith(`${primaryCube}.`)
          );
          splitQ.order = q.order;
          splitQ.limit = q.limit;

          if ((splitQ.measures && splitQ.measures.length > 0) || (splitQ.dimensions && splitQ.dimensions.length > 0)) {
            finalQueries.push(splitQ);
          }
        }
      } else {
        finalQueries.push(q);
      }
    }

    return finalQueries;
  }
}
