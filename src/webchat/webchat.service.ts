import { Injectable, Logger, ForbiddenException, HttpException } from '@nestjs/common';
import { AiAgentService } from '../conversations/ai-agent.service';
import { WebchatPromptBuilderService } from './services/webchat-prompt-builder.service';
import { WebchatQueryPlannerService } from './services/webchat-query-planner.service';
import { WebchatSecurityService } from './services/webchat-security.service';
import { WebchatCubeExecutorService } from './services/webchat-cube-executor.service';
import { WebchatEntityMatcherService } from './services/webchat-entity-matcher.service';
import { WebchatResponseFormatterService } from './services/webchat-response-formatter.service';
import {
  ConversationHistoryMessage,
  CubeQuery,
  CubeQueryPlan,
  EntityMatchItem,
  WebchatResponse,
} from './interfaces/webchat.interfaces';

export * from './interfaces/webchat.interfaces';

@Injectable()
export class WebchatService {
  private readonly logger = new Logger('WebchatService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly promptBuilder: WebchatPromptBuilderService,
    private readonly queryPlanner: WebchatQueryPlannerService,
    private readonly securityService: WebchatSecurityService,
    private readonly cubeExecutor: WebchatCubeExecutorService,
    private readonly entityMatcher: WebchatEntityMatcherService,
    private readonly responseFormatter: WebchatResponseFormatterService,
  ) {}

  /**
   * Procesa una consulta de lenguaje natural del usuario autenticado del CRM.
   * Coordina análisis de intención, búsquedas multi-entidad (para consultas vagas),
   * tolerancia a faltas de ortografía, filtros de seguridad por rol y ejecución en Capa Semántica.
   */
  async processQuery(
    question: string,
    userId: string,
    userRole: string,
    username: string,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
    try {
      // 1. Generar system prompt con schemas de Cube.dev y reglas de roles/intenciones
      const systemPrompt = this.promptBuilder.buildSystemPrompt(userId, userRole, username);

      // 2. Construir historial de conversación reciente para contexto
      let historyText = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historyText = conversationHistory
          .slice(-6)
          .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
          .join('\n');
      }

      // 3. Prompt completo para Text-to-CubeQuery
      const fullPrompt = `${systemPrompt}

${historyText ? `[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n` : ''}
[CONSULTA DEL USUARIO]
${question}

Genera tu respuesta JSON:`;

      // 4. Invocar el LLM para generar el plan
      const rawLlmResponse = await this.aiAgentService.invokeLanguageModel(fullPrompt, 0.2);
      this.logger.log(`[WebChat - LLM Raw] ${rawLlmResponse.substring(0, 300)}`);

      // 5. Parsear y estructurar el plan de consulta
      const queryPlan = this.queryPlanner.parsePlanFromLlm(rawLlmResponse, question);

      // 6. Si es puramente conversacional (saludo, despedida) o no requiere datos
      if (queryPlan.intent === 'CONVERSATIONAL' && (!queryPlan.cubeQuery || Object.keys(queryPlan.cubeQuery).length === 0)) {
        return {
          answer: queryPlan.responseTemplate || queryPlan.thought || '¡Hola! ¿En qué puedo ayudarte hoy?',
          dashboardRedirect: queryPlan.dashboardRedirect,
        };
      }

      // 7. FLUJO A: Consulta Vaga / Búsqueda Multi-Entidad (un solo nombre o término sin contexto explícito)
      if (queryPlan.intent === 'VAGUE_SEARCH' || this.entityMatcher.isVagueQuery(question)) {
        return await this.handleVagueSearch(question, queryPlan, userId, userRole);
      }

      // 8. FLUJO B: Consulta Específica / Analítica
      return await this.handleSpecificOrAnalyticalQuery(question, queryPlan, userId, userRole);

    } catch (error: any) {
      this.logger.error(`[WebChat] Error procesando consulta: ${error.message}`, error.stack);

      // Manejo específico de límites de suscripción y tokens
      if (error instanceof HttpException && error.getStatus() === 402) {
        const payload = error.getResponse() as any;
        const code = payload?.code || 'SUBSCRIPTION_ERROR';
        let msg = 'No es posible procesar consultas de IA en este momento.';
        if (code === 'TOKENS_LIMIT_EXCEEDED') {
          msg = 'Se ha alcanzado el límite de recursos de IA del plan actual. Contacte a un administrador para ampliar su suscripción.';
        } else if (code === 'SUBSCRIPTION_EXPIRED') {
          msg = 'La suscripción de la organización ha expirado. Contacte a un administrador para renovarla.';
        } else if (code === 'PLAN_NOT_ASSIGNED') {
          msg = 'La organización no cuenta con un plan de suscripción activo.';
        }
        return { answer: msg };
      }

      if (error instanceof ForbiddenException) {
        throw error;
      }

      return { answer: 'Ocurrió un error al procesar tu consulta. Por favor intenta de nuevo.' };
    }
  }

  /**
   * Maneja consultas donde solo se proporciona un nombre o término general.
   * Realiza búsquedas concurrentes en Clientes, Productos, Usuarios (si el rol lo permite),
   * Oportunidades y Tickets con fallback difuso (fuzzy) para errores ortográficos.
   */
  private async handleVagueSearch(
    question: string,
    queryPlan: CubeQueryPlan,
    userId: string,
    userRole: string,
  ): Promise<WebchatResponse> {
    const searchTerm = queryPlan.canonicalSearchTerm || question.trim();
    this.logger.log(`[WebChat - Vague Search] Buscando multi-entidad para: "${searchTerm}"`);

    // 1. Generar queries multi-entidad para Cube.dev
    const candidateQueries = this.entityMatcher.buildMultiEntityCubeQueries(searchTerm, userRole, userId);

    // 2. Ejecutar contra Cube.dev
    const cubeRows = await this.cubeExecutor.executeBatchCubeQueries(candidateQueries);
    let matchItems: EntityMatchItem[] = this.entityMatcher.mapCubeRowsToMatchItems(cubeRows);

    // 3. Si Cube.dev devolvió 0 resultados (por typos o separación de nombre/apellido), aplicar fallback en BD
    if (matchItems.length === 0) {
      this.logger.log(`[WebChat - Fallback Fuzzy] 0 resultados en Cube.dev. Ejecutando búsqueda difusa en BD para "${searchTerm}"`);
      matchItems = await this.entityMatcher.fallbackFuzzyEntitySearch(searchTerm, userRole, userId);
    }

    if (matchItems.length === 0) {
      return {
        answer: `No encontré ningún cliente, producto, usuario, oportunidad ni ticket con el nombre o término "**${searchTerm}**". ¿Deseas intentar con otro término?`,
        data: [],
        dashboardRedirect: queryPlan.dashboardRedirect,
      };
    }

    // 4. Formatear el resumen multi-entidad
    let answer = this.responseFormatter.formatMultiEntitySummary(searchTerm, matchItems);
    answer = await this.responseFormatter.resolveStageUuidsInText(answer);

    const cleanData = this.responseFormatter.cleanTableDataForFrontend(
      matchItems.map(item => item.raw),
    );

    return {
      answer,
      data: cleanData.length > 0 ? cleanData : matchItems.map(item => ({
        'Entidad': item.entityType,
        'Título': item.title,
        'Detalles': item.subtitle || '—',
      })),
      dashboardRedirect: queryPlan.dashboardRedirect,
    };
  }

  /**
   * Maneja consultas con contexto específico o analíticas.
   */
  private async handleSpecificOrAnalyticalQuery(
    question: string,
    queryPlan: CubeQueryPlan,
    userId: string,
    userRole: string,
  ): Promise<WebchatResponse> {
    const queriesToExecute = this.queryPlanner.extractAndSplitQueries(queryPlan);

    if (queriesToExecute.length === 0) {
      return {
        answer: queryPlan.responseTemplate || queryPlan.thought || 'No entendí tu consulta. ¿Podrías ser más específico?',
        dashboardRedirect: queryPlan.dashboardRedirect,
      };
    }

    const allCubeData: any[] = [];
    const allExecutedFilters: any[] = [];

    for (const q of queriesToExecute) {
      this.securityService.applySecurityFilters(q, userId, userRole);
      this.securityService.sanitizeFilters(q, userId, userRole);

      if (q.filters) {
        allExecutedFilters.push(...q.filters);
      }

      const data = await this.cubeExecutor.executeCubeQuery(q);
      if (data && data.length > 0) {
        allCubeData.push(...data);
      }
    }

    // Si Cube.dev no arrojó resultados y había un término canónico (ej. error ortográfico en nombre)
    if (allCubeData.length === 0 && queryPlan.canonicalSearchTerm) {
      this.logger.log(`[WebChat] 0 resultados en consulta específica. Probando fallback fuzzy para "${queryPlan.canonicalSearchTerm}"`);
      const fallbackMatches = await this.entityMatcher.fallbackFuzzyEntitySearch(
        queryPlan.canonicalSearchTerm,
        userRole,
        userId,
      );

      if (fallbackMatches.length > 0) {
        for (const fm of fallbackMatches) {
          allCubeData.push(fm.raw);
        }
      }
    }

    if (allCubeData.length === 0) {
      return {
        answer: 'No se encontraron resultados para tu consulta. ¿Quieres intentar con otros filtros?',
        data: [],
        dashboardRedirect: queryPlan.dashboardRedirect,
      };
    }

    // Formatear respuesta
    let formattedAnswer = await this.responseFormatter.formatResults(question, allCubeData, queryPlan);
    formattedAnswer = this.responseFormatter.deduplicateResponseLines(formattedAnswer);
    formattedAnswer = await this.responseFormatter.resolveStageUuidsInText(formattedAnswer);

    // Calcular redirección inteligente al dashboard
    const dashboardRedirect = this.responseFormatter.computeDashboardRedirect(
      queryPlan,
      allExecutedFilters,
      queriesToExecute,
      userId,
      userRole,
    );

    // Sanitizar y embellecer columnas de la tabla para el frontend (remueve ID, estatus, etc.)
    const cleanTableData = this.responseFormatter.cleanTableDataForFrontend(allCubeData);

    return {
      answer: formattedAnswer,
      data: cleanTableData,
      dashboardRedirect,
    };
  }
}
