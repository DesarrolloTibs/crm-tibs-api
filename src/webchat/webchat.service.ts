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
  CubeAnnotation,
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
   * Arquitectura jerárquica:
   * 1. Agente Orquestador / Router (~350 tokens): Clasifica intención y dominio.
   * 2. Si es conversacional o búsqueda vaga, resuelve de inmediato (0 tokens de subagente).
   * 3. Sub-Agente Especializado por Dominio (~600-1800 tokens): Genera CubeQueryPlan específico.
   * 4. Ejecución en Capa Semántica con filtros de seguridad y formateo inteligente.
   */
  async processQuery(
    question: string,
    userId: string,
    userRole: string,
    username: string,
    conversationHistory?: ConversationHistoryMessage[],
  ): Promise<WebchatResponse> {
    try {
      // 1. Construir historial de conversación reciente para contexto
      let historyText = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historyText = conversationHistory
          .slice(-4)
          .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
          .join('\n');
      }

      // 2. PASO 1: Invocación del Agente Orquestador / Router (ligero: ~350-450 tokens)
      const routerPrompt = this.promptBuilder.buildRouterPrompt(userId, userRole, username);
      const fullRouterPrompt = `${routerPrompt}

${historyText ? `[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n` : ''}
[CONSULTA DEL USUARIO]
${question}

Genera tu respuesta JSON:`;

      const rawRouterResponse = await this.aiAgentService.invokeLanguageModel(fullRouterPrompt, 0.1);
      this.logger.log(`[WebChat - Router Raw] ${rawRouterResponse.substring(0, 250)}`);

      const classification = this.queryPlanner.parseRouterClassification(rawRouterResponse, question);
      this.logger.log(`[WebChat - Router Classification] Domain: ${classification.domain} | Intent: ${classification.intent}`);

      // 3. Si el Orquestador determina que es CONVERSACIONAL (saludo, despedida, qué puedes hacer)
      if (classification.intent === 'CONVERSATIONAL' || classification.domain === 'CONVERSATIONAL') {
        return {
          answer: classification.responseTemplate || '¡Hola! Soy tu asistente del CRM. ¿En qué puedo ayudarte hoy?',
          dashboardRedirect: classification.dashboardRedirect,
        };
      }

      // 4. Si el Orquestador determina BÚSQUEDA VAGA de 1 o 2 palabras aisladas (persona, empresa, marca)
      if (classification.intent === 'VAGUE_SEARCH' || classification.domain === 'VAGUE_SEARCH' || this.entityMatcher.isVagueQuery(question)) {
        const vaguePlan: CubeQueryPlan = {
          intent: 'VAGUE_SEARCH',
          canonicalSearchTerm: classification.canonicalSearchTerm || question.trim(),
          dashboardRedirect: classification.dashboardRedirect,
        };
        return await this.handleVagueSearch(question, vaguePlan, userId, userRole);
      }

      // 5. PASO 2: Invocación del Sub-Agente Especializado del Dominio detectado
      const subAgentPrompt = this.promptBuilder.buildDomainPrompt(classification.domain, userId, userRole, username);
      const fullSubAgentPrompt = `${subAgentPrompt}

${historyText ? `[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n` : ''}
[CONSULTA DEL USUARIO]
${question}

Genera tu respuesta JSON:`;

      const rawSubAgentResponse = await this.aiAgentService.invokeLanguageModel(fullSubAgentPrompt, 0.2);
      this.logger.log(`[WebChat - SubAgent (${classification.domain}) Raw] ${rawSubAgentResponse.substring(0, 300)}`);

      // 6. Parsear y estructurar el plan de consulta del sub-agente
      const queryPlan = this.queryPlanner.parsePlanFromLlm(rawSubAgentResponse, question);
      if (classification.dashboardRedirect && !queryPlan.dashboardRedirect) {
        queryPlan.dashboardRedirect = classification.dashboardRedirect;
      }
      if (classification.canonicalSearchTerm && !queryPlan.canonicalSearchTerm) {
        queryPlan.canonicalSearchTerm = classification.canonicalSearchTerm;
      }

      // 7. Si el sub-agente respondió conversacional sin consulta
      if (queryPlan.intent === 'CONVERSATIONAL' && (!queryPlan.cubeQuery || Object.keys(queryPlan.cubeQuery).length === 0)) {
        return {
          answer: queryPlan.responseTemplate || queryPlan.thought || '¡Hola! ¿En qué puedo ayudarte hoy?',
          dashboardRedirect: queryPlan.dashboardRedirect,
        };
      }

      // 8. Si el sub-agente detectó búsqueda vaga
      const isExplicitQueryPlan =
        queryPlan.intent === 'ANALYTICAL' ||
        queryPlan.intent === 'SPECIFIC_ENTITY' ||
        (queryPlan.cubeQuery && (
          (queryPlan.cubeQuery.measures && queryPlan.cubeQuery.measures.length > 0) ||
          (queryPlan.cubeQuery.filters && queryPlan.cubeQuery.filters.length > 0)
        ));

      if (!isExplicitQueryPlan && (queryPlan.intent === 'VAGUE_SEARCH' || this.entityMatcher.isVagueQuery(question))) {
        return await this.handleVagueSearch(question, queryPlan, userId, userRole);
      }

      // 9. Ejecutar consulta analítica / específica
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
   * Realiza búsquedas concurrentes en Clientes, Empresas, Productos, Usuarios (si el rol lo permite),
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
    const cubeResult = await this.cubeExecutor.executeBatchCubeQueries(candidateQueries);
    let matchItems: EntityMatchItem[] = this.entityMatcher.mapCubeRowsToMatchItems(cubeResult.data);

    // 3. Si Cube.dev devolvió 0 resultados (por typos o separación de nombre/apellido), aplicar fallback en BD
    if (matchItems.length === 0) {
      this.logger.log(`[WebChat - Fallback Fuzzy] 0 resultados en Cube.dev. Ejecutando búsqueda difusa en BD para "${searchTerm}"`);
      matchItems = await this.entityMatcher.fallbackFuzzyEntitySearch(searchTerm, userRole, userId);
    }

    if (matchItems.length === 0) {
      return {
        answer: `No encontré ningún cliente, empresa, producto, usuario, oportunidad ni ticket con el nombre o término "**${searchTerm}**". ¿Deseas intentar con otro término?`,
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
    const aggregatedAnnotation: CubeAnnotation = { measures: {}, dimensions: {} };

    for (const q of queriesToExecute) {
      this.securityService.applySecurityFilters(q, userId, userRole);
      this.securityService.sanitizeFilters(q, userId, userRole);

      if (q.filters) {
        allExecutedFilters.push(...q.filters);
      }

      this.logger.log(`[WebChat - Executing Query] Filters: ${JSON.stringify(q.filters)} | Measures: ${JSON.stringify(q.measures)} | TimeDims: ${JSON.stringify(q.timeDimensions)}`);
      const execResult = await this.cubeExecutor.executeCubeQuery(q);
      const data = execResult.data;
      this.logger.log(`[WebChat - Cube Result] Rows: ${data?.length || 0} -> ${JSON.stringify(data)}`);

      if (data && data.length > 0) {
        allCubeData.push(...data);
      }
      if (execResult.annotation) {
        if (execResult.annotation.measures) {
          Object.assign(aggregatedAnnotation.measures!, execResult.annotation.measures);
        }
        if (execResult.annotation.dimensions) {
          Object.assign(aggregatedAnnotation.dimensions!, execResult.annotation.dimensions);
        }
      }
    }

    // Si Cube.dev no arrojó resultados y había un término canónico o filtros con texto
    const fallbackSearchTerm = queryPlan.canonicalSearchTerm || this.extractFallbackSearchTerm(queriesToExecute);

    if (allCubeData.length === 0 && fallbackSearchTerm) {
      this.logger.log(`[WebChat] 0 resultados en consulta específica. Probando fallback fuzzy para "${fallbackSearchTerm}"`);
      const fallbackMatches = await this.entityMatcher.fallbackFuzzyEntitySearch(
        fallbackSearchTerm,
        userRole,
        userId,
      );

      if (fallbackMatches.length > 0) {
        if (
          queryPlan.intent === 'SPECIFIC_ENTITY' ||
          queryPlan.detectedEntity === 'Clientes' ||
          queryPlan.detectedEntity === 'Empresas' ||
          queryPlan.detectedEntity === 'Productos' ||
          queryPlan.detectedEntity === 'Usuarios'
        ) {
          const compatibleMatches = fallbackMatches.filter(fm => {
            if (queryPlan.detectedEntity === 'Clientes') return fm.entityType === 'Cliente';
            if (queryPlan.detectedEntity === 'Empresas') return fm.entityType === 'Empresa';
            if (queryPlan.detectedEntity === 'Productos') return fm.entityType === 'Producto';
            if (queryPlan.detectedEntity === 'Usuarios') return fm.entityType === 'Usuario';
            return true;
          });
          for (const fm of (compatibleMatches.length > 0 ? compatibleMatches : fallbackMatches)) {
            allCubeData.push(fm.raw);
          }
        } else if (queryPlan.detectedEntity === 'Oportunidades') {
          // Reintentar en las 3 entidades (Usuarios, Clientes, Empresas) donde haya coincidencia
          const orFilters: any[] = [];
          const matchedTitles: string[] = [];

          const userMatch = fallbackMatches.find(fm => fm.entityType === 'Usuario');
          if (userMatch && !this.securityService.isExecutive(userRole)) {
            const uname = userMatch.title.split(' ')[0] || userMatch.title;
            orFilters.push({
              member: 'Usuarios.username',
              operator: 'contains',
              values: [uname],
            });
            matchedTitles.push(`ejecutivo **${userMatch.title}**`);
          }

          const clientOrCompMatches = fallbackMatches.filter(fm => fm.entityType === 'Cliente' || fm.entityType === 'Empresa');
          for (const match of clientOrCompMatches) {
            const cname = match.title.split(' ')[0] || match.title;
            orFilters.push({
              member: 'Oportunidades.cuentaOCliente',
              operator: 'contains',
              values: [cname],
            });
            matchedTitles.push(`${match.entityType.toLowerCase()} **${match.title}**`);
          }

          if (orFilters.length > 0) {
            this.logger.log(`[WebChat - Fallback Requery] Reintentando oportunidades multi-entidad: ${JSON.stringify(orFilters)}`);
            const stageFilter = allExecutedFilters.find((f: any) => f.member === 'Etapas.stageType');
            const archivedFilter = allExecutedFilters.find((f: any) => f.member === 'Oportunidades.archived');
            const retryFilters: any[] = orFilters.length === 1 ? [orFilters[0]] : [{ or: orFilters }];
            if (stageFilter) {
              retryFilters.push(stageFilter);
            }
            if (archivedFilter) {
              retryFilters.push(archivedFilter);
            }

            const originalTimeDims = queriesToExecute.find(q => q.timeDimensions && q.timeDimensions.length > 0)?.timeDimensions;

            const retryQuery: CubeQuery = {
              dimensions: [
                'Oportunidades.nombreProyecto',
                'Oportunidades.descripcion',
                'Usuarios.username',
                'Oportunidades.cuentaOCliente',
                'Oportunidades.montoTotal',
                'Oportunidades.moneda',
                'Etapas.nombre',
              ],
              filters: retryFilters,
              timeDimensions: originalTimeDims,
            };
            this.securityService.applySecurityFilters(retryQuery, userId, userRole);
            const retryRes = await this.cubeExecutor.executeCubeQuery(retryQuery);
            if (retryRes.data && retryRes.data.length > 0) {
              allCubeData.push(...retryRes.data);
              if (retryRes.annotation) {
                if (retryRes.annotation.measures) Object.assign(aggregatedAnnotation.measures!, retryRes.annotation.measures);
                if (retryRes.annotation.dimensions) Object.assign(aggregatedAnnotation.dimensions!, retryRes.annotation.dimensions);
              }
            } else {
              return {
                answer: `Se encontró coincidencia con ${matchedTitles.join(' y ')}, pero no tiene oportunidades registradas en el sistema.`,
                data: [],
                dashboardRedirect: queryPlan.dashboardRedirect,
              };
            }
          } else {
            return {
              answer: `No se encontraron oportunidades para "**${fallbackSearchTerm}**".`,
              data: [],
              dashboardRedirect: queryPlan.dashboardRedirect,
            };
          }
        } else if (queryPlan.detectedEntity === 'Tickets') {
          const orFilters: any[] = [];
          const matchedTitles: string[] = [];

          const userMatch = fallbackMatches.find(fm => fm.entityType === 'Usuario');
          if (userMatch && !this.securityService.isExecutive(userRole)) {
            const uname = userMatch.title.split(' ')[0] || userMatch.title;
            orFilters.push({
              member: 'Usuarios.username',
              operator: 'contains',
              values: [uname],
            });
            matchedTitles.push(`responsable **${userMatch.title}**`);
          }

          const clientMatches = fallbackMatches.filter(fm => fm.entityType === 'Cliente' || fm.entityType === 'Empresa');
          for (const match of clientMatches) {
            const cname = match.title.split(' ')[0] || match.title;
            orFilters.push({
              member: 'Tickets.contactName',
              operator: 'contains',
              values: [cname],
            });
            matchedTitles.push(`cliente **${match.title}**`);
          }

          if (orFilters.length > 0) {
            const stageFilter = allExecutedFilters.find((f: any) => f.member === 'EtapasTicket.stageType');
            const archivedFilter = allExecutedFilters.find((f: any) => f.member === 'Tickets.archived');
            const retryFilters: any[] = orFilters.length === 1 ? [orFilters[0]] : [{ or: orFilters }];
            if (stageFilter) retryFilters.push(stageFilter);
            if (archivedFilter) retryFilters.push(archivedFilter);

            const originalTimeDims = queriesToExecute.find(q => q.timeDimensions && q.timeDimensions.length > 0)?.timeDimensions;

            const retryQuery: CubeQuery = {
              dimensions: [
                'Tickets.ticketNumber',
                'Tickets.titulo',
                'Tickets.description',
                'Usuarios.username',
                'Tickets.tipoIncidencia',
                'Tickets.priority',
                'EtapasTicket.nombre',
              ],
              filters: retryFilters,
              timeDimensions: originalTimeDims,
            };
            this.securityService.applySecurityFilters(retryQuery, userId, userRole);
            const retryRes = await this.cubeExecutor.executeCubeQuery(retryQuery);
            if (retryRes.data && retryRes.data.length > 0) {
              allCubeData.push(...retryRes.data);
              if (retryRes.annotation) {
                if (retryRes.annotation.measures) Object.assign(aggregatedAnnotation.measures!, retryRes.annotation.measures);
                if (retryRes.annotation.dimensions) Object.assign(aggregatedAnnotation.dimensions!, retryRes.annotation.dimensions);
              }
            } else {
              return {
                answer: `Se encontró coincidencia con ${matchedTitles.join(' y ')}, pero no tiene tickets de soporte registrados.`,
                data: [],
                dashboardRedirect: queryPlan.dashboardRedirect,
              };
            }
          }
        }
      }
    }

    if (allCubeData.length === 0) {
      if (queryPlan.intent === 'ANALYTICAL') {
        const hasWonStage = allExecutedFilters.some(
          (f: any) => f.member === 'Etapas.stageType' && (f.values?.includes('1') || f.values?.includes(1))
        );
        const hasOpenStage = allExecutedFilters.some(
          (f: any) => f.member === 'Etapas.stageType' && (f.values?.includes('0') || f.values?.includes(0))
        );
        const hasLostStage = allExecutedFilters.some(
          (f: any) => f.member === 'Etapas.stageType' && (f.values?.includes('2') || f.values?.includes(2))
        );

        if (hasWonStage) {
          return {
            answer: 'No se encontraron ventas u oportunidades ganadas para tu consulta ($0.00 MXN / 0 ventas).',
            data: [],
            dashboardRedirect: queryPlan.dashboardRedirect,
          };
        }
        if (hasOpenStage) {
          return {
            answer: 'No se encontraron oportunidades abiertas en pipeline para tu consulta ($0.00 MXN / 0 cotizaciones).',
            data: [],
            dashboardRedirect: queryPlan.dashboardRedirect,
          };
        }
        if (hasLostStage) {
          return {
            answer: 'No se encontraron oportunidades perdidas registradas para tu consulta ($0.00 MXN).',
            data: [],
            dashboardRedirect: queryPlan.dashboardRedirect,
          };
        }
      }

      return {
        answer: 'No se encontraron resultados para tu consulta. ¿Quieres intentar con otros filtros?',
        data: [],
        dashboardRedirect: queryPlan.dashboardRedirect,
      };
    }

    // Formatear respuesta
    let formattedAnswer = await this.responseFormatter.formatResults(question, allCubeData, queryPlan, aggregatedAnnotation);
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

  /**
   * Extrae un término textual de búsqueda a partir de los filtros ejecutados si canonicalSearchTerm era nulo.
   */
  private extractFallbackSearchTerm(queries: CubeQuery[]): string | undefined {
    const ignoredFields = [
      'Oportunidades.archived',
      'Oportunidades.moneda',
      'Etapas.stageType',
      'EtapasTicket.stageType',
      'Oportunidades.priority',
      'Tickets.priority',
    ];
    const ignoredValues = new Set(['false', 'true', 'usd', 'mxn', '0', '1', '2', '3']);

    for (const q of queries) {
      const extractFromFilters = (filters: any[]): string | undefined => {
        for (const f of filters || []) {
          if (f.or && Array.isArray(f.or)) {
            const found = extractFromFilters(f.or);
            if (found) return found;
          }
          if (f.and && Array.isArray(f.and)) {
            const found = extractFromFilters(f.and);
            if (found) return found;
          }
          if (f.member && ignoredFields.includes(f.member)) {
            continue;
          }
          if (f.values && Array.isArray(f.values) && f.values.length > 0) {
            const val = f.values[0];
            if (
              typeof val === 'string' &&
              val.length >= 2 &&
              !ignoredValues.has(val.toLowerCase().trim()) &&
              !this.securityService.isValidUuid(val) &&
              !/^\d+$/.test(val)
            ) {
              return val;
            }
          }
        }
        return undefined;
      };

      const found = extractFromFilters(q.filters || []);
      if (found) return found;
    }

    return undefined;
  }
}

