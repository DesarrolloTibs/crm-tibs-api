---
title: Guía de Contexto y Recuperación para Agentes de IA (MCP Retrieval - CRM TIBS API)
tags:
  - "#indices-ai"
  - "#mcp"
  - "#antigravity"
  - "#backend"
date: 2026-09-08
status: produccion
---

# 🧭 Guía de Contexto y Recuperación para Agentes de IA (MCP Retrieval - API)

Esta guía estandariza el protocolo de consulta para que modelos de lenguaje y agentes de Antigravity recuperen con precisión quirúrgica el contexto técnico de **CRM TIBS API** utilizando las herramientas del servidor MCP **`obsidian-ss-api`**.

---

## 🗺️ 1. Mapa de Recuperación por Pregunta o Intención Técnica

| Intención o Consulta Técnica | Nota a Consultar con `vault_read` en `obsidian-ss-api` |
| :--- | :--- |
| ¿Cómo funciona el multi-tenancy dinámico y la inyección de esquemas en TypeORM? | `Proyectos/CRM TIBS - Multi-Tenancy Architecture.md` |
| ¿Qué tablas existen en el esquema público y cuáles se clonan en cada tenant? | `Proyectos/CRM TIBS - Database Schema & Data Models.md` |
| ¿Cómo se autentican las peticiones, cómo se validan los roles y cómo se recupera contraseña? | `Proyectos/CRM TIBS - Autenticacion, JWT & Seguridad.md` |
| ¿Cómo se gestionan los usuarios, avatares y la separación entre SuperAdmin y Tenant? | `Proyectos/CRM TIBS - Gestion de Usuarios, Roles & Permisos.md` |
| ¿Cómo se aprovisiona un nuevo tenant, se crean las tablas DDL y se gestionan las renovaciones? | `Proyectos/CRM TIBS - Aprovisionamiento de Tenants, Planes SaaS & Renovaciones.md` |
| ¿Cómo se generan las cotizaciones en PDF (PDFKit), pipelines y etapas ganadas/perdidas? | `Proyectos/CRM TIBS - Modulo de Oportunidades, Pipelines & Cotizaciones.md` |
| ¿Cómo se estructuran clientes, empresas, contactos M2M, actividades e interacciones? | `Proyectos/CRM TIBS - Modulo de Clientes, Empresas & CRM.md` |
| ¿Cómo opera la mesa de ayuda, Helpdesks, estados de tickets y el cron de SLAs? | `Proyectos/CRM TIBS - Modulo de Tickets & Helpdesk.md` |
| ¿Cómo funciona el agente de IA, LangGraph, herramientas agénticas y el RAG vectorial? | `Proyectos/CRM TIBS - AI Agent, RAG & LangGraph.md` |
| ¿Cómo funciona el Webchat público, bandeja de entrada y los 5 Gateways de WebSockets? | `Proyectos/CRM TIBS - Conversaciones, Webchat & WebSockets.md` |
| ¿Cómo se integran Google Calendar y Microsoft Outlook con webhooks? | `Proyectos/CRM TIBS - Integraciones de Calendario Externo.md` |
| ¿Cuáles son todos los DTOs, interfaces y entidades TypeORM del backend? | `Indices/Diccionario de Entidades y Modelos.md` |
| ¿Cuáles son todas las rutas REST, métodos HTTP y controladores del backend? | `Indices/Matriz de Endpoints y Servicios.md` |
| ¿Cuál es la visión general del backend, variables de entorno y deuda técnica? | `Proyectos/CRM TIBS API.md` |

---

## 🔒 2. Invariantes Arquitectónicas del Backend

1. **Aislamiento Estricto por Esquema (`SET search_path`):** Todo acceso a datos de negocio debe resolverse dentro del contexto del esquema del inquilino (`tenant_<slug>`) mediante el monkey-patch de TypeORM y `TenantContextService`. Nunca hardcodear nombres de esquemas en repositorios ni queries a menos que sea explícitamente en tablas compartidas de `public` (`tenants`, `plans`, `calendar_webhooks_mapping`).
2. **SuperAdmin Exclusivo en `public`:** Los usuarios con rol `superadmin` residen única y exclusivamente en `public.users`. El middleware `TenantMiddleware` depura automáticamente cualquier SuperAdmin residual en esquemas de inquilino.
3. **Manejo de Errores Estandarizado:** Todas las excepciones lanzadas por la API son interceptadas por `GlobalExceptionFilter` para generar un payload homogéneo `{ statusCode, message, timestamp, path }`.
4. **Desacoplamiento con Eventos Internos:** Se utiliza `EventEmitter2` (`@nestjs/event-emitter`) con comodines para emitir eventos de dominio (como `CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED`) y evitar dependencias circulares con los Gateways de WebSocket.
5. **Generación Segura de Identificadores:** Todas las tablas de entidades de negocio utilizan UUIDs nativos de PostgreSQL generados con `gen_random_uuid()` como clave primaria.
6. **Sincronización en Caliente de Documentación:** Cualquier cambio en controladores, servicios, endpoints o entidades en `src/` debe ser documentado de inmediato en las notas correspondientes de esta bóveda.
