---
description: Reglas para la interacción con el MCP de Obsidian (obsidian-ss-api) y desarrollo en CRM TIBS API
globs: src/**/*
alwaysApply: true
---

# Regla de Integración: Obsidian SS API como Base de Conocimiento

## 1. Identificación del Servidor MCP
El servidor MCP para el backend de CRM TIBS API es **`obsidian-ss-api`** (puerto local `27129`).

## 2. Protocolo de Consulta para Preguntas y Tareas de Desarrollo
Cuando el usuario formule preguntas o solicite cambios sobre:
- "¿Cómo funciona el multi-tenancy y el middleware de esquemas?"
- "¿Cómo se generan las cotizaciones en PDF o los pipelines?"
- "¿Cómo interactúa el agente de IA con LangGraph o el vector store de PGVector?"
- "¿Cómo funcionan los webhooks de Google Calendar o Microsoft Outlook?"
- "¿Cuáles son las entidades de la base de datos o los endpoints expuestos?"

El agente **DEBE PRIMERO**:
1. Consultar el índice de recuperación `Indices/Guia de Contexto para Agentes de IA (MCP Retrieval).md` o `Indices/MOC - Mapa de Contenidos Backend.md` usando `vault_read` en el servidor MCP `obsidian-ss-api`.
2. Leer la nota técnica específica en `Proyectos/` para obtener el contexto arquitectónico completo antes de responder o modificar código en `src/`.

## 3. Mantenimiento y Sincronización de la Bóveda
Cualquier modificación estructural en el código fuente de `src/` (controladores, servicios, entidades TypeORM, gateways de WebSocket o módulos) debe ser replicada en las notas correspondientes de la bóveda usando las herramientas MCP de `obsidian-ss-api` (`vault_patch` o `vault_write`).
