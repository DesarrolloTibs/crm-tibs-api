import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { WebchatEntityMatcherService } from './webchat-entity-matcher.service';
import { CubeQuery, CubeQueryPlan } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatQueryPlannerService {
  private readonly logger = new Logger('WebchatQueryPlannerService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly entityMatcher: WebchatEntityMatcherService,
  ) {}

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

      // Intento de recuperación de respuesta directa si el LLM devolvió texto plano
      const answerMatch = rawLlmResponse.match(/"responseTemplate"\s*:\s*"([^"]+)"/i) ||
                          rawLlmResponse.match(/"answer"\s*:\s*"([^"]+)"/i);

      if (answerMatch) {
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
