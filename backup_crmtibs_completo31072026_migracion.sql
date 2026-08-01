--
-- PostgreSQL database dump
--

\restrict DX2hiZwKT2rwqJi6PBdZ42YJqkfYnAVdJAu0qg1eVhL7bFhHXrpFI11W2kojoXr

-- Dumped from database version 16.13 (Ubuntu 16.13-1.pgdg22.04+1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-1.pgdg22.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: tenant_tibs; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA tenant_tibs;


ALTER SCHEMA tenant_tibs OWNER TO postgres;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: clients_category_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.clients_category_enum AS ENUM (
    'Contacto',
    'Lead',
    'Cliente'
);


ALTER TYPE public.clients_category_enum OWNER TO postgres;

--
-- Name: opportunities_moneda_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.opportunities_moneda_enum AS ENUM (
    'USD',
    'MXN'
);


ALTER TYPE public.opportunities_moneda_enum OWNER TO postgres;

--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.users_role_enum AS ENUM (
    'superadmin',
    'admin',
    'executive'
);


ALTER TYPE public.users_role_enum OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date timestamp without time zone NOT NULL,
    activity text NOT NULL,
    "typeActivityId" integer,
    "opportunityId" uuid,
    "clientId" uuid,
    "companyId" uuid,
    flaghistory boolean,
    "userId" uuid NOT NULL
);


ALTER TABLE public.activities OWNER TO postgres;

--
-- Name: activity_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_contacts (
    "activitiesId" uuid NOT NULL,
    "clientsId" uuid NOT NULL
);


ALTER TABLE public.activity_contacts OWNER TO postgres;

--
-- Name: ai_agent_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    context text,
    "defaultReplies" text,
    temperature double precision DEFAULT '0.7'::double precision NOT NULL,
    "modelProvider" character varying(50) DEFAULT 'gemini'::character varying NOT NULL,
    "modelName" character varying(100) DEFAULT 'gemini-1.5-flash'::character varying NOT NULL,
    "openaiApiKey" character varying(255),
    "openaiEndpoint" character varying(512),
    "openaiApiVersion" character varying(50),
    "openaiEmbeddingModel" character varying(100) DEFAULT 'text-embedding-ada-002'::character varying NOT NULL,
    "geminiApiKey" character varying(255),
    "watsonxApiKey" character varying(255),
    "watsonxProjectId" character varying(255),
    "watsonxRegion" character varying(100),
    "watsonxEmbeddingModel" character varying(100) DEFAULT 'ibm/slate-125m-english-rtrvr'::character varying NOT NULL,
    "reminderOffsetMinutes" integer DEFAULT 60 NOT NULL,
    "maxNewTokens" integer DEFAULT 2048 NOT NULL,
    "historyMessageLimit" integer DEFAULT 10 NOT NULL,
    "defaultUserId" uuid
);


ALTER TABLE public.ai_agent_configs OWNER TO postgres;

--
-- Name: ai_sub_agents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_sub_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    context text,
    tools jsonb,
    temperature double precision DEFAULT '0.7'::double precision NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_sub_agents OWNER TO postgres;

--
-- Name: channel_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.channel_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    "appId" character varying(255),
    "accountId" character varying(255),
    "phoneNumberId" character varying(255),
    "accessToken" character varying(2048),
    "verifyToken" character varying(255),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.channel_configs OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(255) NOT NULL,
    apellido character varying(255) NOT NULL,
    correo character varying(255),
    empresa character varying(255),
    puesto character varying(255),
    telefono character varying(50),
    category public.clients_category_enum DEFAULT 'Lead'::public.clients_category_enum NOT NULL,
    estatus boolean DEFAULT true NOT NULL,
    ejecutivo_id uuid,
    "companyId" uuid
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(255) NOT NULL,
    correo character varying(255),
    telefono character varying(50),
    website character varying(255),
    direccion character varying(512),
    estatus boolean DEFAULT true NOT NULL,
    ejecutivo_id uuid,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel character varying(50) NOT NULL,
    "externalId" character varying(255) NOT NULL,
    "clientName" character varying(255) NOT NULL,
    "clientId" uuid,
    "assignedUserId" uuid,
    "botActive" boolean DEFAULT true NOT NULL,
    "channelConfigId" uuid,
    summary text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.conversations OWNER TO postgres;

--
-- Name: dashboard_indicators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboard_indicators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'count'::character varying NOT NULL,
    pipeline_id uuid,
    helpdesk_id uuid,
    stage_ids text,
    color character varying(50),
    display_order integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dashboard_indicators OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date NOT NULL,
    concepto character varying(255) NOT NULL,
    monto numeric(18,2) NOT NULL,
    client_id uuid,
    opportunity_id uuid,
    usuario_id uuid,
    "receiptUrl" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: helpdesk_cron_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_cron_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helpdesk_id uuid NOT NULL,
    cron_mode character varying(20) DEFAULT 'fixed'::character varying NOT NULL,
    cron_time character varying(5) DEFAULT '08:00'::character varying,
    cron_interval_hours integer,
    cron_interval_minutes integer,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp without time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.helpdesk_cron_config OWNER TO postgres;

--
-- Name: helpdesks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    strdescription text,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.helpdesks OWNER TO postgres;

--
-- Name: interactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    opportunity_id uuid NOT NULL
);


ALTER TABLE public.interactions OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "conversationId" uuid NOT NULL,
    sender character varying(50) NOT NULL,
    "senderUserId" uuid,
    content text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    related_id character varying(255),
    read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre_proyecto character varying(255) NOT NULL,
    description character varying(1000),
    cliente_id uuid,
    empresa character varying(255),
    "companyId" uuid,
    ejecutivo_id uuid,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    monto_licenciamiento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    monto_servicios numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    monto_total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    moneda public.opportunities_moneda_enum DEFAULT 'USD'::public.opportunities_moneda_enum NOT NULL,
    linea_negocio_id uuid,
    tipo_entrega_id uuid,
    licenciamiento_id uuid,
    proposal_document_path character varying(512),
    archived boolean DEFAULT false NOT NULL,
    "tipoCambio" numeric(10,2),
    estimated_closure_date date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    stage_entered_at timestamp without time zone,
    priority integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.opportunities OWNER TO postgres;

--
-- Name: COLUMN opportunities."tipoCambio"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.opportunities."tipoCambio" IS 'Tipo de cambio aplicado si la moneda es USD';


--
-- Name: opportunity_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opportunity_contacts (
    "opportunitiesId" uuid NOT NULL,
    "clientsId" uuid NOT NULL
);


ALTER TABLE public.opportunity_contacts OWNER TO postgres;

--
-- Name: opportunity_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opportunity_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" character varying(512) NOT NULL,
    title character varying(255),
    date date,
    "opportunityId" uuid NOT NULL,
    "uploadedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.opportunity_files OWNER TO postgres;

--
-- Name: opportunity_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opportunity_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "opportunityId" uuid NOT NULL,
    "productId" uuid NOT NULL,
    cantidad numeric(10,2) DEFAULT '1'::numeric NOT NULL
);


ALTER TABLE public.opportunity_products OWNER TO postgres;

--
-- Name: opportunity_trackings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opportunity_trackings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    "changedAt" timestamp without time zone DEFAULT now() NOT NULL,
    changed_by_id uuid NOT NULL
);


ALTER TABLE public.opportunity_trackings OWNER TO postgres;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    plan_id integer NOT NULL,
    plan_name character varying(100) NOT NULL,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    tokens_limit bigint DEFAULT '0'::bigint NOT NULL,
    billing_period_months integer DEFAULT 1 NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: plans_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.plans_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plans_plan_id_seq OWNER TO postgres;

--
-- Name: plans_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.plans_plan_id_seq OWNED BY public.plans.plan_id;


--
-- Name: product_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" character varying(512) NOT NULL,
    title character varying(255),
    "productId" uuid NOT NULL,
    "uploadedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.product_files OWNER TO postgres;

--
-- Name: product_knowledge_base; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text,
    metadata jsonb,
    embedding public.vector
);


ALTER TABLE public.product_knowledge_base OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    "precioBase" numeric(10,2),
    "unidadMedida" text DEFAULT 'Pieza'::text NOT NULL,
    observaciones text,
    status boolean DEFAULT true NOT NULL,
    "imagenPortada" character varying(512),
    "createdById" uuid,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: reminders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    date timestamp without time zone NOT NULL,
    notified boolean DEFAULT false NOT NULL,
    activity_id uuid
);


ALTER TABLE public.reminders OWNER TO postgres;

--
-- Name: tblbusinesslines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tblbusinesslines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE public.tblbusinesslines OWNER TO postgres;

--
-- Name: tbldeliverytypes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tbldeliverytypes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE public.tbldeliverytypes OWNER TO postgres;

--
-- Name: tblicensings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tblicensings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE public.tblicensings OWNER TO postgres;

--
-- Name: tbloportunitylabels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tbloportunitylabels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255),
    field_key character varying(50),
    blnstatus boolean DEFAULT true NOT NULL,
    dtmlastmodified timestamp without time zone,
    uuidlastmodifiedby uuid
);


ALTER TABLE public.tbloportunitylabels OWNER TO postgres;

--
-- Name: tblpipelinescatalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tblpipelinescatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(120) NOT NULL,
    strdescription character varying(500),
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL,
    intlastmodifiedby integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.tblpipelinescatalog OWNER TO postgres;

--
-- Name: tblstagescatalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tblstagescatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(120) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL,
    bln_show_dashboard boolean DEFAULT true NOT NULL,
    pipeline_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    strcolor character varying(20),
    blninitial boolean DEFAULT false NOT NULL,
    intmaxdays integer,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tblstagescatalog OWNER TO postgres;

--
-- Name: tbltypeactivities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tbltypeactivities (
    id integer NOT NULL,
    strname character varying NOT NULL,
    blnstatus boolean NOT NULL
);


ALTER TABLE public.tbltypeactivities OWNER TO postgres;

--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tbltypeactivities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tbltypeactivities_id_seq OWNER TO postgres;

--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tbltypeactivities_id_seq OWNED BY public.tbltypeactivities.id;


--
-- Name: tenant_renewal_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenant_renewal_queue (
    id integer NOT NULL,
    tenant_id character varying(63) NOT NULL,
    plan_id integer NOT NULL,
    billing_period_months integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tenant_renewal_queue OWNER TO postgres;

--
-- Name: tenant_renewal_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tenant_renewal_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tenant_renewal_queue_id_seq OWNER TO postgres;

--
-- Name: tenant_renewal_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tenant_renewal_queue_id_seq OWNED BY public.tenant_renewal_queue.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    schema_name character varying(63) NOT NULL,
    plan_id integer,
    next_renewal_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    allow_extra boolean DEFAULT false NOT NULL,
    logo character varying(512),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tenants_id_seq OWNER TO postgres;

--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: ticket_interactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    ticket_id uuid NOT NULL
);


ALTER TABLE public.ticket_interactions OWNER TO postgres;

--
-- Name: ticket_stages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(120) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL,
    bln_show_dashboard boolean DEFAULT true NOT NULL,
    helpdesk_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    strcolor character varying(20),
    blninitial boolean DEFAULT false NOT NULL,
    intmaxdays integer,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_stages OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number integer NOT NULL,
    strtitle character varying(255) NOT NULL,
    tipo_incidencia character varying(255) NOT NULL,
    description text NOT NULL,
    fecha_apertura timestamp without time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp without time zone,
    notas_resolucion text,
    priority integer DEFAULT 1 NOT NULL,
    alert_sent boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    cliente_id uuid,
    responsable_id uuid,
    helpdesk_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    stage_entered_at timestamp without time zone DEFAULT now() NOT NULL,
    "contactName" character varying(255),
    "contactEmail" character varying(255),
    "contactPhone" character varying(255)
);


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tickets_ticket_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tickets_ticket_number_seq OWNER TO postgres;

--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tickets_ticket_number_seq OWNED BY public.tickets.ticket_number;


--
-- Name: transaction_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transaction_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    fecha_procesamiento timestamp with time zone DEFAULT now() NOT NULL,
    is_extra boolean DEFAULT false NOT NULL,
    action_name character varying(255)
);


ALTER TABLE public.transaction_history OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying NOT NULL,
    email character varying NOT NULL,
    password character varying NOT NULL,
    role public.users_role_enum DEFAULT 'executive'::public.users_role_enum NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "profileImageUrl" character varying,
    reset_password_token character varying,
    reset_password_expires timestamp without time zone
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: activities; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    activity text NOT NULL,
    "typeActivityId" integer,
    "opportunityId" uuid,
    "clientId" uuid,
    "companyId" uuid,
    flaghistory boolean DEFAULT false,
    "userId" uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.activities OWNER TO postgres;

--
-- Name: activity_contacts; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.activity_contacts (
    "activitiesId" uuid NOT NULL,
    "clientsId" uuid NOT NULL
);


ALTER TABLE tenant_tibs.activity_contacts OWNER TO postgres;

--
-- Name: ai_agent_configs; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.ai_agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    context text,
    "defaultReplies" text,
    temperature numeric(3,2) DEFAULT 0.70 NOT NULL,
    "modelProvider" character varying(50) DEFAULT 'gemini'::character varying NOT NULL,
    "modelName" character varying(100) DEFAULT 'gemini-1.5-flash'::character varying NOT NULL,
    "openaiApiKey" character varying(255),
    "openaiEndpoint" character varying(512),
    "openaiApiVersion" character varying(50),
    "openaiEmbeddingModel" character varying(100) DEFAULT 'text-embedding-ada-002'::character varying NOT NULL,
    "geminiApiKey" character varying(255),
    "watsonxApiKey" character varying(255),
    "watsonxProjectId" character varying(255),
    "watsonxRegion" character varying(100),
    "watsonxEmbeddingModel" character varying(100) DEFAULT 'ibm/slate-125m-english-rtrvr'::character varying NOT NULL,
    "reminderOffsetMinutes" integer DEFAULT 60 NOT NULL,
    "maxNewTokens" integer DEFAULT 2048 NOT NULL,
    "historyMessageLimit" integer DEFAULT 10 NOT NULL,
    "defaultUserId" uuid
);


ALTER TABLE tenant_tibs.ai_agent_configs OWNER TO postgres;

--
-- Name: ai_sub_agents; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.ai_sub_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    context text,
    tools jsonb,
    temperature numeric(3,2) DEFAULT 0.70 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.ai_sub_agents OWNER TO postgres;

--
-- Name: channel_configs; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.channel_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    "appId" character varying(255),
    "accountId" character varying(255),
    "phoneNumberId" character varying(255),
    "accessToken" character varying(2048),
    "verifyToken" character varying(255),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.channel_configs OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(255) NOT NULL,
    apellido character varying(255) DEFAULT ''::character varying,
    correo character varying(255),
    empresa character varying(255),
    puesto character varying(255),
    telefono character varying(50),
    category character varying(50) DEFAULT 'Lead'::character varying NOT NULL,
    estatus boolean DEFAULT true NOT NULL,
    ejecutivo_id uuid,
    "companyId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.clients OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(255) NOT NULL,
    correo character varying(255),
    telefono character varying(50),
    website character varying(255),
    direccion character varying(512),
    estatus boolean DEFAULT true NOT NULL,
    ejecutivo_id uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.companies OWNER TO postgres;

--
-- Name: conversations; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel character varying(50) DEFAULT 'whatsapp'::character varying NOT NULL,
    "externalId" character varying(255),
    "clientName" character varying(255),
    "clientId" uuid,
    client_id uuid,
    "assignedUserId" uuid,
    assigned_user_id uuid,
    "botActive" boolean DEFAULT true NOT NULL,
    "channelConfigId" uuid,
    summary text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.conversations OWNER TO postgres;

--
-- Name: dashboard_indicators; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.dashboard_indicators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'count'::character varying NOT NULL,
    pipeline_id uuid,
    helpdesk_id uuid,
    stage_ids text,
    color character varying(50),
    display_order integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.dashboard_indicators OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date NOT NULL,
    concepto character varying(255) NOT NULL,
    monto numeric(18,2) DEFAULT 0.00 NOT NULL,
    client_id uuid,
    opportunity_id uuid,
    usuario_id uuid,
    "receiptUrl" character varying(512),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.expenses OWNER TO postgres;

--
-- Name: helpdesk_cron_config; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.helpdesk_cron_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helpdesk_id uuid NOT NULL,
    cron_mode character varying(20) DEFAULT 'fixed'::character varying NOT NULL,
    cron_time character varying(5) DEFAULT '08:00'::character varying,
    cron_interval_hours integer,
    cron_interval_minutes integer,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.helpdesk_cron_config OWNER TO postgres;

--
-- Name: helpdesks; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.helpdesks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    strdescription text,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.helpdesks OWNER TO postgres;

--
-- Name: interactions; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    opportunity_id uuid NOT NULL
);


ALTER TABLE tenant_tibs.interactions OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "conversationId" uuid NOT NULL,
    conversation_id uuid,
    sender character varying(50) DEFAULT 'contact'::character varying NOT NULL,
    "senderUserId" uuid,
    content text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.messages OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    related_id character varying(255),
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.notifications OWNER TO postgres;

--
-- Name: opportunities; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre_proyecto character varying(255) NOT NULL,
    description text,
    cliente_id uuid,
    empresa character varying(255),
    "companyId" uuid,
    ejecutivo_id uuid,
    pipeline_id uuid,
    stage_id uuid,
    monto_licenciamiento numeric(10,2) DEFAULT 0.00 NOT NULL,
    monto_servicios numeric(10,2) DEFAULT 0.00 NOT NULL,
    monto_total numeric(10,2) DEFAULT 0.00 NOT NULL,
    moneda character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    linea_negocio_id uuid,
    tipo_entrega_id uuid,
    licenciamiento_id uuid,
    proposal_document_path character varying(512),
    archived boolean DEFAULT false NOT NULL,
    "tipoCambio" numeric(10,2),
    estimated_closure_date date,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    stage_entered_at timestamp with time zone,
    priority character varying(20) DEFAULT 'Media'::character varying
);


ALTER TABLE tenant_tibs.opportunities OWNER TO postgres;

--
-- Name: opportunity_contacts; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.opportunity_contacts (
    "opportunitiesId" uuid NOT NULL,
    "clientsId" uuid NOT NULL
);


ALTER TABLE tenant_tibs.opportunity_contacts OWNER TO postgres;

--
-- Name: opportunity_files; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.opportunity_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" character varying(512) NOT NULL,
    title character varying(255),
    date date,
    "opportunityId" uuid NOT NULL,
    "uploadedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.opportunity_files OWNER TO postgres;

--
-- Name: opportunity_products; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.opportunity_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "opportunityId" uuid NOT NULL,
    "productId" uuid NOT NULL,
    cantidad numeric(10,2) DEFAULT 1 NOT NULL
);


ALTER TABLE tenant_tibs.opportunity_products OWNER TO postgres;

--
-- Name: opportunity_trackings; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.opportunity_trackings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    "changedAt" timestamp without time zone DEFAULT now() NOT NULL,
    changed_by_id uuid
);


ALTER TABLE tenant_tibs.opportunity_trackings OWNER TO postgres;

--
-- Name: product_files; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.product_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" character varying(512) NOT NULL,
    title character varying(255),
    "productId" uuid NOT NULL,
    "uploadedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.product_files OWNER TO postgres;

--
-- Name: product_knowledge_base; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.product_knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text,
    metadata jsonb,
    embedding public.vector
);


ALTER TABLE tenant_tibs.product_knowledge_base OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    "precioBase" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "unidadMedida" text DEFAULT 'Pieza'::text NOT NULL,
    observaciones text,
    status boolean DEFAULT true NOT NULL,
    "imagenPortada" character varying(512),
    "createdById" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.products OWNER TO postgres;

--
-- Name: reminders; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255),
    date timestamp with time zone,
    notified boolean DEFAULT false NOT NULL,
    activity_id uuid
);


ALTER TABLE tenant_tibs.reminders OWNER TO postgres;

--
-- Name: tblbusinesslines; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tblbusinesslines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE tenant_tibs.tblbusinesslines OWNER TO postgres;

--
-- Name: tbldeliverytypes; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tbldeliverytypes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE tenant_tibs.tbldeliverytypes OWNER TO postgres;

--
-- Name: tblicensings; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tblicensings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE tenant_tibs.tblicensings OWNER TO postgres;

--
-- Name: tbloportunitylabels; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tbloportunitylabels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(255),
    field_key character varying(50),
    blnstatus boolean DEFAULT true NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now(),
    uuidlastmodifiedby uuid
);


ALTER TABLE tenant_tibs.tbloportunitylabels OWNER TO postgres;

--
-- Name: tblpipelinescatalog; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tblpipelinescatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(100) NOT NULL,
    strdescription text,
    blnstatus boolean DEFAULT true NOT NULL,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL,
    intlastmodifiedby integer DEFAULT 1 NOT NULL
);


ALTER TABLE tenant_tibs.tblpipelinescatalog OWNER TO postgres;

--
-- Name: tblstagescatalog; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tblstagescatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    strname character varying(120) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL,
    bln_show_dashboard boolean DEFAULT true NOT NULL,
    pipeline_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    strcolor character varying(20),
    blninitial boolean DEFAULT false NOT NULL,
    intmaxdays integer,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.tblstagescatalog OWNER TO postgres;

--
-- Name: tbltypeactivities; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tbltypeactivities (
    id integer NOT NULL,
    strname character varying(255) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL
);


ALTER TABLE tenant_tibs.tbltypeactivities OWNER TO postgres;

--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE; Schema: tenant_tibs; Owner: postgres
--

CREATE SEQUENCE tenant_tibs.tbltypeactivities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE tenant_tibs.tbltypeactivities_id_seq OWNER TO postgres;

--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE OWNED BY; Schema: tenant_tibs; Owner: postgres
--

ALTER SEQUENCE tenant_tibs.tbltypeactivities_id_seq OWNED BY tenant_tibs.tbltypeactivities.id;


--
-- Name: ticket_interactions; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.ticket_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    user_id uuid,
    comment text,
    content text,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.ticket_interactions OWNER TO postgres;

--
-- Name: ticket_stages; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.ticket_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helpdesk_id uuid NOT NULL,
    strname character varying(120) NOT NULL,
    blnstatus boolean DEFAULT true NOT NULL,
    bln_show_dashboard boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    strcolor character varying(20),
    blninitial boolean DEFAULT false NOT NULL,
    intmaxdays integer,
    dtmcreated timestamp with time zone DEFAULT now() NOT NULL,
    dtmlastmodified timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.ticket_stages OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number integer NOT NULL,
    strtitle character varying(255) NOT NULL,
    tipo_incidencia character varying(255),
    description text,
    fecha_apertura timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp with time zone,
    notas_resolucion text,
    priority integer DEFAULT 1 NOT NULL,
    alert_sent boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    cliente_id uuid,
    responsable_id uuid,
    helpdesk_id uuid NOT NULL,
    stage_id uuid,
    stage_entered_at timestamp with time zone DEFAULT now() NOT NULL,
    "contactName" character varying(255),
    "contactEmail" character varying(255),
    "contactPhone" character varying(255)
);


ALTER TABLE tenant_tibs.tickets OWNER TO postgres;

--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE; Schema: tenant_tibs; Owner: postgres
--

CREATE SEQUENCE tenant_tibs.tickets_ticket_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE tenant_tibs.tickets_ticket_number_seq OWNER TO postgres;

--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE OWNED BY; Schema: tenant_tibs; Owner: postgres
--

ALTER SEQUENCE tenant_tibs.tickets_ticket_number_seq OWNED BY tenant_tibs.tickets.ticket_number;


--
-- Name: transaction_history; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.transaction_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    fecha_procesamiento timestamp with time zone DEFAULT now() NOT NULL,
    is_extra boolean DEFAULT false NOT NULL,
    action_name character varying(255)
);


ALTER TABLE tenant_tibs.transaction_history OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: tenant_tibs; Owner: postgres
--

CREATE TABLE tenant_tibs.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'executive'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "profileImageUrl" character varying(500),
    reset_password_token character varying(255),
    reset_password_expires timestamp with time zone,
    "createdById" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE tenant_tibs.users OWNER TO postgres;

--
-- Name: plans plan_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans ALTER COLUMN plan_id SET DEFAULT nextval('public.plans_plan_id_seq'::regclass);


--
-- Name: tbltypeactivities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tbltypeactivities ALTER COLUMN id SET DEFAULT nextval('public.tbltypeactivities_id_seq'::regclass);


--
-- Name: tenant_renewal_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_renewal_queue ALTER COLUMN id SET DEFAULT nextval('public.tenant_renewal_queue_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: tickets ticket_number; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets ALTER COLUMN ticket_number SET DEFAULT nextval('public.tickets_ticket_number_seq'::regclass);


--
-- Name: tbltypeactivities id; Type: DEFAULT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tbltypeactivities ALTER COLUMN id SET DEFAULT nextval('tenant_tibs.tbltypeactivities_id_seq'::regclass);


--
-- Name: tickets ticket_number; Type: DEFAULT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets ALTER COLUMN ticket_number SET DEFAULT nextval('tenant_tibs.tickets_ticket_number_seq'::regclass);


--
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activities (id, date, activity, "typeActivityId", "opportunityId", "clientId", "companyId", flaghistory, "userId") FROM stdin;
\.


--
-- Data for Name: activity_contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_contacts ("activitiesId", "clientsId") FROM stdin;
\.


--
-- Data for Name: ai_agent_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_agent_configs (id, "isActive", context, "defaultReplies", temperature, "modelProvider", "modelName", "openaiApiKey", "openaiEndpoint", "openaiApiVersion", "openaiEmbeddingModel", "geminiApiKey", "watsonxApiKey", "watsonxProjectId", "watsonxRegion", "watsonxEmbeddingModel", "reminderOffsetMinutes", "maxNewTokens", "historyMessageLimit", "defaultUserId") FROM stdin;
c159b728-39f0-4792-8cb3-99eb5ff676b6	t	Configura aquí el contexto y las instrucciones de comportamiento de tu agente. Define su identidad, los productos o servicios que ofrece, el tono de comunicación y los criterios para gestionar contactos, oportunidades y actividades en el CRM.	\N	0.7	watsonx	mistralai/mistral-medium-2505				text-embedding-ada-002		HZDMYWicIkjDq70UovLQegcVpmkF_mez3M5OFUTQ-weZ	b7e03228-9070-49a6-a6d3-ff11a006f178	https://us-south.ml.cloud.ibm.com	ibm/granite-embedding-278m-multilingual	60	7000	10	\N
\.


--
-- Data for Name: ai_sub_agents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_sub_agents (id, key, name, description, context, tools, temperature, "isActive", "createdAt", "updatedAt") FROM stdin;
20dd86a0-f74c-4a3a-b28b-3c7be2a965c8	general	Sub-Agente Conversacional	Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales sin uso de herramientas.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'ejecutivo especializado' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES CONVERSACIONALES GENERALES]\n- Responde amablemente a saludos, despedidas o preguntas de plática informal.\n- No intentes llamar a ninguna herramienta si el cliente solo te saluda.	[]	0.7	t	2026-07-31 20:23:44.023975	2026-07-31 20:27:09.32073
5f8efd05-178f-4af3-be97-729d3d8804d0	comercial	Sub-Agente Comercial	Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'ejecutivo especializado' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES COMERCIALES]\n- Registra oportunidades en el CRM.\n- REGLA MANDATORIA Y OBLIGATORIA DE BÚSQUEDA EN RAG/CATÁLOGO: Para CUALQUIER pregunta del cliente sobre productos, especificaciones técnicas (RAM, memoria, procesador, modelo, almacenamiento, pantalla, etc.), catálogo, precios o compatibilidad, DEBES llamar OBLIGATORIAMENTE a la herramienta consult_product_catalog ANTES de responder al usuario. Está estrictamente PROHIBIDO responder directamente con final_answer o confiar en la memoria previa del chat para dar especificaciones sin haber llamado PRIMERO a consult_product_catalog en ese turno.\n- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento. Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes llamar obligatoriamente a la herramienta consult_product_catalog para consultar la base de datos real.\n- REGLA CRÍTICA OBLIGATORIA DE PRECIOS, UNIDADES DE MEDIDA Y OBSERVACIONES: Todos los productos tienen un precio base y una unidad de medida asignada (ej. pieza, servicio, licencia, hora). Muestra siempre el precio base indicando su unidad de medida. Si el producto devuelto por consult_product_catalog o RAG contiene observaciones o notas de precio (ej. 'no incluye IVA', 'no incluye instalación', 'precio refleja configuración básica'), DEBES comunicar de forma explícita y completa dichas observaciones o condicionantes al cliente en tu respuesta al entregar el precio o la cotización. NUNCA omitas las observaciones o notas del producto.\n- VARIANTES DE PRODUCTO: Las variantes (como colores o modelos) se manejan como productos independientes dentro del catálogo.\n- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.\n- Si el producto tiene manuales PDF en RAG, resume especificaciones clave.\n- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity.\n- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a consult_product_catalog.\n- COTIZACIONES MULTI-PRODUCTO (AGREGAR O MODIFICAR): Si el cliente solicita agregar un nuevo producto o piezas adicionales a una cotización u oportunidad existente, DEBES llamar a modifyOpportunity pasando el id de la oportunidad activa, el nombreProducto nuevo y la cantidad solicitada. El sistema mantendrá automáticamente los productos anteriores y agregará el nuevo producto, recalculando el monto total y generando la lista completa en el PDF.	["registerContact", "updateContact", "createOpportunity", "modifyOpportunity", "consult_product_catalog", "sendQuotationPdf"]	0.2	t	2026-07-31 20:23:43.327343	2026-07-31 20:27:08.471211
8c8d0579-1658-484d-8021-9bd7339c8d37	seguimiento	Sub-Agente de Seguimiento	Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de ejecutivos especializados y crear recordatorios.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'ejecutivo especializado' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]\n- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.\n- REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE: Está ESTRICTAMENTE PROHIBIDO inventar, asertar o adivinar una fecha u hora por tu cuenta para agendar sin habérsela preguntado primero al cliente.\n- PREGUNTAR DISPONIBILIDAD PRIMERO: Si el cliente solicita o muestra interés en agendar una llamada, cita o reunión pero NO ha proporcionado explícitamente su fecha (día) y hora de preferencia, DEBES responder inmediatamente usando la herramienta 'final_answer' preguntándole amablemente cuál es su día y horario de preferencia para coordinar la llamada. Está ESTRICTAMENTE PROHIBIDO llamar a 'checkAvailability' o 'createActivity' si el cliente aún no te ha indicado qué día y hora prefiere.\n- VALIDACIÓN DE DISPONIBILIDAD: SOLO cuando el cliente te proporcione explícitamente el día y hora en que desea la cita, llamarás a 'checkAvailability' pasando la fecha indicada por el cliente.\n- Si 'checkAvailability' responde AVAILABLE para esa fecha/hora, procedes a agendar la actividad con 'createActivity' y añades recordatorios de forma proactiva.\n- Si 'checkAvailability' responde UNAVAILABLE, le ofreces los horarios alternativos de 'suggestedSlots' al cliente y le preguntas cuál prefiere.\n- Vincula siempre la actividad con el cliente. No inventes UUIDs del sistema.	["registerContact", "updateContact", "checkAvailability", "createActivity"]	0.5	t	2026-07-31 20:23:43.559364	2026-07-31 20:27:08.763043
70e0a66a-b3a0-4636-971a-6ce8c32a4931	soporte_atencion	Sub-Agente de Soporte	Atiende incidencias de soporte, quejas y dudas técnicas. Si detecta un cliente molesto, problemático o sin solución tras varios intentos, lo redirecciona con un ejecutivo especializado (humano).	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'ejecutivo especializado' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES DE SOPORTE Y HELPDESK]\n- Tu objetivo principal es atender incidencias, dudas técnicas, reportes de problemas y quejas del cliente, intentando resolver y aclarar cualquier problemática que tenga.\n- Genera un ticket en el CRM con la herramienta createTicket cuando corresponda registrar la falla (campos: title, description, priority: 1=Bajo, 2=Medio, 3=Alto, category).\n- REGLAS OBLIGATORIAS DE REDIRECCIÓN A HUMANO (EJECUTIVO ESPECIALIZADO):\n  Debes llamar OBLIGATORIAMENTE a la herramienta 'requestHumanHandoff' para transferir la conversación a un ejecutivo especializado en los siguientes escenarios específicos:\n  1. Si se detecta un cliente molesto, problemático, irritado o agresivo.\n  2. Si la conversación, después de varios intentos, no llega a ninguna solución o entendimiento.\n  3. Si el cliente está haciendo preguntas o solicitudes completamente ajenas a lo establecido para el soporte o la empresa.\n  4. Si el cliente solicita explícitamente ser atendido por una persona real, un humano o un ejecutivo.\n  NUNCA respondas sólo con final_answer diciendo que lo conectarás o derivarás sin haber llamado PRIMERO a la herramienta 'requestHumanHandoff'.\n- En cualquier otro escenario, tú debes resolver directamente la duda o problemática del cliente sin derivar ni desactivarte.	["registerContact", "updateContact", "createTicket", "requestHumanHandoff"]	0.5	t	2026-07-31 20:23:43.789405	2026-07-31 20:27:09.040799
\.


--
-- Data for Name: channel_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.channel_configs (id, channel, name, "appId", "accountId", "phoneNumberId", "accessToken", "verifyToken", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clients (id, nombre, apellido, correo, empresa, puesto, telefono, category, estatus, ejecutivo_id, "companyId") FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, nombre, correo, telefono, website, direccion, estatus, ejecutivo_id, "createdAt") FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversations (id, channel, "externalId", "clientName", "clientId", "assignedUserId", "botActive", "channelConfigId", summary, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: dashboard_indicators; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboard_indicators (id, title, type, pipeline_id, helpdesk_id, stage_ids, color, display_order, "createdAt", "updatedAt") FROM stdin;
d73a58b1-0ee3-448a-ac63-a79aa40a6f68	Citas Agendadas	count	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	\N		purple	1	2026-07-31 23:03:25.648832+00	2026-07-31 23:03:25.648832+00
23a2a48d-fc0e-45c8-b89a-f6330514cef4	Oportunidades Abiertas	count	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	\N	d92e92b6-9551-430c-8876-935fd80b5d9c,2d7e4b7e-dcdb-402d-afe7-eac0d75dc491,baf5448d-7c36-4c7c-bb4e-768f08b6a91a,c3309d05-cd20-4087-b2ac-4cb10f24b58d,6ac54295-e97e-4cfd-80bd-155daa3d40ca,e3dc2659-6cea-4d8e-b3bd-966802158565	blue	2	2026-07-31 23:03:25.673876+00	2026-07-31 23:03:25.673876+00
cff45faa-4023-4df4-b257-f2807f86802b	Oportunidades Ganadas	count	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	\N		green	3	2026-07-31 23:03:25.68165+00	2026-07-31 23:03:25.68165+00
7ebfc17a-494b-42dd-8ace-9a10ca411589	Oportunidades Perdidas	count	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	\N		red	4	2026-07-31 23:03:25.68844+00	2026-07-31 23:03:25.68844+00
3955b079-86a7-4667-8080-61fd58ce81aa	Ventas	sum	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	\N		orange	5	2026-07-31 23:03:25.694541+00	2026-07-31 23:03:25.694541+00
563622eb-4ac4-442d-95a7-a8f4634dde07	Total Tickets	count	\N	529b5e1c-4f9e-487a-aee1-62b940b6f33a	bf7f9a0c-184c-4edc-907e-512b70f9c377,d3f05dea-25c9-4d1c-b4db-f5adc4448e75,11c7f676-a2ee-42f5-8856-cbfaab4ffdc7,ce25567f-ad52-4bcf-bd12-290bfab032b2	blue	1	2026-07-31 23:03:25.703482+00	2026-07-31 23:03:25.703482+00
4c1e4a78-e5c8-4e8f-821b-1fe8a79cf1a1	Tickets Abiertos	count	\N	529b5e1c-4f9e-487a-aee1-62b940b6f33a	bf7f9a0c-184c-4edc-907e-512b70f9c377,d3f05dea-25c9-4d1c-b4db-f5adc4448e75,11c7f676-a2ee-42f5-8856-cbfaab4ffdc7	purple	2	2026-07-31 23:03:25.712557+00	2026-07-31 23:03:25.712557+00
bdb04f30-ddb8-4cb0-aa3f-883e667f014d	Tickets Resueltos	count	\N	529b5e1c-4f9e-487a-aee1-62b940b6f33a	ce25567f-ad52-4bcf-bd12-290bfab032b2	green	3	2026-07-31 23:03:25.718245+00	2026-07-31 23:03:25.718245+00
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expenses (id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt") FROM stdin;
\.


--
-- Data for Name: helpdesk_cron_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.helpdesk_cron_config (id, helpdesk_id, cron_mode, cron_time, cron_interval_hours, cron_interval_minutes, blnstatus, dtmcreated, dtmlastmodified) FROM stdin;
f04b9f8b-14e9-459d-83e5-db010a42302f	529b5e1c-4f9e-487a-aee1-62b940b6f33a	fixed	08:00	\N	\N	t	2026-07-31 21:43:12.888941	2026-07-31 21:43:12.888941
\.


--
-- Data for Name: helpdesks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.helpdesks (id, strname, strdescription, blnstatus, dtmcreated, dtmlastmodified) FROM stdin;
529b5e1c-4f9e-487a-aee1-62b940b6f33a	Mesa de Ayuda Principal	Canal principal para soporte técnico y atención a clientes.	t	2026-07-31 20:30:40.952+00	2026-07-31 20:30:40.952+00
\.


--
-- Data for Name: interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.interactions (id, comment, created_at, opportunity_id) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, "conversationId", sender, "senderUserId", content, "createdAt") FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, title, message, type, related_id, read, created_at) FROM stdin;
8d217df6-c822-4c10-a912-79e6511318a1	6b2c8a3d-3fb1-4327-8c1c-25724b82e947	Asignación de Ticket	Se te ha asignado el ticket #00001: Prueba.\n\nEl usuario Jonathan Amador creó el ticket y te asignó como agente responsable.\n\nPor favor, ingresa a la plataforma para revisar el caso y dar seguimiento a la brevedad.	ticket_assigned	fec41d0d-8357-479e-be2a-0771f08771da	f	2026-08-01 02:38:17.5543
6cbc32e5-346a-4eee-8907-38240176badb	6b2c8a3d-3fb1-4327-8c1c-25724b82e947	Movimiento de Ticket	El usuario Jonathan Amador realizó una actualización en el ticket #00001.\n\nCambio realizado:\n\nEtapa: de Nuevo -> En Espera.	ticket_moved	fec41d0d-8357-479e-be2a-0771f08771da	f	2026-08-01 02:38:24.010197
bdb20c90-8a7b-43ae-9cc1-11f568e22ec4	6b2c8a3d-3fb1-4327-8c1c-25724b82e947	Nueva Oportunidad Creada	Te han asignado la oportunidad Test jonny. El usuario Jonathan Amador creó la oportunidad y te asignó como ejecutivo responsable.	opportunity_created	dd8048b8-00fb-4bdd-abda-5668602f3056	f	2026-08-01 02:38:52.587379
\.


--
-- Data for Name: opportunities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opportunities (id, nombre_proyecto, description, cliente_id, empresa, "companyId", ejecutivo_id, pipeline_id, stage_id, monto_licenciamiento, monto_servicios, monto_total, moneda, linea_negocio_id, tipo_entrega_id, licenciamiento_id, proposal_document_path, archived, "tipoCambio", estimated_closure_date, "createdAt", stage_entered_at, priority) FROM stdin;
\.


--
-- Data for Name: opportunity_contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opportunity_contacts ("opportunitiesId", "clientsId") FROM stdin;
\.


--
-- Data for Name: opportunity_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opportunity_files (id, "fileName", "filePath", title, date, "opportunityId", "uploadedAt") FROM stdin;
\.


--
-- Data for Name: opportunity_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opportunity_products (id, "opportunityId", "productId", cantidad) FROM stdin;
\.


--
-- Data for Name: opportunity_trackings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opportunity_trackings (id, opportunity_id, stage_id, "changedAt", changed_by_id) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plans (plan_id, plan_name, price, tokens_limit, billing_period_months, blnstatus, dtmcreated, dtmlastmodified) FROM stdin;
1	Plan Tibs	0.00	1000000	1	t	2026-07-31 21:41:40.877297+00	2026-07-31 21:41:40.877297+00
\.


--
-- Data for Name: product_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_files (id, "fileName", "filePath", title, "productId", "uploadedAt") FROM stdin;
2ab6f59b-a46e-4cea-bc69-7386adefbfd0	Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf	uploads/products/5c622f65-efcf-4e9a-9a70-3077a0b0313e/1785536526512-Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf	Ficha_Tecnica_REDMAGIC_11S_Pro (1)	5c622f65-efcf-4e9a-9a70-3077a0b0313e	2026-07-31 22:22:06.529298
\.


--
-- Data for Name: product_knowledge_base; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_knowledge_base (id, content, metadata, embedding) FROM stdin;
b9722ce6-8ab3-4ddd-ace9-a3f2303f360e	PARÁMETROS BÁSICOS\nDimensiones \tAltura: 163,82 mm | Ancho: 76,54 mm | Profundidad: 8,9 mm\nPeso \t230 g\nMateriales \tMarco central + Panel trasero de cristal Corning\nColor \tSubzero, Nightfreeze\nCombinación de memoria \tNightfreeze: 12 + 256 GB / 16 + 512 GB\nSubzero: 16 + 512 GB\nAlmacenamiento \tLPDDR5X Ultra + UFS 4.1\nProtección \tProtección contra el polvo y el agua: Resistencia al agua con clasificación IPX8* y\ndiseño exclusivo a prueba de polvo.\nPANTALLA\nTamaño y Tipo \t6,85 pulgadas BOE X10 FHD+ | AMOLED\nFrecuencias \tActualización: hasta 144 Hz | Muestreo táctil: Máxima 3000 Hz, multitáctil 360 Hz.\nResolución y Aspecto \t2688 × 1216 píxeles | Relación de aspecto: 20:9\nBrillo Máximo \t1800 nits\nMaterial \tVidrio Corning® Gorilla®\nColor y Precisión \tGama de colores: 100 % DCI-P3 | Precisión del color ΔE < 1\nR E D M AG I C 1 1 S P R O\nREDMAGIC 11S Pro\nEl modo más cool para dominar\nProcesador Snapdragon 8 Elite de quinta generación + REDMAGIC RedCore R4.	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 0}	[0.011590855,0.06626167,-0.04626467,0.042487457,0.008751774,-0.022391705,0.054510348,-0.031698953,0.029773315,0.004807921,-0.019058872,-0.005483746,-0.0015699808,0.010800851,-0.0065854327,0.042339332,0.025329538,-0.045993105,0.036759924,0.019108247,-0.023194054,-0.0017759684,-0.037673365,0.029230187,-0.017688707,-0.025057973,0.01863918,0.026070166,-0.008325913,-0.0041506123,0.04374653,0.03898181,0.025675165,0.053275965,0.047375616,0.015491505,-0.04574623,0.025650477,-0.026193606,0.0029671479,0.021231385,-0.0018006561,0.03434053,0.023008898,-0.007122389,-0.010282409,-0.016466668,0.007795128,-0.014516342,0.014010246,-0.041401204,-0.0015082615,-0.040932138,-0.03026707,-0.091245584,0.021947328,0.08211115,0.04352434,-0.01251047,-0.00967139,-0.019602,-0.03910525,0.0034007248,-0.044215593,-0.0012559845,0.04522779,0.05638661,-0.029477064,0.073272966,-0.060237885,-0.027897052,0.03236552,0.008646852,0.07564298,-0.014355873,0.0066718394,-0.042215895,0.047153424,-0.0057337084,-0.008720915,-0.01096132,0.022762021,0.05144908,0.023292806,-0.0054621445,0.06038601,-0.023539681,0.0512022,0.08971495,0.014084308,0.045573417,-0.009560295,-0.0024841956,0.019058872,0.05584348,-0.03495772,0.01602229,0.010183658,0.044363722,-0.06631105,0.009060371,0.013689307,0.007406297,0.043549027,0.0001693419,0.023971716,0.02582329,-0.026218293,-0.0030597267,0.04646217,1.4851169e-05,-0.0024996253,0.03416772,0.029649876,0.025304848,0.03942619,-0.0056133564,-0.06364478,0.023157023,0.04626467,0.036389608,0.043302152,0.027008297,-0.06038601,0.031575516,0.045375913,0.09470186,0.028514246,-0.0047770618,0.02792174,0.005622614,-0.012948677,0.0021262246,0.0165037,-0.037870865,0.029625189,-0.035451476,0.035031788,0.022428738,0.016059322,-0.02198436,0.0035118193,-0.021774514,0.06290415,0.015837133,-0.036537733,0.015800102,0.02208311,0.03004488,0.029946128,0.036192108,-0.015787758,0.0065175416,0.005418941,-0.0018145428,0.03485897,-0.0088813845,0.01976247,0.03962369,0.03646367,0.021601701,-0.021675764,0.009807172,0.051992208,0.008467867,0.0065484014,0.06715043,0.021231385,0.012738831,0.04384528,-0.034908347,-0.013849776,-0.018046677,-0.037870865,-0.08749306,-0.00036992913,0.03833993,0.08324678,-0.02153998,-0.011905623,-0.016429637,-0.017182609,-0.064977914,0.01786152,0.014615093,0.021947328,0.036167417,-0.021848578,0.020206848,-0.010510771,0.015219941,0.06231165,-0.009257872,0.09262809,0.01782449,-0.020515444,0.010171315,0.02282374,-0.05048626,-0.017515894,0.009362794,-0.0065854327,0.018935433,-0.0139361825,0.017799802,0.04888156,-0.020873414,0.004832609,0.06364478,0.05638661,0.036167417,0.0410062,0.08275303,0.019305749,0.047671866,-0.011738981,0.12057452,0.059398506,0.009492405,-0.04236402,0.0045703026,0.022737334,0.025119692,0.07050795,-0.005820115,0.0043172543,0.0708042,0.057176616,0.007622314,-0.025527038,0.02208311,0.016219791,-0.022317642,-0.050214697,0.04312934,-0.04902969,0.010004673,0.021268418,0.012158671,-0.045178413,-0.077815495,-0.05376972,0.02772424,-0.031476762,0.04384528,0.0039870567,-0.036735233,-0.027526738,-0.017491205,-0.088924944,-0.038191807,0.030563321,0.0002690569,0.04152464,0.014652125,-0.03742649,-0.002741873,-0.027971117,0.04636342,0.014071965,0.025922041,-0.0426109,0.026267668,-0.01860215,-0.014652125,-0.015071815,0.021688107,-0.030859573,-0.03678461,0.03974713,0.024379062,0.011232885,-0.068631686,0.01280055,0.07090295,0.014899001,0.01934278,0.020392004,0.008344429,-0.06413853,-0.019750126,0.0067335586,0.0016741318,0.051695954,0.042018395,-0.004264793,0.057176616,0.01157234,0.0408087,0.042487457,0.024786409,0.016997453,0.022687957,-0.0124425795,0.08117302,-0.021626389,0.0039284234,0.062854774,0.009418341,-0.012294454,0.057472866,0.023576712,0.03994463,-0.015503849,-0.012078436,0.006181172,0.010862569,-0.024749378,0.010084908,-8.3803025e-05,0.023947028,0.07998801,0.058015995,0.03698211,-0.036710545,0.03246427,-0.027205799,-0.08625868,-0.02272499,-0.030069567,0.0025150552,0.023922341,0.0063879313,4.674743e-05,0.014874314,-0.026415793,-0.0010229949,0.048461873,0.02192264,-0.054214098,0.0023206398,0.030242382,-0.021107947,0.0013871378,0.04352434,-0.012133984,-0.019589657,0.05934913,-0.040833388,0.010233034,-0.02382359,-0.029007997,0.09312184,0.017589957,-0.052732836,0.013738682,-0.049918443,0.058855377,0.052337833,0.0076902052,0.047918744,-0.008943104,-0.035673667,0.0013771084,0.020638881,-0.018244179,0.061571017,-0.00044862102,0.009436857,0.016195104,0.011263744,0.037747428,0.0043573715,-0.0010839425,-0.016392605,0.031526137,0.028267369,0.01222039,-0.051695954,-0.059694756,0.023231085,0.01660245,-0.089517444,0.019194653,-0.014923689,-0.011646403,0.064780414,0.015886508,0.025527038,-0.048856873,0.05599161,0.032859273,0.048437186,-0.08270365,-0.051597204,-0.005135033,0.01828121,-0.029378314,-0.016750576,-0.031353325,0.04394403,0.04246277,-0.0035704526,0.0076037985,0.041351825,-0.004659795,0.0008864412,-0.016725888,-0.019009497,0.010640381,0.039376814,-0.006869341,0.08502429,0.041993707,0.033649277,-0.042833086,0.0040672915,0.009115918,-0.044215593,0.012479611,0.015763069,0.00037397945,0.030291757,-0.009819516,-0.0012706429,0.02856362,-0.026835484,0.0039284234,-0.006832309,0.0014835739,0.018491056,-0.03036582,-0.0019117505,-0.061274767,-0.015763069,0.019688407,0.009652874,0.011887107,0.019787157,0.0067397305,-0.0043604574,0.058657873,0.06063289,0.04584498,0.014590406,0.023317493,-0.01886137,0.020009346,0.04298121,0.01918231,0.021811545,0.015639631,0.05584348,0.0099367825,0.07465548,0.02782299,-0.05544848,-0.0080605205,0.021527637,0.042833086,0.019811844,-0.05268346,-0.003607484,-0.064977914,-0.028612996,5.3425636e-05,0.04754843,0.009770141,0.024650626,-0.05125158,0.0024039606,0.028835185,-0.019503249,0.027279861,-0.024872815,-0.01344243,0.02260155,-0.023675464,0.010282409,0.0494,0.02166342,0.0412037,0.00089261314,0.041796204,0.031674266,0.016750576,0.028193304,0.0032279112,-0.03362459,-0.011738981,-0.0016432722,0.012146328,0.009257872,-0.0071347333,-0.0046073343,0.071051076,0.039475564,0.030933635,0.04752374,0.040068068,0.014676812,-0.030859573,0.023119992,0.008116067,0.004588818,-0.0068014497,-0.0214042,-0.109119445,-0.042833086,-0.027205799,0.03495772,0.017318392,-0.03382209,0.030439882,0.09065308,-0.03717961,0.009708421,-0.02192264,-0.034315843,0.0069125444,-0.04710405,-0.043178715,-0.002893085,-0.019281061,0.044339035,0.050609697,-0.012961021,-0.05028876,0.019009497,-0.0138004,-0.012677113,0.016195104,-0.015800102,-0.03922869,0.044092156,0.031698953,-0.0023514994,0.040339634,0.006326212,-0.023638433,-0.0018099139,-0.0128252385,0.02282374,0.05110345,0.07228546,0.13904089,0.009856547,0.053275965,0.036537733,-0.026168916,-0.024613595,0.022836084,0.015047127,0.04974563,-0.030316444,-0.047499053,0.019108247,0.021379512,-0.021589357,0.036611795,-0.06789106,0.041574016,-0.037154924,0.016590105,-0.009041854,0.013479461,-0.015158222,0.050510947,0.027107049,-0.008362944,0.040833388,-0.043697156,0.0706067,0.0015013182,0.051152825,0.030933635,-0.04510435,0.0332049,0.0004000172,-0.007066842,0.044882163,0.02876112,0.02028091,0.05732474,0.011368667,-0.022873115,0.026119541,0.027576113,0.0039129937,0.06384228,0.0274033,0.019811844,0.072680466,0.07485298,0.049474064,-0.083987415,-0.05702849,-0.043573715,-0.0009867349,0.012115468,0.05312784,0.035772417,-0.024835784,0.011214369,-0.02192264,-0.015972914,-0.014652125,-0.016367918,-0.025477663,0.0060885935,0.025922041,0.027798302,0.04174683,0.02153998,0.013590556,0.037648678,-0.017898552,-0.059793506,0.004033346,0.006104023,-0.0394015,0.041129638,-0.013047427,-0.029477064,-0.0030875,0.062262274,0.05544848,0.04732624,0.056880362,0.031797703,-0.007591455,0.03824118,0.013491805,-0.024033435,-0.057275366,0.022650925,0.054411598,0.05850975,-0.007289031,0.034291156,0.033155523,0.045869667,-0.013393055,0.021009197,0.00960967,0.022947177,-0.02272499,0.015059471,-0.05125158,-0.05248596,0.030291757,-0.010973664,0.027452676,0.037895553,0.00011475904,0.056880362,0.038537435,0.035253976,-0.045351226,0.04619061,0.008122239,-0.011331635,0.007424813,-0.0042894804,-0.023231085,-0.029674565,-0.023996403,-0.0057985135,0.034612097,0.042141832,-0.014615093,0.040068068,0.007338406,-0.05352284,0.08551805,-0.020441381,0.014701501,0.025428288,-0.027477363,-0.027279861,0.03014363,0.020663569,-0.022811396,-0.0034809597,-0.014676812,0.029254874,0.036513045,-0.020009346,0.020157473,0.05806537,-0.003906822,0.004338856,-0.033575214,0.017910896,0.049523443,0.008807322,0.04922719,0.013232584,0.08072864,0.027205799,-0.0068384814,-0.012084609,0.053819094,-0.027205799,0.041993707,0.054460973,0.01076999,0.026218293,0.046412796,-0.0034809597,-0.027576113,-0.0064434786,0.07677861,0.009572639,0.03868556,0.012189531,0.010720615,-0.014565718,0.024761721,0.050115947,-0.055596605,-0.027452676,0.029180812,0.058164123,0.018849026,-0.006418791,0.0071594208,0.032933336,0.026588608,0.021379512,0.025156723,0.00374018,-0.095886864,0.010374988,0.044832785,-0.060139135,-0.0071038734,-0.03582179,-0.023255773,0.08008676,0.020231536,0.035673667,0.039055873,0.03962369,-0.09662749,0.048955627,0.021651076,0.017330736,-0.032414895,0.0069866073,0.035056476,-0.032735836,0.039673068,-0.008677712,-0.03498241,0.0017003624,0.002964062,-0.024107497,0.024391405,-0.07356922,0.0412037,-0.060237885,0.035550226,-0.01840465,0.06636042,0.016170416,-0.008628337,0.05312784,0.039278064,0.009035682,0.009276387,0.017034484,0.05490535,0.0030720704,-0.04648686,-0.008202475,0.009257872,-0.022934834]
d3fb14f5-8bee-417a-8a37-55199832c30e	R E D M AG I C 1 1 S P R O\nREDMAGIC 11S Pro\nEl modo más cool para dominar\nProcesador Snapdragon 8 Elite de quinta generación + REDMAGIC RedCore R4.\nRefrigeración AquaCore reforzada: el primer teléfono con refrigeración líquida producido en masa del mundo.\nBatería grande de 7.500 mAh, carga por cable e inalámbrica de 80 W, con soporte para carga inversa.\nPantalla OLED BOE X10 Full-Screen (2688 × 1216).\n*Resistencia al agua con certificación IPX8 y diseño exclusivo a prueba de polvo.\n•\n•\n•\n•\n•	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 1}	[0.016625557,0.074247666,-0.022446968,0.02104095,0.01811791,-0.02090528,0.059595466,0.013270845,0.007332265,-0.0011200359,-0.04435126,-0.003619882,0.00112389,0.036778495,-0.0026023684,0.028860388,0.026196351,-0.059595466,0.0121916635,0.026813027,-0.023322647,-0.00047522513,-0.011735324,0.012666504,0.019425262,-0.018142577,0.028885055,0.033645786,-0.021521956,0.019622596,0.059250128,0.03186976,0.027898375,0.03211643,0.039491862,0.028909722,-0.014467195,0.023063643,-0.00010522016,0.024124324,0.057178102,-0.01212383,0.030044403,0.062703505,-0.03367045,-0.027331034,-0.058954123,0.023137644,-0.029057724,0.015034535,-0.031327087,0.0008055316,-0.047459304,-0.02710903,-0.061815497,0.042451903,0.07819438,0.0372965,0.0030987917,0.023458315,-0.048026644,-0.004896399,0.0017976075,-0.016674891,-0.0038048844,0.03672916,0.057227436,-0.0034626299,0.03246177,-0.04748397,-0.014109523,0.02146029,0.027133698,0.07395166,-0.0017914408,0.0032406268,-0.040651213,0.022952642,0.0040268875,0.00793044,-0.008873953,-0.017044896,0.033596452,0.044277262,0.001641897,0.04336458,-0.026640357,0.044671934,0.07163296,-0.007800938,0.055747416,0.0037247166,-0.01927726,0.013542182,0.023260979,-0.014713864,-0.010051802,0.008522448,0.028811054,-0.0648742,0.008244944,-0.005981747,-0.017501235,0.02273064,0.007375432,-0.0018978171,0.0052633206,-0.02925506,-0.03658116,0.013603849,0.02407499,-0.013418847,0.051110018,0.009243958,0.035939816,0.010884313,-0.033621117,-0.041539226,0.0127035035,0.027824374,0.008516281,0.035125803,0.049506664,-0.047582638,0.0520967,0.03145042,0.07755304,0.026813027,-0.010230637,0.036285155,0.0013798102,-0.04583128,-0.029427728,0.0128268385,-0.045880616,0.015478541,-0.03862852,0.035643812,0.017451901,0.029230393,-0.015441541,0.009583129,-0.014861866,0.050863348,-0.013221511,-0.0420819,0.023014309,0.028737053,0.04945733,-0.004187223,0.01906759,-0.035643812,0.0005453719,0.037395168,-0.0006020289,0.037419837,-0.033251114,0.038159847,0.0099038,-0.00064018567,0.034484465,-0.009564629,0.048791323,0.030710412,0.023112977,0.004403059,0.09225457,0.009842132,0.028638385,0.061568826,-0.017834239,-0.001711273,-0.032141097,-0.040478542,-0.08056241,0.015774544,0.044055257,0.07987174,0.004600395,0.024950668,-0.014726197,0.0048933155,-0.09437593,-0.00069029053,0.004270474,-0.0058275783,0.045041937,-0.042747907,0.014084856,0.010279971,0.014220525,0.063196845,0.010384806,0.10764678,-0.0032899608,-0.044893935,0.013961521,0.040971883,-0.042772576,-0.019782932,0.005192403,0.017316233,0.0040793046,0.0053373217,0.021472622,0.05357672,-0.016021214,-2.0210558e-05,0.06245684,0.044474598,0.00844228,0.01840158,0.06694623,-0.00033840036,0.043734588,0.0036815493,0.12688704,0.065219544,0.0012765172,-0.024395661,0.005383572,0.043808587,0.04972867,0.07257031,-0.01536754,-0.018253578,0.063640855,0.021472622,0.015675876,-0.017636903,0.03934386,0.0099038,-0.031524424,-0.026813027,0.045288607,-0.03806118,0.028909722,0.05012334,0.032634437,-0.025049336,-0.03633449,-0.07049828,0.01589788,-0.04311791,0.042032566,-0.0026655775,-0.03682783,-0.051060684,-0.008059941,-0.049531333,0.001143932,0.03754317,-0.021114951,0.053034045,0.011235817,-0.04750864,-0.0075234342,-0.02280464,0.03246177,0.028786387,0.024062656,-0.01671189,0.019819932,-0.030217072,0.008399113,0.00047792308,0.006394919,-0.033621117,-0.020399608,0.016058216,0.047557972,0.028638385,-0.05407006,-0.002525284,0.07123829,-0.0020581526,0.027923042,-0.01339418,0.025530342,-0.06112482,-0.03295511,-0.014763198,-0.020325607,0.05579675,0.04099655,-0.0076652695,0.030858414,0.0036291322,0.015478541,0.05954613,0.015355206,0.02502467,0.011562656,-0.021201285,0.07138629,0.0069005927,0.015996547,0.028712386,0.00035921315,0.020781945,0.05826345,0.0149112,0.02016527,-0.02259497,0.013110509,0.0077886046,-0.016588556,-0.025259007,0.015737545,-0.023569316,0.064134195,0.054020725,0.043981258,0.02030094,-0.033867788,0.02333498,-0.026763692,-0.041637894,-0.036852494,-0.008078442,-0.0022061546,0.044055257,-0.0003191293,-0.05273804,-0.0020442775,-0.03672916,-0.010495808,0.023384314,0.035939816,-0.060680814,-0.0036137153,0.014726197,-0.053675387,0.054020725,0.055500746,-0.028145045,-0.024543663,0.084459804,-0.073902324,0.0019409844,-0.03788851,-0.0074864337,0.09383326,0.03295511,-0.007406266,0.04107055,-0.050000004,0.028169712,0.057178102,-0.011137149,0.03130242,0.02012827,-0.043734588,0.012863839,0.008997288,-0.017883573,0.07710904,-0.03006907,0.051554024,0.022200298,0.036901828,0.0098729655,0.0077454373,-0.0007326869,0.009132956,-0.0028598302,0.034903802,0.027380368,-0.074445,-0.050814014,0.04000987,-0.007973607,-0.073803656,0.014010855,-0.02502467,0.025826346,0.0470153,-0.0007072491,-0.0064319195,-0.056092754,0.063640855,-0.0027950793,0.06546621,-0.10103603,-0.01597188,-0.0064812535,0.02079428,-0.04610262,-0.008362113,-0.033226445,0.03549581,0.013616183,-0.013801185,0.0053959056,0.03596448,-0.0065799216,-0.012037495,-0.0027395785,0.040971883,-0.013517515,0.034706466,-0.00823261,0.07710904,0.021238286,0.015823878,-0.048865322,0.02128762,0.034607798,-0.05786878,0.0071842633,0.0069005927,-0.018130243,0.023926988,-0.019782932,0.00794894,0.028909722,-0.025974348,0.0026794528,-0.0032005429,0.00059200794,0.034336463,-0.02925506,0.00010801447,-0.052639373,0.011112482,0.0397632,0.033719786,0.0012140789,0.004880982,0.0298224,-0.0029415395,0.055402078,0.054267395,0.0619635,0.02686236,0.018179577,-0.030019736,0.019375928,0.0127528375,0.021830292,0.011568822,0.0052787377,0.06433153,0.042229902,0.065120876,-0.00694376,-0.059842136,0.006015664,0.02146029,0.038159847,0.045732614,-0.019856934,-0.013061175,-0.062012833,-0.018598916,0.00914529,0.040799215,0.020769613,0.033497784,-0.0520967,-0.00422114,0.040947217,-0.017920574,0.033719786,-0.047681306,0.02375432,0.023014309,-0.017895907,0.007868772,0.074247666,0.061272822,0.040897883,-0.011439321,0.02604835,0.031499755,0.013616183,0.037197832,-0.014331526,-0.012450667,-0.0027719538,0.012000495,0.0030741247,0.018635917,0.014886533,-0.006863592,0.036605824,0.019536262,0.060187474,0.01861125,0.047607306,0.0298224,-0.012456834,0.024703998,0.027750373,-0.027059697,0.01018747,-0.014553529,-0.11001481,-0.044523932,-0.022126297,0.028465716,-0.0010791812,-0.010754811,-0.00058468495,0.10971881,-0.036679827,0.02654169,-0.0397632,-0.022829307,0.022286633,-0.04173656,-0.045288607,0.007116429,-0.03137642,0.04699063,0.06961027,0.026887028,-0.05160336,0.004569561,0.03608782,0.013517515,0.013196844,-0.011254318,-0.03633449,0.044523932,0.05880612,0.022261966,0.046817962,0.026665024,-0.004985817,0.040034536,-0.020855946,0.001843858,0.042599905,0.073803656,0.13892454,-0.0067279236,-0.005423656,0.040478542,-0.0061945,-0.04099655,0.013591516,0.043191914,0.054366063,-0.016317219,-0.03796251,0.017883573,0.040971883,-0.02107795,-0.01039714,-0.09028121,0.049284663,-0.067686245,0.027676372,-0.011827826,0.011235817,-0.010372473,0.025703011,0.024827333,0.008584116,0.05199803,-0.0007380828,0.06408486,0.044770602,0.073902324,0.033991124,-0.02280464,0.03756784,-0.0002239301,-0.0061174156,0.036161818,0.044425264,0.042747907,0.05530341,0.028169712,-0.01164899,0.037099164,-0.002085903,0.014282192,0.057671443,0.01540454,0.05323138,0.052540705,0.05407006,0.04888999,-0.083917126,-0.009916133,-0.06852492,-0.016008882,0.014417861,0.07858905,0.034065124,0.00035709335,-0.0028567468,-0.015268872,-0.018413914,-0.016292552,-0.027059697,-0.051455356,0.015564876,0.010119636,0.006163666,0.010002468,0.04033054,0.0010036385,0.05811545,-0.012438334,-0.05071535,-0.022224965,-0.010982981,-0.0423039,0.017525902,-0.0037987176,0.000741937,0.0022030713,0.07207697,0.05004934,0.053132713,0.05678343,0.0047823144,-0.013455847,0.034854468,0.016230885,-0.031401087,-0.059595466,0.005725827,0.065219544,0.023544649,-0.008096942,0.022829307,0.020535275,0.03894919,0.004640479,0.0020442775,0.0014214357,-0.019018255,-0.025333008,0.0035088805,-0.05259004,-0.051455356,0.03608782,0.026245685,0.022545636,0.02115195,-0.0011007647,0.04740997,0.049901336,0.05915146,-0.056092754,0.010051802,0.015749877,-0.018586583,0.01931426,-0.0151455365,0.005275654,0.0042828075,-0.024284659,0.006475087,0.017994575,0.027898375,-0.021965962,0.028293047,0.0054359897,-0.045880616,0.060927484,-0.012222498,-0.0016141466,0.021472622,-0.027207699,-0.026393687,0.023162311,0.018105576,-0.029353727,-0.01840158,-0.0064319195,0.02703503,0.0397632,-0.010421807,0.02033794,0.06334485,-0.023532316,0.012253331,-0.03317711,0.045633946,0.04173656,0.052392703,0.05199803,0.0048069814,0.034583133,0.011852493,0.01787124,-0.009965467,0.08302911,-0.0012086829,0.046941295,0.053379383,0.018512582,0.024469662,-0.006086582,0.0016033548,-0.03732117,-0.048791323,0.05855945,0.0028536634,0.036778495,0.017303899,0.004116305,-0.025703011,0.029921068,0.05333005,-0.066206224,-0.035520475,0.018130243,0.01815491,0.023544649,-0.001563271,0.00053881976,0.036679827,0.072816975,0.0015509375,0.019289592,0.0046373955,-0.07385299,-0.0051214853,0.032067098,-0.029945735,-0.00035767147,-0.024852,0.0018793169,0.06285151,0.03450913,0.019005923,0.04689196,0.033571783,-0.09980267,0.06946227,0.022286633,0.015737545,-0.04607795,-0.018105576,0.013616183,-0.035150472,0.013332512,-0.007868772,-0.041539226,0.013591516,-0.020152938,-0.05308338,0.033226445,-0.047113966,0.03571781,-0.027947709,0.0074617667,-0.036531825,0.0918599,0.0060958317,0.0099593,0.055402078,0.0012603294,-0.006163666,0.012031328,0.03122842,0.025949681,0.05495807,-0.0398372,-0.021127284,0.01914159,-0.0058799954]
49dc88c0-e5f6-4555-90ab-114ce074a24d	-- 1 of 2 --	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 2}	[-0.05327178,0.012355422,-0.05733981,0.02520724,0.035353094,-0.043053288,0.08838273,-0.020436993,0.027362324,0.045983236,-0.0012266131,0.0149161,0.003526229,0.023088476,0.013632733,0.0122525105,0.0071795834,-0.079326525,-0.013463233,0.011725846,-0.01478292,0.012409904,-0.015376174,0.042399496,0.03523202,-0.027895043,-0.009879494,0.0055057597,-0.038791545,0.015993642,0.010539338,0.04281114,0.0022822116,0.042544782,0.008571914,0.06663816,0.022277292,0.028887834,-0.025957888,0.019541059,0.0045886375,0.028839406,0.031333495,0.03828304,-0.047024455,0.028330904,-0.0032053874,0.046903383,0.009407313,0.05123777,-0.041624635,0.022168325,0.02716861,-0.0058689765,-0.009546545,-0.012785228,0.065475866,0.0050123907,-0.05733981,0.026393747,-0.029662697,0.024093375,0.012379636,-0.038355686,0.018063977,0.030098557,0.051479913,-0.02071546,0.016586896,0.05913168,0.030316487,0.03423923,0.03344015,0.07027032,-0.03360965,-0.012288832,-0.0246382,0.026926465,-0.058356818,-0.020400671,-0.042883787,-0.009056203,-0.01818505,-0.0011509429,-0.030703919,0.006319971,0.011138646,0.02311269,0.03644274,0.017640224,0.037314463,-0.01997692,-0.014673955,0.042544782,0.04361022,0.014044379,-0.0039499816,0.040970843,-0.0020309868,-0.04373129,-0.012833657,0.0099037085,-0.006350239,0.004246609,-0.005097141,0.031672496,0.026611676,-0.03828304,0.04656438,-0.042278424,0.031769354,-0.013366375,0.06416828,-0.009709993,0.052303206,0.0454263,0.044264007,-0.006047558,0.055112083,0.021623502,0.0092135975,0.009522331,0.039929625,0.018608803,0.06537901,0.034311872,0.005487599,0.024698736,0.010539338,0.0009345263,0.0031993338,-0.062909134,-0.07225591,0.00096479437,-0.06494315,-0.03685439,0.0021535724,-0.0030585874,0.022023039,0.036515385,-0.009298348,-0.030437559,-0.026030531,0.028524619,0.020969711,-0.041551992,0.003662435,0.061601553,0.054918367,0.04143092,0.025497813,-0.00906831,0.038525186,0.020509636,-0.061068837,0.047847748,-0.002749853,0.028815191,-0.01971056,0.005802387,0.073902495,-0.026829608,0.010345623,0.05424036,0.06353871,0.014879778,0.03632167,-0.008644558,-0.026272675,0.03729025,-0.0020491476,0.0405592,0.008808005,-0.07249805,-0.08189326,0.02668432,0.019177843,0.009764476,-0.03963905,0.062860705,0.017216472,0.020049563,-0.08450842,0.05651652,0.04503887,0.012845764,-0.00039424148,-0.0534655,0.034166586,0.029711127,0.0110115195,0.016623218,-0.019528951,0.112839326,0.07748623,-0.04818675,-0.018306121,0.028548833,-0.059858114,0.031454567,-0.0033779154,0.032108355,0.029686911,-0.04835625,0.011671363,-0.0024290117,0.06349028,-0.006217059,0.022495221,0.0085477,-0.017640224,0.026490605,0.06504001,0.023935981,0.014104916,0.013838557,0.16117136,-0.0048005143,0.020521743,-0.08019825,0.0017479804,0.03903369,0.0603424,0.036927033,-0.0032871112,-0.0036412475,-0.026224246,0.03963905,0.07801895,0.0027967687,0.028379332,0.005369554,-0.05859896,-0.0064592035,0.055499513,-0.017724976,0.061601553,0.038040895,0.015255102,-0.03675753,-0.0038682579,-0.006410775,0.035813168,-0.012736799,0.013051587,0.007645712,0.006077826,-0.05772724,0.03859783,-0.046419095,0.027434967,0.030728133,0.046733882,-0.0008134541,0.06881746,0.0032961916,-0.032350503,0.01701065,0.039178975,0.027289681,0.04547473,-0.013802235,-0.008014982,-0.030340701,0.017737083,0.015194565,-0.054482505,-0.039978053,-0.018524053,-0.015836248,0.014201773,0.006937439,-0.022519436,-0.0075972825,0.04295643,0.035256233,0.0045311283,-0.0052182134,0.041576207,-0.027192824,0.0006954087,-0.02167193,0.042278424,0.04656438,0.06949546,0.022834223,0.025279883,-0.0036745423,0.0076517654,0.040922415,0.017664438,-0.0054482506,0.07022189,-0.034045514,0.02537674,0.024505021,0.045498945,0.010938876,0.0059385933,0.01652636,-0.027556041,0.07889067,0.06005183,-0.008499271,0.021962503,0.06697716,-0.03191464,0.029638482,-0.01661111,-0.019468416,0.042786926,-0.005893191,0.026127389,-0.004909479,0.00080286025,0.030364916,-0.012530976,-0.020679139,-0.06886589,0.048719466,-0.015291424,0.019601595,0.043876577,0.005342312,0.013208981,-0.019286808,0.0014120049,0.01094493,0.02869412,0.00052401575,-0.051334627,0.020969711,-0.041358277,0.031890426,-0.0033748886,-0.038210396,-0.04164885,0.06213427,-0.040656056,-0.005408902,0.0012462874,0.036200598,-0.013693269,0.013184766,-0.007960499,0.031236637,-0.024190232,-0.012530976,0.02646639,0.034941446,0.0050880606,0.06334499,0.024432376,0.010375891,0.0026605623,-0.08625186,0.067461446,-0.06533058,-0.0013507121,0.04203628,-0.0018463515,0.06959232,-0.0112355035,0.0001589073,-0.0024774405,0.0007839427,-0.0042284476,-0.04295643,0.024323411,-0.020703353,-0.017301222,0.031599853,-0.010848072,0.0038470703,-0.06658973,0.051383056,0.025400955,-0.0016692835,-0.0014377328,-0.03666067,0.0048761843,0.03789561,0.051818915,-0.064022996,-0.00889881,-0.027628684,0.031624068,-0.02825826,-0.002550084,-0.012070902,0.025497813,0.009921869,0.011302093,0.011574506,0.07864852,0.0672193,-0.029081551,0.019080983,0.009667618,0.00020260681,-0.007294602,-0.01066041,0.015715176,-0.007645712,0.08489585,-0.06005183,0.007857588,-0.023439584,-0.05157677,0.002598513,0.03065549,0.023923874,0.022979511,-0.025352526,0.005756985,0.037169177,-0.028040329,-0.05341707,0.03174514,0.026321104,0.009316509,-0.033585437,0.075452216,-0.005862923,-0.007361192,0.07801895,0.10964301,0.05593537,0.016381074,0.029154195,-0.02712018,0.08804373,0.009716047,0.03157564,0.0030737214,0.020654922,0.01268837,0.012361475,0.020461207,0.014855564,0.024844022,0.0051697847,0.02716861,0.05394979,0.02515881,-0.011338415,-0.00848111,-0.023064261,-0.011350522,0.022035146,0.042980645,-0.06276385,0.020013241,-0.034602445,0.0832977,0.012954729,0.030146986,0.07797052,0.029202623,-0.019843739,-0.012954729,0.02110289,0.014891885,0.05772724,0.04857418,0.040413912,0.03271372,-0.014298631,0.04300486,0.03283479,0.011859026,0.0385494,0.04874368,0.034820374,0.07826109,0.05336864,0.016792718,-0.030510204,-0.054918367,-0.032907434,-0.011677417,0.013439018,-0.008287394,0.03305272,0.064458854,0.035619453,0.0140201645,0.06833317,0.06431357,0.036830172,0.0041376436,-0.026103174,0.022870544,0.008717201,-0.033415936,0.008656665,-0.017519152,-0.14557725,0.009552599,0.0074641034,-0.028573047,0.007252227,-0.03484459,0.020981818,-0.007960499,-0.06518529,-0.0010495449,-0.01151397,-0.013087909,-0.009183329,-0.019674238,-0.0077425693,0.02951741,-0.012857871,0.0098129045,0.018378764,-0.007730462,-0.06382928,0.0030933956,0.11574505,0.039614834,-0.009649457,-0.0019326155,-0.02830669,0.009982406,-0.057485096,0.007591229,0.0596644,0.0034112101,0.021635609,-0.0040680273,-0.023996517,0.036830172,0.054821506,0.04024441,0.12581827,0.006925332,0.039469548,0.060875118,-0.032471575,-0.05041448,-0.026030531,-0.020085884,-0.00529691,-0.0031599854,0.026054746,0.051092483,0.026393747,-0.023705944,-0.0600034,0.0128820855,0.023960195,-0.070125036,0.0050880606,-0.012918407,-0.023596978,0.022555757,0.04581373,0.017277008,-0.009746315,0.005502733,-0.02205936,0.03283479,0.045111515,0.0367091,0.052739065,0.036418527,0.027677113,-0.0010253305,-0.01456499,-0.0007517829,0.054434076,0.04225421,0.03457823,0.0156062115,-0.056758665,0.036878604,0.022749472,0.0059930757,0.03893683,0.046588596,0.025352526,0.018572481,0.04840468,-0.012736799,-0.027410753,-0.040317055,-0.05869582,0.0066044903,-0.02663589,0.0037199445,0.025982102,0.01094493,0.0079120705,-0.044409297,0.073950924,-0.029686911,0.0054028486,-0.009631297,0.0079120705,-0.005411929,-0.0018009495,0.00123191,-0.016974328,-0.02232572,0.0341908,-0.048719466,-0.033948656,-0.006840581,-0.010091371,-0.032907434,0.041019272,-0.00015843437,0.021744573,0.011562399,0.019783203,0.042617425,-0.01932313,-0.0013529822,-0.0050759534,0.01845141,0.0051849186,0.024226554,0.03762925,-0.029154195,-0.01347534,0.052351635,-0.0058205477,-0.0053332318,0.020037455,0.0030812884,0.008801951,-0.021054462,0.059809685,0.04317436,0.009104632,-0.0033748886,0.017507045,-0.011647149,-0.013330053,-0.02197461,-0.01644161,0.03859783,0.046201166,0.042278424,0.016477931,0.035207804,-0.006147443,0.0016284216,-0.017373865,0.023136904,-0.017022757,0.014286524,-0.04416715,0.07138419,-0.038839974,-0.020110099,0.06344185,0.024783487,0.0021429786,0.026054746,-0.05729138,0.023911767,0.03462666,-0.0013522255,0.008438734,-0.025739957,0.010012674,-0.023173226,-0.023730159,-0.015933106,0.007470157,0.046201166,0.01644161,0.011150753,0.05656495,0.0258126,0.025885243,0.07351506,-0.009316509,-0.015025064,-0.025328312,-0.021986717,0.012978944,-0.004724844,-0.014201773,0.0133905895,0.018003441,0.02328219,0.038089324,0.006840581,0.0072764414,0.023136904,0.0015149163,-0.012288832,0.048767895,-0.00080513034,-0.0069556,-0.002519816,0.029686911,-0.058453675,-0.014068593,0.06726773,0.042181566,-0.0059507005,-0.03823461,0.020400671,-0.009104632,0.0050426587,0.055402655,-0.027725542,-0.018766196,0.028718334,0.021938289,0.010757268,0.023693837,-0.035086732,0.039881196,0.09986038,-0.08416942,0.042738497,0.0131968735,0.011168914,0.0017585742,0.031236637,0.010151907,-0.033343293,-0.014831348,0.039929625,0.039396904,0.03537731,-0.0534655,-0.005596564,0.05661338,-0.11090217,0.01565464,0.026829608,0.014746598,-0.039832763,-0.042932216,-0.022749472,-0.0009451201,-0.027459184,0.033585437,0.031018706,0.043925006,-0.027725542,-0.035740525,-0.015836248,-0.03048599,0.020788103,-0.054821506,0.029081551,-0.00089215103,0.051140912,-0.017761298,0.009104632,0.0365396,-0.017942905,-0.10170068,0.045765303,0.054579362,0.007415674,0.0600034,-0.016816933,-0.015218779,-0.0153519595,-0.0062897024]
3ee7f890-def9-4e3f-a8b6-5990ab5774da	SISTEMA DE REFRIGERACIÓN\nTecnología Principal \tSistema de refrigeración revolucionario REDMAGIC AquaCore\nComponentes Clave \tLámina de cobre debajo de la pantalla | Grafeno de alta conductividad bajo la\npantalla | Cámara de vapor grande de 13.116 mm²\nMateriales Térmicos \tMetal líquido compuesto 3.0 | Estructura intermedia de aleación de aluminio de\ngrado aeronáutico | Gel de alta conductividad térmica\nVentilación Activa \tVentilador turbo impermeable mejorado de 24.000 RPM | Conducto de aire de alta\nvelocidad hecho en aluminio de grado aeroespacial\nDisipación Adicional \tPlaca base de lámina de cobre | Refrigeración líquida circulante\nHARDWARE & RENDIMIENTO\nProcesador (CPU) \tSnapdragon 8 Elite Gen 5 Leading Version | Arquitectura Oryon™ 2+6 (Frecuencia\nhasta 4,74 GHz)\nGráficos (GPU) \tAdreno™\nCoprocesador \tRedCore R4\nRAM / ROM \tRAM: 12 GB / 16 GB LPDDR5X Ultra\nROM: 256 GB / 512 GB UFS 4.1	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 3}	[0.04080792,0.063151605,-0.042649433,0.011073629,0.0455713,-0.028801259,0.03980123,-0.017420711,0.00198423,-0.012503872,-0.050580215,0.0055613685,-0.017027855,0.049794503,0.017199729,0.033957493,0.036069095,-0.057111446,0.031305715,0.015321386,-0.023153953,-0.01602116,-0.019065795,-0.011503316,0.049254328,-0.005159305,0.020551281,0.0645266,0.0016696382,0.0031121564,0.052691817,0.02943965,0.043852556,0.023264444,0.029169561,0.026517782,0.011098183,0.031305715,0.004769518,0.036756594,0.049671736,-0.014707549,0.05426324,0.06305339,-0.015824733,0.01616848,-0.060794473,0.011589253,-0.015677411,0.016463123,-0.010496622,-0.0018000787,-0.022024492,-0.026223142,-0.050015487,0.039580245,0.081124775,0.010772849,0.0069977483,0.0020962553,-0.061383758,-0.019188562,0.0141550945,-0.018230977,0.0069977483,0.06855338,0.05460699,-0.001147109,0.050138254,-0.030225363,7.035154e-05,0.022061322,0.027254388,0.075477466,-0.04206015,0.0148303155,-0.015321386,0.0078018755,0.017076962,-0.007881674,0.0056350287,0.011067491,0.019372713,0.0462588,-0.0106132515,0.062562324,-0.016536783,0.04380345,0.06324983,0.011890033,0.036682934,-0.0032963078,-0.03764052,-0.00012641217,0.024995465,-0.04677442,-0.017506648,0.013762238,0.0030477035,-0.054508775,0.018758876,-0.0035019433,-0.017187452,0.010920171,-0.015824733,0.0055828528,0.03673204,-0.03336821,-0.02285931,0.02531466,-0.001821563,0.000963725,0.07537925,0.00023287463,0.021472039,-0.009520621,-0.019176286,-0.037002128,0.0049321847,0.01296425,0.008305223,0.05480342,0.06678553,-0.046234246,0.04893513,0.046013266,0.07478997,0.048836917,-0.013921836,0.035528917,0.0008133348,-0.0069425027,-0.030446343,0.031526696,-0.07248194,0.056620378,-0.04927888,0.03489053,-0.013860452,0.0071634846,-0.0064452942,-0.014953083,-0.0031275025,0.04225658,0.00839116,-0.016598167,0.0020425445,0.029660631,0.043631576,0.013835899,0.015051297,-0.066687316,-0.011576977,0.0406606,0.0045792283,0.054852527,-0.02331355,0.023939665,0.013393936,0.01088334,0.019790122,-0.069093555,0.047928438,0.042673986,0.03601999,0.019998828,0.10440149,0.007599309,0.036781147,0.0511695,0.0014609334,-0.0013980151,-0.033613745,-0.05313378,-0.08146852,0.023117123,0.024001049,0.094236344,0.031649467,0.0036953022,0.017997717,0.028752152,-0.08544619,0.0013535118,0.0029157284,-0.0005651142,0.061580185,-0.06364268,0.029979827,-0.0027530615,0.01802227,0.028604832,-0.029046794,0.107937194,0.009459237,-0.04647978,-0.012258336,0.055294488,-0.032165088,-0.046921745,0.03309812,0.007660693,0.047486473,0.018280083,-0.004220133,0.042281132,-0.010852648,0.020661773,0.08107567,0.049868163,0.035528917,0.022196366,0.06442839,0.022282304,0.047437366,-0.015088127,0.1255175,0.055490915,-0.024946358,-0.01605799,0.006604892,0.02373096,0.031232055,0.05809359,-0.0075133718,-0.005229896,0.06963374,0.012853758,0.021975385,0.0038702458,0.020072488,0.038082484,-0.031502143,-0.03842623,0.042870417,-0.015922947,0.019249946,0.041519973,0.03049545,-0.015824733,-0.03196866,-0.056816805,0.043754343,-0.036216415,0.053723063,0.01843968,-0.04289497,-0.04864049,-0.0187466,-0.0749864,0.014216478,0.039285604,-0.01783812,0.061089113,0.001131763,-0.021324717,0.001299801,-0.029292328,0.02078454,0.048345845,0.031158395,0.0073169437,0.009680218,-0.022122705,0.019974275,-0.017543478,0.022797927,-0.049033344,-0.024393905,-0.0051654433,0.06757124,-0.00042009508,-0.031281162,0.002769942,0.0897185,0.008839261,0.012595947,-0.013970943,0.04697085,-0.073856935,-0.0101160435,-0.008943614,-0.0057700733,0.038524445,0.020759987,0.0063961875,0.027426263,0.020133872,0.00014281315,0.031428482,0.03349098,0.006911811,0.0062979735,-0.04954897,0.08775422,-0.008065825,0.024209755,0.025633857,0.031944107,0.02762269,0.04795299,0.0071021006,0.0071634846,-0.02505685,0.026345909,0.0040789507,-0.04527666,-0.022368241,0.036854807,0.010312472,0.030323576,0.074004255,0.049499862,0.034988742,-0.03098652,0.007869397,-0.027745457,-0.066539995,-0.021263333,0.010226534,-0.008771739,0.057946265,0.0054201856,-0.043607023,0.012442487,-0.046234246,-0.0038641074,0.020907307,0.023374934,-0.0616784,0.009090934,-0.0033055153,-0.045399427,0.0153827695,0.04296863,-0.020428514,-0.002100859,0.12031216,-0.05411592,0.0020563558,-0.031060182,-0.0023187713,0.08578994,0.04365613,-0.02127561,0.01621759,-0.068651594,0.02093186,0.07331676,-0.015996607,0.029906167,0.01889392,-0.04255122,0.020575834,0.027720904,-0.029709738,0.07537925,-0.0259285,0.03965391,0.024737654,0.042870417,0.062709644,0.00842799,0.0061230296,0.01636491,0.007421296,0.0075256485,0.014044603,-0.060057867,-0.071450695,0.019912891,0.02538832,-0.061874826,0.014793485,-0.015333663,-0.011079768,0.03980123,0.008041272,0.03091286,-0.04149542,0.040488727,0.009999414,0.08279441,-0.10469613,-0.030446343,0.004784864,0.046577994,-0.026345909,0.002578118,-0.04387711,0.049745396,0.018722046,-0.0018200284,-0.003170471,0.008796292,0.018501064,0.008833122,0.018992133,0.026812425,-0.0016957263,0.016647276,-0.030667325,0.07375872,0.009268947,0.040537834,-0.040046763,0.0104352385,0.03147759,-0.047511026,0.0039101453,0.006208967,-0.012516148,0.015161788,-0.032852586,0.019164009,-0.0026609858,-0.028997688,-0.012503872,-0.002883502,0.00091845443,0.034546778,-0.021705296,0.01836602,-0.066834636,-0.009987137,0.031698573,0.016045714,-0.019655079,0.02289614,0.046676207,-0.04031685,0.058437336,0.039211944,0.04417175,0.031060182,0.025363768,-0.033613745,0.05495074,0.021889448,0.007010025,0.02656689,-0.014953083,0.04095524,0.057946265,0.054852527,-0.005355733,-0.059419475,-0.01409371,0.011908449,-0.013627194,0.02789278,-0.029537864,0.012190814,-0.043607023,-0.019213116,0.0063654957,0.048763257,0.029734291,0.028997688,-0.03272982,0.0030783955,0.03056911,-0.030397236,0.016278973,-0.009962584,-0.010410685,0.010576421,0.008655109,-0.007630001,0.07189266,0.060057867,0.049892716,0.006604892,0.04213381,0.028310189,0.013209784,0.06555785,-0.03518517,0.01269416,-0.03218964,0.008520066,0.022613777,0.032214195,-0.008078102,0.00797375,0.04444184,0.014277861,0.04829674,0.00963725,0.052446283,0.0024476773,-0.0128905885,0.028506616,0.04142176,-0.0106316665,0.014241031,-0.010159012,-0.11039255,-0.0511695,-0.035578024,0.0064146025,0.0100976275,-0.016733212,0.00094684446,0.09595509,-0.031993214,0.009956446,-0.015554644,-0.023338104,0.0009345677,-0.024271138,-0.04765835,0.024688547,-0.032459732,0.031895,0.057897158,0.03589722,-0.02656689,-0.00018386354,0.015922947,0.0038641074,0.02060039,-0.026223142,-0.03027447,0.024197478,0.049499862,0.0051439586,0.004883078,0.029881613,-0.0012069581,0.03471865,-0.014682994,-0.011902311,0.052888244,0.049229775,0.12983893,0.0068688425,0.017432988,0.037886053,-0.014044603,-0.03034813,-0.010030106,0.039923996,0.036216415,-0.023534533,-0.017494371,0.032680713,0.007697523,-0.021521145,0.0039807367,-0.06413375,0.062856965,-0.051415034,-0.011349857,-0.005131682,-0.0022389726,-0.005423255,0.042354792,0.03948203,-0.01681915,0.061285544,0.019790122,0.050727535,0.018611556,0.04549764,0.030299023,-0.02316623,0.031354822,0.016463123,-0.029636078,0.035234276,0.029095901,0.060499832,0.047486473,0.023374934,-0.017138345,0.049107004,-0.030593663,-0.003563327,0.042305686,0.026174033,0.047142725,0.038303465,0.046921745,0.049794503,-0.06678553,-0.009244394,-0.05377217,-0.016156204,0.017960887,0.0883435,0.03420303,-0.007857121,0.0068872576,-0.03211598,0.008299083,-0.025560196,-0.032828033,-0.047339153,0.038671765,0.01144807,0.0016788457,0.01254684,0.045325767,-0.007224868,0.030520003,-0.017678522,-0.06585249,-0.024995465,-0.034031156,-0.050973073,0.019127179,0.0106132515,-0.015210895,-0.012681884,0.06860249,0.031895,0.019139456,0.07508461,0.0018261668,-0.002509061,0.02096869,7.485941e-05,-0.012988803,-0.05509806,0.005279003,0.04841951,0.022405071,0.017469818,0.03427669,0.022650607,0.061580185,-0.019446375,0.011460347,0.00676449,-0.007734353,-0.022736544,-0.0005229129,-0.056178413,-0.028064653,0.016180757,-0.011748851,0.022159535,0.018587,-0.005469293,0.04218292,0.058191802,0.05922305,-0.05431235,0.033147227,0.04073426,-0.03793516,-0.001609789,-0.023374934,-0.00232491,0.008323638,-0.025142787,-0.009060242,-0.0022988217,0.00944696,-0.025854839,0.022380518,-0.0031075526,-0.032312408,0.045743175,-0.0144742895,-0.016008884,0.026223142,-0.029341435,0.0031674018,0.024320245,0.03847534,0.001201587,-0.015652858,-0.0057485886,0.030176254,0.024737654,-0.009262809,0.034915082,0.052544497,-0.021864895,-0.014118264,-0.03734588,0.034522224,0.054410562,0.061383758,0.019790122,0.011773405,0.038868196,0.025682963,-0.0022052114,-0.00045308887,0.08628101,-0.014597057,0.05578556,0.049499862,0.00016228331,0.053379316,0.0056104753,-0.036265522,-0.030765539,-0.0052697957,0.04687264,-0.00027028035,0.030544557,0.0023755515,0.029758845,-0.00012813859,0.057356983,0.0466271,-0.06987927,-0.0511695,0.026763318,-0.00846482,0.02089503,0.022159535,0.00521455,0.036461953,0.057749838,0.02271199,0.018194145,0.0029157284,-0.058830194,-0.012595947,0.013934113,-0.051267713,-0.013123848,-0.015591474,-0.014204201,0.057897158,0.013553534,0.021152843,0.054165028,0.043705236,-0.091093495,0.05264271,0.021717573,-0.0052820724,-0.06344625,-0.03049545,0.00374134,-0.016671829,0.003925491,-0.013664024,-0.015566921,0.024590332,-0.017113792,-0.034153923,0.013185231,-0.05166057,0.03309812,-0.06054894,-0.014277861,-0.015431876,0.08790154,0.013050186,-0.001229977,0.033269998,-0.005720966,0.011509455,-0.010398408,0.031011075,0.0280401,0.036486506,-0.02463944,0.005779281,0.015223172,-0.015726518]
e650fd16-6f6c-4a5e-8048-1d6bce99d5bf	hasta 4,74 GHz)\nGráficos (GPU) \tAdreno™\nCoprocesador \tRedCore R4\nRAM / ROM \tRAM: 12 GB / 16 GB LPDDR5X Ultra\nROM: 256 GB / 512 GB UFS 4.1\n*El espacio de memoria real es menor y varía debido a muchos factores. Ficha técnica generada con fines informativos.	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 4}	[0.011845019,0.044080835,-0.08925314,0.02181716,0.04532115,-0.035721105,0.051497925,-0.000119283526,0.032669924,-0.019969089,-0.03951647,-0.00659228,-0.018939627,0.021990804,-0.021184599,0.038549025,0.047082398,0.027931917,-0.0074294936,0.035969168,-0.020676069,2.3909999e-05,-0.010772145,0.042245165,0.0058852998,-0.00033449774,0.0030635807,0.037333515,-0.02664199,-0.0019628003,0.053234365,-0.015355113,0.010505477,0.036986224,0.019745832,0.01432565,-0.024148954,0.010313229,-0.014573714,0.011783003,0.016607832,0.0029379986,0.049438998,0.062611155,-0.009172138,0.009482216,-0.039417244,0.001149618,-0.015652789,0.010902379,-0.041426558,-0.016359769,-0.021717934,-0.036366068,-0.051894825,0.02409934,0.06439721,0.028676108,-0.016707057,0.00035523428,-0.04045911,-0.013407817,0.00017897373,-0.03075984,0.013370607,0.041451365,0.07526238,-0.007423292,0.039888564,-0.029990843,0.01887761,0.027460597,0.055070035,0.07035073,-0.020874519,0.008607794,-0.023590812,0.019733429,-0.025451286,-0.017141169,-0.007900814,0.041302525,0.0019426451,0.015590773,0.00062558445,0.018468307,-0.016347365,0.052242115,0.0525894,0.030586194,0.045866888,-0.012800062,-0.017116362,-0.003147302,0.024248179,-0.02056444,0.042021908,0.048124265,0.011293078,-0.037879255,-0.0028511765,0.011987655,0.0032868376,-0.010393849,-0.044477735,0.008502367,0.071938336,-0.030065263,-0.0096496595,0.018890014,-0.00014990383,0.0016728763,0.014722552,0.019100867,0.02005591,0.03458001,-0.0033829622,-0.025290046,0.04462657,0.033364505,0.019001642,0.036316454,0.028080756,-0.046040535,0.029569136,0.05616151,0.06494295,0.027162923,0.022338092,0.010765944,-0.026468346,-0.01361867,-0.0043535093,0.006226387,-0.07263291,0.016086899,-0.039590888,0.018046599,0.023752052,0.025339657,-0.005869796,0.011138039,-0.0063504186,0.018356679,0.042220358,-0.026195476,-0.019969089,0.010052762,0.016496204,-0.0029333476,-0.0072930586,-0.032074574,0.03944205,0.0435599,-0.038871504,0.025997026,-0.021122582,0.03351334,0.020179942,0.026741214,0.012347347,-0.023007864,-0.0006949646,0.06037859,0.019981492,0.01671946,0.08052132,-0.018083809,0.051894825,0.017153572,-0.033885434,0.04762814,-0.07129337,-0.013110141,-0.085284136,-0.00081085664,-0.004567464,0.07317865,-0.031107128,0.05387933,-0.022672977,0.024855934,-0.074865475,-0.0040527326,0.03735832,0.006325612,0.051547535,-0.02765905,0.040558334,0.0018248151,-0.03068542,0.012849675,-0.032397058,0.13653399,0.037060644,-0.025773767,-0.005144211,0.03983895,-0.021965997,-0.0600313,0.036762968,-0.015330307,0.020006299,-0.0036186222,0.008229497,0.050679315,0.0022697784,0.016707057,0.05457391,0.040136628,0.05387933,0.01655822,0.054623522,0.028006338,0.04971187,-0.0015829534,0.1055757,0.06697707,0.020117927,-0.023094686,0.016806282,0.017451247,0.06077549,0.07789185,-0.03269473,-0.02845285,0.038921118,0.023714844,0.007671355,-0.02569935,-0.03358776,0.015007825,-0.032148995,-0.067076296,0.04842194,-0.033686984,0.017835746,0.008099264,0.015181469,-0.03115674,-0.034828074,-0.048025038,0.038127318,0.024893144,0.05596306,-0.008645003,-0.03916918,-0.0118698245,-0.00024883842,-0.03681258,-0.003024821,0.023566006,0.03128077,0.0694577,0.010914781,-0.011020209,-0.0125582,-0.028378433,0.031975348,0.020229556,0.015714806,0.0298172,0.037730414,-0.012117888,-0.00081008143,0.009122524,0.018319469,-0.037035838,-0.033215664,0.044477735,0.056608025,4.2484457e-06,-0.023962907,-0.015020228,0.098332256,0.025451286,0.029990843,-0.011014007,0.04986071,-0.038673054,-0.011776801,-0.024248179,-0.022660576,0.03405908,0.053234365,-0.049637448,0.05368088,0.0104744695,0.038945924,0.017587682,0.023330346,0.02346678,0.05124986,-0.041277718,0.07957868,-0.017810939,0.0029736578,0.06816777,0.045197118,-0.017786132,0.06568714,0.030139681,0.046090145,-0.01369309,0.017686907,0.017711714,0.010288422,-0.04105446,0.061767742,0.023752052,0.06191658,0.09480976,-0.020452812,0.0042232764,0.0038480808,0.029643554,-0.03795367,-0.1031943,-0.04938939,-0.056310352,0.001396906,0.06047781,0.06791971,0.014958212,0.01938614,-0.078784876,-0.011231062,0.05159715,0.02169313,-0.054325845,-0.03075984,0.041277718,0.016136512,0.0325707,0.031702477,0.009004694,-0.037780028,0.10765944,-0.058642145,0.0074418965,-0.011367497,0.008496165,0.059187885,0.02765905,-0.058394082,0.009072912,-0.033662178,0.013271382,0.054722745,0.01102641,0.016744267,-0.008086861,-0.016645042,-0.0036930412,0.047752168,-0.009376789,0.05596306,-0.008192288,0.05110102,0.014648133,0.013296189,0.04678472,0.0231567,0.023355152,-0.016037287,0.023962907,0.034902494,0.028254401,-0.023305539,-0.05596306,0.03869786,0.013469833,-0.071789496,0.026865246,-0.012372153,0.014052781,0.05779873,0.03175209,0.041153688,-0.030114874,0.04695837,0.027138116,0.040012598,-0.057153765,-0.047107205,-6.8217385e-05,0.041228108,-0.05606229,-0.036465295,0.008465157,0.042046715,0.033389308,0.026046637,-0.010096173,0.04537076,0.047752168,-0.010530284,-0.03539862,-0.037383128,-0.02892417,0.0016930314,-0.024942756,0.034331948,0.039814148,0.01911327,-0.04470099,0.022573752,-0.015900852,-0.04415525,0.009941134,-0.013308591,-0.00239381,0.05333359,-0.00419847,0.008167481,0.0023736549,-0.025091594,-0.017761325,0.028080756,0.011113232,0.0435599,-0.019510172,0.01675667,-0.03897073,0.008824849,0.013953556,0.02555051,-0.0019984592,0.028031144,0.022238867,-0.014462085,0.094164796,0.013172157,0.04556921,-0.010182995,0.033290084,-0.01982025,0.033612564,0.019745832,0.023652827,0.059981685,-0.0077271694,0.07243446,0.03324047,-0.017327216,0.01624814,-0.020750487,-0.016744267,-0.021060567,-0.0010100824,0.005782974,-0.020886922,0.005057389,-0.040012598,-0.011001604,0.0013666733,0.04093043,0.017240394,0.03485288,-0.0056868494,0.008328723,0.01860474,-0.0015573719,-0.008415544,0.015665192,0.0040868414,-0.0034759857,0.003072883,0.0015604727,0.03998779,0.03371179,0.039814148,-0.0032434266,-0.0039287014,0.020862117,0.004675992,0.063553795,-0.05124986,0.0035224976,-0.0042356793,0.012384556,0.030189294,0.022139642,-0.0075783315,-0.037135065,0.05521887,0.038797088,0.031776898,0.0525894,0.071789496,0.046065338,0.023082282,0.015094647,0.027336566,-0.0154419355,0.0020666767,-0.016781477,-0.11658971,-0.04938939,-0.035150558,0.019795444,0.010920983,-0.017277604,0.01655822,0.054722745,-0.057153765,0.0010798502,-0.024930354,-0.020316377,0.0020620255,-0.042790905,-0.04234439,0.038747475,-0.031057514,0.03837538,0.030536583,-0.002880634,-0.024967562,0.050852958,0.021246614,-0.00029690066,-0.014933405,-0.0028108663,-0.05427623,0.045668438,0.043163,0.003829476,0.0075287186,0.039541278,0.014313248,0.03951647,-0.011094627,0.004889946,0.03075984,0.061222002,0.13464871,0.04998474,0.048496358,0.042021908,-0.03505133,-0.013060529,-0.010300825,0.029668361,-0.012303935,-0.020539634,-0.03559707,0.027807886,-0.0037333514,-0.022189254,0.017538069,-0.02263577,0.042567648,-0.1039881,0.021767547,0.009091517,-0.06142045,0.02169313,0.066679396,0.02718773,-0.020266766,0.056012675,-0.033265278,0.082555436,0.005528709,0.06231348,0.0070884065,-0.010443461,0.022623366,-0.0058915014,-0.007956628,0.04546999,-0.0030790847,0.041773845,0.044750605,0.03755677,-0.04931497,0.026344314,-0.007714766,-0.0521925,0.033339698,0.033389308,0.015764417,0.084043816,0.060080912,0.06047781,-0.037333515,-0.011559746,-0.06380186,0.005172118,-0.0009907024,0.09044385,0.02664199,0.044254478,0.029966036,-0.016831089,0.030040456,-0.05953517,-0.033190858,0.014747358,0.03936763,-0.0033085432,0.029296266,0.024359807,0.028155176,0.0037519562,0.04105446,-0.02507919,-0.01573961,-0.009141129,-0.0154419355,-0.065835975,0.009736481,-0.013482236,-0.029023396,0.031206353,0.037606385,0.023987712,0.036291648,0.059981685,0.013010915,0.0028511765,0.011479125,0.062164642,0.017165974,-0.067324355,0.036167618,0.036093198,0.05058009,0.04673511,0.032074574,-0.008911671,0.08012442,-0.063156895,-0.0002191871,0.034778465,0.04462657,-0.06271038,-0.009215549,-0.03311644,-0.013680686,0.04246842,-0.028725721,0.018034196,0.021395452,-0.0011798507,0.04715682,0.05665764,0.033935048,-0.06047781,0.0038945924,0.032471474,-0.06608404,-0.0034790866,-0.011429513,-0.027138116,-0.02562493,-0.020899326,0.0061302623,0.03028852,0.0325707,-0.023094686,0.019721026,-0.018480709,-0.0018511717,0.02404973,-0.0138915405,-0.03586994,0.010406252,-0.029370684,-0.02366523,-0.00046899452,0.026617182,0.008520971,0.029321073,-0.029370684,0.04931497,0.044056028,0.017389232,0.010015553,0.032818764,-0.034083884,0.018431097,-0.06439721,0.024161357,0.048992485,0.039466858,0.02852727,-0.0045426576,0.043460675,0.055268485,-0.030462163,-0.011857422,0.07119414,-0.0025907103,0.04241881,0.017649697,-0.019237302,0.04112888,-0.026517957,-0.010449663,0.011355094,0.029916424,0.046437435,-0.007640347,0.01750086,0.009283766,-0.018356679,-0.008148877,0.0023364455,0.015231081,-0.10106096,-0.015032631,0.0056558414,0.033959854,-0.014536505,0.020303974,-0.0040124226,0.041897878,0.06871351,-0.014610924,0.037333515,-0.030586194,-0.074865475,-0.00095504336,0.05760028,-0.029519523,-0.017376829,-0.0353242,0.0019286915,0.08771516,0.011491529,0.02770866,0.004409324,0.056409575,-0.07402206,0.025252836,-0.0009891521,0.009891521,-0.013246575,-0.0051256064,0.007851201,-0.013209366,-0.0056093293,-0.0004953512,-0.01443728,0.0058170822,-0.00039961434,-0.0164838,-0.00065581716,-0.057897955,0.02299546,-0.044006415,0.045668438,-0.017761325,0.037581578,-0.0031348988,-0.00478762,0.043038968,0.0031348988,0.03795367,0.049910318,0.050753735,0.02765905,0.033835825,-0.041922685,0.010251213,0.03324047,-0.023057476]
23bf0fa6-e92d-460b-8f2a-16ee4c034de6	-- 2 of 2 --	{"source": "Ficha_Tecnica_REDMAGIC_11S_Pro (1).pdf", "product": "red-magic", "chunkIndex": 5}	[-0.063864894,0.010603707,-0.073473744,0.015480928,0.021037562,-0.03586334,0.08293701,-0.007388625,0.014207027,0.058914877,0.013102979,0.023136465,0.022493448,0.037319228,0.022578375,-0.0018016597,0.014570999,-0.08381054,0.0017849776,0.021413665,-0.01523828,0.015056294,-0.033533923,0.011713821,0.023488304,-0.019848587,-0.012787538,0.029481705,-0.036348637,0.027807435,0.028025817,0.058866348,0.009614918,0.050713383,-0.0027222047,0.042633213,0.0100880815,0.0018319907,-0.026448607,0.004461686,0.0010843322,0.020807046,0.044525865,0.020030573,-0.033242743,0.031762592,-0.021498593,0.046054546,0.019241968,0.036397167,-0.02778317,0.020321751,0.020831311,0.00029932876,-0.0033455063,-0.0155658545,0.05765311,-0.013503348,-0.05881782,0.037197903,-0.03285451,0.0073704263,0.014655925,-0.031058915,0.015978355,0.039090555,0.02889935,-0.033024363,0.028729497,0.05313986,0.044113364,0.03001553,0.027467728,0.06857226,-0.028729497,-0.006775939,-0.021510726,0.042390566,-0.062409006,-0.027928758,-0.039478794,-0.004252402,-0.002358233,-0.0024643915,-0.017349316,0.02717655,0.013466951,0.02402213,0.039236143,0.026521401,0.049985442,-0.023294186,-0.008789916,0.012775405,0.031762592,-0.00032112916,-0.0058538774,0.037561875,-0.008310686,-0.0543531,-0.015129088,0.011343784,-0.010549112,-0.0025174706,0.015201883,0.023597496,0.04069203,-0.032053772,0.035159662,-0.038119964,0.03266039,-0.0155658545,0.053770747,-0.014898573,0.052848686,0.044380277,0.030937592,-0.020612929,0.044113364,0.039381735,0.02656993,0.025380958,0.029797146,0.02037028,0.07725905,0.04831117,0.004998544,0.039478794,0.025987577,0.011792682,-0.009912161,-0.050567795,-0.06328254,0.009220615,-0.071338445,-0.019363292,0.0012594936,0.0044495533,0.03688246,0.051392797,0.004831724,-0.03149568,-0.026011841,0.04074056,0.025259633,-0.036736872,0.0020427909,0.03540231,0.055129573,0.031204503,0.012047462,-0.0076312725,0.023027273,0.024592351,-0.07434728,0.05216927,-0.012083859,0.03321848,-0.014850044,0.039017763,0.073036976,-0.05775017,0.010330729,0.029748617,0.042487625,0.019521013,0.048893526,-0.0137945255,-0.038969234,0.025841989,0.007346161,0.025793457,-0.0065090265,-0.06003106,-0.09516646,0.04413763,0.03625158,0.020794913,-0.03006406,0.05124721,0.013212171,0.032927305,-0.079054646,0.05226633,0.03285451,-0.00013260322,0.0048135254,-0.0697855,0.037755992,0.01305445,0.0051380666,0.013175774,-0.014304087,0.10996797,0.09172086,-0.061584003,-0.0052654566,0.033606716,-0.06561196,0.014595264,0.033242743,0.008334951,0.038556732,-0.051586915,-0.0041037803,0.022541977,0.058381055,-0.009918228,0.034140542,0.01219305,-0.013503348,0.014122101,0.040473647,0.033121422,0.009220615,0.03215083,0.16237989,0.009863632,0.023464039,-0.07434728,0.020540133,0.045132484,0.0697855,0.046855286,0.0139037175,0.0070185866,-0.012399301,0.03656702,0.07590023,-0.0005922122,-0.010846355,0.00526849,-0.06925167,-0.021947492,0.04353101,-0.009378336,0.048529554,0.030719208,0.01503203,-0.050858974,0.0063209743,-0.014898573,0.03377657,-0.009032563,-0.00603283,-0.006581821,0.00792245,-0.04952441,0.044501603,-0.04804426,0.009991022,0.02178977,0.051829565,-0.005741653,0.07638552,0.0063755703,-0.04799573,0.009809036,0.024944192,0.054110453,0.051538385,-0.007394691,-0.0051350333,-0.023706688,0.016111812,0.017300786,-0.05454722,-0.02392507,-0.045472194,-0.024046395,0.017907405,0.004034019,-0.021522857,-0.0065150927,0.03615452,0.050664853,-0.019800058,-0.00043562858,0.044258952,-0.027953023,0.009250946,-0.01203533,0.048966322,0.023379114,0.047025137,0.018222848,0.037513345,0.0116410265,0.031204503,0.027564786,0.019375425,-0.0007211188,0.055954576,-0.039600115,0.021716977,0.033194214,0.045399398,0.04117733,-0.011240658,0.01528681,-0.009056828,0.05901194,0.06857226,0.0068608657,0.044258952,0.07866641,-0.024944192,0.03241774,-0.03438319,-0.034116276,0.018356305,-0.0135397455,0.032272153,-0.0073582935,0.008383481,0.01965447,-0.030403767,-0.025405223,-0.062263418,0.054789867,-0.009881831,0.027516257,0.041541297,0.0048559885,0.03443172,-0.02143793,0.01721586,0.0064786957,0.03266039,0.0062481803,-0.057313405,0.0031331894,-0.052072212,0.03164127,-0.0060419296,-0.04469572,-0.027103756,0.06260312,-0.04826264,-0.0037367756,-0.016463652,0.009766573,-0.0007256685,0.023949334,0.0005850086,0.025065515,-0.0100880815,-0.004752863,0.017434243,0.039139085,0.00906896,0.051635444,0.015311074,0.019897118,0.011550034,-0.065563425,0.05469281,-0.036300108,-0.015456663,0.038168494,0.014012909,0.08269436,-0.03428613,-0.00539588,-0.013297098,0.01635446,0.016827622,-0.044525865,0.033291273,-0.015626516,-0.01048845,0.028705232,-8.241494e-05,-0.004434388,-0.049888384,0.04469572,0.04302145,-0.008662526,0.002186863,-0.059545763,0.0056597595,0.03916335,0.05973988,-0.083228186,-0.017858876,-0.021292342,0.014813647,-0.019011453,0.01094948,-0.038047172,0.030816266,0.022893818,-0.0010486933,0.013527613,0.08021935,0.061778124,-0.019630205,-0.0021140687,0.017106667,-0.0058569107,-0.0075402795,-0.03224789,0.036955256,-0.017434243,0.082063474,-0.03219936,0.015044162,-0.024604484,-0.05668252,0.010737164,0.03438319,0.02387654,0.028001552,-0.028511113,0.013042318,0.049354557,-0.028826555,-0.03782879,0.034140542,0.028778026,0.012029263,-0.046394255,0.07827817,-0.015274677,-0.011798748,0.05983694,0.08914879,0.055808987,0.04311851,0.019994177,-0.03270892,0.080267884,0.026400078,0.0044495533,-0.002059473,0.015444531,0.018198583,0.039697174,0.033970688,0.009111424,0.022335727,0.005150199,0.019181306,0.058283996,0.038459674,-0.00050993945,-0.022457052,0.0040067215,-0.007206639,0.038386878,0.03627584,-0.07196933,0.02189896,-0.04270601,0.08754732,0.016075416,0.043191303,0.056100164,0.030500825,0.012405368,-0.021595651,0.028074346,0.018829467,0.06439872,0.055372223,0.016087547,0.016233137,0.017082402,0.048893526,0.030428031,0.019994177,0.02118315,0.038775112,0.038047172,0.057847228,0.0432641,0.028972143,-0.021365136,-0.059497233,-0.036033195,-0.02092837,0.021401534,-0.010348927,0.012848199,0.070222266,0.03591187,0.0052169273,0.05775017,0.077550225,0.0471222,0.0103428615,-0.027370669,0.020831311,0.020079102,-0.020904105,0.0006449123,-0.025744928,-0.1274386,0.001871421,-0.0138673205,-0.03183539,0.012726876,-0.04333689,-0.010403523,-0.016026886,-0.05983694,-0.0037034117,-0.01130132,0.0029845675,0.0019184339,0.0067698727,-0.004485951,0.022942347,-0.003043713,-0.00017364482,0.02341551,-0.016827622,-0.05998253,0.018319907,0.100747354,0.025502281,-0.031131709,0.001988195,-0.030743472,-0.009627051,-0.044889838,0.0057689506,0.07633699,0.013527613,0.025939047,-0.023488304,-0.015941959,0.021171018,0.044574395,0.037489083,0.12025624,0.00565066,0.04139571,0.05449869,-0.03392216,-0.047049403,-0.01828351,-0.030719208,-0.012557022,-0.025502281,0.01696108,0.053964864,0.04459866,-0.025235368,-0.06362224,0.005771984,-0.0009614918,-0.05760458,0.027564786,-0.002465908,-0.014728719,0.03234495,0.0380957,0.03836261,-0.002596331,0.007267301,0.0010714416,0.03875085,0.04768029,0.014037173,0.03215083,0.041541297,0.02443463,-0.010494516,-0.031058915,-0.00911749,0.063767835,0.03001553,0.050761916,0.006405901,-0.045229543,0.03642143,0.031253032,0.015857032,0.054838397,0.058429584,0.0376832,0.022105211,0.04789867,-0.014376881,0.0016166408,-0.046078812,-0.038168494,0.022214403,-0.019460352,-0.009542123,0.015820635,0.006278511,0.009408668,-0.047316317,0.07395904,-0.027419198,0.015080559,-0.0026964233,0.017822478,0.002734337,-0.005495972,0.0010706832,-0.021996021,-0.014789382,0.041565564,-0.0500825,-0.043506745,-0.014231292,-0.027297875,-0.02656993,0.028656702,0.0048893527,0.008583665,0.011901873,0.014000776,0.018065127,-0.02564787,0.019969912,-0.00021212723,0.02306367,0.017312918,0.025478017,0.03884791,-0.04362807,-0.023221392,0.043239832,-0.011392313,-0.0039308937,0.034917016,0.0006157187,0.014461807,-0.016500048,0.03773173,0.03642143,0.020661458,-0.017082402,0.01381879,-0.015347471,-0.032903038,-0.024677278,-0.0058933077,0.05362516,0.06279724,0.0359604,0.024665145,0.04530234,0.011246724,-0.01609968,-0.021983888,0.03377657,-0.0261089,-0.00015857411,-0.049936913,0.08148112,-0.03875085,-0.024410365,0.061923712,0.00881418,0.0048256577,0.014765117,-0.056148693,0.024968456,0.026739785,0.019800058,0.00018255453,-0.008929438,-0.003654882,-0.021814035,-0.026861109,-0.01142871,0.012666213,0.035475105,0.031568475,0.00957852,0.054935455,-6.497463e-05,0.031762592,0.07250316,-0.0053716153,-0.0060479958,0.0018350238,-0.016706299,0.035790548,0.014109968,0.0059570028,0.013491216,0.0100880815,0.046564106,0.028656702,-0.00552327,0.010840289,0.014813647,-0.01761623,-0.039575852,0.064010486,0.0020882874,0.007170242,0.028947879,0.027346404,-0.044768512,0.0120595945,0.06648549,0.04724352,-0.028705232,-0.066679604,0.031107444,0.0050956034,-0.01305445,0.042439096,-0.019205572,-0.026448607,0.027564786,0.023003008,0.018926525,0.016123945,-0.050325148,0.038580995,0.09099291,-0.07119285,0.0239736,0.006533291,0.014595264,-0.0016666868,0.014607396,0.005559667,-0.025963312,-0.013515481,0.02489566,0.03930894,0.046345726,-0.04469572,-0.017992333,0.06323401,-0.08924585,0.024264777,0.032539066,0.0064726295,-0.030088324,-0.0706105,-0.0077647287,0.00013601546,-0.04525381,0.014655925,0.015869165,0.035499368,-0.015396001,-0.057895757,-0.02143793,-0.019035717,0.02143793,-0.058429584,0.027200816,0.011519703,0.03697952,-0.024495292,0.01787101,0.045035426,-0.003497161,-0.09613705,0.011010143,0.059545763,0.012690479,0.059545763,-0.01833204,-0.01565078,-0.029772881,-0.0036154517]
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, nombre, descripcion, "precioBase", "unidadMedida", observaciones, status, "imagenPortada", "createdById", "createdAt") FROM stdin;
5c622f65-efcf-4e9a-9a70-3077a0b0313e	Red Magic	Telefono gaming	3000.00	Pieza	no incluye envío	t	/uploads/products/5c622f65-efcf-4e9a-9a70-3077a0b0313e/cover/1785534257162-100-100.png	6b2c8a3d-3fb1-4327-8c1c-25724b82e947	2026-07-31 21:44:17.058152
\.


--
-- Data for Name: reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reminders (id, title, date, notified, activity_id) FROM stdin;
\.


--
-- Data for Name: tblbusinesslines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tblbusinesslines (id, strname, blnstatus) FROM stdin;
a8b6d804-94c9-4a0b-bc77-cfc8152e93db	Datos	t
b2f0a149-14a0-410a-8bf8-28564f7b60cc	Desarrollo	t
c5d72bc1-12c8-47bc-8a7e-128a192bfa77	RH	t
\.


--
-- Data for Name: tbldeliverytypes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tbldeliverytypes (id, strname, blnstatus) FROM stdin;
d29ab9f7-7b89-4089-a299-cf9b0cb617cf	Proyecto	t
e20c3a2a-43d9-482a-88cb-b09b0b4b2efc	Licencia	t
f22db2a2-4a08-410a-ba8c-b01b0b5b2efc	Asignacion	t
012db2a2-4a08-410a-ba8c-b01b0b5b2efc	Bolsa de Horas	t
\.


--
-- Data for Name: tblicensings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tblicensings (id, strname, blnstatus) FROM stdin;
112db2a2-4a08-410a-ba8c-b01b0b5b2efc	No Aplica	t
212db2a2-4a08-410a-ba8c-b01b0b5b2efc	Microsoft	t
312db2a2-4a08-410a-ba8c-b01b0b5b2efc	IBM	t
412db2a2-4a08-410a-ba8c-b01b0b5b2efc	Qlik	t
512db2a2-4a08-410a-ba8c-b01b0b5b2efc	Alteryx	t
612db2a2-4a08-410a-ba8c-b01b0b5b2efc	KNIME	t
\.


--
-- Data for Name: tbloportunitylabels; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tbloportunitylabels (id, strname, field_key, blnstatus, dtmlastmodified, uuidlastmodifiedby) FROM stdin;
f509fa84-0b73-45f8-b3ab-b8471e98822e	Línea de Negocio	linea_negocio	t	\N	\N
7d90d810-74d3-4613-882d-8e814a029db5	Tipo de Entrega	tipo_entrega	t	\N	\N
c6d3df39-53e7-40b9-8e2b-f1de16b5394f	Licenciamiento	licenciamiento	t	\N	\N
\.


--
-- Data for Name: tblpipelinescatalog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tblpipelinescatalog (id, strname, strdescription, blnstatus, dtmcreated, dtmlastmodified, intlastmodifiedby) FROM stdin;
c2dd7eeb-3793-478d-8b83-af6f6ccb814b	Pipeline Comercial Principal	Pipeline por defecto para gestionar oportunidades comerciales.	t	2026-07-31 20:30:37.675+00	2026-07-31 20:30:37.675+00	1
\.


--
-- Data for Name: tblstagescatalog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tblstagescatalog (id, strname, blnstatus, bln_show_dashboard, pipeline_id, display_order, strcolor, blninitial, intmaxdays, dtmcreated, dtmlastmodified) FROM stdin;
d92e92b6-9551-430c-8876-935fd80b5d9c	Prospecto	t	t	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	1	#3498db	t	\N	2026-07-31 20:30:37.684+00	2026-07-31 20:30:37.684+00
2d7e4b7e-dcdb-402d-afe7-eac0d75dc491	Calificado	t	t	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	2	#f1c40f	f	\N	2026-07-31 20:30:37.686+00	2026-07-31 20:30:37.686+00
baf5448d-7c36-4c7c-bb4e-768f08b6a91a	Propuesta	t	t	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	3	#9b59b6	f	\N	2026-07-31 20:30:37.687+00	2026-07-31 20:30:37.687+00
c3309d05-cd20-4087-b2ac-4cb10f24b58d	Negociación	t	t	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	4	#e67e22	f	\N	2026-07-31 20:30:37.693+00	2026-07-31 20:30:37.693+00
6ac54295-e97e-4cfd-80bd-155daa3d40ca	Cierre Exitoso	t	t	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	5	#2ecc71	f	\N	2026-07-31 20:30:37.695+00	2026-07-31 20:30:37.695+00
e3dc2659-6cea-4d8e-b3bd-966802158565	Cierre Perdido	t	f	c2dd7eeb-3793-478d-8b83-af6f6ccb814b	6	#e74c3c	f	\N	2026-07-31 20:30:37.696+00	2026-07-31 20:30:37.696+00
\.


--
-- Data for Name: tbltypeactivities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tbltypeactivities (id, strname, blnstatus) FROM stdin;
\.


--
-- Data for Name: tenant_renewal_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenant_renewal_queue (id, tenant_id, plan_id, billing_period_months, created_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, schema_name, plan_id, next_renewal_date, is_active, allow_extra, logo, created_at) FROM stdin;
1	TIBS	tenant_tibs	1	2026-08-31 21:42:11.837+00	t	f	\N	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: ticket_interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_interactions (id, comment, created_at, ticket_id) FROM stdin;
b7f71fcf-90fe-472c-ac0c-ad26ef84e346	El usuario Jonathan Amador creó el ticket #1.	2026-08-01 02:38:17.540429	fec41d0d-8357-479e-be2a-0771f08771da
53e56cc0-f04c-4828-81cf-d4a88e1fc046	El usuario Jonathan Amador modificó el ticket:\n- Etapa: "Nuevo" -> "En Espera"	2026-08-01 02:38:23.993647	fec41d0d-8357-479e-be2a-0771f08771da
\.


--
-- Data for Name: ticket_stages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_stages (id, strname, blnstatus, bln_show_dashboard, helpdesk_id, display_order, strcolor, blninitial, intmaxdays, dtmcreated, dtmlastmodified) FROM stdin;
bf7f9a0c-184c-4edc-907e-512b70f9c377	Nuevo	t	t	529b5e1c-4f9e-487a-aee1-62b940b6f33a	1	#e74c3c	t	\N	2026-07-31 20:30:40.954+00	2026-07-31 20:30:40.954+00
d3f05dea-25c9-4d1c-b4db-f5adc4448e75	En Proceso	t	t	529b5e1c-4f9e-487a-aee1-62b940b6f33a	2	#f1c40f	f	\N	2026-07-31 20:30:40.956+00	2026-07-31 20:30:40.956+00
11c7f676-a2ee-42f5-8856-cbfaab4ffdc7	En Espera	t	t	529b5e1c-4f9e-487a-aee1-62b940b6f33a	3	#3498db	f	\N	2026-07-31 20:30:40.957+00	2026-07-31 20:30:40.957+00
ce25567f-ad52-4bcf-bd12-290bfab032b2	Resuelto	t	t	529b5e1c-4f9e-487a-aee1-62b940b6f33a	4	#2ecc71	f	\N	2026-07-31 20:30:40.964+00	2026-07-31 20:30:40.964+00
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, ticket_number, strtitle, tipo_incidencia, description, fecha_apertura, fecha_cierre, notas_resolucion, priority, alert_sent, archived, cliente_id, responsable_id, helpdesk_id, stage_id, stage_entered_at, "contactName", "contactEmail", "contactPhone") FROM stdin;
fec41d0d-8357-479e-be2a-0771f08771da	1	Prueba	Soporte Técnico	ssa	2026-08-01 02:38:17.505	\N	\N	0	f	f	\N	6b2c8a3d-3fb1-4327-8c1c-25724b82e947	529b5e1c-4f9e-487a-aee1-62b940b6f33a	11c7f676-a2ee-42f5-8856-cbfaab4ffdc7	2026-08-01 02:38:23.976	\N	\N	\N
\.


--
-- Data for Name: transaction_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transaction_history (id, prompt_tokens, completion_tokens, total_tokens, fecha_procesamiento, is_extra, action_name) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, email, password, role, "isActive", "profileImageUrl", reset_password_token, reset_password_expires) FROM stdin;
6b2c8a3d-3fb1-4327-8c1c-25724b82e947	Jonathan Amador	jonathan.amador@tibs.com.mx	$2b$10$mDHzMHVSVyL71ykbMRTX6OCMUzpR6VTZCI27z6VhGHRnbPoWN5N3K	superadmin	t	\N	\N	\N
\.


--
-- Data for Name: activities; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.activities (id, date, activity, "typeActivityId", "opportunityId", "clientId", "companyId", flaghistory, "userId", created_at) FROM stdin;
\.


--
-- Data for Name: activity_contacts; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.activity_contacts ("activitiesId", "clientsId") FROM stdin;
\.


--
-- Data for Name: ai_agent_configs; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.ai_agent_configs (id, "isActive", context, "defaultReplies", temperature, "modelProvider", "modelName", "openaiApiKey", "openaiEndpoint", "openaiApiVersion", "openaiEmbeddingModel", "geminiApiKey", "watsonxApiKey", "watsonxProjectId", "watsonxRegion", "watsonxEmbeddingModel", "reminderOffsetMinutes", "maxNewTokens", "historyMessageLimit", "defaultUserId") FROM stdin;
f130fbc5-6ce1-4e5d-951c-99d5334d37d1	t	# Prompt del Agente Principal (Enrutador) — Asistente del CRM\n\nEres el Agente Principal (Enrutador) del ecosistema de IA del CRM. Tu única tarea es clasificar el último mensaje del cliente en el contexto de la conversación histórica para redirigir el chat al sub-agente especializado correcto.\n\n## Sub-Agentes Disponibles en el Ecosistema:\n*   **comercial:** Úsalo cuando el cliente pregunte precios, cotizaciones, información detallada de productos del catálogo, o demuestre intención de contratar o comprar un servicio o desarrollo a la medida.\n*   **seguimiento:** Úsalo cuando el cliente solicite agendar demostraciones, llamadas, citas, reuniones, o confirme días y horarios de disponibilidad para un seguimiento comercial.\n*   **soporte_atencion:** Úsalo cuando el cliente tenga quejas, problemas con facturación, reportes de errores en el sistema, caídas del servicio o requiera soporte técnico sobre herramientas ya contratadas.\n*   **general:** Úsalo cuando el cliente salude, se despida, agradezca, platique de forma informal (small talk), haga preguntas directas sobre la empresa (sitio web, ubicación) o si el mensaje no encaja en las intenciones de los otros sub-agentes.\n\n## Reglas Críticas de Enrutamiento:\n1. **Historial de Conversación:** Si el cliente venía hablando de un producto (intención comercial) pero en su último mensaje dice "Agenda la cita para mañana a las 3", debes clasificarlo en "seguimiento" porque su intención inmediata ha transicionado a agendar.\n2. **Reportes y Quejas:** Si el cliente dice "No sirve el sistema" o "Tengo problemas para entrar", redirígelo de inmediato a "soporte_atencion".\n3. **Plática / Saludo:** Saludos simples como "Hola" o despedidas como "Gracias" deben ir a "general".\n\n## Formato Obligatorio de Salida:\nDebes responder ÚNICAMENTE con un objeto JSON válido y limpio. Sin markdown ni explicaciones.\nEstructura del JSON:\n{\n  "thought": "Análisis de la intención y por qué se selecciona esta ruta.",\n  "route": "key_del_subagente"\n}	\N	0.70	gemini	gemini-1.5-flash	\N	\N	\N	text-embedding-ada-002	\N	\N	\N	\N	ibm/slate-125m-english-rtrvr	60	2048	10	\N
\.


--
-- Data for Name: ai_sub_agents; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.ai_sub_agents (id, key, name, description, context, tools, temperature, "isActive", "createdAt", "updatedAt") FROM stdin;
8503e839-accf-49c3-bfb1-903c6ca0c861	comercial	Sub-Agente Comercial	Se encarga de calificar prospectos, cotizaciones y gestionar oportunidades comerciales de venta en el CRM.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES COMERCIALES]\n- Registra oportunidades en el CRM.\n- REGLA MANDATORIA Y OBLIGATORIA DE BÚSQUEDA EN RAG/CATÁLOGO: Para CUALQUIER pregunta del cliente sobre productos, especificaciones técnicas (RAM, memoria, procesador, modelo, almacenamiento, pantalla, etc.), catálogo, precios o compatibilidad, DEBES llamar OBLIGATORIAMENTE a la herramienta consult_product_catalog ANTES de responder al usuario. Está estrictamente PROHIBIDO responder directamente con final_answer o confiar en la memoria previa del chat para dar especificaciones sin haber llamado PRIMERO a consult_product_catalog en ese turno.\n- PROHIBIDO INVENTAR PRODUCTOS O MARCAS: Está estrictamente PROHIBIDO inventar, asumir o listar nombres de productos, marcas o precios de tu propio conocimiento. Si el cliente pregunta qué productos ofrecemos, qué catálogo tenemos, o si disponemos de algún producto específico, debes llamar obligatoriamente a la herramienta consult_product_catalog para consultar la base de datos real.\n- REGLA CRÍTICA OBLIGATORIA DE PRECIOS, UNIDADES DE MEDIDA Y OBSERVACIONES: Todos los productos tienen un precio base y una unidad de medida asignada (ej. pieza, servicio, licencia, hora). Muestra siempre el precio base indicando su unidad de medida. Si el producto devuelto por consult_product_catalog o RAG contiene observaciones o notas de precio (ej. 'no incluye IVA', 'no incluye instalación', 'precio refleja configuración básica'), DEBES comunicar de forma explícita y completa dichas observaciones o condicionantes al cliente en tu respuesta al entregar el precio o la cotización. NUNCA omitas las observaciones o notas del producto.\n- VARIANTES DE PRODUCTO: Las variantes (como colores o modelos) se manejan como productos independientes dentro del catálogo.\n- REGLA CRÍTICA DE INVENTARIO: No manejan stock. Si el producto existe en Cube.dev/RAG, está disponible para cotización. NUNCA respondas que no hay stock en almacén.\n- Si el producto tiene manuales PDF en RAG, resume especificaciones clave.\n- Si solicita cotizar o comprar, crea una Oportunidad Comercial con createOpportunity.\n- Para detalles de compatibilidad, especificaciones o disponibilidad del catálogo, llama a consult_product_catalog.\n- COTIZACIONES MULTI-PRODUCTO (AGREGAR O MODIFICAR): Si el cliente solicita agregar un nuevo producto o piezas adicionales a una cotización u oportunidad existente, DEBES llamar a modifyOpportunity pasando el id de la oportunidad activa, el nombreProducto nuevo y la cantidad solicitada. El sistema mantendrá automáticamente los productos anteriores y agregará el nuevo producto, recalculando el monto total y generando la lista completa en el PDF.	["registerContact", "updateContact", "createOpportunity", "modifyOpportunity", "consult_product_catalog", "sendQuotationPdf"]	0.20	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
f76a453d-0be3-479a-9612-d759676c3367	seguimiento	Sub-Agente de Seguimiento	Se encarga de agendar citas, llamadas, demostraciones, consultar disponibilidad de ejecutivos especializados y crear recordatorios.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES DE SEGUIMIENTO Y AGENDAMIENTO]\n- Tu objetivo es agendar llamadas, demostraciones o reuniones con un ejecutivo especializado.\n- REGLA CRÍTICA MANDATORIA DE DISPONIBILIDAD DEL CLIENTE: Está ESTRICTAMENTE PROHIBIDO inventar, asertar o adivinar una fecha u hora por tu cuenta para agendar sin habérsela preguntado primero al cliente.\n- PREGUNTAR DISPONIBILIDAD PRIMERO: Si el cliente solicita o muestra interés en agendar una llamada, cita o reunión pero NO ha proporcionado explícitamente su fecha (día) y hora de preferencia, DEBES responder inmediatamente usando la herramienta 'final_answer' preguntándole amablemente cuál es su día y horario de preferencia para coordinar la llamada. Está ESTRICTAMENTE PROHIBIDO llamar a 'checkAvailability' o 'createActivity' si el cliente aún no te ha indicado qué día y hora prefiere.\n- VALIDACIÓN DE DISPONIBILIDAD: SOLO cuando el cliente te proporcione explícitamente el día y hora en que desea la cita, llamarás a 'checkAvailability' pasando la fecha indicada por el cliente.\n- Si 'checkAvailability' responde AVAILABLE para esa fecha/hora, procedes a agendar la actividad con 'createActivity' y añades recordatorios de forma proactiva.\n- Si 'checkAvailability' responde UNAVAILABLE, le ofreces los horarios alternativos de 'suggestedSlots' al cliente y le preguntas cuál prefiere.\n- Vincula siempre la actividad con el cliente. No inventes UUIDs del sistema.	["registerContact", "updateContact", "checkAvailability", "createActivity"]	0.50	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
466cb4de-c3b1-4aed-abb8-fd58d5d77475	soporte_atencion	Sub-Agente de Soporte	Atiende incidencias de soporte, quejas, dudas técnicas. Si detecta un cliente molesto, problemático o sin solución tras varios intentos, lo redirecciona con un ejecutivo especializado (humano).	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES DE SOPORTE Y HELPDESK]\n- Tu objetivo principal es atender incidencias, dudas técnicas, reportes de problemas y quejas del cliente, intentando resolver y aclarar cualquier problemática que tenga.\n- Genera un ticket en el CRM con la herramienta createTicket cuando corresponda registrar la falla (campos: title, description, priority: 1=Bajo, 2=Medio, 3=Alto, category).\n- REGLAS OBLIGATORIAS DE REDIRECCIÓN A HUMANO (EJECUTIVO ESPECIALIZADO):\n  Debes llamar OBLIGATORIAMENTE a la herramienta 'requestHumanHandoff' para transferir la conversación a un ejecutivo especializado en los siguientes escenarios específicos:\n  1. Si se detecta un cliente molesto, problemático, irritado o agresivo.\n  2. Si la conversación, después de varios intentos, no llega a ninguna solución o entendimiento.\n  3. Si el cliente está haciendo preguntas o solicitudes completamente ajenas a lo establecido para el soporte o la empresa.\n  4. Si el cliente solicita explícitamente ser atendido por una persona real, un humano o un ejecutivo.\n  NUNCA respondas sólo con final_answer diciendo que lo conectarás o derivarás sin haber llamado PRIMERO a la herramienta 'requestHumanHandoff'.\n- En cualquier otro escenario, tú debes resolver directamente la duda o problemática del cliente sin derivar ni desactivarte.	["registerContact", "updateContact", "createTicket", "requestHumanHandoff"]	0.50	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
e08f3b08-dd73-496f-abb2-cb8d0912eea5	general	Sub-Agente Conversacional	Responde saludos, despedidas, preguntas generales sobre la empresa y pláticas informales sin uso de herramientas.	Eres el asistente conversacional de la empresa del CRM.\nTono y estilo: Profesional, resolutivo y breve (mensajes cortos adaptados a chat). Nunca hables con lenguaje técnico de base de datos ni reveles IDs.\nIdioma: Responde siempre en el mismo idioma en que escribe el cliente (español o inglés).\nREGLA CRÍTICA DE CONFIDENCIALIDAD E IDENTIDAD: Está estrictamente PROHIBIDO decir que eres una IA, un bot, un modelo automatizado o una inteligencia artificial. Está estrictamente PROHIBIDO usar el término 'asesor humano' o hacer cualquier alusión a que el cliente está hablando con una IA. Si el cliente solicita hablar con alguien más, o expresa molestia, quejas, urgencia o derivación, refiérete SIEMPRE a un 'ejecutivo especializado'.\nANCLAJE ESTRICTO DE CONOCIMIENTO (CUBE.DEV Y RAG): Está estrictamente prohibido inventar o alucinar información de productos, características, compatibilidades, precios o disponibilidad. Limítate única y exclusivamente a los datos reales provistos por Cube.dev o el RAG. Si no aparecen allí, responde amigablemente que no dispones de ese producto en el catálogo.\nSOLICITUD OBLIGATORIA DE TELÉFONO PARA IDENTIFICACIÓN: El número de teléfono es el identificador principal obligatorio del cliente en el CRM. Si la información del cliente provista no cuenta con un número de teléfono registrado (o si no se ha recibido el teléfono), DEBES solicitar forzosamente al cliente su número telefónico ANTES de continuar con cualquier proceso (cotizaciones, catálogo, agendamiento de demos o soporte). En cuanto el cliente te proporcione su número telefónico, debes llamar de inmediato a la herramienta updateContact o registerContact enviando el teléfono para identificarlo o registrarlo en el CRM.\nNO AUTOCOMPLETAR/SIMULAR HERRAMIENTAS: Tu respuesta debe finalizar inmediatamente al cerrar el JSON de tu turno (la llave de cierre }). Está estrictamente PROHIBIDO que simules la ejecución de la herramienta, que escribas '[Herramienta] ...' o que inventes el resultado del sistema.\nRedirección: Si derivas o transfieres la conversación con un ejecutivo especializado por molestia, quejas o solicitud directa, DEBES llamar obligatoriamente a la herramienta 'requestHumanHandoff'. Está PROHIBIDO derivar sólo con texto sin usar 'requestHumanHandoff'.\n\n[INSTRUCCIONES CONVERSACIONALES GENERALES]\n- Responde amablemente a saludos, despedidas o preguntas de plática informal.\n- No intentes llamar a ninguna herramienta si el cliente solo te saluda.	[]	0.70	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: channel_configs; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.channel_configs (id, channel, name, "appId", "accountId", "phoneNumberId", "accessToken", "verifyToken", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.clients (id, nombre, apellido, correo, empresa, puesto, telefono, category, estatus, ejecutivo_id, "companyId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.companies (id, nombre, correo, telefono, website, direccion, estatus, ejecutivo_id, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.conversations (id, channel, "externalId", "clientName", "clientId", client_id, "assignedUserId", assigned_user_id, "botActive", "channelConfigId", summary, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: dashboard_indicators; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.dashboard_indicators (id, title, type, pipeline_id, helpdesk_id, stage_ids, color, display_order, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.expenses (id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt") FROM stdin;
\.


--
-- Data for Name: helpdesk_cron_config; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.helpdesk_cron_config (id, helpdesk_id, cron_mode, cron_time, cron_interval_hours, cron_interval_minutes, blnstatus, dtmcreated, dtmlastmodified) FROM stdin;
3497ba80-22e7-4c63-afeb-c6b8526fcb72	c7e3c217-c04a-41c5-9040-2048eb08a3a5	fixed	09:00	\N	\N	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: helpdesks; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.helpdesks (id, strname, strdescription, blnstatus, dtmcreated, dtmlastmodified) FROM stdin;
c7e3c217-c04a-41c5-9040-2048eb08a3a5	Mesa de Ayuda Principal	Canal principal para soporte técnico y atención a clientes.	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: interactions; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.interactions (id, comment, created_at, opportunity_id) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.messages (id, "conversationId", conversation_id, sender, "senderUserId", content, "createdAt") FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.notifications (id, user_id, title, message, type, related_id, read, created_at) FROM stdin;
\.


--
-- Data for Name: opportunities; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.opportunities (id, nombre_proyecto, description, cliente_id, empresa, "companyId", ejecutivo_id, pipeline_id, stage_id, monto_licenciamiento, monto_servicios, monto_total, moneda, linea_negocio_id, tipo_entrega_id, licenciamiento_id, proposal_document_path, archived, "tipoCambio", estimated_closure_date, "createdAt", stage_entered_at, priority) FROM stdin;
\.


--
-- Data for Name: opportunity_contacts; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.opportunity_contacts ("opportunitiesId", "clientsId") FROM stdin;
\.


--
-- Data for Name: opportunity_files; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.opportunity_files (id, "fileName", "filePath", title, date, "opportunityId", "uploadedAt") FROM stdin;
\.


--
-- Data for Name: opportunity_products; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.opportunity_products (id, "opportunityId", "productId", cantidad) FROM stdin;
\.


--
-- Data for Name: opportunity_trackings; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.opportunity_trackings (id, opportunity_id, stage_id, "changedAt", changed_by_id) FROM stdin;
\.


--
-- Data for Name: product_files; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.product_files (id, "fileName", "filePath", title, "productId", "uploadedAt") FROM stdin;
\.


--
-- Data for Name: product_knowledge_base; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.product_knowledge_base (id, content, metadata, embedding) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.products (id, nombre, descripcion, "precioBase", "unidadMedida", observaciones, status, "imagenPortada", "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: reminders; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.reminders (id, title, date, notified, activity_id) FROM stdin;
\.


--
-- Data for Name: tblbusinesslines; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tblbusinesslines (id, strname, blnstatus) FROM stdin;
a8b6d804-94c9-4a0b-bc77-cfc8152e93db	Datos	t
b2f0a149-14a0-410a-8bf8-28564f7b60cc	Desarrollo	t
c5d72bc1-12c8-47bc-8a7e-128a192bfa77	RH	t
\.


--
-- Data for Name: tbldeliverytypes; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tbldeliverytypes (id, strname, blnstatus) FROM stdin;
d29ab9f7-7b89-4089-a299-cf9b0cb617cf	Proyecto	t
e20c3a2a-43d9-482a-88cb-b09b0b4b2efc	Licencia	t
f22db2a2-4a08-410a-ba8c-b01b0b5b2efc	Asignacion	t
012db2a2-4a08-410a-ba8c-b01b0b5b2efc	Bolsa de Horas	t
\.


--
-- Data for Name: tblicensings; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tblicensings (id, strname, blnstatus) FROM stdin;
112db2a2-4a08-410a-ba8c-b01b0b5b2efc	No Aplica	t
212db2a2-4a08-410a-ba8c-b01b0b5b2efc	Microsoft	t
312db2a2-4a08-410a-ba8c-b01b0b5b2efc	IBM	t
412db2a2-4a08-410a-ba8c-b01b0b5b2efc	Qlik	t
512db2a2-4a08-410a-ba8c-b01b0b5b2efc	Alteryx	t
612db2a2-4a08-410a-ba8c-b01b0b5b2efc	KNIME	t
\.


--
-- Data for Name: tbloportunitylabels; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tbloportunitylabels (id, strname, field_key, blnstatus, dtmlastmodified, uuidlastmodifiedby) FROM stdin;
f509fa84-0b73-45f8-b3ab-b8471e98822e	Línea de Negocio	linea_negocio	t	2026-07-31 21:42:11.159319+00	\N
7d90d810-74d3-4613-882d-8e814a029db5	Tipo de Entrega	tipo_entrega	t	2026-07-31 21:42:11.159319+00	\N
c6d3df39-53e7-40b9-8e2b-f1de16b5394f	Licenciamiento	licenciamiento	t	2026-07-31 21:42:11.159319+00	\N
\.


--
-- Data for Name: tblpipelinescatalog; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tblpipelinescatalog (id, strname, strdescription, blnstatus, dtmcreated, dtmlastmodified, intlastmodifiedby) FROM stdin;
c4ebd140-33c1-4782-898e-7dd419fd7fc6	Pipeline Comercial Principal	Pipeline por defecto para gestionar oportunidades comerciales.	t	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00	1
\.


--
-- Data for Name: tblstagescatalog; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tblstagescatalog (id, strname, blnstatus, bln_show_dashboard, pipeline_id, display_order, strcolor, blninitial, intmaxdays, dtmcreated, dtmlastmodified) FROM stdin;
1c13a7a7-d0fb-42aa-a125-d55f9637ffa0	Prospecto	t	t	c4ebd140-33c1-4782-898e-7dd419fd7fc6	1	#3498db	t	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
95b08f9c-591d-4660-8e4b-d94784d69784	Calificado	t	t	c4ebd140-33c1-4782-898e-7dd419fd7fc6	2	#f1c40f	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
293f8b80-c492-4d1c-901f-0878816c70df	Propuesta	t	t	c4ebd140-33c1-4782-898e-7dd419fd7fc6	3	#9b59b6	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
e74d94cc-9f6d-4d70-8126-c542eda31a4e	Negociación	t	t	c4ebd140-33c1-4782-898e-7dd419fd7fc6	4	#e67e22	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
a9beb8bc-9a73-4bf5-9c0d-5df343d093b1	Cierre Exitoso	t	t	c4ebd140-33c1-4782-898e-7dd419fd7fc6	5	#2ecc71	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
39cceec0-24a3-4308-8f8b-3dc78133f820	Cierre Perdido	t	f	c4ebd140-33c1-4782-898e-7dd419fd7fc6	6	#e74c3c	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: tbltypeactivities; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tbltypeactivities (id, strname, blnstatus) FROM stdin;
1	Llamada	t
2	Reunión	t
3	Correo	t
4	Demostración	t
\.


--
-- Data for Name: ticket_interactions; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.ticket_interactions (id, ticket_id, user_id, comment, content, is_internal, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_stages; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.ticket_stages (id, helpdesk_id, strname, blnstatus, bln_show_dashboard, display_order, strcolor, blninitial, intmaxdays, dtmcreated, dtmlastmodified) FROM stdin;
f5a70175-ab98-4b16-b37a-ea102487a601	c7e3c217-c04a-41c5-9040-2048eb08a3a5	Nuevo	t	t	1	#e74c3c	t	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
e83814cf-06ef-4d1c-ab83-c23f74e80f1a	c7e3c217-c04a-41c5-9040-2048eb08a3a5	En Proceso	t	t	2	#f1c40f	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
521778a0-7804-4f84-a11f-a316fee71ff3	c7e3c217-c04a-41c5-9040-2048eb08a3a5	En Espera	t	t	3	#3498db	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
d7d60b2e-ad54-4490-bf28-01e18397540b	c7e3c217-c04a-41c5-9040-2048eb08a3a5	Resuelto	t	t	4	#2ecc71	f	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.tickets (id, ticket_number, strtitle, tipo_incidencia, description, fecha_apertura, fecha_cierre, notas_resolucion, priority, alert_sent, archived, cliente_id, responsable_id, helpdesk_id, stage_id, stage_entered_at, "contactName", "contactEmail", "contactPhone") FROM stdin;
\.


--
-- Data for Name: transaction_history; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.transaction_history (id, prompt_tokens, completion_tokens, total_tokens, fecha_procesamiento, is_extra, action_name) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: tenant_tibs; Owner: postgres
--

COPY tenant_tibs.users (id, username, email, password, role, "isActive", "profileImageUrl", reset_password_token, reset_password_expires, "createdById", "createdAt", "updatedAt") FROM stdin;
ed023cea-c5d9-4683-a5a3-112abff9209d	jonathan	jonathan@tibs.com.mx	$2b$10$xg7tRrgToawDoQwCmq2MyuJLs3dTAb7IjmayDVPmQ2/doNGxhwRl.	admin	t	\N	\N	\N	\N	2026-07-31 21:42:11.159319+00	2026-07-31 21:42:11.159319+00
\.


--
-- Name: plans_plan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.plans_plan_id_seq', 1, true);


--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tbltypeactivities_id_seq', 1, false);


--
-- Name: tenant_renewal_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tenant_renewal_queue_id_seq', 1, false);


--
-- Name: tenants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tenants_id_seq', 1, true);


--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tickets_ticket_number_seq', 1, true);


--
-- Name: tbltypeactivities_id_seq; Type: SEQUENCE SET; Schema: tenant_tibs; Owner: postgres
--

SELECT pg_catalog.setval('tenant_tibs.tbltypeactivities_id_seq', 4, true);


--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE SET; Schema: tenant_tibs; Owner: postgres
--

SELECT pg_catalog.setval('tenant_tibs.tickets_ticket_number_seq', 1, false);


--
-- Name: products PK_0806c755e0aca124e67c0cf6d7d; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY (id);


--
-- Name: plans PK_084714de33798c5b96f12725f7e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT "PK_084714de33798c5b96f12725f7e" PRIMARY KEY (plan_id);


--
-- Name: tenant_renewal_queue PK_0b5219ff2950ff66c9d8f23db09; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_renewal_queue
    ADD CONSTRAINT "PK_0b5219ff2950ff66c9d8f23db09" PRIMARY KEY (id);


--
-- Name: messages PK_18325f38ae6de43878487eff986; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id);


--
-- Name: transaction_history PK_1e2444ea77f6b5952b4ab7cb9a2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT "PK_1e2444ea77f6b5952b4ab7cb9a2" PRIMARY KEY (id);


--
-- Name: tblbusinesslines PK_2f16a4a59d225c52481ca8444af; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblbusinesslines
    ADD CONSTRAINT "PK_2f16a4a59d225c52481ca8444af" PRIMARY KEY (id);


--
-- Name: opportunity_trackings PK_32e9af2b60e5b2fac0bc224fdcb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_trackings
    ADD CONSTRAINT "PK_32e9af2b60e5b2fac0bc224fdcb" PRIMARY KEY (id);


--
-- Name: tickets PK_343bc942ae261cf7a1377f48fd0; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY (id);


--
-- Name: activity_contacts PK_385cfbcf6795d4f3c9dfce7b680; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_contacts
    ADD CONSTRAINT "PK_385cfbcf6795d4f3c9dfce7b680" PRIMARY KEY ("activitiesId", "clientsId");


--
-- Name: reminders PK_38715fec7f634b72c6cf7ea4893; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT "PK_38715fec7f634b72c6cf7ea4893" PRIMARY KEY (id);


--
-- Name: ai_sub_agents PK_3ac3f8c129d95a1140fae781b17; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_sub_agents
    ADD CONSTRAINT "PK_3ac3f8c129d95a1140fae781b17" PRIMARY KEY (id);


--
-- Name: dashboard_indicators PK_3cf12ddb3c11e81efd0e2451d2c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_indicators
    ADD CONSTRAINT "PK_3cf12ddb3c11e81efd0e2451d2c" PRIMARY KEY (id);


--
-- Name: helpdesk_cron_config PK_44903aa0b7b587597e1142d28a7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_cron_config
    ADD CONSTRAINT "PK_44903aa0b7b587597e1142d28a7" PRIMARY KEY (id);


--
-- Name: opportunities PK_4bd9cd12ddc0ff48a5a97ddebce; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "PK_4bd9cd12ddc0ff48a5a97ddebce" PRIMARY KEY (id);


--
-- Name: ai_agent_configs PK_4db9af4608dfaa1179e26dd62bd; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_agent_configs
    ADD CONSTRAINT "PK_4db9af4608dfaa1179e26dd62bd" PRIMARY KEY (id);


--
-- Name: tenants PK_53be67a04681c66b87ee27c9321; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY (id);


--
-- Name: notifications PK_6a72c3c0f683f6462415e653c3a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);


--
-- Name: channel_configs PK_71b592f5e0da6907fce0f0654cb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_configs
    ADD CONSTRAINT "PK_71b592f5e0da6907fce0f0654cb" PRIMARY KEY (id);


--
-- Name: opportunity_files PK_73cd155bbededebad3c2cbd7735; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_files
    ADD CONSTRAINT "PK_73cd155bbededebad3c2cbd7735" PRIMARY KEY (id);


--
-- Name: helpdesks PK_77f02240860ca47509d1a57aa98; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesks
    ADD CONSTRAINT "PK_77f02240860ca47509d1a57aa98" PRIMARY KEY (id);


--
-- Name: activities PK_7f4004429f731ffb9c88eb486a8; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY (id);


--
-- Name: interactions PK_911b7416a6671b4148b18c18ecb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT "PK_911b7416a6671b4148b18c18ecb" PRIMARY KEY (id);


--
-- Name: expenses PK_94c3ceb17e3140abc9282c20610; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY (id);


--
-- Name: ticket_interactions PK_9a6d8ebb8568b1e08c202352353; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_interactions
    ADD CONSTRAINT "PK_9a6d8ebb8568b1e08c202352353" PRIMARY KEY (id);


--
-- Name: opportunity_contacts PK_9d0eee6236cf01e6085a7c21a6c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_contacts
    ADD CONSTRAINT "PK_9d0eee6236cf01e6085a7c21a6c" PRIMARY KEY ("opportunitiesId", "clientsId");


--
-- Name: ticket_stages PK_a1faa0d64e8d53484b72248c529; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_stages
    ADD CONSTRAINT "PK_a1faa0d64e8d53484b72248c529" PRIMARY KEY (id);


--
-- Name: tbldeliverytypes PK_a28ad8fd752fb929c2f97791d3f; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tbldeliverytypes
    ADD CONSTRAINT "PK_a28ad8fd752fb929c2f97791d3f" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: opportunity_products PK_b6dc230738166b79452dd8dcd54; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_products
    ADD CONSTRAINT "PK_b6dc230738166b79452dd8dcd54" PRIMARY KEY (id);


--
-- Name: companies PK_d4bc3e82a314fa9e29f652c2c22; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY (id);


--
-- Name: tbloportunitylabels PK_d5651a1a004daaeaac4af6da08a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tbloportunitylabels
    ADD CONSTRAINT "PK_d5651a1a004daaeaac4af6da08a" PRIMARY KEY (id);


--
-- Name: product_files PK_d741e1a2d0cde49c1f897048626; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_files
    ADD CONSTRAINT "PK_d741e1a2d0cde49c1f897048626" PRIMARY KEY (id);


--
-- Name: tblstagescatalog PK_ebc58cb57871aea9219c96c6690; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblstagescatalog
    ADD CONSTRAINT "PK_ebc58cb57871aea9219c96c6690" PRIMARY KEY (id);


--
-- Name: tbltypeactivities PK_ece08c0992a238ec5d9d7b63b1b; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tbltypeactivities
    ADD CONSTRAINT "PK_ece08c0992a238ec5d9d7b63b1b" PRIMARY KEY (id);


--
-- Name: tblpipelinescatalog PK_eddde900eb35ee0acaf8f9bbd9f; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblpipelinescatalog
    ADD CONSTRAINT "PK_eddde900eb35ee0acaf8f9bbd9f" PRIMARY KEY (id);


--
-- Name: conversations PK_ee34f4f7ced4ec8681f26bf04ef; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY (id);


--
-- Name: clients PK_f1ab7cf3a5714dbc6bb4e1c28a4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY (id);


--
-- Name: tblicensings PK_f2d1bd208873a8f6b5757281e47; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblicensings
    ADD CONSTRAINT "PK_f2d1bd208873a8f6b5757281e47" PRIMARY KEY (id);


--
-- Name: tblpipelinescatalog UQ_21c5c54ef8b817b68623d3ea7bd; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblpipelinescatalog
    ADD CONSTRAINT "UQ_21c5c54ef8b817b68623d3ea7bd" UNIQUE (strname);


--
-- Name: tblstagescatalog UQ_288f5036149fd7e3931567296ed; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblstagescatalog
    ADD CONSTRAINT "UQ_288f5036149fd7e3931567296ed" UNIQUE (pipeline_id, strname);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: tbloportunitylabels UQ_9f16d008e337f8d51a29c787808; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tbloportunitylabels
    ADD CONSTRAINT "UQ_9f16d008e337f8d51a29c787808" UNIQUE (field_key);


--
-- Name: ai_sub_agents UQ_b74af48672e40ccdf0e7d661cd1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_sub_agents
    ADD CONSTRAINT "UQ_b74af48672e40ccdf0e7d661cd1" UNIQUE (key);


--
-- Name: tenants UQ_c2a961556326eec0e3b19f3ced5; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT "UQ_c2a961556326eec0e3b19f3ced5" UNIQUE (schema_name);


--
-- Name: clients UQ_d2608642672a2ac41adc4733561; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "UQ_d2608642672a2ac41adc4733561" UNIQUE (correo);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: product_knowledge_base product_knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_knowledge_base
    ADD CONSTRAINT product_knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: ai_sub_agents ai_sub_agents_key_key; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ai_sub_agents
    ADD CONSTRAINT ai_sub_agents_key_key UNIQUE (key);


--
-- Name: activities pk_activities; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activities
    ADD CONSTRAINT pk_activities PRIMARY KEY (id);


--
-- Name: activity_contacts pk_activity_contacts; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activity_contacts
    ADD CONSTRAINT pk_activity_contacts PRIMARY KEY ("activitiesId", "clientsId");


--
-- Name: ai_agent_configs pk_ai_agent_configs; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ai_agent_configs
    ADD CONSTRAINT pk_ai_agent_configs PRIMARY KEY (id);


--
-- Name: ai_sub_agents pk_ai_sub_agents; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ai_sub_agents
    ADD CONSTRAINT pk_ai_sub_agents PRIMARY KEY (id);


--
-- Name: channel_configs pk_channel_configs; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.channel_configs
    ADD CONSTRAINT pk_channel_configs PRIMARY KEY (id);


--
-- Name: clients pk_clients; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.clients
    ADD CONSTRAINT pk_clients PRIMARY KEY (id);


--
-- Name: companies pk_companies; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.companies
    ADD CONSTRAINT pk_companies PRIMARY KEY (id);


--
-- Name: conversations pk_conversations; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT pk_conversations PRIMARY KEY (id);


--
-- Name: dashboard_indicators pk_dashboard_indicators; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.dashboard_indicators
    ADD CONSTRAINT pk_dashboard_indicators PRIMARY KEY (id);


--
-- Name: expenses pk_expenses; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.expenses
    ADD CONSTRAINT pk_expenses PRIMARY KEY (id);


--
-- Name: helpdesk_cron_config pk_helpdesk_cron_config; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.helpdesk_cron_config
    ADD CONSTRAINT pk_helpdesk_cron_config PRIMARY KEY (id);


--
-- Name: helpdesks pk_helpdesks; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.helpdesks
    ADD CONSTRAINT pk_helpdesks PRIMARY KEY (id);


--
-- Name: interactions pk_interactions; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.interactions
    ADD CONSTRAINT pk_interactions PRIMARY KEY (id);


--
-- Name: messages pk_messages; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.messages
    ADD CONSTRAINT pk_messages PRIMARY KEY (id);


--
-- Name: notifications pk_notifications; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.notifications
    ADD CONSTRAINT pk_notifications PRIMARY KEY (id);


--
-- Name: opportunities pk_opportunities; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT pk_opportunities PRIMARY KEY (id);


--
-- Name: opportunity_contacts pk_opportunity_contacts; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_contacts
    ADD CONSTRAINT pk_opportunity_contacts PRIMARY KEY ("opportunitiesId", "clientsId");


--
-- Name: opportunity_files pk_opportunity_files; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_files
    ADD CONSTRAINT pk_opportunity_files PRIMARY KEY (id);


--
-- Name: opportunity_products pk_opportunity_products; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_products
    ADD CONSTRAINT pk_opportunity_products PRIMARY KEY (id);


--
-- Name: opportunity_trackings pk_opportunity_trackings; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_trackings
    ADD CONSTRAINT pk_opportunity_trackings PRIMARY KEY (id);


--
-- Name: product_files pk_product_files; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.product_files
    ADD CONSTRAINT pk_product_files PRIMARY KEY (id);


--
-- Name: products pk_products; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.products
    ADD CONSTRAINT pk_products PRIMARY KEY (id);


--
-- Name: reminders pk_reminders; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.reminders
    ADD CONSTRAINT pk_reminders PRIMARY KEY (id);


--
-- Name: tblbusinesslines pk_tblbusinesslines; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tblbusinesslines
    ADD CONSTRAINT pk_tblbusinesslines PRIMARY KEY (id);


--
-- Name: tbldeliverytypes pk_tbldeliverytypes; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tbldeliverytypes
    ADD CONSTRAINT pk_tbldeliverytypes PRIMARY KEY (id);


--
-- Name: tblicensings pk_tblicensings; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tblicensings
    ADD CONSTRAINT pk_tblicensings PRIMARY KEY (id);


--
-- Name: tbloportunitylabels pk_tbloportunitylabels; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tbloportunitylabels
    ADD CONSTRAINT pk_tbloportunitylabels PRIMARY KEY (id);


--
-- Name: tblpipelinescatalog pk_tblpipelinescatalog; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tblpipelinescatalog
    ADD CONSTRAINT pk_tblpipelinescatalog PRIMARY KEY (id);


--
-- Name: tblstagescatalog pk_tblstagescatalog; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tblstagescatalog
    ADD CONSTRAINT pk_tblstagescatalog PRIMARY KEY (id);


--
-- Name: tbltypeactivities pk_tbltypeactivities; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tbltypeactivities
    ADD CONSTRAINT pk_tbltypeactivities PRIMARY KEY (id);


--
-- Name: ticket_interactions pk_ticket_interactions; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ticket_interactions
    ADD CONSTRAINT pk_ticket_interactions PRIMARY KEY (id);


--
-- Name: ticket_stages pk_ticket_stages; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ticket_stages
    ADD CONSTRAINT pk_ticket_stages PRIMARY KEY (id);


--
-- Name: tickets pk_tickets; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets
    ADD CONSTRAINT pk_tickets PRIMARY KEY (id);


--
-- Name: transaction_history pk_transaction_history; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.transaction_history
    ADD CONSTRAINT pk_transaction_history PRIMARY KEY (id);


--
-- Name: users pk_users; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.users
    ADD CONSTRAINT pk_users PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: IDX_73fb9c255cb264c56fc9783295; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_73fb9c255cb264c56fc9783295" ON public.opportunity_contacts USING btree ("clientsId");


--
-- Name: IDX_a7d00109580422761c6da2aa35; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_a7d00109580422761c6da2aa35" ON public.opportunity_contacts USING btree ("opportunitiesId");


--
-- Name: IDX_cc2f54f67216c56a0e28d7040f; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_cc2f54f67216c56a0e28d7040f" ON public.activity_contacts USING btree ("activitiesId");


--
-- Name: IDX_f0461d2145d72ac02cb1f4496a; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_f0461d2145d72ac02cb1f4496a" ON public.activity_contacts USING btree ("clientsId");


--
-- Name: ticket_interactions FK_015664a3fc2943f22209b488ad4; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_interactions
    ADD CONSTRAINT "FK_015664a3fc2943f22209b488ad4" FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_stages FK_015df5b240821ddab339ec120c5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_stages
    ADD CONSTRAINT "FK_015df5b240821ddab339ec120c5" FOREIGN KEY (helpdesk_id) REFERENCES public.helpdesks(id) ON DELETE CASCADE;


--
-- Name: expenses FK_07d9d152ff3961d3af9c0ab095d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "FK_07d9d152ff3961d3af9c0ab095d" FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id);


--
-- Name: opportunities FK_0caa550ba1e8af228a444f41c50; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_0caa550ba1e8af228a444f41c50" FOREIGN KEY (tipo_entrega_id) REFERENCES public.tbldeliverytypes(id) ON DELETE SET NULL;


--
-- Name: ai_agent_configs FK_105b5beccf07f2b988de1e9ad79; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_agent_configs
    ADD CONSTRAINT "FK_105b5beccf07f2b988de1e9ad79" FOREIGN KEY ("defaultUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages FK_2868049bbe999cdf09aed764400; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "FK_2868049bbe999cdf09aed764400" FOREIGN KEY ("senderUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversations FK_2882c536d4eecfd496132b20eeb; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "FK_2882c536d4eecfd496132b20eeb" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: conversations FK_2e3ef16d5e4debdb283906c3df7; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "FK_2e3ef16d5e4debdb283906c3df7" FOREIGN KEY ("channelConfigId") REFERENCES public.channel_configs(id) ON DELETE SET NULL;


--
-- Name: reminders FK_353491f8baaf582389847f43682; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT "FK_353491f8baaf582389847f43682" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: opportunity_files FK_4dab24c743f43a61cdcb9c52658; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_files
    ADD CONSTRAINT "FK_4dab24c743f43a61cdcb9c52658" FOREIGN KEY ("opportunityId") REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: clients FK_5016a1ccedbea5f26d46376d6b2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "FK_5016a1ccedbea5f26d46376d6b2" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: opportunities FK_51392868612157f01fc61a6ee2d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_51392868612157f01fc61a6ee2d" FOREIGN KEY (pipeline_id) REFERENCES public.tblpipelinescatalog(id);


--
-- Name: product_files FK_56627602b737452ac8e95a0ac78; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_files
    ADD CONSTRAINT "FK_56627602b737452ac8e95a0ac78" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: tblstagescatalog FK_5722459e77f4db2a760c7b888db; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tblstagescatalog
    ADD CONSTRAINT "FK_5722459e77f4db2a760c7b888db" FOREIGN KEY (pipeline_id) REFERENCES public.tblpipelinescatalog(id) ON DELETE CASCADE;


--
-- Name: expenses FK_5761adee29a8e328e2aa57ce302; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "FK_5761adee29a8e328e2aa57ce302" FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: activities FK_5a2cfe6f705df945b20c1b22c71; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_5a2cfe6f705df945b20c1b22c71" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: tenant_renewal_queue FK_5b319b263e6a648b59823492780; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_renewal_queue
    ADD CONSTRAINT "FK_5b319b263e6a648b59823492780" FOREIGN KEY (plan_id) REFERENCES public.plans(plan_id) ON DELETE CASCADE;


--
-- Name: expenses FK_62c7e24a2ae141ffb1ccb290744; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "FK_62c7e24a2ae141ffb1ccb290744" FOREIGN KEY (usuario_id) REFERENCES public.users(id);


--
-- Name: opportunities FK_6b809748751441914b5a7068cc5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_6b809748751441914b5a7068cc5" FOREIGN KEY (stage_id) REFERENCES public.tblstagescatalog(id);


--
-- Name: opportunities FK_6cb1c429c65cfa6c137262f524d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_6cb1c429c65cfa6c137262f524d" FOREIGN KEY (licenciamiento_id) REFERENCES public.tblicensings(id) ON DELETE SET NULL;


--
-- Name: opportunity_products FK_71f53a0a0d3d828a4b24e81a64e; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_products
    ADD CONSTRAINT "FK_71f53a0a0d3d828a4b24e81a64e" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: clients FK_72b2a0a93d100c703ac4b231042; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "FK_72b2a0a93d100c703ac4b231042" FOREIGN KEY (ejecutivo_id) REFERENCES public.users(id);


--
-- Name: opportunity_contacts FK_73fb9c255cb264c56fc97832958; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_contacts
    ADD CONSTRAINT "FK_73fb9c255cb264c56fc97832958" FOREIGN KEY ("clientsId") REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: opportunity_trackings FK_78da6ee7da20601b1d27a52b940; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_trackings
    ADD CONSTRAINT "FK_78da6ee7da20601b1d27a52b940" FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: tickets FK_7efefd7123dc764ffaee4b4b0a2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_7efefd7123dc764ffaee4b4b0a2" FOREIGN KEY (stage_id) REFERENCES public.ticket_stages(id) ON DELETE RESTRICT;


--
-- Name: helpdesk_cron_config FK_82a7a900233deec55b3728bf687; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_cron_config
    ADD CONSTRAINT "FK_82a7a900233deec55b3728bf687" FOREIGN KEY (helpdesk_id) REFERENCES public.helpdesks(id) ON DELETE CASCADE;


--
-- Name: tenants FK_919d143d2411832db812bbc600e; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT "FK_919d143d2411832db812bbc600e" FOREIGN KEY (plan_id) REFERENCES public.plans(plan_id) ON DELETE SET NULL;


--
-- Name: notifications FK_9a8a82462cab47c73d25f49261f; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: opportunity_contacts FK_a7d00109580422761c6da2aa354; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_contacts
    ADD CONSTRAINT "FK_a7d00109580422761c6da2aa354" FOREIGN KEY ("opportunitiesId") REFERENCES public.opportunities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversations FK_ac00a0b3bbe982fa019f0e4e60f; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "FK_ac00a0b3bbe982fa019f0e4e60f" FOREIGN KEY ("assignedUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: opportunity_trackings FK_adb2651fd6ce68d8d3f5c44a088; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_trackings
    ADD CONSTRAINT "FK_adb2651fd6ce68d8d3f5c44a088" FOREIGN KEY (changed_by_id) REFERENCES public.users(id);


--
-- Name: opportunities FK_b0b2fece2e13b1f38bd5cfe1da0; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_b0b2fece2e13b1f38bd5cfe1da0" FOREIGN KEY (ejecutivo_id) REFERENCES public.users(id);


--
-- Name: opportunities FK_b12ed2b583eebb41169a8fb64de; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_b12ed2b583eebb41169a8fb64de" FOREIGN KEY (cliente_id) REFERENCES public.clients(id);


--
-- Name: activities FK_b89493b1633169dca906755762b; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_b89493b1633169dca906755762b" FOREIGN KEY ("opportunityId") REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: tickets FK_bdfbcf4d15d865c4b5a47457f62; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_bdfbcf4d15d865c4b5a47457f62" FOREIGN KEY (helpdesk_id) REFERENCES public.helpdesks(id) ON DELETE CASCADE;


--
-- Name: opportunities FK_be657f80d27287715b533b080fa; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_be657f80d27287715b533b080fa" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: activity_contacts FK_cc2f54f67216c56a0e28d7040f5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_contacts
    ADD CONSTRAINT "FK_cc2f54f67216c56a0e28d7040f5" FOREIGN KEY ("activitiesId") REFERENCES public.activities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: interactions FK_cf5831be29befbb5ac5d1f7c412; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT "FK_cf5831be29befbb5ac5d1f7c412" FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: companies FK_d006d797a7fb8586365e3a741ec; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT "FK_d006d797a7fb8586365e3a741ec" FOREIGN KEY (ejecutivo_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets FK_d29d3d90cac066e223c7ca8a2f8; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_d29d3d90cac066e223c7ca8a2f8" FOREIGN KEY (responsable_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: opportunity_products FK_d64e2b99803fd0de5f48b40202d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_products
    ADD CONSTRAINT "FK_d64e2b99803fd0de5f48b40202d" FOREIGN KEY ("opportunityId") REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: tickets FK_db78a3be4e72f208821ecb0594a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_db78a3be4e72f208821ecb0594a" FOREIGN KEY (cliente_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: opportunities FK_dd8f6e7c9c029545b56717efe07; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT "FK_dd8f6e7c9c029545b56717efe07" FOREIGN KEY (linea_negocio_id) REFERENCES public.tblbusinesslines(id) ON DELETE SET NULL;


--
-- Name: products FK_de1043dff8f68e83a20480b00f7; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "FK_de1043dff8f68e83a20480b00f7" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages FK_e5663ce0c730b2de83445e2fd19; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "FK_e5663ce0c730b2de83445e2fd19" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: activities FK_ee6a5903f9e17b283488a3a4017; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_ee6a5903f9e17b283488a3a4017" FOREIGN KEY ("typeActivityId") REFERENCES public.tbltypeactivities(id) ON DELETE SET NULL;


--
-- Name: activity_contacts FK_f0461d2145d72ac02cb1f4496a0; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_contacts
    ADD CONSTRAINT "FK_f0461d2145d72ac02cb1f4496a0" FOREIGN KEY ("clientsId") REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: activities FK_f6deb4e21ba78416f476cd661e1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_f6deb4e21ba78416f476cd661e1" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: opportunity_trackings FK_f7377ab7b0daab81737dab9d74b; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opportunity_trackings
    ADD CONSTRAINT "FK_f7377ab7b0daab81737dab9d74b" FOREIGN KEY (stage_id) REFERENCES public.tblstagescatalog(id);


--
-- Name: activities FK_fc9d6236c8a32fecdd82fae816a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT "FK_fc9d6236c8a32fecdd82fae816a" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: activities activities_clientId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activities
    ADD CONSTRAINT "activities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: activities activities_companyId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activities
    ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES tenant_tibs.companies(id) ON DELETE SET NULL;


--
-- Name: activities activities_opportunityId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activities
    ADD CONSTRAINT "activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: activity_contacts activity_contacts_activitiesId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activity_contacts
    ADD CONSTRAINT "activity_contacts_activitiesId_fkey" FOREIGN KEY ("activitiesId") REFERENCES tenant_tibs.activities(id) ON DELETE CASCADE;


--
-- Name: activity_contacts activity_contacts_clientsId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.activity_contacts
    ADD CONSTRAINT "activity_contacts_clientsId_fkey" FOREIGN KEY ("clientsId") REFERENCES tenant_tibs.clients(id) ON DELETE CASCADE;


--
-- Name: ai_agent_configs ai_agent_configs_defaultUserId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ai_agent_configs
    ADD CONSTRAINT "ai_agent_configs_defaultUserId_fkey" FOREIGN KEY ("defaultUserId") REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: clients clients_companyId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.clients
    ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES tenant_tibs.companies(id) ON DELETE SET NULL;


--
-- Name: clients clients_ejecutivo_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.clients
    ADD CONSTRAINT clients_ejecutivo_id_fkey FOREIGN KEY (ejecutivo_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_ejecutivo_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.companies
    ADD CONSTRAINT companies_ejecutivo_id_fkey FOREIGN KEY (ejecutivo_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_assignedUserId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT "conversations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT conversations_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_channelConfigId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT "conversations_channelConfigId_fkey" FOREIGN KEY ("channelConfigId") REFERENCES tenant_tibs.channel_configs(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_clientId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT "conversations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.conversations
    ADD CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: dashboard_indicators dashboard_indicators_helpdesk_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.dashboard_indicators
    ADD CONSTRAINT dashboard_indicators_helpdesk_id_fkey FOREIGN KEY (helpdesk_id) REFERENCES tenant_tibs.helpdesks(id) ON DELETE CASCADE;


--
-- Name: dashboard_indicators dashboard_indicators_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.dashboard_indicators
    ADD CONSTRAINT dashboard_indicators_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES tenant_tibs.tblpipelinescatalog(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_client_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.expenses
    ADD CONSTRAINT expenses_client_id_fkey FOREIGN KEY (client_id) REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.expenses
    ADD CONSTRAINT expenses_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES tenant_tibs.opportunities(id) ON DELETE SET NULL;


--
-- Name: tblstagescatalog fk_stages_pipeline; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tblstagescatalog
    ADD CONSTRAINT fk_stages_pipeline FOREIGN KEY (pipeline_id) REFERENCES tenant_tibs.tblpipelinescatalog(id) ON DELETE CASCADE;


--
-- Name: helpdesk_cron_config helpdesk_cron_config_helpdesk_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.helpdesk_cron_config
    ADD CONSTRAINT helpdesk_cron_config_helpdesk_id_fkey FOREIGN KEY (helpdesk_id) REFERENCES tenant_tibs.helpdesks(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.interactions
    ADD CONSTRAINT interactions_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversationId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.messages
    ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES tenant_tibs.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tenant_tibs.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_senderUserId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.messages
    ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_cliente_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_companyId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT "opportunities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES tenant_tibs.companies(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_ejecutivo_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_ejecutivo_id_fkey FOREIGN KEY (ejecutivo_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_licenciamiento_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_licenciamiento_id_fkey FOREIGN KEY (licenciamiento_id) REFERENCES tenant_tibs.tblicensings(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_linea_negocio_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_linea_negocio_id_fkey FOREIGN KEY (linea_negocio_id) REFERENCES tenant_tibs.tblbusinesslines(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES tenant_tibs.tblpipelinescatalog(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_stage_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES tenant_tibs.tblstagescatalog(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_tipo_entrega_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunities
    ADD CONSTRAINT opportunities_tipo_entrega_id_fkey FOREIGN KEY (tipo_entrega_id) REFERENCES tenant_tibs.tbldeliverytypes(id) ON DELETE SET NULL;


--
-- Name: opportunity_contacts opportunity_contacts_clientsId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_contacts
    ADD CONSTRAINT "opportunity_contacts_clientsId_fkey" FOREIGN KEY ("clientsId") REFERENCES tenant_tibs.clients(id) ON DELETE CASCADE;


--
-- Name: opportunity_contacts opportunity_contacts_opportunitiesId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_contacts
    ADD CONSTRAINT "opportunity_contacts_opportunitiesId_fkey" FOREIGN KEY ("opportunitiesId") REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_files opportunity_files_opportunityId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_files
    ADD CONSTRAINT "opportunity_files_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_products opportunity_products_opportunityId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_products
    ADD CONSTRAINT "opportunity_products_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_products opportunity_products_productId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_products
    ADD CONSTRAINT "opportunity_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES tenant_tibs.products(id) ON DELETE CASCADE;


--
-- Name: opportunity_trackings opportunity_trackings_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_trackings
    ADD CONSTRAINT opportunity_trackings_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: opportunity_trackings opportunity_trackings_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_trackings
    ADD CONSTRAINT opportunity_trackings_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES tenant_tibs.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_trackings opportunity_trackings_stage_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.opportunity_trackings
    ADD CONSTRAINT opportunity_trackings_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES tenant_tibs.tblstagescatalog(id) ON DELETE CASCADE;


--
-- Name: product_files product_files_productId_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.product_files
    ADD CONSTRAINT "product_files_productId_fkey" FOREIGN KEY ("productId") REFERENCES tenant_tibs.products(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_activity_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.reminders
    ADD CONSTRAINT reminders_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES tenant_tibs.activities(id) ON DELETE CASCADE;


--
-- Name: ticket_interactions ticket_interactions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ticket_interactions
    ADD CONSTRAINT ticket_interactions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tenant_tibs.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_interactions ticket_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ticket_interactions
    ADD CONSTRAINT ticket_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: ticket_stages ticket_stages_helpdesk_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.ticket_stages
    ADD CONSTRAINT ticket_stages_helpdesk_id_fkey FOREIGN KEY (helpdesk_id) REFERENCES tenant_tibs.helpdesks(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_cliente_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets
    ADD CONSTRAINT tickets_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES tenant_tibs.clients(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_helpdesk_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets
    ADD CONSTRAINT tickets_helpdesk_id_fkey FOREIGN KEY (helpdesk_id) REFERENCES tenant_tibs.helpdesks(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_responsable_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets
    ADD CONSTRAINT tickets_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES tenant_tibs.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_stage_id_fkey; Type: FK CONSTRAINT; Schema: tenant_tibs; Owner: postgres
--

ALTER TABLE ONLY tenant_tibs.tickets
    ADD CONSTRAINT tickets_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES tenant_tibs.ticket_stages(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict DX2hiZwKT2rwqJi6PBdZ42YJqkfYnAVdJAu0qg1eVhL7bFhHXrpFI11W2kojoXr

