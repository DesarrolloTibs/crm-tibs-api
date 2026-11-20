---
title: CRM TIBS - Módulo de Tickets & Helpdesk
type: technical-deep-dive
parent: "[[CRM TIBS API]]"
tags:
  - backend
  - tickets
  - helpdesk
  - soporte
  - sla
  - websockets
date: 2026-09-08
status: produccion
---

# 🎫 Módulo de Tickets & Mesa de Ayuda (Helpdesk)

## 1. Visión General del Sistema de Soporte
CRM TIBS API incorpora una solución completa de mesa de ayuda (Helpdesk) integrada con la cartera de clientes, permitiendo la gestión de incidencias, tickets de soporte post-venta, solicitudes de servicio y seguimiento de acuerdos de nivel de servicio (SLAs).

```mermaid
graph TD
    INC[Nueva Incidencia / Solicitud] --> T_CREATE[POST /api/tickets]
    T_CREATE --> FOLIO[Generación de Folio Único TK-XXXX]
    FOLIO --> HD[Asignación a Helpdesk / Departamento]
    HD --> AUTO_ASSIGN[Algoritmo de Asignación a Agente de Soporte]
    AUTO_ASSIGN --> STAGE_OPEN[Etapa Abierta stage_type=0]
    STAGE_OPEN --> SLA_CHECK[Monitoreo de SLAs Cron helpdesk_cron_configs]

    STAGE_OPEN --> COMMENTS[TicketInteractions: Notas Públicas & Internas]
    COMMENTS --> STAGE_RESOLVED[Etapa Resuelto / Cerrado stage_type=1]

    STAGE_OPEN -.->|WebSocket /tickets| LIVE_FEED[Actualización en tiempo real para agentes]
```

---

## 2. Entidades Principales

### 2.1. Tableros de Mesa de Ayuda (`Helpdesk` - `helpdesks`)
* Permite segmentar el soporte en múltiples departamentos o colas de atención (ej. Soporte Técnico Nivel 1, Facturación & Cobranza, Infraestructura Cloud).
* Define configuraciones de auto-asignación (Round-Robin o por carga de trabajo) y parámetros generales de notificación.

### 2.2. Etapas de Resolución (`TicketStage` - `ticket_stages`)
* Al igual que las etapas de venta, las etapas de soporte cuentan con clasificación semántica:
  * `stage_type = 0` (`OPEN`): El ticket se encuentra activo y consumiendo tiempo de SLA (ej. "Nuevo", "En Análisis", "En Espera de Proveedor").
  * `stage_type = 1` (`RESOLVED` / `CLOSED`): El ticket ha sido solucionado satisfactoriamente o archivado (ej. "Resuelto", "Cerrado"). Al alcanzar esta etapa, se detiene el cómputo de SLA.

### 2.3. Tickets (`Ticket` - `tickets`)
* Atributos principales:
  * `folio`: Código alfanumérico único para referencia del cliente y búsqueda rápida.
  * `asunto` y `descripcion`: Detalle técnico de la solicitud.
  * `prioridad`: Clasificación de severidad (`baja`, `media`, `alta`, `urgente`).
  * `sla_due_date`: Fecha y hora máxima de resolución calculada según la matriz de prioridad.
  * `client_id` y `company_id`: Vinculación directa con la ficha del cliente en el CRM.
  * `assigned_user_id`: Agente de soporte responsable de la atención.

---

## 3. Interacciones y Bitácora del Ticket (`TicketInteractionsModule`)
El módulo `ticket-interactions` gestiona el hilo de conversación de cada incidencia:
* **Comentarios Públicos:** Mensajes visibles para el cliente final, utilizados para solicitar aclaraciones o reportar avances.
* **Notas Internas Privadas:** Anotaciones de uso exclusivo para el equipo técnico (diagnósticos, credenciales temporales, bitácoras de pruebas) que nunca son visibles para el solicitante.
* **Adjuntos de Soporte:** Capturas de pantalla, archivos de log y documentos técnicos de diagnóstico.

---

## 4. Monitoreo de SLAs y Notificaciones en Tiempo Real
* **Cron de SLAs (`helpdesk_cron_configs`):** Proceso en segundo plano que evalúa periódicamente los tickets abiertos próximos a vencer su plazo de resolución. Si un ticket rebasa el 80% del tiempo de SLA sin resolver, escala la prioridad y genera una notificación al supervisor.
* **TicketsGateway (`src/tickets/tickets.gateway.ts`):** Gateway de Socket.IO en el namespace `/tickets` que transmite eventos de creación de tickets, reasignaciones y cambios de etapa hacia los paneles de los operadores en vivo.

---

## 5. Validación de Etapas Semánticas, Portal Público y RBAC (Bloque 2)
* **Configuración de Mesa de Ayuda (`HelpdesksController` / `UpdateMainHelpdeskDto`):**
  * `PATCH /api/helpdesks/main` y `PATCH /api/helpdesks/cron-config` restringen el acceso a usuarios `Admin` y `SuperAdmin`.
  * `UpdateMainHelpdeskDto` valida arreglos anidados `stages` (`HelpdeskStageInputDto`: `strname` ≤ 120, `strcolor` ≤ 20, `intmaxdays` `0..365`, `stage_type` en `0..1`, `display_order >= 0`) y `HelpdesksService.updateMainHelpdesk` valida que toda etapa con `id` pertenezca al `helpdesk.id` principal.
* **Tickets y Consulta Pública (`TicketsController`, `CreateTicketDto`, `UpdateTicketDto`, `GetTicketsFilterDto`, `PublicTicketQueryDto`):**
  * `GET /api/tickets` valida `stage_id` (UUID) y `showArchived` (boolean) vía `GetTicketsFilterDto`; `GET /api/tickets/public/query` valida `email` y exige formato estricto `/^#?\d{1,10}$/` en `ticketNumber` vía `PublicTicketQueryDto` (bloqueando cadenas parciales como `'12abc'`).
  * `CreateTicketDto` y `UpdateTicketDto` normalizan textos y vacíos (`'' -> null`/`undefined`) y acotan `strtitle`, `tipo_incidencia`, `contactName`, `contactEmail`, `companyName` ≤ 255 y `contactPhone` ≤ 50 (compatible con `clients.telefono`).
* **Reglas de Negocio en `TicketsService` e Integración IA:**
  * La exigencia obligatoria de `notas_resolucion` y asignación de `fecha_cierre` evalúa `stage.stage_type === 1 || stage.strname === 'Resuelto'` (resiliencia aunque se renombre la etapa en el tablero), además de validar que la nueva etapa pertenezca al `helpdesk_id` del ticket y que `responsable_id` / `cliente_id` existan antes de guardar.
  * Al crear automáticamente un `Client` desde un ticket externo o de IA, `TicketsService` aplica recorte preventivo (`nombre`/`apellido`/`empresa` ≤ 255, `telefono` ≤ 50) y tanto `AiAgentToolsHandlerService` como `WebchatActionExecutorService` hidratan el usuario responsable y sanean longitudes antes de delegar en `TicketsService.create`.
