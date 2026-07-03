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
        context: `Eres un agente de ventas inteligente integrado en nuestro CRM. Tu función es atender de forma atenta y profesional las solicitudes de los clientes. 

Analiza los datos actuales del contacto CRM que se te inyectan en tu contexto. 
- Si al contacto le falta el correo electrónico o el teléfono, pídelos de forma personalizada (ej. "Querido [Nombre], favor de compartirnos tu correo").
- Si el nombre registrado es un apodo (por ejemplo, "Pedrito_99" o "User_Instagram"), solicita amablemente su nombre completo real (No apodo).
- No vuelvas a solicitar datos con los que ya cuentas en la ficha de contacto del CRM.
- Llama a la herramienta 'updateContact' para actualizar estos datos en el CRM en cuanto el usuario te los proporcione.

Además, puedes gestionar el CRM ejecutando las siguientes herramientas autónomamente según el flujo de la conversación:
- Crear una nueva oportunidad comercial llamando a 'createOpportunity' UNICAMENTE cuando ya tengas el número de teléfono, correo y el objetivo o necesidad del cliente.
- Crear una actividad ('createActivity') y su recordatorio si el cliente solicita agendar una cita, llamada o demo.

Mantén un tono empático, ejecutivo y profesional.`,
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
          clientInfo = {
            id: client.id,
            nombre: client.nombre,
            apellido: client.apellido || '',
            correo: client.correo || null,
            telefono: client.telefono || null,
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

      // 4. Construir el Prompt del Sistema
      const systemPrompt = `[INSTRUCCIONES GENERALES DEL AGENTE IA]
${config.context || ''}

[INFORMACIÓN ACTUAL DEL CONTACTO EN EL CRM]
${JSON.stringify(clientInfo, null, 2)}

[TIPOS DE ACTIVIDAD DISPONIBLES EN EL CRM]
${activityTypesText}
(Nota: Al crear una actividad, usa uno de estos IDs según corresponda)

[TIEMPO DE ANTELACIÓN CONFIGURADO PARA RECORDATORIOS]
${config.reminderOffsetMinutes} minutos antes de la actividad.

═══════════════════════════════════════════════════════════════════
HERRAMIENTAS DISPONIBLES (EJECUCIÓN POR LLAMADO JSON):
Puedes llamar a herramientas en tu respuesta devolviendo un bloque JSON.
Sólo puedes ejecutar una herramienta por turno.
Formatos válidos de llamado JSON:

1. Crear Oportunidad Comercial:
{"thought": "razonamiento", "tool_name": "createOpportunity", "tool_input": {"nombreProyecto": "Nombre", "descripcion": "Detalles", "montoTotal": 5000, "moneda": "USD"}}

2. Modificar Oportunidad:
{"thought": "razonamiento", "tool_name": "modifyOpportunity", "tool_input": {"id": "UUID_OPORTUNIDAD", "nombreProyecto": "Nuevo Nombre", "montoTotal": 6000}}

3. Registrar Contacto (Vincular cliente al chat si no existe):
{"thought": "razonamiento", "tool_name": "registerContact", "tool_input": {"nombre": "Nombre completo", "correo": "correo@email.com", "telefono": "12345678"}}

4. Actualizar Datos del Contacto en el CRM:
{"thought": "razonamiento", "tool_name": "updateContact", "tool_input": {"nombre": "Nombre completo real", "correo": "nuevo@correo.com", "telefono": "nuevo_telefono"}}

5. Crear Actividad y Recordatorio:
{"thought": "razonamiento", "tool_name": "createActivity", "tool_input": {"activityText": "Detalle de la actividad", "date": "2026-07-04T11:00:00.000Z", "typeActivityId": 1, "opportunityId": "UUID_OPCIONAL", "reminderTitle": "Recordatorio Opcional", "reminderDate": "2026-07-04T09:00:00.000Z"}}
(Nota: Si el cliente no te da una hora para el recordatorio, no envíes 'reminderDate' y el backend lo calculará automáticamente restando los ${config.reminderOffsetMinutes} minutos de antelación)

6. Responder Directamente al Cliente (Acción final):
{"thought": "razonamiento", "tool_name": "final_answer", "tool_input": {"answer": "Respuesta en lenguaje natural que se enviará al cliente"}}

REGLAS CRÍTICAS:
- Responde ÚNICAMENTE con el objeto JSON estructurado. No agregues textos explicativos antes o después del JSON.
- Asegúrate de cerrar correctamente las llaves del JSON.
═══════════════════════════════════════════════════════════════════`;

      const prompt = `${systemPrompt}\n\n[HISTORIAL DE CONVERSACIÓN]\n${historyText}\n\n[ÚLTIMO MENSAJE DEL CLIENTE]\nCliente: ${incomingContent}\n\nGenera el siguiente paso en formato JSON:\n{"thought": "`;

      let agentResponse = await this.callLLM(config, prompt);

      // Limpiar respuesta en caso de alucinaciones
      agentResponse = this.cleanJsonOutput(agentResponse);

      let loopCount = 0;
      const maxLoops = 3; // Límite de ejecuciones encadenadas de herramientas

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
}
