import { Injectable, Logger, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { Conversation } from './entities/conversation.entity';
import { Product } from '../products/entities/product.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PhoneUtils } from '../common/utils/phone.utils';
import { ActivitiesService } from '../activities/activities.service';
import { ClientsService } from '../clients/clients.service';
import { SubscriptionValidatorService, ConsumptionAuditContext, TurnTokenAccumulator, CourtesyVerdict } from '../subscriptions/subscription-validator.service';
import { TenantConcurrencyService } from '../subscriptions/tenant-concurrency.service';
import { AiAgentToolsHandlerService } from './ai-agent-tools-handler.service';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';
import {
  RegisterContactSchema,
  UpdateContactSchema,
  CreateOpportunitySchema,
  ModifyOpportunitySchema,
  CheckAvailabilitySchema,
  CreateActivitySchema,
  CreateTicketSchema,
  ConsultProductCatalogSchema,
  SendQuotationPdfSchema,
  RequestHumanHandoffSchema,
} from './dto/ai-agent-tools.schema';

export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x: any[], y: any[]) => x.concat(y),
    default: () => [],
  }),
  route: Annotation<string>(),
  clientId: Annotation<string | null>(),
  clientInfo: Annotation<any>(),
  activeOpportunityId: Annotation<string | null>(),
  nextAction: Annotation<string | null>(),
  toolCallName: Annotation<string | null>(),
  toolCallInput: Annotation<any | null>(),
  toolCallResult: Annotation<any | null>(),
  response: Annotation<string | null>(),
  isHandedOff: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => (y !== undefined ? (x || y) : x),
    default: () => false,
  }),
  executedTools: Annotation<string[]>({
    reducer: (x: string[], y: string[]) => Array.from(new Set([...(x || []), ...(y || [])])),
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * Orchestrates the LangGraph conversation flow, LLM calls, and config management.
 * This service owns the entire message-processing pipeline for the AI agent.
 *
 * Collaborates with:
 *   - AiAgentToolsHandlerService — executes CRM tool calls
 *   - AiSubAgentMigrationService — seeds sub-agents on startup
 */
@Injectable()
export class AiAgentOrchestratorService {
  private readonly logger = new Logger('AiAgentOrchestratorService');

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    @InjectRepository(AiSubAgent)
    private readonly aiSubAgentRepository: Repository<AiSubAgent>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly activitiesService: ActivitiesService,
    private readonly clientsService: ClientsService,
    private readonly subscriptionValidator: SubscriptionValidatorService,
    private readonly tenantConcurrency: TenantConcurrencyService,
    private readonly toolsHandler: AiAgentToolsHandlerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Config Management ────────────────────────────────────────────────────

  /** Loads global AI credentials from public.ai_agent_configs (set by SuperAdmin). */
  private async getGlobalAiCredentials(): Promise<any> {
    try {
      const rows = await this.aiAgentConfigRepository.manager.query(
        `SELECT "modelProvider", "modelName", "openaiApiKey", "openaiEndpoint", "openaiApiVersion", "openaiEmbeddingModel", "geminiApiKey", "watsonxApiKey", "watsonxProjectId", "watsonxRegion", "watsonxEmbeddingModel", "maxNewTokens" FROM public.ai_agent_configs LIMIT 1`,
      );
      if (rows && rows.length > 0) return rows[0];
    } catch (err: any) {
      this.logger.warn(`No se pudieron cargar credenciales globales desde public.ai_agent_configs: ${err.message}`);
    }
    return {};
  }

  private async ensureHistoryMessageLimitColumnExists(): Promise<void> {
    try {
      const tenants: any[] = await this.aiAgentConfigRepository.manager.query(
        `SELECT schema_name FROM public.tenants WHERE is_active = true`,
      );
      for (const t of tenants) {
        try {
          await this.aiAgentConfigRepository.manager.query(
            `ALTER TABLE "${t.schema_name}".ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`,
          );
        } catch (_) {}
      }
      try {
        await this.aiAgentConfigRepository.manager.query(
          `ALTER TABLE public.ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`,
        );
      } catch (_) {}
    } catch (_) {
      try {
        await this.aiAgentConfigRepository.manager.query(
          `ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`,
        );
      } catch (_) {}
    }
  }

  /** Returns the active AI config for the current tenant, creating a default if absent. */
  async getOrInitConfig(): Promise<AiAgentConfig> {
    await this.ensureHistoryMessageLimitColumnExists();
    let config = await this.aiAgentConfigRepository.findOne({ where: {} });
    if (!config) {
      config = this.aiAgentConfigRepository.create({
        isActive: true,
        context: `Configura aquí el contexto y las instrucciones de comportamiento de tu agente. Define su identidad, los productos o servicios que ofrece, el tono de comunicación y los criterios para gestionar contactos, oportunidades y actividades en el CRM.`,
        temperature: 0.7,
        reminderOffsetMinutes: 60,
      });
      config = await this.aiAgentConfigRepository.save(config);
    }
    const globalCreds = await this.getGlobalAiCredentials();
    if (globalCreds.modelProvider) config.modelProvider = globalCreds.modelProvider;
    if (globalCreds.modelName) config.modelName = globalCreds.modelName;
    if (globalCreds.openaiApiKey !== undefined) config.openaiApiKey = globalCreds.openaiApiKey;
    if (globalCreds.openaiEndpoint !== undefined) config.openaiEndpoint = globalCreds.openaiEndpoint;
    if (globalCreds.openaiApiVersion !== undefined) config.openaiApiVersion = globalCreds.openaiApiVersion;
    if (globalCreds.openaiEmbeddingModel !== undefined) config.openaiEmbeddingModel = globalCreds.openaiEmbeddingModel;
    if (globalCreds.geminiApiKey !== undefined) config.geminiApiKey = globalCreds.geminiApiKey;
    if (globalCreds.watsonxApiKey !== undefined) config.watsonxApiKey = globalCreds.watsonxApiKey;
    if (globalCreds.watsonxProjectId !== undefined) config.watsonxProjectId = globalCreds.watsonxProjectId;
    if (globalCreds.watsonxRegion !== undefined) config.watsonxRegion = globalCreds.watsonxRegion;
    if (globalCreds.watsonxEmbeddingModel !== undefined) config.watsonxEmbeddingModel = globalCreds.watsonxEmbeddingModel;
    if (globalCreds.maxNewTokens !== undefined) config.maxNewTokens = globalCreds.maxNewTokens;
    return config;
  }

  /** Persists AI config for the current tenant, propagating global credentials to public schema. */
  async saveConfig(data: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    const hasGlobalFields =
      'modelProvider' in data || 'openaiApiKey' in data || 'geminiApiKey' in data || 'watsonxApiKey' in data || 'maxNewTokens' in data;

    if (hasGlobalFields) {
      try {
        const publicRows = await this.aiAgentConfigRepository.manager.query(`SELECT id FROM public.ai_agent_configs LIMIT 1`);
        if (publicRows && publicRows.length > 0) {
          await this.aiAgentConfigRepository.manager.query(
            `UPDATE public.ai_agent_configs SET
              "modelProvider" = COALESCE($1, "modelProvider"),
              "modelName" = COALESCE($2, "modelName"),
              "openaiApiKey" = COALESCE($3, "openaiApiKey"),
              "openaiEndpoint" = COALESCE($4, "openaiEndpoint"),
              "openaiApiVersion" = COALESCE($5, "openaiApiVersion"),
              "openaiEmbeddingModel" = COALESCE($6, "openaiEmbeddingModel"),
              "geminiApiKey" = COALESCE($7, "geminiApiKey"),
              "watsonxApiKey" = COALESCE($8, "watsonxApiKey"),
              "watsonxProjectId" = COALESCE($9, "watsonxProjectId"),
              "watsonxRegion" = COALESCE($10, "watsonxRegion"),
              "watsonxEmbeddingModel" = COALESCE($11, "watsonxEmbeddingModel"),
              "maxNewTokens" = COALESCE($12, "maxNewTokens")
             WHERE id = $13`,
            [data.modelProvider ?? null, data.modelName ?? null, data.openaiApiKey ?? null, data.openaiEndpoint ?? null, data.openaiApiVersion ?? null, data.openaiEmbeddingModel ?? null, data.geminiApiKey ?? null, data.watsonxApiKey ?? null, data.watsonxProjectId ?? null, data.watsonxRegion ?? null, data.watsonxEmbeddingModel ?? null, data.maxNewTokens ?? null, publicRows[0].id],
          );
        } else {
          await this.aiAgentConfigRepository.manager.query(
            `INSERT INTO public.ai_agent_configs ("modelProvider","modelName","openaiApiKey","openaiEndpoint","openaiApiVersion","openaiEmbeddingModel","geminiApiKey","watsonxApiKey","watsonxProjectId","watsonxRegion","watsonxEmbeddingModel","maxNewTokens") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [data.modelProvider || 'gemini', data.modelName || 'gemini-1.5-flash', data.openaiApiKey || null, data.openaiEndpoint || null, data.openaiApiVersion || null, data.openaiEmbeddingModel || 'text-embedding-ada-002', data.geminiApiKey || null, data.watsonxApiKey || null, data.watsonxProjectId || null, data.watsonxRegion || 'us-south', data.watsonxEmbeddingModel || 'ibm/slate-125m-english-rtrvr', data.maxNewTokens || 2048],
          );
        }
      } catch (err: any) {
        this.logger.error(`Error al guardar credenciales globales de IA: ${err.message}`);
      }
    }

    let existing = await this.aiAgentConfigRepository.findOne({ where: {} });
    if (!existing) {
      existing = this.aiAgentConfigRepository.create({
        isActive: data.isActive ?? true,
        context: data.context ?? '',
        temperature: data.temperature ?? 0.7,
        reminderOffsetMinutes: data.reminderOffsetMinutes ?? 60,
        historyMessageLimit: data.historyMessageLimit ?? 10,
        defaultUserId: data.defaultUserId ?? null,
      });
    } else {
      this.aiAgentConfigRepository.merge(existing, {
        isActive: data.isActive,
        context: data.context,
        defaultReplies: data.defaultReplies,
        temperature: data.temperature,
        reminderOffsetMinutes: data.reminderOffsetMinutes,
        historyMessageLimit: data.historyMessageLimit,
        defaultUserId: data.defaultUserId,
      });
    }
    await this.aiAgentConfigRepository.save(existing);
    return this.getOrInitConfig();
  }

  /** Returns all sub-agents for this tenant, seeding defaults if the table is empty. */
  async getSubAgents(): Promise<AiSubAgent[]> {
    let agents = await this.aiSubAgentRepository.find({ order: { key: 'ASC' } });
    if (!agents || agents.length === 0) {
      // Trigger seeding via the migration service indirectly through a direct DB insert fallback
      // (AiSubAgentMigrationService handles onModuleInit; if empty at runtime, we re-fetch after a moment)
      agents = await this.aiSubAgentRepository.find({ order: { key: 'ASC' } });
    }
    return agents;
  }

  /** Creates or updates a sub-agent configuration. */
  async saveSubAgent(data: any): Promise<AiSubAgent> {
    if (data.id) {
      const existing = await this.aiSubAgentRepository.findOne({ where: { id: data.id } });
      if (existing) {
        const updated = this.aiSubAgentRepository.merge(existing, data);
        return this.aiSubAgentRepository.save(updated);
      }
    }
    const created = this.aiSubAgentRepository.create(data as Partial<AiSubAgent>);
    return this.aiSubAgentRepository.save(created);
  }

  /** Deletes a sub-agent by ID. */
  async deleteSubAgent(id: string): Promise<void> {
    await this.aiSubAgentRepository.delete(id);
  }

  // ─── LLM Invocation ───────────────────────────────────────────────────────

  /**
   * Routes to the configured LLM provider (Gemini / OpenAI / Watsonx).
   * Runs under TenantConcurrencyService to regulate concurrent LLM calls per tenant,
   * with an unlimited waiting queue and instant circuit-breaker purge on quota limits.
   */
  async callLLM(config: AiAgentConfig, prompt: string, temperatureOverride?: number, auditContext?: ConsumptionAuditContext): Promise<string> {
    const activeSchema = TenantContextService.getTenantSchema();
    if (!activeSchema || activeSchema === 'public') {
      return this.executeLLM(config, prompt, temperatureOverride, auditContext);
    }

    return this.tenantConcurrency.runWithSlot(activeSchema, async () => {
      await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
      return this.executeLLM(config, prompt, temperatureOverride, auditContext);
    });
  }

  private async executeLLM(config: AiAgentConfig, prompt: string, temperatureOverride?: number, auditContext?: ConsumptionAuditContext): Promise<string> {
    const provider = config.modelProvider;
    const model = config.modelName;
    const maxTokens = config.maxNewTokens || 2048;
    const temperature = temperatureOverride ?? config.temperature;

    if (provider === 'openai') {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('API Key de OpenAI no configurada.');
      return this.callOpenAI(model, apiKey, prompt, temperature, config.openaiEndpoint || null, config.openaiApiVersion || null, maxTokens, auditContext);
    } else if (provider === 'watsonx') {
      const apiKey = config.watsonxApiKey || process.env.WATSONX_API_KEY;
      const projectId = config.watsonxProjectId || process.env.WATSONX_PROJECT_ID;
      const region = config.watsonxRegion || process.env.WATSONX_REGION || 'us-south';
      if (!apiKey || !projectId) throw new Error('Credenciales de IBM WatsonX no configuradas.');
      return this.callWatsonx(model, apiKey, projectId, region, prompt, temperature, maxTokens, auditContext);
    } else {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key de Gemini no configurada.');
      return this.callGemini(model, apiKey, prompt, temperature, maxTokens, auditContext);
    }
  }

  private async callGemini(model: string, apiKey: string, prompt: string, temperature: number, maxNewTokens = 2048, auditContext?: ConsumptionAuditContext): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: numericTemp, maxOutputTokens: Number(maxNewTokens) || 2048 } }),
    });
    if (!response.ok) throw new Error(`Error en API de Gemini: status ${response.status} - ${await response.text()}`);
    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;
    this.logger.log(`[Token Usage] Gemini - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
    await this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, 'gemini_execution', { ...auditContext, modelName: model });
    return text.trim();
  }

  private async callOpenAI(model: string, apiKey: string, prompt: string, temperature: number, endpoint?: string | null, apiVersion?: string | null, maxNewTokens = 2048, auditContext?: ConsumptionAuditContext): Promise<string> {
    const isAzure = !!endpoint;
    const url = isAzure
      ? `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=${apiVersion || '2024-12-01-preview'}`
      : 'https://api.openai.com/v1/chat/completions';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isAzure) { headers['api-key'] = apiKey; } else { headers['Authorization'] = `Bearer ${apiKey}`; }
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const response = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ ...(isAzure ? {} : { model }), messages: [{ role: 'user', content: prompt }], temperature: numericTemp, max_tokens: Number(maxNewTokens) || 2048 }),
    });
    if (!response.ok) throw new Error(`Error en API de ${isAzure ? 'Azure OpenAI' : 'OpenAI'}: status ${response.status} - ${await response.text()}`);
    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    this.logger.log(`[Token Usage] ${isAzure ? 'Azure ' : ''}OpenAI - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
    await this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, isAzure ? 'azure_openai_execution' : 'openai_execution', { ...auditContext, modelName: model });
    return text.trim();
  }

  private watsonxIamToken: string | null = null;
  private watsonxTokenExpiry: number = 0;

  private async getWatsonxIamToken(apiKey: string): Promise<string> {
    const now = Date.now();
    if (this.watsonxIamToken && now < this.watsonxTokenExpiry) {
      return this.watsonxIamToken;
    }

    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const tokenResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`,
        });

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text();
          throw new Error(`Error en IBM IAM (${tokenResponse.status}): ${errText}`);
        }

        const tokenData: any = await tokenResponse.json();
        this.watsonxIamToken = tokenData.access_token;
        this.watsonxTokenExpiry = now + ((tokenData.expires_in || 3600) - 120) * 1000;
        return this.watsonxIamToken!;
      } catch (err: any) {
        lastErr = err;
        this.logger.warn(`[WatsonX IAM] Intento ${attempt} al obtener token falló: ${err.message}`);
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    throw new Error(`No se pudo autenticar con IBM Cloud para WatsonX tras reintentos: ${lastErr?.message}`);
  }

  private async callWatsonx(model: string, apiKey: string, projectId: string, region: string, prompt: string, temperature: number, maxNewTokens = 2048, auditContext?: ConsumptionAuditContext): Promise<string> {
    let iamToken = await this.getWatsonxIamToken(apiKey);
    const rawRegion = region || 'us-south';
    const baseUrl = rawRegion.startsWith('http') ? rawRegion.replace(/\/$/, '') : `https://${rawRegion}.ml.cloud.ibm.com`;
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const numericMaxTokens = Number(maxNewTokens) || 2048;
    const effectiveTemp = Math.max(numericTemp, 0.1);

    // 1. Intentar primero con el endpoint oficial de Chat (/ml/v1/text/chat) recomendado por IBM
    try {
      const chatPayload = {
        model_id: model,
        project_id: projectId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: numericMaxTokens,
        temperature: effectiveTemp,
      };

      let chatResp = await fetch(`${baseUrl}/ml/v1/text/chat?version=2023-05-29`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${iamToken}` },
        body: JSON.stringify(chatPayload),
      });

      if (chatResp.status === 401) {
        this.watsonxIamToken = null;
        this.watsonxTokenExpiry = 0;
        iamToken = await this.getWatsonxIamToken(apiKey);
        chatResp = await fetch(`${baseUrl}/ml/v1/text/chat?version=2023-05-29`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${iamToken}` },
          body: JSON.stringify(chatPayload),
        });
      }

      if (chatResp.ok) {
        const chatData: any = await chatResp.json();
        const rawText = chatData.choices?.[0]?.message?.content || '';
        const inputTokens = chatData.usage?.prompt_tokens || 0;
        const outputTokens = chatData.usage?.completion_tokens || 0;
        const totalTokens = chatData.usage?.total_tokens || (inputTokens + outputTokens);
        this.logger.log(`[Token Usage] WatsonX (Chat) - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
        await this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, 'watsonx_execution', { ...auditContext, modelName: model });
        if (rawText.trim()) {
          return rawText.trim();
        }
      }
    } catch (chatErr: any) {
      this.logger.warn(`[WatsonX Chat] No se pudo generar con endpoint chat, recurriendo a text/generation: ${chatErr.message}`);
    }

    // 2. Fallback a text/generation formateando headers para instruct models (Llama 3/4, Granite, Mistral)
    const parameters: Record<string, any> = {
      max_new_tokens: numericMaxTokens,
      min_new_tokens: 2,
      decoding_method: 'sample',
      temperature: effectiveTemp,
    };
    let formattedInput = prompt;
    const modelLower = model.toLowerCase();
    if (modelLower.includes('mistral') && !prompt.includes('[INST]')) {
      formattedInput = `<s>[INST] ${prompt} [/INST]`;
    } else if ((modelLower.includes('llama') || modelLower.includes('llama-3') || modelLower.includes('llama-4')) && !prompt.includes('<|start_header_id|>')) {
      formattedInput = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nResponde en formato JSON estructurado.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
    } else if (modelLower.includes('granite-3') && !prompt.includes('<|start_of_role|>')) {
      formattedInput = `<|start_of_role|>system<|end_of_role|>\nResponde únicamente con un objeto JSON válido.<|start_of_role|>user<|end_of_role|>\n${prompt}<|start_of_role|>assistant<|end_of_role|>\n`;
    }

    let response: any = null;
    try {
      response = await fetch(`${baseUrl}/ml/v1/text/generation?version=2023-05-29`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${iamToken}` },
        body: JSON.stringify({ model_id: model, input: formattedInput, project_id: projectId, parameters }),
      });
    } catch (netErr: any) {
      this.logger.warn(`[WatsonX] Error de conexión: ${netErr.message}. Reintentando con nuevo token...`);
      this.watsonxIamToken = null;
      this.watsonxTokenExpiry = 0;
      const freshToken = await this.getWatsonxIamToken(apiKey);
      response = await fetch(`${baseUrl}/ml/v1/text/generation?version=2023-05-29`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({ model_id: model, input: formattedInput, project_id: projectId, parameters }),
      });
    }

    if (!response.ok) throw new Error(`Error en API de WatsonX: status ${response.status} - ${await response.text()}`);
    const data: any = await response.json();
    const rawText = data.results?.[0]?.generated_text || '';
    const inputTokens = data.results?.[0]?.input_token_count || 0;
    const outputTokens = data.results?.[0]?.generated_token_count || 0;
    this.logger.log(`[Token Usage] WatsonX - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${inputTokens + outputTokens}`);
    await this.recordTokenConsumption(inputTokens, outputTokens, inputTokens + outputTokens, 'watsonx_execution', { ...auditContext, modelName: model });
    return rawText.trim();
  }

  private async recordTokenConsumption(
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    actionName = 'ai_execution',
    auditContext?: ConsumptionAuditContext,
  ): Promise<void> {
    const step = auditContext?.metadata?.step;
    const route = auditContext?.metadata?.route;
    let effectiveAction = auditContext?.metadata?.action || actionName;
    if (step === 'router') {
      effectiveAction = 'router';
    } else if (step === 'subagent') {
      effectiveAction = route ? `subagent_${route}` : 'subagent';
    } else if (step) {
      effectiveAction = step;
    }

    if (auditContext?.turnAccumulator) {
      auditContext.turnAccumulator.promptTokens += promptTokens;
      auditContext.turnAccumulator.completionTokens += completionTokens;
      auditContext.turnAccumulator.totalTokens += totalTokens;
      auditContext.turnAccumulator.steps.push(effectiveAction);
      if (auditContext.modelName && !auditContext.turnAccumulator.models.includes(auditContext.modelName)) {
        auditContext.turnAccumulator.models.push(auditContext.modelName);
      }
      return;
    }

    const activeSchema = TenantContextService.getTenantSchema() || 'public';
    if (activeSchema !== 'public' && totalTokens > 0) {
      try {
        await this.subscriptionValidator.recordConsumption(
          activeSchema,
          promptTokens,
          completionTokens,
          totalTokens,
          false,
          effectiveAction,
          auditContext,
        );
        this.eventEmitter.emit(CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED, { schemaName: activeSchema });
      } catch (err: any) {
        this.logger.error(`Error al registrar consumo de tokens para tenant ${activeSchema}: ${err.message}`);
      }
    }
  }

  async commitTurnConsumption(
    turnAccumulator: TurnTokenAccumulator,
    actionName: string,
    auditContext: ConsumptionAuditContext,
  ): Promise<CourtesyVerdict | null> {
    const activeSchema = TenantContextService.getTenantSchema() || 'public';
    if (activeSchema !== 'public' && turnAccumulator.totalTokens > 0) {
      try {
        const primaryModel = turnAccumulator.models.join(', ') || auditContext.modelName || null;
        const verdict = await this.subscriptionValidator.recordConsumption(
          activeSchema,
          turnAccumulator.promptTokens,
          turnAccumulator.completionTokens,
          turnAccumulator.totalTokens,
          false,
          actionName,
          {
            ...auditContext,
            turnAccumulator: undefined,
            modelName: primaryModel,
            metadata: {
              ...(auditContext.metadata || {}),
              steps: turnAccumulator.steps,
            },
          },
        );
        this.eventEmitter.emit(CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED, { schemaName: activeSchema });
        return verdict;
      } catch (err: any) {
        this.logger.error(`Error al registrar consumo acumulado de mensaje para tenant ${activeSchema}: ${err.message}`);
      }
    }
    return null;
  }

  /** Cleans LLM output so it contains exactly one balanced JSON object. */
  cleanJsonOutput(text: string): string {
    if (!text || text.trim().length === 0) {
      return '{}';
    }
    let clean = text.trim();
    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) { clean = clean.substring(firstBrace); } else { clean = `{"thought": "${clean.replace(/^"+/, '')}`; }
    if (clean.includes('```json')) { clean = clean.replace(/```json/gi, '').replace(/```/gi, ''); }
    let openCount = 0, closeCount = 0, cutIndex = -1;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') openCount++;
      if (clean[i] === '}') { closeCount++; if (openCount > 0 && openCount === closeCount) { cutIndex = i; break; } }
    }
    if (cutIndex !== -1) { clean = clean.substring(0, cutIndex + 1); } else {
      let openBraces = (clean.match(/\{/g) || []).length;
      let closeBraces = (clean.match(/\}/g) || []).length;
      while (openBraces > closeBraces) { clean += '}'; closeBraces++; }
      while (closeBraces > openBraces && clean.endsWith('}')) { clean = clean.substring(0, clean.length - 1); closeBraces--; }
      const lastBrace = clean.lastIndexOf('}');
      if (lastBrace !== -1) clean = clean.substring(0, lastBrace + 1);
    }
    return clean;
  }

  // ─── Conversation Summary ─────────────────────────────────────────────────

  async updateConversationSummaryAsync(
    conversation: Conversation,
    recentMessages: Message[],
    lastClientMsg: string,
    lastAgentMsg: string,
    auditContext?: ConsumptionAuditContext,
  ): Promise<void> {
    try {
      const config = await this.getOrInitConfig();
      const recentTurnText = recentMessages
        .filter((m: Message) => m.sender !== 'system')
        .map((m: Message) => `${m.sender === 'contact' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n') + `\nCliente: ${lastClientMsg}\nAgente: ${lastAgentMsg}`;
      const summaryPrompt = `Eres un asistente de base de datos de CRM encargado de actualizar el resumen de la conversación.
Tu tarea es leer el [RESUMEN ANTERIOR] (si existe) y los [NUEVOS TURNOS RECIENTES] de la conversación, y generar un nuevo resumen acumulado e incremental en español.

Pautas estrictas:
- Sé extremadamente breve (máximo 2 a 3 líneas).
- Extrae únicamente los puntos clave del negocio acordados (ej. tipo de producto de interés, si se agendó una cita y su fecha/hora, datos personales proporcionados, o estado del soporte).
- Responde ÚNICAMENTE con el texto del resumen limpio, sin prefijos, sin markdown y sin aclaraciones.

[RESUMEN ANTERIOR]
${conversation.summary || 'No hay historial previo registrado.'}

[NUEVOS TURNOS RECIENTES]
${recentTurnText}

NUEVO RESUMEN ACUMULADO:`;
      const summaryAuditContext: ConsumptionAuditContext = {
        conversationId: conversation.id,
        clientId: conversation.clientId,
        clientName: conversation.clientName,
        channel: (conversation.channel as any) || 'whatsapp',
        userId: conversation.assignedUserId,
        turnAccumulator: auditContext?.turnAccumulator,
        metadata: { action: 'conversation_summary', step: 'conversation_summary' },
      };
      const newSummary = await this.callLLM(config, summaryPrompt, undefined, summaryAuditContext);
      if (newSummary && newSummary.trim() !== '') {
        conversation.summary = newSummary.trim();
        await this.aiAgentConfigRepository.manager.save(Conversation, conversation);
        this.logger.log(`Resumen conversacional de conversación ${conversation.id} actualizado con éxito.`);
      }
    } catch (err: any) {
      this.logger.error(`Error al actualizar resumen conversacional incremental: ${err.message}`);
    }
  }

  // ─── Main Processing Pipeline ─────────────────────────────────────────────

  /**
   * Processes an incoming message through the LangGraph state graph.
   * Returns the agent reply, the selected route, and the handoff flag.
   */
  async processIncomingMessage(
    conversation: Conversation,
    incomingContent: string,
  ): Promise<{ reply: string; route: string; isHandedOff: boolean }> {
    const holder: { verdict: CourtesyVerdict | null } = { verdict: null };
    const result = await this.processIncomingMessageCore(conversation, incomingContent, holder);

    // Cortesía excedida (> 2% del plan, allow_extra = false): tokens ya registrados, pero no se entrega la respuesta.
    if (holder.verdict?.exceeded && result.route !== 'subscription_blocked') {
      const v = holder.verdict;
      this.logger.warn(`[Subscription] Cortesía excedida (${v.courtesyUsed}/${v.courtesyCap} tokens) — respuesta suprimida.`);
      return {
        reply: '',
        route: 'subscription_blocked',
        isHandedOff: false,
        subscriptionCode: 'TOKENS_LIMIT_EXCEEDED',
        subscriptionPayload: {
          code: 'TOKENS_LIMIT_EXCEEDED',
          message: 'Se agotaron los tokens del plan y el margen de cortesía.',
          tokens_used: v.tokensUsed,
          tokens_limit: v.tokensLimit,
          next_renewal_date: v.nextRenewalDate,
        },
      } as any;
    }
    return result;
  }

  private async processIncomingMessageCore(
    conversation: Conversation,
    incomingContent: string,
    holder: { verdict: CourtesyVerdict | null },
  ): Promise<{ reply: string; route: string; isHandedOff: boolean }> {
    const config = await this.getOrInitConfig();
    if (!config.isActive) return { reply: '', route: 'inactive', isHandedOff: false };

    const turnAccumulator: TurnTokenAccumulator = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      steps: [],
      models: [],
    };

    const baseAuditContext: ConsumptionAuditContext = {
      conversationId: conversation.id,
      clientId: conversation.clientId,
      clientName: conversation.clientName,
      channel: (conversation.channel as any) || 'whatsapp',
      userId: conversation.assignedUserId,
      turnAccumulator,
    };

    let finalState: any = null;
    try {
      // 0. Detección automática en el mensaje del cliente si comparte su correo o teléfono para actualizar el CRM de inmediato
      const emailMatch = incomingContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const isWhatsAppChannel = conversation.channel?.toLowerCase() === 'whatsapp';
      const phoneMatch = !isWhatsAppChannel ? PhoneUtils.extractPhoneFromText(incomingContent) : null;
      if (conversation.clientId && (emailMatch || phoneMatch)) {
        const client = await this.clientRepository.findOne({ where: { id: conversation.clientId } });
        if (client) {
          let clientUpdated = false;
          if (emailMatch && (!client.correo || !client.correo.trim())) {
            client.correo = emailMatch[0].toLowerCase();
            clientUpdated = true;
            this.logger.log(`[processIncomingMessage] Correo auto-detectado y guardado en CRM: ${client.correo}`);
          }
          if (phoneMatch && (!client.telefono || !client.telefono.trim())) {
            client.telefono = phoneMatch;
            clientUpdated = true;
            this.logger.log(`[processIncomingMessage] Teléfono auto-detectado y guardado en CRM: ${client.telefono}`);
          }
          if (clientUpdated) {
            await this.clientRepository.save(client);
            conversation.client = client;
          }
        }
      }

      // 1. Build omni-channel history
      const historyLimit = config.historyMessageLimit && config.historyMessageLimit > 0 ? config.historyMessageLimit : 10;
      let messages: Message[] = [];
      if (conversation.clientId) {
        messages = await this.messageRepository.createQueryBuilder('m')
          .leftJoinAndSelect('m.conversation', 'c')
          .where('c.clientId = :clientId', { clientId: conversation.clientId })
          .orderBy('m.createdAt', 'DESC').take(historyLimit).getMany();
      } else {
        messages = await this.messageRepository.find({
          where: { conversationId: conversation.id }, order: { createdAt: 'DESC' }, take: historyLimit, relations: ['conversation'],
        });
      }
      messages.reverse();

      const historyText = messages
        .filter(m => m.sender !== 'system')
        .map(m => `[${(m.conversation?.channel || conversation.channel).toUpperCase()}] ${m.sender === 'contact' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n');

      // 2. Activity types (for scheduling sub-agent)
      const activityTypes = await this.activitiesService.findAllTypes();
      const activityTypesText = activityTypes.map(t => `- ID ${t.id}: ${t.strname}`).join('\n');

      // 3. Current Mexico City time
      const now = new Date();
      const mexicoCityISO = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const formatDate = (d: Date) => `${diasSemana[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
      const manana = new Date(mexicoCityISO); manana.setDate(manana.getDate() + 1);
      const pasadoManana = new Date(mexicoCityISO); pasadoManana.setDate(pasadoManana.getDate() + 2);
      const fechaContexto = [
        `Hoy: ${diasSemana[mexicoCityISO.getDay()]} ${mexicoCityISO.getDate()} de ${meses[mexicoCityISO.getMonth()]} de ${mexicoCityISO.getFullYear()} — Hora actual: ${mexicoCityISO.toTimeString().slice(0, 5)} (hora Ciudad de México)`,
        `Mañana: ${formatDate(manana)}`, `Pasado mañana: ${formatDate(pasadoManana)}`,
      ].join('\n');

      // 4. Graph nodes
      const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
        const subAgentsDescriptionText = subAgents.map(sa => `- Clave: "${sa.key}" - Descripción: "${sa.description}"`).join('\n');
        const lastAgentMsgObj = [...messages].reverse().find(m => m.sender === 'agent');
        const activeAssistantContext = lastAgentMsgObj
          ? `\n[ÚLTIMO MENSAJE EMITIDO POR EL ASISTENTE]\n"${lastAgentMsgObj.content}"\n(Evalúa si el cliente está respondiendo directamente a esta pregunta o solicitud del asistente para mantener la coherencia conversacional)`
          : '';

        const routerPrompt = `
${config.context || 'Eres el Agente Principal (Enrutador) de la Empresa.'}

[SUB-AGENTES DISPONIBLES EN EL SISTEMA]
${subAgentsDescriptionText}
- Clave: "general" - Descripción: "Úsala si el mensaje del cliente es un saludo, despedida, agradecimiento, charla informal (small talk), preguntas generales cortas que no requieran herramientas, o si ninguna de las otras claves es aplicable."

[REGLAS DE CONTINUIDAD Y CONTEXTO GENERAL]
- CONTINUIDAD MULTI-TURNO: Analiza el [HISTORIAL DE CONVERSACIÓN RECIENTE] y el [ÚLTIMO MENSAJE EMITIDO POR EL ASISTENTE]. Si el asistente le hizo una pregunta al cliente (por ejemplo, solicitando confirmación de cotización o datos de contacto como correo/teléfono) y el cliente responde a esa pregunta, la conversación DEBE continuar en la misma ruta ("comercial").
- PREGUNTAS SOBRE PRODUCTOS, CATÁLOGO O COTIZACIONES: Si el mensaje del cliente contiene cualquier consulta sobre productos, servicios, catálogo, modelos, existencias, precios o cotizaciones, DEBES clasificarlo en la ruta "comercial".
- SEGUIMIENTO EXCLUSIVAMENTE PARA AGENDAMIENTO REAL: Clasifica en "seguimiento" ÚNICA Y EXCLUSIVAMENTE cuando el cliente pida explícitamente agendar una cita/reunión/demo o confirme un día y hora de disponibilidad (ej. "mañana a las 4 pm", "el lunes"). No clasifiques en seguimiento si el cliente solo está dando sus datos de contacto para una cotización.
- Solo usa la ruta 'general' si el cliente únicamente saluda, se despide, da las gracias o plática libre sin preguntar por productos, agendamientos ni soporte técnico.

[EJEMPLOS DE RAZONAMIENTO COGNITIVO MULTI-TURNO]
- Último mensaje asistente: "¿podrías compartirme tu correo electrónico y un número de teléfono de contacto para tu cotización?"
  Cliente: "amadorjonny60@gmail.com, no tengo telefono"
  {"thought": "El cliente está proporcionando su correo en respuesta directa a la solicitud del asistente para emitir su cotización formal. La intención continúa en el flujo comercial.", "route": "comercial"}
- Último mensaje asistente: "El plan de Billy IDP cuesta $14,370 MXN. ¿Deseas cotizarlo?"
  Cliente: "Sí, adelante por favor"
  {"thought": "El cliente confirma su deseo de proceder con la cotización formal.", "route": "comercial"}
- Último mensaje asistente: "¿Cuál es tu horario preferido para la llamada?"
  Cliente: "Mañana a las 4 pm"
  {"thought": "El cliente confirma una fecha y hora para agendar una cita o llamada con un ejecutivo.", "route": "seguimiento"}
- Cliente: "Hola, buenos días"
  {"thought": "Saludo inicial de cortesía sin intención comercial, de agenda ni técnica.", "route": "general"}

[REGLA DE RESPUESTA OBLIGATORIA]
Responde ÚNICAMENTE con un objeto JSON por turno. Sin texto antes o después.
Estructura de respuesta: {"thought": "...", "route": "CLAVE_ELEGIDA"}

[RESUMEN DE LAS CONVERSACIONES PASADAS]
${conversation.summary || 'No hay historial previo registrado.'}

[HISTORIAL DE CONVERSACIÓN RECIENTE]
${historyText}
${activeAssistantContext}

[ÚLTIMO MENSAJE DEL CLIENTE]
Cliente: ${incomingContent}

Genera la clasificación en formato JSON (iniciando con { y terminando con }):`;

        let routerResponse = await this.callLLM(config, routerPrompt, undefined, { ...baseAuditContext, metadata: { step: 'router' } });
        this.logger.log(`[DEBUG - Router Raw Response] Salida: "${routerResponse}"`);
        routerResponse = this.cleanJsonOutput(routerResponse);
        let selectedRoute = 'general';
        try {
          const parsedRouter = JSON.parse(routerResponse);
          selectedRoute = parsedRouter.route || 'general';
          this.logger.log(`[LangGraph - Router] [AI-FIRST] Ruta: '${selectedRoute}' | Pensamiento: ${parsedRouter.thought}`);
        } catch (_) {
          const routeMatch = routerResponse.match(/"route"\s*:\s*"([^"]+)"/i);
          selectedRoute = routeMatch?.[1] || 'general';
          this.logger.log(`[LangGraph - Router Rescue] Ruta rescatada: '${selectedRoute}'`);
        }

        // Safety Net (Cinturón de seguridad / Fallback secundario):
        // Si el modelo por alguna anomalía desvió la ruta mientras hay un flujo activo de cotización y el cliente solo aportó contacto/confirmación,
        // reorientamos preventivamente como fallback heurístico, garantizando la resiliencia en producción sin suplantar la cognición primaria.
        const lastAgentMsg = (lastAgentMsgObj?.content || '').toLowerCase();
        const isQuotingFlowActive =
          lastAgentMsg.includes('cotiz') ||
          lastAgentMsg.includes('compartirme tu correo') ||
          lastAgentMsg.includes('número de teléfono') ||
          lastAgentMsg.includes('numero de telefono') ||
          lastAgentMsg.includes('proceder con la cotización') ||
          lastAgentMsg.includes('confirmar si las cantidades y productos son correctos');

        const incomingLower = incomingContent.toLowerCase();
        const containsContactInfoOrQuoteResponse =
          Boolean(emailMatch) ||
          Boolean(phoneMatch) ||
          incomingLower.includes('@') ||
          incomingLower.includes('no tengo') ||
          incomingLower.includes('no cuento') ||
          incomingLower.includes('solo por') ||
          incomingLower.includes('cotiz') ||
          /^(s[ií]|correcto|adelante|est[aá]\s*bien|procede|ok|de\s*acuerdo|perfecto|confirmo)/i.test(incomingContent.trim());

        const explicitSchedulingIntent =
          incomingLower.includes('agenda') ||
          incomingLower.includes('cita') ||
          incomingLower.includes('reunión') ||
          incomingLower.includes('reunion') ||
          incomingLower.includes('llamada') ||
          incomingLower.includes('demo') ||
          /\b(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2}\s*(?:am|pm|:\d{2}|hrs?))\b/i.test(incomingLower);

        if (isQuotingFlowActive && containsContactInfoOrQuoteResponse && !explicitSchedulingIntent) {
          if (selectedRoute !== 'comercial') {
            this.logger.warn(`[LangGraph - Router Safety Net] [FALLBACK HEURISTICO] Reorientando a 'comercial' porque el cliente está respondiendo a una solicitud de cotización activa (Ruta IA original: '${selectedRoute}').`);
            selectedRoute = 'comercial';
          }
        }

        return { route: selectedRoute };
      };

      const subAgentNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
        let subAgent = subAgents.find(sa => sa.key === state.route) || subAgents.find(sa => sa.key === 'general');
        let preFetchCatalogText = '';
        const isAffirmativeConfirmation = /^(s[ií]|correcto|adelante|est[aá]\s*bien|procede|genera(?:r)?(?:\s+la)?\s+cotizaci[oó]n|ok|de\s*acuerdo|perfecto|confirmo|si\s+por\s*fa(?:vor)?)/i.test(incomingContent.trim());
        if (!state.toolCallResult && !isAffirmativeConfirmation) {
          try {
            // 1. Obtener productos activos del catálogo para contextualizar la conversación
            const productRepo = this.aiAgentConfigRepository.manager.getRepository(Product);
            const activeCatalogProducts: Product[] = await productRepo.find({
              select: ['id', 'nombre'],
              where: { status: true },
            }).catch(() => []);

            // 2. Detectar productos mencionados en el mensaje actual o en el historial reciente
            const incomingLower = incomingContent.toLowerCase();
            const recentHistoryText = (messages.slice(-4).map(m => m.content).join(' ') + ' ' + (conversation.summary || '')).toLowerCase();

            const detectedProducts: Product[] = [];
            for (const p of activeCatalogProducts) {
              const pNameLower = p.nombre.toLowerCase();
              const pWords = pNameLower.split(/\s+/).filter(w => w.length >= 3);
              const mentionedInCurrent = incomingLower.includes(pNameLower) || (pWords.length > 0 && pWords.every(w => incomingLower.includes(w)));
              const mentionedInHistory = recentHistoryText.includes(pNameLower) || (pWords.length > 0 && pWords.every(w => recentHistoryText.includes(w)));
              
              // Detección por palabra clave distintiva o familia (ej. "nylon", "vicryl", "seda", "prolene", "botanas")
              const familyMatch = pWords.some(w => {
                if (w.length < 4) return false;
                const genericStopwords = new Set(['para', 'sutura', 'suturas', 'pieza', 'piezas', 'caja', 'cajas', 'producto', 'productos', 'servicio', 'servicios']);
                if (genericStopwords.has(w)) return false;
                return incomingLower.includes(w) || recentHistoryText.includes(w);
              });

              if (mentionedInCurrent || mentionedInHistory || familyMatch) {
                if (!detectedProducts.some(dp => dp.id === p.id)) {
                  detectedProducts.push(p);
                }
              }
            }

            // 3. Ejecutar búsqueda RAG combinada (mensaje actual + contexto de productos activos)
            let ragQueries = [incomingContent];
            if (detectedProducts.length > 0) {
              for (const dp of detectedProducts) {
                if (!incomingLower.includes(dp.nombre.toLowerCase())) {
                  ragQueries.push(`${dp.nombre} ${incomingContent}`);
                }
                if (detectedProducts.length > 1) {
                  ragQueries.push(dp.nombre);
                }
              }
            }

            const rawRagResults: any[] = [];
            const seenChunks = new Set<string>();
            for (const q of ragQueries) {
              const res = await this.toolsHandler.ragService.searchSimilar(q, 4, undefined, baseAuditContext).catch(() => []);
              for (const r of res) {
                const textSnippet = (r.pageContent || '').trim();
                if (textSnippet && !seenChunks.has(textSnippet)) {
                  seenChunks.add(textSnippet);
                  rawRagResults.push(r);
                }
              }
            }

            // Buscar específicamente con productKey en los PDFs de CADA producto detectado
            if (detectedProducts.length > 0) {
              for (const dp of detectedProducts) {
                const pKey = dp.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const specificRes = await this.toolsHandler.ragService.searchSimilar(incomingContent, 3, pKey, baseAuditContext).catch(() => []);
                for (const r of specificRes) {
                  const textSnippet = (r.pageContent || '').trim();
                  if (textSnippet && !seenChunks.has(textSnippet)) {
                    seenChunks.add(textSnippet);
                    rawRagResults.push(r);
                  }
                }
                if (detectedProducts.length > 1 || specificRes.length === 0) {
                  const overviewRes = await this.toolsHandler.ragService.searchSimilar(dp.nombre, 2, pKey, baseAuditContext).catch(() => []);
                  for (const r of overviewRes) {
                    const textSnippet = (r.pageContent || '').trim();
                    if (textSnippet && !seenChunks.has(textSnippet)) {
                      seenChunks.add(textSnippet);
                      rawRagResults.push(r);
                    }
                  }
                }
              }
            }

            const preDetectedKeys = [...new Set([
              ...rawRagResults.map(r => r.metadata?.product).filter(Boolean),
              ...detectedProducts.map(dp => dp.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''))
            ])];

            const preCubeResults: any[] = [];
            if (preDetectedKeys.length > 0) {
              for (const key of preDetectedKeys) {
                preCubeResults.push(...await this.toolsHandler.queryCubeProductsByKey(key));
              }
            } else if (state.route === 'comercial') {
              preCubeResults.push(...await this.toolsHandler.queryCubeProducts(incomingContent));
            }

            // Fallback a base de datos directa si Cube no devolvió los productos detectados
            if (preCubeResults.length === 0 && detectedProducts.length > 0) {
              for (const dp of detectedProducts) {
                const fullProd = await productRepo.findOne({ where: { id: dp.id } });
                if (fullProd) {
                  preCubeResults.push({
                    content: `[PRODUCTO EN EL CATALOGO - BASE DE DATOS]\nID del Producto (UUID): ${fullProd.id}\nNombre del Producto: ${fullProd.nombre}\nPrecio Base: $${fullProd.precioBase ?? 0} MXN por ${fullProd.unidadMedida || 'Pieza'}\nUnidad de Medida: ${fullProd.unidadMedida || 'Pieza'}\n${fullProd.observaciones?.trim() ? `Observaciones de Cotización (comunicar al cotizar o presentar el precio; evitar repetir en aclaraciones subsecuentes): ${fullProd.observaciones.trim()}` : 'Observaciones: Ninguna'}\nDescripción del Producto: ${fullProd.descripcion || 'Sin descripción'}\nEstado: ${fullProd.status ? 'Activo' : 'Inactivo'}`,
                    metadata: { source: 'database-fallback', productId: fullProd.id, productName: fullProd.nombre, precioBase: fullProd.precioBase },
                  });
                }
              }
            }

            // Para múltiples productos detectados, asegurar que cada producto tenga representación equilibrada
            let balancedRagChunks: any[] = [];
            if (detectedProducts.length > 1) {
              const chunksByProduct = new Map<string, any[]>();
              for (const r of rawRagResults) {
                const pKey = r.metadata?.product || 'general';
                if (!chunksByProduct.has(pKey)) chunksByProduct.set(pKey, []);
                chunksByProduct.get(pKey)!.push(r);
              }
              for (const [, chunks] of chunksByProduct.entries()) {
                balancedRagChunks.push(...chunks.slice(0, 3));
              }
            } else {
              balancedRagChunks = rawRagResults.slice(0, 5);
            }

            // Mantener hasta 1200 caracteres por fragmento RAG para no cortar límites ni tablas técnicas de PDFs
            const preMerged = [
              ...preCubeResults,
              ...balancedRagChunks.map(r => ({
                content: (r.pageContent || '').length > 1200
                  ? (r.pageContent || '').substring(0, 1200) + '... (continúa ficha técnica)'
                  : (r.pageContent || ''),
              })),
            ].slice(0, detectedProducts.length > 1 ? 12 : 6);

            preFetchCatalogText = preMerged.length > 0
              ? `\n[DOCUMENTACIÓN TÉCNICA, MANUALES, FAQS Y CATÁLOGO DE PRODUCTOS — FUENTE DE VERDAD]\n${preMerged.map(r => `- ${r.content}`).join('\n\n')}\n\n[REGLAS ESTRICTAS DE RESOLUCIÓN RAG-FIRST Y CONVERSACIÓN]
1. PRIORIDAD ABSOLUTA DE RESOLUCIÓN CON DOCUMENTACIÓN (RAG-FIRST):
   - Si la duda, problema, procedimiento, límite de plan, consumo de recursos, configuración o incidencia del cliente se encuentra explicada o resuelta en los documentos anteriores (manuales técnicos, fichas, FAQs o catálogo), DEBES RESOLVERLA Y EXPLICARLA DIRECTAMENTE AL CLIENTE usando 'final_answer'.
   - Está TERMINANTEMENTE PROHIBIDO levantar tickets con 'createTicket' o derivar con 'requestHumanHandoff' si la respuesta, solución o procedimiento ya viene explicado en la documentación adjunta. Los tickets y transferencias humanas son ÚNICAMENTE para fallas críticas del sistema no documentadas o peticiones expresas del cliente de hablar con un humano.
2. CONCISIÓN DE CHAT (MÁXIMO 2 A 4 ORACIONES): Responde de forma breve, ágil y conversacional (formato chat de WhatsApp / Facebook Messenger). Está TERMINANTEMENTE PROHIBIDO enviar folletos o párrafos largos que abrumen al cliente.
3. PROHIBIDO RE-INTRODUCIR EL PRODUCTO: Si el producto ya se mencionó o definió en el historial del chat, está ESTRICTAMENTE PROHIBIDO volver a iniciar con "X es una plataforma que utiliza Inteligencia Artificial para...". Responde directo a la duda del cliente sin rodeos.
4. PROHIBICIÓN DE EMPUJAR DEMOS O LLAMADAS PROACTIVAMENTE: Cuando el cliente consulte cómo funciona un producto, características técnicas, capacidades o dudas del catálogo/soporte, limítate a explicar y resolver sus dudas de forma directa, concisa y amigable. Está ESTRICTAMENTE PROHIBIDO empujar o incitar proactivamente al cliente a agendar demos, reuniones o llamadas (ej. NO preguntes "¿Te gustaría agendar una demo para ver cómo funciona?"). El cliente decidirá libremente cuándo solicitar una cotización o agendar una cita. Si el cliente solicita cotizar, atiende su cotización de inmediato.
5. CONFIRMACIÓN NATURAL: Si el cliente comenta o valida un dato (ej. "Veo en el sitio web que son 15 mil documentos"), confirma amigablemente ("¡Exacto! El plan incluye alrededor de 15,000 documentos al mes...") y continúa la conversación de forma ligera sin volcar toda la ficha técnica.
6. SOPORTE DE MÚLTIPLES PRODUCTOS:
   - Si el cliente pregunta por dos o más productos a la vez (comparación o consulta combinada), responde de forma organizada y estructurada (ej. una viñeta concisa de 1 a 2 líneas por cada producto).
   - Atribuye con exactitud quirúrgica las especificaciones técnicas, precios y capacidades a cada producto correspondiente sin mezclar datos entre ellos.
   - Si la conversación venía tratando sobre el Producto A y el cliente ahora consulta sobre el Producto B, enfócate en el Producto B de forma concisa sin volver a recitar la información del Producto A.
7. PRODUCTOS CON NOMBRES SIMILARES, VARIANTES O CALIBRES (EJ. NYLON 10-0, NYLON 6-0, VICRYL 6-0, VICRYL 5-0):
   - Si el cliente pregunta de forma genérica por una familia o palabra clave (ej. "¿Tienen suturas Nylon?", "¿Cuánto cuesta el Vicryl?") sin especificar calibre o medida, confirma amablemente la disponibilidad y presenta los calibres disponibles con su precio unitario en viñetas breves, preguntándole cuál necesita.
   - PROHIBIDO ASUMIR CALIBRES/VARIANTES EN COTIZACIONES: Si el cliente solicita cotizar pero no especificó el calibre (ej. "cotízame 5 de Nylon"), está TERMINANTEMENTE PROHIBIDO adivinar o asumir un calibre al azar. Debes preguntarle qué calibre requiere antes de proceder.
8. Si el cliente pregunta aspectos específicos o técnicos detallados no resueltos en el bloque anterior, llama a 'consult_product_catalog'.`
              : (state.route === 'comercial'
                  ? `\n[CATÁLOGO RELEVANTE — DATOS REALES DE LA BASE DE DATOS]\nNo se encontraron productos coincidentes en el catálogo.\n\n[REGLA ANTI-ALUCINACIÓN OBLIGATORIA] No se encontró ningún producto que coincida con la consulta del cliente. Si no se trata de un saludo o charla general, responde amablemente indicando que no cuentas con ese producto específico en el catálogo.`
                  : '');
          } catch (err: any) { this.logger.error(`Error en pre-fetch de catálogo y RAG: ${err.message}`); }
        }

        const ALL_TOOL_PROMPTS: Record<string, string> = {
          createOpportunity: `1. createOpportunity: Registra oportunidad comercial o cotización formal.
Campos: items(array de {productId: UUID, nombre: str, cantidad: num}), nombreProyecto(str), descripcion(str), montoTotal(num|null), moneda("MXN"|"USD"), correo(str,opc), telefono(str,opc), empresa(str,opc), lineaNegocio(str, opc), tipoEntrega(str, opc), licenciamiento(str, opc).
REGLA ESTRICTA DE ITEMS MULTI-PRODUCTO: Tras la confirmación del cliente, pasa SIEMPRE la propiedad 'items' estructurada incluyendo ABSOLUTAMENTE TODOS los productos confirmados con sus cantidades exactas (ej: [{"productId": "uuid-1", "nombre": "Nylon 10-0", "cantidad": 5}, {"productId": "uuid-2", "nombre": "Vicryl 6-0", "cantidad": 2}, {"productId": "uuid-3", "nombre": "Prolene 6-0", "cantidad": 1}]). NUNCA omitas ningún producto confirmado.
REGLA MANDATORIA DE VALIDACIÓN DE CONTACTO: Para emitir la cotización, como mínimo debe existir al menos UN dato de contacto (correo O teléfono) registrado en el CRM (bloque [CONTACTO CRM]). Si el contacto carece de ambos datos, haz la labor de solicitarlos amablemente al cliente mediante 'final_answer'. Pero si el cliente ya proporcionó al menos uno (o ya contaba con uno), ¡ESTÁ ESTRICTAMENTE PROHIBIDO FRENAR LA COTIZACIÓN!: no insistas por el dato faltante ni ofrezcas llamadas, llama INMEDIATAMENTE a 'createOpportunity' para generar y transmitir la cotización formal en PDF al chat.
{"thought": "...", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "Cotización Formal", "items": [{"productId": "uuid-1", "nombre": "Nylon 10-0", "cantidad": 5}, {"productId": "uuid-2", "nombre": "Vicryl 6-0", "cantidad": 2}], "moneda": "MXN"}}`,
          modifyOpportunity: `2. modifyOpportunity: Edita oportunidad existente.\nCampos: id(UUID), nombreProyecto, descripcion, montoTotal, cantidad, moneda.\n{"thought": "...", "tool_name": "modifyOpportunity", "tool_input": {"id": "uuid-real", "cantidad": 4}}`,
          updateContact: `3. updateContact: Actualiza contacto vinculado en el CRM con su información de contacto (correo, teléfono, empresa).\nCampos opcionales: nombre(str), correo(str), telefono(str), empresa(str).\n{"thought": "...", "tool_name": "updateContact", "tool_input": {"correo": "cliente@correo.com", "telefono": "+525512345678"}}`,
          checkAvailability: `4. checkAvailability: Valida disponibilidad de ejecutivo especializado únicamente para el día y hora indicados explícitamente por el cliente.\nCampos: proposedDate(ISO 8601 UTC en Ciudad de México UTC-6, suma 6 horas a la hora local). Ejemplo: 15:00 hora local = 21:00 UTC.\n{"thought": "...", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-30T21:00:00.000Z"}}`,
          createActivity: `5. createActivity: Crea la actividad únicamente si el cliente especificó su día/hora, checkAvailability dio AVAILABLE y el contacto cuenta con correo electrónico registrado (campo 'correo' en [CONTACTO CRM]). Si el contacto no tiene correo registrado, es OBLIGATORIO solicitarle su correo amablemente mediante 'final_answer' y guardarlo con 'updateContact' antes de llamar a 'createActivity'.\nCampos: activityText(str), date(ISO 8601 UTC, suma 6 horas a hora local), typeActivityId(num), opportunityId(UUID,opc), reminderTitle(opc), reminderDate(ISO 8601,opc), correo(str,opc).\nREGLA ESTRICTA DE RECORDATORIOS: El recordatorio es exclusivamente interno para el ejecutivo en el CRM. El cliente NO recibe ningún recordatorio antes de la cita. Está ESTRICTAMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará un recordatorio 1 hora antes o previo a la cita.\n{"thought": "...", "tool_name": "createActivity", "tool_input": {"activityText": "Llamada comercial", "date": "2026-07-30T21:00:00.000Z", "typeActivityId": 1}}`,
          createTicket: `6. createTicket: Registra ticket de soporte en el CRM cuando exista una falla técnica del sistema, bug o incidencia que requiera seguimiento.
REGLA MANDATORIA RAG-FIRST: Antes de crear un ticket, verifica si la respuesta o solución a la duda del cliente se encuentra en la documentación adjunta, fichas técnicas o FAQs del contexto (o búscala con 'consult_product_catalog'). Si la solución o explicación está documentada (ej. habilitar consumo adicional en el módulo Mi Empresa, guías de uso, límites de plan, compatibilidad), responde DIRECTAMENTE con 'final_answer' explicando el procedimiento y NO crees un ticket innecesario. ÚNICAMENTE crea ticket si la incidencia no está documentada, es una falla técnica del sistema o requiere intervención operativa.
Campos: title(str), description(str), priority(1=Bajo,2=Medio,3=Alto), category(str).
{"thought": "...", "tool_name": "createTicket", "tool_input": {"title": "Error en sincronización", "description": "Falla al sincronizar datos", "priority": 2, "category": "Soporte"}}`,
          consult_product_catalog: `7. consult_product_catalog: Consulta la base de conocimientos RAG, documentos adjuntos (manuales de usuario, FAQs, guías de configuración, fichas técnicas) y catálogo de productos. Admite términos técnicos, preguntas de configuración o nombres de productos (ej. "Billy IDP consumo adicional", "Preguntas Frecuentes", "límites de plan").
Campos: query(str).
{"thought": "...", "tool_name": "consult_product_catalog", "tool_input": {"query": "Billy IDP habilitar consumo adicional"}}`,
          sendQuotationPdf: `8. sendQuotationPdf: Genera y transmite el PDF de la cotización al chat.\nCampos opcionales: opportunityId(UUID).\n{"thought": "...", "tool_name": "sendQuotationPdf", "tool_input": {}}`,
          requestHumanHandoff: `9. requestHumanHandoff: Redirecciona la conversación a un ejecutivo especializado (humano) y desactiva el bot.
REGLA MANDATORIA RAG-FIRST: Si el cliente tiene una duda técnica, funcional, sobre límites o uso del producto que esté resuelta en la documentación técnica, manuales o FAQs, resuélvela tú mismo con 'final_answer'. ÚNICAMENTE llama a 'requestHumanHandoff' si:
1. El cliente solicita explícitamente ser atendido por un humano o persona real.
2. El cliente está molesto, agresivo o irritado.
3. Tras varios intentos la incidencia no tiene solución en la documentación.
Está TERMINANTEMENTE PROHIBIDO derivar a un ejecutivo de forma anticipada si la documentación ya contiene la respuesta.
Campos: reason(str).
{"thought": "...", "tool_name": "requestHumanHandoff", "tool_input": {"reason": "Cliente solicitó atención humana"}}`,
        };

        const alreadyConsultedRag = (state.executedTools || []).includes('consult_product_catalog') || state.toolCallName === 'consult_product_catalog';
        let allowedTools = subAgent?.tools ? [...subAgent.tools] : [];
        if (alreadyConsultedRag) {
          allowedTools = allowedTools.filter(t => t !== 'consult_product_catalog');
        } else if (!allowedTools.includes('consult_product_catalog')) {
          allowedTools.push('consult_product_catalog');
        }
        const toolsText = allowedTools.map(k => ALL_TOOL_PROMPTS[k]).filter(Boolean).join('\n\n');
        const finalAnswerPrompt = `${allowedTools.length + 1}. final_answer — Envía una respuesta en lenguaje natural al cliente.\n{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Hola, bienvenido. ¿En qué te puedo ayudar hoy?"}}`;
        const toolsSectionText = toolsText ? `${toolsText}\n\n${finalAnswerPrompt}` : finalAnswerPrompt;
        const activitySection = state.route === 'seguimiento' ? `\n[TIPOS DE ACTIVIDAD]\n${activityTypesText}\n[RECORDATORIO INTERNO EJECUTIVO] ${config.reminderOffsetMinutes} min de antelación en CRM para el ejecutivo. NOTA: Este recordatorio es 100% interno para el ejecutivo del CRM, el cliente NO recibe recordatorios previos.\n` : '';

        let clientInfo: Record<string, any> = {};
        const activeClientId = state.clientId || conversation.clientId;
        if (activeClientId) {
          const client = await this.clientRepository.findOne({ where: { id: activeClientId } });
          if (client) {
            conversation.client = client;
            clientInfo = { id: client.id, nombre: `${client.nombre || ''} ${client.apellido || ''}`.trim(), correo: client.correo || null, telefono: client.telefono || null };
          }
        }

        const systemPrompt = `[SUB-AGENTE: ${subAgent?.name || 'General'}]\n${subAgent?.context || ''}\n\n[HOY] ${fechaContexto}\n\n[RESUMEN PREVIO]\n${conversation.summary || 'Sin historial.'}\n\n[CONTACTO CRM] ${JSON.stringify(clientInfo)}\n${activitySection}[HERRAMIENTAS] Responde SIEMPRE con un único JSON. Sin texto fuera del JSON.\n${toolsSectionText}\n\nREGLAS: Un JSON por turno | Usa IDs reales del contexto | RAG-FIRST: si la duda o problema viene resuelta en la documentación adjunta responde con final_answer y NO crees tickets ni derives a humano | checkAvailability antes de createActivity | El contacto debe tener al menos un dato (correo O teléfono) antes de createOpportunity | El cliente NO recibe recordatorios previos (son solo internos del CRM), jamás le digas que recibirá un recordatorio`;

        let toolExecutionText = '';
        if (state.toolCallName && state.toolCallResult) {
          const res = state.toolCallResult as any;
          let compactResult: Record<string, any>;
          if (state.toolCallName === 'checkAvailability') {
            compactResult = { status: res.status, available: res.available };
            if (res.suggestedSlots) compactResult.suggestedSlots = res.suggestedSlots;
          } else if (state.toolCallName === 'consult_product_catalog') {
            const catalogList = (res.catalogProducts || []).map((i: any) => i.content || i);
            const pdfList = (res.ragDocs || []).map((i: any) => `[DOCUMENTACIÓN / FICHA TÉCNICA / FAQ ${i.metadata?.product || i.metadata?.source || ''}]: ${(i.pageContent || '').substring(0, 1000)}`);
            const allItems = [...catalogList, ...pdfList];
            compactResult = {
              status: res.status,
              documentacionYCatalogo: allItems.length > 0 ? allItems : (res.data?.map((i: any) => i.content) || []),
              mensaje: allItems.length === 0 && (!res.data || res.data.length === 0) ? 'No se encontró información en la documentación ni catálogo.' : undefined,
            };
          } else if (state.toolCallName === 'updateContact' || state.toolCallName === 'registerContact') {
            compactResult = { status: res.status };
            if (res.message) compactResult.message = res.message;
            if (res.client?.correo || res.correo) compactResult.correo = res.client?.correo || res.correo;
            if (res.client?.telefono || res.telefono) compactResult.telefono = res.client?.telefono || res.telefono;
          } else {
            compactResult = { status: res.status };
            if (res.message) compactResult.message = res.message;
            if (res.id) compactResult.id = res.id;
          }
          toolExecutionText = `\n[TOOL: ${state.toolCallName}] ${JSON.stringify(compactResult)}`;
          if (state.toolCallName === 'createOpportunity' && res.status === 'SUCCESS') {
            toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] La oportunidad ha sido creada con éxito en el CRM y la cotización formal en PDF ha sido generada y transmitida DIRECTAMENTE A ESTE CHAT para que el cliente la descargue. Tu ÚNICA acción ahora es usar la herramienta 'final_answer' para confirmar amablemente al cliente que le has enviado su cotización en PDF adjunta aquí en el chat.
REGLA ESTRICTA: El documento PDF se envió aquí en el chat. Está TERMINANTEMENTE PROHIBIDO decirle al cliente que revise su correo electrónico o que se le envió a su correo. Confírmale que el documento PDF está disponible aquí mismo en la conversación para su visualización o descarga.`;
          } else if (state.toolCallName === 'createActivity' && res.status === 'SUCCESS') {
            toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] La actividad ha sido agendada y creada exitosamente en el CRM. Tu ÚNICA acción ahora es usar la herramienta 'final_answer' para confirmar la cita de forma clara y amigable al cliente indicándole únicamente el día y la hora agendada. REGLA ESTRICTA DE RECORDATORIOS: El recordatorio configurado en el CRM es ÚNICA Y EXCLUSIVAMENTE INTERNO para el ejecutivo asignado; el cliente NO recibe recordatorios una hora antes ni previos a la cita. Por lo tanto, está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará o que recibirá un recordatorio una hora antes o previo a la cita. Queda ESTRICTAMENTE PROHIBIDO volver a llamar a 'checkAvailability' o 'createActivity'.`;
          } else if (state.toolCallName === 'updateContact' || state.toolCallName === 'registerContact') {
            if (state.route === 'comercial') {
              const targetCId = state.clientId || conversation.clientId; 
              const updatedClient = targetCId ? await this.clientRepository.findOne({ where: { id: targetCId } }) : null;
              const hasEmail = Boolean(updatedClient?.correo?.trim());
              const hasPhone = Boolean(updatedClient?.telefono?.trim());

              if (hasEmail || hasPhone) {
                toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA MANDATORIA - GENERACIÓN INMEDIATA DE COTIZACIÓN]
El contacto ya cuenta con datos de contacto registrados en el CRM (${hasEmail ? `Correo: ${updatedClient?.correo}` : ''} ${hasPhone ? `Teléfono: ${updatedClient?.telefono}` : ''}).
REGLAS ESTRICTAS PARA ESTE TURNO:
1. Como mínimo se requiere al menos uno de los datos de contacto (correo O teléfono) y ya se encuentra registrado. ESTÁ ESTRICTAMENTE PROHIBIDO FRENAR LA COTIZACIÓN ni insistir por el dato faltante si el cliente no lo proporcionó o si prefirió dar solo uno.
2. EL SISTEMA NO ENVÍA CORREOS AL CLIENTE. La cotización se entrega ÚNICAMENTE como archivo PDF adjunto directamente aquí en el chat.
3. Está TERMINANTEMENTE PROHIBIDO responder con 'final_answer'.
4. Está TERMINANTEMENTE PROHIBIDO decir que la cotización se está preparando, que se envió a su correo o pedirle que revise su bandeja de entrada.
5. Está TERMINANTEMENTE PROHIBIDO ofrecer llamadas, demos o reuniones antes de entregar la cotización.
6. TU ÚNICA ACCIÓN PERMITIDA EN ESTE TURNO es invocar INMEDIATAMENTE la herramienta 'createOpportunity' estructurando la propiedad 'items' con los productos confirmados para generar y transmitir el PDF de la cotización formal al chat del cliente.`;
              } else {
                toolExecutionText += `\n[INSTRUCCIÓN DE CONTACTO] El contacto aún no cuenta con correo ni teléfono. Usa la herramienta 'final_answer' para solicitar amablemente al cliente sus datos de contacto (correo y/o teléfono) para emitir la cotización formal.`;
              }
            } else {
              toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] El contacto ha sido actualizado/registrado exitosamente en el CRM con su información de contacto.
- Si el cliente en mensajes anteriores o en el contexto actual solicitó agendar una cita, llamada o reunión y ya cuentas con el día y hora deseada (ej. "mañana a las 10 am"), continúa INMEDIATAMENTE en este mismo turno llamando a 'checkAvailability' o 'createActivity' para agendar la cita.
- Solo debes usar 'final_answer' si aún NO conoces el día/hora deseada por el cliente o si no hay ninguna acción pendiente.`;
            }
          } else if (state.toolCallName === 'checkAvailability') {
            if (res.available) {
              toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] El horario consultado está DISPONIBLE y el contacto ya cuenta con correo registrado en el CRM. Continúa INMEDIATAMENTE en este mismo turno llamando a la herramienta 'createActivity' para registrar la actividad en el CRM. NO te detengas con 'final_answer' sin haber creado la actividad.`;
            } else {
              toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] El horario consultado NO está disponible. Usa 'final_answer' para informar amablemente al cliente y proponerle los horarios alternativos devueltos en 'suggestedSlots'.`;
            }
          } else if (state.toolCallName === 'consult_product_catalog') {
            toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA DE RESPUESTA A CLIENTE — RAG-FIRST]
1. LA CONSULTA AL CATÁLOGO/RAG YA FINALIZÓ CON ÉXITO: Queda TERMINANTEMENTE PROHIBIDO volver a llamar a 'consult_product_catalog' o a cualquier otra herramienta. Ya cuentas con la información técnica y documental necesaria arriba. Tu ÚNICA acción permitida en este turno es responder al cliente usando 'final_answer'.
2. PRIORIDAD RAG-FIRST: Utiliza la información documental (manuales, FAQs, guías, fichas técnicas) devuelta para resolver la consulta o problemática del cliente. Si la información responde a su duda o indica el procedimiento a seguir (ej. cómo habilitar consumo adicional, consultar consumo en Mi Empresa, políticas de almacenamiento o límites), explícalo con 'final_answer' de forma amigable, clara y concisa. Está TERMINANTEMENTE PROHIBIDO levantar tickets con 'createTicket' o derivar con 'requestHumanHandoff' si la duda ya viene resuelta en la documentación.
3. CONCISIÓN DE CHAT (2 A 4 ORACIONES O VIÑETAS BREVES): Responde de forma ágil y directa. Prohibido volcar manuales enteros o párrafos kilométricos.
4. SOPORTE MULTI-PRODUCTO: Si se consultaron o devolvieron múltiples productos, diferencia con total precisión y orden cada uno sin mezclar datos entre ellos.
5. PROHIBIDO RE-INTRODUCIR: Si el producto ya se ha mencionado en la conversación, NO inicies con su definición comercial ni digas "X es una plataforma...". Ve directo a responder la duda del cliente.
6. PROHIBIDO REPETIR EL MISMO CIERRE: Si ya ofreciste una demo o cotización en el turno anterior, no vuelvas a insistir con la misma pregunta.
7. Usa la herramienta 'final_answer' para responder al cliente. JAMÁS repitas el JSON del resultado.`;
          } else if (res.status === 'ERROR') {
            toolExecutionText += `\n[INSTRUCCIÓN ANTE ERROR DE VALIDACIÓN] La herramienta '${state.toolCallName}' devolvió un error de validación: "${res.message}". Si el error indica falta de correo o datos de contacto, usa INMEDIATAMENTE la herramienta 'final_answer' para solicitar amablemente al cliente la información faltante (su correo electrónico y teléfono de contacto) para poder proceder con la cotización o seguimiento.`;
          } else {
            toolExecutionText += `\n[INSTRUCCIÓN OBLIGATORIA] El resultado anterior es de la herramienta '${state.toolCallName}'. Ahora DEBES generar un final_answer con una respuesta amigable en lenguaje natural para el cliente usando esa información. JAMÁS repitas el JSON del resultado como respuesta.`;
          }
        }

        const prompt = `${systemPrompt}${preFetchCatalogText}\n\n[HISTORIAL]\n${historyText}\n\n[CLIENTE] ${incomingContent}${toolExecutionText}\n\nJSON:`;
        let agentResponse = await this.callLLM(config, prompt, subAgent?.temperature ?? config.temperature, { ...baseAuditContext, metadata: { step: 'subagent', route: state.route } });
        this.logger.log(`[DEBUG - SubAgent Raw Response] Salida: "${agentResponse}"`);

        const isTemplateOnly = agentResponse.includes('"..."') || agentResponse.includes('{"thought": "..."') || agentResponse.includes('tool_name": "..."');
        if (!agentResponse || agentResponse.trim() === '' || agentResponse.trim() === '""' || isTemplateOnly) {
          this.logger.warn(`Subagente devolvió respuesta vacía o plantilla genérica. Iniciando rescate conversacional.`);
          let ragContextText = '';
          try {
            const ragResults = await this.toolsHandler.ragService.searchSimilar(incomingContent, 3, undefined, baseAuditContext);
            const cubeResults: any[] = [];
            const detectedKeys = [...new Set(ragResults.map(r => r.metadata?.product).filter(Boolean))];
            if (detectedKeys.length > 0) { for (const key of detectedKeys) cubeResults.push(...await this.toolsHandler.queryCubeProductsByKey(key)); }
            else if (state.route === 'comercial') { cubeResults.push(...await this.toolsHandler.queryCubeProducts(incomingContent)); }
            const merged = [...cubeResults, ...ragResults.map(r => ({ content: (r.pageContent || '').substring(0, 800) }))];
            if (merged.length > 0) ragContextText = `[CONOCIMIENTO DOCUMENTAL Y CATÁLOGO (RAG)]\n${merged.map(r => `- ${r.content}`).join('\n\n')}`;
          } catch (err: any) { this.logger.error(`Error en RAG para rescate: ${err.message}`); }

          const rescuePrompt = `Eres el asistente de IA del CRM. Responde de forma amigable, natural y muy breve al cliente en su mismo idioma. Si la duda se responde con la información documental adjunta (manuales, FAQs o catálogo), explica la solución amablemente sin formato JSON.\n\n${ragContextText || 'REGLAS: Está estrictamente PROHIBIDO inventar nombres de productos, marcas, precios o servicios.'}\n\n[RESUMEN DE LAS CONVERSACIONES PASADAS]\n${conversation.summary || 'No hay historial previo registrado.'}\n\n[HISTORIAL DE CONVERSACIÓN RECIENTE]\n${historyText}\n\n[ÚLTIMO MENSAJE]\nCliente: ${incomingContent}\n\nAsistente:`;
          const rescueResponse = await this.callLLM(config, rescuePrompt, undefined, { ...baseAuditContext, metadata: { step: 'rescue' } });
          if (rescueResponse && rescueResponse.trim() !== '') {
            this.logger.log(`[LangGraph - SubAgent Rescue] Respuesta conversacional libre generada con éxito.`);
            return { nextAction: 'respond', response: rescueResponse.trim() };
          }
        }

        const extractJsonObjects = (rawText: string): any[] => {
          const objects: any[] = [];
          if (!rawText) return objects;

          const cleaned = this.cleanJsonOutput(rawText);
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') objects.push(parsed);
          } catch (_) {}

          let depth = 0;
          let startIndex = -1;
          for (let i = 0; i < rawText.length; i++) {
            if (rawText[i] === '{') {
              if (depth === 0) startIndex = i;
              depth++;
            } else if (rawText[i] === '}') {
              depth--;
              if (depth === 0 && startIndex !== -1) {
                const chunk = rawText.substring(startIndex, i + 1);
                try {
                  const parsed = JSON.parse(chunk);
                  if (parsed && typeof parsed === 'object' && !objects.some(o => JSON.stringify(o) === JSON.stringify(parsed))) {
                    objects.push(parsed);
                  }
                } catch (_) {}
                startIndex = -1;
              }
            }
          }
          return objects;
        };

        const parsedObjects = extractJsonObjects(agentResponse);
        const toolAliases: Record<string, string> = {
          getProductCatalog: 'consult_product_catalog',
          consultCatalog: 'consult_product_catalog',
          catalogSearch: 'consult_product_catalog',
          searchCatalog: 'consult_product_catalog',
          getProducts: 'consult_product_catalog',
          queryCatalog: 'consult_product_catalog',
        };

        // Prioridad 1: Buscar si hay alguna llamada a herramienta que NO sea final_answer
        for (const obj of parsedObjects) {
          let toolName = obj.tool_name || obj.name || obj.tool || obj.function?.name;
          if (toolName && toolAliases[toolName]) toolName = toolAliases[toolName];
          if (toolName && toolName !== 'final_answer' && toolName !== 'undefined') {
            // Anti-Bucle estricto: Si esta herramienta ya fue ejecutada en este ciclo, JAMÁS volver a ejecutarla
            const isAlreadyExecuted = (state.executedTools || []).includes(toolName) || state.toolCallName === toolName;
            if (isAlreadyExecuted) {
              this.logger.warn(`[Anti-Bucle] Herramienta '${toolName}' ya fue ejecutada en este ciclo. Omitiendo re-ejecución repetida.`);
              continue;
            }

            let toolInput = obj.tool_input || obj.parameters || obj.arguments || obj.input || obj.function?.arguments || obj.function?.parameters || {};
            if (typeof toolInput === 'string') {
              try { toolInput = JSON.parse(toolInput); } catch (_) {}
            }
            if (!allowedTools.includes(toolName)) {
              this.logger.warn(`Sub-Agente '${state.route}' intentó usar una tool no permitida: '${toolName}'`);
              if (toolName === 'consult_product_catalog' && !alreadyConsultedRag) {
                return { nextAction: 'call_tool', toolCallName: 'consult_product_catalog', toolCallInput: toolInput || { query: incomingContent } };
              }
              return { nextAction: 'respond', response: toolInput?.answer || obj.answer || 'Con gusto le doy seguimiento a tu consulta. ¿Me podrías indicar más detalles sobre lo que necesitas?' };
            }
            return { nextAction: 'call_tool', toolCallName: toolName, toolCallInput: toolInput };
          }
        }

        // Prioridad 2: Buscar final_answer o respuesta en lenguaje natural
        for (const obj of parsedObjects) {
          let toolName = obj.tool_name || obj.name || obj.tool || obj.function?.name;
          let toolInput = obj.tool_input || obj.parameters || obj.arguments || obj.input || obj.function?.arguments || obj.function?.parameters || {};
          if (typeof toolInput === 'string') {
            try { toolInput = JSON.parse(toolInput); } catch (_) {}
          }
          if (toolName === 'final_answer' || obj.answer || toolInput?.answer || obj.response) {
            const answerText = toolInput?.answer || obj.answer || obj.response || '';
            if (answerText.trim().length > 0) {
              // Si la herramienta de cotización ya fue ejecutada en este ciclo, JAMÁS volver a interceptar ni re-ejecutar createOpportunity
              if (state.toolCallName === 'createOpportunity' || state.toolCallName === 'sendQuotationPdf') {
                return { nextAction: 'respond', response: answerText };
              }

              if (state.route === 'comercial') {
                const lower = answerText.toLowerCase();
                const isChatDelivery = lower.includes('adjunto') || lower.includes('este chat') || lower.includes('aquí en el chat') || lower.includes('aqui en el chat') || lower.includes('aquí mismo') || lower.includes('aqui mismo') || lower.includes('en la conversación') || lower.includes('en el chat');

                const claimsEmailOrPreparing =
                  !isChatDelivery &&
                  (lower.includes('preparada') || lower.includes('preparando') || lower.includes('enviada') || lower.includes('enviado')) &&
                  (lower.includes('correo') || lower.includes('email') || lower.includes('bandeja') || lower.includes('inbox') || lower.includes('spam') || (lower.includes('revisa') && (lower.includes('correo') || lower.includes('bandeja') || lower.includes('inbox'))));

                const hasAnyContact = Boolean(conversation.client?.correo?.trim() || conversation.client?.telefono?.trim());
                const divertingToCall = !isChatDelivery && (lower.includes('llamada') || lower.includes('reunión') || lower.includes('reunion') || lower.includes('demo') || lower.includes('agendar')) && (lower.includes('ejecutivo') || lower.includes('preferida') || lower.includes('horario') || lower.includes('gustaría') || lower.includes('gustaria'));
                const thanksContactWithoutQuoting = (lower.includes('gracias por') || lower.includes('recibido') || lower.includes('registrado')) && (lower.includes('correo') || lower.includes('email') || lower.includes('telefono') || lower.includes('teléfono') || lower.includes('contacto'));
                const recentHistoryLower = (messages.slice(-4).map(m => m.content).join(' ') + ' ' + incomingContent).toLowerCase();
                const isQuoteInProgress = recentHistoryLower.includes('cotiz') || recentHistoryLower.includes('precio') || recentHistoryLower.includes('plan');

                if (claimsEmailOrPreparing || ((divertingToCall || thanksContactWithoutQuoting) && hasAnyContact && isQuoteInProgress)) {
                  this.logger.warn(`[Anti-Alucinación Comercial] El sub-agente intentó desviar o detener con final_answer ('${answerText.substring(0, 80)}...') sin entregar la cotización. Interceptando para forzar createOpportunity.`);
                  return {
                    nextAction: 'call_tool',
                    toolCallName: 'createOpportunity',
                    toolCallInput: {
                      nombreProyecto: 'Cotización Formal',
                      moneda: 'MXN',
                    },
                  };
                }
              }
              return { nextAction: 'respond', response: answerText };
            }
          }
        }

        // Rescate si consult_product_catalog ya fue ejecutada pero el LLM solo emitió pensamientos o re-queries
        if (alreadyConsultedRag) {
          const thoughtWithText = parsedObjects.find(o => o.thought && typeof o.thought === 'string' && o.thought.length > 20)?.thought;
          this.logger.warn(`[Anti-Bucle RAG] Subagente no emitió final_answer tras consultar RAG. Sintetizando respuesta con el contexto documental disponible.`);
          const ragDocs = (state.toolCallResult as any)?.ragDocs || [];
          const catalogProducts = (state.toolCallResult as any)?.catalogProducts || [];
          const contextSnippets = [
            ...catalogProducts.map((p: any) => p.content || p),
            ...ragDocs.map((d: any) => d.pageContent || d.content || ''),
          ].filter(Boolean).slice(0, 5).join('\n\n');

          const synthesisPrompt = `Eres el asistente de IA del CRM. Con base en la siguiente documentación técnica y de soporte, responde a la duda del cliente de forma concisa, clara y amigable en español (2 a 4 oraciones). NO uses formato JSON, responde en lenguaje natural directo.\n\n[DOCUMENTACIÓN DISPONIBLE]\n${contextSnippets || 'No hay documentación adicional disponible.'}\n\n[HISTORIAL]\n${historyText}\n\n[CLIENTE] ${incomingContent}\n\nRespuesta:`;
          const synthesized = await this.callLLM(config, synthesisPrompt, undefined, { ...baseAuditContext, metadata: { step: 'synthesis_rescue' } });
          if (synthesized && synthesized.trim() !== '') {
            return { nextAction: 'respond', response: synthesized.trim() };
          }
          if (thoughtWithText) {
            return { nextAction: 'respond', response: thoughtWithText };
          }
          return { nextAction: 'respond', response: 'Puedes verificar las opciones de consumo adicional y gestión de recursos directamente en el apartado "Mi Empresa" de tu cuenta.' };
        }

        // Prioridad 3: Rescate Regex si ningún JSON fue parseable
        this.logger.warn(`Sintaxis JSON inusual en subagente. Intentando rescate Regex. Salida: ${agentResponse}`);
        const answerMatch = agentResponse.match(/"answer"\s*:\s*"([^"]+)"/i);
        if (answerMatch?.[1]) {
          const ans = answerMatch[1];
          // Si la herramienta de cotización ya fue ejecutada en este ciclo, JAMÁS volver a interceptar
          if (state.toolCallName === 'createOpportunity' || state.toolCallName === 'sendQuotationPdf') {
            return { nextAction: 'respond', response: ans };
          }

          if (state.route === 'comercial') {
            const lower = ans.toLowerCase();
            const isChatDelivery = lower.includes('adjunto') || lower.includes('este chat') || lower.includes('aquí en el chat') || lower.includes('aqui en el chat') || lower.includes('aquí mismo') || lower.includes('aqui mismo') || lower.includes('en la conversación') || lower.includes('en el chat');

            const claimsEmailOrPreparing =
              !isChatDelivery &&
              (lower.includes('preparada') || lower.includes('preparando') || lower.includes('enviada') || lower.includes('enviado')) &&
              (lower.includes('correo') || lower.includes('email') || lower.includes('bandeja') || lower.includes('inbox') || lower.includes('spam') || (lower.includes('revisa') && (lower.includes('correo') || lower.includes('bandeja') || lower.includes('inbox'))));

            const hasAnyContact = Boolean(conversation.client?.correo?.trim() || conversation.client?.telefono?.trim());
            const divertingToCall = !isChatDelivery && (lower.includes('llamada') || lower.includes('reunión') || lower.includes('reunion') || lower.includes('demo') || lower.includes('agendar')) && (lower.includes('ejecutivo') || lower.includes('preferida') || lower.includes('horario') || lower.includes('gustaría') || lower.includes('gustaria'));
            const thanksContactWithoutQuoting = (lower.includes('gracias por') || lower.includes('recibido') || lower.includes('registrado')) && (lower.includes('correo') || lower.includes('email') || lower.includes('telefono') || lower.includes('teléfono') || lower.includes('contacto'));
            const recentHistoryLower = (messages.slice(-4).map(m => m.content).join(' ') + ' ' + incomingContent).toLowerCase();
            const isQuoteInProgress = recentHistoryLower.includes('cotiz') || recentHistoryLower.includes('precio') || recentHistoryLower.includes('plan');

            if (claimsEmailOrPreparing || ((divertingToCall || thanksContactWithoutQuoting) && hasAnyContact && isQuoteInProgress)) {
              this.logger.warn(`[Anti-Alucinación Comercial - Regex] Interceptando para forzar createOpportunity.`);
              return {
                nextAction: 'call_tool',
                toolCallName: 'createOpportunity',
                toolCallInput: {
                  nombreProyecto: 'Cotización Formal',
                  moneda: 'MXN',
                },
              };
            }
          }
          return { nextAction: 'respond', response: ans };
        }
        return { nextAction: 'respond', response: 'Con gusto le doy seguimiento a tu solicitud. ¿Te puedo ayudar en algo más?' };
      };

      const executeToolNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        this.logger.log(`[LangGraph - Tool Executor] Ejecutando: '${state.toolCallName}'`);
        const input = state.toolCallInput || {};
        try {
          const schemaMap: Record<string, any> = {
            registerContact: RegisterContactSchema, updateContact: UpdateContactSchema,
            createOpportunity: CreateOpportunitySchema, modifyOpportunity: ModifyOpportunitySchema,
            checkAvailability: CheckAvailabilitySchema, createActivity: CreateActivitySchema,
            createTicket: CreateTicketSchema, consult_product_catalog: ConsultProductCatalogSchema,
            sendQuotationPdf: SendQuotationPdfSchema, requestHumanHandoff: RequestHumanHandoffSchema,
          };
          const toolName = state.toolCallName!;
          const schema = schemaMap[toolName];
          if (!schema) return { toolCallResult: { status: 'ERROR', message: `Herramienta '${toolName}' no reconocida.` } };
          const validationResult = schema.safeParse(input);
          if (!validationResult.success) {
            this.logger.warn(`Error de validación Zod en tool '${toolName}': ${JSON.stringify(validationResult.error.format())}`);
            return { toolCallResult: { status: 'ERROR', message: 'Esquema de datos inválido en los argumentos de la herramienta.', details: validationResult.error.format() } };
          }
          if (toolName === 'consult_product_catalog') {
            const executionResult = await this.toolsHandler.executeTool(toolName, validationResult.data, conversation, config, baseAuditContext);
            const catalogData = executionResult.catalogProducts || executionResult.data || [];
            const ragData = (executionResult.ragDocs || []).map((r: any) => ({
              content: r.pageContent && r.pageContent.length > 1000 ? r.pageContent.substring(0, 1000) + '... (texto truncado)' : (r.pageContent || r.content || ''),
              metadata: r.metadata,
            }));
            return {
              toolCallResult: {
                status: 'SUCCESS',
                data: [...catalogData, ...ragData],
                catalogProducts: catalogData,
                ragDocs: executionResult.ragDocs || [],
              },
              executedTools: [toolName],
            };
          }
          const executionResult = await this.toolsHandler.executeTool(toolName, validationResult.data, conversation, config, baseAuditContext);
          let nextState: Partial<AgentState> = { toolCallResult: executionResult, executedTools: [toolName] };
          if (state.toolCallName === 'requestHumanHandoff' || executionResult?.isHandedOff) nextState.isHandedOff = true;
          if ((state.toolCallName === 'registerContact' || state.toolCallName === 'updateContact') && executionResult.status === 'SUCCESS') {
            const targetClientId = executionResult.clientId || executionResult.client?.id || conversation.clientId;
            if (targetClientId) {
              nextState.clientId = targetClientId;
              conversation.clientId = targetClientId;
              const reloadedClient = await this.clientRepository.findOne({ where: { id: targetClientId } });
              if (reloadedClient) {
                conversation.client = reloadedClient;
                conversation.clientName = `${reloadedClient.nombre} ${reloadedClient.apellido || ''}`.trim();
                baseAuditContext.clientId = targetClientId;
                baseAuditContext.clientName = conversation.clientName;
              }
            }
          }
          return nextState;
        } catch (error: any) {
          this.logger.error(`Error crítico ejecutando tool '${state.toolCallName}': ${error.message}`);
          return { toolCallResult: { status: 'ERROR', message: error.message || 'Error interno de ejecución.' } };
        }
      };

      // 5. Build and run the LangGraph state graph
      const workflow = new StateGraph(AgentStateAnnotation)
        .addNode('routerNode', routerNode)
        .addNode('subAgentNode', subAgentNode)
        .addNode('executeToolNode', executeToolNode);

      workflow.addEdge(START, 'routerNode');
      workflow.addEdge('routerNode', 'subAgentNode');
      workflow.addConditionalEdges(
        'subAgentNode',
        (state: AgentState) => (state.nextAction === 'call_tool' ? 'executeToolNode' : END),
        { executeToolNode: 'executeToolNode', [END]: END },
      );
      workflow.addConditionalEdges(
        'executeToolNode',
        () => 'subAgentNode',
        { subAgentNode: 'subAgentNode' },
      );

      const app = workflow.compile();
      finalState = await app.invoke({ clientId: conversation.clientId || null, route: 'general', nextAction: null, toolCallName: null, toolCallInput: null, toolCallResult: null, response: null, executedTools: [] } as any, { recursionLimit: 15 });

      const agentReply = finalState.response || 'He procesado tu solicitud en el sistema. ¿Te puedo colaborar en algo más?';
      try {
        await this.updateConversationSummaryAsync(conversation, messages, incomingContent, agentReply, baseAuditContext);
      } catch (err: any) {
        this.logger.error(`Error al actualizar resumen conversacional: ${err.message}`);
      }

      const selectedRoute = finalState.route || 'general';
      const replyNormalized = (agentReply || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const handoffRegex = /(conectare|derivare|transferire|canalizare|comunicare|conecto|derivo|transfiero|canalizo|comunico)\s+con\s+(un\s+)?ejecutivo|(ejecutivo|asesor)\s+especializado\s+se\s+pondra\s+en\s+contacto|atencion\s+mas\s+personalizada.*ejecutivo/;
      const isHandedOff = Boolean(finalState.isHandedOff || finalState.toolCallName === 'requestHumanHandoff' || handoffRegex.test(replyNormalized));

      return { reply: agentReply, route: selectedRoute, isHandedOff };
    } catch (err: any) {
      if (err instanceof HttpException && err.getStatus() === 402) {
        const payload = err.getResponse() as any;
        const code = payload?.code || 'SUBSCRIPTION_ERROR';
        this.logger.warn(`[Subscription] Solicitud de IA bloqueada para tenant — código: ${code}`);
        return { reply: '', route: 'subscription_blocked', isHandedOff: false, subscriptionCode: code, subscriptionPayload: payload } as any;
      }
      this.logger.error('Error en el motor conversacional LangGraph:', err);
      return { reply: 'Lo siento, en este momento no puedo procesar tu solicitud de forma automática.', route: 'error', isHandedOff: false };
    } finally {
      if (turnAccumulator.totalTokens > 0) {
        const finalAction = finalState?.route ? `subagent_${finalState.route}` : (turnAccumulator.steps[turnAccumulator.steps.length - 1] || 'asistente_virtual');
        holder.verdict = await this.commitTurnConsumption(turnAccumulator, finalAction, baseAuditContext);
      }
    }
  }
}
