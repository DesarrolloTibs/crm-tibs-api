import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TenantContextService } from './tenant-context.service';

import { ProvisionTenantDto } from '../tenants/dto/provision-tenant.dto';
import { addBillingMonths } from '../common/utils/billing-date.util';


export interface ProvisionResult {
  tenantId: number;
  schemaName: string;
  adminUsername: string;
  adminEmail: string;
  tempPassword: string;
  nextRenewalDate: Date;
}

@Injectable()
export class TenantProvisionerService {
  constructor(private readonly dataSource: DataSource) {}

  async provisionTenant(dto: ProvisionTenantDto): Promise<ProvisionResult> {
    const { tenantName, adminUsername, adminEmail, planId } = dto;
    const billingPeriodMonths = dto.billingPeriodMonths || 1;

    // 1. Sanitizar y validar slug
    const schemaName = TenantContextService.generateSlug(tenantName);
    if (!TenantContextService.validateSchemaName(schemaName)) {
      throw new BadRequestException(`El nombre de esquema generado '${schemaName}' no es válido.`);
    }

    // 2. Ejecutar todo en una sola transacción PostgreSQL
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el esquema no exista previamente
      const schemaCheck = await queryRunner.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName]
      );
      if (schemaCheck.length > 0) {
        throw new BadRequestException(`La organización o esquema '${schemaName}' ya existe.`);
      }

      // a) Crear Esquema
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await queryRunner.query(`SET search_path TO "${schemaName}", public`);

      // b) DDL de Tablas Locales dentro del Esquema del Tenant
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".users (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          username varchar(100) NOT NULL UNIQUE,
          email varchar(255) NOT NULL UNIQUE,
          password varchar(255) NOT NULL,
          role varchar(20) NOT NULL DEFAULT 'executive',
          "isActive" boolean NOT NULL DEFAULT true,
          "profileImageUrl" varchar(500) NULL,
          reset_password_token varchar(255) NULL,
          reset_password_expires timestamptz NULL,
          "createdById" uuid NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_users PRIMARY KEY (id)
        );



        CREATE TABLE IF NOT EXISTS "${schemaName}".tblpipelinescatalog (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(100) NOT NULL,
          strdescription text NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmcreated timestamptz NOT NULL DEFAULT now(),
          dtmlastmodified timestamptz NOT NULL DEFAULT now(),
          intlastmodifiedby integer NOT NULL DEFAULT 1,
          CONSTRAINT pk_tblpipelinescatalog PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".tblstagescatalog (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(120) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          bln_show_dashboard boolean NOT NULL DEFAULT true,
          pipeline_id uuid NOT NULL,
          display_order integer NOT NULL DEFAULT 0,
          strcolor varchar(20) NULL,
          blninitial boolean NOT NULL DEFAULT false,
          intmaxdays integer NULL,
          dtmcreated timestamptz NOT NULL DEFAULT now(),
          dtmlastmodified timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_tblstagescatalog PRIMARY KEY (id),
          CONSTRAINT fk_stages_pipeline FOREIGN KEY (pipeline_id) REFERENCES "${schemaName}".tblpipelinescatalog(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".tblbusinesslines (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          CONSTRAINT pk_tblbusinesslines PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".tbldeliverytypes (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          CONSTRAINT pk_tbldeliverytypes PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".tblicensings (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          CONSTRAINT pk_tblicensings PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".tbloportunitylabels (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NULL,
          field_key varchar(50) NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmlastmodified timestamptz NULL DEFAULT now(),
          uuidlastmodifiedby uuid NULL,
          CONSTRAINT pk_tbloportunitylabels PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".tbloportunitylabels ADD COLUMN IF NOT EXISTS uuidlastmodifiedby uuid NULL;
        ALTER TABLE "${schemaName}".tbloportunitylabels ADD COLUMN IF NOT EXISTS dtmlastmodified timestamptz NULL DEFAULT now();
        ALTER TABLE "${schemaName}".tbloportunitylabels ADD COLUMN IF NOT EXISTS field_key varchar(50) NULL;


        CREATE TABLE IF NOT EXISTS "${schemaName}".companies (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          nombre varchar(255) NOT NULL,
          correo varchar(255) NULL,
          telefono varchar(50) NULL,
          website varchar(255) NULL,
          direccion varchar(512) NULL,
          estatus boolean NOT NULL DEFAULT true,
          ejecutivo_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_companies PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".clients (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          nombre varchar(255) NOT NULL,
          apellido varchar(255) NULL DEFAULT '',
          correo varchar(255) NULL,
          empresa varchar(255) NULL,
          puesto varchar(255) NULL,
          telefono varchar(50) NULL,
          category varchar(50) NOT NULL DEFAULT 'Lead',
          estatus boolean NOT NULL DEFAULT true,
          ejecutivo_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          "companyId" uuid NULL REFERENCES "${schemaName}".companies(id) ON DELETE SET NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_clients PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".opportunities (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          nombre_proyecto varchar(255) NOT NULL,
          description text NULL,
          cliente_id uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          empresa varchar(255) NULL,
          "companyId" uuid NULL REFERENCES "${schemaName}".companies(id) ON DELETE SET NULL,
          ejecutivo_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          pipeline_id uuid NULL REFERENCES "${schemaName}".tblpipelinescatalog(id) ON DELETE SET NULL,
          stage_id uuid NULL REFERENCES "${schemaName}".tblstagescatalog(id) ON DELETE SET NULL,
          monto_licenciamiento numeric(10,2) NOT NULL DEFAULT 0.00,
          monto_servicios numeric(10,2) NOT NULL DEFAULT 0.00,
          monto_total numeric(10,2) NOT NULL DEFAULT 0.00,
          moneda varchar(10) NOT NULL DEFAULT 'USD',
          linea_negocio_id uuid NULL REFERENCES "${schemaName}".tblbusinesslines(id) ON DELETE SET NULL,
          tipo_entrega_id uuid NULL REFERENCES "${schemaName}".tbldeliverytypes(id) ON DELETE SET NULL,
          licenciamiento_id uuid NULL REFERENCES "${schemaName}".tblicensings(id) ON DELETE SET NULL,
          proposal_document_path varchar(512) NULL,
          archived boolean NOT NULL DEFAULT false,
          "tipoCambio" numeric(10,2) NULL,
          estimated_closure_date date NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          stage_entered_at timestamptz NULL,
          priority varchar(20) NULL DEFAULT 'Media',
          canal_origen varchar(50) NOT NULL DEFAULT 'manual',
          CONSTRAINT pk_opportunities PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".opportunities ADD COLUMN IF NOT EXISTS canal_origen varchar(50) DEFAULT 'manual';

        CREATE TABLE IF NOT EXISTS "${schemaName}".activities (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "date" timestamptz NOT NULL DEFAULT now(),
          activity text NOT NULL,
          "typeActivityId" integer NULL,
          "opportunityId" uuid NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          "clientId" uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          "companyId" uuid NULL REFERENCES "${schemaName}".companies(id) ON DELETE SET NULL,
          "flaghistory" boolean NULL DEFAULT false,
          "userId" uuid NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_activities PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".products (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          nombre text NOT NULL,
          descripcion text NULL,
          "precioBase" numeric(10,2) NOT NULL DEFAULT 0.00,
          "unidadMedida" text NOT NULL DEFAULT 'Pieza',
          "observaciones" text NULL,
          status boolean NOT NULL DEFAULT true,
          "imagenPortada" varchar(512) NULL,
          "createdById" uuid NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_products PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".activities DROP CONSTRAINT IF EXISTS activities_userId_fkey;
        ALTER TABLE "${schemaName}".products DROP CONSTRAINT IF EXISTS products_createdById_fkey;
        DELETE FROM "${schemaName}".users WHERE LOWER(role::text) = 'superadmin';

        ALTER TABLE "${schemaName}".products ADD COLUMN IF NOT EXISTS "unidadMedida" text NOT NULL DEFAULT 'Pieza';
        ALTER TABLE "${schemaName}".products ADD COLUMN IF NOT EXISTS "observaciones" text NULL;
        ALTER TABLE "${schemaName}".products DROP COLUMN IF EXISTS "requiere_analisis";

        ALTER TABLE "${schemaName}".activities ADD COLUMN IF NOT EXISTS "externalEventId" varchar(255) NULL;
        ALTER TABLE "${schemaName}".activities ADD COLUMN IF NOT EXISTS "externalProvider" varchar(50) NULL;
        ALTER TABLE "${schemaName}".activities ADD COLUMN IF NOT EXISTS "externalLastSyncedAt" timestamptz NULL;
        ALTER TABLE "${schemaName}".activities ALTER COLUMN "date" TYPE timestamptz USING "date" AT TIME ZONE 'UTC';

        CREATE TABLE IF NOT EXISTS "${schemaName}".user_calendar_integrations (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL UNIQUE,
          provider varchar(20) NOT NULL,
          email varchar(255) NOT NULL,
          "accessToken" text NULL,
          "refreshToken" text NULL,
          "expiresAt" timestamptz NULL,
          "calendarId" varchar(255) NULL,
          "webhookSubscriptionId" varchar(255) NULL,
          "webhookExpiration" timestamptz NULL,
          "syncToken" varchar(500) NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_user_calendar_integrations PRIMARY KEY (id),
          CONSTRAINT fk_calendar_user FOREIGN KEY ("userId") REFERENCES "${schemaName}".users(id) ON DELETE CASCADE
        );



        CREATE TABLE IF NOT EXISTS "${schemaName}".product_files (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "fileName" varchar(255) NOT NULL,
          "filePath" varchar(512) NOT NULL,
          title varchar(255) NULL,
          "productId" uuid NOT NULL REFERENCES "${schemaName}".products(id) ON DELETE CASCADE,
          "uploadedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_product_files PRIMARY KEY (id)
        );

        CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
        GRANT USAGE ON SCHEMA public TO PUBLIC;

        CREATE TABLE IF NOT EXISTS "${schemaName}".product_knowledge_base (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          content text NULL,
          metadata jsonb NULL,
          embedding public.vector NULL
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".ai_agent_configs (

          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "isActive" boolean NOT NULL DEFAULT true,
          context text NULL,
          "defaultReplies" text NULL,
          temperature numeric(3,2) NOT NULL DEFAULT 0.70,
          "modelProvider" varchar(50) NOT NULL DEFAULT 'gemini',
          "modelName" varchar(100) NOT NULL DEFAULT 'gemini-1.5-flash',
          "openaiApiKey" varchar(255) NULL,
          "openaiEndpoint" varchar(512) NULL,
          "openaiApiVersion" varchar(50) NULL,
          "openaiEmbeddingModel" varchar(100) NOT NULL DEFAULT 'text-embedding-ada-002',
          "geminiApiKey" varchar(255) NULL,
          "watsonxApiKey" varchar(255) NULL,
          "watsonxProjectId" varchar(255) NULL,
          "watsonxRegion" varchar(100) NULL,
          "watsonxEmbeddingModel" varchar(100) NOT NULL DEFAULT 'ibm/slate-125m-english-rtrvr',
          "reminderOffsetMinutes" integer NOT NULL DEFAULT 60,
          "maxNewTokens" integer NOT NULL DEFAULT 2048,
          "historyMessageLimit" integer NOT NULL DEFAULT 10,
          "defaultUserId" uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          CONSTRAINT pk_ai_agent_configs PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".ai_agent_configs ADD COLUMN IF NOT EXISTS "historyMessageLimit" integer DEFAULT 10;

        CREATE TABLE IF NOT EXISTS "${schemaName}".ai_sub_agents (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          key varchar(50) NOT NULL UNIQUE,
          name varchar(255) NOT NULL,
          description text NULL,
          context text NULL,
          tools jsonb NULL,
          temperature numeric(3,2) NOT NULL DEFAULT 0.70,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_ai_sub_agents PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".channel_configs (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          channel varchar(50) NOT NULL,
          name varchar(255) NOT NULL,
          "appId" varchar(255) NULL,
          "accountId" varchar(255) NULL,
          "phoneNumberId" varchar(255) NULL,
          "accessToken" varchar(2048) NULL,
          "verifyToken" varchar(255) NULL,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_channel_configs PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".whatsapp_templates (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "channelConfigId" uuid NULL REFERENCES "${schemaName}".channel_configs(id) ON DELETE CASCADE,
          "templateId" varchar(255) NULL,
          name varchar(255) NOT NULL DEFAULT 'crm_inicio_conversacion',
          category varchar(50) NOT NULL DEFAULT 'MARKETING',
          language varchar(20) NOT NULL DEFAULT 'es',
          "bodyText" text NOT NULL DEFAULT 'Hola {{1}}, ¿cómo estás? Me comunico contigo para dar seguimiento y revisar lo siguiente:',
          "headerText" varchar(255) NULL,
          "footerText" varchar(255) NULL,
          components jsonb NULL,
          status varchar(50) NOT NULL DEFAULT 'APPROVED',
          "isBase" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_whatsapp_templates PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".conversations (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          channel varchar(50) NOT NULL DEFAULT 'whatsapp',
          "externalId" varchar(255) NULL,
          "clientName" varchar(255) NULL,
          "clientId" uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          client_id uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          "assignedUserId" uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          assigned_user_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          "botActive" boolean NOT NULL DEFAULT true,
          "channelConfigId" uuid NULL REFERENCES "${schemaName}".channel_configs(id) ON DELETE SET NULL,
          summary text NULL,
          "lastCustomerMessageAt" timestamptz NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_conversations PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".messages (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "conversationId" uuid NOT NULL REFERENCES "${schemaName}".conversations(id) ON DELETE CASCADE,
          conversation_id uuid NULL REFERENCES "${schemaName}".conversations(id) ON DELETE CASCADE,
          sender varchar(50) NOT NULL DEFAULT 'contact',
          "senderUserId" uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          content text NOT NULL,
          "status" varchar(50) NOT NULL DEFAULT 'sent',
          "messageType" varchar(50) NOT NULL DEFAULT 'text',
          "externalMessageId" varchar(255) NULL,
          "errorMessage" text NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_messages PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".helpdesks (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NOT NULL,
          strdescription text NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmcreated timestamptz NOT NULL DEFAULT now(),
          dtmlastmodified timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_helpdesks PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".ticket_stages (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          helpdesk_id uuid NOT NULL REFERENCES "${schemaName}".helpdesks(id) ON DELETE CASCADE,
          strname varchar(120) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          bln_show_dashboard boolean NOT NULL DEFAULT true,
          display_order integer NOT NULL DEFAULT 0,
          strcolor varchar(20) NULL,
          blninitial boolean NOT NULL DEFAULT false,
          intmaxdays integer NULL,
          dtmcreated timestamptz NOT NULL DEFAULT now(),
          dtmlastmodified timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_ticket_stages PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".tickets (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          ticket_number serial NOT NULL,
          strtitle varchar(255) NOT NULL,
          tipo_incidencia varchar(255) NULL,
          description text NULL,
          fecha_apertura timestamptz NOT NULL DEFAULT now(),
          fecha_cierre timestamptz NULL,
          notas_resolucion text NULL,
          priority integer NOT NULL DEFAULT 1,
          alert_sent boolean NOT NULL DEFAULT false,
          archived boolean NOT NULL DEFAULT false,
          cliente_id uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          responsable_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          helpdesk_id uuid NOT NULL REFERENCES "${schemaName}".helpdesks(id) ON DELETE CASCADE,
          stage_id uuid NULL REFERENCES "${schemaName}".ticket_stages(id) ON DELETE SET NULL,
          stage_entered_at timestamptz NOT NULL DEFAULT now(),
          "contactName" varchar(255) NULL,
          "contactEmail" varchar(255) NULL,
          "contactPhone" varchar(255) NULL,
          CONSTRAINT pk_tickets PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".ticket_interactions (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          ticket_id uuid NOT NULL REFERENCES "${schemaName}".tickets(id) ON DELETE CASCADE,
          user_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          comment text NULL,
          content text NULL,
          is_internal boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_ticket_interactions PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".ticket_interactions ADD COLUMN IF NOT EXISTS "comment" text;

        CREATE TABLE IF NOT EXISTS "${schemaName}".reminders (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          title varchar(255) NULL,
          date timestamptz NULL,
          notified boolean NOT NULL DEFAULT false,
          activity_id uuid NULL REFERENCES "${schemaName}".activities(id) ON DELETE CASCADE,
          CONSTRAINT pk_reminders PRIMARY KEY (id)
        );

        ALTER TABLE "${schemaName}".reminders ADD COLUMN IF NOT EXISTS "title" varchar(255);
        ALTER TABLE "${schemaName}".reminders ADD COLUMN IF NOT EXISTS "date" timestamptz;
        ALTER TABLE "${schemaName}".reminders ADD COLUMN IF NOT EXISTS "notified" boolean DEFAULT false;
        ALTER TABLE "${schemaName}".reminders ADD COLUMN IF NOT EXISTS "activity_id" uuid;



        CREATE TABLE IF NOT EXISTS "${schemaName}".tbloportunitylabels (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          strname varchar(255) NULL,
          field_key varchar(50) NULL UNIQUE,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmlastmodified timestamptz NULL DEFAULT now(),
          uuidlastmodifiedby uuid NULL,
          CONSTRAINT pk_tbloportunitylabels PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".tbltypeactivities (
          id serial NOT NULL,
          strname varchar(255) NOT NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          CONSTRAINT pk_tbltypeactivities PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".opportunity_contacts (
          "opportunitiesId" uuid NOT NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          "clientsId" uuid NOT NULL REFERENCES "${schemaName}".clients(id) ON DELETE CASCADE,
          CONSTRAINT pk_opportunity_contacts PRIMARY KEY ("opportunitiesId", "clientsId")
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".opportunity_products (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "opportunityId" uuid NOT NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          "productId" uuid NOT NULL REFERENCES "${schemaName}".products(id) ON DELETE CASCADE,
          cantidad numeric(10,2) NOT NULL DEFAULT 1,
          CONSTRAINT pk_opportunity_products PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".opportunity_files (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          "fileName" varchar(255) NOT NULL,
          "filePath" varchar(512) NOT NULL,
          title varchar(255) NULL,
          "date" date NULL,
          "opportunityId" uuid NOT NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          "uploadedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_opportunity_files PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".opportunity_trackings (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          opportunity_id uuid NOT NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          stage_id uuid NOT NULL REFERENCES "${schemaName}".tblstagescatalog(id) ON DELETE CASCADE,
          "changedAt" timestamp NOT NULL DEFAULT now(),
          changed_by_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          CONSTRAINT pk_opportunity_trackings PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".activity_contacts (
          "activitiesId" uuid NOT NULL REFERENCES "${schemaName}".activities(id) ON DELETE CASCADE,
          "clientsId" uuid NOT NULL REFERENCES "${schemaName}".clients(id) ON DELETE CASCADE,
          CONSTRAINT pk_activity_contacts PRIMARY KEY ("activitiesId", "clientsId")
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".interactions (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          comment text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          opportunity_id uuid NOT NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE CASCADE,
          CONSTRAINT pk_interactions PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".expenses (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          fecha date NOT NULL,
          concepto varchar(255) NOT NULL,
          monto numeric(18,2) NOT NULL DEFAULT 0.00,
          client_id uuid NULL REFERENCES "${schemaName}".clients(id) ON DELETE SET NULL,
          opportunity_id uuid NULL REFERENCES "${schemaName}".opportunities(id) ON DELETE SET NULL,
          usuario_id uuid NULL REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
          "receiptUrl" varchar(512) NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_expenses PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".helpdesk_cron_config (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          helpdesk_id uuid NOT NULL REFERENCES "${schemaName}".helpdesks(id) ON DELETE CASCADE,
          cron_mode varchar(20) NOT NULL DEFAULT 'fixed',
          cron_time varchar(5) NULL DEFAULT '08:00',
          cron_interval_hours integer NULL,
          cron_interval_minutes integer NULL,
          blnstatus boolean NOT NULL DEFAULT true,
          dtmcreated timestamptz NOT NULL DEFAULT now(),
          dtmlastmodified timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_helpdesk_cron_config PRIMARY KEY (id)
        );


        CREATE TABLE IF NOT EXISTS "${schemaName}".notifications (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
          title varchar(255) NOT NULL,
          message text NOT NULL,
          type varchar(50) NOT NULL,
          related_id varchar(255) NULL,
          read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_notifications PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".dashboard_indicators (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          title varchar(255) NOT NULL,
          type varchar(50) NOT NULL DEFAULT 'count',
          pipeline_id uuid NULL REFERENCES "${schemaName}".tblpipelinescatalog(id) ON DELETE CASCADE,
          helpdesk_id uuid NULL REFERENCES "${schemaName}".helpdesks(id) ON DELETE CASCADE,
          stage_ids text NULL,
          color varchar(50) NULL,
          display_order integer NOT NULL DEFAULT 0,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_dashboard_indicators PRIMARY KEY (id)
        );

        CREATE TABLE IF NOT EXISTS "${schemaName}".transaction_history (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          prompt_tokens integer NOT NULL DEFAULT 0,
          completion_tokens integer NOT NULL DEFAULT 0,
          total_tokens integer NOT NULL DEFAULT 0,
          fecha_procesamiento timestamptz NOT NULL DEFAULT now(),
          is_extra boolean NOT NULL DEFAULT false,
          action_name varchar(255) NULL,
          user_id uuid NULL,
          user_name varchar(255) NULL,
          client_id uuid NULL,
          client_name varchar(255) NULL,
          conversation_id uuid NULL,
          channel varchar(50) NULL,
          model_name varchar(100) NULL,
          metadata jsonb NULL,
          CONSTRAINT pk_transaction_history PRIMARY KEY (id)
        );

        -- Índices funcionales inmutables para resolución ortográfica y de acentos
        CREATE OR REPLACE FUNCTION public.f_unaccent_immutable(text)
        RETURNS text AS $$
          SELECT TRANSLATE(LOWER($1), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouaeiounnuu');
        $$ LANGUAGE sql IMMUTABLE STRICT;

        CREATE INDEX IF NOT EXISTS idx_companies_nombre_norm ON "${schemaName}".companies (public.f_unaccent_immutable(nombre));
        CREATE INDEX IF NOT EXISTS idx_clients_nombre_norm ON "${schemaName}".clients (public.f_unaccent_immutable(nombre));
        CREATE INDEX IF NOT EXISTS idx_clients_apellido_norm ON "${schemaName}".clients (public.f_unaccent_immutable(apellido));
        CREATE INDEX IF NOT EXISTS idx_opportunities_nombre_norm ON "${schemaName}".opportunities (public.f_unaccent_immutable(nombre_proyecto));
      `);

      // c) Sembrado de Datos Predeterminados
      await queryRunner.query(`
        INSERT INTO "${schemaName}".tbltypeactivities (strname, blnstatus) VALUES
        ('Llamada', true),
        ('Reunión', true),
        ('Correo', true),
        ('Demostración', true);
      `);

      const pipelineRes = await queryRunner.query(

        `INSERT INTO "${schemaName}".tblpipelinescatalog (strname, strdescription, blnstatus) 
         VALUES ('Pipeline Comercial Principal', 'Pipeline por defecto para gestionar oportunidades comerciales.', true) 
         RETURNING id`
      );
      const pipelineId = pipelineRes[0].id;

      const defaultStages = [
        { strname: 'Prospecto', display_order: 1, blninitial: true, strcolor: '#3498db', bln_show_dashboard: true },
        { strname: 'Calificado', display_order: 2, blninitial: false, strcolor: '#f1c40f', bln_show_dashboard: true },
        { strname: 'Propuesta', display_order: 3, blninitial: false, strcolor: '#9b59b6', bln_show_dashboard: true },
        { strname: 'Negociación', display_order: 4, blninitial: false, strcolor: '#e67e22', bln_show_dashboard: true },
        { strname: 'Cierre Exitoso', display_order: 5, blninitial: false, strcolor: '#2ecc71', bln_show_dashboard: true },
        { strname: 'Cierre Perdido', display_order: 6, blninitial: false, strcolor: '#e74c3c', bln_show_dashboard: false },
      ];

      for (const st of defaultStages) {
        await queryRunner.query(
          `INSERT INTO "${schemaName}".tblstagescatalog 
           (strname, pipeline_id, display_order, blninitial, strcolor, bln_show_dashboard, blnstatus) 
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [st.strname, pipelineId, st.display_order, st.blninitial, st.strcolor, st.bln_show_dashboard]
        );
      }

      // Mesa de Ayuda Principal por defecto
      const helpdeskRes = await queryRunner.query(
        `INSERT INTO "${schemaName}".helpdesks (strname, strdescription, blnstatus) 
         VALUES ('Mesa de Ayuda Principal', 'Canal principal para soporte técnico y atención a clientes.', true) 
         RETURNING id`
      );
      const helpdeskId = helpdeskRes[0].id;

      const defaultTicketStages = [
        { strname: 'Nuevo', display_order: 1, blninitial: true, strcolor: '#e74c3c', bln_show_dashboard: true },
        { strname: 'En Proceso', display_order: 2, blninitial: false, strcolor: '#f1c40f', bln_show_dashboard: true },
        { strname: 'En Espera', display_order: 3, blninitial: false, strcolor: '#3498db', bln_show_dashboard: true },
        { strname: 'Resuelto', display_order: 4, blninitial: false, strcolor: '#2ecc71', bln_show_dashboard: true },
      ];

      for (const ts of defaultTicketStages) {
        await queryRunner.query(
          `INSERT INTO "${schemaName}".ticket_stages 
           (strname, helpdesk_id, display_order, blninitial, strcolor, bln_show_dashboard, blnstatus) 
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [ts.strname, helpdeskId, ts.display_order, ts.blninitial, ts.strcolor, ts.bln_show_dashboard]
        );
      }

      await queryRunner.query(
        `INSERT INTO "${schemaName}".helpdesk_cron_config 
         (helpdesk_id, cron_mode, cron_time, blnstatus) 
         VALUES ($1, 'fixed', '09:00', true)`,
        [helpdeskId]
      );

      // Catálogos
      await queryRunner.query(`
        INSERT INTO "${schemaName}".tblbusinesslines (id, strname, blnstatus) VALUES
          ('a8b6d804-94c9-4a0b-bc77-cfc8152e93db', 'Datos', true),
          ('b2f0a149-14a0-410a-8bf8-28564f7b60cc', 'Desarrollo', true),
          ('c5d72bc1-12c8-47bc-8a7e-128a192bfa77', 'RH', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO "${schemaName}".tbldeliverytypes (id, strname, blnstatus) VALUES
          ('d29ab9f7-7b89-4089-a299-cf9b0cb617cf', 'Proyecto', true),
          ('e20c3a2a-43d9-482a-88cb-b09b0b4b2efc', 'Licencia', true),
          ('f22db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Asignacion', true),
          ('012db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Bolsa de Horas', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO "${schemaName}".tblicensings (id, strname, blnstatus) VALUES
          ('112db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'No Aplica', true),
          ('212db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Microsoft', true),
          ('312db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'IBM', true),
          ('412db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Qlik', true),
          ('512db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Alteryx', true),
          ('612db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'KNIME', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO "${schemaName}".tbloportunitylabels (id, strname, field_key, blnstatus) VALUES
          ('f509fa84-0b73-45f8-b3ab-b8471e98822e', 'Línea de Negocio', 'linea_negocio', true),
          ('7d90d810-74d3-4613-882d-8e814a029db5', 'Tipo de Entrega', 'tipo_entrega', true),
          ('c6d3df39-53e7-40b9-8e2b-f1de16b5394f', 'Licenciamiento', 'licenciamiento', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO "${schemaName}".channel_configs (channel, name, "isActive")
        SELECT 'webchat', 'Webchat Sitio Web', true
        WHERE NOT EXISTS (
          SELECT 1 FROM "${schemaName}".channel_configs WHERE channel = 'webchat'
        );
      `);

      const defaultRouterPrompt = `# Prompt del Agente Principal (Enrutador) — Asistente del CRM

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
}`;

      const baseCommonPrompt = `Eres el asistente conversacional de la empresa del CRM.
Tono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.
Idioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).
REGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.
ANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.
LIBRE CONVERSACIÓN Y ATENCIÓN: El cliente puede realizar consultas de catálogo, dudas sobre productos o precios, soporte y plática general libremente sin necesidad de registrar su teléfono ni correo. Los datos de contacto (correo y teléfono) se solicitan ÚNICA Y EXCLUSIVAMENTE en el momento en que el cliente desee cotizar formalmente productos con el sub-agente comercial.
NO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.
Redirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.`;

      const comercialPrompt = `${baseCommonPrompt}\n\n[INSTRUCCIONES COMERCIALES]
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
- REGLA MANDATORIA DE REENVÍO O ENVÍO DE COTIZACIÓN: Si el cliente solicita que le envíes, generes o reenvíes una cotización, o indica que no la ha recibido o pide que se la mandes de nuevo, DEBES llamar OBLIGATORIAMENTE a la herramienta 'sendQuotationPdf' (si la oportunidad ya existe) o a 'createOpportunity' (si aún no se ha registrado). Está TERMINANTEMENTE PROHIBIDO responder únicamente con texto o 'final_answer' afirmando que ya se la enviaste o que se la reenvías sin haber ejecutado la herramienta correspondiente.`;

      const seguimientoPrompt = `${baseCommonPrompt}\n\n[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]\n- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.\n- REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE: Está ESTRICTAMENTE PROHIBIDO inventar, asertar o adivinar una fecha u hora por tu cuenta para agendar sin habérsela preguntado primero al cliente.\n- PREGUNTAR DISPONIBILIDAD PRIMERO: Si el cliente solicita o muestra interés en agendar una llamada, cita o reunión pero NO ha proporcionado explícitamente su fecha (día) y hora de preferencia, DEBES responder inmediatamente usando la herramienta 'final_answer' preguntándole amablemente cuál es su día y horario de preferencia para coordinar la llamada. Está ESTRICTAMENTE PROHIBIDO llamar a 'checkAvailability' o 'createActivity' si el cliente aún no te ha indicado qué día y hora prefiere.\n- VALIDACIÓN DE DISPONIBILIDAD: SOLO cuando el cliente te proporcione explícitamente el día y hora en que desea la cita, llamarás a 'checkAvailability' pasando la fecha indicada por el cliente.\n- VALIDACIÓN OBLIGATORIA DE CORREO DEL CONTACTO: Para agendar cualquier cita o actividad con 'createActivity', es requisito indispensable y mandatorio que el contacto tenga un correo electrónico registrado en el CRM (campo 'correo' en [CONTACTO CRM]). Si el contacto no tiene correo electrónico (es nulo o vacío), DEBES solicitar forzosamente al cliente su correo mediante 'final_answer' ANTES de agendar la actividad. En cuanto el cliente te proporcione su correo, regístralo de inmediato llamando a 'updateContact' y en ese mismo turno continúa inmediatamente llamando a 'checkAvailability' o 'createActivity' para agendar la actividad sin pausas intermedias ni detenerte con 'final_answer'. Queda ESTRICTAMENTE PROHIBIDO llamar a 'createActivity' si el contacto no tiene correo electrónico asignado.\n- Si 'checkAvailability' responde AVAILABLE para esa fecha/hora y el contacto tiene correo asignado, procedes a agendar la actividad con 'createActivity'.\n- REGLA ESTRICTA DE RECORDATORIOS: El recordatorio registrado en el sistema es 100% INTERNO para el ejecutivo del CRM. El cliente NO recibe ningún recordatorio antes de la cita. Al confirmar la cita con 'final_answer', confírmale amablemente el día y la hora, pero está TERMINANTEMENTE PROHIBIDO decirle o prometerle al cliente que se le enviará o que recibirá un recordatorio 1 hora antes o previo a la cita.\n- Si 'checkAvailability' responde UNAVAILABLE, le ofreces los horarios alternativos de 'suggestedSlots' al cliente y le preguntas cuál prefiere.\n- Vincula siempre la actividad con el cliente. No inventes UUIDs del sistema.`;

      const soportePrompt = `${baseCommonPrompt}\n\n[INSTRUCCIONES DE SOPORTE Y HELPDESK — DIRECTRICES RAG-FIRST]
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

      const generalPrompt = `${baseCommonPrompt}\n\n[INSTRUCCIONES CONVERSACIONALES GENERALES]
- Responde amablemente a saludos, despedidas o preguntas de plática informal.
- Si el cliente hace una pregunta sobre la empresa, productos, servicios o capacidades generales, apóyate en la documentación provista en el contexto RAG o consulta con 'consult_product_catalog' y responde de forma breve y amigable con 'final_answer'.
- No intentes llamar a ninguna herramienta si el cliente solo te saluda.`;

      await queryRunner.query(
        `INSERT INTO "${schemaName}".ai_agent_configs ("isActive", context, temperature, "reminderOffsetMinutes") VALUES (true, $1, 0.70, 60)`,
        [defaultRouterPrompt]
      );

      await queryRunner.query(
        `INSERT INTO "${schemaName}".ai_sub_agents (key, name, description, context, tools, temperature, "isActive") VALUES
          ('comercial', 'Sub-Agente Comercial', 'Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.', $1, $5::jsonb, 0.20, true),
          ('seguimiento', 'Sub-Agente de Seguimiento', 'Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de ejecutivos especializados y crear recordatorios.', $2, $6::jsonb, 0.50, true),
          ('soporte_atencion', 'Sub-Agente de Soporte', 'Atiende incidencias de soporte, quejas y dudas técnicas. Consulta documentación RAG y FAQs antes de levantar tickets o derivar a ejecutivos humanos.', $3, $7::jsonb, 0.50, true),
          ('general', 'Sub-Agente Conversacional', 'Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales.', $4, $8::jsonb, 0.70, true)`,
        [
          comercialPrompt,
          seguimientoPrompt,
          soportePrompt,
          generalPrompt,
          JSON.stringify(['registerContact', 'updateContact', 'createOpportunity', 'modifyOpportunity', 'consult_product_catalog', 'sendQuotationPdf']),
          JSON.stringify(['registerContact', 'updateContact', 'checkAvailability', 'createActivity', 'consult_product_catalog']),
          JSON.stringify(['registerContact', 'updateContact', 'createTicket', 'requestHumanHandoff', 'consult_product_catalog']),
          JSON.stringify(['consult_product_catalog']),
        ]
      );


      // d) Calcular fecha de renovación inicial con protección de fin de mes y bisiestos
      const now = new Date();
      const nextRenewalDate = addBillingMonths(now, billingPeriodMonths);

      // e) Registrar tenant en public.tenants
      const tenantInsertRes = await queryRunner.query(
        `INSERT INTO public.tenants (name, schema_name, plan_id, next_renewal_date, is_active, allow_extra) 
         VALUES ($1, $2, $3, $4, true, false) 
         RETURNING id`,
        [tenantName, schemaName, planId || null, nextRenewalDate]
      );
      const tenantId = tenantInsertRes[0].id;

      // Crear ciclo de facturación inicial activo para el nuevo tenant
      let planName = 'Plan Pro';
      let tokensLimit = 300000;
      let price = 0;
      if (planId) {
        const planRes = await queryRunner.query(
          `SELECT plan_name, tokens_limit, price FROM public.plans WHERE plan_id = $1`,
          [planId]
        );
        if (planRes.length > 0) {
          planName = planRes[0].plan_name;
          tokensLimit = parseInt(planRes[0].tokens_limit, 10) || 0;
          price = parseFloat(planRes[0].price) || 0;
        }
      }

      await queryRunner.query(
        `INSERT INTO public.tenant_billing_cycles (
          tenant_id, plan_id, plan_name, tokens_limit, price, billing_period_months,
          start_date, end_date, status, allow_extra, tokens_used_at_close, tokens_extra_used_at_close, tokens_courtesy_at_close
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', false, 0, 0, 0)`,
        [String(tenantId), planId || null, planName, tokensLimit, price, billingPeriodMonths, now, nextRenewalDate]
      );

      // f) Generar clave temporal y crear usuario Admin del tenant
      const tempPassword = crypto.randomBytes(6).toString('hex'); // 12 chars
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);

      await queryRunner.query(
        `INSERT INTO "${schemaName}".users (username, email, password, role) 
         VALUES ($1, $2, $3, 'admin')`,
        [adminUsername, adminEmail, hashedPassword]
      );

      // Commit de la transacción
      await queryRunner.commitTransaction();

      return {
        tenantId,
        schemaName,
        adminUsername,
        adminEmail,
        tempPassword,
        nextRenewalDate,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(`Error al aprovisionar tenant: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }
}
