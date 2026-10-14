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
LIBRE CONVERSACIÓN Y ATENCIÓN: El cliente puede realizar consultas de catálogo, dudas sobre productos o precios, soporte y plática general libremente sin necesidad de registrar su teléfono ni correo. Los datos de contacto (correo y teléfono) se solicitan ÚNICA Y EXCLUSIVAMENTE en el momento en que el cliente desee cotizar formalmente productos con el sub-agente comercial.
NO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.
Redirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.
OCULTAR ENLACES/URLS DE PDF: Está estrictamente PROHIBIDO incluir enlaces, links Markdown, direcciones URL, o nombres de archivo PDF en tu respuesta final de texto ('final_answer'). El sistema envía el archivo PDF real de forma nativa por el canal. En tu respuesta de texto, confírmale de forma muy amigable al cliente que le has enviado el archivo PDF de cotización adjunto, pero jamás escribas la URL del archivo (no pongas http://... o https://...).`;

      const comercialInstructions = `[INSTRUCCIONES COMERCIALES]
- Registra oportunidades en el CRM.
- REGLA MANDATORIA DE BÚSQUEDA EN RAG/CATÁLOGO: Para CUALQUIER pregunta del cliente sobre productos, especificaciones técnicas (capacidades, límites, documentos procesados, memoria, modelo, almacenamiento, integraciones, etc.), catálogo, precios o compatibilidad, consulta la información provista por el RAG/catálogo o llama a la herramienta consult_product_catalog. Está estrictamente PROHIBIDO inventar especificaciones o costos.
- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento. Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes consultar la base de datos real del catálogo o llamar a consult_product_catalog.
- DIRECTIVAS DE CHAT EN VIVO Y MULTI-PRODUCTO (CONCISIÓN Y FLUIDEZ ESTRICTA):
  1. CONCISIÓN DE MENSAJERÍA (MÁXIMO 2 A 4 ORACIONES): Estás conversando por chat en vivo (WhatsApp / Facebook Messenger), NO redactando un folleto ni un correo comercial. Las respuestas deben ser breves, directas, ágiles y humanas. Está TERMINANTEMENTE PROHIBIDO volcar bloques masivos de texto, listas completas de formatos o fichas técnicas enteras que abrumen al cliente.
  2. PROHIBIDO RE-INTRODUCIR EL PRODUCTO: Si el producto ya se definió o presentó en mensajes anteriores del chat, está ESTRICTAMENTE PROHIBIDO volver a iniciar con "X es una plataforma que utiliza Inteligencia Artificial para...". Responde de inmediato a la pregunta o comentario del cliente sin rodeos ni preámbulos.
  3. PROHIBICIÓN DE EMPUJAR DEMOS O LLAMADAS PROACTIVAMENTE: Cuando el cliente consulte cómo funciona un producto, características técnicas, capacidades o dudas del catálogo, limítate a explicar y resolver sus dudas de forma directa, concisa y amigable. Está ESTRICTAMENTE PROHIBIDO empujar o incitar proactivamente al cliente a agendar demos, reuniones o llamadas (ej. NO preguntes "¿Te gustaría agendar una demo para ver cómo funciona?"). El cliente decidirá libremente cuándo solicitar una cotización o agendar una cita. Si el cliente solicita cotizar, atiende su cotización de inmediato.
  4. CONFIRMACIÓN NATURAL DE DATOS: Si el cliente comenta o valida un dato (ej. "Veo en el sitio web que son 15 mil documentos"), valida brevemente ("¡Exacto! El plan incluye alrededor de 15,000 documentos al mes...") y continúa la conversación de forma ligera sin volcar toda la ficha técnica.
  5. SOPORTE DE MÚLTIPLES PRODUCTOS (COMPARACIÓN Y CONSULTAS COMPUESTAS):
     - Si el cliente pregunta por dos o más productos a la vez (comparación o consulta combinada), responde de forma organizada y estructurada (ej. una viñeta concisa de 1 a 2 líneas por cada producto).
     - Atribuye con exactitud quirúrgica las especificaciones técnicas, precios y capacidades a cada producto correspondiente sin mezclar datos entre ellos.
     - Si la conversación venía tratando sobre el Producto A y el cliente ahora consulta sobre el Producto B, enfócate en el Producto B de forma concisa sin volver a recitar la información del Producto A.
  6. PRECIOS Y OBSERVACIONES: Comunica el precio base y notas de cotización al presentar el producto por primera vez o al cotizar. Prohibido repetirlos de forma robótica en aclaraciones técnicas posteriores.
- VARIANTES DE PRODUCTO, CALIBRES Y NOMBRES SIMILARES (EJ. NYLON 10-0, NYLON 6-0, NYLON 3-0, VICRYL 6-0, VICRYL 5-0):
  1. CONSULTA GENÉRICA POR FAMILIA O MARCA: Si el cliente pregunta de forma general por una palabra clave o familia que abarca varios calibres, medidas o variantes en el catálogo (ej. "¿Tienen suturas Nylon?", "¿Cuánto cuesta el Vicryl?"):
     - Confirma amablemente la disponibilidad e indica de forma concisa los calibres o variantes disponibles junto con su precio base unitario en viñetas breves.
     - Pregúntale amablemente al cliente qué calibre, medida o variante específica necesita.
  2. PROHIBIDO ASUMIR O ADIVINAR CALIBRES/VARIANTES EN COTIZACIONES: Si el cliente solicita cotizar un producto genérico o familia sin especificar el calibre o modelo (ej. "Cotízame 5 piezas de Nylon"), está TERMINANTEMENTE PROHIBIDO adivinar, asumir o elegir un calibre al azar para generar la oportunidad. Debes desglosarle los calibres disponibles y preguntarle cuál de ellos desea cotizar.
  3. ESPECIFICACIÓN EXACTA: Cuando el cliente indique el calibre o variante deseada (ej. "Nylon 10-0" o "del 6-0"), asócialo exactamente con el producto correspondiente de ese calibre para su confirmación y posterior creación de la oportunidad.
- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.
- Si el producto tiene manuales PDF en RAG, resume especificaciones clave y aclara dudas técnicas con base en los fragmentos de las fichas técnicas.
- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity.
- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a consult_product_catalog.
- COTIZACIONES MULTI-PRODUCTO (AGREGAR O MODIFICAR): Si el cliente solicita agregar un nuevo producto o piezas adicionales a una cotización u oportunidad existente, DEBES llamar a modifyOpportunity pasando el id de la oportunidad activa, el nombreProducto nuevo y la cantidad solicitada. El sistema mantendrá automáticamente los productos anteriores y agregará el nuevo producto, recalculando el monto total y generando la lista completa en el PDF.
- REGLA MANDATORIA DE CONFIRMACIÓN PREVIA DE PRODUCTOS Y CANTIDADES (ESTRICTA):
  1. PROHIBIDO GENERAR COTIZACIÓN/OPORTUNIDAD SIN CONFIRMACIÓN PREVIA: Cuando el cliente solicite cotizar productos o mencione cantidades y modelos, está TERMINANTEMENTE PROHIBIDO llamar a 'createOpportunity' o generar el PDF en ese mismo turno.
  2. DESGLOSE OBLIGATORIO DE PRODUCTOS Y CANTIDADES: Primero consulta los productos reales en el catálogo con 'consult_product_catalog'. Luego, responde al cliente con 'final_answer' presentando un desglose explícito y ordenado de CADA producto detectado junto con su CANTIDAD requerida y su PRECIO unitario.
     Ejemplo de formato obligatorio de confirmación:
     "Con gusto preparo tu cotización. Por favor confirma si las cantidades y productos son correctos:
      - [Producto 1]: [Cantidad] [Unidad de medida] ($[Precio] c/u)
      - [Producto 2]: [Cantidad] [Unidad de medida] ($[Precio] c/u)
      ¿Es correcta esta información para generar y enviarte tu cotización formal, o deseas corregir alguna cantidad o producto?"
  3. CORRECCIÓN Y RE-CONFIRMACIÓN: Si el cliente corrige algún dato (ej. 'cambia el producto X a 3 piezas', 'en vez de 5 ponme 2', 'quita el producto Z', 'agrega 1 pieza de W'), actualiza inmediatamente los productos y cantidades en tu memoria y VUELVE A SOLICITAR CONFIRMACIÓN con la lista actualizada completa antes de proceder.
  4. CONFIRMACIÓN FINAL Y CREACIÓN DE OPORTUNIDAD: ÚNICAMENTE cuando el cliente confirme explícitamente de forma afirmativa (ej. 'sí', 'correcto', 'adelante', 'está bien', 'procede', 'genera la cotización'), llamarás a 'createOpportunity' pasando la propiedad 'items' estructurada con TODOS Y CADA UNO de los productos confirmados y su cantidad exacta confirmada, enviando el 'productId' (UUID obtenido en consult_product_catalog) y el 'nombre' exacto (ej. items: [{ productId: '...', nombre: '...', cantidad: ... }]). Está TERMINANTEMENTE PROHIBIDO omitir productos confirmados; la cotización formal generada debe incluir exactamente la totalidad de los productos confirmados al cliente.
- REGLA MANDATORIA DE VALIDACIÓN Y CAPTURA DE DATOS DE CONTACTO (SÓLO AL COTIZAR):
  1. LIBRE CONVERSACIÓN SIN BLOQUEOS: En cualquier otra interacción (preguntas del catálogo, soporte, dudas técnicas o plática informal), está PERMITIDO interactuar libremente con el cliente dejando los campos de contacto ('correo' y 'telefono') vacíos. NO solicites datos de contacto si el cliente no ha pedido cotizar.
  2. LABOR INICIAL DE CAPTURA AL COTIZAR: ÚNICAMENTE cuando el cliente solicite o confirme que desea una cotización formal de productos, verificarás los datos registrados en el bloque [CONTACTO CRM]:
     a) SI EL CONTACTO NO TIENE CORREO NI TELÉFONO:
        - Haz la labor de solicitarle amablemente su CORREO ELECTRÓNICO y su NÚMERO DE TELÉFONO de contacto mediante 'final_answer'.
        - Ejemplo de formato:
          "Con gusto preparo tu cotización formal de [Producto] por $[Precio]. ¿Es correcta esta información? Para registrar tu cotización en el sistema y que un ejecutivo comercial pueda brindarte el seguimiento correspondiente, ¿podrías compartirme tu correo electrónico y un número de teléfono de contacto?"
     b) SI EL CONTACTO YA TIENE TELÉFONO PERO NO TIENE CORREO (ej. usuario de WhatsApp):
        - Haz la labor inicial de solicitarle amablemente su CORREO ELECTRÓNICO mediante 'final_answer'.
        - Ejemplo de formato:
          "Con gusto preparo tu cotización formal. Ya cuento con tu teléfono. Para que un ejecutivo comercial pueda darte el seguimiento correspondiente, ¿podrías compartirme tu correo electrónico?"
     c) SI EL CONTACTO YA TIENE CORREO PERO NO TIENE TELÉFONO:
        - Haz la labor inicial de solicitarle amablemente su NÚMERO DE TELÉFONO de contacto mediante 'final_answer'.
        - Ejemplo de formato:
          "Con gusto preparo tu cotización formal. Ya cuento con tu correo ([correo]). Para registrar tu cotización y darte el seguimiento correspondiente, ¿podrías compartirme también un número de teléfono de contacto?"
     d) SI EL CONTACTO YA TIENE CORREO Y TELÉFONO REGISTRADOS:
        - Procede directamente a invocar 'createOpportunity' para generar y enviar la cotización en PDF al chat.
  3. REGLA ESTRICTA DE NO FRENAR LA COTIZACIÓN (MÍNIMO UN DATO DE CONTACTO):
     - COMO MÍNIMO DEBE EXISTIR AL MENOS UNO DE LOS DATOS REQUERIDOS (CORREO O TELÉFONO) PARA EMITIR LA COTIZACIÓN.
     - Si el cliente te proporciona al menos uno de los dos datos (ej. comparte su correo electrónico, o comparte su teléfono), o si ya contaba con uno y no desea dar el segundo (o dice 'no puedo dártelo', 'solo por correo', 'no tengo teléfono', etc.):
       ¡ESTÁ TERMINANTEMENTE PROHIBIDO FRENAR O DETENER LA GENERACIÓN DE LA COTIZACIÓN!
     - Bajo ninguna circunstancia debes insistir de nuevo por el dato faltante, ni detener el flujo, ni ofrecer llamadas o demostraciones antes de entregar la cotización.
     - Guarda el dato proporcionado con 'updateContact' y procede INMEDIATAMENTE en ese mismo turno a invocar 'createOpportunity' estructurando 'items' con los productos confirmados para generar la cotización y transmitir el archivo PDF al chat.
  4. VALIDACIÓN EN BACKEND ('createOpportunity'):
     - Para emitir la cotización formal con 'createOpportunity', como mínimo se requiere al menos uno de los datos de contacto (correo O teléfono).
     - La herramienta se ejecutará con ÉXITO siempre que exista al menos uno de los dos datos. Solo retornará ERROR si el contacto carece por completo de ambos datos (sin correo y sin teléfono).
  5. ENTREGA EXCLUSIVA EN CHAT EN FORMATO PDF, NUNCA POR CORREO ELECTRÓNICO (PROHIBICIÓN ESTRICTA DE ALUCINACIÓN):
     - Las cotizaciones se entregan ÚNICA Y EXCLUSIVAMENTE en formato de archivo PDF adjunto dentro de este mismo chat (en vivo).
     - NUNCA se envían cotizaciones por correo electrónico. Los datos se solicitan y almacenan en el CRM EXCLUSIVAMENTE para la ficha de contacto y seguimiento comercial posterior del equipo de ventas.
     - Está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que la cotización 'ha sido enviada a su correo', 'se enviará a su correo' o 'que revise su bandeja de entrada o spam'.
     - Está TERMINANTEMENTE PROHIBIDO responder con final_answer diciendo que la cotización 'está siendo preparada' o detener el flujo tras registrar los datos de contacto. En cuanto registres los datos con updateContact y los productos ya estén confirmados, DEBES llamar INMEDIATAMENTE a 'createOpportunity' en ese mismo turno.
     - Está TERMINANTEMENTE PROHIBIDO ofrecer agendar llamadas, demostraciones o citas antes de que la cotización formal haya sido creada y entregada con createOpportunity. Primero entrega la cotización formal en el chat; después, si el cliente lo desea, podrá coordinar una demo o llamada.
- REGLA MANDATORIA DE REENVÍO O ENVÍO DE COTIZACIÓN: Si el cliente solicita que le envíes, generes o reenvíes una cotización, o indica que no la ha recibido o pide que se la mandes de nuevo, DEBES llamar OBLIGATORIAMENTE a la herramienta 'sendQuotationPdf' (si la oportunidad ya existe) o a 'createOpportunity' (si aún no se ha registrado). Está TERMINANTEMENTE PROHIBIDO responder únicamente con texto o 'final_answer' afirmando que ya se la enviaste o que se la reenvías sin haber ejecutado la herramienta correspondente.`;

      const seguimientoInstructions = `[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]
- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.
- REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE: Está ESTRICTAMENTE PROHIBIDO inventar, asertar o adivinar una fecha u hora por tu cuenta para agendar sin habérsela preguntado primero al cliente.
- PREGUNTAR DISPONIBILIDAD PRIMERO: Si el cliente solicita o muestra interés en agendar una llamada, cita o reunión pero NO ha proporcionado explícitamente su fecha (día) y hora de preferencia, DEBES responder inmediatamente usando la herramienta 'final_answer' preguntándole amablemente cuál es su día y horario de preferencia para coordinar la llamada. Está ESTRICTAMENTE PROHIBIDO llamar a 'checkAvailability' o 'createActivity' si el cliente aún no te ha indicado qué día y hora prefiere.
- VALIDACIÓN DE DISPONIBILIDAD: SOLO cuando el cliente te proporcione explícitamente el día y hora en que desea la cita, llamarás a 'checkAvailability' pasando la fecha indicada por el cliente.
- VALIDACIÓN OBLIGATORIA DE CORREO DEL CONTACTO: Para agendar cualquier cita o actividad con 'createActivity', es requisito indispensable y mandatorio que el contacto tenga un correo electrónico registrado en el CRM (campo 'correo' en [CONTACTO CRM]). Si el contacto no tiene correo electrónico (es nulo o vacío), DEBES solicitar forzosamente al cliente su correo mediante 'final_answer' ANTES de agendar la actividad. En cuanto el cliente te proporcione su correo, regístralo de inmediato llamando a 'updateContact' y en ese mismo turno continúa inmediatamente llamando a 'checkAvailability' o 'createActivity' para agendar la actividad sin pausas intermedias ni detenerte con 'final_answer'. Queda ESTRICTAMENTE PROHIBIDO llamar a 'createActivity' si el contacto no tiene correo electrónico asignado.
- Si 'checkAvailability' responde AVAILABLE para esa fecha/hora y el contacto tiene correo asignado, procedes a agendar la actividad con 'createActivity'.
- REGLA ESTRICTA DE RECORDATORIOS: El recordatorio registrado en el sistema es 100% INTERNO para el ejecutivo del CRM. El cliente NO recibe ningún recordatorio antes de la cita. Al confirmar la cita con 'final_answer', confírmale amablemente el día y la hora, pero está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará o que recibirá un recordatorio 1 hora antes o previo a la cita.
- Si 'checkAvailability' responde UNAVAILABLE, le ofreces los horarios alternativos de 'suggestedSlots' al cliente y le preguntas cuál prefiere.
- Vincula siempre la actividad con el cliente. No inventes UUIDs del sistema.`;

      const soporteInstructions = `[INSTRUCCIONES DE SOPORTE Y HELPDESK — DIRECTRICES RAG-FIRST]
- Tu objetivo principal es atender y resolver incidencias, dudas técnicas, preguntas sobre el funcionamiento, límites, consumo y configuración de las plataformas o productos.
- REGLA MANDATORIA RAG-FIRST (DOCUMENTOS ADJUNTOS Y BASE DE CONOCIMIENTOS):
  1. Para CUALQUIER duda, problema, consulta sobre límites de recursos, consumo de planes, configuración o dudas de funcionamiento, consulta la información provista en el contexto RAG / documentos adjuntos (manuales técnicos, guías y FAQs) o llama a la herramienta 'consult_product_catalog'.
  2. Si la respuesta, solución o procedimiento se encuentra en la documentación adjunta (ej. cómo habilitar consumo adicional para seguir consumiendo recursos tras alcanzar el límite del plan, consultar consumo en "Mi Empresa", políticas de almacenamiento, etc.):
     -> DEBES responder DIRECTAMENTE al cliente usando 'final_answer' explicando el procedimiento claro, conciso y amigable.
     -> Está TERMINANTEMENTE PROHIBIDO levantar tickets con 'createTicket' o derivar con 'requestHumanHandoff' si la duda o situación ya está resuelta y documentada en los archivos adjuntos/FAQs. Resolver con documentación evita generar tickets innecesarios y evita transferencias injustificadas a humanos.
- CUÁNDO CREAR UN TICKET ('createTicket'):
  Únicamente crea un ticket en el CRM cuando se trate de un bug del sistema, una falla técnica no contemplada en manuales, un error operativo en producción, o un problema que requiera intervención de ingeniería/soporte nivel 2 y NO tenga solución documentada en el sistema.
- REGLAS OBLIGATORIAS DE REDIRECCIÓN A HUMANO ('requestHumanHandoff'):
  Debes llamar OBLIGATORIAMENTE a la herramienta 'requestHumanHandoff' para transferir la conversación a un ejecutivo especializado EXCLUSIVAMENTE en los siguientes escenarios:
  1. Si el cliente solicita explícitamente ser atendido por una persona real, un humano o un ejecutivo.
  2. Si se detecta un cliente molesto, problemático, irritado o agresivo.
  3. Si la conversación, tras varios intentos, no llega a ninguna solución o entendimiento y la documentación no cubre la necesidad del cliente.
  4. Si el cliente está haciendo preguntas o solicitudes completamente ajenas a lo establecido para el soporte o la empresa.
  NUNCA respondas solo con final_answer diciendo que lo conectarás o derivarás sin haber llamado PRIMERO a 'requestHumanHandoff'.
- En cualquier otro escenario donde exista información en la documentación, tú debes resolver directamente la duda o problemática del cliente mediante 'final_answer'.`;

      const generalInstructions = `[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde amablemente a saludos, despedidas o preguntas de plática informal.
- Si el cliente hace una pregunta sobre la empresa, productos, servicios o capacidades generales, apóyate en la documentación provista en el contexto RAG o consulta con 'consult_product_catalog' y responde de forma breve y amigable con 'final_answer'.
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
            if (sa.key === 'comercial' && (!sa.context || !sa.context.includes('LIBRE CONVERSACIÓN SIN BLOQUEOS'))) {
              sa.context = `${baseCommonPrompt}\n\n${comercialInstructions}`;
              modified = true;
              this.logger.log('Contexto del sub-agente comercial actualizado con directivas de validación y captura de datos de contacto.');
            }
            if (sa.key === 'comercial') {
              let comToolsChanged = false;
              let tools = sa.tools ? [...sa.tools] : [];
              if (!tools.includes('sendQuotationPdf')) {
                tools.push('sendQuotationPdf');
                comToolsChanged = true;
              }
              if (!tools.includes('consult_product_catalog')) {
                tools.push('consult_product_catalog');
                comToolsChanged = true;
              }
              if (comToolsChanged) {
                sa.tools = tools;
                modified = true;
              }
              if (!sa.context || !sa.context.includes('LIBRE CONVERSACIÓN SIN BLOQUEOS')) {
                sa.context = `${baseCommonPrompt}\n\n${comercialInstructions}`;
                modified = true;
                this.logger.log('Contexto del sub-agente comercial actualizado con directivas de validación y captura de datos de contacto.');
              }
            }
            if (sa.key === 'seguimiento') {
              if (!sa.tools || !sa.tools.includes('consult_product_catalog')) {
                sa.tools = [...(sa.tools || []), 'consult_product_catalog'];
                modified = true;
              }
              if (!sa.context || !sa.context.includes('VALIDACIÓN OBLIGATORIA DE CORREO DEL CONTACTO')) {
                sa.context = `${baseCommonPrompt}\n\n${seguimientoInstructions}`;
                modified = true;
                this.logger.log('Contexto del sub-agente de seguimiento actualizado con regla mandatoria de validación de correo del contacto.');
              } else {
                if (sa.context.includes("y solo después llama a 'createActivity'")) {
                  sa.context = sa.context.replace(
                    /y solo después llama a 'createActivity'/g,
                    "y en ese mismo turno continúa inmediatamente llamando a 'checkAvailability' o 'createActivity' para agendar la actividad sin pausas intermedias ni detenerte con 'final_answer'"
                  );
                  modified = true;
                }
                if (!sa.context.includes('REGLA ESTRICTA DE RECORDATORIOS')) {
                  sa.context += `\n\n- REGLA ESTRICTA DE RECORDATORIOS: El recordatorio registrado en el sistema es 100% INTERNO para el ejecutivo del CRM. El cliente NO recibe ningún recordatorio antes de la cita. Al confirmar la cita con 'final_answer', confírmale amablemente el día y la hora, pero está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará o que recibirá un recordatorio 1 hora antes o previo a la cita.`;
                  modified = true;
                  this.logger.log('Contexto de seguimiento actualizado con regla estricta de no prometer recordatorios al cliente.');
                }
              }
            }
            if (sa.key === 'soporte_atencion') {
              let sopToolsChanged = false;
              let tools = sa.tools ? [...sa.tools] : [];
              if (!tools.includes('requestHumanHandoff')) {
                tools.push('requestHumanHandoff');
                sopToolsChanged = true;
              }
              if (!tools.includes('consult_product_catalog')) {
                tools.push('consult_product_catalog');
                sopToolsChanged = true;
              }
              if (sopToolsChanged) {
                sa.tools = tools;
                modified = true;
                this.logger.log('Herramientas consult_product_catalog y requestHumanHandoff aseguradas en soporte_atencion.');
              }
              if (!sa.context || !sa.context.includes('DIRECTRICES RAG-FIRST')) {
                sa.context = `${baseCommonPrompt}\n\n${soporteInstructions}`;
                modified = true;
                this.logger.log('Contexto e instrucciones RAG-FIRST actualizadas en el sub-agente de soporte.');
              }
            }
            if (sa.key === 'general') {
              if (!sa.tools || !sa.tools.includes('consult_product_catalog')) {
                sa.tools = [...(sa.tools || []), 'consult_product_catalog'];
                modified = true;
              }
              if (!sa.context || !sa.context.includes('consult_product_catalog')) {
                sa.context = `${baseCommonPrompt}\n\n${generalInstructions}`;
                modified = true;
              }
            }
            if (sa.context && !sa.context.includes('OCULTAR ENLACES/URLS DE PDF')) {
              if (sa.key === 'comercial') sa.context = `${baseCommonPrompt}\n\n${comercialInstructions}`;
              else if (sa.key === 'seguimiento') sa.context = `${baseCommonPrompt}\n\n${seguimientoInstructions}`;
              else if (sa.key === 'soporte_atencion') sa.context = `${baseCommonPrompt}\n\n${soporteInstructions}`;
              else sa.context = `${baseCommonPrompt}\n\n${generalInstructions}`;
              modified = true;
              this.logger.log(`Contexto del sub-agente '${sa.key}' actualizado con la regla de ocultación de enlaces PDF.`);
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
          const activeTenants = await this.aiAgentConfigRepository.manager.query(
            `SELECT schema_name FROM public.tenants WHERE is_active = true`
          ).catch(() => []);

          // Asegurar que las herramientas RAG y del sistema estén presentes en los tenants
          for (const t of activeTenants) {
            const sName = t.schema_name;
            try {
              // 1. Sincronizar comercial: agregar sendQuotationPdf y consult_product_catalog a las herramientas si no las tiene
              const comSub = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, tools FROM "${sName}".ai_sub_agents WHERE key = 'comercial'`
              );
              if (comSub && comSub.length > 0) {
                let tools = comSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                let toolsUpdated = false;
                if (!tools.includes('sendQuotationPdf')) {
                  tools.push('sendQuotationPdf');
                  toolsUpdated = true;
                }
                if (!tools.includes('consult_product_catalog')) {
                  tools.push('consult_product_catalog');
                  toolsUpdated = true;
                }
                if (toolsUpdated) {
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'comercial'`,
                    [JSON.stringify(tools)]
                  );
                }
              }

              // Sincronizar comercial: actualizar contexto con directivas de validación y captura de datos de contacto
              const comSubContext = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, context FROM "${sName}".ai_sub_agents WHERE key = 'comercial'`
              );
              for (const csa of comSubContext) {
                if (!csa.context || !csa.context.includes('LIBRE CONVERSACIÓN SIN BLOQUEOS')) {
                  const updatedCtx = `${baseCommonPrompt}\n\n${comercialInstructions}`;
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE id = $2`,
                    [updatedCtx, csa.id]
                  );
                  this.logger.log(`Tenant '${sName}': contexto de sub-agente comercial actualizado con directivas de validación y captura de datos de contacto.`);
                }
              }

              // 2. Sincronizar soporte_atencion: agregar requestHumanHandoff y consult_product_catalog a las herramientas
              const sopSub = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, tools, context FROM "${sName}".ai_sub_agents WHERE key = 'soporte_atencion'`
              );
              if (sopSub && sopSub.length > 0) {
                let tools = sopSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                let sopToolsUpdated = false;
                if (!tools.includes('requestHumanHandoff')) {
                  tools.push('requestHumanHandoff');
                  sopToolsUpdated = true;
                }
                if (!tools.includes('consult_product_catalog')) {
                  tools.push('consult_product_catalog');
                  sopToolsUpdated = true;
                }
                if (sopToolsUpdated) {
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'soporte_atencion'`,
                    [JSON.stringify(tools)]
                  );
                  this.logger.log(`Tenant '${sName}': herramientas de soporte_atencion actualizadas con consult_product_catalog.`);
                }

                // Sincronizar contexto RAG-FIRST de soporte
                if (!sopSub[0].context || !sopSub[0].context.includes('DIRECTRICES RAG-FIRST')) {
                  const updatedSopCtx = `${baseCommonPrompt}\n\n${soporteInstructions}`;
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE key = 'soporte_atencion'`,
                    [updatedSopCtx]
                  );
                  this.logger.log(`Tenant '${sName}': contexto de soporte_atencion actualizado con directivas RAG-FIRST.`);
                }
              }

              // 3. Sincronizar seguimiento: agregar consult_product_catalog
              const segSub = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, tools FROM "${sName}".ai_sub_agents WHERE key = 'seguimiento'`
              );
              if (segSub && segSub.length > 0) {
                let tools = segSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                if (!tools.includes('consult_product_catalog')) {
                  tools.push('consult_product_catalog');
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'seguimiento'`,
                    [JSON.stringify(tools)]
                  );
                }
              }

              // 4. Sincronizar general: agregar consult_product_catalog y contexto
              const genSub = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, tools, context FROM "${sName}".ai_sub_agents WHERE key = 'general'`
              );
              if (genSub && genSub.length > 0) {
                let tools = genSub[0].tools || [];
                if (typeof tools === 'string') {
                  try { tools = JSON.parse(tools); } catch(e) {}
                }
                if (!tools.includes('consult_product_catalog')) {
                  tools.push('consult_product_catalog');
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET tools = $1::jsonb WHERE key = 'general'`,
                    [JSON.stringify(tools)]
                  );
                }
                if (!genSub[0].context || !genSub[0].context.includes('consult_product_catalog')) {
                  const updatedGenCtx = `${baseCommonPrompt}\n\n${generalInstructions}`;
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE key = 'general'`,
                    [updatedGenCtx]
                  );
                }
              }

              // 5. Sincronizar regla de ocultación de URLs PDF en el contexto de todos los sub-agentes del tenant
              const tenantSubAgents = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, key, context FROM "${sName}".ai_sub_agents`
              );
              for (const tsa of tenantSubAgents) {
                if (tsa.context && !tsa.context.includes('OCULTAR ENLACES/URLS DE PDF')) {
                  const updatedContext = tsa.context + '\n\nOCULTAR ENLACES/URLS DE PDF: Está estrictamente PROHIBIDO incluir direcciones URL, enlaces, links Markdown o nombres de archivo PDF en tu respuesta final de texto (\'final_answer\'). El sistema envía el archivo PDF real de forma nativa por el canal. En tu respuesta de texto, confírmale de forma muy amigable al cliente que le has enviado el archivo PDF de cotización adjunto, pero jamás escribas la URL del archivo (no pongas http://... o https://...).';
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE id = $2`,
                    [updatedContext, tsa.id]
                  );
                }
              }

              // 6. Sincronizar encadenamiento continuo y regla de recordatorios internos en sub-agente de seguimiento
              const segSubAgents = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, context FROM "${sName}".ai_sub_agents WHERE key = 'seguimiento'`
              );
              for (const ssa of segSubAgents) {
                let ctx = ssa.context || '';
                let changed = false;
                if (ctx.includes("y solo después llama a 'createActivity'")) {
                  ctx = ctx.replace(
                    /y solo después llama a 'createActivity'/g,
                    "y en ese mismo turno continúa inmediatamente llamando a 'checkAvailability' o 'createActivity' para agendar la actividad sin pausas intermedias ni detenerte con 'final_answer'"
                  );
                  changed = true;
                }
                if (!ctx.includes('REGLA ESTRICTA DE RECORDATORIOS')) {
                  ctx += `\n\n- REGLA ESTRICTA DE RECORDATORIOS: El recordatorio registrado en el sistema es 100% INTERNO para el ejecutivo del CRM. El cliente NO recibe ningún recordatorio antes de la cita. Al confirmar la cita con 'final_answer', confírmale amablemente el día y la hora, pero está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará o que recibirá un recordatorio 1 hora antes o previo a la cita.`;
                  changed = true;
                }
                if (changed) {
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE id = $2`,
                    [ctx, ssa.id]
                  );
                  this.logger.log(`Tenant '${sName}': contexto de seguimiento actualizado con regla de recordatorios internos.`);
                }
              }

              // 7. Sincronizar directivas de chat en vivo y multi-producto en sub-agente comercial del tenant
              const comSubAgents = await this.aiAgentConfigRepository.manager.query(
                `SELECT id, context FROM "${sName}".ai_sub_agents WHERE key = 'comercial'`
              );
              for (const csa of comSubAgents) {
                let ctx = csa.context || '';
                if (!ctx.includes('DIRECTIVAS DE CHAT EN VIVO Y MULTI-PRODUCTO')) {
                  const updatedCtx = `${baseCommonPrompt}\n\n${comercialInstructions}`;
                  await this.aiAgentConfigRepository.manager.query(
                    `UPDATE "${sName}".ai_sub_agents SET context = $1 WHERE id = $2`,
                    [updatedCtx, csa.id]
                  );
                  this.logger.log(`Tenant '${sName}': contexto comercial actualizado con directivas de chat en vivo y multi-producto.`);
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
          tools: ['registerContact', 'updateContact', 'checkAvailability', 'createActivity', 'consult_product_catalog'],
          temperature: 0.5,
          isActive: true,
        },
        {
          key: 'soporte_atencion',
          name: 'Sub-Agente de Soporte',
          description: 'Atiende incidencias de soporte, quejas y dudas técnicas. Consulta documentación RAG y FAQs antes de levantar tickets o derivar a ejecutivos humanos.',
          context: `${baseCommonPrompt}\n\n${soporteInstructions}`,
          tools: ['registerContact', 'updateContact', 'createTicket', 'requestHumanHandoff', 'consult_product_catalog'],
          temperature: 0.5,
          isActive: true,
        },
        {
          key: 'general',
          name: 'Sub-Agente Conversacional',
          description: 'Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales.',
          context: `${baseCommonPrompt}\n\n${generalInstructions}`,
          tools: ['consult_product_catalog'],
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
