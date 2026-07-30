import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';

/**
 * Servicio responsable de la inicialización y migración de sub-agentes de IA.
 * Garantiza que la base de datos tenga los sub-agentes base (comercial, seguimiento,
 * soporte, general) correctamente configurados en el primer inicio y mantiene
 * los textos actualizados en ejecuciones posteriores.
 *
 * Separado de AiAgentOrchestratorService por el principio de Responsabilidad Única.
 */
@Injectable()
export class AiSubAgentMigrationService implements OnModuleInit {
  private readonly logger = new Logger('AiSubAgentMigrationService');

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    @InjectRepository(AiSubAgent)
    private readonly aiSubAgentRepository: Repository<AiSubAgent>,
  ) {}

  async onModuleInit() {
    await this.runOneTimeSubAgentMigration();
  }

  /**
   * Realiza la migración y desglose inicial del contexto general hacia los sub-agentes
   * si la tabla está vacía. En ejecuciones posteriores aplica auto-migración de textos.
   * Esta operación es idempotente — si los sub-agentes ya existen, solo actualiza textos.
   */
  async runOneTimeSubAgentMigration(): Promise<void> {
    try {
      const config = await this.aiAgentConfigRepository.findOne({ where: {} });

      // Sólo inicializamos la semilla neutra del enrutador si la base de datos está vacía
      if (config && !config.context) {
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
REGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.
ANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.
SOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.
NO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.
Redirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.`;

      const comercialInstructions = `[INSTRUCCIONES COMERCIALES]
- Registra oportunidades en el CRM.
- REGLA MANDATORIA Y OBLIGATORIA DE BÚSQUEDA EN RAG/CATÁLOGO: Para CUALQUIER pregunta del cliente sobre productos, especificaciones técnicas (RAM, memoria, procesador, modelo, almacenamiento, pantalla, etc.), catálogo, precios o compatibilidad, DEBES llamar OBLIGATORIAMENTE a la herramienta consult_product_catalog ANTES de responder al usuario. Está estrictamente PROHIBIDO responder directamente con final_answer o confiar en la memoria previa del chat para dar especificaciones sin haber llamado PRIMERO a consult_product_catalog en ese turno.
- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento. Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes llamar obligatoriamente a la herramienta consult_product_catalog para consultar la base de datos real.
- REGLA CRÍTICA OBLIGATORIA DE PRECIOS, UNIDADES DE MEDIDA Y OBSERVACIONES: Todos los productos tienen un precio base y una unidad de medida asignada (ej. pieza, servicio, licencia, hora). Muestra siempre el precio base indicando su unidad de medida. Si el producto devuelto por consult_product_catalog o RAG contiene observaciones o notas de precio (ej. 'no incluye IVA', 'no incluye instalación', 'precio refleja configuración básica'), DEBES comunicar de forma explícita y completa dichas observaciones o condicionantes al cliente en tu respuesta al entregar el precio o la cotización. NUNCA omitas las observaciones o notas del producto.
- VARIANTES DE PRODUCTO: Las variantes (como colores o modelos) se manejan como productos independientes dentro del catálogo.
- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.
- Si el producto tiene manuales PDF en RAG, resume especificaciones clave.
- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity.
- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a consult_product_catalog.
- COTIZACIONES MULTI-PRODUCTO (AGREGAR O MODIFICAR): Si el cliente solicita agregar un nuevo producto o piezas adicionales a una cotización u oportunidad existente, DEBES llamar a modifyOpportunity pasando el id de la oportunidad activa, el nombreProducto nuevo y la cantidad solicitada. El sistema mantendrá automáticamente los productos anteriores y agregará el nuevo producto, recalculando el monto total y generando la lista completa en el PDF.`;

      const seguimientoInstructions = `[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]
- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.
- REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE: Está ESTRICTAMENTE PROHIBIDO inventar, asertar o adivinar una fecha u hora por tu cuenta para agendar sin habérsela preguntado primero al cliente.
- PREGUNTAR DISPONIBILIDAD PRIMERO: Si el cliente solicita o muestra interés en agendar una llamada, cita o reunión pero NO ha proporcionado explícitamente su fecha (día) y hora de preferencia, DEBES responder inmediatamente usando la herramienta 'final_answer' preguntándole amablemente cuál es su día y horario de preferencia para coordinar la llamada. Está ESTRICTAMENTE PROHIBIDO llamar a 'checkAvailability' o 'createActivity' si el cliente aún no te ha indicado qué día y hora prefiere.
- VALIDACIÓN DE DISPONIBILIDAD: SOLO cuando el cliente te proporcione explícitamente el día y hora en que desea la cita, llamarás a 'checkAvailability' pasando la fecha indicada por el cliente.
- Si 'checkAvailability' responde AVAILABLE para esa fecha/hora, procedes a agendar la actividad con 'createActivity' y añades recordatorios de forma proactiva.
- Si 'checkAvailability' responde UNAVAILABLE, le ofreces los horarios alternativos de 'suggestedSlots' al cliente y le preguntas cuál prefiere.
- Vincula siempre la actividad con el cliente. No inventes UUIDs del sistema.`;

      const soporteInstructions = `[INSTRUCCIONES DE SOPORTE Y HELPDESK]
- Tu objetivo principal es atender incidencias, dudas técnicas, reportes de problemas y quejas del cliente, intentando resolver y aclarar cualquier problemática que tenga.
- Genera un ticket en el CRM con la herramienta createTicket cuando corresponda registrar la falla (campos: title, description, priority: 1=Bajo, 2=Medio, 3=Alto, category).
- REGLAS OBLIGATORIAS DE REDIRECCIÓN A HUMANO (EJECUTIVO ESPECIALIZADO):
  Debes llamar OBLIGATORIAMENTE a la herramienta 'requestHumanHandoff' para transferir la conversación a un ejecutivo especializado en los siguientes escenarios específicos:
  1. Si se detecta un cliente molesto, problemático, irritado o agresivo.
  2. Si la conversación, después de varios intentos, no llega a ninguna solución o entendimiento.
  3. Si el cliente está haciendo preguntas o solicitudes completamente ajenas a lo establecido para el soporte o la empresa.
  4. Si el cliente solicita explícitamente ser atendido por una persona real, un humano o un ejecutivo.
  NUNCA respondas sólo con final_answer diciendo que lo conectarás o derivarás sin haber llamado PRIMERO a la herramienta 'requestHumanHandoff'.
- En cualquier otro escenario, tú debes resolver directamente la duda o problemática del cliente sin derivar ni desactivarte.`;

      const generalInstructions = `[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde amablemente a saludos, despedidas o preguntas de plática informal.
- No intentes llamar a ninguna herramienta si el cliente solo te saluda.`;

      if (count > 0) {
        // RESPETAR LA FUENTE DE VERDAD Y AUTO-MIGRACIÓN DE TEXTOS EN BD
        try {
          const subAgents = await this.aiSubAgentRepository.find();
          for (const sa of subAgents) {
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
            if (sa.key === 'comercial' && (!sa.context || !sa.context.includes('REGLA MANDATORIA Y OBLIGATORIA DE BÚSQUEDA EN RAG/CATÁLOGO'))) {
              sa.context = `${baseCommonPrompt}\n\n${comercialInstructions}`;
              modified = true;
              this.logger.log('Contexto del sub-agente comercial actualizado con regla mandatoria de RAG.');
            }
            if (sa.key === 'comercial' && (!sa.tools || !sa.tools.includes('sendQuotationPdf'))) {
              sa.tools = [...(sa.tools || []), 'sendQuotationPdf'];
              modified = true;
              this.logger.log('Herramienta sendQuotationPdf agregada al sub-agente comercial existente.');
            }
            if (sa.key === 'seguimiento' && (!sa.context || !sa.context.includes('REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE'))) {
              sa.context = `${baseCommonPrompt}\n\n${seguimientoInstructions}`;
              modified = true;
              this.logger.log('Contexto del sub-agente de seguimiento actualizado con regla mandatoria de disponibilidad del cliente.');
            }
            if (sa.key === 'soporte_atencion') {
              if (!sa.tools || !sa.tools.includes('requestHumanHandoff')) {
                sa.tools = [...(sa.tools || []), 'requestHumanHandoff'];
                modified = true;
                this.logger.log('Herramienta requestHumanHandoff agregada al sub-agente de soporte existente.');
              }
              if (!sa.context || !sa.context.includes('requestHumanHandoff') || !sa.context.includes('NUNCA respondas sólo con final_answer')) {
                sa.context = `${baseCommonPrompt}\n\n${soporteInstructions}`;
                modified = true;
                this.logger.log('Contexto e instrucciones de redirección a humano actualizadas en el sub-agente de soporte.');
              }
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

          // Auto-sincronizar sub-agentes en todos los esquemas de tenants activos
          const activeTenants = await this.aiAgentConfigRepository.query(
            `SELECT schema_name FROM public.tenants WHERE is_active = true`
          ).catch(() => []);

          // Asegurar únicamente que las herramientas del sistema estén presentes en los tenants sin sobrescribir sus prompts personalizados
          for (const t of activeTenants) {
            const sName = t.schema_name;
            try {
              // 1. Sincronizar comercial: agregar sendQuotationPdf a las herramientas si no la tiene
              const comSub = await this.aiAgentConfigRepository.query(
                `SELECT id, tools FROM "${sName}".ai_sub_agents WHERE key = 'comercial'`
              );
              if (comSub && comSub.length > 0) {
                let tools = comSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                if (!tools.includes('sendQuotationPdf')) {
                  tools.push('sendQuotationPdf');
                  await this.aiAgentConfigRepository.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'comercial'`,
                    [JSON.stringify(tools)]
                  );
                }
              }

              // 2. Sincronizar soporte_atencion: agregar requestHumanHandoff a las herramientas si no la tiene
              const sopSub = await this.aiAgentConfigRepository.query(
                `SELECT id, tools FROM "${sName}".ai_sub_agents WHERE key = 'soporte_atencion'`
              );
              if (sopSub && sopSub.length > 0) {
                let tools = sopSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                if (!tools.includes('requestHumanHandoff')) {
                  tools.push('requestHumanHandoff');
                  await this.aiAgentConfigRepository.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'soporte_atencion'`,
                    [JSON.stringify(tools)]
                  );
                }
              }
            } catch (tenantErr) {
              // Ignorar esquemas que aún no tengan la tabla creada
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
          tools: ['registerContact', 'updateContact', 'createOpportunity', 'modifyOpportunity', 'consult_product_catalog', 'sendQuotationPdf'],
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
          description: 'Atiende incidencias de soporte, quejas y dudas técnicas. Si detecta un cliente molesto, problemático o sin solución tras varios intentos, lo redirecciona con un ejecutivo especializado (humano).',
          context: `${baseCommonPrompt}\n\n${soporteInstructions}`,
          tools: ['registerContact', 'updateContact', 'createTicket', 'requestHumanHandoff'],
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
}
