---
title: Matriz de Endpoints y Servicios - CRM TIBS API
tags:
  - "#indices-ai"
  - "#endpoints"
  - "#rutas"
  - "#controladores"
  - "#backend"
date: 2026-09-08
status: produccion
---

# 📡 Matriz de Endpoints y Servicios

Esta tabla relaciona exhaustivamente las rutas HTTP del backend NestJS 11, los controladores (`src/**/*.controller.ts`), los servicios inyectados (`src/**/*.service.ts`) y la persistencia en TypeORM.

---

| Módulo | Endpoint Backend | Método | Controlador | Método en Servicio | Auth / Guard | Persistencia / Entidad |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| **Auth** | `/api/auth/login` | POST | `AuthController` | `AuthService.login()` | LocalGuard | `users` / bcrypt |
| **Auth** | `/api/auth/forgot-password` | POST | `AuthController` | `AuthService.forgotPassword()` | Público | `users` (reset token) |
| **Auth** | `/api/auth/reset-password` | POST | `AuthController` | `AuthService.resetPassword()` | Público | `users` (update pwd) |
| **Users** | `/api/users` | POST | `UsersController` | `UsersService.create()` | JWT | `User` |
| **Users** | `/api/users` | GET | `UsersController` | `UsersService.findAll()` | JWT | `User` |
| **Users** | `/api/users/active` | GET | `UsersController` | `UsersService.findAllActive()` | JWT | `User` |
| **Users** | `/api/users/:id` | GET | `UsersController` | `UsersService.findOneById()` | JWT | `User` |
| **Users** | `/api/users/:id` | PATCH | `UsersController` | `UsersService.update()` | JWT | `User` |
| **Users** | `/api/users/:id/status` | PATCH | `UsersController` | `UsersService.updateStatus()` | JWT | `User` |
| **Users** | `/api/users/:id/profile-image` | POST | `UsersController` | `UsersService.updateProfileImage()`| JWT | `User` (avatar local/Azure) |
| **Tenants** | `/api/tenants/provision` | POST | `TenantsController` | `TenantsService.provision()` | SuperAdmin | `public.tenants` + DDL |
| **Tenants** | `/api/tenants/consumption` | GET | `TenantsController` | `TenantsService.getConsumption()` | JWT | Tokens & cuotas |
| **Tenants** | `/api/tenants/my-tenant` | GET | `TenantsController` | `TenantsService.getCurrentTenant()` | JWT | `Tenant` |
| **Tenants** | `/api/tenants` | GET | `TenantsController` | `TenantsService.findAll()` | SuperAdmin | `Tenant` |
| **Tenants** | `/api/tenants/:id` | GET | `TenantsController` | `TenantsService.findOne()` | SuperAdmin | `Tenant` |
| **Tenants** | `/api/tenants/:id/logo` | POST | `TenantsController` | `TenantsService.updateLogo()` | JWT | `Tenant.logo` |
| **Tenants** | `/api/tenants/:id/plan` | PUT | `TenantsController` | `TenantsService.updatePlan()` | SuperAdmin | `Tenant.plan_id` |
| **Tenants** | `/api/tenants/:id/enqueue-renewal`| POST | `TenantsController` | `TenantsService.enqueueRenewal()` | SuperAdmin | `tenant_renewal_queue` |
| **Tenants** | `/api/tenants/:id/allow-extra` | PUT | `TenantsController` | `TenantsService.updateAllowExtra()` | SuperAdmin | `Tenant.allow_extra` |
| **Tenants** | `/api/tenants/:id` | PUT | `TenantsController` | `TenantsService.update()` | SuperAdmin | `Tenant` |
| **Tenants** | `/api/tenants/:id` | DELETE | `TenantsController` | `TenantsService.remove()` | SuperAdmin | `Tenant` / DROP SCHEMA |
| **Plans** | `/api/plans` | GET | `PlansController` | `PlansService.findAll()` | JWT | `Plan` |
| **Plans** | `/api/plans/:id` | GET | `PlansController` | `PlansService.findOne()` | JWT | `Plan` |
| **Plans** | `/api/plans` | POST | `PlansController` | `PlansService.create()` | SuperAdmin | `Plan` |
| **Plans** | `/api/plans/:id` | PUT | `PlansController` | `PlansService.update()` | SuperAdmin | `Plan` |
| **Plans** | `/api/plans/:id` | DELETE | `PlansController` | `PlansService.remove()` | SuperAdmin | `Plan` |
| **Clients** | `/api/clients` | POST | `ClientsController` | `ClientsService.create()` | JWT | `Client` |
| **Clients** | `/api/clients` | GET | `ClientsController` | `ClientsService.findAll()` | JWT | `Client` |
| **Clients** | `/api/clients/:id` | GET | `ClientsController` | `ClientsService.findOne()` | JWT | `Client` |
| **Clients** | `/api/clients/:id` | PATCH | `ClientsController` | `ClientsService.update()` | JWT | `Client` |
| **Clients** | `/api/clients/:id` | DELETE | `ClientsController` | `ClientsService.remove()` | JWT | `Client` |
| **Companies** | `/api/companies` | POST | `CompaniesController` | `CompaniesService.create()` | JWT | `Company` |
| **Companies** | `/api/companies` | GET | `CompaniesController` | `CompaniesService.findAll()` | JWT | `Company` |
| **Companies** | `/api/companies/:id` | GET | `CompaniesController` | `CompaniesService.findOne()` | JWT | `Company` |
| **Companies** | `/api/companies/:id` | PATCH | `CompaniesController` | `CompaniesService.update()` | JWT | `Company` |
| **Companies** | `/api/companies/:id` | DELETE | `CompaniesController` | `CompaniesService.remove()` | JWT | `Company` |
| **Opportunities** | `/api/opportunities` | POST | `OpportunitiesController` | `OpportunitiesService.create()` | JWT | `Opportunity` |
| **Opportunities** | `/api/opportunities` | GET | `OpportunitiesController` | `OpportunitiesService.findAll()` | JWT | `Opportunity` (filtros) |
| **Opportunities** | `/api/opportunities/all`| GET | `OpportunitiesController` | `OpportunitiesService.findAllUnfiltered()` | JWT | `Opportunity` |
| **Opportunities** | `/api/opportunities/:id`| GET | `OpportunitiesController` | `OpportunitiesService.findOne()` | JWT | `Opportunity` |
| **Opportunities** | `/api/opportunities/:id`| PATCH | `OpportunitiesController` | `OpportunitiesService.update()` | JWT | `Opportunity` |
| **Opportunities** | `/api/opportunities/:id`| DELETE | `OpportunitiesController` | `OpportunitiesService.remove()` | JWT | `Opportunity` |
| **Opportunities** | `/api/opportunities/:id/quotation-pdf` | POST | `OpportunitiesController` | `QuotationPdfService.generateQuotationPdf()` | JWT | Genera PDF (PDFKit) |
| **Opportunities** | `/api/opportunities/:id/quotation-pdf` | GET | `OpportunitiesController` | `QuotationPdfService.generateQuotationPdf()` | JWT | Stream PDF |
| **Opportunities** | `/api/opportunities/:id/quotation-pdf/send`| POST | `OpportunitiesController` | `QuotationPdfService.sendQuotationToChannel()`| JWT | Envío a conversación |
| **Opportunities** | `/api/opportunities/:id/files` | POST | `OpportunitiesController` | `OpportunitiesService.addOpportunityFile()` | JWT | `OpportunityFile` |
| **Opportunities** | `/api/opportunities/:id/files/:fileId/download`| GET | `OpportunitiesController`| `OpportunitiesService.downloadFile()` | JWT | Descarga de archivo |
| **Opportunities** | `/api/opportunities/:id/files/:fileId`| DELETE | `OpportunitiesController`| `OpportunitiesService.deleteOpportunityFile()` | JWT | Eliminación de archivo |
| **Opportunities** | `/api/opportunities/:id/archive`| PATCH | `OpportunitiesController` | `OpportunitiesService.archive()` | JWT | `Opportunity.archived` |
| **Opportunity Trackings** | `/api/opportunity-trackings` | GET | `OpportunityTrackingsController` | `OpportunityTrackingsService.findAll()` | JWT | `OpportunityTracking` |
| **Pipelines** | `/api/pipelines` | GET | `PipelinesController` | `PipelinesService.findAll()` | JWT | `Pipeline` / `Stage` |
| **Pipelines** | `/api/pipelines` | POST | `PipelinesController` | `PipelinesService.create()` | JWT | `Pipeline` |
| **Pipelines** | `/api/pipelines/:id` | PATCH | `PipelinesController` | `PipelinesService.update()` | JWT | `Pipeline` |
| **Pipelines** | `/api/pipelines/:id` | DELETE | `PipelinesController` | `PipelinesService.remove()` | JWT | `Pipeline` |
| **Activities** | `/api/activities` | POST | `ActivitiesController` | `ActivitiesService.create()` | JWT | `Activity` + Sockets |
| **Activities** | `/api/activities` | GET | `ActivitiesController` | `ActivitiesService.findAll()` | JWT | `Activity` |
| **Activities** | `/api/activities/:id` | GET | `ActivitiesController` | `ActivitiesService.findOne()` | JWT | `Activity` |
| **Activities** | `/api/activities/:id` | PATCH | `ActivitiesController` | `ActivitiesService.update()` | JWT | `Activity` |
| **Activities** | `/api/activities/:id` | DELETE | `ActivitiesController` | `ActivitiesService.remove()` | JWT | `Activity` |
| **Interactions** | `/api/interactions` | POST | `InteractionsController` | `InteractionsService.create()` | JWT | `Interaction` |
| **Interactions** | `/api/interactions/client/:clientId` | GET | `InteractionsController` | `InteractionsService.findByClient()` | JWT | `Interaction` |
| **Reminders** | `/api/reminders` | POST | `RemindersController` | `RemindersService.create()` | JWT | `Reminder` |
| **Reminders** | `/api/reminders/user` | GET | `RemindersController` | `RemindersService.findByUser()` | JWT | `Reminder` |
| **Tickets** | `/api/tickets` | POST | `TicketsController` | `TicketsService.create()` | JWT | `Ticket` |
| **Tickets** | `/api/tickets` | GET | `TicketsController` | `TicketsService.findAll()` | JWT | `Ticket` |
| **Tickets** | `/api/tickets/:id` | GET | `TicketsController` | `TicketsService.findOne()` | JWT | `Ticket` |
| **Tickets** | `/api/tickets/:id` | PATCH | `TicketsController` | `TicketsService.update()` | JWT | `Ticket` |
| **Tickets** | `/api/tickets/:id` | DELETE | `TicketsController` | `TicketsService.remove()` | JWT | `Ticket` |
| **Helpdesks** | `/api/helpdesks` | GET | `HelpdesksController` | `HelpdesksService.findAll()` | JWT | `Helpdesk` |
| **Helpdesks** | `/api/helpdesks` | POST | `HelpdesksController` | `HelpdesksService.create()` | JWT | `Helpdesk` |
| **Helpdesks** | `/api/helpdesks/:id` | PATCH | `HelpdesksController` | `HelpdesksService.update()` | JWT | `Helpdesk` |
| **Ticket Interactions** | `/api/ticket-interactions` | POST | `TicketInteractionsController` | `TicketInteractionsService.create()` | JWT | `TicketInteraction` |
| **Products** | `/api/products` | GET | `ProductsController` | `ProductsService.findAll()` | JWT | `Product` |
| **Products** | `/api/products` | POST | `ProductsController` | `ProductsService.create()` | JWT | `Product` |
| **Expenses** | `/api/expenses` | GET | `ExpensesController` | `ExpensesService.findAll()` | JWT | `Expense` |
| **Expenses** | `/api/expenses` | POST | `ExpensesController` | `ExpensesService.create()` | JWT | `Expense` |
| **RAG** | `/api/rag/upload` | POST | `RagController` | `RagService.processAndStoreDocument()` | JWT | `PGVectorStore` |
| **RAG** | `/api/rag/query` | POST | `RagController` | `RagService.queryVectorStore()` | JWT | Búsqueda semántica |
| **Conversations**| `/api/conversations` | GET | `ConversationsController` | `ConversationsService.findAll()` | JWT | `Conversation` |
| **Conversations**| `/api/conversations/:id/messages` | GET | `ConversationsController` | `ConversationsService.getMessages()` | JWT | `Message` |
| **Conversations**| `/api/conversations/:id/toggle-bot`| PATCH | `ConversationsController` | `ConversationsService.toggleBot()` | JWT | `bot_active` |
| **Webchat** | `/api/webchat/init` | POST | `WebchatController` | `WebchatService.initSession()` | Público | `Conversation` |
| **Webchat** | `/api/webchat/message` | POST | `WebchatController` | `WebchatService.handleInboundMessage()` | Público | Agente IA / Socket |
| **Calendar** | `/api/calendar-integrations/connect/:provider` | GET | `CalendarIntegrationsController`| `CalendarSyncCoordinatorService.getAuthUrl()` | JWT | OAuth 2.0 URL |
| **Calendar** | `/api/calendar-integrations/oauth-callback/:provider`| GET | `CalendarIntegrationsController`| `CalendarSyncCoordinatorService.handleCallback()` | Público | Tokens OAuth |
| **Calendar Webhooks**| `/api/calendar-webhooks/google` | POST | `CalendarWebhooksController` | `GoogleCalendarService.handleWebhook()` | Público | Mapeo global + sync |
| **Calendar Webhooks**| `/api/calendar-webhooks/outlook`| POST | `CalendarWebhooksController` | `OutlookCalendarService.handleWebhook()` | Público | Validación token MS |
| **Reports** | `/api/reports/dashboard` | GET | `ReportsController` | `ReportsService.getDashboardIndicators()` | JWT | Métricas agregadas |
| **Notifications** | `/api/notifications` | GET | `NotificationsController` | `NotificationsService.findAll()` | JWT | `Notification` |

---

## 🔗 Enlaces Relacionados
* [[CRM TIBS API]] — Hub Central del Backend.
* [[Diccionario de Entidades y Modelos]] — Diccionario de entidades TypeORM y DTOs.
* [[CRM TIBS - Multi-Tenancy Architecture]] — Middleware de resolución de esquemas.
