---
title: CRM TIBS - AI Agent, RAG & LangGraph
type: technical-deep-dive
parent: "[[CRM TIBS API]]"
tags:
  - backend
  - ai
  - rag
  - langgraph
  - langchain
  - embeddings
  - pgvector
date: 2026-09-08
status: produccion
---

# 🤖 Motor de Inteligencia Artificial, RAG & LangGraph

## 1. Visión General de la Arquitectura de IA
CRM TIBS API incorpora una capa cognitiva de última generación diseñada para automatizar la atención comercial y soporte a través de agentes inteligentes conversacionales. El sistema integra **LangChain**, **LangGraph**, modelos de lenguaje avanzados (Google Gemini, OpenAI, IBM Watsonx) y una base de datos vectorial en PostgreSQL con **PGVectorStore** para recuperación contextual aumentada (RAG).

```mermaid
graph TD
    USER_MSG[Mensaje del Prospecto / Webchat] --> ORCH[AiAgentOrchestratorService]
    ORCH --> SUB_VAL[SubscriptionValidatorService: Valida cuota de tokens]
    SUB_VAL --> GRAPH[LangGraph Inference Loop / Grafo de Decisión]

    subgraph LangGraph Decision Node
        GRAPH -->|Requiere Información Documental| RAG[RagService: Similarity Search en PGVectorStore]
        GRAPH -->|Requiere Acción en CRM| TOOLS[AiAgentToolsHandlerService]
        GRAPH -->|Respuesta Directa| LLM[LLM: Gemini / OpenAI / Watsonx]
    end

    subgraph Herramientas del CRM
        TOOLS --> T_PROD[Consultar Catálogo de Productos]
        TOOLS --> T_OPP[Consultar Estado de Oportunidades]
        TOOLS --> T_ACT[Agendar Citas y Actividades]
        TOOLS --> T_TICK[Crear Tickets de Soporte]
        TOOLS --> T_SUB[Transferir a Sub-Agente Especializado]
    end

    RAG --> PGVEC[(PostgreSQL: PGVectorStore)]
    LLM --> OUT_MSG[Respuesta Final Sintetizada]
    OUT_MSG --> EMIT[Socket.IO /conversations & Persistencia en messages]
```

---

## 2. Orquestador Agéntico (`AiAgentOrchestratorService` & `AiAgentToolsHandlerService`)

### 2.1. Bucle de Inferencia con LangGraph
En lugar de depender de prompts estáticos, el agente opera mediante un grafo de estados computacional (**LangGraph**):
1. **Nodo de Análisis:** Analiza la intención del mensaje del cliente y el historial conversacional.
2. **Nodo de Herramientas (Tools Calling):** Si el modelo detecta la necesidad de ejecutar una acción en el CRM o consultar datos corporativos, genera una llamada a función estructurada.
3. **Nodo de Ejecución:** `AiAgentToolsHandlerService` ejecuta la acción de forma segura dentro del esquema del inquilino activo.
4. **Nodo de Síntesis:** El modelo incorpora los datos retornados por las herramientas y redacta una respuesta coherente con el tono definido en `AiAgentConfig`.

### 2.2. Catálogo de Herramientas Disponibles para el Agente:
* `consult_product_catalog`: Consulta productos, precios vigentes y características técnicas con soporte RAG.
* `createOpportunity` / `modifyOpportunity`: Registra o edita cotizaciones y oportunidades comerciales.
* `createActivity`: Agenda citas, llamadas o reuniones en la agenda del ejecutivo.
  * **Validación Obligatoria de Correo:** Si la actividad se relaciona a un contacto, el sistema valida estrictamente que cuente con correo electrónico asignado en el CRM. Si el contacto no tiene correo, el agente solicita amablemente el correo al cliente antes de agendar y lo persiste con `updateContact`. Queda prohibido llamar a `createActivity` sin correo.
* `checkAvailability`: Valida disponibilidad de agenda sin colisiones previo a la creación de actividades.
* `updateContact` / `registerContact`: Identifica y persiste datos de prospectos y clientes.
* `createTicket`: Levanta un ticket de soporte técnico si el usuario reporta una falla o queja.
* `requestHumanHandoff`: Deriva la conversación a un ejecutivo especializado y desactiva el bot.

## 3. Pipeline de RAG y Búsqueda Vectorial (`src/rag`)

### 3.1. Ingestión y Procesamiento de Documentos (`POST /api/rag/upload`)
1. **Recepción:** El usuario sube manuales técnicos, catálogos de servicios o políticas en formato PDF.
2. **Extracción:** Se extrae el texto puro utilizando `pdf-parse`.
3. **Chunking Semántico:** `RecursiveCharacterTextSplitter` divide el texto en fragmentos óptimos (chunk size: 1000 caracteres, chunk overlap: 200) respetando saltos de párrafo y oraciones.
4. **Generación de Embeddings Vectoriales:**
   * El sistema selecciona el modelo configurado por el inquilino:
     * **Google Generative AI:** `text-embedding-004` (vía `@langchain/google-genai`).
     * **OpenAI:** `text-embedding-3-small` (vía `@langchain/openai`).
     * **IBM Watsonx:** Adaptador nativo `CustomWatsonxEmbeddings` que negocia tokens OAuth IAM (`https://iam.cloud.ibm.com/identity/token`) y genera vectores con `ibm/slate-125m-english-rtrvr`.
5. **Persistencia Vectorial:** Los vectores y metadatos se almacenan en la tabla vectorial de PostgreSQL mediante `PGVectorStore`.

### 3.2. Consulta Semántica (`POST /api/rag/query`)
* Ante una duda del cliente, el servicio convierte la pregunta en vector y ejecuta una búsqueda por similitud de coseno (`similaritySearchWithScore`), inyectando los fragmentos documentales más relevantes en el contexto del prompt del agente.

---

## 4. Control de Consumo de Tokens y Cuotas
* Antes y después de cada invocación a los modelos generativos, `SubscriptionValidatorService` calcula el total de tokens de entrada (`prompt_tokens`) y salida (`completion_tokens`).
* Actualiza el consumo acumulado del tenant en el periodo y emite el evento `CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED` a través de `EventEmitter2` para actualizar en vivo el indicador de consumo en la interfaz de usuario.


### 🔄 Actualización de Encadenamiento Continuo en Agendamiento (`seguimiento`)
* **Problema Previo:** Al solicitar el correo electrónico al cliente para agendar una cita o actividad, la herramienta `updateContact` ejecutaba con éxito pero el orquestador forzaba una instrucción de respuesta `final_answer` inmediata. Esto provocaba que el bot dijera que procedería a verificar la disponibilidad pero cerraba el turno sin llamar a `checkAvailability` ni a `createActivity`.
* **Solución Implementada:**
  1. En `ai-agent-orchestrator.service.ts`: Se ajustó la inyección de directivas post-ejecución de herramientas para `updateContact` y `registerContact`. Si el cliente ya había expresado su día y horario de preferencia (ej. *"mañana a las 10 am"*), se instruye al subagente a continuar **en ese mismo turno** invocando `checkAvailability` o `createActivity` sin emitir `final_answer` anticipado.
  2. Asimismo, cuando `checkAvailability` devuelve `available: true` y el contacto ya cuenta con correo registrado, se instruye explícitamente a llamar inmediatamente a `createActivity`.
  3. Sincronización en `ai-sub-agent-migration.service.ts` y `tenant-provisioner.service.ts`: Se actualizó el prompt del subagente `seguimiento` en la base de datos para todos los esquemas de tenants activos (`tenant_teter`, etc.) para asegurar el agendamiento fluido de extremo a extremo en una sola interacción.


### 🔔 Regla Estricta: Recordatorios de Actividad Exclusivamente Internos
* **Comportamiento Ajustado:** El recordatorio creado con `createActivity` (`reminderOffsetMinutes`, por defecto 60 minutos antes) es **exclusivamente interno para la agenda y notificaciones del ejecutivo/usuario del CRM**.
* **Directiva Agéntica:** Se incorporó en `ai-agent-orchestrator.service.ts`, `ai-sub-agent-migration.service.ts` y `tenant-provisioner.service.ts` la instrucción explícita que prohíbe terminantemente al Agente de IA prometer o mencionar al cliente en su respuesta final que recibirá un recordatorio una hora antes de la cita. La confirmación al cliente se limita únicamente a informarle la fecha y hora agendada.
