---
title: MOC - Mapa de Contenidos CRM TIBS API
tags:
  - "#moc"
  - "#indices-ai"
  - "#backend"
  - "#crm"
date: 2026-09-08
status: produccion
---

# 🗺️ MOC - Mapa de Contenidos (Map of Content) Backend API

Índice maestro de arquitectura, módulos de negocio, persistencia, endpoints y directrices técnicas de **CRM TIBS API** (NestJS 11 + TypeORM + PostgreSQL Multi-Tenancy).

---

## 🏛️ 1. Arquitectura Central, Multi-Tenancy y Datos
* [[CRM TIBS API]] — **Hub Maestro Backend**. Visión general del CRM, arquitectura técnica, dependencias, variables de entorno y deuda técnica.
* [[CRM TIBS - Multi-Tenancy Architecture]] — Aislamiento dinámico **Database-Per-Schema** por esquemas PostgreSQL, `TenantMiddleware`, `TenantContextService` (`AsyncLocalStorage`) y monkey-patch sobre `PostgresQueryRunner`.
* [[CRM TIBS - Database Schema & Data Models]] — Catálogo de tablas públicas vs tablas clonadas en esquemas `tenant_*`, relaciones TypeORM, claves foráneas e índices.
* [[CRM TIBS - Autenticacion, JWT & Seguridad]] — Tokens Bearer JWT, estrategias Passport (`jwt`, `local`), guards de ruta, recuperación de contraseña por token y rate limiting estratificado.
* [[CRM TIBS - Gestion de Usuarios, Roles & Permisos]] — Modelo RBAC: `superadmin` (residente en `public.users`), `admin` y `executive` (residentes en esquemas de inquilino), avatares y control de estado.
* [[CRM TIBS - Aprovisionamiento de Tenants, Planes SaaS & Renovaciones]] — Transacción DDL de aprovisionamiento de inquilinos, cuotas de tokens para IA, cola de renovaciones y cron de suscripciones.

---

## 💼 2. Gestión Comercial, Ventas y CRM
* [[CRM TIBS - Modulo de Oportunidades, Pipelines & Cotizaciones]] — Pipelines y etapas con clasificación semántica (`stage_type`: open, won, lost), generación de cotizaciones en PDF con `PDFKit`, envío a conversaciones, adjuntos y tracking temporal.
* [[CRM TIBS - Modulo de Clientes, Empresas & CRM]] — Directorio de contactos y empresas (relación 1:N y Many-to-Many para oportunidades/actividades), bitácora de interacciones, actividades y recordatorios programados.
* [[CRM TIBS - Modulo de Tickets & Helpdesk]] — Mesa de ayuda multicanal: Helpdesks, etapas de tickets, prioridades, asignación automática, interacciones de soporte y cron de SLAs.

---

## 🤖 3. Inteligencia Artificial, Omnicanalidad y Tiempo Real
* [[CRM TIBS - AI Agent, RAG & LangGraph]] — Motor agéntico multi-agente, bucle de inferencia con LangGraph, herramientas del agente (`AiAgentToolsHandlerService`), pipeline RAG con `PGVectorStore`, ingestión de PDFs y soporte para Google GenAI, OpenAI y Watsonx Embeddings.
* [[CRM TIBS - Conversaciones, Webchat & WebSockets]] — Bandeja de entrada unificada, widget público de Webchat, alternancia entre IA y operador humano, y los 5 Gateways de Socket.IO (`/conversations`, `/notifications`, `/activities`, `/pipelines`, `/tickets`).
* [[CRM TIBS - Integraciones de Calendario Externo]] — Coordinador de sincronización bidireccional con Google Calendar y Microsoft Outlook (Graph API), con recepción de webhooks push y tabla de mapeo global.

---

## 📚 4. Índices Técnicos y Soporte para Agentes de IA
* [[Diccionario de Entidades y Modelos]] — Compendio exhaustivo de las 38 entidades TypeORM, interfaces, enumeraciones y DTOs del sistema.
* [[Matriz de Endpoints y Servicios]] — Mapeo completo de las 65+ rutas REST expuestas, métodos HTTP, controladores, servicios inyectados y persistencia.
* [[Guia de Contexto para Agentes de IA (MCP Retrieval)]] — Protocolo de búsqueda semántica y recuperación contextual para modelos LLM y asistentes Antigravity que utilicen el servidor MCP `obsidian-ss-api`.
