import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ActivitiesService } from '../Activities/activities.service';
import { RemindersService } from '../reminders/reminders.service';
import { ClientsService } from '../clients/clients.service';
import { Currency } from '../opportunities/entities/opportunity.entity';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger('AiAgentService');

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly remindersService: RemindersService,
    private readonly clientsService: ClientsService,
  ) {}

  /**
   * Obtiene la configuración activa del Agente de IA. Si no existe, crea una por defecto.
   */
  async getOrInitConfig(): Promise<AiAgentConfig> {
    let config = await this.aiAgentConfigRepository.findOne({ where: {} });
    if (!config) {
      config = this.aiAgentConfigRepository.create({
        isActive: true,
        context: `Configura aquí el contexto y las instrucciones de comportamiento de tu agente. Define su identidad, los productos o servicios que ofrece, el tono de comunicación y los criterios para gestionar contactos, oportunidades y actividades en el CRM.

Este campo es completamente personalizable desde el panel de configuración.`,
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

      // 2. Obtener lista de tipos de actividad disponibles para guiar a la IA
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
      // Zona horaria de México (UTC-6 en invierno, UTC-5 en verano — se calcula dinámicamente)
      const mexicoCityISO = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const diaActualNombre = diasSemana[mexicoCityISO.getDay()];
      const diaActualNum = mexicoCityISO.getDate();
      const mesActualNombre = meses[mexicoCityISO.getMonth()];
      const anioActual = mexicoCityISO.getFullYear();
      const horaActual = mexicoCityISO.toTimeString().slice(0, 5); // HH:MM

      // Calcular fechas clave relativas
      const manana = new Date(mexicoCityISO); manana.setDate(manana.getDate() + 1);
      const pasadoManana = new Date(mexicoCityISO); pasadoManana.setDate(pasadoManana.getDate() + 2);
      const formatDate = (d: Date) => `${diasSemana[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;

      const fechaContexto = [
        `Hoy: ${diaActualNombre} ${diaActualNum} de ${mesActualNombre} de ${anioActual} — Hora actual: ${horaActual} (hora Ciudad de México)`,
        `Mañana: ${formatDate(manana)}`,
        `Pasado mañana: ${formatDate(pasadoManana)}`,
      ].join('\n');

      // 5. Construir el Prompt del Sistema
      const systemPrompt = `
[INSTRUCCIONES DEL AGENTE]
${config.context || ''}

[FECHA Y HORA ACTUAL — REFERENCIA PARA FECHAS RELATIVAS]
${fechaContexto}
Usa este bloque para resolver expresiones como "hoy", "mañana", "pasado mañana", "el lunes", "la próxima semana", "en X días". Si el cliente ya dio fecha, NO la vuelvas a pedir — solo solicita la hora si falta. Si tiene ambas, procede directamente.

[INFORMACIÓN ACTUAL DEL CONTACTO EN EL CRM]
${JSON.stringify(clientInfo, null, 2)}

[TIPOS DE ACTIVIDAD DISPONIBLES]
${activityTypesText}

[TIEMPO DE ANTELACIÓN PARA RECORDATORIOS]
${config.reminderOffsetMinutes} minutos.

═══════════════════════════════════════════════════════════════════
HERRAMIENTAS DISPONIBLES — INSTRUCCIONES DE USO:
Responde SIEMPRE con un único objeto JSON por turno. Sin texto adicional antes o después.

1. createOpportunity — Registra una nueva oportunidad comercial.
Campos: nombreProyecto (string), descripcion (string), montoTotal (number, usa 0 si no se conoce), moneda (string, "MXN" por defecto).
{"thought": "...", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "...", "descripcion": "...", "montoTotal": 0, "moneda": "MXN"}}

2. modifyOpportunity — Edita una oportunidad existente. Usa el ID real del contacto, nunca un placeholder.
Campos modificables: nombreProyecto, descripcion, montoTotal, moneda, etapa. Omite los que no cambien.
{"thought": "...", "tool_name": "modifyOpportunity", "tool_input": {"id": "ID_REAL", "nombreProyecto": "Nuevo nombre"}}

3. registerContact — Vincula un contacto al chat solo si no existe uno asociado.
Campos: nombre (string), correo (string|null), telefono (string|null).
{"thought": "...", "tool_name": "registerContact", "tool_input": {"nombre": "...", "correo": null, "telefono": null}}

4. updateContact — Actualiza datos del contacto ya vinculado al chat.
Campos opcionales: nombre, correo, telefono. Envía solo los que cambian.
{"thought": "...", "tool_name": "updateContact", "tool_input": {"correo": "nuevo@correo.com"}}

5. checkAvailability — Verifica si el asesor asignado tiene disponibilidad en una fecha/hora.
Campos: proposedDate (string ISO 8601 UTC). Llama ANTES de crear cualquier actividad con horario específico.
Respuesta AVAILABLE → procede con createActivity usando esa misma fecha.
Respuesta UNAVAILABLE → presenta los horarios alternativos en 'suggestedSlots' al cliente y espera su elección. Llama de nuevo a checkAvailability con el slot elegido antes de crear la actividad.
{"thought": "...", "tool_name": "checkAvailability", "tool_input": {"proposedDate": "2026-07-05T21:00:00.000Z"}}

6. createActivity — Crea una actividad (y opcionalmente un recordatorio). Úsala SOLO después de checkAvailability con status AVAILABLE cuando la actividad requiera horario.
Campos: activityText (string), date (string ISO 8601 UTC), typeActivityId (number, del listado de tipos), opportunityId (string UUID, opcional), reminderTitle (string, opcional), reminderDate (string ISO 8601 UTC, opcional — si se omite el backend calcula automáticamente con ${config.reminderOffsetMinutes} min de antelación).
Construcción del campo 'date': convierte la hora local del cliente a UTC usando el offset del bloque [FECHA Y HORA ACTUAL]. Si falta la hora, NO ejecutes esta herramienta — primero pídela al cliente.
{"thought": "...", "tool_name": "createActivity", "tool_input": {"activityText": "...", "date": "2026-07-05T21:00:00.000Z", "typeActivityId": 1, "reminderTitle": "..."}}

7. final_answer — Envía una respuesta en lenguaje natural al cliente. Es la única acción que genera un mensaje visible.
{"thought": "...", "tool_name": "final_answer", "tool_input": {"answer": "Mensaje para el cliente"}}

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

      // Limpiar respuesta en caso de alucinaciones
      agentResponse = this.cleanJsonOutput(agentResponse);

      let loopCount = 0;
      const maxLoops = 5; // Aumentado para soportar: checkAvailability → createActivity → final_answer

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

        this.logger.log(`Agente IA ejecutando herramienta: ${action.tool_name}`);
        const toolResult = await this.executeTool(action.tool_name, action.tool_input, conversation, config);
        this.logger.log(`Resultado de la herramienta: ${JSON.stringify(toolResult)}`);

        // Enviar el resultado de la herramienta de vuelta al LLM para la siguiente decisión
        const nextPrompt = `${systemPrompt}\n\n[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n\n[ÚLTIMO MENSAJE DEL CLIENTE]\nCliente: ${incomingContent}\n\n[EJECUCIÓN DE HERRAMIENTA]\nHerramienta ejecutada: ${action.tool_name}\nResultado de herramienta: ${JSON.stringify(toolResult)}\n\nGenera el siguiente paso en formato JSON (ej. final_answer para responderle al cliente):\n{"thought": "`;
        agentResponse = await this.callLLM(config, nextPrompt);
        agentResponse = this.cleanJsonOutput(agentResponse);

        loopCount++;
      }

      // Si excede el loop, tratar de extraer texto o dar fallback
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
            linea_negocio_id: 'default', // Será resuelto por el backend
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

          // Vincular a la conversación
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

          // Actualizar nombre en conversación
          conversation.clientName = `${updated.nombre} ${updated.apellido || ''}`.trim();
          await this.clientRepository.manager.save(Conversation, conversation);

          return { status: 'SUCCESS', message: 'Contacto actualizado en el CRM', client: { id: updated.id, nombre: updated.nombre, apellido: updated.apellido, correo: updated.correo, telefono: updated.telefono } };
        }

        case 'createActivity': {
          const userEntity = conversation.assignedUserId ? { id: conversation.assignedUserId } as User : { id: 'system' } as User;
          
          let remDate = input.reminderDate;
          if (input.reminderTitle && !remDate) {
            // Calcular fecha restando offset
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

        case 'checkAvailability': {
          const proposedDate = new Date(input.proposedDate);
          if (isNaN(proposedDate.getTime())) {
            return { status: 'ERROR', message: 'Fecha propuesta inválida. Envía una fecha ISO 8601 válida.' };
          }

          const advisorId = conversation.assignedUserId;
          if (!advisorId) {
            return { status: 'AVAILABLE', available: true, message: 'Sin asesor asignado — el horario está disponible.' };
          }

          // Consultar todas las actividades del asesor en el mismo día UTC
          const dayStart = new Date(proposedDate);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(proposedDate);
          dayEnd.setUTCHours(23, 59, 59, 999);

          const dayActivities = await this.activitiesService.findByUserAndDate(advisorId, dayStart, dayEnd);

          // Verificar si hay conflicto: otra actividad dentro de una ventana de 1 hora
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

          // Calcular offset de timezone dinámicamente (America/Mexico_City)
          const tzOffset = this.getMexicoCityUTCOffset(proposedDate); // ej. -6

          // Horario laboral 8:00-18:00 hora local → convertido a UTC
          const BIZ_START_LOCAL = 8;  // 8am
          const BIZ_END_LOCAL = 18;   // 6pm (la última cita puede empezar a las 17:00)
          const businessStartUTC = BIZ_START_LOCAL - tzOffset; // ej. 8-(-6)=14
          const businessEndUTC = BIZ_END_LOCAL - tzOffset;     // ej. 18-(-6)=24

          // Generar todos los slots horarios del día
          const bookedTimesUTC = new Set(
            dayActivities.map(act => {
              const d = new Date(act.date);
              return d.getUTCHours(); // solo hora exacta
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

          // Filtrar slots libres (sin conflicto en ventana de 1h con cualquier actividad)
          const freeSlots = allSlots.filter(slot =>
            !dayActivities.some(act => {
              const diff = Math.abs(new Date(act.date).getTime() - slot.getTime());
              return diff < CONFLICT_WINDOW_MS;
            })
          );

          // Ordenar por proximidad a la hora propuesta y tomar los 3 más cercanos
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
      this.logger.error(`Error ejecutando herramienta ${name}:`, error);
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
      // Por defecto Gemini
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
    // Si hay endpoint configurado, usamos Azure OpenAI
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
        ...(isAzure ? {} : { model }),   // Azure infiere el modelo del deployment en la URL
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
    return text.trim();
  }

  /**
   * Llamada REST a IBM Watsonx
   */
  private async callWatsonx(model: string, apiKey: string, projectId: string, region: string, prompt: string, temperature: number): Promise<string> {
    // 1. Obtener token IAM
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

    // 2. Ejecutar generación de texto
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
    return rawText.trim();
  }

  /**
   * Sanitiza la salida para garantizar que inicie con `{"thought"` y termine con `}` cerrando el JSON.
   */
  private cleanJsonOutput(text: string): string {
    let clean = text.trim();
    
    // Si no empieza con {"thought" pero lo contiene, recortamos
    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      clean = clean.substring(firstBrace);
    } else {
      // Forzar reconstrucción de thought
      clean = `{"thought": "Generando respuesta", ${clean}`;
    }

    // Quitar marcas de formato markdown ```json
    if (clean.includes('```json')) {
      clean = clean.replace(/```json/gi, '');
      clean = clean.replace(/```/gi, '');
    }

    // Validar y cerrar llaves balanceadas
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
   * Retorna el offset en horas (ej. -6 en invierno, -5 en verano).
   */
  private getMexicoCityUTCOffset(date: Date): number {
    const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const localMs = new Date(date.toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getTime();
    return Math.round((localMs - utcMs) / (1000 * 60 * 60));
  }
}
