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
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PhoneUtils } from '../common/utils/phone.utils';
import { ActivitiesService } from '../activities/activities.service';
import { ClientsService } from '../clients/clients.service';
import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';
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
   * Validates subscription limits before each call for tenant schemas.
   */
  async callLLM(config: AiAgentConfig, prompt: string, temperatureOverride?: number): Promise<string> {
    const activeSchema = TenantContextService.getTenantSchema();
    if (activeSchema && activeSchema !== 'public') {
      await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
    }
    const provider = config.modelProvider;
    const model = config.modelName;
    const maxTokens = config.maxNewTokens || 2048;
    const temperature = temperatureOverride ?? config.temperature;

    if (provider === 'openai') {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('API Key de OpenAI no configurada.');
      return this.callOpenAI(model, apiKey, prompt, temperature, config.openaiEndpoint || null, config.openaiApiVersion || null, maxTokens);
    } else if (provider === 'watsonx') {
      const apiKey = config.watsonxApiKey || process.env.WATSONX_API_KEY;
      const projectId = config.watsonxProjectId || process.env.WATSONX_PROJECT_ID;
      const region = config.watsonxRegion || process.env.WATSONX_REGION || 'us-south';
      if (!apiKey || !projectId) throw new Error('Credenciales de IBM WatsonX no configuradas.');
      return this.callWatsonx(model, apiKey, projectId, region, prompt, temperature, maxTokens);
    } else {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key de Gemini no configurada.');
      return this.callGemini(model, apiKey, prompt, temperature, maxTokens);
    }
  }

  private async callGemini(model: string, apiKey: string, prompt: string, temperature: number, maxNewTokens = 2048): Promise<string> {
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
    this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, 'gemini_execution');
    return text.trim();
  }

  private async callOpenAI(model: string, apiKey: string, prompt: string, temperature: number, endpoint?: string | null, apiVersion?: string | null, maxNewTokens = 2048): Promise<string> {
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
    this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, isAzure ? 'azure_openai_execution' : 'openai_execution');
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

  private async callWatsonx(model: string, apiKey: string, projectId: string, region: string, prompt: string, temperature: number, maxNewTokens = 2048): Promise<string> {
    const iamToken = await this.getWatsonxIamToken(apiKey);
    const rawRegion = region || 'us-south';
    const baseUrl = rawRegion.startsWith('http') ? rawRegion.replace(/\/$/, '') : `https://${rawRegion}.ml.cloud.ibm.com`;
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const numericMaxTokens = Number(maxNewTokens) || 2048;
    const effectiveTemp = Math.max(numericTemp, 0.1);
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
    } else if ((modelLower.includes('llama-3') || modelLower.includes('llama3')) && !prompt.includes('<|start_header_id|>')) {
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
    this.recordTokenConsumption(inputTokens, outputTokens, inputTokens + outputTokens, 'watsonx_execution');
    return rawText.trim();
  }

  private recordTokenConsumption(promptTokens: number, completionTokens: number, totalTokens: number, actionName = 'ai_execution') {
    const activeSchema = TenantContextService.getTenantSchema() || 'public';
    if (activeSchema !== 'public' && totalTokens > 0) {
      this.subscriptionValidator.recordConsumption(activeSchema, promptTokens, completionTokens, totalTokens, false, actionName)
        .then(() => { this.eventEmitter.emit(CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED, { schemaName: activeSchema }); })
        .catch((err: any) => { this.logger.error(`Error al registrar consumo de tokens para tenant ${activeSchema}: ${err.message}`); });
    }
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

  async updateConversationSummaryAsync(conversation: Conversation, recentMessages: Message[], lastClientMsg: string, lastAgentMsg: string): Promise<void> {
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
      const newSummary = await this.callLLM(config, summaryPrompt);
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
    const config = await this.getOrInitConfig();
    if (!config.isActive) return { reply: '', route: 'inactive', isHandedOff: false };

    try {
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
        const routerPrompt = `
${config.context || 'Eres el Agente Principal (Enrutador) de la Empresa.'}

[SUB-AGENTES DISPONIBLES EN EL SISTEMA]
${subAgentsDescriptionText}
- Clave: "general" - Descripción: "Úsala si el mensaje del cliente es un saludo, despedida, agradecimiento, charla informal (small talk), preguntas generales cortas que no requieran herramientas, o si ninguna de las otras claves es aplicable."

[REGLAS DE CONTINUIDAD Y CONTEXTO GENERAL]
- PREGUNTAS SOBRE PRODUCTOS, CATÁLOGO O COTIZACIONES: Si el mensaje del cliente contiene cualquier consulta sobre productos, servicios, catálogo, modelos, existencias o precios, DEBES clasificarlo INMEDIATAMENTE en la ruta "comercial".
- Analiza la conversación histórica en [HISTORIAL DE CONVERSACIÓN RECIENTE] y el [RESUMEN DE LAS CONVERSACIONES PASADAS] como el hilo conductor de la conversación.
- Si el cliente está dando una respuesta breve o continuación, mantén el diálogo en la ruta del sub-agente activo.
- Solo usa la ruta 'general' si el cliente únicamente saluda, se despide, da las gracias o plática libre sin preguntar por productos, agendamientos ni soporte técnico.

[REGLA DE RESPUESTA OBLIGATORIA]
Responde ÚNICAMENTE con un objeto JSON por turno. Sin texto antes o después.
Estructura de respuesta: {"thought": "...", "route": "CLAVE_ELEGIDA"}

[RESUMEN DE LAS CONVERSACIONES PASADAS]
${conversation.summary || 'No hay historial previo registrado.'}

[HISTORIAL DE CONVERSACIÓN RECIENTE]
${historyText}

[ÚLTIMO MENSAJE DEL CLIENTE]
Cliente: ${incomingContent}

Genera la clasificación en formato JSON (iniciando con { y terminando con }):`;

        let routerResponse = await this.callLLM(config, routerPrompt);
        this.logger.log(`[DEBUG - Router Raw Response] Salida: "${routerResponse}"`);
        routerResponse = this.cleanJsonOutput(routerResponse);
        let selectedRoute = 'general';
        try {
          const parsedRouter = JSON.parse(routerResponse);
          selectedRoute = parsedRouter.route || 'general';
          this.logger.log(`[LangGraph - Router] Ruta: '${selectedRoute}' | Pensamiento: ${parsedRouter.thought}`);
        } catch (_) {
          const routeMatch = routerResponse.match(/"route"\s*:\s*"([^"]+)"/i);
          selectedRoute = routeMatch?.[1] || 'general';
          this.logger.log(`[LangGraph - Router Rescue] Ruta rescatada: '${selectedRoute}'`);
        }
        return { route: selectedRoute };
      };

      const identificationNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        this.logger.log('[LangGraph - Identificación] Cliente sin teléfono registrado. Verificando o solicitando número telefónico.');
        const extractedPhone = PhoneUtils.extractPhoneFromText(incomingContent) || PhoneUtils.extractPhoneFromText(conversation.externalId);
        if (extractedPhone) {
          const existingClient = await this.clientsService.findByPhone(extractedPhone);
          if (existingClient) {
            this.logger.log(`[LangGraph - Identificación] Cliente existente identificado por teléfono en DB (${extractedPhone}): ${existingClient.nombre}`);
            conversation.client = existingClient;
            conversation.clientId = existingClient.id;
            conversation.clientName = `${existingClient.nombre} ${existingClient.apellido || ''}`.trim();
            await this.clientRepository.manager.getRepository(Conversation)
              .createQueryBuilder()
              .update(Conversation)
              .set({ clientId: existingClient.id, clientName: conversation.clientName })
              .where('id = :id', { id: conversation.id })
              .execute();
            return { clientId: existingClient.id, nextAction: 'call_tool', toolCallName: 'updateContact', toolCallInput: { nombre: conversation.clientName, telefono: extractedPhone } };
          }
          this.logger.log(`[LangGraph - Identificación] Teléfono detectado determinísticamente: ${extractedPhone}`);
          return { nextAction: 'call_tool', toolCallName: 'registerContact', toolCallInput: { nombre: conversation.clientName || 'Visitante', telefono: extractedPhone } };
        }
        const identPrompt = `Eres el Sub-Agente de Registro del CRM. Tu objetivo único u obligatorio es obtener el NÚMERO DE TELÉFONO del cliente como identificador principal en el CRM de la empresa antes de procesar cotizaciones, agendamientos o consultas del catálogo.

[REGLA DE IDENTIFICACIÓN OBLIGATORIA POR TELÉFONO]
- El número de teléfono es el identificador único obligatorio del cliente en el CRM.
- Si en el historial o último mensaje el cliente ya te proporcionó su número telefónico, llama a la herramienta registerContact enviando el teléfono.
- Si el cliente aún NO te ha proporcionado su número de teléfono, NO llames a la herramienta. Escríbele un mensaje cordial solicitándole forzosamente su número de teléfono.

[HERRAMIENTA DISPONIBLE]
1. registerContact — Registra e identifica el contacto en el CRM con su número de teléfono.
{"thought": "...", "tool_name": "registerContact", "tool_input": {"nombre": "Nombre si lo dio o Visitante", "telefono": "5512345678"}}
2. final_answer — Responde al cliente de forma natural para pedirle obligatoriamente su teléfono.
{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Para darte atención personalizada y cotizar, ¿me podrías proporcionar tu número de teléfono?"}}

Responde SIEMPRE con un único JSON.

[HISTORIAL DE CONVERSACIÓN]
${historyText}

[ÚLTIMO MENSAJE DEL CLIENTE]
Cliente: ${incomingContent}

Genera el JSON de salida:
{"thought": "`;
        let identResponse = await this.callLLM(config, identPrompt);
        identResponse = this.cleanJsonOutput(identResponse);
        try {
          const action = JSON.parse(identResponse);
          if (action.tool_name === 'registerContact' || action.tool_name === 'updateContact') {
            return { nextAction: 'call_tool', toolCallName: action.tool_name, toolCallInput: action.tool_input };
          } else {
            return { nextAction: 'respond', response: action.tool_input?.answer || 'Para darte atención personalizada y continuar con tu solicitud, ¿me podrías proporcionar tu número de teléfono?' };
          }
        } catch (_) {
          return { nextAction: 'respond', response: 'Para poder atenderte y dar seguimiento a tu consulta, ¿me podrías indicar tu número de teléfono?' };
        }
      };

      const subAgentNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
        let subAgent = subAgents.find(sa => sa.key === state.route) || subAgents.find(sa => sa.key === 'general');
        let preFetchCatalogText = '';
        if (state.route === 'comercial' && !state.toolCallResult) {
          try {
            const preRagResults = await this.toolsHandler.ragService.searchSimilar(incomingContent, 3);
            const preDetectedKeys = [...new Set(preRagResults.map(r => r.metadata?.product).filter(Boolean))];
            const preCubeResults: any[] = [];
            if (preDetectedKeys.length > 0) {
              for (const key of preDetectedKeys) preCubeResults.push(...await this.toolsHandler.queryCubeProductsByKey(key));
            } else {
              preCubeResults.push(...await this.toolsHandler.queryCubeProducts(incomingContent));
            }
            const preMerged = [...preCubeResults, ...preRagResults.map(r => ({ content: (r.pageContent || '').substring(0, 400) }))].slice(0, 5);
            preFetchCatalogText = preMerged.length > 0
              ? `\n[CATÁLOGO RELEVANTE — DATOS REALES DE LA BASE DE DATOS]\n${preMerged.map(r => `- ${r.content}`).join('\n\n')}\n\n[REGLA ANTI-ALUCINACIÓN OBLIGATORIA] Responde ÚNICAMENTE con la información del bloque [CATÁLOGO RELEVANTE] de arriba.`
              : `\n[CATÁLOGO RELEVANTE — DATOS REALES DE LA BASE DE DATOS]\nNo se encontraron productos coincidentes en el catálogo.\n\n[REGLA ANTI-ALUCINACIÓN OBLIGATORIA] No se encontró ningún producto que coincida con la consulta del cliente. Responde estrictamente: "Lo lamento, en este momento no contamos con ese producto en nuestro catálogo."`;
          } catch (err: any) { this.logger.error(`Error en pre-fetch de catálogo: ${err.message}`); }
        }

        const ALL_TOOL_PROMPTS: Record<string, string> = {
          createOpportunity: `1. createOpportunity: Registra oportunidad comercial.\nCampos: nombreProyecto(str), descripcion(str), montoTotal(num|null), moneda("MXN"|"USD"), nombreProducto(str, opc), cantidad(num, opc), lineaNegocio(str, opc), tipoEntrega(str, opc), licenciamiento(str, opc).\n{"thought": "...", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "Compra Laptop", "montoTotal": null, "moneda": "MXN"}}`,
          modifyOpportunity: `2. modifyOpportunity: Edita oportunidad existente.\nCampos: id(UUID), nombreProyecto, descripcion, montoTotal, cantidad, moneda.\n{"thought": "...", "tool_name": "modifyOpportunity", "tool_input": {"id": "uuid-real", "cantidad": 4}}`,
          updateContact: `3. updateContact: Actualiza contacto vinculado.\nCampos opcionales: nombre(str), correo(str), telefono(str).\n{"thought": "...", "tool_name": "updateContact", "tool_input": {"correo": "cliente@correo.com"}}`,
          checkAvailability: `4. checkAvailability: Valida disponibilidad de ejecutivo especializado únicamente para el día y hora indicados explícitamente por el cliente.\nCampos: proposedDate(ISO 8601 UTC en Ciudad de México UTC-6, suma 6 horas a la hora local). Ejemplo: 15:00 hora local = 21:00 UTC.\n{"thought": "...", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-30T21:00:00.000Z"}}`,
          createActivity: `5. createActivity: Crea la actividad únicamente si el cliente especificó su día/hora y checkAvailability dio AVAILABLE. Tu respuesta al cliente debe confirmar EXACTAMENTE la hora local acordada con el cliente.\nCampos: activityText(str), date(ISO 8601 UTC, suma 6 horas a hora local), typeActivityId(num), opportunityId(UUID,opc), reminderTitle(opc), reminderDate(ISO 8601,opc).\n{"thought": "...", "tool_name": "createActivity", "tool_input": {"activityText": "Llamada comercial", "date": "2026-07-30T21:00:00.000Z", "typeActivityId": 1}}`,
          createTicket: `6. createTicket: Registra ticket soporte.\nCampos: title(str), description(str), priority(1=Bajo,2=Medio,3=Alto), category(str).\n{"thought": "...", "tool_name": "createTicket", "tool_input": {"title": "Error login", "description": "Falla acceso", "priority": 2, "category": "Soporte"}}`,
          consult_product_catalog: `7. consult_product_catalog: Consulta información de productos en el catálogo.\nCampos: query(str).\n{"thought": "...", "tool_name": "consult_product_catalog", "tool_input": {"query": "término a buscar"}}`,
          sendQuotationPdf: `8. sendQuotationPdf: Genera y transmite el PDF de la cotización al chat.\nCampos opcionales: opportunityId(UUID).\n{"thought": "...", "tool_name": "sendQuotationPdf", "tool_input": {}}`,
          requestHumanHandoff: `9. requestHumanHandoff: Redirecciona la conversación a un ejecutivo especializado y desactiva el bot.\nCampos: reason(str).\n{"thought": "...", "tool_name": "requestHumanHandoff", "tool_input": {"reason": "Cliente solicitó atención humana"}}`,
        };

        const allowedTools = subAgent?.tools || [];
        const toolsText = allowedTools.map(k => ALL_TOOL_PROMPTS[k]).filter(Boolean).join('\n\n');
        const finalAnswerPrompt = `${allowedTools.length + 1}. final_answer — Envía una respuesta en lenguaje natural al cliente.\n{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Hola, bienvenido. ¿En qué te puedo ayudar hoy?"}}`;
        const toolsSectionText = toolsText ? `${toolsText}\n\n${finalAnswerPrompt}` : finalAnswerPrompt;
        const activitySection = state.route === 'seguimiento' ? `\n[TIPOS DE ACTIVIDAD]\n${activityTypesText}\n[ANTELACIÓN RECORDATORIO] ${config.reminderOffsetMinutes} min.\n` : '';

        let clientInfo: Record<string, any> = {};
        const activeClientId = state.clientId || conversation.clientId;
        if (activeClientId) {
          const client = await this.clientRepository.findOne({ where: { id: activeClientId } });
          if (client) {
            conversation.client = client;
            clientInfo = { id: client.id, nombre: `${client.nombre || ''} ${client.apellido || ''}`.trim(), correo: client.correo || null, telefono: client.telefono || null };
          }
        }

        const systemPrompt = `[SUB-AGENTE: ${subAgent?.name || 'General'}]\n${subAgent?.context || ''}\n\n[HOY] ${fechaContexto}\n\n[RESUMEN PREVIO]\n${conversation.summary || 'Sin historial.'}\n\n[CONTACTO CRM] ${JSON.stringify(clientInfo)}\n${activitySection}[HERRAMIENTAS] Responde SIEMPRE con un único JSON. Sin texto fuera del JSON.\n${toolsSectionText}\n\nREGLAS: Un JSON por turno | Usa IDs reales del contexto | checkAvailability antes de createActivity`;

        let toolExecutionText = '';
        if (state.toolCallName && state.toolCallResult) {
          const res = state.toolCallResult as any;
          let compactResult: Record<string, any>;
          if (state.toolCallName === 'checkAvailability') {
            compactResult = { status: res.status, available: res.available };
            if (res.suggestedSlots) compactResult.suggestedSlots = res.suggestedSlots;
          } else if (state.toolCallName === 'consult_product_catalog') {
            compactResult = { status: res.status, productos: res.data?.map((i: any) => i.content) || [], mensaje: res.data?.length === 0 ? 'No se encontraron productos.' : undefined };
          } else {
            compactResult = { status: res.status };
            if (res.message) compactResult.message = res.message;
            if (res.id) compactResult.id = res.id;
          }
          toolExecutionText = `\n[TOOL: ${state.toolCallName}] ${JSON.stringify(compactResult)}`;
          if (state.toolCallName === 'createActivity' && res.status === 'SUCCESS') {
            toolExecutionText += `\n[INSTRUCCIÓN CRÍTICA OBLIGATORIA] La actividad ha sido agendada y creada exitosamente en el CRM. Tu ÚNICA acción ahora es usar la herramienta 'final_answer' para confirmar la cita de forma clara y amigable al cliente. Queda ESTRICTAMENTE PROHIBIDO volver a llamar a 'checkAvailability' o 'createActivity'.`;
          } else if (state.toolCallName !== 'checkAvailability') {
            toolExecutionText += `\n[INSTRUCCIÓN OBLIGATORIA] El resultado anterior es de la herramienta '${state.toolCallName}'. Ahora DEBES generar un final_answer con una respuesta amigable en lenguaje natural para el cliente usando esa información. JAMÁS repitas el JSON del resultado como respuesta.`;
          }
        }

        const prompt = `${systemPrompt}${preFetchCatalogText}\n\n[HISTORIAL]\n${historyText}\n\n[CLIENTE] ${incomingContent}${toolExecutionText}\n\nJSON:`;
        let agentResponse = await this.callLLM(config, prompt, subAgent?.temperature ?? config.temperature);
        this.logger.log(`[DEBUG - SubAgent Raw Response] Salida: "${agentResponse}"`);

        const isTemplateOnly = agentResponse.includes('"..."') || agentResponse.includes('{"thought": "..."') || agentResponse.includes('tool_name": "..."');
        if (!agentResponse || agentResponse.trim() === '' || agentResponse.trim() === '""' || isTemplateOnly) {
          this.logger.warn(`Subagente devolvió respuesta vacía o plantilla genérica. Iniciando rescate conversacional.`);
          let ragContextText = '';
          if (state.route === 'comercial') {
            try {
              const ragResults = await this.toolsHandler.ragService.searchSimilar(incomingContent, 2);
              const cubeResults: any[] = [];
              const detectedKeys = [...new Set(ragResults.map(r => r.metadata?.product).filter(Boolean))];
              if (detectedKeys.length > 0) { for (const key of detectedKeys) cubeResults.push(...await this.toolsHandler.queryCubeProductsByKey(key)); }
              else { cubeResults.push(...await this.toolsHandler.queryCubeProducts(incomingContent)); }
              const merged = [...cubeResults, ...ragResults.map(r => ({ content: (r.pageContent || '').substring(0, 300) }))];
              if (merged.length === 0) cubeResults.push(...(await this.toolsHandler.queryCubeProducts('')).slice(0, 5));
              if (merged.length > 0) ragContextText = `[CONOCIMIENTO DEL CATÁLOGO DE PRODUCTOS (CAPA SEMÁNTICA CUBE Y RAG)]\n${merged.map(r => `- ${r.content}`).join('\n\n')}`;
            } catch (err: any) { this.logger.error(`Error en RAG/Capa Semántica para rescate: ${err.message}`); }
          }
          const rescuePrompt = `Eres el asistente de IA del CRM. Responde de forma amigable, natural y muy breve al cliente en su mismo idioma. No utilices formato JSON.\n\n${ragContextText || 'REGLAS: Está estrictamente PROHIBIDO inventar nombres de productos, marcas, precios o servicios.'}\n\n[RESUMEN DE LAS CONVERSACIONES PASADAS]\n${conversation.summary || 'No hay historial previo registrado.'}\n\n[HISTORIAL DE CONVERSACIÓN RECIENTE]\n${historyText}\n\n[ÚLTIMO MENSAJE]\nCliente: ${incomingContent}\n\nAsistente:`;
          const rescueResponse = await this.callLLM(config, rescuePrompt);
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
            let toolInput = obj.tool_input || obj.parameters || obj.arguments || obj.input || obj.function?.arguments || obj.function?.parameters || {};
            if (typeof toolInput === 'string') {
              try { toolInput = JSON.parse(toolInput); } catch (_) {}
            }
            if (!allowedTools.includes(toolName)) {
              this.logger.warn(`Sub-Agente '${state.route}' intentó usar una tool no permitida: '${toolName}'`);
              if (toolName === 'consult_product_catalog') {
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
              return { nextAction: 'respond', response: answerText };
            }
          }
        }

        // Prioridad 3: Rescate Regex si ningún JSON fue parseable
        this.logger.warn(`Sintaxis JSON inusual en subagente. Intentando rescate Regex. Salida: ${agentResponse}`);
        const answerMatch = agentResponse.match(/"answer"\s*:\s*"([^"]+)"/i);
        if (answerMatch?.[1]) return { nextAction: 'respond', response: answerMatch[1] };
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
            const executionResult = await this.toolsHandler.executeTool(toolName, validationResult.data, conversation, config);
            const catalogData = executionResult.catalogProducts || executionResult.data || [];
            const ragData = (executionResult.ragDocs || []).map((r: any) => ({
              content: r.pageContent && r.pageContent.length > 1000 ? r.pageContent.substring(0, 1000) + '... (texto truncado)' : (r.pageContent || r.content || ''),
              metadata: r.metadata,
            }));
            return { toolCallResult: { status: 'SUCCESS', data: [...catalogData, ...ragData] } };
          }
          const executionResult = await this.toolsHandler.executeTool(toolName, validationResult.data, conversation, config);
          let nextState: Partial<AgentState> = { toolCallResult: executionResult };
          if (state.toolCallName === 'requestHumanHandoff' || executionResult?.isHandedOff) nextState.isHandedOff = true;
          if ((state.toolCallName === 'registerContact' || state.toolCallName === 'updateContact') && executionResult.status === 'SUCCESS') {
            const targetClientId = executionResult.clientId || executionResult.client?.id || conversation.clientId;
            if (targetClientId) {
              nextState.clientId = targetClientId;
              conversation.clientId = targetClientId;
              const reloadedClient = await this.clientRepository.findOne({ where: { id: targetClientId } });
              if (reloadedClient) { conversation.client = reloadedClient; conversation.clientName = `${reloadedClient.nombre} ${reloadedClient.apellido || ''}`.trim(); }
            }
          }
          return nextState;
        } catch (error: any) {
          this.logger.error(`Error crítico ejecutando tool '${state.toolCallName}': ${error.message}`);
          return { toolCallResult: { status: 'ERROR', message: error.message || 'Error interno de ejecución.' } };
        }
      };

      // 5. Build and run the LangGraph state graph
      const checkPhoneExists = async (cId?: string | null): Promise<boolean> => {
        const targetId = cId || conversation.clientId;
        if (targetId) {
          const c = await this.clientRepository.findOne({ where: { id: targetId } });
          if (c && c.telefono && c.telefono.trim() !== '') {
            conversation.client = c;
            conversation.clientName = `${c.nombre} ${c.apellido || ''}`.trim();
            return true;
          }
        }

        // 1. Buscar en BD si el externalId de la conversación (ej. WhatsApp sender) coincide con un cliente existente
        if (conversation.externalId) {
          const matchedByExternal = await this.clientsService.findByPhone(conversation.externalId);
          if (matchedByExternal && matchedByExternal.telefono?.trim()) {
            this.logger.log(`[checkPhoneExists] Cliente identificado por externalId (${conversation.externalId}): ${matchedByExternal.nombre}`);
            conversation.client = matchedByExternal;
            conversation.clientId = matchedByExternal.id;
            conversation.clientName = `${matchedByExternal.nombre} ${matchedByExternal.apellido || ''}`.trim();
            await this.clientRepository.manager.getRepository(Conversation)
              .createQueryBuilder()
              .update(Conversation)
              .set({ clientId: matchedByExternal.id, clientName: conversation.clientName })
              .where('id = :id', { id: conversation.id })
              .execute();
            return true;
          }
        }

        // 2. Buscar en BD si el número extraído del mensaje del cliente coincide con un cliente existente
        const extracted = PhoneUtils.extractPhoneFromText(incomingContent);
        if (extracted) {
          const matchedByMessage = await this.clientsService.findByPhone(extracted);
          if (matchedByMessage && matchedByMessage.telefono?.trim()) {
            this.logger.log(`[checkPhoneExists] Cliente identificado por número en mensaje (${extracted}): ${matchedByMessage.nombre}`);
            conversation.client = matchedByMessage;
            conversation.clientId = matchedByMessage.id;
            conversation.clientName = `${matchedByMessage.nombre} ${matchedByMessage.apellido || ''}`.trim();
            await this.clientRepository.manager.getRepository(Conversation)
              .createQueryBuilder()
              .update(Conversation)
              .set({ clientId: matchedByMessage.id, clientName: conversation.clientName })
              .where('id = :id', { id: conversation.id })
              .execute();
            return true;
          }
        }

        return !!(conversation.client?.telefono?.trim());
      };

      const workflow = new StateGraph(AgentStateAnnotation)
        .addNode('routerNode', routerNode)
        .addNode('identificationNode', identificationNode)
        .addNode('subAgentNode', subAgentNode)
        .addNode('executeToolNode', executeToolNode);

      workflow.addEdge(START, 'routerNode');
      workflow.addConditionalEdges('routerNode', async (state: AgentState) => {
        const hasPhone = await checkPhoneExists(state.clientId);
        return (!hasPhone && state.route !== 'general') ? 'identificationNode' : 'subAgentNode';
      }, { identificationNode: 'identificationNode', subAgentNode: 'subAgentNode' });
      workflow.addConditionalEdges('identificationNode', async (state: AgentState) => {
        if (await checkPhoneExists(state.clientId)) return 'subAgentNode';
        if (state.nextAction === 'call_tool') return 'executeToolNode';
        return END;
      }, { subAgentNode: 'subAgentNode', executeToolNode: 'executeToolNode', [END]: END });
      workflow.addConditionalEdges('subAgentNode', (state: AgentState) => state.nextAction === 'call_tool' ? 'executeToolNode' : END, { executeToolNode: 'executeToolNode', [END]: END });
      workflow.addConditionalEdges('executeToolNode', () => 'subAgentNode', { subAgentNode: 'subAgentNode' });

      const app = workflow.compile();
      const finalState = await app.invoke({ clientId: conversation.clientId || null, route: 'general', nextAction: null, toolCallName: null, toolCallInput: null, toolCallResult: null, response: null } as any, { recursionLimit: 15 });

      const agentReply = finalState.response || 'He procesado tu solicitud en el sistema. ¿Te puedo colaborar en algo más?';
      this.updateConversationSummaryAsync(conversation, messages, incomingContent, agentReply).catch(err => {
        this.logger.error(`Error al iniciar actualización de resumen conversacional: ${err.message}`);
      });

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
    }
  }
}
