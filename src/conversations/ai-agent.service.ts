import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
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
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ActivitiesService } from '../Activities/activities.service';
import { RemindersService } from '../reminders/reminders.service';
import { ClientsService } from '../clients/clients.service';
import { TicketsService } from '../tickets/tickets.service';
import { Currency } from '../opportunities/entities/opportunity.entity';
import { RagService } from '../rag/rag.service';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { 
  RegisterContactSchema, 
  UpdateContactSchema, 
  CreateOpportunitySchema, 
  ModifyOpportunitySchema, 
  CheckAvailabilitySchema, 
  CreateActivitySchema, 
  CreateTicketSchema, 
  SearchProductSpecsSchema 
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
  ) {}

  /**
   * Se ejecuta al inicializar el módulo.
   */
  async onModuleInit() {
    await this.runOneTimeSubAgentMigration();
    // Iniciar sincronización retrospectiva en segundo plano
    this.syncExistingProductFilesToRag().catch(err => {
      this.logger.error(`Error al iniciar sincronización de archivos retrospectivos: ${err.message}`);
    });
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
      
      const baseCommonPrompt = `Eres el asistente conversacional de inteligencia artificial del CRM.
Tono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.
Idioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).
ANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.
ACTUALIZACIÓN DE CONTACTO OBLIGATORIA: Si el cliente te proporciona su nombre, correo electrónico o teléfono durante la charla (por ejemplo, para agendar una demo o cotizar), debes llamar de forma PRIORITARIA a la herramienta updateContact para actualizar sus datos en el CRM de inmediato, antes de proceder a agendar o cotizar.
Redirección: Deriva con un asesor humano si hay inconformidades, quejas o si lo solicita, creando una actividad con recordatorio.`;

      const comercialInstructions = `[INSTRUCCIONES COMERCIALES]
- Registra oportunidades en el CRM.
- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento (tales como laptops, servidores, etc.). Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes llamar obligatoriamente a la herramienta search_product_specs para consultar la base de datos real. Si la búsqueda no devuelve coincidencias, responde cordialmente que en este momento no contamos con ese producto en el catálogo.
- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.
- Si el producto tiene manuales PDF en RAG, resume especificaciones clave.
- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity (montoTotal: null/0 si requiere análisis técnico, la bandera requiere_analisis es true o precioBase es null. De lo contrario, usa el precio obtenido).
- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a search_product_specs.
- Si hay una oportunidad activa del mismo producto, actualízala con modifyOpportunity.`;

      const seguimientoInstructions = `[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]
- Tu objetivo es agendar llamadas, demostraciones o reuniones.
- Consulta disponibilidad usando checkAvailability antes de agendar.
- Si está AVAILABLE, agenda con createActivity y añade recordatorios de forma proactiva.
- Si está UNAVAILABLE, ofrece los slots de suggestedSlots.
- Si falta fecha o hora, pregúntala. Si da ambos datos, agenda de inmediato.
- Vincula la actividad con el cliente. No uses UUIDs del sistema.`;

      const soporteInstructions = `[INSTRUCCIONES DE SOPORTE Y HELPDESK]
- Atiende incidencias y dudas de soporte técnico.
- Genera un ticket en el CRM con createTicket.
- Campos: title (título corto), description (falla), priority (1:Bajo, 2:Medio, 3:Alto), category (ej. Soporte Técnico).
- Informa al cliente que el reporte fue registrado exitosamente.`;

      const generalInstructions = `[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde amablemente a saludos, despedidas o preguntas de plática informal.
- No intentes llamar a ninguna herramienta si el cliente solo te saluda.`;

      if (count > 0) {
        // RESPETAR LA FUENTE DE VERDAD: Si ya existen subagentes en la base de datos, NO los sobreescribimos al arrancar.
        // Esto permite que el usuario edite y personalice los prompts directamente en la BD sin que NestJS pise sus cambios.
        return;
      }

      this.logger.log('Iniciando migración única para desglose de contexto en sub-agentes...');

      const subAgentsToInsert = [
        {
          key: 'comercial',
          name: 'Sub-Agente Comercial',
          description: 'Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.',
          context: `${baseCommonPrompt}\n\n${comercialInstructions}`,
          tools: ['registerContact', 'updateContact', 'createOpportunity', 'modifyOpportunity', 'search_product_specs'],
          isActive: true,
        },
        {
          key: 'seguimiento',
          name: 'Sub-Agente de Seguimiento',
          description: 'Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de asesores y crear recordatorios.',
          context: `${baseCommonPrompt}\n\n${seguimientoInstructions}`,
          tools: ['registerContact', 'updateContact', 'checkAvailability', 'createActivity'],
          isActive: true,
        },
        {
          key: 'soporte_atencion',
          name: 'Sub-Agente de Soporte',
          description: 'Atiende incidencias de soporte, quejas, dudas técnicas y genera tickets de soporte en la mesa de ayuda (Helpdesk).',
          context: `${baseCommonPrompt}\n\n${soporteInstructions}`,
          tools: ['registerContact', 'updateContact', 'createTicket'],
          isActive: true,
        },
        {
          key: 'general',
          name: 'Sub-Agente Conversacional',
          description: 'Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales sin uso de herramientas.',
          context: `${baseCommonPrompt}\n\n${generalInstructions}`,
          tools: [],
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
   * Obtiene la configuración activa del Agente de IA. Si no existe, crea una por defecto.
   */
  async getOrInitConfig(): Promise<AiAgentConfig> {
    let config = await this.aiAgentConfigRepository.findOne({ where: {} });
    if (!config) {
      config = this.aiAgentConfigRepository.create({
        isActive: true,
        context: `Configura aquí el contexto y las instrucciones de comportamiento de tu agente. Define su identidad, los productos o servicios que ofrece, el tono de comunicación y los criterios para gestionar contactos, oportunidades y actividades en el CRM.`,
        temperature: 0.7,
        modelProvider: 'gemini',
        modelName: 'gemini-1.5-flash',
        reminderOffsetMinutes: 60,
      });
      config = await this.aiAgentConfigRepository.save(config);
    }
    return config;
  }

  /**
   * Guarda o actualiza la configuración del Agente de IA.
   */
  async saveConfig(data: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    const existing = await this.getOrInitConfig();
    const updated = this.aiAgentConfigRepository.merge(existing, data);
    return this.aiAgentConfigRepository.save(updated);
  }

  /**
   * Obtiene todos los sub-agentes configurados.
   */
  async getSubAgents(): Promise<AiSubAgent[]> {
    return this.aiSubAgentRepository.find({ order: { key: 'ASC' } });
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
  async processIncomingMessage(conversation: Conversation, incomingContent: string): Promise<string> {
    const config = await this.getOrInitConfig();
    if (!config.isActive) {
      return '';
    }

    try {
      // 1. Obtener el historial reciente (excluyendo logs de sistema)
      const messages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'DESC' },
        take: 3,
      });
      messages.reverse();
      const historyText = messages
        .filter(m => m.sender !== 'system')
        .map(m => `${m.sender === 'contact' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n');

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

[REGLA DE RESPUESTA OBLIGATORIA]
Responde ÚNICAMENTE con un objeto JSON por turno. Sin texto antes o después.
Estructura de respuesta:
{"thought": "...", "route": "CLAVE_ELEGIDA"}

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

      // Nodo de Identificación Dinámica
      const identificationNode = async (state: AgentState): Promise<Partial<AgentState>> => {
        this.logger.log('[LangGraph - Identificación] Lead no identificado. Solicitando información de contacto.');
        
        const identPrompt = `
Eres el Sub-Agente de Registro del CRM. Tu único objetivo es obtener el nombre, correo y/o teléfono del cliente de forma cordial y natural para poder registrarlo en el CRM de la empresa antes de cotizar.

[INSTRUCCIÓN DE FLUJO]
- Si en el historial o último mensaje el cliente ya te proporcionó su nombre (y opcionalmente correo/teléfono), llama a la herramienta registerContact.
- Si te falta información básica (como el nombre), no llames a la herramienta. Escríbele un mensaje amable solicitando sus datos para poder dar de alta su cuenta y cotizar.

[HERRAMIENTA DISPONIBLE]
1. registerContact — Registra el contacto en el CRM.
{"thought": "...", "tool_name": "registerContact", "tool_input": {"nombre": "Juan Pérez", "correo": "juan@correo.com", "telefono": "5512345678"}}
2. final_answer — Responde al cliente de forma natural para pedirle los datos.
{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Mensaje para pedir datos"}}

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
          if (action.tool_name === 'registerContact') {
            return {
              nextAction: 'call_tool',
              toolCallName: 'registerContact',
              toolCallInput: action.tool_input,
            };
          } else {
            return {
              nextAction: 'respond',
              response: action.tool_input?.answer || 'Para darte una cotización formal, ¿me podrías proporcionar tu nombre completo, correo y teléfono?',
            };
          }
        } catch (e) {
          return {
            nextAction: 'respond',
            response: '¿Me podrías proporcionar tu nombre completo y correo para iniciar tu cotización en nuestro CRM?',
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

        // Obtener la información del cliente del CRM (compacta para optimizar tokens)
        let clientInfo: Record<string, any> = {};
        if (state.clientId) {
          const client = await this.clientsService.findOne(state.clientId);
          if (client) {
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

        // Mapeo de prompts de herramientas permitidas al subagente
        const ALL_TOOL_PROMPTS: Record<string, string> = {
          createOpportunity: `1. createOpportunity: Registra oportunidad.
Campos: nombreProyecto(str), descripcion(str), montoTotal(num|null — usa null o 0 para desarrollos a la medida), moneda("MXN"|"USD").
{"thought": "Crear oportunidad.", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "Proyecto A", "descripcion": "Interés en A", "montoTotal": null, "moneda": "MXN"}}`,

          modifyOpportunity: `2. modifyOpportunity: Edita oportunidad. Usa ID real.
Campos: id(UUID), nombreProyecto, descripcion, montoTotal, moneda, etapa. Omite sin cambio.
{"thought": "Modificar oportunidad.", "tool_name": "modifyOpportunity", "tool_input": {"id": "uuid-real", "montoTotal": 15000}}`,

          updateContact: `3. updateContact: Actualiza contacto vinculado.
Campos opcionales: nombre(str), correo(str), telefono(str). Envía solo cambios.
{"thought": "Actualizar correo.", "tool_name": "updateContact", "tool_input": {"correo": "cliente@correo.com"}}`,

          checkAvailability: `4. checkAvailability: Valida disponibilidad de asesor.
Campos: proposedDate(ISO 8601 UTC). Llama antes de crear actividad con horario.
{"thought": "Validar horario.", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-05T21:00:00.000Z"}}`,

          createActivity: `5. createActivity: Crea actividad/reunión. Llama solo si checkAvailability dio AVAILABLE.
Campos: activityText(str), date(ISO 8601 UTC), typeActivityId(num), opportunityId(UUID,opc), reminderTitle(opc), reminderDate(ISO 8601,opc).
{"thought": "Crear actividad.", "tool_name": "createActivity", "tool_input": {"activityText": "Demo", "date": "2026-07-05T21:00:00.000Z", "typeActivityId": 1}}`,

          createTicket: `6. createTicket: Registra ticket soporte.
Campos: title(str), description(str), priority(1=Bajo,2=Medio,3=Alto), category(str).
{"thought": "Registrar ticket.", "tool_name": "createTicket", "tool_input": {"title": "Error login", "description": "Falla acceso", "priority": 2, "category": "Soporte"}}`,

          search_product_specs: `7. search_product_specs: Busca en catálogo Cube/RAG. Llama ante dudas de compatibilidad, catálogo o precios.
Campos: query(str), productKey(str,opc).
{"thought": "Buscar producto.", "tool_name": "search_product_specs", "tool_input": {"query": "Red Magic"}}`
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
          } else {
            // Para otras tools: solo status + message + id si existe
            compactResult = { status: res.status };
            if (res.message) compactResult.message = res.message;
            if (res.id) compactResult.id = res.id;
          }
          toolExecutionText = `\n[TOOL: ${state.toolCallName}] ${JSON.stringify(compactResult)}`;
        }

        const prompt = `${systemPrompt}\n\n[HISTORIAL]\n${historyText}\n\n[CLIENTE] ${incomingContent}${toolExecutionText}\n\nJSON:`;

        let agentResponse = await this.callLLM(config, prompt);
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
              
              const merged = [
                ...cubeResults,
                ...ragResults.map(r => ({ content: (r.pageContent || '').substring(0, 300) }))
              ];

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
          
          if (!action.tool_name || action.tool_name === 'undefined') {
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
              this.logger.warn(`Sub-Agente '${state.route}' intentó usar una tool no permitida: '${action.tool_name}'`);
              // Si la tool no está permitida, cortamos el bucle respondiendo directamente lo que el agente pensaba decirle al cliente
              const fallback = action.tool_input?.answer || action.answer || `La herramienta '${action.tool_name}' no está disponible actualmente.`;
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
            case 'search_product_specs':
              validationResult = SearchProductSpecsSchema.safeParse(input);
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
          if (state.toolCallName === 'search_product_specs') {
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

          // Si registramos contacto, asociar de inmediato el clientId al estado
          let nextState: Partial<AgentState> = { toolCallResult: executionResult };
          if (state.toolCallName === 'registerContact' && executionResult.status === 'SUCCESS') {
            nextState.clientId = executionResult.clientId;
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

      workflow.addConditionalEdges(
        'routerNode',
        (state: AgentState) => {
          // Identificación dinámica: Si no está registrado en el CRM, obligar a identificación
          if (!state.clientId && state.route !== 'general') {
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
        (state: AgentState) => {
          if (state.clientId) {
            return 'subAgentNode'; // Ya registrado, pasa al subagente
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

      // Ejecutar el Grafo pasándole el estado inicial
      const finalState = await app.invoke({
        clientId: conversation.clientId || null,
        route: 'general',
        nextAction: null,
        toolCallName: null,
        toolCallInput: null,
        toolCallResult: null,
        response: null
      } as any);

      const agentReply = finalState.response || 'He procesado tu solicitud en el sistema. ¿Te puedo colaborar en algo más?';

      // Lanzar de forma asíncrona la actualización del resumen de la conversación en segundo plano
      this.updateConversationSummaryAsync(conversation, messages, incomingContent, agentReply).catch(err => {
        this.logger.error(`Error al iniciar actualización de resumen conversacional: ${err.message}`);
      });

      return agentReply;
    } catch (err) {
      this.logger.error('Error en el motor conversacional LangGraph:', err);
      return 'Lo siento, en este momento no puedo procesar tu solicitud de forma automática.';
    }
  }

  /**
   * Ejecuta la herramienta seleccionada por la IA interactuando con los servicios del CRM.
   */
  private async executeTool(name: string, input: any, conversation: Conversation, config: AiAgentConfig): Promise<any> {
    try {
      switch (name) {
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

          const opp = await this.opportunitiesService.create({
            nombre_proyecto: input.nombreProyecto,
            description: input.descripcion || 'Creado por Agente IA',
            monto_total: cleanMonto,
            moneda: input.moneda || Currency.USD,
            cliente_id: conversation.clientId || undefined,
            ejecutivo_id: conversation.assignedUserId || undefined,
            linea_negocio_id: 'default',
            tipo_entrega_id: 'default',
          } as any, userEntity);
          return { status: 'SUCCESS', message: 'Oportunidad creada con éxito', opportunityId: opp.id };
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
          let phone = input.telefono || null;
          
          const names = this.splitFullName(input.nombre);
          
          const client = await this.clientsService.create({
            nombre: names.nombre,
            apellido: names.apellido,
            correo: email,
            telefono: phone,
            ejecutivo_id: conversation.assignedUserId || undefined,
          } as any);

          conversation.clientId = client.id;
          conversation.clientName = `${client.nombre} ${client.apellido || ''}`.trim();
          await this.clientRepository.manager.save(Conversation, conversation);

          return { status: 'SUCCESS', message: 'Contacto registrado y vinculado', clientId: client.id };
        }

        case 'updateContact': {
          if (!conversation.clientId) {
            return { status: 'ERROR', message: 'No hay ningún contacto vinculado a esta conversación para actualizar. Regístralo primero.' };
          }
          
          const updateData: any = {};
          if (input.nombre) {
            const names = this.splitFullName(input.nombre);
            updateData.nombre = names.nombre;
            updateData.apellido = names.apellido;
          }
          if (input.correo !== undefined) updateData.correo = input.correo;
          if (input.telefono !== undefined) updateData.telefono = input.telefono;

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
   */
  private async callLLM(config: AiAgentConfig, prompt: string): Promise<string> {
    const provider = config.modelProvider;
    const model = config.modelName;

    const maxTokens = config.maxNewTokens || 2048;

    if (provider === 'openai') {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('API Key de OpenAI no configurada.');
      const endpoint = config.openaiEndpoint || null;
      const apiVersion = config.openaiApiVersion || null;
      return this.callOpenAI(model, apiKey, prompt, config.temperature, endpoint, apiVersion, maxTokens);
    } else if (provider === 'watsonx') {
      const apiKey = config.watsonxApiKey || process.env.WATSONX_API_KEY;
      const projectId = config.watsonxProjectId || process.env.WATSONX_PROJECT_ID;
      const region = config.watsonxRegion || process.env.WATSONX_REGION || 'us-south';
      if (!apiKey || !projectId) throw new Error('Credenciales de IBM WatsonX no configuradas.');
      return this.callWatsonx(model, apiKey, projectId, region, prompt, config.temperature, maxTokens);
    } else {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key de Gemini no configurada.');
      return this.callGemini(model, apiKey, prompt, config.temperature, maxTokens);
    }
  }

  /**
   * Llamada REST a Gemini
   */
  private async callGemini(model: string, apiKey: string, prompt: string, temperature: number, maxNewTokens = 2048): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxNewTokens,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de Gemini: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Log token usage
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;
    this.logger.log(`[Token Usage] Gemini - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);

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
        temperature: temperature,
        max_tokens: maxNewTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de ${isAzure ? 'Azure OpenAI' : 'OpenAI'}: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Log token usage
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    this.logger.log(`[Token Usage] ${isAzure ? 'Azure ' : ''}OpenAI - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);

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
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${iamToken}`,
      },
      body: JSON.stringify({
        model_id: model,
        input: prompt,
        project_id: projectId,
        parameters: {
          max_new_tokens: maxNewTokens,
          temperature: temperature,
          decoding_method: 'sample',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de WatsonX: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const rawText = data.results?.[0]?.generated_text || '';

    // Log token usage
    const inputTokens = data.results?.[0]?.input_token_count || 0;
    const outputTokens = data.results?.[0]?.generated_token_count || 0;
    const totalTokens = inputTokens + outputTokens;
    this.logger.log(`[Token Usage] WatsonX - Entrada: ${inputTokens}, Salida: ${outputTokens}, Total: ${totalTokens}`);

    return rawText.trim();
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
   * Genera un token JWT de HS256 firmado con la secret de Cube.dev para conectarse con la REST API.
   */
  private generateCubeToken(): string {
    const secret = 'crmtibs_secret_key_2026_xyz';
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) };
    
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
      const token = this.generateCubeToken();
      // Extraer términos claves para la búsqueda (ignorar palabras comunes no sustantivas)
      const cleanKeyword = queryText
        .replace(/^(dame|quiero|informacion|del|producto|sobre|que|empiezan|con|modelo|especificaciones|detalles|buscar|el|la|disponibilidad|catalogo|precios|precio|costo|cotizacion|comprar|venta|adquirir|fichas|ficha|manual|manuales|de)\s+/gi, '')
        .trim();

      const filters: any[] = [
        {
          member: 'Productos.status',
          operator: 'equals',
          values: ['true']
        }
      ];

      if (cleanKeyword.length >= 2) {
        filters.push({
          member: 'Productos.nombre',
          operator: 'contains',
          values: [cleanKeyword.toLowerCase()]
        });
      }

      const response = await fetch('http://localhost:4000/cubejs-api/v1/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
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
          }
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
    } catch (err) {
      this.logger.error(`Error en la sincronización retrospectiva de fichas RAG: ${err.message}`);
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
}
