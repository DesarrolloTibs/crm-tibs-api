import { Injectable, Logger, Inject, forwardRef, OnModuleInit, HttpException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';
import { ProductFile } from '../products/entities/product-file.entity';
import { Product } from '../products/entities/product.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ActivitiesService } from '../Activities/activities.service';
import { RemindersService } from '../reminders/reminders.service';
import { ClientsService } from '../clients/clients.service';
import { TicketsService } from '../tickets/tickets.service';
import { Currency } from '../opportunities/entities/opportunity.entity';
import { BusinessLineOption } from '../opportunities/entities/business-line-option.entity';
import { DeliveryTypeOption } from '../opportunities/entities/delivery-type-option.entity';
import { LicensingOption } from '../opportunities/entities/licensing-option.entity';
import { RagService } from '../rag/rag.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

import { 
  RegisterContactSchema, 
  UpdateContactSchema, 
  CreateOpportunitySchema, 
  ModifyOpportunitySchema, 
  CheckAvailabilitySchema, 
  CreateActivitySchema, 
  CreateTicketSchema, 
  ConsultProductCatalogSchema 
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
  nextAction: Annotation<string | null>(), // 'call_tool' | 'respond' | 'clarify'
  toolCallName: Annotation<string | null>(),
  toolCallInput: Annotation<any | null>(),
  toolCallResult: Annotation<any | null>(),
  response: Annotation<string | null>(),
});

import { ConversationsGateway } from './conversations.gateway';
import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';

export type AgentState = typeof AgentStateAnnotation.State;

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = new Logger('AiAgentService');

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(AiSubAgent)
    private readonly aiSubAgentRepository: Repository<AiSubAgent>,
    @InjectRepository(ProductFile)
    private readonly productFileRepository: Repository<ProductFile>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly remindersService: RemindersService,
    private readonly clientsService: ClientsService,
    private readonly ticketsService: TicketsService,
    private readonly ragService: RagService,
    private readonly subscriptionValidator: SubscriptionValidatorService,
    @Inject(forwardRef(() => ConversationsGateway))
    private readonly gateway: ConversationsGateway,
  ) {}



  /**
   * Se ejecuta al inicializar el módulo.
   */
  async onModuleInit() {
    await this.runOneTimeSubAgentMigration();
  }


  /**
   * Realiza la migración y desglose inicial del contexto general hacia los sub-agentes si la tabla está vacía.
   */
  async runOneTimeSubAgentMigration(): Promise<void> {
    try {
      const config = await this.getOrInitConfig();

      // Sólo inicializamos la semilla neutra del enrutador si la base de datos está vacía
      if (!config.context) {
        config.context = `# Prompt del Agente Principal (Enrutador) — Asistente del CRM

Eres el Agente Principal (Enrutador) del ecosistema de IA del CRM. Tu única tarea es clasificar el último mensaje del cliente en el contexto de la conversación histórica para redirigir el chat al sub-agente especializado correcto.

## Sub-Agentes Disponibles en el Ecosistema:
*   **comercial:** Úsalo cuando el cliente pregunte precios, cotizaciones, información detallada de productos del catálogo, o demuestre intención de contratar o comprar un servicio o desarrollo a la medida.
*   **seguimiento:** Úsalo cuando el cliente solicite agendar demostraciones, llamadas, citas, reuniones, o confirme días y horarios de disponibilidad para un seguimiento comercial.
*   **soporte_atencion:** Úsalo cuando el cliente tenga quejas, problemas con facturación, reportes de errores en el sistema, caídas del servicio o requiera soporte técnico sobre herramientas ya contratadas.
*   **general:** Úsalo cuando el cliente salude, se despida, agradezca, platique de forma informal (small talk), haga preguntas directas sobre la empresa (sitio web, ubicación) o si el mensaje no encaja en las intenciones de los otros sub-agentes.

## Reglas Críticas de Enrutamiento:
1. **Historial de Conversación:** Si el cliente venía hablando de un producto (intención comercial) pero en su último mensaje dice "Agenda la cita para mañana a las 3", debes clasificarlo en "seguimiento" porque su intención inmediata ha transicionado a agendar.
2. **Reportes y Quejas:** Si el cliente dice "No sirve el sistema" o "Tengo problemas para entrar", redirígelo de inmediato a "soporte_atencion".
3. **Plática / Saludo:** Saludos simples como "Hola" o despedidas como "Gracias" deben ir a "general".

## Formato Obligatorio de Salida:
Debes responder ÚNICAMENTE con un objeto JSON válido y limpio. Sin markdown ni explicaciones.
Estructura del JSON:
{
  "thought": "Análisis de la intención y por qué se selecciona esta ruta.",
  "route": "key_del_subagente"
}

## Ejemplos de Clasificación:
*   Cliente dice: "Hola, buenos días."
    {"thought": "El usuario saluda al bot, no hay intención comercial, de soporte ni agendamiento aún.", "route": "general"}
*   Cliente dice: "Me interesa una demo de tu software, cuánto cuesta?"
    {"thought": "El usuario pregunta precios y detalles técnicos de un producto, es de naturaleza de ventas.", "route": "comercial"}
*   Cliente dice: "Mañana a las 2 pm está perfecto para la llamada."
    {"thought": "El usuario confirma un horario de cita para una llamada comercial en el historial, corresponde a agendar seguimiento.", "route": "seguimiento"}
*   Cliente dice: "No puedo entrar al sistema, me marca error 500."
    {"thought": "El usuario reporta una falla técnica con una herramienta en producción, requiere soporte técnico.", "route": "soporte_atencion"}`;
        await this.aiAgentConfigRepository.save(config);
        this.logger.log('Se inicializó el prompt semilla principal neutro config.context.');
      }

      const count = await this.aiSubAgentRepository.count();
      
      const baseCommonPrompt = `Eres el asistente conversacional de la empresa del CRM.
Tono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.
Idioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).
REGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está strictly PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestar, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.
ANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está strictly prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.
SOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.
NO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.
Redirección: Deriva con un ejecutivo especializado si hay inconformidades, quejas, molestia o si el cliente lo solicita.`;

      const comercialInstructions = `[INSTRUCCIONES COMERCIALES]
- Registra oportunidades en el CRM.
- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento. Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes llamar obligatoriamente a la herramienta consult_product_catalog para consultar la base de datos real.
- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.
- Si el producto tiene manuales PDF en RAG, resume especificaciones clave.
- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity.
- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a consult_product_catalog.
- Si hay una oportunidad activa del mismo producto, actualízala con modifyOpportunity.`;

      const seguimientoInstructions = `[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]
- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.
- Consulta disponibilidad usando checkAvailability antes de agendar.
- Si está AVAILABLE, agenda con createActivity y añade recordatorios de forma proactiva.
- Si está UNAVAILABLE, ofrece los slots de suggestedSlots.
- Si falta fecha u hora, pregúntala. Si da ambos datos, agenda de inmediato.
- Vincula la actividad con el cliente. No uses UUIDs del sistema.`;

      const soporteInstructions = `[INSTRUCCIONES DE SOPORTE Y HELPDESK]
- Atiende incidencias, quejas y dudas de soporte técnico.
- Si el cliente expresa molestia, urgencia o solicita hablar con un superior, indícale amablemente que lo derivarás con un ejecutivo especializado de inmediato para brindarle atención personalizada.
- Genera un ticket en el CRM con createTicket si corresponde.
- Campos: title (título corto), description (falla), priority (1:Bajo, 2:Medio, 3:Alto), category (ej. Soporte Técnico).`;

      const generalInstructions = `[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde amablemente a saludos, despedidas o preguntas de plática informal.
- No intentes llamar a ninguna herramienta si el cliente solo te saluda.`;

      if (count > 0) {
        // RESPETAR LA FUENTE DE VERDAD Y AUTO-MIGRACIÓN DE TEXTOS 'ASESOR HUMANO' EN BD
        try {
          const existingAgents = await this.aiSubAgentRepository.find();
          for (const sa of existingAgents) {
            let modified = false;
            if (sa.context && (sa.context.includes('asesor humano') || sa.context.includes('disponibilidad de asesores'))) {
              sa.context = sa.context
                .replace(/asesor humano/g, 'ejecutivo especializado')
                .replace(/disponibilidad de asesores/g, 'disponibilidad de ejecutivos');
              modified = true;
            }
            if (sa.description && (sa.description.includes('asesor humano') || sa.description.includes('asesores'))) {
              sa.description = sa.description
                .replace(/asesor humano/g, 'ejecutivo especializado')
                .replace(/asesores/g, 'ejecutivos especializados');
              modified = true;
            }
            if (modified) {
              await this.aiSubAgentRepository.save(sa);
            }
          }
          const configs = await this.aiAgentConfigRepository.find();
          for (const cfg of configs) {
            if (cfg.context && cfg.context.includes('asesor humano')) {
              cfg.context = cfg.context.replace(/asesor humano/g, 'ejecutivo especializado');
              await this.aiAgentConfigRepository.save(cfg);
            }
          }
        } catch (migErr) {
          this.logger.error('Error durante la auto-migración de textos en subagentes:', migErr);
        }
        return;
      }

      this.logger.log('Iniciando migración única para desglose de contexto en sub-agentes...');

      const subAgentsToInsert = [
        {
          key: 'comercial',
          name: 'Sub-Agente Comercial',
          description: 'Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.',
          context: `${baseCommonPrompt}\n\n${comercialInstructions}`,
          tools: ['registerContact', 'updateContact', 'createOpportunity', 'modifyOpportunity', 'consult_product_catalog'],
          temperature: 0.2,
          isActive: true,
        },
        {
          key: 'seguimiento',
          name: 'Sub-Agente de Seguimiento',
          description: 'Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de ejecutivos especializados y crear recordatorios.',
          context: `${baseCommonPrompt}\n\n${seguimientoInstructions}`,
          tools: ['registerContact', 'updateContact', 'checkAvailability', 'createActivity'],
          temperature: 0.5,
          isActive: true,
        },
        {
          key: 'soporte_atencion',
          name: 'Sub-Agente de Soporte',
          description: 'Atiende incidencias de soporte, quejas, dudas técnicas, deriva con un ejecutivo especializado y genera tickets de soporte en la mesa de ayuda (Helpdesk).',
          context: `${baseCommonPrompt}\n\n${soporteInstructions}`,
          tools: ['registerContact', 'updateContact', 'createTicket'],
          temperature: 0.5,
          isActive: true,
        },
        {
          key: 'general',
          name: 'Sub-Agente Conversacional',
          description: 'Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales sin uso de herramientas.',
          context: `${baseCommonPrompt}\n\n${generalInstructions}`,
          tools: [],
          temperature: 0.7,
          isActive: true,
        },
      ];

      for (const agentData of subAgentsToInsert) {
        const subAgent = this.aiSubAgentRepository.create(agentData);
        await this.aiSubAgentRepository.save(subAgent);
      }

      this.logger.log('Migración y desglose inicial de sub-agentes completado con éxito.');
    } catch (error) {
      this.logger.error('Error durante la migración de sub-agentes:', error);
    }
  }

  /**
   * Obtiene credenciales globales de IA desde el esquema public.ai_agent_configs.
   */
  private async getGlobalAiCredentials(): Promise<any> {
    try {
      const rows = await this.aiAgentConfigRepository.manager.query(
        `SELECT "modelProvider", "modelName", "openaiApiKey", "openaiEndpoint", "openaiApiVersion", "openaiEmbeddingModel", "geminiApiKey", "watsonxApiKey", "watsonxProjectId", "watsonxRegion", "watsonxEmbeddingModel", "maxNewTokens" FROM public.ai_agent_configs LIMIT 1`
      );
      if (rows && rows.length > 0) {
        return rows[0];
      }
    } catch (err: any) {
      this.logger.warn(`No se pudieron cargar credenciales globales desde public.ai_agent_configs: ${err.message}`);
    }
    return {};
  }

  private async ensureHistoryMessageLimitColumnExists(): Promise<void> {
    try {
      const tenants: any[] = await this.aiAgentConfigRepository.manager.query(
        `SELECT schema_name FROM public.tenants WHERE is_active = true`
      );
      for (const t of tenants) {
        try {
          await this.aiAgentConfigRepository.manager.query(
            `ALTER TABLE "${t.schema_name}".ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`
          );
        } catch (err: any) {}
      }
      try {
        await this.aiAgentConfigRepository.manager.query(
          `ALTER TABLE public.ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`
        );
      } catch (err: any) {}
    } catch (e: any) {
      try {
        await this.aiAgentConfigRepository.manager.query(
          `ALTER TABLE ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;`
        );
      } catch (err: any) {}
    }
  }

  /**
   * Obtiene la configuración activa del Agente de IA para el tenant. Si no existe, crea una por defecto.
   */
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

    // Cargar y fusionar credenciales globales desde public.ai_agent_configs (SuperAdmin)
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

  /**
   * Guarda o actualiza la configuración del Agente de IA.
   */
  async saveConfig(data: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    // 1. Guardar/Actualizar credenciales globales en public.ai_agent_configs si la solicitud las incluye
    const hasGlobalFields =
      'modelProvider' in data ||
      'openaiApiKey' in data ||
      'geminiApiKey' in data ||
      'watsonxApiKey' in data ||
      'maxNewTokens' in data;

    if (hasGlobalFields) {
      try {
        const publicRows = await this.aiAgentConfigRepository.manager.query(
          `SELECT id FROM public.ai_agent_configs LIMIT 1`
        );
        if (publicRows && publicRows.length > 0) {
          const globalId = publicRows[0].id;
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
            [
              data.modelProvider ?? null,
              data.modelName ?? null,
              data.openaiApiKey ?? null,
              data.openaiEndpoint ?? null,
              data.openaiApiVersion ?? null,
              data.openaiEmbeddingModel ?? null,
              data.geminiApiKey ?? null,
              data.watsonxApiKey ?? null,
              data.watsonxProjectId ?? null,
              data.watsonxRegion ?? null,
              data.watsonxEmbeddingModel ?? null,
              data.maxNewTokens ?? null,
              globalId,
            ]
          );
        } else {
          await this.aiAgentConfigRepository.manager.query(
            `INSERT INTO public.ai_agent_configs (
              "modelProvider", "modelName", "openaiApiKey", "openaiEndpoint", "openaiApiVersion",
              "openaiEmbeddingModel", "geminiApiKey", "watsonxApiKey", "watsonxProjectId",
              "watsonxRegion", "watsonxEmbeddingModel", "maxNewTokens"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              data.modelProvider || 'gemini',
              data.modelName || 'gemini-1.5-flash',
              data.openaiApiKey || null,
              data.openaiEndpoint || null,
              data.openaiApiVersion || null,
              data.openaiEmbeddingModel || 'text-embedding-ada-002',
              data.geminiApiKey || null,
              data.watsonxApiKey || null,
              data.watsonxProjectId || null,
              data.watsonxRegion || 'us-south',
              data.watsonxEmbeddingModel || 'ibm/slate-125m-english-rtrvr',
              data.maxNewTokens || 2048,
            ]
          );
        }
      } catch (err: any) {
        this.logger.error(`Error al guardar credenciales globales de IA en public.ai_agent_configs: ${err.message}`);
      }
    }

    // 2. Guardar configuraciones propias del tenant en el esquema activo
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


  /**
   * Obtiene todos los sub-agentes configurados. Se auto-siembran si la tabla está vacía para el tenant.
   */
  async getSubAgents(): Promise<AiSubAgent[]> {
    let agents = await this.aiSubAgentRepository.find({ order: { key: 'ASC' } });
    if (!agents || agents.length === 0) {
      await this.runOneTimeSubAgentMigration();
      agents = await this.aiSubAgentRepository.find({ order: { key: 'ASC' } });
    }
    return agents;
  }


  /**
   * Crea o actualiza la configuración de un sub-agente.
   */
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

  /**
   * Elimina un sub-agente por su ID.
   */
  async deleteSubAgent(id: string): Promise<void> {
    await this.aiSubAgentRepository.delete(id);
  }

  /**
   * Procesa un mensaje entrante mediante el Agente de IA (Bucle de Razonamiento + Herramientas).
   */
  /**
   * Procesa un mensaje entrante mediante el Grafo de Estados de LangGraph.
   */
  async processIncomingMessage(conversation: Conversation, incomingContent: string): Promise<{ reply: string; route: string; isHandedOff: boolean }> {
    const config = await this.getOrInitConfig();
    if (!config.isActive) {
      return { reply: '', route: 'inactive', isHandedOff: false };
    }

    try {
      // 1. Obtener el historial reciente omnicanal (excluyendo logs de sistema) según límite configurado
      const historyLimit = config.historyMessageLimit && config.historyMessageLimit > 0 ? config.historyMessageLimit : 10;
      let messages: Message[] = [];

      if (conversation.clientId) {
        messages = await this.messageRepository.createQueryBuilder('m')
          .leftJoinAndSelect('m.conversation', 'c')
          .where('c.clientId = :clientId', { clientId: conversation.clientId })
          .orderBy('m.createdAt', 'DESC')
          .take(historyLimit)
          .getMany();
      } else {
        messages = await this.messageRepository.find({
          where: { conversationId: conversation.id },
          order: { createdAt: 'DESC' },
          take: historyLimit,
          relations: ['conversation'],
        });
      }
      messages.reverse();

      const historyText = messages
        .filter(m => m.sender !== 'system')
        .map(m => `[${(m.conversation?.channel || conversation.channel).toUpperCase()}] ${m.sender === 'contact' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n');

      const routerHistoryText = historyText;

      // 2. Obtener lista de tipos de actividad disponibles
      const activityTypes = await this.activitiesService.findAllTypes();
      const activityTypesText = activityTypes
        .map(t => `- ID ${t.id}: ${t.strname}`)
        .join('\n');

      // 3. Obtener metadatos de fecha y hora actual (hora local CDMX)
      const now = new Date();
      const mexicoCityISO = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const diaActualNombre = diasSemana[mexicoCityISO.getDay()];
      const diaActualNum = mexicoCityISO.getDate();
      const mesActualNombre = meses[mexicoCityISO.getMonth()];
      const anioActual = mexicoCityISO.getFullYear();
      const horaActual = mexicoCityISO.toTimeString().slice(0, 5);

      const manana = new Date(mexicoCityISO); manana.setDate(manana.getDate() + 1);
      const pasadoManana = new Date(mexicoCityISO); pasadoManana.setDate(pasadoManana.getDate() + 2);
      const formatDate = (d: Date) => `${diasSemana[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;

      const fechaContexto = [
        `Hoy: ${diaActualNombre} ${diaActualNum} de ${mesActualNombre} de ${anioActual} — Hora actual: ${horaActual} (hora Ciudad de México)`,
        `Mañana: ${formatDate(manana)}`,
        `Pasado mañana: ${formatDate(pasadoManana)}`,
      ].join('\n');

      // 4. DEFINIR LOS NODOS DEL GRAFO DE ESTADOS

      // Nodo Enrutador
      const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
        const subAgentsDescriptionText = subAgents
          .map(sa => `- Clave: "${sa.key}" - Descripción: "${sa.description}"`)
          .join('\n');

        const routerPrompt = `
${config.context || 'Eres el Agente Principal (Enrutador) de la Empresa.'}

[SUB-AGENTES DISPONIBLES EN EL SISTEMA]
${subAgentsDescriptionText}
- Clave: "general" - Descripción: "Úsala si el mensaje del cliente es un saludo, despedida, agradecimiento, charla informal (small talk), preguntas generales cortas que no requieran herramientas, o si ninguna de las otras claves es aplicable."

[REGLAS DE CONTINUIDAD Y CONTEXTO GENERAL]
- PREGUNTAS SOBRE PRODUCTOS, CATÁLOGO O COTIZACIONES: Si el mensaje del cliente contiene cualquier consulta sobre productos, servicios, catálogo, modelos, existencias o precios (por ejemplo: "Hola, qué productos tienen?", "Buenas tardes, vendes laptops?", "qué licencias manejan"), DEBES clasificarlo INMEDIATAMENTE en la ruta "comercial", sin importar que el mensaje comience con un saludo como "Hola" o "Buenos días".
- Analiza la conversación histórica en [HISTORIAL DE CONVERSACIÓN RECIENTE] y el [RESUMEN DE LAS CONVERSACIONES PASADAS] como el hilo conductor de la conversación.
- Si el cliente está dando una respuesta breve, una continuación, o confirmaciones simples (ej: 'sí', 'no', 'está bien', 'de acuerdo', 'agenda la demo', 'laptops'), NO lo derives a 'general'. Mantén el diálogo en la ruta del sub-agente activo con el que ya venía interactuando (ej: 'comercial' si hablaban de productos/precios, o 'seguimiento' si hablaban de agendar).
- Solo usa la ruta 'general' si el cliente únicamente saluda ("Hola", "Buenos días"), se despide, da las gracias o plática libre sin preguntar por productos, agendamientos ni soporte técnico.

[REGLA DE RESPUESTA OBLIGATORIA]
Responde ÚNICAMENTE con un objeto JSON por turno. Sin texto antes o después.
Estructura de respuesta:
{"thought": "...", "route": "CLAVE_ELEGIDA"}

[RESUMEN DE LAS CONVERSACIONES PASADAS]
${conversation.summary || 'No hay historial previo registrado.'}

[HISTORIAL DE CONVERSACIÓN RECIENTE]
${routerHistoryText}

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
        } catch (e) {
          this.logger.warn(`Sintaxis JSON inusual detectada en el enrutador. Intentando rescate por expresión regular. Salida: ${routerResponse}`);
          const routeMatch = routerResponse.match(/"route"\s*:\s*"([^"]+)"/i);
          if (routeMatch && routeMatch[1]) {
            selectedRoute = routeMatch[1];
            this.logger.log(`[LangGraph - Router Rescue] Ruta rescatada mediante Regex: '${selectedRoute}'`);
          } else {
            selectedRoute = 'general';
          }
        }

        return { route: selectedRoute };
      };

      // Nodo de Identificación Dinámica por Teléfono
      const identificationNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        this.logger.log('[LangGraph - Identificación] Cliente sin teléfono registrado. Solicitando número telefónico.');
        
        const identPrompt = `
Eres el Sub-Agente de Registro del CRM. Tu objetivo único u obligatorio es obtener el NÚMERO DE TELÉFONO del cliente como identificador principal en el CRM de la empresa antes de procesar cotizaciones, agendamientos o consultas del catálogo.

[REGLA DE IDENTIFICACIÓN OBLIGATORIA POR TELÉFONO]
- El número de teléfono es el identificador único obligatorio del cliente en el CRM.
- Si en el historial o último mensaje el cliente ya te proporcionó su número telefónico (y opcionalmente su nombre o correo), llama a la herramienta registerContact enviando el teléfono.
- Si el cliente aún NO te ha proporcionado su número de teléfono, NO llames a la herramienta. Escríbele un mensaje cordial solicitándole forzosamente su número de teléfono para poder identificar su cuenta en nuestro CRM.

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
            return {
              nextAction: 'call_tool',
              toolCallName: action.tool_name,
              toolCallInput: action.tool_input,
            };
          } else {
            return {
              nextAction: 'respond',
              response: action.tool_input?.answer || 'Para darte atención personalizada y continuar con tu solicitud, ¿me podrías proporcionar tu número de teléfono?',
            };
          }
        } catch (e) {
          return {
            nextAction: 'respond',
            response: 'Para poder atenderte y dar seguimiento a tu consulta, ¿me podrías indicar tu número de teléfono?',
          };
        }
      };

      // Nodo Ejecutor del Sub-Agente Activo
      const subAgentNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
        let subAgent = subAgents.find(sa => sa.key === state.route);
        if (!subAgent) {
          subAgent = subAgents.find(sa => sa.key === 'general');
        }

        // PRE-FETCH OBLIGATORIO: Si es ruta comercial y es primera invocación (sin toolCallResult),
        // consultar catálogo de forma proactiva para inyectar conocimiento real en el prompt.
        let preFetchCatalogText = '';
        if (state.route === 'comercial' && !state.toolCallResult) {
          try {
            const preRagResults = await this.ragService.searchSimilar(incomingContent, 3);
            const preDetectedKeys = [...new Set(preRagResults.map(r => r.metadata?.product).filter(Boolean))];
            const preCubeResults: any[] = [];
            if (preDetectedKeys.length > 0) {
              for (const key of preDetectedKeys) {
                preCubeResults.push(...await this.queryCubeProductsByKey(key));
              }
            } else {
              preCubeResults.push(...await this.queryCubeProducts(incomingContent));
            }

            const preMerged = [
              ...preCubeResults,
              ...preRagResults.map(r => ({ content: (r.pageContent || '').substring(0, 400) }))
            ];

            // Limitar a 5 resultados máximo para evitar prompt excesivamente largo
            const limitedResults = preMerged.slice(0, 5);

            if (limitedResults.length > 0) {
              preFetchCatalogText = `\n[CATÁLOGO RELEVANTE — DATOS REALES DE LA BASE DE DATOS]\n` +
                limitedResults.map(r => `- ${r.content}`).join('\n\n') +
                `\n\n[REGLA ANTI-ALUCINACIÓN OBLIGATORIA] Responde ÚNICAMENTE con la información del bloque [CATÁLOGO RELEVANTE] de arriba. Si el producto específico que el cliente solicita NO aparece en ese bloque, responde estrictamente: "Lo lamento, en este momento no contamos con ese producto en nuestro catálogo. Te puedo ayudar con los productos que tenemos disponibles." JAMÁS inventes nombres de productos, marcas, precios ni características que no estén listados arriba.`;
            } else {
              preFetchCatalogText = `\n[CATÁLOGO RELEVANTE — DATOS REALES DE LA BASE DE DATOS]\nNo se encontraron productos coincidentes en el catálogo.\n\n[REGLA ANTI-ALUCINACIÓN OBLIGATORIA] No se encontró ningún producto que coincida con la consulta del cliente. Responde estrictamente: "Lo lamento, en este momento no contamos con ese producto en nuestro catálogo." JAMÁS inventes nombres de productos, marcas o precios.`;
            }
          } catch (preFetchErr) {
            this.logger.error(`Error en pre-fetch de catálogo para ruta comercial: ${preFetchErr.message}`);
          }
        }

        // Obtener la información del cliente del CRM (compacta para optimizar tokens)
        let clientInfo: Record<string, any> = {};
        const activeClientId = state.clientId || conversation.clientId;
        if (activeClientId) {
          const client = await this.clientsService.findOne(activeClientId);
          if (client) {
            conversation.client = client;
            // Solo campos esenciales para ahorrar tokens
            clientInfo = {
              id: client.id,
              nombre: `${client.nombre || ''} ${client.apellido || ''}`.trim(),
              correo: client.correo || null,
              telefono: client.telefono || null,
            };
            // Solo incluir oportunidades en rutas que las necesitan
            if (state.route === 'comercial' || state.route === 'seguimiento') {
              const opportunities = await this.opportunitiesService.findByClientId(client.id);
              if (opportunities.length > 0) {
                clientInfo.oportunidades = opportunities.map(opp => ({
                  id: opp.id,
                  proyecto: opp.nombre_proyecto,
                  monto: opp.monto_total,
                  moneda: opp.moneda,
                  etapa: opp.stage?.strname || 'Activo',
                }));
              }
            }
          }
        }

        // Obtener catálogos activos para pasárselos en el prompt de la tool createOpportunity
        let activeBusinessLines = ['Datos', 'Desarrollo', 'RH'];
        let activeDeliveryTypes = ['Proyecto', 'Licencia', 'Asignacion', 'Bolsa de Horas'];
        let activeLicensings = ['No Aplica', 'Microsoft', 'IBM', 'Qlik', 'Alteryx', 'KNIME'];
        try {
          const blRepo = this.aiAgentConfigRepository.manager.getRepository(BusinessLineOption);
          const dtRepo = this.aiAgentConfigRepository.manager.getRepository(DeliveryTypeOption);
          const licRepo = this.aiAgentConfigRepository.manager.getRepository(LicensingOption);

          const [bls, dts, lics] = await Promise.all([
            blRepo.find({ where: { blnstatus: true } }),
            dtRepo.find({ where: { blnstatus: true } }),
            licRepo.find({ where: { blnstatus: true } }),
          ]);
          if (bls.length > 0) activeBusinessLines = bls.map(b => b.strname);
          if (dts.length > 0) activeDeliveryTypes = dts.map(d => d.strname);
          if (lics.length > 0) activeLicensings = lics.map(l => l.strname);
        } catch (err) {
          this.logger.error(`Error al cargar catálogos activos para prompt: ${err.message}`);
        }

        // Mapeo de prompts de herramientas permitidas al subagente
        const ALL_TOOL_PROMPTS: Record<string, string> = {
          createOpportunity: `1. createOpportunity: Registra oportunidad.
Campos: nombreProyecto(str), descripcion(str), montoTotal(num|null — usa null o 0 para desarrollos a la medida), moneda("MXN"|"USD"), nombreProducto(str, opcional - Nombre del producto del catálogo que le interesa), lineaNegocio(str, opcional - Debe ser uno de: ${activeBusinessLines.join(', ')}), tipoEntrega(str, opcional - Debe ser uno de: ${activeDeliveryTypes.join(', ')}), licenciamiento(str, opcional - Debe ser uno de: ${activeLicensings.join(', ')}).
{"thought": "Crear oportunidad y asociar producto.", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "Proyecto A", "descripcion": "Interés en A", "montoTotal": null, "moneda": "MXN", "nombreProducto": "Nombre del producto de interés"}}`,

          modifyOpportunity: `2. modifyOpportunity: Edita oportunidad. Usa ID real.
Campos: id(UUID), nombreProyecto, descripcion, montoTotal, moneda, etapa. Omite sin cambio.
{"thought": "Modificar oportunidad.", "tool_name": "modifyOpportunity", "tool_input": {"id": "uuid-real", "montoTotal": 15000}}`,

          updateContact: `3. updateContact: Actualiza contacto vinculado.
Campos opcionales: nombre(str), correo(str), telefono(str). Envía solo cambios.
{"thought": "Actualizar correo.", "tool_name": "updateContact", "tool_input": {"correo": "cliente@correo.com"}}`,

          checkAvailability: `4. checkAvailability: Valida disponibilidad de ejecutivo especializado.
Campos: proposedDate(ISO 8601 UTC). Llama antes de crear actividad con horario.
{"thought": "Validar horario.", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-05T21:00:00.000Z"}}`,

          createActivity: `5. createActivity: Crea actividad/reunión. Llama solo si checkAvailability dio AVAILABLE.
Campos: activityText(str), date(ISO 8601 UTC), typeActivityId(num), opportunityId(UUID,opc), reminderTitle(opc), reminderDate(ISO 8601,opc).
{"thought": "Crear actividad.", "tool_name": "createActivity", "tool_input": {"activityText": "Demo", "date": "2026-07-05T21:00:00.000Z", "typeActivityId": 1}}`,

          createTicket: `6. createTicket: Registra ticket soporte.
Campos: title(str), description(str), priority(1=Bajo,2=Medio,3=Alto), category(str).
{"thought": "Registrar ticket.", "tool_name": "createTicket", "tool_input": {"title": "Error login", "description": "Falla acceso", "priority": 2, "category": "Soporte"}}`,

          consult_product_catalog: `7. consult_product_catalog: Consulta información de productos en el catálogo, especificaciones técnicas, compatibilidad o precios. Úsala de forma libre para buscar cualquier producto o categoría.
Campos: query(str, término de búsqueda o pregunta libre).
{"thought": "Consultar catálogo.", "tool_name": "consult_product_catalog", "tool_input": {"query": "término o producto a buscar"}}`
        };

        const allowedTools = subAgent?.tools || [];
        const toolsText = allowedTools
          .map(toolKey => ALL_TOOL_PROMPTS[toolKey])
          .filter(Boolean)
          .join('\n\n');

        const finalAnswerPrompt = `8. final_answer — Envía una respuesta en lenguaje natural al cliente. Es la única acción que genera un mensaje visible.
{"thought": "Le daré la bienvenida cordial al cliente.", "tool_name": "final_answer", "tool_input": {"answer": "Hola, bienvenido. ¿En qué te puedo ayudar hoy?"}}`;

        const toolsSectionText = toolsText ? `${toolsText}\n\n${finalAnswerPrompt}` : finalAnswerPrompt;

        // Solo incluir activityTypes en el agente de seguimiento para ahorrar tokens
        const activitySection = (state.route === 'seguimiento')
          ? `\n[TIPOS DE ACTIVIDAD]\n${activityTypesText}\n[ANTELACIÓN RECORDATORIO] ${config.reminderOffsetMinutes} min.\n`
          : '';

        const systemPrompt = `[SUB-AGENTE: ${subAgent?.name || 'General'}]
${subAgent?.context || ''}

[HOY] ${fechaContexto}

[RESUMEN PREVIO]
${conversation.summary || 'Sin historial.'}

[CONTACTO CRM] ${JSON.stringify(clientInfo)}
${activitySection}
[HERRAMIENTAS] Responde SIEMPRE con un único JSON. Sin texto fuera del JSON.
${toolsSectionText}

REGLAS: Un JSON por turno | Usa IDs reales del contexto | No confirmes acciones con ERROR | checkAvailability antes de createActivity`;

        // Resultado de herramienta reciente — solo status y campos relevantes (evitar JSON voluminoso)
        let toolExecutionText = '';
        if (state.toolCallName && state.toolCallResult) {
          const res = state.toolCallResult as any;
          let compactResult: Record<string, any>;
          if (state.toolCallName === 'checkAvailability') {
            // Solo status y slots sugeridos (si hay)
            compactResult = { status: res.status, available: res.available };
            if (res.suggestedSlots) compactResult.suggestedSlots = res.suggestedSlots;
          } else if (state.toolCallName === 'consult_product_catalog') {
            compactResult = { status: res.status };
            if (res.data && Array.isArray(res.data) && res.data.length > 0) {
              // Mapear los contenidos de los productos encontrados y listarlos
              compactResult.productos = res.data.map((item: any) => item.content);
            } else {
              compactResult.mensaje = 'No se encontraron productos coincidentes en el catálogo.';
            }
          } else {
            // Para otras tools: solo status + message + id si existe
            compactResult = { status: res.status };
            if (res.message) compactResult.message = res.message;
            if (res.id) compactResult.id = res.id;
          }
          toolExecutionText = `\n[TOOL: ${state.toolCallName}] ${JSON.stringify(compactResult)}`;
          // Agregar instrucción explícita post-tool para que el modelo no repita los datos sino que los use para responder
          if (state.toolCallName !== 'checkAvailability') {
            toolExecutionText += `\n[INSTRUCCIÓN OBLIGATORIA] El resultado anterior es de la herramienta '${state.toolCallName}'. Ahora DEBES generar un final_answer con una respuesta amigable y en lenguaje natural para el cliente usando esa información. JAMÁS repitas el JSON del resultado como respuesta.`;
          }
        }

        const prompt = `${systemPrompt}${preFetchCatalogText}\n\n[HISTORIAL]\n${historyText}\n\n[CLIENTE] ${incomingContent}${toolExecutionText}\n\nJSON:`;

        // Usar temperatura del sub-agente si está definida, sino la del config global
        const subAgentTemperature = subAgent?.temperature ?? config.temperature;
        let agentResponse = await this.callLLM(config, prompt, subAgentTemperature);
        this.logger.log(`[DEBUG - SubAgent Raw Response] Salida: "${agentResponse}"`);

        // Lógica de resiliencia: Si la IA responde vacío o con una plantilla genérica con puntos suspensivos, hacemos rescate libre
        const isTemplateOnly = agentResponse.includes('"..."') || agentResponse.includes('{"thought": "..."') || agentResponse.includes('tool_name": "..."');
        if (!agentResponse || agentResponse.trim() === '' || agentResponse.trim() === '""' || isTemplateOnly) {
          this.logger.warn(`Subagente devolvió respuesta vacía o plantilla genérica. Iniciando rescate conversacional libre.`);
          
          let ragContextText = '';
          // Si es la ruta comercial, realizamos una búsqueda RAG preventiva y de capa semántica para alimentar el rescate
          if (state.route === 'comercial') {
            try {
              // 1. Consulta RAG vectorial preventiva (Embeddings) - Limitado a 2 fragmentos para control de tokens
              const ragResults = await this.ragService.searchSimilar(incomingContent, 2);

              // 2. Extraer productKeys únicos de los metadatos de embeddings
              const detectedKeys = [...new Set(
                ragResults
                  .map(r => r.metadata?.product)
                  .filter(Boolean)
              )];

              // 3. Consulta a Cube.dev a partir de los embeddings detectados
              const cubeResults = [];
              if (detectedKeys.length > 0) {
                for (const key of detectedKeys) {
                  const results = await this.queryCubeProductsByKey(key);
                  cubeResults.push(...results);
                }
              } else {
                // Fallback: Si los embeddings no arrojaron nada, intentamos búsqueda por palabra clave en Cube
                const fallbackResults = await this.queryCubeProducts(incomingContent);
                cubeResults.push(...fallbackResults);
              }
              
              let merged = [
                ...cubeResults,
                ...ragResults.map(r => ({ content: (r.pageContent || '').substring(0, 300) }))
              ];

              // Fallback definitivo: Si no se encontró nada tras buscar por términos descriptivos del usuario (ej: 'para programar'),
              // consultamos el catálogo completo para alimentar el contexto y que la IA de rescate sepa qué productos reales tenemos
              // Fallback limitado: traer máximo 5 productos del área de interés
              if (merged.length === 0) {
                const catalogResults = await this.queryCubeProducts('');
                merged = catalogResults.slice(0, 5);
              }

              if (merged.length > 0) {
                ragContextText = `[CONOCIMIENTO DEL CATÁLOGO DE PRODUCTOS (CAPA SEMÁNTICA CUBE Y RAG)]\n` +
                  merged.map(r => `- ${r.content}`).join('\n\n');
              }
            } catch (err) {
              this.logger.error(`Error al obtener RAG/Capa Semántica preventivo para rescate conversacional: ${err.message}`);
            }
          }

          const rescuePrompt = `Eres el asistente de IA del CRM.
Responde de forma amigable, natural y muy breve al cliente en su mismo idioma. No utilices formato JSON.

${ragContextText ? `${ragContextText}

REGLAS DE SEGURIDAD OBLIGATORIAS:
- Responde basándote ÚNICAMENTE en el bloque [CONOCIMIENTO DEL CATÁLOGO DE PRODUCTOS (RAG)] anterior.
- Si el producto por el que preguntan no aparece de forma explícita en ese bloque de conocimiento, responde de forma estricta: "Lo lamento, en este momento no contamos con ese producto en nuestro catálogo."
- Está estrictamente PROHIBIDO inventar, asumir o sugerir marcas o productos externos de internet (tales como Red Hat, Red Bull, etc.) que no se encuentren en la lista de arriba.` : 'REGLAS DE SEGURIDAD OBLIGATORIAS: Está estrictamente PROHIBIDO inventar nombres de productos, marcas, precios o servicios. Si te preguntan por un producto que no está en el historial, responde cordialmente que no dispones de esa información en este momento.'}

[RESUMEN DE LAS CONVERSACIONES PASADAS]
${conversation.summary || 'No hay historial previo registrado.'}

[HISTORIAL DE CONVERSACIÓN RECIENTE]
${historyText}

[ÚLTIMO MENSAJE]
Cliente: ${incomingContent}

Asistente:`;

          const rescueResponse = await this.callLLM(config, rescuePrompt);
          if (rescueResponse && rescueResponse.trim() !== '') {
            this.logger.log(`[LangGraph - SubAgent Rescue] Respuesta conversacional libre generada con éxito.`);
            return {
              nextAction: 'respond',
              response: rescueResponse.trim()
            };
          }
        }

        agentResponse = this.cleanJsonOutput(agentResponse);

        try {
          const action = JSON.parse(agentResponse);
          
          // Mapeo / Normalización de nombres de herramientas alucinadas
          const toolAliases: Record<string, string> = {
            getProductCatalog: 'consult_product_catalog',
            consultCatalog: 'consult_product_catalog',
            catalogSearch: 'consult_product_catalog',
            searchCatalog: 'consult_product_catalog',
            getProducts: 'consult_product_catalog',
            queryCatalog: 'consult_product_catalog',
          };
          if (action.tool_name && toolAliases[action.tool_name]) {
            action.tool_name = toolAliases[action.tool_name];
          }

          if (!action.tool_name || action.tool_name === 'undefined') {
            // Detectar si el modelo devolvió el resultado de la tool en lugar de un final_answer
            // (el modelo a veces repite el JSON de la tool en vez de generar una respuesta)
            const isToolResultEcho = (action.status && !action.tool_name) || (action.productos && !action.tool_name) || (action.mensaje && !action.tool_name);
            if (isToolResultEcho && state.toolCallResult) {
              const toolRes = state.toolCallResult as any;
              
              // Si el eco proviene de consult_product_catalog
              if (state.toolCallName === 'consult_product_catalog' && toolRes.data && Array.isArray(toolRes.data)) {
                if (toolRes.data.length > 0) {
                  // Mapear y formatear de forma amigable los productos encontrados
                  const prodText = toolRes.data
                    .map((item: any) => {
                      // El content suele traer Nombre, Descripción y Precio formateados
                      return item.content || '';
                    })
                    .join('\n\n');
                  return {
                    nextAction: 'respond',
                    response: `He consultado el catálogo. Esto es lo que tenemos disponible:\n\n${prodText}\n\n¿Te gustaría cotizar alguno o necesitas más detalles?`
                  };
                } else {
                  return {
                    nextAction: 'respond',
                    response: 'Lo lamento, en este momento no contamos con ese producto en el catálogo de TIBS.'
                  };
                }
              }

              // Para otras tools (como createOpportunity, registerContact, etc.)
              const productName = toolRes.specs?.nombre || toolRes.realTimeInventory?.nombre || '';
              const price = toolRes.specs?.precioBase || toolRes.realTimeInventory?.precio || null;
              const currency = toolRes.specs?.moneda || toolRes.realTimeInventory?.moneda || '';
              const description = toolRes.specs?.descripcion || '';
              let rescuedAnswer = productName
                ? `Contamos con **${productName}**${description ? `: ${description}` : ''}.${price ? ` El precio es $${price.toLocaleString('es-MX')} ${currency}.` : ''} ¿Te gustaría más información o cotizar?`
                : 'He revisado el catálogo. ¿Podrías ser más específico sobre el producto o servicio que buscas?';
              return { nextAction: 'respond', response: rescuedAnswer };
            }
          const fallbackAnswer = action.tool_input?.answer || action.answer || 'Con gusto le doy seguimiento a tu solicitud. ¿Te puedo ayudar en algo más?';
            return {
              nextAction: 'respond',
              response: fallbackAnswer,
            };
          }

          if (action.tool_name === 'final_answer') {
            return {
              nextAction: 'respond',
              response: action.tool_input?.answer || '',
            };
          } else {
            // Seguridad: Validar que el sub-agente tenga permitido ejecutar esta herramienta
            if (!allowedTools.includes(action.tool_name)) {
              this.logger.warn(`Sub-Agente '${state.route}' intentó usar una tool no permitida o no configurada: '${action.tool_name}'`);
              
              // Si la tool es de consulta de catálogo, permitimos su ejecución para obtener productos y responder adecuadamente
              if (action.tool_name === 'consult_product_catalog') {
                return {
                  nextAction: 'call_tool',
                  toolCallName: 'consult_product_catalog',
                  toolCallInput: action.tool_input || { query: incomingContent }
                };
              }

              // Si la tool no está permitida, cortamos el bucle respondiendo de forma conversacional en lugar de mostrar errores técnicos al cliente
              const fallback = action.tool_input?.answer || action.answer || 'Con gusto le doy seguimiento a tu consulta. ¿Me podrías indicar más detalles sobre lo que necesitas?';
              return {
                nextAction: 'respond',
                response: fallback
              };
            }

            return {
              nextAction: 'call_tool',
              toolCallName: action.tool_name,
              toolCallInput: action.tool_input
            };
          }
        } catch (e) {
          this.logger.warn(`Sintaxis JSON inusual detectada en subagente. Intentando rescate por expresión regular. Salida: ${agentResponse}`);
          // Fallback de rescate con Regex: Buscar la propiedad "answer"
          const answerMatch = agentResponse.match(/"answer"\s*:\s*"([^"]+)"/i);
          if (answerMatch && answerMatch[1]) {
            this.logger.log(`[LangGraph - SubAgent Rescue] Respuesta rescatada mediante Regex: '${answerMatch[1]}'`);
            return {
              nextAction: 'respond',
              response: answerMatch[1]
            };
          }
          
          return {
            nextAction: 'respond',
            response: 'Con gusto le doy seguimiento a tu solicitud. ¿Te puedo ayudar en algo más?'
          };
        }
      };

      // Nodo de Ejecución de Tools con Validaciones Estrictas (Zod)
      const executeToolNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        this.logger.log(`[LangGraph - Tool Executor] Ejecutando: '${state.toolCallName}'`);
        
        let validationResult: any;
        const input = state.toolCallInput || {};

        // Validar esquemas con Zod antes de enviar a base de datos
        try {
          switch (state.toolCallName) {
            case 'registerContact':
              validationResult = RegisterContactSchema.safeParse(input);
              break;
            case 'updateContact':
              validationResult = UpdateContactSchema.safeParse(input);
              break;
            case 'createOpportunity':
              validationResult = CreateOpportunitySchema.safeParse(input);
              break;
            case 'modifyOpportunity':
              validationResult = ModifyOpportunitySchema.safeParse(input);
              break;
            case 'checkAvailability':
              validationResult = CheckAvailabilitySchema.safeParse(input);
              break;
            case 'createActivity':
              validationResult = CreateActivitySchema.safeParse(input);
              break;
            case 'createTicket':
              validationResult = CreateTicketSchema.safeParse(input);
              break;
            case 'consult_product_catalog':
              validationResult = ConsultProductCatalogSchema.safeParse(input);
              break;
            default:
              return {
                toolCallResult: { status: 'ERROR', message: `Herramienta '${state.toolCallName}' no reconocida.` }
              };
          }

          if (validationResult && !validationResult.success) {
            this.logger.warn(`Error de validación Zod en tool '${state.toolCallName}': ${JSON.stringify(validationResult.error.format())}`);
            return {
              toolCallResult: { 
                status: 'ERROR', 
                message: 'Esquema de datos inválido en los argumentos de la herramienta.',
                details: validationResult.error.format()
              }
            };
          }

          // Si es la herramienta RAG, la direccionamos al RagService y a Cube.dev
          if (state.toolCallName === 'consult_product_catalog') {
            const parsedData = validationResult.data;
            
            // 1. Consulta RAG vectorial a pgvector (Búsqueda Semántica por Embeddings) - Limitado a 2 para control de tokens
            const ragResults = await this.ragService.searchSimilar(
              parsedData.query,
              2,
              parsedData.productKey
            );

            // 2. Extraer productKeys semánticos detectados por los embeddings
            const detectedKeys = [...new Set(
              ragResults
                .map(r => r.metadata?.product)
                .filter(Boolean)
            )];

            // 3. Consulta Semántica a Cube.dev a partir de los embeddings detectados
            const cubeResults = [];
            if (detectedKeys.length > 0) {
              for (const key of detectedKeys) {
                const results = await this.queryCubeProductsByKey(key);
                cubeResults.push(...results);
              }
            } else {
              // Fallback: Si los embeddings no detectaron nada (ej: RAG vacío), buscamos por texto
              const fallbackResults = await this.queryCubeProducts(parsedData.query);
              cubeResults.push(...fallbackResults);
            }
            
            // Truncar fragmentos de texto para evitar exceder el límite de tokens de entrada de la IA
            const truncatedResults = ragResults.map(r => ({
              content: r.pageContent && r.pageContent.length > 300 
                ? r.pageContent.substring(0, 300) + '... (texto truncado por límite de tokens)' 
                : r.pageContent,
              metadata: r.metadata
            }));

            // 4. Fusión de resultados (Cube + pgvector)
            const mergedResults = [ ...cubeResults, ...truncatedResults ];

            return {
              toolCallResult: { status: 'SUCCESS', data: mergedResults }
            };
          }

          // Ejecutar herramienta física en base de datos
          const executionResult = await this.executeTool(
            state.toolCallName,
            validationResult ? validationResult.data : input,
            conversation,
            config
          );

          // Si registramos o actualizamos contacto, asociar de inmediato el clientId al estado y recargar la relación en memoria
          let nextState: Partial<AgentState> = { toolCallResult: executionResult };
          if ((state.toolCallName === 'registerContact' || state.toolCallName === 'updateContact') && executionResult.status === 'SUCCESS') {
            const targetClientId = executionResult.clientId || executionResult.client?.id || conversation.clientId;
            if (targetClientId) {
              nextState.clientId = targetClientId;
              conversation.clientId = targetClientId;
              const reloadedClient = await this.clientRepository.findOne({ where: { id: targetClientId } });
              if (reloadedClient) {
                conversation.client = reloadedClient;
                conversation.clientName = `${reloadedClient.nombre} ${reloadedClient.apellido || ''}`.trim();
              }
            }
          }

          return nextState;
        } catch (error: any) {
          this.logger.error(`Error crítico ejecutando tool '${state.toolCallName}': ${error.message}`);
          return {
            toolCallResult: { status: 'ERROR', message: error.message || 'Error interno de ejecución.' }
          };
        }
      };

      // 5. CONSTRUIR E INICIALIZAR EL GRAFO DE ESTADOS (LANGGRAPH)

      const workflow = new StateGraph(AgentStateAnnotation)
        .addNode('routerNode', routerNode)
        .addNode('identificationNode', identificationNode)
        .addNode('subAgentNode', subAgentNode)
        .addNode('executeToolNode', executeToolNode);

      // Conexiones de flujo
      workflow.addEdge(START, 'routerNode');

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
        if (conversation.client && conversation.client.telefono && conversation.client.telefono.trim() !== '') {
          return true;
        }
        return false;
      };

      workflow.addConditionalEdges(
        'routerNode',
        async (state: AgentState) => {
          // Identificación dinámica por teléfono: Si el cliente no posee número de teléfono registrado, obligar a identificación
          const hasPhone = await checkPhoneExists(state.clientId);
          if (!hasPhone && state.route !== 'general') {
            return 'identificationNode';
          }
          return 'subAgentNode';
        },
        {
          identificationNode: 'identificationNode',
          subAgentNode: 'subAgentNode'
        }
      );

      workflow.addConditionalEdges(
        'identificationNode',
        async (state: AgentState) => {
          const hasPhoneNow = await checkPhoneExists(state.clientId);
          if (hasPhoneNow) {
            return 'subAgentNode'; // Ya cuenta con teléfono registrado, pasa al subagente
          }
          if (state.nextAction === 'call_tool') {
            return 'executeToolNode'; // Llamó a registrar contacto, va a ejecución
          }
          return END; // Flujo conversacional para pedir datos, responde y termina
        },
        {
          subAgentNode: 'subAgentNode',
          executeToolNode: 'executeToolNode',
          [END]: END
        }
      );

      workflow.addConditionalEdges(
        'subAgentNode',
        (state: AgentState) => {
          if (state.nextAction === 'call_tool') {
            return 'executeToolNode';
          }
          return END; // final_answer, responde y termina
        },
        {
          executeToolNode: 'executeToolNode',
          [END]: END
        }
      );

      // El ejecutor de tools siempre vuelve al subagente o va a subAgentNode tras registrar contacto
      workflow.addConditionalEdges(
        'executeToolNode',
        (state: AgentState) => {
          // Si registramos contacto en identificación, volvemos a evaluar el flujo en subAgent
          return 'subAgentNode';
        },
        {
          subAgentNode: 'subAgentNode'
        }
      );

      // Compilar el Grafo
      const app = workflow.compile();

      // Ejecutar el Grafo pasándole el estado inicial con límite de recursión para evitar loops infinitos
      const finalState = await app.invoke({
        clientId: conversation.clientId || null,
        route: 'general',
        nextAction: null,
        toolCallName: null,
        toolCallInput: null,
        toolCallResult: null,
        response: null
      } as any, { recursionLimit: 8 });

      const agentReply = finalState.response || 'He procesado tu solicitud en el sistema. ¿Te puedo colaborar en algo más?';

      // Lanzar de forma asíncrona la actualización del resumen de la conversación en segundo plano
      this.updateConversationSummaryAsync(conversation, messages, incomingContent, agentReply).catch(err => {
        this.logger.error(`Error al iniciar actualización de resumen conversacional: ${err.message}`);
      });

      const selectedRoute = finalState.route || 'general';
      const replyLower = (agentReply || '').toLowerCase();
      const isHandedOff = selectedRoute === 'soporte_atencion' || replyLower.includes('ejecutivo especializado') || replyLower.includes('deriv');

      return {
        reply: agentReply,
        route: selectedRoute,
        isHandedOff,
      };
    } catch (err: any) {
      // ── Manejo específico de errores de suscripción / límite de recursos ──
      if (err instanceof HttpException && err.getStatus() === 402) {
        const payload = err.getResponse() as any;
        const code = payload?.code || 'SUBSCRIPTION_ERROR';

        this.logger.warn(`[Subscription] Solicitud de IA bloqueada para tenant — código: ${code}`);

        // No enviar ningún mensaje de respuesta al chat.
        // La notificación in-app y por correo se gestionará en triggerAiReply.
        return {
          reply: '',
          route: 'subscription_blocked',
          isHandedOff: false,
          subscriptionCode: code,
          subscriptionPayload: payload,
        } as any;
      }

      this.logger.error('Error en el motor conversacional LangGraph:', err);
      return {
        reply: 'Lo siento, en este momento no puedo procesar tu solicitud de forma automática.',
        route: 'error',
        isHandedOff: false,
      };
    }
  }

  /**
   * Ejecuta la herramienta seleccionada por la IA interactuando con los servicios del CRM.
   */
  private async executeTool(name: string, input: any, conversation: Conversation, config: AiAgentConfig): Promise<any> {
    try {
      switch (name) {
        case 'consult_product_catalog':
        case 'consultProductCatalog': {
          const queryText = input.query || input.search || input.productName || '';
          this.logger.log(`[executeTool] Ejecutando búsqueda RAG y catálogo de productos para: '${queryText}'`);
          
          const ragResults = await this.ragService.searchSimilar(queryText, 3);
          const cubeResults = await this.queryCubeProducts(queryText);

          return {
            status: 'SUCCESS',
            query: queryText,
            ragDocs: ragResults,
            catalogProducts: cubeResults,
          };
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

          // Resolver ids de producto basados en nombreProducto del catálogo
          const finalProductIds: string[] = input.productIds || [];
          if (input.nombreProducto) {
            try {
              const productRepo = this.aiAgentConfigRepository.manager.getRepository(Product);
              const qb = productRepo.createQueryBuilder('p');
              qb.where('LOWER(p.nombre) LIKE :name', { name: `%${input.nombreProducto.toLowerCase()}%` })
                .andWhere('p.status = :status', { status: true });
              const matchedProducts = await qb.getMany();
              
              if (matchedProducts.length > 0) {
                this.logger.log(`Productos asociados automáticamente a la oportunidad por coincidencia de nombre: ${matchedProducts.map(p => p.nombre).join(', ')}`);
                for (const p of matchedProducts) {
                  if (!finalProductIds.includes(p.id)) {
                    finalProductIds.push(p.id);
                  }
                }
              }
            } catch (productErr) {
              this.logger.error(`Error al buscar productos del catálogo por nombre: ${productErr.message}`);
            }
          }

          // Resolver id de línea de negocio si el LLM lo especificó
          let businessLineId = 'default';
          if (input.lineaNegocio) {
            try {
              const blRepo = this.aiAgentConfigRepository.manager.getRepository(BusinessLineOption);
              const bl = await blRepo.findOne({
                where: { strname: input.lineaNegocio, blnstatus: true }
              });
              if (bl) {
                businessLineId = bl.id;
              } else {
                // Búsqueda aproximada si no es idéntica
                const blApprox = await blRepo.createQueryBuilder('bl')
                  .where('LOWER(bl.strname) LIKE :name', { name: `%${input.lineaNegocio.toLowerCase()}%` })
                  .andWhere('bl.blnstatus = :status', { status: true })
                  .getOne();
                if (blApprox) businessLineId = blApprox.id;
              }
            } catch (err) {
              this.logger.error(`Error al buscar lineaNegocio por nombre: ${err.message}`);
            }
          }

          // Resolver id de tipo de entrega si el LLM lo especificó
          let deliveryTypeId = 'default';
          if (input.tipoEntrega) {
            try {
              const dtRepo = this.aiAgentConfigRepository.manager.getRepository(DeliveryTypeOption);
              const dt = await dtRepo.findOne({
                where: { strname: input.tipoEntrega, blnstatus: true }
              });
              if (dt) {
                deliveryTypeId = dt.id;
              } else {
                // Búsqueda aproximada si no es idéntica
                const dtApprox = await dtRepo.createQueryBuilder('dt')
                  .where('LOWER(dt.strname) LIKE :name', { name: `%${input.tipoEntrega.toLowerCase()}%` })
                  .andWhere('dt.blnstatus = :status', { status: true })
                  .getOne();
                if (dtApprox) deliveryTypeId = dtApprox.id;
              }
            } catch (err) {
              this.logger.error(`Error al buscar tipoEntrega por nombre: ${err.message}`);
            }
          }

          // Resolver id de licenciamiento si el LLM lo especificó
          let licensingId = undefined;
          if (input.licenciamiento) {
            try {
              const licRepo = this.aiAgentConfigRepository.manager.getRepository(LicensingOption);
              const lic = await licRepo.findOne({
                where: { strname: input.licenciamiento, blnstatus: true }
              });
              if (lic) {
                licensingId = lic.id;
              } else {
                // Búsqueda aproximada si no es idéntica
                const licApprox = await licRepo.createQueryBuilder('lic')
                  .where('LOWER(lic.strname) LIKE :name', { name: `%${input.licenciamiento.toLowerCase()}%` })
                  .andWhere('lic.blnstatus = :status', { status: true })
                  .getOne();
                if (licApprox) licensingId = licApprox.id;
              }
            } catch (err) {
              this.logger.error(`Error al buscar licenciamiento por nombre: ${err.message}`);
            }
          }

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
            productIds: finalProductIds,
          } as any, userEntity);
          return { status: 'SUCCESS', message: 'Oportunidad creada con éxito', opportunityId: opp.id, productsAddedCount: finalProductIds.length };
        }

        case 'modifyOpportunity': {
          let cleanMonto = undefined;
          if (input.montoTotal !== undefined && input.montoTotal !== null) {
            if (typeof input.montoTotal === 'number') {
              cleanMonto = input.montoTotal;
            } else {
              const strVal = String(input.montoTotal).replace(/[^0-9.-]/g, '');
              const parsed = parseFloat(strVal);
              cleanMonto = isNaN(parsed) ? 0 : parsed;
            }
          }

          const opp = await this.opportunitiesService.update(input.id, {
            nombre_proyecto: input.nombreProyecto,
            description: input.descripcion,
            monto_total: cleanMonto,
          });
          return { status: 'SUCCESS', message: 'Oportunidad modificada con éxito', opportunityId: opp.id };
        }

        case 'registerContact': {
          let email = input.correo || null;
          let phone = input.telefono ? String(input.telefono).trim() : null;

          // Búsqueda previa por teléfono para unificar cliente existente si ya fue registrado previamente en el CRM
          let client: Client | null = null;
          if (phone) {
            client = await this.clientRepository.findOne({ where: { telefono: phone } });
          }

          if (client) {
            // Cliente existente encontrado por teléfono
            if (input.nombre && !input.nombre.toLowerCase().includes('visitante')) {
              const names = this.splitFullName(input.nombre);
              client.nombre = names.nombre;
              if (names.apellido) client.apellido = names.apellido;
              if (email) client.correo = email;
              await this.clientRepository.save(client);
            }
          } else {
            // Crear nuevo cliente en el CRM
            const names = this.splitFullName(input.nombre || 'Visitante Webchat');
            client = await this.clientsService.create({
              nombre: names.nombre,
              apellido: names.apellido,
              correo: email,
              telefono: phone,
              ejecutivo_id: conversation.assignedUserId || undefined,
            } as any);
          }

          conversation.clientId = client.id;
          conversation.clientName = `${client.nombre} ${client.apellido || ''}`.trim();
          await this.clientRepository.manager.save(Conversation, conversation);

          return { status: 'SUCCESS', message: 'Contacto identificado por teléfono y vinculado', clientId: client.id, clientName: conversation.clientName };
        }

        case 'updateContact': {
          let phone = input.telefono ? String(input.telefono).trim() : null;

          // Si nos dan un teléfono y existe otro cliente con ese teléfono en la BD, unificamos a ese cliente
          if (phone) {
            const existingClient = await this.clientRepository.findOne({ where: { telefono: phone } });
            if (existingClient) {
              conversation.clientId = existingClient.id;
              if (input.nombre && !input.nombre.toLowerCase().includes('visitante')) {
                const names = this.splitFullName(input.nombre);
                existingClient.nombre = names.nombre;
                if (names.apellido) existingClient.apellido = names.apellido;
                if (input.correo) existingClient.correo = input.correo;
                await this.clientRepository.save(existingClient);
              }
              conversation.clientName = `${existingClient.nombre} ${existingClient.apellido || ''}`.trim();
              await this.clientRepository.manager.save(Conversation, conversation);

              return { status: 'SUCCESS', message: 'Contacto unificado por número de teléfono en el CRM', client: { id: existingClient.id, nombre: existingClient.nombre, apellido: existingClient.apellido, correo: existingClient.correo, telefono: existingClient.telefono } };
            }
          }

          if (!conversation.clientId) {
            const names = this.splitFullName(input.nombre || 'Visitante');
            const created = await this.clientsService.create({
              nombre: names.nombre,
              apellido: names.apellido,
              correo: input.correo || null,
              telefono: phone,
              ejecutivo_id: conversation.assignedUserId || undefined,
            } as any);
            conversation.clientId = created.id;
            conversation.clientName = `${created.nombre} ${created.apellido || ''}`.trim();
            await this.clientRepository.manager.save(Conversation, conversation);
            return { status: 'SUCCESS', message: 'Contacto registrado en el CRM', client: created };
          }
          
          const updateData: any = {};
          if (input.nombre) {
            const names = this.splitFullName(input.nombre);
            updateData.nombre = names.nombre;
            updateData.apellido = names.apellido;
          }
          if (input.correo !== undefined) updateData.correo = input.correo;
          if (input.telefono !== undefined) updateData.telefono = phone;

          const updated = await this.clientsService.update(conversation.clientId, updateData);

          conversation.clientName = `${updated.nombre} ${updated.apellido || ''}`.trim();
          await this.clientRepository.manager.save(Conversation, conversation);

          return { status: 'SUCCESS', message: 'Contacto actualizado en el CRM', client: { id: updated.id, nombre: updated.nombre, apellido: updated.apellido, correo: updated.correo, telefono: updated.telefono } };
        }

        case 'createActivity': {
          const clientId = conversation.clientId;
          if (!clientId) {
            return { status: 'ERROR', message: 'No hay ningún contacto registrado y vinculado a este chat para poder agendar una actividad.' };
          }

          // 1. Consultar oportunidades activas del cliente
          const activeOpportunities = await this.opportunitiesService.findByClientId(clientId);
          let finalOpportunityId = input.opportunityId;

          if (finalOpportunityId) {
            // Regla de Seguridad (Ownership): Validar propiedad
            const belongsToClient = activeOpportunities.some(opp => opp.id === finalOpportunityId);
            if (!belongsToClient) {
              return {
                status: 'ERROR',
                message: `La oportunidad con ID '${finalOpportunityId}' no pertenece a este cliente o no es válida.`
              };
            }
          } else {
            // Coerción inteligente:
            if (activeOpportunities.length === 1) {
              finalOpportunityId = activeOpportunities[0].id;
              this.logger.log(`[executeTool] Asociando actividad automáticamente a la única oportunidad activa: '${finalOpportunityId}'`);
            } else if (activeOpportunities.length > 1) {
              const oppList = activeOpportunities
                .map(opp => `- ${opp.nombre_proyecto} (ID: ${opp.id}, Etapa: ${opp.stage?.strname || 'Activo'})`)
                .join('\n');
              return {
                status: 'ERROR',
                message: `El cliente tiene múltiples oportunidades activas. Debes pedirle al cliente que aclare a cuál de ellas se refiere antes de agendar la actividad.\nOportunidades disponibles:\n${oppList}`
              };
            }
          }

          const userEntity = conversation.assignedUserId ? { id: conversation.assignedUserId } as User : { id: 'system' } as User;
          
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
            clientId: clientId,
            reminder: input.reminderTitle ? {
              title: input.reminderTitle,
              date: remDate
            } : undefined
          } as any, userEntity);

          return { 
            status: 'SUCCESS', 
            message: `Actividad y recordatorio programados con éxito ${finalOpportunityId ? 'y asociados a la oportunidad ' + finalOpportunityId : ''}`, 
            activityId: activity.id 
          };
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
            const diff = Math.abs(new Date(act.date).getTime() - proposedDate.getTime());
            return diff < CONFLICT_WINDOW_MS;
          });

          if (conflicting.length === 0) {
            return {
              status: 'AVAILABLE',
              available: true,
              message: 'El horario está disponible.',
              proposedDateUTC: proposedDate.toISOString(),
            };
          }

          const tzOffset = this.getMexicoCityUTCOffset(proposedDate);

          const BIZ_START_LOCAL = 8;
          const BIZ_END_LOCAL = 18;
          const businessStartUTC = BIZ_START_LOCAL - tzOffset;
          const businessEndUTC = BIZ_END_LOCAL - tzOffset;

          const bookedTimesUTC = new Set(
            dayActivities.map(act => {
              const d = new Date(act.date);
              return d.getUTCHours();
            })
          );

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
            !dayActivities.some(act => {
              const diff = Math.abs(new Date(act.date).getTime() - slot.getTime());
              return diff < CONFLICT_WINDOW_MS;
            })
          );

          freeSlots.sort((a, b) =>
            Math.abs(a.getTime() - proposedDate.getTime()) -
            Math.abs(b.getTime() - proposedDate.getTime())
          );

          const suggestions = freeSlots.slice(0, 3).map(slot => {
            const displayTime = slot.toLocaleString('es-MX', {
              timeZone: 'America/Mexico_City',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
            return {
              utc: slot.toISOString(),
              local: displayTime,
            };
          });

          return {
            status: 'UNAVAILABLE',
            available: false,
            message: 'El horario solicitado ya está ocupado.',
            suggestedSlots: suggestions,
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

  /**
   * Invoca el modelo correspondiente según el proveedor configurado (Gemini, OpenAI, Watsonx).
   * Incluye pre-validación de suscripción para esquemas de tenant (no aplica a 'public').
   */
  private async callLLM(config: AiAgentConfig, prompt: string, temperatureOverride?: number): Promise<string> {
    // ── Pre-validación de suscripción (solo esquemas tenant) ──
    const activeSchema = TenantContextService.getTenantSchema();
    if (activeSchema && activeSchema !== 'public') {
      const checkResult = await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
      // Si is_extra es true, los tokens se registrarán como extra al finalizar
    }

    const provider = config.modelProvider;
    const model = config.modelName;

    const maxTokens = config.maxNewTokens || 2048;
    const temperature = temperatureOverride ?? config.temperature;

    if (provider === 'openai') {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('API Key de OpenAI no configurada.');
      const endpoint = config.openaiEndpoint || null;
      const apiVersion = config.openaiApiVersion || null;
      return this.callOpenAI(model, apiKey, prompt, temperature, endpoint, apiVersion, maxTokens);
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

  /**
   * Llamada REST a Gemini
   */
  private async callGemini(model: string, apiKey: string, prompt: string, temperature: number, maxNewTokens = 2048): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const numericMaxTokens = Number(maxNewTokens) || 2048;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: numericTemp,
          maxOutputTokens: numericMaxTokens,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de Gemini: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Log token usage and record in transaction_history
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;
    this.logger.log(`[Token Usage] Gemini - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
    this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, 'gemini_execution');

    return text.trim();
  }

  /**
   * Llamada REST a OpenAI (también soporta Azure OpenAI con endpoint personalizado)
   */
  private async callOpenAI(
    model: string,
    apiKey: string,
    prompt: string,
    temperature: number,
    endpoint?: string | null,
    apiVersion?: string | null,
    maxNewTokens = 2048,
  ): Promise<string> {
    const isAzure = !!endpoint;
    const url = isAzure
      ? `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=${apiVersion || '2024-12-01-preview'}`
      : 'https://api.openai.com/v1/chat/completions';

    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const numericMaxTokens = Number(maxNewTokens) || 2048;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isAzure) {
      headers['api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(isAzure ? {} : { model }),
        messages: [{ role: 'user', content: prompt }],
        temperature: numericTemp,
        max_tokens: numericMaxTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de ${isAzure ? 'Azure OpenAI' : 'OpenAI'}: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Log token usage and record in transaction_history
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    this.logger.log(`[Token Usage] ${isAzure ? 'Azure ' : ''}OpenAI - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
    this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, isAzure ? 'azure_openai_execution' : 'openai_execution');

    return text.trim();
  }

  /**
   * Llamada REST a IBM Watsonx
   */
  private async callWatsonx(model: string, apiKey: string, projectId: string, region: string, prompt: string, temperature: number, maxNewTokens = 2048): Promise<string> {
    const tokenUrl = 'https://iam.cloud.ibm.com/identity/token';
    const tokenBody = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenBody,
    });

    if (!tokenResponse.ok) {
      throw new Error('No se pudo autenticar con IBM Cloud para WatsonX.');
    }

    const tokenData: any = await tokenResponse.json();
    const iamToken = tokenData.access_token;

    const rawRegion = region || 'us-south';
    const baseUrl = rawRegion.startsWith('http')
      ? rawRegion.replace(/\/$/, '')
      : `https://${rawRegion}.ml.cloud.ibm.com`;
    const apiUrl = `${baseUrl}/ml/v1/text/generation?version=2023-05-29`;
    
    const numericTemp = typeof temperature === 'number' ? temperature : parseFloat(String(temperature || 0.7));
    const numericMaxTokens = Number(maxNewTokens) || 2048;
    const isGreedy = numericTemp < 0.15;

    const parameters: Record<string, any> = {
      max_new_tokens: numericMaxTokens,
      decoding_method: isGreedy ? 'greedy' : 'sample',
    };
    if (!isGreedy) {
      parameters.temperature = numericTemp;
    }

    let formattedInput = prompt;
    const modelLower = model.toLowerCase();
    if (modelLower.includes('mistral')) {
      if (!prompt.includes('[INST]')) {
        formattedInput = `<s>[INST] ${prompt} [/INST]`;
      }
    } else if (modelLower.includes('llama-3') || modelLower.includes('llama3')) {
      if (!prompt.includes('<|start_header_id|>')) {
        formattedInput = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nResponde en formato JSON estructurado.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${iamToken}`,
      },
      body: JSON.stringify({
        model_id: model,
        input: formattedInput,
        project_id: projectId,
        parameters,
      }),
    });


    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de WatsonX: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const rawText = data.results?.[0]?.generated_text || '';

    // Log token usage and record in transaction_history
    const inputTokens = data.results?.[0]?.input_token_count || 0;
    const outputTokens = data.results?.[0]?.generated_token_count || 0;
    const totalTokens = inputTokens + outputTokens;
    this.logger.log(`[Token Usage] WatsonX - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);
    this.recordTokenConsumption(inputTokens, outputTokens, totalTokens, 'watsonx_execution');

    return rawText.trim();
  }

  /**
   * Registra el consumo de tokens en transaction_history del tenant activo y notifica vía WebSocket
   */
  private recordTokenConsumption(promptTokens: number, completionTokens: number, totalTokens: number, actionName = 'ai_execution') {
    const activeSchema = TenantContextService.getTenantSchema() || 'public';
    if (activeSchema !== 'public' && totalTokens > 0) {
      this.subscriptionValidator.recordConsumption(
        activeSchema,
        promptTokens,
        completionTokens,
        totalTokens,
        false,
        actionName
      ).then(() => {
        if (this.gateway) {
          this.gateway.emitTenantConsumptionUpdated(activeSchema);
        }
      }).catch(err => {
        this.logger.error(`Error al registrar consumo de tokens para tenant ${activeSchema}: ${err.message}`);
      });
    }
  }



  /**
   * Sanitiza la salida para garantizar que inicie con `{"thought"` y termine con `}` cerrando el JSON.
   */
  private cleanJsonOutput(text: string): string {
    let clean = text.trim();
    
    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      clean = clean.substring(firstBrace);
    } else {
      // Si no trae llave de apertura, asumimos que completó el prefijo '{"thought": "'
      clean = `{"thought": "${clean.replace(/^"+/, '')}`;
    }

    if (clean.includes('```json')) {
      clean = clean.replace(/```json/gi, '');
      clean = clean.replace(/```/gi, '');
    }

    // Asegurar que nos quedamos solo con el primer objeto JSON balanceado y completo si el LLM repite la respuesta
    let openCount = 0;
    let closeCount = 0;
    let cutIndex = -1;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') openCount++;
      if (clean[i] === '}') {
        closeCount++;
        if (openCount > 0 && openCount === closeCount) {
          cutIndex = i;
          break;
        }
      }
    }

    if (cutIndex !== -1) {
      clean = clean.substring(0, cutIndex + 1);
    } else {
      // Si no pudimos balancearlo, aplicamos el balanceador dinámico por adición/sustracción de llaves
      let openBraces = (clean.match(/\{/g) || []).length;
      let closeBraces = (clean.match(/\}/g) || []).length;
      while (openBraces > closeBraces) {
        clean += '}';
        closeBraces++;
      }
      while (closeBraces > openBraces && clean.endsWith('}')) {
        clean = clean.substring(0, clean.length - 1);
        closeBraces--;
      }
      const lastBrace = clean.lastIndexOf('}');
      if (lastBrace !== -1) {
        clean = clean.substring(0, lastBrace + 1);
      }
    }

    return clean;
  }

  /**
   * Divide un nombre completo en nombre y apellido.
   */
  private splitFullName(fullName: string): { nombre: string; apellido: string } {
    const trimmed = fullName.trim();
    const index = trimmed.indexOf(' ');
    if (index === -1) {
      return { nombre: trimmed, apellido: '' };
    }
    return {
      nombre: trimmed.substring(0, index).trim(),
      apellido: trimmed.substring(index + 1).trim(),
    };
  }

  /**
   * Calcula el offset UTC de America/Mexico_City para una fecha dada (maneja horario de verano dinámicamente).
   */
  private getMexicoCityUTCOffset(date: Date): number {
    const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const localMs = new Date(date.toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getTime();
    return Math.round((localMs - utcMs) / (1000 * 60 * 60));
  }

  /**
   * Genera un token JWT de HS256 firmado con la secret de Cube.dev incluyendo el tenantSchema.
   */
  getCubeApiToken(tenantSchemaOverride?: string): string {
    return this.generateCubeToken(tenantSchemaOverride);
  }

  private generateCubeToken(tenantSchemaOverride?: string): string {
    const secret = 'crmtibs_secret_key_2026_xyz';
    const header = { alg: 'HS256', typ: 'JWT' };
    const schema = tenantSchemaOverride || TenantContextService.getTenantSchema() || 'public';
    const payload = { 
      exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60),
      tenantSchema: schema,
    };
    
    const base64url = (str: string) => Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
      
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
      
    return `${signatureInput}.${signature}`;
  }


  /**
   * Realiza una búsqueda semántica de productos mediante la REST API de Cube.dev.
   */
  private async queryCubeProducts(queryText: string): Promise<any[]> {
    try {
      // Extraer términos claves para la búsqueda (ignorar palabras comunes no sustantivas)

      const cleanKeyword = queryText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, '') // Quitar caracteres especiales
        .trim();

      const stopwords = new Set([
        'dame', 'quiero', 'informacion', 'del', 'producto', 'productos', 'sobre', 'que', 'empiezan',
        'con', 'modelo', 'especificaciones', 'detalles', 'buscar', 'el', 'la', 'los', 'las',
        'un', 'una', 'unos', 'unas', 'de', 'para', 'en', 'y', 'o', 'a', 'caracteristicas',
        'tienes', 'tienen', 'disponible', 'disponibles', 'catalogo', 'precios', 'precio',
        'costo', 'cotizacion', 'comprar', 'venta', 'adquirir', 'fichas', 'ficha', 'manual',
        'manuales', 'disponibilidad', 'ver', 'mostrar', 'listar', 'lista', 'cuales',
        'servicios', 'servicio', 'articulos', 'articulo', 'dispositivos', 'dispositivo', 'cosas'
      ]);

      const words = cleanKeyword.split(/\s+/).filter(w => w.length >= 2 && !stopwords.has(w));
      
      // Si no quedan palabras sustantivas (ej: el usuario buscó 'productos'), la búsqueda es general y no filtramos por nombre
      const hasSearchTerm = words.length > 0;
      // Multi-término: usar los 3 términos más largos para búsqueda más precisa
      const topTerms = hasSearchTerm ? words.sort((a, b) => b.length - a.length).slice(0, 3) : [];
      const finalSearchTerm = topTerms.length > 0 ? topTerms[0] : '';

      const filters: any[] = [
        {
          member: 'Productos.status',
          operator: 'equals',
          values: ['true']
        }
      ];

      if (hasSearchTerm && topTerms.length > 0) {
        if (topTerms.length === 1) {
          filters.push({
            member: 'Productos.nombre',
            operator: 'contains',
            values: [topTerms[0].toLowerCase()]
          });
        } else {
          // Búsqueda multi-término: filtrar con OR lógico usando el primer término,
          // luego refinar resultados en memoria con los demás
          filters.push({
            member: 'Productos.nombre',
            operator: 'contains',
            values: [topTerms[0].toLowerCase()]
          });
        }
      }

      const tenantSchema = TenantContextService.getTenantSchema() || 'public';
      const token = this.generateCubeToken(tenantSchema);

      const response = await fetch('http://localhost:4000/cubejs-api/v1/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'x-tenant-schema': tenantSchema,
          'x-tenant-id': tenantSchema,
        },
        body: JSON.stringify({
          query: {
            measures: ['Productos.count'],
            dimensions: [
              'Productos.id',
              'Productos.nombre',
              'Productos.descripcion',
              'Productos.precioBase',
              'Productos.requiereAnalisis',
              'Productos.status'
            ],
            filters
          },
          securityContext: { tenantSchema }
        })
      });


      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`Error de respuesta de Cube.dev: ${errText}`);
        return [];
      }

      const data: any = await response.json();
      if (data && data.data) {
        return data.data.map((p: any) => ({
          content: `[PRODUCTO EN EL CATALOGO - CAPA SEMÁNTICA CUBE.DEV]
Nombre del Producto: ${p['Productos.nombre']}
Descripción del Producto: ${p['Productos.descripcion'] || 'Sin descripción'}
Precio de Lista / Base: ${p['Productos.precioBase'] ? `$${p['Productos.precioBase']} MXN` : 'A la medida / Por definir'}
Requiere Análisis Técnico: ${p['Productos.requiereAnalisis'] === 'true' || p['Productos.requiereAnalisis'] === true ? 'Sí (A la medida)' : 'No (Estándar)'}
Estado: ${p['Productos.status'] === 'true' || p['Productos.status'] === true ? 'Activo' : 'Inactivo'}`,
          metadata: { source: 'cube-semantic-layer', productId: p['Productos.id'] }
        }));
      }
      return [];
    } catch (error) {
      this.logger.warn(`No se pudo conectar a la capa semántica de Cube.dev en el puerto 4000: ${error.message}`);
      return [];
    }
  }

  /**
   * Consulta a Cube.dev buscando un producto a partir de su productKey (slug) devuelto por los embeddings.
   */
  private async queryCubeProductsByKey(productKey: string): Promise<any[]> {
    const cleanKey = productKey.replace(/-/g, ' ').toLowerCase();
    return this.queryCubeProducts(cleanKey);
  }

  /**
   * Sincronización retrospectiva: Lee todos los archivos adjuntos PDF de los productos registrados en SQL
   * e indexa su contenido en el RAG pgvector de forma automática si aún no han sido procesados.
   */
  private async syncExistingProductFilesToRag(): Promise<void> {
    try {
      this.logger.log('Iniciando sincronización retrospectiva de fichas técnicas PDF al RAG vectorial...');
      const files = await this.productFileRepository.find({
        relations: ['product']
      });

      let syncedCount = 0;
      const fs = require('fs');
      for (const file of files) {
        if (file.fileName.toLowerCase().endsWith('.pdf') || file.filePath.toLowerCase().endsWith('.pdf')) {
          const product = file.product;
          if (!product) continue;

          const productKey = product.nombre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

          try {
            const absolutePath = `./${file.filePath}`;
            if (fs.existsSync(absolutePath)) {
              const fileBuffer = fs.readFileSync(absolutePath);
              await this.ragService.ingestPdf(fileBuffer, file.fileName, productKey);
              syncedCount++;
            }
          } catch (fileErr) {
            this.logger.error(`Error al indexar archivo retrospectivo '${file.fileName}': ${fileErr.message}`);
          }
        }
      }
      this.logger.log(`Sincronización retrospectiva finalizada. Se indexaron ${syncedCount} fichas técnicas PDF en pgvector.`);
      // Sincronizar también los productos del catálogo en base de datos
      await this.syncCatalogProductsToRag();
    } catch (err) {
      this.logger.error(`Error en la sincronización retrospectiva de fichas RAG: ${err.message}`);
    }
  }

  /**
   * Sincroniza retrospectivamente todos los productos activos del catálogo de SQL al RAG de pgvector.
   */
  private async syncCatalogProductsToRag(): Promise<void> {
    try {
      this.logger.log('Iniciando sincronización retrospectiva de productos del catálogo SQL a pgvector...');
      const products = await this.productFileRepository.manager.find(Product, {
        where: { status: true }
      });

      let syncedCount = 0;
      for (const product of products) {
        await this.ragService.ingestProduct(product.id, product.nombre, product.descripcion, product.precioBase as number | null, product.requiere_analisis);
        syncedCount++;
      }
      this.logger.log(`Sincronización de catálogo finalizada. Se indexaron ${syncedCount} productos en pgvector.`);
    } catch (err: any) {
      this.logger.error(`Error en la sincronización retrospectiva del catálogo a RAG: ${err.message}`);
    }
  }

  /**
   * Actualiza de forma asíncrona en segundo plano el resumen acumulado e incremental de la conversación.
   */
  private async updateConversationSummaryAsync(
    conversation: Conversation,
    recentMessages: Message[],
    lastClientMsg: string,
    lastAgentMsg: string
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

      const newSummary = await this.callLLM(config, summaryPrompt);
      if (newSummary && newSummary.trim() !== '') {
        conversation.summary = newSummary.trim();
        await this.aiAgentConfigRepository.manager.save(Conversation, conversation);
        this.logger.log(`Resumen conversacional de conversación ${conversation.id} actualizado con éxito.`);
      }
    } catch (err) {
      this.logger.error(`Error al actualizar resumen conversacional incremental: ${err.message}`);
    }
  }

  // ─── PUBLIC WRAPPERS PARA USO POR OTROS MÓDULOS (WebchatService) ───

  /**
   * Wrapper público para invocar el LLM con la configuración activa.
   */
  async invokeLanguageModel(prompt: string, temperatureOverride?: number): Promise<string> {
    const config = await this.getOrInitConfig();
    return this.callLLM(config, prompt, temperatureOverride);
  }



  /**
   * Wrapper público para sanitizar salida JSON del LLM.
   */
  sanitizeJsonOutput(text: string): string {
    return this.cleanJsonOutput(text);
  }
}
