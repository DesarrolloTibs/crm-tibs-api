import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ActivitiesService } from '../Activities/activities.service';
import { RemindersService } from '../reminders/reminders.service';
import { ClientsService } from '../clients/clients.service';
import { TicketsService } from '../tickets/tickets.service';
import { Currency } from '../opportunities/entities/opportunity.entity';

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
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly remindersService: RemindersService,
    private readonly clientsService: ClientsService,
    private readonly ticketsService: TicketsService,
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

      // Si el context de config contiene el prompt comercial anterior o el simple del enrutador, lo reemplazamos con el del Enrutador Principal robustecido
      if (!config.context || 
          config.context.includes('el agente conversacional del área comercial') || 
          config.context.includes('todo el portafolio comercial de TIBS') || 
          config.context.includes('Identidad y propósito') ||
          !config.context.includes('Ecosistema de IA de TIBS')) {
        config.context = `# Prompt del Agente Principal (Enrutador) — Billy de TIBS

Eres el Agente Principal (Enrutador) del ecosistema de IA de TIBS (https://tibs.com.mx/). Tu única tarea es clasificar el último mensaje del cliente en el contexto de la conversación histórica para redirigir el chat al sub-agente especializado correcto.

## Sub-Agentes Disponibles en el Ecosistema:
*   **comercial:** Úsalo cuando el cliente pregunte precios, cotizaciones, información detallada de productos (Billy IDP, Billy Vision, Billy S&S CRM, Inteligencia de Negocios BI o Desarrollos a la medida), o demuestre intención de contratar o comprar un servicio.
*   **seguimiento:** Úsalo cuando el cliente solicite agendar demostraciones, llamadas, citas, reuniones, o confirme días y horarios de disponibilidad para un seguimiento comercial.
*   **soporte_atencion:** Úsalo cuando el cliente tenga quejas, problemas con facturación, reportes de errores en el sistema, caídas del servicio o requiera soporte técnico sobre herramientas ya contratadas.
*   **general:** Úsalo cuando el cliente salude, se despida, agradezca, platique de forma informal (small talk), haga preguntas directas sobre TIBS (sitio web, ubicación) o si el mensaje no encaja en las intenciones de los otros sub-agentes.

## Reglas Críticas de Enrutamiento:
1. **Historial de Conversación:** Si el cliente venía hablando de un producto (intención comercial) pero en su último mensaje dice "Agenda la cita para mañana a las 3", debes clasificarlo en "seguimiento" porque su intención inmediata ha transicionado a agendar.
2. **Pequeñas Respuestas de Seguimiento:** Mensajes cortos como "Sí, a las 4pm me parece bien" o "No, a esa hora no puedo" dentro de un contexto de agendamiento corresponden a la ruta "seguimiento".
3. **Reportes y Quejas:** Si el cliente dice "No sirve el sistema" o "Tengo problemas para entrar", redirígelo de inmediato a "soporte_atencion".
4. **Respuestas de Pequeña Plática / Saludo:** Saludos simples como "Hola" o despedidas como "Gracias, hasta luego" deben ir a "general".

## Formato Obligatorio de Salida:
Debes responder ÚNICAMENTE con un objeto JSON válido y limpio. Sin bloques de código markdown (\`\`\`json), sin texto explicativo antes o después.
Estructura del JSON:
{
  "thought": "Análisis de la intención del último mensaje del usuario en base al historial y por qué se selecciona esta ruta.",
  "route": "key_del_subagente"
}

## Ejemplos de Clasificación:
*   Cliente dice: "Hola, buenos días."
    {"thought": "El usuario saluda al bot, no hay intención comercial, de soporte ni agendamiento aún.", "route": "general"}
*   Cliente dice: "Me interesa una demo de Billy IDP, cuánto cuesta?"
    {"thought": "El usuario pregunta precios y detalles técnicos de un producto, es de naturaleza de ventas.", "route": "comercial"}
*   Cliente dice: "Mañana a las 2 pm está perfecto para la llamada."
    {"thought": "El usuario confirma un horario de cita para una llamada comercial en el historial, corresponde a agendar seguimiento.", "route": "seguimiento"}
*   Cliente dice: "No puedo subir mis facturas al validador de IDP, me marca error 500."
    {"thought": "El usuario reporta una falla técnica con una herramienta en producción, requiere soporte técnico.", "route": "soporte_atencion"}`;
        await this.aiAgentConfigRepository.save(config);
        this.logger.log('Se actualizó el prompt principal config.context con las directivas de enrutamiento robustas.');
      }

      const count = await this.aiSubAgentRepository.count();
      if (count > 0) {
        return;
      }

      this.logger.log('Iniciando migración única para desglose de contexto en sub-agentes...');
      const currentContext = config.context || '';

      const baseCommonPrompt = `Eres un asistente conversacional de inteligencia artificial.
Atiendes a los usuarios a través de los canales de chat integrados.
Tono y estilo: Profesional, cercano, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs o errores de sistema al cliente.
Idioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).
Privacidad: Protege la información personal. No compartas datos sensibles de un contacto con otro.
Redirección: Deriva con un asesor humano si hay inconformidades graves, quejas o si el cliente lo solicita explícitamente, creando una actividad con recordatorio.`;

      const comercialInstructions = `[INSTRUCCIONES COMERCIALES]
- Identifica el interés comercial del cliente, califica sus requerimientos y registra oportunidades en el CRM.
- Responde de forma clara sobre nuestro portafolio de productos y servicios.
- Si el cliente solicita cotización, información de precios o muestra interés en adquirir un servicio, crea una Oportunidad Comercial.
- Campos para oportunidad: nombreProyecto (debe ser descriptivo del producto/proyecto), descripcion (detalle claro de la necesidad), montoTotal (0 si no se especifica), moneda (MXN o USD por defecto).
- Si hay una oportunidad abierta del mismo producto en etapa activa, actualízala con modifyOpportunity en lugar de crear una nueva.
- Asegúrate de vincular los datos del contacto. No crees oportunidades duplicadas.`;

      const seguimientoInstructions = `[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]
- Tu objetivo principal es agendar citas, llamadas de seguimiento, demostraciones o reuniones entre el cliente y el asesor asignado.
- Consulta disponibilidad usando checkAvailability antes de agendar.
- Si está AVAILABLE, procede a crear la actividad con createActivity.
- Si está UNAVAILABLE, sugiere al cliente los slots propuestos en 'suggestedSlots'.
- Si el cliente da fecha pero no hora, pregunta la hora. Si da hora pero no fecha, pregunta el día. Si da ambos, agenda directamente.
- Agrega recordatorios ligados a la actividad de forma proactiva. Si no especifica hora de recordatorio, el sistema la calcula con la antelación configurada.
- Valida que la oportunidad o actividad de seguimiento quede correctamente relacionada con el cliente.
- Todo dato comercial o cita debe ser puramente informativo, libre de detalles técnicos (como UUIDs del sistema).`;

      const soporteInstructions = `[INSTRUCCIONES DE SOPORTE Y ATENCIÓN (HELPDESK)]
- Atiende quejas, incidencias y dudas de soporte técnico.
- Si el cliente reporta una falla o requiere ayuda especializada con un servicio existente, genera un ticket de soporte técnico en el CRM con createTicket.
- Campos para ticket: title (título resumido del problema), description (detalle completo de la falla), priority (1 = Bajo, 2 = Medio, 3 = Alto), category (ej. "Soporte Técnico", "Duda", "Facturación").
- Informa al cliente que su reporte ha sido registrado de forma exitosa y que el equipo especializado le dará seguimiento.
- En caso de fallas graves de sistema o de redirección, indícale de forma clara que derivas su caso a un asesor humano.`;

      const generalInstructions = `[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde de forma amable, educada y profesional a saludos, despedidas, agradecimientos o preguntas generales sobre la empresa.
- No intentes llamar a ninguna herramienta si el cliente solo te saluda o hace plática informal.`;

      const subAgentsToInsert = [
        {
          key: 'comercial',
          name: 'Sub-Agente Comercial',
          description: 'Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.',
          context: `${baseCommonPrompt}\n\n${comercialInstructions}\n\n[CONTEXTO ORIGINAL DE NEGOCIO]\n${currentContext}`,
          tools: ['registerContact', 'updateContact', 'createOpportunity', 'modifyOpportunity'],
          isActive: true,
        },
        {
          key: 'seguimiento',
          name: 'Sub-Agente de Seguimiento',
          description: 'Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de asesores y crear recordatorios.',
          context: `${baseCommonPrompt}\n\n${seguimientoInstructions}\n\n[CONTEXTO ORIGINAL DE NEGOCIO]\n${currentContext}`,
          tools: ['registerContact', 'updateContact', 'checkAvailability', 'createActivity'],
          isActive: true,
        },
        {
          key: 'soporte_atencion',
          name: 'Sub-Agente de Soporte',
          description: 'Atiende incidencias de soporte, quejas, dudas técnicas y genera tickets de soporte en la mesa de ayuda (Helpdesk).',
          context: `${baseCommonPrompt}\n\n${soporteInstructions}\n\n[CONTEXTO ORIGINAL DE NEGOCIO]\n${currentContext}`,
          tools: ['registerContact', 'updateContact', 'createTicket'],
          isActive: true,
        },
        {
          key: 'general',
          name: 'Sub-Agente Conversacional',
          description: 'Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales sin uso de herramientas.',
          context: `${baseCommonPrompt}\n\n${generalInstructions}\n\n[CONTEXTO ORIGINAL DE NEGOCIO]\n${currentContext}`,
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
  async processIncomingMessage(conversation: Conversation, incomingContent: string): Promise<string> {
    const config = await this.getOrInitConfig();
    if (!config.isActive) {
      return '';
    }

    try {
      // 1. Obtener datos actuales del cliente en el CRM
      let clientInfo = {};
      if (conversation.clientId) {
        const client = await this.clientsService.findOne(conversation.clientId);
        if (client) {
          const opportunities = await this.opportunitiesService.findByClientId(client.id);
          clientInfo = {
            id: client.id,
            nombre: client.nombre,
            apellido: client.apellido || '',
            correo: client.correo || null,
            telefono: client.telefono || null,
            oportunidades: opportunities.map(opp => ({
              id: opp.id,
              nombreProyecto: opp.nombre_proyecto,
              montoTotal: opp.monto_total,
              moneda: opp.moneda,
              etapa: opp.stage?.strname || 'Sin etapa',
            })),
          };
        }
      }

      // 2. Obtener lista de tipos de actividad disponibles
      const activityTypes = await this.activitiesService.findAllTypes();
      const activityTypesText = activityTypes
        .map(t => `- ID ${t.id}: ${t.strname}`)
        .join('\n');

      // 3. Compilar el historial de conversación (excluyendo logs de sistema)
      const messages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });
      const historyText = messages
        .filter(m => m.sender !== 'system')
        .map(m => `${m.sender === 'contact' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n');

      // 4. Inyectar fecha y hora actual para resolución de fechas relativas
      const now = new Date();
      const mexicoCityISO = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const diaActualNombre = diasSemana[mexicoCityISO.getDay()];
      const diaActualNum = mexicoCityISO.getDate();
      const mesActualNombre = meses[mexicoCityISO.getMonth()];
      const anioActual = mexicoCityISO.getFullYear();
      const horaActual = mexicoCityISO.toTimeString().slice(0, 5); // HH:MM

      const manana = new Date(mexicoCityISO); manana.setDate(manana.getDate() + 1);
      const pasadoManana = new Date(mexicoCityISO); pasadoManana.setDate(pasadoManana.getDate() + 2);
      const formatDate = (d: Date) => `${diasSemana[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;

      const fechaContexto = [
        `Hoy: ${diaActualNombre} ${diaActualNum} de ${mesActualNombre} de ${anioActual} — Hora actual: ${horaActual} (hora Ciudad de México)`,
        `Mañana: ${formatDate(manana)}`,
        `Pasado mañana: ${formatDate(pasadoManana)}`,
      ].join('\n');

      // 5. ENRUTAMIENTO DINÁMICO: Consultar sub-agentes activos de la BD
      const subAgents = await this.aiSubAgentRepository.find({ where: { isActive: true } });
      const subAgentsDescriptionText = subAgents
        .map(sa => `- Clave: "${sa.key}" - Descripción: "${sa.description}"`)
        .join('\n');

      const routerPrompt = `
${config.context || 'Eres el Agente Principal (Enrutador) de TIBS.'}

[SUB-AGENTES DISPONIBLES EN EL SISTEMA]
${subAgentsDescriptionText}
- Clave: "general" - Descripción: "Úsala si el mensaje del cliente es un saludo, despedida, agradecimiento, charla informal (small talk), preguntas generales cortas que no requieran herramientas, o si ninguna de las otras claves es aplicable."

[REGLA DE RESPUESTA OBLIGATORIA]
Responde ÚNICAMENTE con un objeto JSON por turno. Sin texto antes o después.
Estructura de respuesta:
{"thought": "...", "route": "CLAVE_ELEGIDA"}

[HISTORIAL DE CONVERSACIÓN]
${historyText}

[ÚLTIMO MENSAJE DEL CLIENTE]
Cliente: ${incomingContent}

Genera la clasificación en formato JSON:
{"thought": "`;

      let routerResponse = await this.callLLM(config, routerPrompt);
      routerResponse = this.cleanJsonOutput(routerResponse);

      let selectedRoute = 'general';
      try {
        const parsedRouter = JSON.parse(routerResponse);
        selectedRoute = parsedRouter.route || 'general';
        this.logger.log(`[Agente Principal Router] Clasificado en la ruta: '${selectedRoute}' | Razonamiento: ${parsedRouter.thought}`);
      } catch (e) {
        this.logger.error(`Error parseando decisión del enrutador: ${routerResponse}`);
      }

      // Obtener el sub-agente activo
      let subAgent = subAgents.find(sa => sa.key === selectedRoute);
      if (!subAgent) {
        subAgent = subAgents.find(sa => sa.key === 'general');
      }

      // 6. MAPEO DE HERRAMIENTAS ASIGNADAS AL SUB-AGENTE
      const ALL_TOOL_PROMPTS: Record<string, string> = {
        createOpportunity: `1. createOpportunity — Registra una nueva oportunidad comercial.
Campos: nombreProyecto (string), descripcion (string), montoTotal (number, usa 0 si no se conoce), moneda (string, "MXN" por defecto).
{"thought": "...", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "...", "descripcion": "...", "montoTotal": 0, "moneda": "MXN"}}`,

        modifyOpportunity: `2. modifyOpportunity — Edita una oportunidad existente. Usa el ID real del contacto, nunca un placeholder.
Campos modificables: nombreProyecto, descripcion, montoTotal, moneda, etapa. Omite los que no cambien.
{"thought": "...", "tool_name": "modifyOpportunity", "tool_input": {"id": "ID_REAL", "nombreProyecto": "Nuevo nombre"}}`,

        registerContact: `3. registerContact — Vincula un contacto al chat solo si no existe uno asociado.
Campos: nombre (string), correo (string|null), telefono (string|null).
{"thought": "...", "tool_name": "registerContact", "tool_input": {"nombre": "...", "correo": null, "telefono": null}}`,

        updateContact: `4. updateContact — Actualiza datos del contacto ya vinculado al chat.
Campos opcionales: nombre, correo, telefono. Envía solo los que cambian.
{"thought": "...", "tool_name": "updateContact", "tool_input": {"correo": "nuevo@correo.com"}}`,

        checkAvailability: `5. checkAvailability — Verifica si el asesor asignado tiene disponibilidad en una fecha/hora.
Campos: proposedDate (string ISO 8601 UTC). Llama ANTES de crear cualquier actividad con horario específico.
Respuesta AVAILABLE → procede con createActivity usando esa misma fecha.
Respuesta UNAVAILABLE → presenta los horarios alternativos en 'suggestedSlots' al cliente y espera su elección. Llama de nuevo a checkAvailability con el slot elegido antes de crear la actividad.
{"thought": "...", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-05T21:00:00.000Z"}}`,

        createActivity: `6. createActivity — Crea una actividad (y opcionalmente un recordatorio). Úsala SOLO después de checkAvailability con status AVAILABLE cuando la actividad requiera horario.
Campos: activityText (string), date (string ISO 8601 UTC), typeActivityId (number, del listado de tipos), opportunityId (string UUID, opcional), reminderTitle (string, opcional), reminderDate (string ISO 8601 UTC, opcional — si se omite el backend calcula automáticamente con ${config.reminderOffsetMinutes} min de antelación).
Construcción del campo 'date': convierte la hora local del cliente a UTC usando el offset del bloque [FECHA Y HORA ACTUAL]. Si falta la hora, NO ejecutes esta herramienta — primero pídela al cliente.
{"thought": "...", "tool_name": "createActivity", "tool_input": {"activityText": "...", "date": "2026-07-05T21:00:00.000Z", "typeActivityId": 1, "reminderTitle": "..."}}`,

        createTicket: `7. createTicket — Registra un ticket de soporte técnico en la mesa de ayuda.
Campos: title (string), description (string), priority (number: 1=Bajo, 2=Medio, 3=Alto), category (string: ej. "Soporte Técnico", "Facturación", "Duda", etc.).
{"thought": "...", "tool_name": "createTicket", "tool_input": {"title": "...", "description": "...", "priority": 1, "category": "Soporte Técnico"}}`
      };

      const allowedTools = subAgent?.tools || [];
      const toolsText = allowedTools
        .map(toolKey => ALL_TOOL_PROMPTS[toolKey])
        .filter(Boolean)
        .join('\n\n');

      const finalAnswerPrompt = `8. final_answer — Envía una respuesta en lenguaje natural al cliente. Es la única acción que genera un mensaje visible.
{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Mensaje para el cliente"}}`;

      const toolsSectionText = toolsText ? `${toolsText}\n\n${finalAnswerPrompt}` : finalAnswerPrompt;

      // 7. CONSTRUIR EL PROMPT PARA EL SUB-AGENTE
      const systemPrompt = `
[INSTRUCCIONES DEL SUB-AGENTE ACTIVO: ${subAgent?.name || 'General'}]
${subAgent?.context || ''}

[FECHA Y HORA ACTUAL — REFERENCIA PARA FECHAS RELATIVAS]
${fechaContexto}

[INFORMACIÓN ACTUAL DEL CONTACTO EN EL CRM]
${JSON.stringify(clientInfo, null, 2)}

[TIPOS DE ACTIVIDAD DISPONIBLES]
${activityTypesText}

[TIEMPO DE ANTELACIÓN PARA RECORDATORIOS]
${config.reminderOffsetMinutes} minutos.

═══════════════════════════════════════════════════════════════════
HERRAMIENTAS DISPONIBLES — INSTRUCCIONES DE USO:
Responde SIEMPRE con un único objeto JSON por turno. Sin texto adicional antes o después.

${toolsSectionText}

REGLAS OBLIGATORIAS:
- Un solo JSON por turno. Sin texto fuera del JSON.
- Cierra correctamente todas las llaves del objeto.
- Nunca uses IDs placeholder (como "UUID_OPORTUNIDAD") — usa siempre el ID real del contexto.
- Nunca confirmes al cliente una acción que el sistema marcó como ERROR.
- Si el cliente ya dio una expresión de fecha válida, NUNCA pidas la fecha de nuevo — solo la hora si falta.
- Llama a checkAvailability antes de createActivity cuando la actividad tenga un horario específico.
═══════════════════════════════════════════════════════════════════`;

      const prompt = `${systemPrompt}\n\n[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n\n[ÚLTIMO MENSAJE DEL CLIENTE]\nCliente: ${incomingContent}\n\nGenera el siguiente paso en formato JSON:\n{"thought": "`;

      let agentResponse = await this.callLLM(config, prompt);
      agentResponse = this.cleanJsonOutput(agentResponse);

      let loopCount = 0;
      const maxLoops = 5;

      while (loopCount < maxLoops) {
        let action: any;
        try {
          action = JSON.parse(agentResponse);
        } catch (e) {
          this.logger.error(`Error parseando respuesta JSON de la IA: ${agentResponse}`);
          return 'Lo siento, tuve un problema interno de procesamiento. ¿Podrías indicarme de nuevo tu solicitud?';
        }

        if (action.tool_name === 'final_answer') {
          return action.tool_input?.answer || '';
        }

        // SEGURIDAD: Validar que el sub-agente tenga permitido ejecutar esta herramienta
        if (!allowedTools.includes(action.tool_name)) {
          this.logger.warn(`El sub-agente '${subAgent?.key}' intentó ejecutar la herramienta '${action.tool_name}' no permitida.`);
          const toolErrorResult = { status: 'ERROR', message: `La herramienta '${action.tool_name}' no está disponible para este sub-agente.` };
          
          const nextPrompt = `${systemPrompt}\n\n[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n\n[ÚLTIMO MENSAJE DEL CLIENTE]\nCliente: ${incomingContent}\n\n[EJECUCIÓN DE HERRAMIENTA]\nHerramienta ejecutada: ${action.tool_name}\nResultado de herramienta: ${JSON.stringify(toolErrorResult)}\n\nGenera el siguiente paso en formato JSON (ej. final_answer para responderle al cliente):\n{"thought": "`;
          agentResponse = await this.callLLM(config, nextPrompt);
          agentResponse = this.cleanJsonOutput(agentResponse);
          loopCount++;
          continue;
        }

        this.logger.log(`Sub-Agente '${subAgent?.key}' ejecutando herramienta: ${action.tool_name}`);
        const toolResult = await this.executeTool(action.tool_name, action.tool_input, conversation, config);
        this.logger.log(`Resultado de la herramienta: ${JSON.stringify(toolResult)}`);

        const nextPrompt = `${systemPrompt}\n\n[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n\n[ÚLTIMO MENSAJE DEL CLIENTE]\nCliente: ${incomingContent}\n\n[EJECUCIÓN DE HERRAMIENTA]\nHerramienta ejecutada: ${action.tool_name}\nResultado de herramienta: ${JSON.stringify(toolResult)}\n\nGenera el siguiente paso en formato JSON (ej. final_answer para responderle al cliente):\n{"thought": "`;
        agentResponse = await this.callLLM(config, nextPrompt);
        agentResponse = this.cleanJsonOutput(agentResponse);

        loopCount++;
      }

      try {
        const parsed = JSON.parse(agentResponse);
        if (parsed.tool_name === 'final_answer') return parsed.tool_input?.answer || '';
      } catch (e) {}

      return 'He procesado tu solicitud en el CRM con éxito. ¿Hay algo más en lo que te pueda colaborar?';
    } catch (err) {
      this.logger.error('Error procesando respuesta del agente IA:', err);
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
          const opp = await this.opportunitiesService.create({
            nombre_proyecto: input.nombreProyecto,
            description: input.descripcion || 'Creado por Agente IA',
            monto_total: input.montoTotal || 0,
            moneda: input.moneda || Currency.USD,
            cliente_id: conversation.clientId || undefined,
            ejecutivo_id: conversation.assignedUserId || undefined,
            linea_negocio_id: 'default',
            tipo_entrega_id: 'default',
          } as any, userEntity);
          return { status: 'SUCCESS', message: 'Oportunidad creada con éxito', opportunityId: opp.id };
        }

        case 'modifyOpportunity': {
          const opp = await this.opportunitiesService.update(input.id, {
            nombre_proyecto: input.nombreProyecto,
            description: input.descripcion,
            monto_total: input.montoTotal,
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
            opportunityId: input.opportunityId || null,
            clientId: conversation.clientId || null,
            reminder: input.reminderTitle ? {
              title: input.reminderTitle,
              date: remDate
            } : undefined
          } as any, userEntity);

          return { status: 'SUCCESS', message: 'Actividad y recordatorio programados', activityId: activity.id };
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

    if (provider === 'openai') {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('API Key de OpenAI no configurada.');
      const endpoint = config.openaiEndpoint || null;
      const apiVersion = config.openaiApiVersion || null;
      return this.callOpenAI(model, apiKey, prompt, config.temperature, endpoint, apiVersion);
    } else if (provider === 'watsonx') {
      const apiKey = config.watsonxApiKey || process.env.WATSONX_API_KEY;
      const projectId = config.watsonxProjectId || process.env.WATSONX_PROJECT_ID;
      const region = config.watsonxRegion || process.env.WATSONX_REGION || 'us-south';
      if (!apiKey || !projectId) throw new Error('Credenciales de IBM WatsonX no configuradas.');
      return this.callWatsonx(model, apiKey, projectId, region, prompt, config.temperature);
    } else {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key de Gemini no configurada.');
      return this.callGemini(model, apiKey, prompt, config.temperature);
    }
  }

  /**
   * Llamada REST a Gemini
   */
  private async callGemini(model: string, apiKey: string, prompt: string, temperature: number): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 1024,
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
        max_tokens: 1024,
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
  private async callWatsonx(model: string, apiKey: string, projectId: string, region: string, prompt: string, temperature: number): Promise<string> {
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

    const apiUrl = `https://${region}.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29`;
    
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
          max_new_tokens: 1024,
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
      clean = `{"thought": "Generando respuesta", ${clean}`;
    }

    if (clean.includes('```json')) {
      clean = clean.replace(/```json/gi, '');
      clean = clean.replace(/```/gi, '');
    }

    let openBraces = (clean.match(/\{/g) || []).length;
    let closeBraces = (clean.match(/\}/g) || []).length;
    while (openBraces > closeBraces) {
      clean += '}';
      closeBraces++;
    }

    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace !== -1) {
      clean = clean.substring(0, lastBrace + 1);
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
}
