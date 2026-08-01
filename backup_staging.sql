--
-- PostgreSQL database dump
--

-- \restrict BjRYXoxYpAqVN82zhcfVUAB5kXFzlqvcTEb16PjdUKrnyCZkkAE85x2HXYHxdKu

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
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: activities_activitytype_enum; Type: TYPE; Schema: public; Owner: postgres
--


-- Ensure staging schema exists
CREATE SCHEMA IF NOT EXISTS staging;

-- Ensure uuid-ossp extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- Ensure staging.uuid_generate_v4() function exists
CREATE OR REPLACE FUNCTION staging.uuid_generate_v4() 
RETURNS uuid AS $$
BEGIN
    RETURN public.uuid_generate_v4();
EXCEPTION WHEN OTHERS THEN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql;

CREATE TYPE staging.activities_activitytype_enum AS ENUM (
    'Correo',
    'Presentación Servicios Presencial',
    'Presentación Servicios En Línea',
    'Evento',
    'Seguimiento Oportunidad Línea',
    'Llamada',
    'Seguimiento Oportunidad Presencial',
    'Otros'
);


ALTER TYPE staging.activities_activitytype_enum OWNER TO postgres;

--
-- Name: clients_category_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.clients_category_enum AS ENUM (
    'Contacto',
    'Lead',
    'Cliente'
);


ALTER TYPE staging.clients_category_enum OWNER TO postgres;

--
-- Name: opportunities_etapa_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunities_etapa_enum AS ENUM (
    'Nuevo',
    'Descubrimiento',
    'Estimación',
    'Propuesta',
    'Negociación',
    'Ganada',
    'Perdida',
    'Cancelada',
    'Standby'
);


ALTER TYPE staging.opportunities_etapa_enum OWNER TO postgres;

--
-- Name: opportunities_licenciamiento_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunities_licenciamiento_enum AS ENUM (
    'No Aplica',
    'Microsoft',
    'IBM',
    'Qlik',
    'Alteryx',
    'KNIME'
);


ALTER TYPE staging.opportunities_licenciamiento_enum OWNER TO postgres;

--
-- Name: opportunities_linea_negocio_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunities_linea_negocio_enum AS ENUM (
    'Datos',
    'Desarrollo',
    'RH'
);


ALTER TYPE staging.opportunities_linea_negocio_enum OWNER TO postgres;

--
-- Name: opportunities_moneda_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunities_moneda_enum AS ENUM (
    'USD',
    'MXN'
);


ALTER TYPE staging.opportunities_moneda_enum OWNER TO postgres;

--
-- Name: opportunities_tipo_entrega_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunities_tipo_entrega_enum AS ENUM (
    'Proyecto',
    'Licencia',
    'Asignacion',
    'Bolsa de Horas'
);


ALTER TYPE staging.opportunities_tipo_entrega_enum OWNER TO postgres;

--
-- Name: opportunity_trackings_stage_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.opportunity_trackings_stage_enum AS ENUM (
    'Nuevo',
    'Descubrimiento',
    'Estimación',
    'Propuesta',
    'Negociación',
    'Ganada',
    'Perdida',
    'Cancelada',
    'Standby'
);


ALTER TYPE staging.opportunity_trackings_stage_enum OWNER TO postgres;

--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE staging.users_role_enum AS ENUM (
    'admin',
    'executive'
);


ALTER TYPE staging.users_role_enum OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.activities (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    date timestamp without time zone NOT NULL,
    activity character varying(80) NOT NULL,
    "opportunityId" uuid,
    "userId" uuid NOT NULL,
    "activityType" staging.activities_activitytype_enum,
    "clientId" uuid,
    flaghistory boolean
);


ALTER TABLE staging.activities OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.clients (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    apellido character varying(255) NOT NULL,
    correo character varying(255) NOT NULL,
    empresa character varying(255) NOT NULL,
    puesto character varying(255),
    telefono character varying(50),
    estatus boolean DEFAULT true NOT NULL,
    ejecutivo_id uuid,
    category staging.clients_category_enum DEFAULT 'Lead'::staging.clients_category_enum NOT NULL
);


ALTER TABLE staging.clients OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.expenses (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    fecha date NOT NULL,
    concepto character varying(255) NOT NULL,
    monto numeric(18,2) NOT NULL,
    client_id uuid,
    opportunity_id uuid,
    usuario_id uuid,
    "receiptUrl" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE staging.expenses OWNER TO postgres;

--
-- Name: interactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.interactions (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    opportunity_id uuid NOT NULL
);


ALTER TABLE staging.interactions OWNER TO postgres;

--
-- Name: nueva_tabla; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.nueva_tabla (
    id uuid,
    date timestamp without time zone,
    activity character varying(80),
    "activityType" text,
    "opportunityId" uuid,
    "userId" uuid
);


ALTER TABLE staging.nueva_tabla OWNER TO postgres;

--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.opportunities (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    nombre_proyecto character varying(255) NOT NULL,
    cliente_id uuid NOT NULL,
    empresa character varying(255) NOT NULL,
    ejecutivo_id uuid,
    etapa staging.opportunities_etapa_enum DEFAULT 'Nuevo'::staging.opportunities_etapa_enum NOT NULL,
    monto_licenciamiento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    monto_servicios numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    monto_total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    moneda staging.opportunities_moneda_enum DEFAULT 'USD'::staging.opportunities_moneda_enum NOT NULL,
    linea_negocio staging.opportunities_linea_negocio_enum NOT NULL,
    tipo_entrega staging.opportunities_tipo_entrega_enum NOT NULL,
    licenciamiento staging.opportunities_licenciamiento_enum,
    proposal_document_path character varying(512),
    archived boolean DEFAULT false NOT NULL,
    "tipoCambio" numeric(10,2),
    description character varying(1000),
    estimated_closure_date date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE staging.opportunities OWNER TO postgres;

--
-- Name: COLUMN opportunities."tipoCambio"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN staging.opportunities."tipoCambio" IS 'Tipo de cambio aplicado si la moneda es USD';


--
-- Name: opportunity_trackings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.opportunity_trackings (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    opportunity_id uuid NOT NULL,
    stage staging.opportunity_trackings_stage_enum NOT NULL,
    "changedAt" timestamp without time zone DEFAULT now() NOT NULL,
    changed_by_id uuid NOT NULL
);


ALTER TABLE staging.opportunity_trackings OWNER TO postgres;

--
-- Name: reminders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.reminders (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    title character varying(255) NOT NULL,
    date timestamp without time zone NOT NULL,
    opportunity_id uuid NOT NULL
);


ALTER TABLE staging.reminders OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE staging.users (
    id uuid DEFAULT staging.uuid_generate_v4() NOT NULL,
    username character varying NOT NULL,
    email character varying NOT NULL,
    password character varying NOT NULL,
    role staging.users_role_enum DEFAULT 'executive'::staging.users_role_enum NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "profileImageUrl" character varying,
    reset_password_token character varying,
    reset_password_expires timestamp without time zone
);


ALTER TABLE staging.users OWNER TO postgres;

--
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.activities
INSERT INTO staging.activities (id, date, activity, "opportunityId", "userId", "activityType", "clientId", flaghistory) VALUES
  ('6dbcb5c3-7de8-46d3-a395-22d096737adf', '2025-10-14 12:50:00', 'Se envió propuesta de Bolsa de Horas ', '7c3019f6-3725-451b-af89-570aa989d1f9', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Correo', NULL, NULL),
  ('ca636163-10ca-4e44-8a27-342468dc423e', '2025-10-16 12:54:00', 'Se envió propuesta de servicio de CC ', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Correo', NULL, NULL),
  ('5dbc175c-4db1-4ae2-bca1-81121ffb8806', '2025-10-16 13:04:00', 'Se envió propuesta por correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('783c2f57-71c6-48fe-9383-15f20b6abd9a', '2025-10-16 13:19:00', 'Seguimiento sin respuesta', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('6bfbd356-3554-4c54-a89b-ec96347832c6', '2025-10-14 13:23:00', 'Correo de seguimiento sin respuesta', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('73fc7319-0b6f-47f1-bce5-829a655b9c8d', '2025-10-16 13:23:00', 'Correo de seguimiento para agendar sesión con equipo técnico', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('63226fcf-9780-44f7-b042-a1f74f50f2a3', '2025-10-16 13:28:00', 'Seguimiento para agendar una nueva sesión', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('dd9515da-77c9-4c35-9d3e-6519cae171a8', '2025-10-13 13:31:00', 'Envío de invitaciones al Brunch de Tijuana', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('46219385-b2c9-4cd9-be67-71a55b2e2e18', '2025-10-16 15:35:00', 'Seguimiento para alinear propósitos de POC', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('686d587f-bacb-45c3-8bfb-2924b41c9955', '2025-10-17 10:02:00', 'Envíe Propuesta de CC', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Correo', NULL, NULL),
  ('1e1e2f0f-5de1-45c0-baae-ab330f00bfb0', '2025-10-16 17:00:00', 'Sesión para platicar sobre el CC', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Presentación Servicios En Línea', NULL, NULL),
  ('fa5218a9-1a1d-4fbd-8ac2-91040d813eea', '2025-10-16 10:15:00', 'Envíe correo de seguimiento ', 'fdff99c1-d090-4725-83c8-bc049faec948', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Correo', NULL, NULL),
  ('4fe109bd-415e-4ca1-aedb-1bda14166e97', '2025-10-16 15:38:00', 'Se envió correo de primer contacto a Manuel de INTERCERAMIC', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('4400c7eb-aa7a-489e-a964-5f5e7b6715af', '2025-10-17 15:42:00', 'Primer contacto por LinkedIn con Daniel Romero de Grupo BAFAR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('b05895a2-73cd-4e11-a238-6bab3be399f0', '2025-10-17 09:41:00', 'Envío de primer correo de contacto a César Pérez de SUKARNE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('e5d69a1b-605f-4663-9ebf-b833a10a5a1d', '2025-10-17 09:40:00', 'Envío de primer correo de contacto a Luis Fernando de LA COSTEÑA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('ba336d39-d3c2-4bbf-8b56-7297f352bb59', '2025-10-17 15:44:00', 'Envío de primer correo de contacto a Jesús de ABITAT CONSTRUCTION SOLUTIONS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('0ca1b971-a816-4321-8a20-801a80a38d6c', '2025-10-17 15:46:00', 'Envío de primer correo a Christian A de ABITAT CONSTRUCTION SOLUTIONS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('c803aacd-5069-47c4-afd3-5193a8842520', '2025-10-20 10:55:00', 'Envié CC actualizado', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Correo', NULL, NULL),
  ('d2b5b6f5-37f4-431b-b7a0-dbe3605701d3', '2025-10-23 13:55:00', 'Enviar un correo de los beneficios de las siguientes soluciones que le duelen', 'da170cae-3a57-421f-9b3c-923f70c7303e', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('550511cb-3686-45b4-9a4e-cf99bac4c6d4', '2025-10-20 17:04:00', 'Seguimiento para resolver dudas de la propuesta y agendar sesión', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('4248b1b2-0f7f-43c8-bf94-2941e3b9f194', '2025-10-20 17:19:00', 'Invitaciones para desayuno Tijuana. 1 confirmado', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('b91e5c46-64fb-41ca-aca5-09f00568f851', '2025-10-21 16:55:00', 'Se envió invitación a Tech Brunch Tijuana FOXCONN', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('9e9da42a-9377-46ea-8e99-162ab006b9e7', '2025-10-21 16:56:00', 'Se envió invitación a Tech Brunch Tijuana COCA COLA-CDF', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('35480392-573e-4ff0-8bce-d6f44a2f6a0c', '2025-10-21 16:57:00', 'Se envió invitación a Tech Brunch Tijuana ALUMINUM SOLUTIONS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('5530f8d4-0549-413c-a93c-86cd3a8dbd7a', '2025-10-22 17:02:00', 'Envío de primer correo a SAAVI ENERGIA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('837c9c22-adf2-4582-bdd1-6c48eda50e5b', '2025-10-22 17:02:00', 'Envío de primer correo a SIST PORTUARIO ENSENADA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('1fc91bc6-10a6-42ab-934d-29cb346fd78f', '2025-10-22 17:03:00', 'Envío de primer correo a PRYSMIAN GRROUP', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('d9612067-f8c6-49d3-bd7c-01ce7bf8d20f', '2025-10-22 17:03:00', 'Envío de primer correo a Jhaziel de GRUPO GINEZ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('5b4a1178-5e39-471a-a76d-dd370a0b347f', '2025-10-22 17:04:00', 'Envío de primer correo a Erick de DULCES DE LA ROSA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('9d23650c-f9aa-40e1-8470-1e73dbb44fa3', '2025-10-22 17:05:00', 'Envío de primer correo a Javier de MEDICA SUR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('ca893b64-dc38-4866-b71c-1a0116833880', '2025-10-22 17:05:00', 'Envío de primer correo a Yuri de MIELE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('d4d58997-84ef-44b9-ae86-64b70a8c63b0', '2025-10-22 17:06:00', 'Envío de primer correo a Aldo de SCHNELLECKE LOGISTICS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('e89a9234-9b85-41ac-b529-40181230a4f1', '2025-10-23 12:36:00', 'Envío de primer correo a Benny Castañeda de ARCELOR MITTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('bc998c97-2fc2-42d9-a9d3-a3c23060b05f', '2025-10-23 14:00:00', 'Expo Technology', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Evento', NULL, NULL),
  ('a66994f0-657a-4640-a8b3-f919074bc8ba', '2025-10-24 10:39:00', 'Envío de invitación a TECH BRUNCH CDMX a ERIC de DAIMLER TRUCK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a9fe2e4d-9321-44a6-ae2f-c291823e5319', '2025-10-24 09:16:00', 'Nueva propuesta enviada con modificaciones', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('b35eb0f7-8ece-4271-9d7e-ef8fcd66f5b8', '2025-10-24 11:18:00', 'Envío de 3 brochures de servicios a contactos de la ExpoTech', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('402f7616-03d2-4a61-b596-1e9837b4c696', '2025-10-20 03:52:00', 'Se contacta a Hector Ceniceros de IPEC vía LinkedIn', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('b31eda08-3079-4109-9d71-cd856782693b', '2025-10-24 14:43:00', 'Enviar Minuta de la reunión', '6182781a-4f62-4970-8e4b-91e1999a52a4', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('2c508671-779c-4a90-aa14-b535d88519e9', '2025-10-27 15:48:00', 'Intento de contacto para programar una sesión, sin respuesta', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('f09504fd-32f3-42e5-b1e7-15879913fe47', '2025-10-28 12:48:00', 'Invitación al evento CDMX', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('738a2358-6e9f-4c4d-a03f-80653e9ac385', '2025-10-28 12:52:00', 'Se envío invitacion del evento CDMX', '6182781a-4f62-4970-8e4b-91e1999a52a4', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('e2d882e9-af75-4b9b-8914-0ff2852563d9', '2025-10-28 16:16:00', 'Seguimiento Grupo GINEZ contemplar hasta 2026', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('031f9625-6dc9-47f5-9f7b-a81939604244', '2025-10-28 16:17:00', 'Seguimiento DULCES DE LA ROSA contemplar hasta 2026', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('3e14ca11-3c4f-4ad7-80d8-457b958683e3', '2025-10-28 16:17:00', 'Primer contacto con GERDAU CORSA ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('135b7d55-6a10-42af-b3a6-447cb3871aa2', '2025-10-28 16:18:00', 'Primer contacto con CLASE AZUL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('62c778cd-8b6a-42e4-b4f5-2ba7f6d330f1', '2025-10-28 16:18:00', 'Seguimiento a ARCELOR MITTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('4a42afc8-ab9e-4206-9c78-65462ffb9d62', '2025-10-28 16:25:00', 'Primer contacto con RH de GRUPO BACHOCO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('2a0507e9-3a46-4ecc-a910-3a328e75c15e', '2025-10-29 12:01:00', 'Invitación al evento CDMX', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('75e0cf33-6321-4394-8995-5e27fc72bb48', '2025-10-29 12:14:00', 'Invitación al evento CDMX', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('c1c19183-1c89-4927-8b7f-8e75f4d916d5', '2025-10-29 12:17:00', 'Invitación al evento CDMX', '3758043d-a008-4131-b247-68e19f6abc40', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('74ff6a49-a017-4f9f-ba2e-18f450bf842d', '2025-10-29 12:31:00', 'Invitación al evento CDMX /Grupo GIGANTE/Sandra Arrollo/searroyo@gigante.com.mx', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('806c9573-9ba8-4098-a5dd-4766e1bc2cc3', '2025-10-29 12:35:00', 'Invitación al evento CDMX/fernando.dominguez@vertiche.com.mx/VERTICHE', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('23877565-151a-43e3-9062-6d1fea69b2fc', '2025-10-29 12:36:00', 'Invitación al evento CDMX/raul.benitez@nrfm.com.mx/NRFinanceMexico', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('b5c3048a-9cf5-4aed-8009-8e096671102f', '2025-10-29 12:38:00', 'Invitación al evento CDMX/jgazca@medix.com.mx/JesúsGarza/MEDIX', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('7e296fba-5031-4883-8d52-99d2d101a155', '2025-10-29 12:40:00', 'Invitación al evento CDMX/david.diazrivera@edenred.com/DavidDiaz/EDENRED', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('3c77e158-dae1-4727-b6f9-2eaa31f3277e', '2025-10-29 12:42:00', 'Invitación al evento CDMX/jgomez@fujifilm.com.mx/JesúsGarduño/FUJIFILMS', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('93641d63-8b83-4928-8c53-ee9b9391adee', '2025-10-29 12:44:00', 'Invitación al evento CDMX/dponce@saljamex.com/SalchichasJamonesMex', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('98bdc7fb-65e3-4e0a-b397-aa25f5fdf338', '2025-10-29 17:27:00', 'Envío de 55 Invitaciones a Tech Brunch CDMX', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('a643b2dd-aed7-4388-8fee-7d970bec9300', '2025-10-30 09:51:00', 'Invitación al evento CDMX/GuillermoLeon/GrupoBIA', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('9230ce94-acef-460b-bfd8-9e52297aa004', '2025-10-30 16:33:00', 'Envío de Brochure a CIO de GRUPO BACHOCO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('467fbcea-4aa0-4a00-9715-8749de0e39b5', '2025-10-30 16:34:00', 'Envío de Brochure a Head of IT de GRUPO BACHOCO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('19a53d35-c49e-43dd-a238-cb9e546430af', '2025-10-30 16:35:00', 'Envío de Brochure a IT Corporate Manager de GRUMA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('efca8800-c21c-485d-9d93-af67770c96d3', '2025-10-30 16:37:00', 'Envío de Brochure a IT Manager de GRUPO LALA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('cbfaadb4-a8d8-4295-98ac-65e00796917e', '2025-10-30 16:40:00', 'Invitación a TECH BRUNCH a CFO de CONSTELLATION BRANDS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('1ec659c4-1f6f-445b-8630-a5a420bd3a86', '2025-10-30 16:40:00', 'Invitación a TECH BRUNCH a Financial Planning de TERZA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('6452948e-ad36-46b7-b078-2748d6b5587c', '2025-10-30 16:47:00', 'Se envió correo de primer contacto a Gte de Logística de ALSUPER CUU', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('14a62149-9ce0-4e18-9132-5b16d49d7f92', '2025-10-30 10:44:00', 'Envío de Brochure a IT PROJECT MANAGER de FOXCONN Juarez', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('35f87a2e-cc1b-47d3-a4de-2cb4a596ac42', '2025-10-30 16:49:00', 'Envío de Brochure a Coordinador Infraestructura de FOXCONN Juarez', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('945f3ad9-29c6-4515-a725-da825fb8fe34', '2025-10-30 17:27:00', '87 invitaciones enviadas para el brunch de CDMX', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('b53707fb-e0f8-4dd1-bed4-b179845dd5c0', '2025-10-30 17:48:00', 'Seguimiento si ya tienen perfiles que mencionaban y quedaron de enviar', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('0fdc1800-9d2b-4d6a-aece-e0cbd465e676', '2025-10-31 10:49:00', 'Richi esta preaprando una presentación para Tibs Venta(Portal de Recep facturas)', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Evento', NULL, NULL),
  ('b719f784-2c9b-41a9-ac5b-65b789ec65ce', '2025-10-31 11:08:00', 'Seguimiento para agendar una próxima sesión', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('5a98c2cc-d964-45ac-83ed-c8452335c08e', '2025-10-31 11:48:00', 'Invitación al evento CDMX/PalaceResorts/WilbertMay', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('474429d0-c262-4926-ba2e-f9d77006577d', '2025-10-31 11:50:00', 'Invitación al evento CDMX/ZobeleMexico/AndreaMeléndez', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('9cd3c446-c5d3-4bbd-9d0c-216c90e4f2ed', '2025-11-03 17:42:00', 'Envío de invitaciones para Tech-Brunch y espera de conexiones por Linkedin', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('c3e80a02-d8fe-400f-b501-1368f7777f5f', '2025-11-04 10:19:00', 'Seguimiento ', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('6c624ddf-d867-476e-bb69-bce44e97a907', '2025-11-06 11:46:00', 'Primer contacto con RH de ABENGOA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('62b154f2-9a9b-4857-b76e-4999de6f9594', '2025-11-06 11:47:00', 'Primer contacto con RH de AMAZON MEXICO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('ab044c11-0d65-4746-9a9b-1d8bd491a4fe', '2025-11-06 11:48:00', 'Primer contacto con RH de ANAYAKA TI', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('047477a7-79d1-4847-8a19-f64c3f477316', '2025-11-06 11:48:00', 'Primer contacto con RH de AXA SEGUROS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('4c7efc99-dee6-4d8d-956c-80a579b6f72d', '2025-11-06 11:49:00', 'Primer contacto con RH de BAXTER', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('8232f314-b669-469c-a2a0-92e2b790cb30', '2025-11-06 11:49:00', 'Primer contacto con RH de BBVA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('3a90d23f-5416-4d2b-ac93-ec0bf28ab1a4', '2025-11-06 11:49:00', 'Primer contacto con RH de CEMENTOS CRUZ AZUL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('ece6e97e-f210-4c82-bdb9-015596f9d768', '2025-11-06 11:49:00', 'Primer contacto con RH de CEMENTOS MOCTEZUMA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('71740a06-5af1-486d-8e79-260979ff09a8', '2025-11-06 11:49:00', 'Primer contacto con RH de GENERAL MOTORS MEXICO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('46a54587-e0d7-467f-8fdf-cd3413049e3f', '2025-11-06 11:49:00', 'Primer contacto con RH de GRUPO GIGANTE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a7834d9e-6cf5-4898-b668-b3c35862281d', '2025-11-06 11:49:00', 'Primer contacto con RH de HIDROSINA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('30449344-0a4f-41e8-9bb8-7ac055b7c609', '2025-11-06 11:50:00', 'Primer contacto con RH de JABIL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('47a1c7f7-9938-460f-bb29-457f17934784', '2025-11-06 11:50:00', 'Primer contacto con RH de JUGOS DEL VALLE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('866f8317-6a38-464a-b4d8-6b9b8ea47c35', '2025-11-06 11:50:00', 'Primer contacto con RH de LOREAL MEXICO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('008c7343-d0b0-4185-868f-7743b9e8e9f7', '2025-11-06 17:47:00', 'Envío de Brochure a Gerente Operaciones de FORZA STEEL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('6b8bcc46-bc2f-422f-8906-55ddb89e064a', '2025-11-06 17:48:00', 'Envío de Brochure a  Director de Operaciones de TUBACERO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('b810b2a6-9ffc-4e66-a5ae-e18cc1834616', '2025-11-06 17:48:00', 'Envío de Brochure a  Gerente de Operaciones de VILLACERO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('06056046-5533-42af-8ea1-5957a9b78d43', '2025-11-06 17:48:00', 'Envío de Brochure a  Director de Operaciones de HOMEX', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('7b0e4e3e-8473-4c72-ba73-b2d2a46cb90d', '2025-11-06 17:48:00', 'Envío de Brochure a  Gerente de Operaciones de URBI', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('18fbc631-eefe-4644-9be6-95f11294c0c5', '2025-11-06 17:48:00', 'Envío de Brochure a  Director Operaciones y logística de NEBUCOR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('24f9ddc4-5564-488b-9b73-91fd30d4e283', '2025-11-06 17:48:00', 'Envío de Brochure a  Jefe de Operaciones Logísticas de ARCA CONTINENTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('361aedd5-2710-4901-8a1d-1da13b1dcfb4', '2025-11-06 17:49:00', 'Envío de Brochure a  Gerente de operaciones de GEPP', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a446277b-c682-4513-9902-b4779cec2745', '2025-11-06 17:49:00', 'Envío de Brochure a  Director Operaciones  de GRUPO PROMAX', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('c7817520-c4cd-498a-ac3f-971358fe91eb', '2025-11-06 17:49:00', 'Envío de Brochure a  Director Operaciones  de NAVISTAR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('48d496ab-dd14-4adb-a6b2-ddcc87868035', '2025-11-06 17:49:00', 'Envío de Brochure a  Director nacional de ventas y operaciones  de BAFAR ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('982a2873-ac6c-4dac-bdee-7411a4d87286', '2025-11-06 17:49:00', 'Envío de Brochure a Gerente Regional Noreste  de BAFAR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('c83716ab-676a-4fee-8d8c-0fcf4c05aeaa', '2025-11-07 15:04:00', 'Envío Invitación evento CDMX/Grupo Diagnostico PROA', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('ccd1d93d-2e0d-4d4c-a158-5c308ff9c6ab', '2025-11-07 15:05:00', 'Envío Invitación Evento CDMX / Sanchez y Martín', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('93fa14a2-5404-44fe-9633-27786429c582', '2025-11-07 15:05:00', 'Envío Invitación Evento CDMX / Grupo Sánchez', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('05ee14b7-8f2a-49c1-a30e-60b8cf17d2c7', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / Hyundai', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('d6782ee9-621b-4454-b9f4-2e39647c9869', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / Grupo AUDACE', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('7f73646c-9d89-4f8e-b785-48cc9a189533', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / PARAMOUNT BED MEXICO', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('5023bd8f-ba2d-4a3d-bd54-47abef7cf025', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / RECKITT BENCKISER MEXICO SA DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('bd5c0c5c-db9e-4ac4-80b5-09bdb00bcc0f', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / VENGLO INMOBILIARIA SA DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('483df605-2192-4e6b-85c2-a13d42a2b4a3', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / SINBIOTIK INTERNACIONAL S.A. DE C.V. ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('0164b65c-2d5c-425a-a9b3-d12258ca13c7', '2025-11-07 15:08:00', 'Envío Invitación Evento CDMX / SULZER PUMPS MEXICO S A DE C V ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('973aedee-3ccd-4878-8913-33e2be7ffe44', '2025-11-07 15:08:00', 'Envío Invitación Evento CDMX / SULZER CHEMTECH S DE RL DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('478ef3a7-ef1d-484b-ac88-a99701b75935', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / INDUX SA DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('1e4ea176-8517-47a5-91bf-c9086289efe8', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / SOY SANO SA DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('bdcb17c9-8a56-4b5c-9608-ae38c4e0621d', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / CHEP MEXICO SA DE CV ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('46066846-e2da-4455-ba83-825171e2cf3f', '2025-11-07 15:10:00', 'Se recibieron los documentos del cliente para crear los Pompts', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('bb9f00f2-ab37-4033-9f65-91d495926635', '2025-11-10 15:41:00', 'Seguimiento LA COSTEÑA ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('4be9e7ff-e654-4e65-a6b3-d198d4362b76', '2025-11-10 16:00:00', 'Seguimiento INTERCERAMIC', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('b3368d95-23f8-4aa9-bebc-225aeef779d6', '2025-11-10 16:00:00', 'Seguimiento SUKARNE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('f3fb73e6-bf61-43ad-805d-87f350f895a0', '2025-11-10 16:47:00', 'seguimiento a ABITAT', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('25cc7a45-4ef9-46a6-94f6-72baf6dfddb2', '2025-11-11 15:19:00', 'Seguimiento para ajustes de propuesta de servicio', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('05538c90-5102-44e8-9122-934946f8b8dd', '2025-11-12 10:58:00', 'Seguimiento para servicio de evaluaciones ', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('bd5d2525-ae49-4ebc-ad3c-e9996f9a22e7', '2025-11-13 15:46:00', 'Enviada propuesta agregando estimado de MVP', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('7a5c63ac-718c-40c9-9c6b-98bf12025023', '2025-11-13 15:47:00', 'Mensajes por Linkedin para presentación de servicios (8 empresas)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('1f1f5b7f-b487-4e9a-9301-49a17a4b1b12', '2025-11-14 09:33:00', 'Envío de Propuesta de Servicios', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('61563a0e-4ddf-42ee-8123-3d3f69391887', '2025-11-14 11:20:00', 'Seguimiento ARCELORMITTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('5a58ea5d-7153-4524-afed-f1e8b23129dc', '2025-11-14 11:23:00', 'Seguimiento GERDAU CORSA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('2e472792-c845-4dfa-8f8f-a37451fc8502', '2025-11-14 11:23:00', 'Seguimiento REGIOPYTSA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('204a9377-6c5d-44c7-8a36-f8797c02939d', '2025-11-14 11:23:00', 'Seguimiento CORPORACIÓN MOCTEZUMA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('64559d30-cd92-4542-b145-37d5cba94e15', '2025-11-14 11:24:00', 'Seguimiento NEMAK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('9341a5d7-7bf0-42db-b67a-45124bfad24b', '2025-11-14 11:24:00', 'Seguimiento GRUPO CALIDRA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('5dcd7256-7e4f-4ee9-b74a-56f1feaf5274', '2025-11-14 11:24:00', 'Seguimiento GRUPO LA MODERNA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('d33cdc81-4a22-4b64-837e-544f4a5ba1fd', '2025-11-14 11:24:00', 'Seguimiento GRUMA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('65e4d51e-7066-4b47-bbfe-0dc47936fe83', '2025-11-14 11:24:00', 'Seguimiento GRUPO HERDEZ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('9c9513ae-c8ca-4f7a-a58b-d24eb3dd4c31', '2025-11-14 11:24:00', 'Seguimiento METALSA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('478d7c59-035f-43ff-9f45-3884848c4bd5', '2025-11-14 11:25:00', 'Seguimiento NEMAK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a823d2ea-ed4c-4d84-8f8a-6350b24fe5bd', '2025-11-14 12:15:00', 'Presentación de servicios al Head of Finance', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', NULL, NULL),
  ('05cd4b83-24d9-405d-bdb9-ffdf795e9afe', '2025-11-18 10:22:00', 'Seguimiento para Propuesta de Servicio', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('6a0fdf23-67e1-4216-8456-bfb31955de94', '2025-11-13 17:24:00', 'Seguimiento sin respuesta', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('d02ba481-1574-4db7-b01d-c8444d9c6e45', '2025-10-16 10:06:00', 'Envíe correo de seguimiento ', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('057bcd59-99db-47d7-9015-bc1397a63729', '2025-10-15 12:45:00', 'Envío de propuesta sin alcance extendido. ', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('664f23c9-7d55-49a9-bdf2-325caec03395', '2025-10-16 06:46:00', 'Sesión para extension de proyecto con Pablo ', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('2dd98f3a-f9d7-4043-b6e6-61006f9446c1', '2025-10-14 12:50:00', 'Se presentó roadmap y se determino nuevo alcance acotado', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('c8343c5f-99b4-44e0-9767-384bcf526bf2', '2025-10-16 12:51:00', 'Se busca reemplazar factura de CuboMinería con la BDH ', '7c3019f6-3725-451b-af89-570aa989d1f9', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('9b27101e-eaf2-454a-9cee-a158a534281c', '2025-10-16 12:52:00', 'Se buscará implementar una POC para determinar servicio e implementación', '53bd52ac-e889-4f97-901d-dcac8c6eb3f3', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('aa496c7a-a89e-4fb6-9985-85475089d37d', '2025-10-13 12:54:00', 'Se tuvo sesión para revisar BUGS detectados y determinar CC ', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('206d5b60-bd7c-4840-bbd5-10a3e91c4d04', '2025-10-13 12:54:00', 'Se tuvo sesión para revisar BUGS detectados y determinar CC ', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('5b36e953-7967-466b-bb8e-67d0d3ac0e44', '2025-10-09 12:55:00', 'Se presento Propuesta de Servicio con TI, Compras y Negocio. ', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('7a7ce655-ac84-4fb0-b913-40429bb2ee3e', '2025-10-16 12:56:00', 'Se solicito fecha de resolución, buscara que sea a finales de oct. ', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('47cd55c7-e0e9-4630-a7ad-e8f220b97863', '2025-10-14 12:57:00', 'Se ha buscado por correo, Linkedin y no hay respuesta', 'de986524-e4b8-4a95-a49f-d193185bed05', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('ce51aa96-6bf7-4b71-a076-18ee554247dc', '2025-10-16 11:00:00', 'Reunión con avalia para profundizar en sus necesidades', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('ca99d87d-88a7-4f5b-97e4-bdbff19e8526', '2025-10-14 17:59:00', 'Llamada: Luis no ha recibido confirmación por parte de su dir de oper para demo', 'c621b04c-5fa5-41f6-b19b-e01a3de3882a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('d669a375-4a6a-4514-9f4e-e00037094660', '2025-10-14 18:03:00', 'Se solicito una reunión para levantamiento Portal de Fact.', 'd30069d6-655b-4460-8375-f7cf2b561806', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('ca76fa7b-ee6a-4a3e-82bb-db831ccf41c8', '2025-10-14 09:12:00', 'Se pregunto al equipo técnico de Tibs si tenian + dudas. su repusta fue NO', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('51d0fe73-2453-410d-b2d7-04a8f25eacb1', '2025-10-14 16:16:00', 'Sky ANgel nos solicito el alcance técnico', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('5e9ce188-21ec-4a4c-a931-75a312824364', '2025-10-14 23:17:00', 'Esta en negociación la aprobación entre Sky Angel y Walmart', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('19bbef78-f813-42ed-abdc-c59b235c761c', '2025-10-13 17:21:00', 'El clinte comento que esta concluyendo un proceso de desición interno.', '3758043d-a008-4131-b247-68e19f6abc40', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('38d94e76-c4a5-485f-a72c-df6048b48b8a', '2025-10-16 18:31:00', 'Se envío mensaje con otro enfoque.', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('c3e3ddb5-3986-43e8-aa39-ad32831340eb', '2025-10-17 10:13:00', 'Hable con Juan Carlos para preguntarle al respecto', '2c5bc58c-a953-4c94-8bb1-2fc0e96d048e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('4c11e12e-b10e-44be-b6b9-8f2d63cef749', '2025-10-20 11:25:00', 'Richard confirmo que el miercoles 22 de Oct envía la propuesta.', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('a44b3d9b-22de-4301-a542-dc719ac7ff01', '2025-10-21 17:34:00', 'Seguimiento para información adicional para Prueba de Concepto', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('97ee581c-bf8d-48a3-802d-ccbae684d170', '2025-10-22 13:32:00', 'Contacto con área de compras por correo, sin respuesta', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('fa9bef12-516c-4038-9f0e-9bfd2fa2bfc5', '2025-10-22 13:33:00', 'Correo para concretar una sesión con equipo técnico, sin respuesta', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('5df38379-a5ca-4cdc-a286-1d818c31af88', '2025-10-22 17:00:00', 'Sesión para resolver dudas de la propuesta de servicio', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('86342e09-9b46-4618-ac2b-98fb49a43d39', '2025-10-23 12:35:00', 'Llamada a Hector Ceniceros de IPEC', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('6a5a8a6d-5610-4181-a087-eedbab19e25e', '2025-10-27 17:28:00', 'Correo de seguimiento de la propuesta de servicio', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('3c8ef47e-5acc-42e4-a5cb-5b64d4af65a2', '2025-11-17 15:47:00', 'Solicitar DEMO Planning Analytics + IA a Synnex', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('00b773cc-1d79-49e4-bc78-b7bfa1dfd055', '2025-10-28 10:42:00', 'Sesión agendada para el viernes con equipo técnico', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('92f37035-c283-46b3-af8c-467cc2d5cad4', '2025-10-29 09:21:00', 'Sesión POC agendada para la próxima semana', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('23d7c7eb-3698-4731-a908-0f445dec4a70', '2025-10-31 10:47:00', 'Se reviso la Propuesta con Ariel y su equipo técnico', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('74a35b51-4074-4fef-b066-718d7b6d1da4', '2025-10-31 10:48:00', 'Se hablo con Juan Manuel, no tuvieron tiempo de atendernos esta semana ', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('a42fcf81-912c-4ff8-bed0-546256dd23ac', '2025-10-31 10:58:00', 'Sesión con equipo técnico para evaluar automatizaciones', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('3e50d65a-69d9-4968-b3dc-f185df07ffe4', '2025-10-30 11:32:00', 'Envíe mensaje via Wpp de seguimiento ', '9faffa11-f57b-46e3-a886-8ab1082d0ee5', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('51b5316d-2507-403d-b9e1-2ef7bda2e021', '2025-10-31 12:01:00', 'El viernes 31 de oct enviara los 20 ejemplos para elñ Prompt', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('e14fb585-135b-42da-99af-f464cfbde946', '2025-11-04 10:19:00', 'Correo preguntando si ya tomaron una decisión o tienen update', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('bc371b77-9f86-494b-b03f-0828fdef7570', '2025-11-05 17:14:00', 'Resolución de dudas y negociación basado en propuesta de servicio', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('4a452ece-5f38-4781-b474-31eba036319d', '2025-11-06 09:53:00', 'Presentación prueba de concepto', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('61b43e83-661d-4914-b85d-46bb392da645', '2025-11-07 15:13:00', 'Se reviso propuesta y surgieron mas necesidades', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('b48ddb91-df0d-4f09-a609-9644b4a41096', '2025-11-07 15:14:00', 'Llamada con Ariel - Sigue en Stand by la decisión', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('cc9679be-c242-4619-ad92-f1a46e34d2eb', '2025-11-07 15:15:00', 'Contacte al cliente final (Fernando-ONE) para revisar Propuesta. Él nos informa', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('7fc59d07-c780-42c8-b5cd-376100f3a0f2', '2025-11-14 09:47:00', 'Envíe mensaje via Wpp de seguimiento ', '1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('8c1a98af-0429-4211-b9a0-08a52f45e748', '2025-11-07 15:17:00', 'Se pregunto al cliente y él comento que están evaluando el requerimiento', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('4f813feb-1d86-4006-a847-9e177e3e97de', '2025-11-10 12:11:00', 'Envíe correo de seguimiento ', '4ff9968a-7bd8-49bf-853b-225144c2676e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('b0e1e477-1120-4561-9f24-124c27666871', '2025-11-10 17:30:00', 'Correo preguntando si hay alguna novedad', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('0487bc2d-b78e-4c67-929c-b36df93392b1', '2025-11-10 17:52:00', 'Programada sesión de presentación de demos para el viernes', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('3cb1de62-cc72-4735-a511-cde7d404d080', '2025-11-11 11:36:00', 'Contacto con Adrián, ya no está Pedro, pedir update', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('691c6e6d-ae8c-4231-bfee-c3fa195d1c6c', '2025-11-11 11:38:00', 'Mensaje a Candi y a Sergio para update con dirección', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('5d339107-dabb-4c0c-9761-5475bf786eb6', '2025-11-12 09:46:00', 'Comunicación con Sergio y Candi sin respuesta', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('097f0cfd-077b-4a75-8852-76ffcacaa0b1', '2025-11-12 15:56:00', 'Darle seguimiento para que el cliente envíe un par de documentos para la DEMO', '9642b008-e953-4fb1-8754-76e10e849bc7', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('6adf04c1-0474-42d2-8c47-e8e9e6c048c9', '2025-11-13 13:19:00', 'Viernes o Lunes Próximo enviara la definición de JSON para completar las pruebas', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('19436cd2-4916-4afa-81c3-891721013198', '2025-11-13 15:46:00', 'Llamadas y mensajes a Candi y Sergio sin respuesta', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('5da0f027-9b5c-480c-bdc2-8de215e9e173', '2025-11-14 09:48:00', 'Envíe correo de seguimiento ', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('2e880774-6c8d-43d9-be44-4607e6703423', '2025-11-18 09:41:00', 'Reunión Interna acordar la DEMO - Ivonne enviara la facha y hora', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('8ab97647-4826-47e8-b381-3158d62fb0bb', '2025-11-18 12:22:00', 'Seguimiento sin respuesta', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('bf6fa801-9b83-47ac-8673-ebe400cdf934', '2025-11-26 11:04:00', 'Pedí detalles de vacante a Martin por correo', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('0cb8eb80-912c-4e14-990a-823e51674d4d', '2025-11-25 11:28:00', 'Seguimiento ARCELORMITTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a4bcde3b-93c0-4aca-bb35-87f356316b36', '2025-11-19 10:22:00', 'Sesión con Paola y comunicación con cliente para seguimiento', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('b2cb7e1a-951a-47b5-b21a-9cdf985cf213', '2025-11-19 17:00:00', 'Sesión con Abel para ver detalles técnicos', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('1aebe229-b966-42d2-a2a1-5dcbdf0cb1cf', '2025-11-20 09:32:00', 'Seguimiento para programar sesión para hablar de la propuesta', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('bcb20de5-0406-4191-8301-390452a11ed5', '2025-11-20 13:51:00', 'Resultados de evaluaciones enviadas y facturas', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('1a930da3-5e3a-47b7-99ae-c9f215f81834', '2025-11-20 15:44:00', 'Presentación de servicios TECPETROL para Bolsa de Horas | Power Automate', '124615c1-b567-4542-b94e-0fdbf997f56e', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', NULL, NULL),
  ('06cf2bf6-172d-4697-b3ec-2ee2b15ffc34', '2025-11-21 11:16:00', 'Envío de Brochure a  ESTRUBLOCK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('9310b296-b4f6-4246-bed2-da38c394988f', '2025-11-21 11:16:00', 'Envío de Brochure a  INTERCERAMIC', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('cedf4630-f4dd-4bf7-acef-ad1e6915ba32', '2025-11-21 11:17:00', 'Envío de Brochure a QUALA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('1fc72a1d-e537-4910-988a-f8e0445a0abc', '2025-11-21 11:17:00', 'Envío de Brochure a  HEINEKEN MÉXICO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('5482c56f-6a9c-4e4e-baf3-cb0cef456ae7', '2025-11-21 11:17:00', 'Envío de Brochure a GRUPO MODELO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('66df64ee-797c-4fae-b514-75d493a30744', '2025-11-21 11:17:00', 'Envío de Brochure a GRUPO PECUARIO SAN ANTONIO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a5376b21-93ed-49fa-8359-975bd55d731b', '2025-11-21 11:17:00', 'Envío de Brochure a CONDUMEX', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('317a203c-2d72-40f3-b2b1-98bc08677fbe', '2025-11-21 11:17:00', 'Envío de Brochure a HARMAN DE MEXICO S. DE R.L. DE C.V.', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('066edfd3-ab07-4be5-b5d2-bf2f7b25dc6f', '2025-11-21 11:18:00', 'Envío de Brochure a HISENSE MEXICO', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('1d65c441-012e-4482-8137-50548cf5347b', '2025-11-21 11:18:00', 'Se llamó a Coordinadora importación de FOXCONN BAJA CALIFORNIA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('f70cb6ae-2769-458f-8eef-863a83f695a5', '2025-11-21 11:19:00', 'Se agendó reunión con GERENTE ZONA NTE de GRUPO BAFAR', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('7a9feeb2-3a80-4f40-b25a-21217a0fe851', '2025-11-21 11:23:00', 'Seguimiento a GRUPO FRISA, pendiente confirmar reunión', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('2ec30d47-1852-4337-9588-7ee70f5a4d95', '2025-11-21 11:55:00', 'Solicitar documentos la siguiente semana que llegue de viaje', '9642b008-e953-4fb1-8754-76e10e849bc7', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Llamada', NULL, NULL),
  ('4f6d22d1-4bf8-4e97-8b73-91024c6124b4', '2025-11-21 11:56:00', 'Se busco en la semana pero no he recibido los JSON y tampoco he podido platicar ', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Llamada', NULL, NULL),
  ('f799b482-81c1-46df-887b-a9b9969ddb9d', '2025-11-21 12:00:00', 'Comenta el cliente que en dic recabara información de las demás áreas. ', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Correo', NULL, NULL),
  ('89a350a2-63ee-48ef-9cb7-60597e70024f', '2025-11-22 10:40:00', 'Se tuvo reunión con área de LOGÍSTICA de BAFAR, se continuará el 15 de Enero', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', NULL, NULL),
  ('94231e62-cfd0-4a23-819e-efdae1e67957', '2025-11-24 11:48:00', 'Comunicación con Alberto, se retoma segunda semana de diciembre', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('391a452b-527c-4797-9691-09240aa1bc0f', '2025-11-24 15:36:00', 'Seguimiento para reunión con GRUPO FRISA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, NULL),
  ('feca3500-8df1-4fd6-9145-1a8db7daed0c', '2025-11-25 11:04:00', 'Correo a Adrián si hay novedad de propuesta y opción de visitar sus oficinas', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('d4cde7c1-70e7-46d4-a8c5-9fcf02ab0416', '2025-11-22 12:31:00', 'Se tuvo presentación de DEMO 22/Nov y se dará continuidad el 15/Enero ', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', NULL, NULL),
  ('f46fe26c-1341-40d1-a639-afed61c9c74e', '2025-11-25 11:29:00', 'Seguimiento GERDAU CORSA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('945492a2-ad41-4210-8012-aeb067a14543', '2025-11-25 11:29:00', 'Seguimiento GRUPO HERDEZ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('afa3afad-3be7-458e-8d0f-d14bb97af1fe', '2025-11-26 11:30:00', 'Seguimiento ACERO VS', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('fd8b4e4b-49d1-47dc-93b6-4ab30838e6a5', '2025-11-26 12:14:00', 'Seguimiento CORPORACIÓN MOCTEZUMA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('a27c8239-8567-4584-a56f-fb29e98470fc', '2025-11-26 12:18:00', 'Seguimiento NEMAK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('63bf43da-6ac4-44ef-83c1-41afa3e72e8c', '2025-11-26 12:20:00', 'Seguimiento SUKARNE', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('e487a6ff-dd11-4e9f-ba08-72454ed12b9f', '2025-11-26 12:23:00', 'Seguimiento Bachoco', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('8e47b0cc-2192-4a48-ba65-69c825c7e200', '2025-11-26 13:00:00', 'Seguimiento ESTRUBLOCK', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('12f790db-d637-45e8-9742-6e2f73f8c9b4', '2025-11-26 17:21:00', 'Envío de mensajes por Linkedin para presentación de servicios', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Otros', NULL, NULL),
  ('91a11b1d-fee3-40d3-8d7d-f9a8185c3de1', '2025-11-25 14:30:00', 'Reunión vitrual con SOC Asesores', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Presentación Servicios En Línea', NULL, NULL),
  ('f23dd58d-4291-443e-9b59-744cd8415a35', '2025-12-04 00:00:00', 'Se agendo presentación con EDENRED', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Presentación Servicios En Línea', NULL, NULL),
  ('0b2ede84-4a11-433f-ae8f-118a3fcb1dcf', '2025-11-27 11:19:00', 'Se preguntó por la invitación de EXIROS, aprox. se reciba a partir del 1/DIC', '124615c1-b567-4542-b94e-0fdbf997f56e', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('d7736db3-8d60-4313-8dac-307c1578709a', '2025-12-11 16:01:00', 'Seguimiento C MOCTEZUMA para proponer fechas de reunión 2025-2026', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, 'f'),
  ('40a11ee0-5954-4f3e-926f-99d397bef273', '2025-11-27 12:26:00', 'Seguimiento C MOCTEZUMA por confirmar reunión prox semana', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, NULL),
  ('4f74ead3-c714-47f3-9bbe-da0bb2c7ec6b', '2025-11-27 16:56:00', 'Se recibió invitación por parte de EXIROS se realizará registro en su portal', '124615c1-b567-4542-b94e-0fdbf997f56e', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, NULL),
  ('c5a5cd2e-8a60-4c26-bf46-910dfc7eebbe', '2025-12-03 16:00:00', 'Guillermo Leon - Empacadora San Marcos ', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Presentación Servicios Presencial', NULL, NULL),
  ('17e1cf1c-c9e3-4bf2-aa47-91e493b75a49', '2025-11-24 09:52:00', 'Envío los JSON, Tibs esta tarabajando en la DEMO', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('1827f162-ff84-4071-bf91-b7faeed27e36', '2025-11-28 10:03:00', 'Presentación de DEMO', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('089f875e-b805-46c8-98cb-d898d3bc128b', '2025-11-26 10:40:00', 'Hable con el cliente y extendio su viaje una semana más. ', '9642b008-e953-4fb1-8754-76e10e849bc7', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('2d16d223-078b-4aee-a9ad-d1f0a43377e6', '2025-11-26 10:42:00', 'El cliente esta de vacaciones esta semana, regresa la próxima', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('7d7dcc26-5944-4b20-a7bb-2b1830295c28', '2025-11-28 10:54:00', 'Pedí actualización del proceso', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, NULL),
  ('9e79dfe3-95f7-4ee1-9d1d-f339fe380bc5', '2025-11-25 10:30:00', 'Seguimiento GRUPO FRISA por confirmar reunión', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, NULL),
  ('3a34b9eb-aa27-4106-9192-4766dcf9b1bf', '2025-12-02 09:21:00', 'Seguimiento para que envíen detalles de la vacante', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'c300d731-63d7-4bb1-b097-b512929703e2', 'f'),
  ('1c2e7eac-54bf-4363-a39c-8f1ce0cc0aba', '2025-12-04 16:00:00', 'Presentación de servicios, discovery y envío de propuesta comercial', '38700b57-f773-4082-a629-e9efb971cd82', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', 'c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'f'),
  ('f1609c91-6d51-4ea8-9282-6c0f816245a4', '2025-12-03 08:44:00', 'Seguimiento grupo FRISA', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, 'f'),
  ('2662e075-5273-486b-aea5-2bb10126d297', '2025-12-05 10:07:00', 'Seguimiento C MOCTEZUMA pide llamar el 8 DIC', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, 'f'),
  ('8509f09c-b216-45fa-904b-9e3a455629c9', '2025-12-10 10:14:00', 'Seguimiento ARCELOR MITTAL', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Llamada', NULL, 'f'),
  ('bacfd659-bda4-4330-9f55-890b19b6b4eb', '2025-12-05 09:51:00', 'Se agendó sesión de seguimiento  IPEC para retomar propuesta 13 DIC ', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Otros', 'e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'f'),
  ('02b8bf3e-fd52-40c8-969f-18eda3209747', '2025-12-05 12:02:00', 'Comunicación con Alberto, se cierra oportunidad', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, NULL),
  ('a9907982-918c-4cc6-851b-b692a479fadc', '2025-12-05 12:22:00', 'Pedir update de demo de TD SYNNEX', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Otros', NULL, NULL),
  ('73e939f3-8b82-4be8-bcb1-fdef01dc91b8', '2025-12-05 12:38:00', 'Correo a Pedro sobre problemas para enviar propuesta comercial', '124615c1-b567-4542-b94e-0fdbf997f56e', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', 'd79d8afc-f33a-41c9-8e67-8d04b77b0427', 'f'),
  ('f0072c15-625d-46e2-b93c-3872e4c15d30', '2025-12-05 12:39:00', 'Se pregunta acerca de propuesta enviada para conocer opinión y siguientes pasos', '38700b57-f773-4082-a629-e9efb971cd82', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', 'c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'f'),
  ('9f71b1ab-3b8a-4735-83e2-3dff51845235', '2025-12-08 11:25:00', 'Seguimiento ARCELOR MITTAL (no se encuentra en México)', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, 'f'),
  ('3a3ae2ca-3f97-4928-a6e4-3fbf9ec624c2', '2025-12-08 11:25:00', 'Seguimiento C MOCTEZUMA para agendar reunión', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Otros', NULL, 'f'),
  ('61c9e134-8071-4a8e-b2ea-4f527731c9d7', '2025-12-08 16:58:00', 'Seguimiento Nathali - Alianza Team (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('4a8a8e79-2136-4bc1-9167-c84fd3baa60f', '2025-12-08 16:50:00', 'Seguimiento Carlos - Celex (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('c9d25700-e3f9-455e-99bd-9eb2c9777bd2', '2025-12-08 16:49:00', 'Seguimiento de Juan Carlos - Almidones Mexicanos (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('fb996b0b-bb44-420d-ab3d-f5525c58686f', '2025-12-08 17:02:00', 'Seguimiento Ángela - iData (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('4f50c504-0d0a-46a7-9549-0f736d6e404c', '2025-12-08 17:03:00', 'Seguimiento Moisés - Intagri (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('f9b36033-6be7-41b1-888f-de8b7cf490d3', '2025-12-08 17:07:00', 'Seguimiento Armando - Lozcar (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('071f2974-6118-497b-b83c-b38a0e05ad8d', '2025-12-08 17:07:00', 'Seguimiento Blanca - Moviired (nurturing)', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('5c32bde4-8cd3-43f9-aeac-6757a55cd859', '2025-12-08 17:34:00', 'Seguimiento para ver si nos envían los detalles de la vacante o si ya tienen', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'c300d731-63d7-4bb1-b097-b512929703e2', 't'),
  ('27cc5499-1f37-4508-ba96-3516a08582d5', '2025-12-09 09:06:00', 'Envíe correo de seguimiento ', '4fda362b-2210-413f-a7b9-34caaace34ec', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Correo', '2ef30837-6dee-4940-890f-0f6e15d78899', 'f'),
  ('777e5ac8-0ea7-4a39-b422-cc7d7bc2eab9', '2025-12-09 09:07:00', 'Envíe correo de seguimiento ', '31ee6490-1a15-4209-a95c-5430f752a8d2', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Correo', '2ef30837-6dee-4940-890f-0f6e15d78899', 'f'),
  ('8ed5529f-cb7a-4819-be16-5567da633238', '2025-12-09 10:04:00', 'Correo de fin de año y retomar conversación para el 2026', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'b8b886b3-155f-4352-b175-29ae8756a4c1', 'f'),
  ('75819182-acb2-4e6b-95b2-7e81aba9bc6c', '2025-12-10 12:47:00', 'Mensajes con Jorge para informarle que seguimos preparando la demo', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 'f'),
  ('93338828-147e-45d8-9988-a51e692d15ff', '2025-12-10 12:49:00', 'Agendar sesión para presentación de servicios a CFO que no pudo ir al desayuno', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', 'b7acddbb-1edf-4edf-a74a-b5a519a2849b', 'f'),
  ('3642aea9-9056-4a53-bc11-a5c39c6efe64', '2025-12-10 16:23:00', 'Presentación DEMO OCR+IA', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('334ca16b-a6db-42ef-a561-d1a6041e3fba', '2025-12-11 09:36:00', 'Seguimiento para conocer su respuesta de acuerdo a la oferta enviada', '38700b57-f773-4082-a629-e9efb971cd82', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', 'c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'f'),
  ('c9361f00-e890-4ce0-a049-6a55785a8589', '2025-12-10 15:01:00', 'Visita a cliente, se dejó regalo en recepción como ellos pidieron.', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Otros', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'f'),
  ('7abac55d-7baa-4fe2-a3b5-84efdb8b64cb', '2025-12-11 11:00:00', 'Visita a cliente para dejar regalo, se hablaron posibles proyectos a futuro', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Otros', '0b60252a-3a40-4c1d-a91a-4691657b60cd', 't'),
  ('58342e89-30f8-45bb-9ee8-5fb9f4307cd4', '2025-12-11 16:04:00', 'Seguimiento GRUPO FRISA para proponer fechas de reunión 2025-2026', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, 'f'),
  ('dbdfd455-76f2-4987-893e-9fe9bdbb9c1f', '2025-12-10 11:45:00', 'EDENRED - Se esta buscando una presentación en el CoE de TD Synnex', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Seguimiento Oportunidad Línea', NULL, 'f'),
  ('71aff5a3-4439-4a35-a3b0-d973c2c2ece5', '2025-12-12 11:48:00', 'Guillermo Leon - Empacadora San Marcos - Se movío presentación para enero.', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Presentación Servicios En Línea', NULL, 'f'),
  ('020860ef-5016-45bf-b0f4-1ec3129c4199', '2025-12-15 10:30:00', 'Correos para ver si recibieron los regalos ', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'f'),
  ('4152a724-e6bc-47ea-97fb-bcb54cc3a660', '2025-12-15 10:30:00', 'Seguimiento a NDA enviado', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('eed9e753-2d1c-4f72-aa1d-d5cc3991e3dd', '2025-12-15 16:00:00', 'Presentación de servicios a Gonzalo Grandon de Brink''s', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', NULL, 'f'),
  ('6b479e74-dd1b-4291-b9d0-6389ca819ff2', '2025-12-15 11:00:00', 'Sesión con TD SYNNEX para revisión de demo', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('65090f4c-8d6c-4103-b096-016886b67322', '2025-12-17 15:39:00', 'Comunicación con cliente y con TD SYNNEX para agendar presentación de demo', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Presencial', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('6b48df7f-8576-412e-b3da-bb19d458fe8c', '2025-12-17 16:10:00', 'Correo con tarjeta de navidad', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', '0b60252a-3a40-4c1d-a91a-4691657b60cd', 't'),
  ('df3f319e-38e7-42e4-ad80-bb4ac2e04802', '2025-12-17 16:10:00', 'Correo con tarjeta de navidad', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('7866673d-fe31-4810-a76f-3856c7cc8c15', '2025-12-18 10:54:00', 'Correo con tarjeta de navidad', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 't'),
  ('c25a2b28-8287-4c3a-abb0-91f19a5c5e8f', '2025-12-18 12:09:00', 'Correo con tarjeta de navidad', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', '5b7df910-1a31-46ed-951f-bf47700b402f', 't'),
  ('9150d095-4558-40a0-81b2-2de6b1f2c1cf', '2025-12-18 12:10:00', 'Correo con tarjeta de navidad', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'c300d731-63d7-4bb1-b097-b512929703e2', 't'),
  ('3f216a8c-cb15-4c92-81a9-ef53388f0be7', '2025-12-31 11:32:00', 'Se propone reunión para presentar propuesta', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('4dd862ad-b2c5-4265-9c53-cab3ff1d06cf', '2026-01-02 09:04:00', 'Seguimiento de licitación, se pregunta estatus', '124615c1-b567-4542-b94e-0fdbf997f56e', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', 'd79d8afc-f33a-41c9-8e67-8d04b77b0427', 'f'),
  ('c3e2722b-782a-4481-a626-13e6774e4f20', '2026-01-02 11:16:00', 'Se pregunta por estatus de proceso, avisando que ya se firmó NDA para avanzar', '38700b57-f773-4082-a629-e9efb971cd82', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', NULL, 'f'),
  ('6bbd9de3-e122-471c-9eea-365659da89bf', '2026-01-05 09:51:00', 'Mencionan disponibilidad a partir de 13/Enero', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('35a8544f-0191-459e-b098-fe8a6b864bfc', '2026-01-05 11:00:00', 'Presentación de DEMO completa al cliente', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 'f'),
  ('151a2ab5-be6b-4a44-a3ec-0fbd5219b237', '2026-01-06 17:04:00', 'Solicitando una sesión para presentación de servicios', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', '790a6678-221b-4b4c-a04f-ac3212fc7922', 'f'),
  ('2f52ba22-d5a8-42c0-b043-ebf79668af71', '2026-01-06 18:19:00', 'Envío de Propuesta de Servicio Fase 0', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('d31777a7-098c-47df-aac8-4f6cba1e70f0', '2026-01-07 09:45:00', 'Correo feliz año y seguimiento para retomar contacto', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'f'),
  ('50c1b47c-e584-4e87-8de3-ecff6d54eb6d', '2026-01-07 11:20:00', 'Se solicitó compartir documentos para DEMO', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '22be53a0-a681-4e9a-beb8-e9cbc71ce241', 'f'),
  ('81f07980-6b57-4bfe-9581-344fbd4fa5ac', '2026-01-08 11:22:00', 'Se envió WA para preguntar estatus, Está de vacaciones', '38700b57-f773-4082-a629-e9efb971cd82', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Otros', 'c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'f'),
  ('6501d151-d322-43d2-aa4b-142e701ec20f', '2026-01-08 10:21:00', 'Se envió WA para coordinar agendas comenta estar en Auditoría', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('56e83450-9448-475b-82c9-ba4d01f5c697', '2026-01-09 09:55:00', 'Seguimiento con Marco Antonio para obtener respuesta de PAYNAU', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'f'),
  ('a23ac5cc-a5c6-4b60-bc32-97322c2a40ba', '2026-01-12 15:26:00', 'Comunicación con Azael (Avalia) por whatsapp y llamada sin respuesta', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, 'f'),
  ('181c56fa-1454-4f7b-bc8c-b9faabbf6cc4', '2026-01-12 13:27:00', 'Whatsapp con Marco Antonio (que hable con Adrián) y Adrián sin respuesta', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, 'f'),
  ('7ccd3e35-d4c9-4bc1-b7c7-2df10ebf4efb', '2026-01-13 16:12:00', 'Seguimiento para reunión de presentación de propuesta', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('86b283cb-af42-4db0-89eb-a07b9f2a360f', '2026-01-13 15:00:00', 'Sesión con el cliente de revisión de propuesta', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('76d5fa72-4666-4f3a-bbcd-72f95c6569c3', '2026-01-15 09:00:00', 'Se presentaron servicios y proyectos de desarrollo por parte de TIBS', '3fa33b33-d95b-4c06-ac49-76682954e01b', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('42a2b00d-3c5d-4f7d-bceb-f62a4309892e', '2026-01-14 18:29:00', 'Envío de propuesta de servicio con correcciones', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('de2ca905-9414-4532-9d30-ffe0358c8e9a', '2026-01-16 17:38:00', 'Envío de Propuesta de Licenciamiento', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('ccc14db6-dd7a-43f9-a161-154a369d4bb8', '2026-01-15 18:00:00', 'Thursday Gathering: Mindset del futuro', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Evento', NULL, 'f'),
  ('128cc94d-b3f9-458e-b27b-404eb6808ca6', '2026-01-14 11:30:00', 'Presentación de servicios a Konfío', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', '10441e5c-c211-437a-ab2d-db4efb29ddd1', 't'),
  ('85134bf2-9a85-48b3-8b2d-36e60f0467cb', '2026-01-19 21:00:00', 'Reunión de dudas Técnicas', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('4d7f88d1-bd0b-4610-954d-029758c27c5a', '2026-01-19 11:33:00', 'Correo se confirma fecha para le 27/Enero presentación de propuesta ', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('44e32a50-9583-4056-8d44-d96c9b0e1476', '2026-01-15 10:05:00', 'Envío de presentación sobre Staffing', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', '10441e5c-c211-437a-ab2d-db4efb29ddd1', 'f'),
  ('ed12777c-ac16-453f-81d1-545d6f76af13', '2026-01-21 12:25:00', 'Comunicación con Daniela, confirma recibido, ya lo envió a procurement', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', '10441e5c-c211-437a-ab2d-db4efb29ddd1', 'f'),
  ('6f6acc29-63ce-4c2e-a565-e749fbf6ea98', '2026-01-22 12:25:00', 'Llamada de update con Adrián, en pausa el proyecto', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Llamada', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'f'),
  ('a7016ac2-7317-4049-9faf-9c819afdccb6', '2026-01-22 18:23:00', 'Envio propuesta licenciamiento SQL y seguimiento', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 'f'),
  ('9aee984c-0822-4eb9-b956-8608b86d712b', '2026-01-27 14:39:00', 'Reunión tecnica para aclaración de la parte de datos', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('65242ec3-6573-45f2-b849-819dec32f7a4', '2026-01-30 16:40:00', 'Agendar Presentación OCR', '1d1a2269-b87f-4970-90ec-0b5835df4922', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', 'ca663b4a-21f1-4e15-b7a8-5ff5ecf3d8f9', 't'),
  ('9039eba5-a40a-4ae7-9da8-644613220085', '2026-01-29 18:00:00', 'Thursday Gathering de Networking en Venture Cafe', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Evento', NULL, 'f'),
  ('faf39053-85a5-4cae-92ef-c9a0de3033e4', '2026-02-04 11:00:00', 'Presentación de demo OCR y de servicios', '1d1a2269-b87f-4970-90ec-0b5835df4922', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Presentación Servicios En Línea', 'baf471e0-4bbd-457b-a712-482a040ecf45', 't'),
  ('8fe82704-64e9-45b0-8e4b-0bb32f526113', '2026-02-04 12:10:00', 'Envío de presentación posterior a sesión', '1d1a2269-b87f-4970-90ec-0b5835df4922', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'baf471e0-4bbd-457b-a712-482a040ecf45', 't'),
  ('c8c97597-8304-4d84-b253-e33a96e054cb', '2026-02-04 14:30:00', 'Expo Manufactura', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Evento', NULL, 'f'),
  ('c1020c71-3e45-459a-9342-8318085237ff', '2026-02-12 17:35:00', 'Thursday Gathering', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Evento', NULL, 'f'),
  ('cec3d6fc-5f2b-4620-a4be-6df45d992269', '2026-02-17 12:00:00', 'Presentación DEMOs de desarrollos para explorar requerimiento', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('577a16c0-f624-464e-9527-c8412159a41c', '2026-02-17 17:16:00', 'Seguimiento para agendar próxima sesión con equipo técnico', '1d1a2269-b87f-4970-90ec-0b5835df4922', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'baf471e0-4bbd-457b-a712-482a040ecf45', 't'),
  ('30bc0545-505d-41d4-9278-fc3764e71c33', '2026-02-18 11:00:00', 'Presentación de empresa y posibles soluciones', '72e67258-5d97-4199-ad06-37d04e1c6f48', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios Presencial', '9661c8f4-0262-414e-bd24-ef45e96e607f', 'f'),
  ('82b89010-60af-4099-928d-e133ad6f26a1', '2026-02-24 13:00:00', 'Presentación de empresa y posibles soluciones', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '891c965b-029a-48d0-a2a2-3d353ccd30cc', 'f'),
  ('a55b99a4-08cb-44bb-be50-aff1039faabe', '2026-02-25 12:00:00', 'Presentación de empresa y posibles soluciones', '6cbff638-f0c8-4e35-ab34-c1d7d1ab03a0', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '7c784b9e-817f-4ef1-90f6-a1c15630833d', 'f'),
  ('8a9b1c4c-f664-42cf-9ee1-f839b5f2e608', '2026-02-18 16:00:00', 'Solicitud de reunión', '6cbff638-f0c8-4e35-ab34-c1d7d1ab03a0', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios Presencial', '7c784b9e-817f-4ef1-90f6-a1c15630833d', 'f'),
  ('ee1513a3-6373-4ccc-97c4-f1f5e345f4f8', '2026-02-18 13:11:00', 'Solicitud de reunión', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios Presencial', '891c965b-029a-48d0-a2a2-3d353ccd30cc', 'f'),
  ('6bb8a825-bb81-482f-8a7f-6bbc5a3eedce', '2026-02-26 10:45:00', 'Seguimiento para retomar contacto', '7f89279a-8810-49b6-9b6f-fd458d0ca0e8', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Otros', 'e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'f'),
  ('2182ada6-e107-4343-a6fe-5444f9e5cafd', '2026-02-26 10:46:00', 'Seguimiento para coordinar Presentación de propuesta', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Otros', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('4dbdcd1b-0554-4a23-8c1f-e073e7470128', '2026-02-26 16:00:00', 'Demo OCR+IA', '33f729c3-5348-4667-b637-9c5873828fd5', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', '455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'f'),
  ('726262cc-d2cd-4871-8877-4ad85403c4a6', '2026-03-04 16:00:00', 'Presentación Demo | Plataforma Clima ', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Seguimiento Oportunidad Línea', '891c965b-029a-48d0-a2a2-3d353ccd30cc', 'f'),
  ('ef082120-658e-47b6-b6a7-ad9345623ae4', '2026-03-03 14:00:00', 'Presentación de Soluciones de automatización para RH', '5d0f2791-edec-42d7-8a96-139f79d9d491', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '0f5d48f6-fa97-4234-8994-3bf9d62f0b0b', 'f'),
  ('1f6b9245-28a2-453f-86c1-c252d3e01817', '2026-03-02 12:00:00', 'Sesión para ampliar información faltante para propuesta', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('bb8ada7a-3863-4a6c-a567-3dd1236d0e46', '2026-03-04 17:32:00', 'Correo de seguimiento para agendar sesión', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'b19ec9cb-e6f2-4852-8eaa-2fa81df75a0b', 't'),
  ('591cbe03-8fe8-4ad0-bb8d-7448451ea5ed', '2026-03-05 10:00:00', 'Sesión de aclaración de dudas técnicas de equipo TECHGEN', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('c11f920e-cefd-441a-b1d0-dee9c38ec74e', '2026-03-04 16:00:00', 'Presentación solución Visual inspección ', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Presentación Servicios En Línea', '455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'f'),
  ('4a38a76f-5341-4e33-8c7b-e4084d085555', '2026-03-10 15:22:00', 'Correo de descarte, se retoma hasta nuevo aviso', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '22be53a0-a681-4e9a-beb8-e9cbc71ce241', 'f'),
  ('1c96238e-7c1d-4cf1-b479-9ff604fb8244', '2026-03-10 16:09:00', 'Seguimiento para presentar propuesta comercial de OCR', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('9ee75cbb-eb5a-4731-be25-d1b1d242e5a0', '2026-03-11 14:06:00', 'Sesión agendada para presentación de propuesta', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('08d212e8-7c7d-4d33-9f27-93a9f47958e6', '2026-03-12 11:00:00', 'Levantamiento de requerimiento', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', 'ee7e27c5-7263-431b-9751-3f6ad791eb21', 'f'),
  ('9d1f8f44-f69d-4373-8663-71fcc2f45946', '2026-03-13 10:00:00', 'Presentación TIBS', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', 'cf02a860-f428-4215-94af-1365f07d587a', 'f'),
  ('8ed5d69f-3328-4234-8424-38e8e0cb18ca', '2026-03-05 18:00:00', 'Presentación de propuesta comercial', 'a689919a-b00e-4178-8c45-3fb40747c045', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios Presencial', 'a2f3288f-2b18-48f4-b88d-0f5963f9edf5', 'f'),
  ('e0002f1b-503b-410d-ad51-7cb4c9b4dcfd', '2026-03-13 09:00:00', 'Sesión de presentación de Propuesta de Servicio', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('e2fafa6f-fdc7-43ec-a3c7-581c03e99cd5', '2026-03-13 17:29:00', 'Envío de Propuesta de Servicio', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('f68d36d3-ca46-4123-9c91-1f7aa24f1641', '2026-03-18 10:50:00', 'Seguimiento para agendar siguiente sesión', '1d1a2269-b87f-4970-90ec-0b5835df4922', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'baf471e0-4bbd-457b-a712-482a040ecf45', 't'),
  ('3659e037-415f-4a8d-ba8c-8f1baad3b0d5', '2026-03-18 15:42:00', 'Correo de seguimiento de estatus licitación', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('b042141d-9758-4d0a-9896-0591eca488f4', '2026-03-19 12:43:00', 'Comunicación para coordinar visita y revisión de propuesta', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 't'),
  ('d59469a6-8f74-4b2c-b982-5c539e2f604a', '2026-03-20 15:32:00', 'Correo para buscar sesión', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', '64ac72f7-ae6c-4d2c-a619-00b623e91fbe', 'f'),
  ('1e726132-ec7e-465c-9e86-8d0e0350a80e', '2026-03-20 17:47:00', 'Correo para buscar sesión', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'de27fc07-fa48-4d93-be51-51ea7d36a66e', 'f'),
  ('b9a7ef89-dd49-48d6-aac6-fc03327c95dc', '2026-03-30 11:03:00', 'Comunicación con Daniela para algún update', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 't'),
  ('c60f4beb-988b-48cb-91df-f557e28fbd0d', '2026-03-30 11:14:00', 'Correo de descarte', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '565eed95-cb17-4b78-8169-0a2cf3210627', 'f'),
  ('ff65ea72-25fb-4d1a-9b18-acb5c0a0cefb', '2026-03-30 13:20:00', 'Comunicación por Linkedin para agendar DEMO', '17befe8b-91c3-4fe2-b288-d18f060ffbd6', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 't'),
  ('8fb48087-3529-4f36-8b33-2afdf79f199b', '2026-03-30 14:06:00', 'Mensaje para retomar conversación', '18bfd5ba-36d8-43c4-884b-a47abe73f592', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 't'),
  ('73def67c-5c15-4000-874a-36d588b7fd0c', '2026-03-31 10:00:00', 'Presentación de empresa y posibles soluciones', '73176e11-565b-48c7-b330-ef0001ce3401', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '0be3b5f6-d484-45c0-9247-67ee62eb3ad8', 'f'),
  ('c866313f-24c0-4a3a-841c-8fc7682ec4f5', '2026-04-06 16:10:00', 'Correo de seguimiento estatus de licitación', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Correo', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'f'),
  ('8acc9a32-a566-46e3-87ad-51be8e9ce44e', '2026-04-09 15:00:00', 'Seguimento y presentación equipo IBM', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Seguimiento Oportunidad Línea', '455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'f'),
  ('264937e4-e431-42e7-946d-49f62e2208fa', '2026-05-04 12:00:00', 'Presentación de empresa y posibles soluciones', '4f01d5aa-507b-4a0c-bbab-764385faebdc', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', 'd6fbc7ee-aa61-406a-86b8-d4660e488257', 'f'),
  ('b32d43ab-96c3-4869-ab80-268917ea026f', '2026-05-04 15:00:00', 'Presentación de empresa y posibles soluciones', '71b5225e-13a7-417c-80e5-df70d31e03e7', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '97d6ac09-2dda-4ef9-8c7d-09d23fb220ef', 'f'),
  ('2812600c-9daf-415a-bba8-ba9fa66b9afc', '2026-04-29 13:00:00', 'Se presentó en conjunto con el equipo de IBM Instana y Cloudability', 'c44f21d1-d4e8-4133-b703-c0b52261b802', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '7c784b9e-817f-4ef1-90f6-a1c15630833d', 'f'),
  ('9d5cec79-b27a-43ba-9a21-557e74e665b7', '2026-05-15 16:50:00', 'Mensaje a Daniela para visita presencial', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', '10441e5c-c211-437a-ab2d-db4efb29ddd1', 'f'),
  ('3cce83c5-86b0-42c7-9019-6350e2a9ee36', '2026-05-15 16:51:00', 'Comunicación con Lilia que les pusieron otra capacitación', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', 'b19ec9cb-e6f2-4852-8eaa-2fa81df75a0b', 'f'),
  ('213bc3cf-6d7f-494f-aeaa-c1ad7029108f', '2026-05-22 11:45:00', 'Solicitud de cita por TechSummit', NULL, '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Correo', 'b4dc9782-48a5-4924-927f-c53d4e18b65d', 'f'),
  ('51cfd14b-349c-4ed4-9669-c2637fe7a49d', '2026-05-22 11:55:00', 'Solicitud de cita por TechSummit', NULL, '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Correo', 'd77ffa78-4d22-427c-8e74-40496d3151b5', 'f'),
  ('1d22d092-79d6-4e31-a43e-721f448ecb22', '2026-05-22 11:55:00', 'Solicitud de cita por TechSummit', NULL, '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Correo', '0d6341c2-3d85-473b-92df-bd8e66810206', 'f'),
  ('64985505-2e20-43ef-98ba-a3cee27d5911', '2026-05-22 12:21:00', 'Seguimiento para estimación', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Seguimiento Oportunidad Línea', 'd6fbc7ee-aa61-406a-86b8-d4660e488257', 'f'),
  ('e774e191-3c0d-4ca4-a50b-1fe7a8add719', '2026-04-22 10:00:00', 'Presentación de empresa y posibles soluciones', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', 'd6fbc7ee-aa61-406a-86b8-d4660e488257', 'f'),
  ('2091a66b-1081-4d56-aee8-85c5926b9295', '2026-06-03 10:00:00', 'Llamada Martín, sin respuesta, para confirmar inicio de proceso', 'c2cea0f5-850e-487b-b9b8-c59225c6b6ee', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Llamada', NULL, 't'),
  ('5683d310-6339-4b5f-b7bc-4f73f5dd5d98', '2026-06-03 15:00:00', 'Mensaje a Rosario para pedirle los documentos y agendar proxima demo de Billy', '7b1d7bc6-276e-4ef2-95e7-5a3f2734b525', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Seguimiento Oportunidad Línea', NULL, 'f'),
  ('b1eb09a3-6419-431e-af86-701f95587982', '2026-06-08 10:30:00', 'Presentación de empresa y posibles soluciones', 'bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Presentación Servicios En Línea', '3c56e8cf-017d-4170-9f1d-bc424dc4936f', 'f'),
  ('e97c7f43-917a-449f-aa11-ce3abcce0bb8', '2026-06-15 10:30:00', 'Reunión para presentar solución ', 'bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Seguimiento Oportunidad Línea', '3c56e8cf-017d-4170-9f1d-bc424dc4936f', 'f'),
  ('c5f79a68-ae16-4bab-860e-855100aa31e8', '2026-06-19 11:59:00', 'Mensaje de seguimiento a Jorge', '5dfeacfd-ba05-4b6c-a183-6d112689e27c', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Correo', NULL, 'f'),
  ('744b660b-a60f-423e-8c4e-cb64a06599ee', '2026-07-03 17:02:00', 'Se habló con él para rectivar el contacto', 'ad00d82c-3098-472a-bf21-e34b0a367042', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Correo', NULL, 'f'),
  ('a9b17e2e-f4f5-4c54-afce-1e08b52a8e53', '2026-07-03 17:05:00', 'Se envía información de WorkShop IA Discovery', 'ad00d82c-3098-472a-bf21-e34b0a367042', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Otros', 'ccda5ba3-a7a0-4972-8cee-6da9a399c50e', 'f'),
  ('d3079b5f-b339-446d-a7ca-1794359c048a', '2026-07-08 13:24:00', 'Confirmación DEMO', '61ae2418-e508-4609-af58-cf92f86ea673', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Correo', '7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'f'),
  ('6a3f9aba-c568-4cb0-86a9-e60dc2d5ee48', '2026-07-09 13:25:00', 'DEMO Billy S&S', '61ae2418-e508-4609-af58-cf92f86ea673', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Evento', '7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'f'),
  ('ac1ed61c-c698-425e-b803-75d15fd116bd', '2026-07-15 10:23:00', 'Seguimiento a decisión y siguientes pasos ', '61ae2418-e508-4609-af58-cf92f86ea673', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Llamada', '7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'f'),
  ('7be512c1-924b-497e-aa44-2bb92a2f4901', '2026-07-15 10:24:00', 'Seguimiento ', '61ae2418-e508-4609-af58-cf92f86ea673', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Otros', '7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'f');



--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.clients
INSERT INTO staging.clients (id, nombre, apellido, correo, empresa, puesto, telefono, estatus, ejecutivo_id, category) VALUES
  ('891c965b-029a-48d0-a2a2-3d353ccd30cc', 'Carlos', 'Chairez', 'carlos.chairez@grupolala.com', 'Grupo Lala', 'Proyectos', '871 338 2079', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('4633fda2-4748-422e-a65a-96eef1f86d36', 'Jose ', 'Marin', 'jose.marin@leoni.com', 'Leoni', 'n', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('0b60252a-3a40-4c1d-a91a-4691657b60cd', 'Alberto', 'Fonseca', 'alberto.fonseca@avalia.com.mx', 'Avalia', 'Gerente de Finanzas y Operaciones', '8119165546', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('8408cd80-0f1f-4dc9-a8f9-7e6da4e84326', 'Candi', 'Paniagua', 'c.paniagua@kostal.com', 'Grupo KOSTAL', 'Quality Plant Manger', '4425952103', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('b8b886b3-155f-4352-b175-29ae8756a4c1', 'Mariano', 'Torres', 'mtorres@matcor-matsu.com', 'Matcor-Matsu', 'Coordinador TI', NULL, 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('3b39427a-0ede-4018-96c0-c131d4ce34cd', 'Rafael Isidro', 'Casas', 'isidro.casas@totalplay.com.mx', 'Total Play', 'Consultor empresarial', '6644355503', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Contacto'),
  ('d97efafe-a2de-467a-8806-2bee1dae981d', 'Luis ', 'González', 'lgonzalez@citizenwatchgroup.com.mx', 'Citizen', 'Director IT', '7222040937', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('595fe239-642f-4f36-a599-13d15be6e58e', 'Vicente', 'Reyes', 'reyesv@gpofm.com', 'GFM Logística y Aduanas', 'Director', '5569634039', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('72b23fec-09a6-4250-a062-04b498a65e0e', 'Oscar', 'Salgado', 'oscar.salgado@gmx.com.mx', 'GMX Seguros', 'CIO', '5520951583', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('8ef32617-991c-4b06-8916-c65263f1e652', 'Javier', 'Martinez', 'javier.martinez@proa.com.mx', 'Grupo Diagnostico PROA', 'Director IT', '5540989676', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('a2f3288f-2b18-48f4-b88d-0f5963f9edf5', 'Ariel', 'Arriaga Garcia', 'ariel.arriaga@skyangel.com.mx', 'Sky Angel', 'Director de Operaciones y Negocios', '5556879011', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('e28aa1f6-86da-443f-862b-cd04ac3e3220', 'Jorge', 'Mores', 'jorge.mores@oup.com', 'Oxford University Press', 'Head of Finance', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('044c97cf-bdf4-4369-ba26-2301fb68d135', 'Wilfrido', 'Téllez Girón', 'wtellezgiron@socasesores.com', 'SOC Asesores Financieros', 'Director', '5511224970', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('d79d8afc-f33a-41c9-8e67-8d04b77b0427', 'Pedro Eloy', 'Moreno', 'pedro.moreno@tecpetrol.com', 'Tecpetrol', 'Commercial project development expert', '8111758806', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Lead'),
  ('4cbeb279-e659-48d0-ba65-30f81b3d4646', 'Alejandra', 'Perez', 'aperez.santana@ibm.com', 'TRANSMEX / IBM', 'Ventas', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('ef26112c-975f-4661-8d34-475fc4703be5', 'Víctor', 'Sánchez', 'vhsanchez@gtglobal.com', 'GT Global', 'TI ', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('39b78d4c-add3-4e07-9c28-776ff6f06de4', 'Luis Alberto', 'Perez', 'lperez3@gaig.com', 'Seguros El Aguila', 'Director of Finance ', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('624b8576-c540-46a5-ad14-93d409c56e86', 'Pedro David', 'Sánchez Rueda', 'psanchez@paynau.com', 'Paynau', 'Transformación Digital', NULL, 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('54838ce0-d4d1-4640-94ba-813dfac00d9b', 'Jessica ', 'Villarreal', 'jesica.villarreal@prolamsa.com', 'PROLAMSA', 'Business Intelligence', '52 81 80244535', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'Adrián', 'Ayala', 'aayala@paynau.com', 'PAYNAU', 'Head of intelligence & Process', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cliente'),
  ('b7acddbb-1edf-4edf-a74a-b5a519a2849b', 'Gonzalo', 'Grandon', 'gonzalo.grandon@brinks.com', 'Brinks', 'CFO', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'Ana Victoria', 'Martinez', 'victoria.martinez@salud-digna.org', 'Salud Digna', 'Gerente de Proyectos BI', '6671622510', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Cliente'),
  ('790a6678-221b-4b4c-a04f-ac3212fc7922', 'Azael', 'Nava', 'azael.nava@avalia.com.mx', 'AVALIA', 'Gerente TI', '8110775190', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('835c3f9c-4dfe-464a-8a72-03980e534a6b', 'Guadalupe', 'Gonzalez', 'guadalupe.gonzalez@techgen.mx', 'TECHGEN', 'Facility', '9211698519', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Contacto'),
  ('10441e5c-c211-437a-ab2d-db4efb29ddd1', 'Daniela', 'Delgado', 'daniela.delgado@konfio.mx', 'Konfío', 'Engineering Manager', '229 368 7559', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('92596e84-03e3-42b6-86d0-36496e647845', 'Ricardo Isaí ', 'Valdivia Ibarra', 'rvaldivia@gripomexico.com', 'Grupo Mexico', 'Especialista en Innovación Tecnológica', '', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cliente'),
  ('baf471e0-4bbd-457b-a712-482a040ecf45', 'Emilio', 'Gonzalez', 'egonzalez@regiopytsa.com', 'RegioPYTSA', 'Gerente de Mejora Continua', '81 2748 2064', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('adf7c586-4848-43d6-837c-65acd2ccba77', 'Hernan', 'Benavides', 'hernan.benavides@chubb.com', 'chubb', 'Líder Proyectos Chile', '+56 9 7323 7109', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('0f5d48f6-fa97-4234-8994-3bf9d62f0b0b', 'Sandra', 'Lomelí', 'sandra.lomeli@mis.edu.mx', 'Madison International School', 'Human Resources Coordinator', '81 8088 2158', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('09b37b18-0eb8-419e-a3e8-a5ffa3dc750c', 'Erik', 'Adriano', 'eadrianoa@ibm.com', 'Erik', 'Adriano', '+52 81 1184 4788', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('b19ec9cb-e6f2-4852-8eaa-2fa81df75a0b', 'Alejandra', 'Ruiz', 'aruiz@exemplis.com', 'Exemplis', 'EHS Manager', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('df63d823-d0fb-46f9-8a9e-c30f54fd4245', 'Vanesa', 'Velazquez', 'c@d.com', 'Grupo DAGS', 'Gerente de Titulación y Cobranza', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('eb43e096-5252-4cf9-8986-6651f78f4ab8', 'Ricardo', 'Wooddell', 'ricardo.wooddell@tenova.com', 'Tenova', 'IT Infrastructure Network Specialist', '8183622342', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('cf02a860-f428-4215-94af-1365f07d587a', 'Arturo', 'Barragán', 'a.barragan@cimepowersystems.com.mx', 'CIME Power Systems', 'Gerente Comercial', '', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('c8a64267-a1cf-4e07-85f1-d4cb209a5233', 'Aurora', 'Salinas', 'aurora.salinas@protexa.mx', 'Protexa', 'Analista de seguridad y salud', '8119219437', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('cea02030-baac-49af-8094-6aa21950f741', 'Liliana', 'Pérez', 'Liliana.Perez@chubb.com', 'chubb', 'SubDirector D&A Latam', '8189972394', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('2ed0ec41-8850-46e6-9263-5b625accd0a1', 'Edgar', 'Castañeda', 'edgar.castaneda@afirme.com', 'Afirme Seguros', 'Líder Técnico Ingeniería Datos', '8187055221', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('6d787e67-6092-479a-aab5-d168e05d8c90', 'Tania', 'García', 'tania.garcia@xpdglobal.com', 'XPD Global', 'SAP B1 Product Owner Manager', '5548808763', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('ab527c26-fdb4-48d5-b173-bac7b9e1a5db', 'Camilo', 'Raigosa', 'camiloraigosa@europiel.com.mx', 'Europiel', 'Head of IT ', '8711789663', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('a7599890-ea0c-47e1-99d5-beb64a88fa09', 'Roberto', 'Hernandez', 'roberto.hernandez@tfema.com', 'Transportes FEMA', 'Director de TI ', '8123540330', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('17fd701b-cd32-45a3-852b-e7a11b9b1817', 'Arturo', 'Najera', 'anajera@elpotosi.com.mx', 'Seguros El Potosi', 'Director Daños', '8125827053', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('08c65d20-45e9-43e5-88d2-706d73658b6b', 'Horacio', 'Terán', 'horacio.teran@cosmocel.rovensa.com', 'Cosmocel', 'TI', '8114716834', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('03f102e1-577e-4347-b91f-d0ec34fb834d', 'Juan', 'Treviño', 'juan.trevino2@chubb.com', 'CHUBB', 'Director de TI ', '8184622999', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('c7561b2d-d404-4c99-975b-e25d937f1e1d', 'Alfonso', 'Perez', 'alfonso.perez@avantenge.com', 'Vía APIA ', 'Director', '5559668246', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('91781bea-f55c-4da5-8ede-2f59c963d955', 'Hernán', 'Benavides', 'Hernan.Benavides@Chubb.com', 'Chubb Chile', 'Líder Proyectos Chile', '+56 9 7323 7109', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('e479bcb9-a0d7-4e9d-acb5-03398635439d', 'Irene ', 'Chamerry', 'irene@contakto.mx', 'Contact', 'Dirección General', '6643983400', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('c2196603-32d9-4d13-aefc-8b3f61cfeec6', 'José', 'Rodríguez', 'jose.rodriguez@wieland.com', 'Wieland', 'Finance Manager', '442 359 6411', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('56e88c9e-2e25-41fb-b79a-ad026f389806', 'Anibal ', '.', 'gerente.rh@superchivas.com.mx', 'Super Chivas', 'Gerente RH ', '+52 664 389 6649', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('565eed95-cb17-4b78-8169-0a2cf3210627', 'Jorge Luis ', 'Flores', 'jorge.flores@dart.biz', 'Dart', 'Ingeniero de Mejora Continua', '6644848021', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('3ce6bb91-a2e4-48bf-8466-1ced7e2c4cc5', 'Cesar', 'Resediz', 'cesar.resendiz@autlan.com.mx', 'Autlan', 'Gerencia de Planeación Estrategica', '+52 81 81521544', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('3a8b247a-f8f0-45bb-a017-ac5bf96f7ab9', 'Omar ', 'Gutiérrez', 'omar.gutierrez@autlan.com.mx', 'Autlan', 'Comercial ', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('8e958d2d-08ff-413d-a075-96fe2c80e10a', 'Eduardo', 'Galindo', 'eduardo.galindo@audi.mx', 'Audi', 'Planner & Strategist', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('590511a6-a3b8-4572-886a-7e3422b71ea9', 'Juan Carlos', 'Vega Treviño', 'juan.vega@ccontrol.com.mx', 'GCC', 'Desarrollo de Aplicaciones', '52 81 3644 3446', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('8b5b0c1a-f214-4784-bfe7-3cbf0c3868f6', 'Nora', 'Martínez', 'nora.martinez@tibs.com.mx', 'GCC', 'TI Integraciones', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('592fb6fc-74d6-4f7d-a6ea-5c4f0b76bbac', 'D', 'H', 'negociofamiliar1126@gmail.com', 'Eiyo to kenko', 'Director', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('9661c8f4-0262-414e-bd24-ef45e96e607f', 'Raúl', 'Rodríguez Herrera', 'rrodriguez@maysoft.mx', 'Maysoft', 'Gerente de TI', '99 8845 7512', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('00eba21b-a657-4f6e-9cdb-a11d06c3fdd7', 'Cesar', 'Resendiz', 'cesar.resendiz@autlan.com', 'Autlán', 'Gerente de Planeación Financiera', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('112944dc-5ada-44b1-a1f6-a5e50afb6e75', 'Juan Antonio', 'Gonzalez', 'angonzalez@ragasa.com.mx', 'Ragasa', 'Gerente de Transformación y Analítica', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('d1569f34-195f-42b4-98d8-cffc96b51d17', 'Alejandro', 'Gonzalez', 'alejandro@wardaventures.com', 'Guarda Express', 'Director', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('3452c8cb-65f4-4ac4-9cad-e12d3166d3e7', 'Roberto', 'Lopez', 'roberto.lopezlena@se.com', 'Schneider Electric', 'CFO ', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('6b52a768-c684-4f58-91ac-6249e9aa9b29', 'Anayely', 'Colindres', 'anayely.colindres@sageai.com', 'Sage Automotive Interiors', 'TI', '722 166 0947', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('4a04f10d-7e3d-4ccb-ba59-326922bc8612', 'Roberto ', 'Vazquez', 'roberto.vazquez@ccontrol.com.mx', 'GCC', 'Analista de Gestión de Servicios, Capacitación y Desarrollo.', '', 't', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Contacto'),
  ('5306c9a3-d49d-4332-baf1-7b5235bd3152', 'Kin', 'De Alba', 'kin.dealba@viega.mx', 'ACH FOODS MEXICO', 'Finance Business Analytist', '2221830833', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('879c931b-c618-42e5-8521-6c6da2c47fe0', 'Gabriel ', 'Silva', 'gsilva.mex@grupoei.com.mx', 'Grupo EI', 'GERENTE IT', '5588166471', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('b6651f01-674f-477e-b4b8-ee06e1436036', 'Juan', 'Galarza', 'jgalarza.mex@grupoei.com.mx', 'Grupo EI CDMX', 'Director', '55 6251 7833', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('18687d62-33bb-483a-a491-698ef4af365c', 'Urisol', 'Cortes', 'urisol.cortes@skyangel.com.mx', 'Sky Angel', 'Director Financiero', '5552767670', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('fbd4af89-5633-4448-ac89-5b094a63bbcf', 'Allan ', 'Trujillo Ortega', 'dir.comercial@axias.group', 'Axias Group', 'Director General', '5589556080', 't', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Lead'),
  ('ad8d7875-bbed-435a-a600-25f605d44254', 'Farid ', 'Guerrero', 'Jose.Guerrero2@Chubb.com', 'CHUBB', 'Scrum', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('22be53a0-a681-4e9a-beb8-e9cbc71ce241', 'Jesús Cosme', 'Lopez Velázquez', 'jclopez@bafar.com.mx', 'BAFAR', 'Líder de Logística', '', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Lead'),
  ('c300d731-63d7-4bb1-b097-b512929703e2', 'Martín', 'Oseguera', 'moseguera@platinumpack.com', 'Platinum Pack', 'Director General', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('c5b44cfd-105c-423b-b26a-038c64dda1f0', 'Rosy ', 'Mayor ', 'rmayorg@bepensa.com', 'Bepensa ', 'Gte de Gobernanza TI ', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'Fernando', 'Gutierrez', 'fernando.gutierrez@strd.com.mx', 'STRD GO', 'Head of IT ', '8123526650', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'Hector', 'Ceniceros', 'hector.ceniceros@ipec.mx', 'IPEC', 'Director de Operaciones', '6141740078', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Contacto'),
  ('5b7df910-1a31-46ed-951f-bf47700b402f', 'Víctor', 'Garcia', 'vgarcia@platinumpack.com', 'Platinum Pack', 'Gerente de Recursos Humanos, Manager SAP Business One', '5543902165', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cliente'),
  ('2ef30837-6dee-4940-890f-0f6e15d78899', 'Yudel ', 'Corpus Coronado', 'yudel.corpus@ccontrol.com.mx', 'GCC', 'Gobierno de TI', '52 811043 4649', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('e55c9968-d30e-474b-be56-3ebb88dbdacd', 'Antonio ', 'Pardo Garcia ', 'antonio.pardo@ccontrol.com.mx', 'GCC', 'Desarrollo de Aplicaciones', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('c533b360-ecdd-48cb-9343-9cb8d817cfd9', 'Freddy', 'Urbina Camacho', 'freddy.urbina@ccontrol.com.mx', 'GCC', 'Coordinador/Desarrollo de Aplicaciones', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('5777d841-d104-45d8-b1bc-4ca762ad3bc0', 'Noemí', 'Bañuelos', 'nbanuelos@jonathaengr.com', 'Jonathan Engineered Solutions', 'RH', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('ca663b4a-21f1-4e15-b7a8-5ff5ecf3d8f9', 'Gerardo', 'Luevano', 'gluevano@regiopytsa.com', 'Regiomontana de Perfiles y Tubos (RegioPYTSA)', 'Director de Operaciones', '81 1531 3421', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('7761e4b5-7b34-43a0-970d-8161a2b274af', 'Eduardo ', 'Salas', 'eduardo.salas@xpdglobal.com', 'XPD Global', 'CFO', '4422598678', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('187eccac-685d-496a-8dc3-9302673f9076', 'Alan ', 'Lopez', 'alan.lopez@xpdglobal.com', 'XPD Global', 'Líder Proyectos TI', NULL, 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('20aaa558-2b9d-4ae4-9c4c-9532643c79b0', 'Jeannete', 'Carrillo ', 'jcarrillo@intexgroup.mx', 'INTEX', 'Analitica', '+52 55 5181 8904', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('7c784b9e-817f-4ef1-90f6-a1c15630833d', 'Jorge', 'Martinez', 'martinezj@sanborns.com.mx', 'Sanborns', 'CTO - Infraestructura IT', '55 2702 4637', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'Benny ', 'Castañeda', 'Benny.Castaneda@arcelormittal.com', 'ArcelorMittal', 'Gerente IT', '', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Contacto'),
  ('ee7e27c5-7263-431b-9751-3f6ad791eb21', 'José Manuel', 'Lugardo Leyva', 'cdigital@gtepeyac.com', 'Fertilizantes TEPEYAC', 'Transformación Digital', '6623276629', 't', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Contacto'),
  ('0ad900f1-1730-45db-b14c-026767f2c88a', 'Oscar', 'Arenas', 'oscar_arenas@nadro.com.mx', 'Nadro', 'Especialista TI entregas y trazabilidad', '', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('64ac72f7-ae6c-4d2c-a619-00b623e91fbe', 'Marco', 'Maldonado', 'marcomaldonado@gruporg.com', 'Grupo RG', 'Gerente TI', '8112450599', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('de27fc07-fa48-4d93-be51-51ea7d36a66e', 'Christian', 'Salazar', 'christian.salazar@droshamexico.com', 'Drosha', 'IT Manager', '8115884725', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('8e6df780-aae3-4281-9421-d355f7974b7f', 'Enrique', 'Barcena', 'enrique.barcena@tmm.com', 'TMM Store', 'CEO', '8112900927‬', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('0be3b5f6-d484-45c0-9247-67ee62eb3ad8', 'Guillermo', 'Cervantes', 'gcervantes@primecomms.mx', 'PrimeComms', 'Director General', '5576574342', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('23261509-d2c3-4fd0-9edc-ac75d9b43b3f', 'Sara', 'Vizcarra', 'sara.vizcarra@leoni.com', 'Leoni', 'a', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('59611499-7da9-4e55-b599-bcf84ffb46c1', 'Gustao', 'Cortinas', 'gcd@jersey.com.mx', 'Jersey', 'Gerente de TI', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('d6fbc7ee-aa61-406a-86b8-d4660e488257', 'Carlos', 'Sánchez', 'carlos.sanchez@ftech.com.mx', 'F-Tech', 'RH', '8215643974', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('2900d268-a2ec-41ed-b360-8af3726b663e', 'Erendira', 'Torres', 'erendira.torres@ctrendy.mx', 'BeFashion (CTRENDY)', 'rh', '686 108 5472', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('d6a4036f-29c7-4322-ac8f-44d2185a47bd', 'Marcela', 'Guerrero', 'sopextasfi6@ccontrol.com.mx', 'GCC', '--', '00', 't', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Contacto'),
  ('97d6ac09-2dda-4ef9-8c7d-09d23fb220ef', 'José', 'Villalpando', 'rh@mesagrande.mx', 'Invernaderos Mesa Grande', 'RH', '449 919 2451', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('27fca84a-ea94-47a8-9cd5-525fdd93e108', 'Ernesto', 'Rico', 'erico@paynau.com', 'Paynau', 'Director Comercial', '81 1600 6544', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('e84185b8-0efd-4367-a717-fe098ffb63f1', 'Manuel', 'Mendoza', 'mmendoza@paynau.com', 'Paynau', 'Arquitecto TI', '', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('d77ffa78-4d22-427c-8e74-40496d3151b5', 'Cesar', 'Olivas', 'colivas.mty@aduax.com', 'Aduax', 'ND', '528110660258', 't', '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Contacto'),
  ('0d6341c2-3d85-473b-92df-bd8e66810206', 'Sanjuana', 'Monsivais', 'cristal.monsivais@gtim.mx', 'Oxxo-GTIM', 'ND', '8110216178', 't', '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Contacto'),
  ('f5a2a118-d3a2-4a4e-9807-4a69261f1bcf', 'Daniel ', 'Mendoza', 'Daniel.Mendoza@daltile.com.mx', 'Daltile', 'Gerente de TI ', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('b95421f5-c183-4feb-9cfb-eb33776be357', 'Ximena', 'Fuentes', 'xfuentes@bachoco.com.mx', 'Grupo Bachoco', 'IT', '56 1957 6825', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('b4dc9782-48a5-4924-927f-c53d4e18b65d', 'Jazmin', 'Gaucin', 'rosario.gaucin@oxxo.com', 'OxxO', 'ND', '8132527473', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('f974e54f-a69a-4835-944f-ec60d6ed8533', 'Jorge Alberto', 'Rodríguez Tueme', 'jorge.rodriguezt@udem.edu.mx', 'UDEM', '.', '8112457060', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('3edfdc9e-46bb-448d-a96b-272b92b87d89', 'Pedro Luis', 'Alonso Cervera', 'data@casagarza.com.mx', 'Casa Garza de Monterrey', 'Data', '8120393982', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('ff25f4d2-9bff-4611-a5ec-757d25afe7ad', 'Luis Alberto', 'Manjarrez', 'lmanjarrez@notaria10aca.com.mx', 'Notaría 10 Acapulco', 'Notario Público', '5540502545', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Lead'),
  ('c1bb0295-b1d5-4f81-8383-56676ea252f9', 'Carlos Arturo', 'Vega', 'asfext5@ccontrol.com.mx', 'GCC', '--', '52 229126 2108', 't', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Contacto'),
  ('7a9d117c-fe3b-46b7-a010-ed66b0372a9b', 'Juan Carlos ', 'García', 'juangv@autlan.com', 'Autlán', 'Gerente de TI ', '81 1170 2631', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cliente'),
  ('45010a30-7467-43be-82d6-3b3acc2bef8b', 'Miguel Angel', 'Saldaña', 'miguel.saldana@berel.com', 'Berel', 'Analitica de Datos', '', 't', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Lead'),
  ('3c56e8cf-017d-4170-9f1d-bc424dc4936f', 'Carlos', 'Meraz', 'cmerazl@ccambiental.com', 'CCA Ambiental', 'Pendiente', '614 174 8194', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('dda08a38-0ae1-42fe-b1af-ba744c61c530', 'Jonathan', 'Alarcon', 'direccion@solar-mex.mx', 'Solarmex', 'Director General', '614 177 7696', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('5e089020-9888-48b8-a54b-626e780147c8', 'Ian', 'Robles', 'ian.robles@gruporosa.com.mx', 'Grupo Rosa', 'Director', '614255 0393', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('3cbed245-fb4a-4882-808b-301eb17b117f', 'Jonathan', 'Moreno', 'jmoreno@dincosa.com', 'Dinco', 'TI', '614 195 4179', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Lead'),
  ('b9da80dd-54e2-418d-9822-641371469845', 'Norma Mayte', 'Erivez Medina', 'mayterives72@gmail.com', '(Jumex)', 'TI', '63 5106 8117', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('3dad64ac-a545-4783-a77d-80661b00e82d', 'Hiram ', 'Gutiérrez', 'hiram@hgsupply.com.mx', 'HG Supply', 'Dueño', '81 1990 6989', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('473a1fcc-e938-46e9-bb9b-84dad2e631ed', 'Gonzalo', 'Viquez Molina', 'gviquez@databicr.com', 'Databi CR', 'Gerente', '+506 8858 6650', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('ccda5ba3-a7a0-4972-8cee-6da9a399c50e', 'Román ', 'Becerra Montaño', 'rbecerra@affisa.com.mx', 'AFFISA', 'Director de Operaciones', '5520622515', 't', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Lead'),
  ('41d31e59-7f49-4f02-8da0-6fef1fd3098d', 'Salvador Leopoldo', 'Tijerina', 'salvador.leopoldo.tijerina@gmail.com', 'MYS Consultoría Energética', 'Socio co-founder', '81 1817 0634', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'Santos Ramiro', 'García Rodríguez', 'director@esfuno.com', 'Esfuno', 'Director General', '+52 8341440936', 't', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Lead'),
  ('5e7b2f09-747a-4f14-9eba-7f75bdcff012', 'Yonnatan', 'Casir', 'ycasir@fibrauno.mx', 'Fibra Uno', 'Director TI', ' 55 4170 7070', 't', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Contacto'),
  ('8e7d05d0-9f2a-4d5a-a3fe-0404f6f6bad9', 'Idalia', 'Álvarez', 'idaliaa@rsimexico.com', 'RSI México', 'Sales Manager', '6646656494', 't', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Contacto'),
  ('ee3b37a6-61dc-4f83-9d13-aa07d96d401b', 'Simón', 'Cruz Rojo', 'scruz@grupobmv.com.mx', 'Bolsa Mexicana de Valores', 'Inteligencia de Negocioa', '', 't', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Lead');



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.expenses


--
-- Data for Name: interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.interactions
INSERT INTO staging.interactions (id, comment, created_at, opportunity_id) VALUES
  ('59d688af-fca7-4e7e-930d-b1c25664b548', 'Lunes 6 de octubre tuvimos sesión con nuestro equipo técnico para explorar soluciones. No se conectaron, mandé correo para reprogramar sesión.', '2025-10-07 20:13:31.873509', 'fc563b86-6645-4901-aed7-ccb666a70bfb'),
  ('104d1336-c50e-465f-9bda-553813f1fcf9', 'Oct 7 mandé propuesta de servicio y solicité una sesión para revisarla en conjunto', '2025-10-07 22:10:46.818552', '66031b4d-cc1a-4543-9981-c9f3029bc1f5'),
  ('bb58d739-71d5-4e54-94b4-df568fa0620c', 'Estoy en espera que me de fecha de reunión, para invitar a Ricardo (Consultor Externo Portal de facturas) y se realize un levantamiento de información.', '2025-10-07 23:13:17.51165', 'd30069d6-655b-4460-8375-f7cf2b561806'),
  ('592273f3-c028-400a-bfaa-10e1ed300cfd', 'Estoy en espera me confirme reunión con su director de operaciones para presentarle el tablero de BI DEMO que Mario elaboro.', '2025-10-07 23:13:53.505017', 'c621b04c-5fa5-41f6-b19b-e01a3de3882a'),
  ('65b8ce78-dd90-4e31-9e05-931a59f863c8', 'Estoy en espera que el cliente nos indique si el costo que le compartimos fue de interés para su cliente y seguir con el proceso de elaborar una Propuesta', '2025-10-07 23:14:39.539622', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('6e465177-5214-450d-8ffb-f589cd7f26bc', 'El equipo técnico de Tibs esta elaborando el alcance técnico y la propuesta, se tiene contemplado una reunión con el equipo de facturación de Sky Angel para mayor entendimiento.', '2025-10-07 23:18:23.93172', 'a689919a-b00e-4178-8c45-3fb40747c045'),
  ('4134fb6c-4542-4240-87bf-e6004255c3fc', 'El cliente esta evaluando la propuesta, nos comento que en estoy días tomara la desición.', '2025-10-07 23:19:02.998494', '3758043d-a008-4131-b247-68e19f6abc40'),
  ('9f01b785-b78e-4566-9a58-04b4ac034e75', 'Todavía no les dan el fallo de quien es el ganador en el proyecto de Walmart', '2025-10-07 23:20:35.871576', '16f9203a-7a14-4ca5-9e70-65b2d1f75488'),
  ('00fdf843-68cd-4baa-a97f-a325b52c3f01', 'Mandé correo al área de compras, sin respuesta. Y contacté por correo a Candi y Sergio para agendar una sesión y ver si se puede prestar el servicio a través de su proveedor actual.', '2025-10-16 19:20:55.126817', '66031b4d-cc1a-4543-9981-c9f3029bc1f5'),
  ('edfca3d9-df5b-4c72-8be6-7cd211b2b5e1', 'No recibimos respuesta desde el 6 de octubre, no han respondido ninguno de los correos pidiendo reprogramar.', '2025-10-16 19:27:44.319662', 'fc563b86-6645-4901-aed7-ccb666a70bfb'),
  ('2db98268-caa3-4270-8085-8233b7c7967b', 'Dijeron que están en época de auditorías y puede que el área de compras tarde en poder revisar el proceso. Ya se enviaron 2 correos de seguimiento.', '2025-10-16 19:31:09.291472', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1'),
  ('c64962ec-23d9-46da-9168-d773255772a5', 'Freddy me comento que tomaran el requerimiento de manera interna.', '2025-10-16 19:55:15.788031', 'fdff99c1-d090-4725-83c8-bc049faec948'),
  ('a3917390-140a-42ab-91db-3a01f5165d18', 'Como estrategia se acordo que se le presentara al prospecto una solución de desarrollo de Portal de Recepción de Facturas.', '2025-10-17 00:02:25.347694', 'd30069d6-655b-4460-8375-f7cf2b561806'),
  ('da923dfd-5538-402f-b3ee-28b7f9bb7689', 'Ariel comento que la negociación esta detenida por las penalizaciones que esta solicitando Walmart', '2025-10-17 00:17:14.750066', '16f9203a-7a14-4ca5-9e70-65b2d1f75488'),
  ('de2a886d-5be4-42d9-a92e-676461f6e9fe', 'Según los comentarios del prospecto nuestra solución cumple con sus requerimientos y al parecer no hubo un objeción cuando se le pregunto por el costo. Nos pidio darle mas tiempo para que ellos terminen su proceso interno de compra', '2025-10-17 00:21:31.167671', '3758043d-a008-4131-b247-68e19f6abc40'),
  ('547e83d5-b3e4-45bc-8c03-8b2e9dae8dfc', 'El prospecto no esta priorizando la reunión con nosotros, es decir si hay interes leve, pero no hay urgencia. El nuevo mensaje que se le envío al cliente habla de beneficios directos que sí le duelen (automatización, regulación, escenarios) solicitandole un par de alternativas de reunión, sin vernos desesperados, como los anteriores mensajes.', '2025-10-17 00:33:46.821068', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad'),
  ('b76816f0-4fb9-4018-86d6-c01eb9afd766', 'Contacté a Sergio y Candi por WhatsApp, sin respuesta.', '2025-10-20 16:47:41.560304', '66031b4d-cc1a-4543-9981-c9f3029bc1f5'),
  ('a17f8ab7-ea79-4224-ba42-04cdb8798f39', 'Se llevará de manera interna', '2025-10-20 16:56:42.609781', '2c5bc58c-a953-4c94-8bb1-2fc0e96d048e'),
  ('709e594b-79ff-4bd2-b109-eff9dc91d810', 'Estos son los dolores actuales del área de finanzas de Sky Angel: - [ ] Proyección Flujo de Efectivo
- [ ] Conciliaciones para temas de Impuestos
- [ ] Evaluación de Resultados por grupos de negocio
- [ ] Reportes de Presupuestos 
', '2025-10-20 19:51:50.58517', 'da170cae-3a57-421f-9b3c-923f70c7303e'),
  ('7895e948-e44f-4d20-bca5-739e9bbd0be4', '24 oct Se tuvo una Presentación con ellos y lo que estaba buscando era una solución de OCR, se les ofreció  IBM Watsonx.ai  en la nube. 
Se tiene planeado la siguiente semana tener una segunda reunión para la DEMO de OCR ( IBM Watsonx.ai )

', '2025-10-24 21:39:27.875339', '6182781a-4f62-4970-8e4b-91e1999a52a4'),
  ('826aac87-65d7-4ae7-b620-e0cafeda4b65', 'Se reviso la propuesta con Richi, y posteriormente con Ariel (Sky Angel), para que se pudiera liberar al cliente final (ONE), se adjunta la propuesta a Friday', '2025-10-31 16:57:54.617186', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('33e9cc64-8c27-48bf-b51b-7a60b69f99f2', 'El cliente busca automatizar el seguimiento del presupuesto mensual y el control de gastos semanales.
La idea es que la persona encargada del presupuesto pueda reportar automáticamente el gasto y el
saldo restante cada semana. También se mostró interés en automatizar el control de facturas, buscando
herramientas que faciliten registrar y supervisar las facturas sin que se pierdan.', '2025-10-31 18:11:14.161584', 'fac1185d-9ddd-49f4-a746-7104c3a95bae'),
  ('6b303d65-4e36-4ba9-8fb1-95925bfca95a', 'Se confirmó el 17 noviembre 2025', '2025-11-20 16:23:14.824633', '1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e'),
  ('b84b87ab-1582-4305-91e4-482d70c27d1a', 'Se confirmó el 13 noviembre 2025', '2025-11-20 16:23:50.59551', '4ff9968a-7bd8-49bf-853b-225144c2676e'),
  ('aea7f8d3-1fa3-4fd2-96cc-e0134987f6e3', 'Se confirmó el 5 noviembre 2025', '2025-11-20 16:24:33.533038', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d'),
  ('ce56217f-bb20-4823-9b8d-60f19f7f0306', 'Se confirmó el 12 octubre 2025', '2025-11-20 16:26:53.710097', 'f8586d2b-aa1a-44de-ab10-857f9b27523d'),
  ('fb28fc76-68d0-420c-85c7-a76e4aa78457', 'Se confirmó el 27 octubre 2025*', '2025-11-20 16:27:47.407184', 'f8586d2b-aa1a-44de-ab10-857f9b27523d'),
  ('ea252b8e-8cdd-46f5-aee1-f59b8b4f32c3', 'Alberto pide poner en pausa el proceso y retomar la segunda semana de diciembre.', '2025-11-24 17:48:23.30142', 'd48d5414-5854-4c8c-96f9-27e6cc54257c'),
  ('11700373-6266-4529-a00c-1972136fd41d', 'Fecha de cierre 18 de noviembre ', '2025-11-25 16:30:04.614139', 'b191291b-c7cd-4a9d-9e99-7224e186274b'),
  ('afa88937-c126-4a6b-b98e-71b7a79ddbe7', 'fecha cierre 17 de octubre ', '2025-11-25 16:31:02.598993', '3a017b60-3c2a-49ed-b477-6925e76d3b95'),
  ('44373e72-c4e1-4b9c-8b8b-a4b3a600b6d6', '24 de octubre fecha cierre ', '2025-11-25 16:32:41.596682', '7c3019f6-3725-451b-af89-570aa989d1f9'),
  ('e0174803-c1e1-40cc-9685-b8aac7e67598', '10 de noviembre - fecha de cierre ', '2025-11-25 16:33:08.519325', '373f51e5-d2ac-4427-9711-5471a3ec74b4'),
  ('5bf0c408-bf5f-4ae9-87c9-0435f7965e92', 'viernes 14  de noviembre - cierre ', '2025-11-25 16:54:32.332135', '90321cca-9746-4f73-b338-5d327e33387b'),
  ('e8d8df1c-8db8-4d78-abdc-2af93b00d1b6', 'Se tuvo presentación de DEMO breve el 22/Nov y se  solicitó tener una sesión de continuidad el 15/Enero (ya se envió meeting) para contemplar el alcance de la solución con las áreas de TI, Controlling y Finanzas', '2025-11-25 18:28:58.819401', '603e4f29-6123-47f7-9565-6dd9c42e4b43'),
  ('e6f2670d-2939-48f2-885b-0de640891048', '200 integraciones 
ejemplos: 6 transacciones por día. 

transacciones al día, 200. Unas mil o 2mil diarias. 

QA: *Pocas*
Productivo *90mil transacciones al mes*
ambientes: *QA y PROD*  
', '2025-11-27 22:54:17.995817', 'fe3bd828-0464-40b9-8923-27af7966abeb'),
  ('3149aa7c-d0e4-4f02-a1b6-9a8fe34b873d', 'Platique con Gabriel, y me comento que hay muy altas probabilidades de que se cierre el proyecto con nosotros, este final de año podemos adelantar con la parte de las defdiniciones del proyecto (DEMO, Propuesta, Contrato) y en principios del año se puede cerrar.
Hay que focalizarnos mucho en la presentación de la DEMO con los cambio que solicito el cliente y en la presentación de la misma ya que estará todas las áreas involucradas, ser muy recepctivos en los requerimientos que surjan en esa junta y tener claro los argumentos con los que vayamos a responder, sería importante que este presente un técnico de IBM para estar mas tranquilos.', '2025-11-28 16:15:43.316383', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('d38f8af7-bb4a-49dd-a220-c18f7757120d', 'Se recibieron comentarios por parte de soporte de EXIROS acerca de que debían subirse nuevamente documentos de TIBS para darse de alta como proveedor. (recibidos a correo de Ivonne)
Una vez que indiquen que todo está ben se procederá a enviar propuesta (se compartió a Ivonne para revisión)', '2025-12-02 23:17:55.580401', '124615c1-b567-4542-b94e-0fdbf997f56e'),
  ('655ba517-0f10-47e2-9978-86e2fc67f5d1', 'Se han enviado dudas a Diego Vera ya que se ha tenido problemas con el portal y la opción para subir la propuesta comercial y no se ha tenido respuesta.

Se envía correo a Pedro Moreno para reiterar interés en continuar en su proceso', '2025-12-05 19:38:04.884801', '124615c1-b567-4542-b94e-0fdbf997f56e'),
  ('adbff0bd-7ac1-4066-a075-5f68ad777594', 'Vía correo menciona que se verá la propuesta comercial internamente a partir del 10/DIC a partir de ahí se pondrán en contacto para posibles siguientes pasos', '2025-12-05 20:48:42.220671', '38700b57-f773-4082-a629-e9efb971cd82'),
  ('829d35c3-4375-456c-9396-36fbc9f6b6dc', 'Seguimiento para ver si nos envían los detalles de la vacante o si ya tienen', '2025-12-08 23:36:54.892296', '17c12f44-ae2a-4476-8022-1a1c1dc002e1'),
  ('e07420f6-b3a8-41ae-8168-6423c3bcd9ec', 'No responden desde el 8 de octubre. Hoy 9 de diciembre le escribí correo de feliz año y que estamos al pendiente si en el 2026 están interesados en proyectos, que podemos iniciar la conversación desde ahora.', '2025-12-09 16:04:37.086438', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1'),
  ('8ba20cf0-4300-48f3-800a-bed48770095c', 'El equipo de TD SYNNEX sigue trabajando en el demo, para presentarnoslo el lunes 15 de diciembre. Ya le escribí a Jorge de OUP que seguimos trabajando en el demo y la próxima semana le aviso para agendar la sesión para presentarlo a su equipo.', '2025-12-10 18:46:35.096125', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('64c30944-893a-49ab-8bf5-3a22533e60cc', 'Se envió NDA y brochure OCR, Queda pendiente recibir NDA de DART para su firma y tener sesión con equipo de IT de DART', '2025-12-11 16:30:51.545893', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a'),
  ('44850f57-f9a8-4766-9495-d0e3624d0016', 'Visita a cliente para dejar regalo, se hablaron posibles proyectos a futuro', '2025-12-11 19:00:59.696504', 'd48d5414-5854-4c8c-96f9-27e6cc54257c'),
  ('5483c142-4d39-4e8d-9b42-7d0c752139ca', 'Se recibió correo por parte de Ana Victoria aportando la oferta para comenzar con nuestros servicios.
Se comienza con registro en portal para NDA (Diana apoyará con eso) y posteriormente se contemplan 2 reuniones:
-Reunión de negocio: El objetivo es explicar a nivel negocio le requerimiento a automatizar
-Reunión técnica: El objetivo es conocer la infraestructura y a nivel técnico que esperan.', '2025-12-12 18:54:46.197186', '38700b57-f773-4082-a629-e9efb971cd82'),
  ('77818ba7-275f-456a-b30a-38f1fa4140b6', 'El miércoles 10 de diciembre dejé los regalos navideños de Marco Antonio Piñones y Adrián Ayala en la recepción de PAYNAU, como ellos pidieron. El viernes 12 le mandé correo a Adrián preguntando si lo recibió (sin respuesta). Lunes 15 le escribí correo a Marco Antonio, estoy esperando respuesta.', '2025-12-15 16:34:12.08052', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9'),
  ('46ae9a57-163d-4645-a469-38ac18d02ad5', 'Se realizó solicitud en el portal de Salud Digna para firma de NDA con  representante legal de TIBS. (Diana Hernández realizó este proceso)', '2025-12-17 19:31:36.79573', '38700b57-f773-4082-a629-e9efb971cd82'),
  ('417aa409-cf8c-4791-a58d-8bca77b1a95d', 'Se subió al portal lo solicitado para la licitación.', '2025-12-17 19:33:20.943516', '124615c1-b567-4542-b94e-0fdbf997f56e'),
  ('cd7bb5ef-09d3-4598-963f-e6e9b0368f6b', 'Sesión con TD SYNNEX para revisión de demo', '2025-12-17 21:39:08.305259', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('a0441d2c-cf09-4309-b7e4-706f584810bb', 'Comunicación con cliente y con TD SYNNEX para agendar presentación de demo', '2025-12-17 21:40:06.525389', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('75f282ee-a271-44e7-b8ad-4b357c69bf1d', 'Correo con tarjeta de navidad', '2025-12-17 22:10:50.160918', 'd48d5414-5854-4c8c-96f9-27e6cc54257c'),
  ('21ae680d-a0a4-446b-ab43-a1d9c661f827', 'Correo con tarjeta de navidad', '2025-12-17 22:11:07.662028', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('fa9225a1-854e-4862-bb00-3ceec548f6ba', 'Correo con tarjeta de navidad', '2025-12-18 16:55:06.702741', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9'),
  ('085fac18-dc6a-467f-a2fe-f7018496079a', 'Correo con tarjeta de navidad', '2025-12-18 18:10:13.922455', '90321cca-9746-4f73-b338-5d327e33387b'),
  ('9bcdf556-6be5-487b-ac35-e3b08c2e11f6', 'Correo con tarjeta de navidad', '2025-12-18 18:11:01.696803', '17c12f44-ae2a-4476-8022-1a1c1dc002e1'),
  ('ce3a9a7e-e569-462b-9a68-597212e38a84', 'Se solicitó cotización previa a reunión con equipo IT', '2025-12-18 23:36:48.050991', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a'),
  ('c8b2c8e6-7668-443a-9e0a-eaf57f2a5f12', 'Se firmó NDA el 23 de Diciembre, en espera de siguientes pasos y reunión con equipo de Ana Victoria.', '2025-12-31 16:06:15.018052', '38700b57-f773-4082-a629-e9efb971cd82'),
  ('d9172e31-de7c-416f-9ddd-7458941a88b7', 'Se propone reunión para presentar propuesta 6o7 de enero', '2025-12-31 18:32:49.55566', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a'),
  ('69956d72-c877-4f1c-a672-55ac6a4a7dd7', 'Se envía correo a Pedro para preguntar por estatus de licitación', '2026-01-02 16:05:08.320744', '124615c1-b567-4542-b94e-0fdbf997f56e'),
  ('9e7b41ce-c4fd-4b42-970f-508fad805764', 'Se envía correo para preguntar siguientes pasos acerca de reuniones con equipo técnico.', '2026-01-02 18:17:58.982021', '38700b57-f773-4082-a629-e9efb971cd82'),
  ('8bd31485-dfba-469e-9e3e-656367bfc00b', 'Envío de Propuesta de Servicio Fase 0', '2026-01-07 00:19:45.736766', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('d5d9a3b5-124b-4e1d-9728-670ec1f3b35d', 'Buscar el jueves 15 de enero para decisión. ', '2026-01-12 17:39:25.446832', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446'),
  ('fb2a2f96-570e-41c7-ae44-653f2a055523', 'Sesión con el cliente de revisión de propuesta', '2026-01-14 09:04:23.158371', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('db30b2d3-edd8-4bea-b543-6814194285f7', 'Tuvo cambios en su equipo de trabajo, no se han hecho las pruebas. Quedamos en tocar base el jueves de la siguiente semana, jueves 22 de enero, para esa fecha ya debieron haber realizado el proceso para avanzar con la propuesta. 
', '2026-01-15 14:35:02.283073', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('3ca3509e-9824-43fd-9f0f-ea9ea2b00f09', 'Se tuvo reunión para presentar proyectos que validen experiencia por parte de TIBS, se acordó tener nueva reunión para conocer herramienta actual con el equipo de planeamiento (TECHGEN propondrá fechas)', '2026-01-16 10:12:16.611686', '3fa33b33-d95b-4c06-ac49-76682954e01b'),
  ('78617b1c-7131-4502-afe0-d1c4055998f2', 'Se aceptó invitación a licitación en portal de EXIROS y se descargó información para realizar propuesta', '2026-01-16 11:20:42.859881', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('6f306a25-0165-4fcc-b3a4-f9009e956abc', 'Envío de propuesta de servicio con correcciones', '2026-01-16 17:38:07.318369', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('7c91f75c-ec42-40c4-866c-85f18db85eab', 'Envío de Propuesta de Licenciamiento', '2026-01-16 17:38:34.549119', '87868565-0b10-472f-afa1-994cac8f3d6b'),
  ('b4697d65-5fd6-4016-a9ea-13060f4331b6', 'Presentación de servicios a Konfío', '2026-01-16 17:42:55.148494', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee'),
  ('bed0ef14-2168-4139-a6dc-217b7c462922', 'Pedo Eloy informó vía WhatsApp que se eligió otro proveedor.
Agrego mensajes:
"Hola Mónica, el proceso anterior ya fue cerrado, se adjudicó a otro participante, creo recordar que ustedes quedaron en 2do lugar por eso los recomendé con Guadalupe para que los incluyeron en el nuevo proyecto de gestión de Proyectos"

Motivos de elección:
"Si al final el tema de la tarifa y que el proveedor ya tenía un historial con empresas del grupo es lo que mas pesa, sin embargo ya no puede participar en próximos proyectos asi que se abre la oportunidad para nuevos proveedores"', '2026-01-18 16:31:51.400551', '124615c1-b567-4542-b94e-0fdbf997f56e'),
  ('902ddf10-e476-4a1b-a68a-7f8ebf4778be', 'Se tuvo reunión para dudas técnicas, estuvo presente Héctor, se trabaja en propuesta técnica y economica, el cierre de licitación se cambió para el 28/Enero', '2026-01-19 13:35:14.43323', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('9b217bc9-8697-4e42-8d0a-815f9a28dff6', 'Se confirma reunión de presentación de propuesta para el 27/Enero a las 12:30 hora MTY', '2026-01-19 13:51:22.940857', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a'),
  ('f7280068-df97-435f-81d6-c70bf1f30518', 'Se solicitó a EXIROS reunión técnica con el equipo de TECHGEN para que muestren los reportes que se consideran parte del desarrollo donde se agrega a Abel para dimensionar.', '2026-01-21 12:05:39.656298', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('9c1550e0-3e54-4675-90b1-59f0a944ce79', 'Se tuvo reunión técnica con el equipo de EXIROS Y TECHGEN donde se unió a Abel para ver la parte de desarrollo y dashboard sumados a la propuesta', '2026-01-27 15:39:09.206241', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('42fda82d-63d6-4596-b52a-b7103ad84c4e', 'el 28 de Enero (cierre de licitación) no se pudo subir propuesta por error del portal. Avisaron 29 de enero que se extendió una semana mas la licitación, en espera de que se abra nuevamente en el portal', '2026-01-29 17:24:21.678171', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('ffabb57b-aa0e-4715-9e1e-302ca9ea8855', 'Agendar Presentación OCR', '2026-02-03 09:50:11.256228', '1d1a2269-b87f-4970-90ec-0b5835df4922'),
  ('7b4eec73-657f-4e91-943a-33e2af69115d', 'Presentación de demo OCR y de servicios', '2026-02-04 13:28:55.109501', '1d1a2269-b87f-4970-90ec-0b5835df4922'),
  ('2339263f-0f02-499a-963a-e2d7713e6d79', 'Envío de presentación posterior a sesión', '2026-02-04 13:29:36.51368', '1d1a2269-b87f-4970-90ec-0b5835df4922'),
  ('a5b84315-74df-4da8-b246-95d777b62bbc', 'Se subió la propuesta al portal de EXIROS el 4/Enero ', '2026-02-05 12:05:59.169978', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('318178c8-e981-42c9-ac60-a53e461bf573', 'El proyecto se encuentra en pausa, comenta Guadalupe que se tuvo una reunión con la directora de IT y van  analizar cuál es el mejor camino porque están en transición tecnológica. ', '2026-02-11 13:53:42.500004', '3fa33b33-d95b-4c06-ac49-76682954e01b'),
  ('f7a1e1fa-ca94-4f4d-88e1-472e683488fa', 'Presentación DEMOs de desarrollos para explorar requerimiento', '2026-02-17 17:37:41.630322', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('6521f2e5-765b-4597-a12e-ccfb76a8db80', 'Seguimiento para agendar próxima sesión con equipo técnico', '2026-02-17 17:38:53.86985', '1d1a2269-b87f-4970-90ec-0b5835df4922'),
  ('50549d07-bc8f-4e32-bbe4-32b2da43d6db', 'Instalación de Software a equipos de cómputo nuevos y migración de información de equipos obsoletos. Entrega de equipos (31,176) con "puesta a punto" en distintas ubicaciones de CDMX.

Se envía información a Ivonne Cabriales para tener cotización máximo el viernes 20 de feb.', '2026-02-19 12:53:33.245956', '72e67258-5d97-4199-ad06-37d04e1c6f48'),
  ('d2798234-f41d-4651-9c8e-064acf17cf3e', 'De inicio, hay oportunidad para ver cómo podemos ayudar a mejorar sus informes de "Clima Laboral", ya cuentan con las preguntas que se realizan y actualmente están haciendo las encuestas con Gallup y están evaluando una nueva herramienta que es Qualtrics. ', '2026-02-19 13:03:53.778925', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f'),
  ('13e217ce-d998-44a8-90f0-bebdde4b32a6', 'El proyecto requiere mucha logística y seguridad. Por lo que completo no lo tomaremos, esperaremos a ver si Maysoft puede conseguir la logística y TIBS solo poner la mano de obra para instalación y respaldo de equipos.', '2026-02-24 14:34:46.387556', '72e67258-5d97-4199-ad06-37d04e1c6f48'),
  ('6fc778df-1696-4612-bda9-6b60ea4384ee', ' -Desde el 2025 dejaron a Gallup por costo. 
- El año pasado se hicieron solicitudes de encuestas a las áreas personalizadas en FORMS. 
- Administradores son 200 y colaboradores 40mil.
- Toda su base de datos de empleados la tienen en Succes Factors.
- En cuanto al personal son 5k personal administrativo y los 35k restantes se encuentran en planta o logística, por lo que ellos responden las encuestas en Kioscos.
- La encuesta de clima se hace un año si y uno no en el mes de julio-agosto, el resto del año se hacen pulsos, estos pueden ser trimestrales, cuatrimestrales o semestrales (depende de la intención).

Requieren:
- Recomendación también de las preguntas de clima organizacional.
- Reportes vistosos, llamativas, avanzados, utilizan PowerBI, que les permita hacer cambios.
- Plataforma auto-gestionable
- Reportes bien segmentados, que puedan personalizar, ya que con Gallupp estaban limitadas las vistas.
- No todas las laptops pueden trabajar con PowerBi, prefiere reporteo dentro de la plataforma.
- Se pueda dar seguimiento y cumplimiento a los planes de acción y agregar un apartado para accionables para mejorar los resultados. (apartado de área de control donde se pueda registrar planes de acción)
- Mejorar la experiencia de los usuarios (administradores y los que gestionan)

Datos adicionales:
- Van a volver a licitar este proyecto ya que hace 2 semanas se fué la que era jefa de RH y acaba de llegar la Vicepresidenta de RH y necesitan lanzar de nuevo la licitación.
- La solución por la que estaban decidiendo anteriormente es Qualtrics', '2026-02-24 14:47:58.106613', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f'),
  ('312a78b7-396c-49ef-8cea-926ee605f8af', 'Pide retomar comunicación a finales de Marzo.', '2026-02-26 11:45:41.976271', '7f89279a-8810-49b6-9b6f-fd458d0ca0e8'),
  ('b51907ea-b78f-4e18-889a-1d284ee2caba', 'Se tuvo Presentación de DEMO OCR+IA donde quedó como acciónable el realizar cotización contemplando 250 llamados por día, contemplando los 7 días de la semana.', '2026-02-26 17:48:31.734', '33f729c3-5348-4667-b637-9c5873828fd5'),
  ('3d5782ba-0380-4405-827f-897c243f7309', 'Sesión para ampliar información faltante para propuesta', '2026-03-04 10:17:42.524067', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('97e7d702-4048-4f6c-9b60-e98653e49862', 'Correo de seguimiento para agendar sesión', '2026-03-04 17:33:12.73933', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6'),
  ('64bc333d-13a6-48e4-a1f7-6a997b2003a3', 'Se tuvo reunión de aclaración de dudas con el equipo TI de TECHGEN, se pidió un video donde se pueda mostrar parte de la funcionalidad del desarrollo, se entregará para el Martes 10 de Marzo. ', '2026-03-05 12:20:49.929469', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('2eaf2a2a-a870-4b0a-9e46-b87ebe935cc9', 'Se presentó solución Visual Inspection por parte de equipo de IBM, se acordó preparar cotización ', '2026-03-05 12:22:25.099934', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d'),
  ('a89379fc-e233-4e37-8c81-4c2b0e4f8d58', 'Sesión agendada para presentación de propuesta', '2026-03-11 14:07:18.111323', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('23eccc21-875a-496b-b002-cd2b9ab98903', 'Se tuvo sesión para levantamiento de requerimiento nos compartió documentación para tomar en cuenta para su cotización. Se comienza con propuesta comercial', '2026-03-12 11:32:54.831225', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1'),
  ('959b48a2-c249-45ce-9c8a-8fb51abcb878', 'Sesión de presentación de Propuesta de Servicio', '2026-03-13 17:29:25.375501', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('feab1ed4-024c-4a5d-ab67-e0647cd7ce14', 'Envío de Propuesta de Servicio', '2026-03-13 17:29:56.363646', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('d492ecc1-5f3d-4717-82ba-f9c2b2113c19', 'Seguimiento para agendar siguiente sesión', '2026-03-18 10:50:56.590067', '1d1a2269-b87f-4970-90ec-0b5835df4922'),
  ('aa50c918-19f9-4076-b2a1-721c587d5754', 'Comunicación para coordinar visita y revisión de propuesta', '2026-03-20 14:32:18.070762', 'a167b4fe-927e-48ea-810f-81a6d21b2bde'),
  ('a45b6d5d-db64-4c30-9010-2bd0c15d63c2', 'Comunicación con Daniela para algún update', '2026-03-30 16:03:52.352385', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee'),
  ('e7b1e0da-29ad-493e-b2b4-fdd3d7c729fe', 'Se pasa a cancelada la optty ya que el cliente dejó de responder. ', '2026-03-30 16:59:49.81487', '603e4f29-6123-47f7-9565-6dd9c42e4b43'),
  ('2322a247-718a-4281-bbf8-534f220df0c2', 'Comunicación por Linkedin para agendar DEMO', '2026-03-30 18:20:57.964493', '17befe8b-91c3-4fe2-b288-d18f060ffbd6'),
  ('d97bcab1-c625-4909-8ee3-968b26c2461e', 'Mensaje para retomar conversación', '2026-03-30 19:07:00.585232', '18bfd5ba-36d8-43c4-884b-a47abe73f592'),
  ('940260ae-6045-4d4c-a4f3-0577dd7a40ec', 'Guillermo detalla tres áreas principales en las que busca soluciones:
1.  **Reclutamiento con inteligencia artificial:** Ya lo están utilizando con éxito y buscan integrarlo más para optimizar el equipo.
2.  **Gestión en el punto de venta:** Necesitan automatizar tareas y monitorear su cumplimiento en tiempo real en 650-620 puntos de venta. Menciona el problema de la falta de visibilidad sobre las actividades de los gerentes regionales y la ineficacia de la comunicación por WhatsApp.
3.  **Capacitación interactiva:** Buscan una solución más avanzada para la capacitación, ya que los cursos actuales, aunque funcionan, son complejos de gestionar y escalar.

Guillermo enfatiza que busca soluciones ya existentes y listas para conectar, no desarrollos a medida que requieran mucho tiempo. Sus experiencias previas con soluciones de reclutamiento y cursos piloto han sido exitosas precisamente por su rápida implementación.

Guillermo reitera su necesidad de soluciones "plug and play" y expresa su reticencia a iniciar un desarrollo desde cero que podría tardar meses. TIBS aclara que, aunque sus soluciones son a medida, tienen bases y herramientas (como IA de IBM Watson para lectura de tickets o automatización de cobranza) que pueden reutilizarse, pero que un análisis previo sería necesario para determinar el tiempo y el alcance.

Finalmente, Guillermo sugiere que TIBS envíe su presentación y que él la compartirá con su equipo en la junta semanal de "desarrollo futuro" para evaluar posibles colaboraciones.', '2026-03-31 16:49:13.109356', '73176e11-565b-48c7-b330-ef0001ce3401'),
  ('5ca79fee-6b49-4bb0-9aae-be2a2695604f', 'Buscar a partir del 13 de Abril', '2026-04-07 22:11:00.939792', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1'),
  ('d1c69ca1-5ddc-4b18-8e49-7647c237b6c0', 'Buscar a finales de Abril para retomar contacto ', '2026-04-07 22:11:30.148379', '7f89279a-8810-49b6-9b6f-fd458d0ca0e8'),
  ('4e01f03a-9443-43c4-bf08-0535eb49c1d1', 'Se tuvo reunión para retomar contacto, solicitar CSF, presentar equipo de IBM, conocer status ARCELOR y poder avanzar con estimaciones.', '2026-04-09 21:59:41.272652', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d'),
  ('78657a5e-a93a-4a46-8923-1060148bb9a5', 'Se reunirá con Mario en Tijuana en Evento de Webmethods el 16 de abril, contacto por WhatsApp', '2026-04-09 22:00:21.727419', '6c147c42-47f4-45f2-ae85-031848a65906'),
  ('b6251669-0441-4ec3-b129-dde220189df3', 'Llamada Martín, sin respuesta, para confirmar inicio de proceso', '2026-06-03 21:00:18.183193', 'c2cea0f5-850e-487b-b9b8-c59225c6b6ee');



--
-- Data for Name: nueva_tabla; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.nueva_tabla
INSERT INTO staging.nueva_tabla (id, date, activity, "activityType", "opportunityId", "userId") VALUES
  ('5a6d3df6-8234-4326-ad14-025e768912d2', '2025-10-14 12:50:00', 'Se envió propuesta de Bolsa de Horas ', 'Correo', '7c3019f6-3725-451b-af89-570aa989d1f9', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('942170f5-6b05-42be-87d8-a14b0a5a7a71', '2025-10-16 12:54:00', 'Se envió propuesta de servicio de CC ', 'Correo', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('a3355e81-a8d5-469e-aa4e-9d075bdfd689', '2025-10-16 13:04:00', 'Se envió propuesta por correo', 'Correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1628684e-f7be-4bd1-acfb-897f5755b235', '2025-10-16 13:19:00', 'Seguimiento sin respuesta', 'Correo', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('aa534963-2124-4b97-8d1a-33bdd9b874fe', '2025-10-14 13:23:00', 'Correo de seguimiento sin respuesta', 'Correo', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('eba6f60a-c136-4b36-8915-666986ed4b6a', '2025-10-16 13:23:00', 'Correo de seguimiento para agendar sesión con equipo técnico', 'Correo', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('fc83f6cc-5fef-46d6-b644-91dd89918631', '2025-10-16 13:28:00', 'Seguimiento para agendar una nueva sesión', 'Correo', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6788fb94-3ec1-4950-bd91-f8ab6959e6d4', '2025-10-13 13:31:00', 'Envío de invitaciones al Brunch de Tijuana', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('0f88a2f5-e693-4eb7-bc14-b50670da9eb1', '2025-10-16 15:35:00', 'Seguimiento para alinear propósitos de POC', 'Correo', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('cd22be26-862f-449b-8c01-e7b317d2a92d', '2025-10-17 10:02:00', 'Envíe Propuesta de CC', 'Correo', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ecfe5be7-ae72-45e0-8e88-c2e019cec7d3', '2025-10-16 17:00:00', 'Sesión para platicar sobre el CC', 'Presentación Servicios En Línea', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('32897c99-f3ee-4880-8565-fdf942a0feb8', '2025-10-16 10:15:00', 'Envíe correo de seguimiento ', 'Correo', 'fdff99c1-d090-4725-83c8-bc049faec948', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('7d694b4c-04ef-482e-b7af-69bd04252101', '2025-10-16 15:38:00', 'Se envió correo de primer contacto a Manuel de INTERCERAMIC', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('5dc5d684-8dc8-429c-b673-965aa7f1ad1f', '2025-10-17 15:42:00', 'Primer contacto por LinkedIn con Daniel Romero de Grupo BAFAR', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('6c458801-4c6b-46ef-aef2-e5c6b24764dd', '2025-10-17 09:41:00', 'Envío de primer correo de contacto a César Pérez de SUKARNE', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('dcd4cdeb-8708-4f4a-a5f1-5e47fe51b192', '2025-10-17 09:40:00', 'Envío de primer correo de contacto a Luis Fernando de LA COSTEÑA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('1f48d41a-eaa9-4967-96f7-8feefe31aa42', '2025-10-17 15:44:00', 'Envío de primer correo de contacto a Jesús de ABITAT CONSTRUCTION SOLUTIONS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('9ac486af-eaab-40a0-93f5-94e02ec06953', '2025-10-17 15:46:00', 'Envío de primer correo a Christian A de ABITAT CONSTRUCTION SOLUTIONS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('81f6966f-3867-4611-85a5-33a642de1b1e', '2025-10-20 10:55:00', 'Envié CC actualizado', 'Correo', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d96371cf-083d-4039-becb-560e24ce46c4', '2025-10-23 13:55:00', 'Enviar un correo de los beneficios de las siguientes soluciones que le duelen', 'Correo', 'da170cae-3a57-421f-9b3c-923f70c7303e', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('d265b98d-d597-4225-bbca-179207ed1d91', '2025-10-20 17:04:00', 'Seguimiento para resolver dudas de la propuesta y agendar sesión', 'Correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('bc7b6cc7-bcb7-4846-ab37-25fc49b9f42a', '2025-10-20 17:19:00', 'Invitaciones para desayuno Tijuana. 1 confirmado', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('dc2372aa-f5f2-4c0b-8bfb-49ae0034826b', '2025-10-21 16:55:00', 'Se envió invitación a Tech Brunch Tijuana FOXCONN', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b8cb9930-829a-4a45-9764-de35df67a241', '2025-10-21 16:56:00', 'Se envió invitación a Tech Brunch Tijuana COCA COLA-CDF', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3adfb7aa-6184-46f1-b3c6-5e3e5f9ff190', '2025-10-21 16:57:00', 'Se envió invitación a Tech Brunch Tijuana ALUMINUM SOLUTIONS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3265aa01-9f7a-410b-b4ff-dfd673459c3f', '2025-10-22 17:02:00', 'Envío de primer correo a SAAVI ENERGIA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('04eb0153-00bf-426e-86cc-59c567326b09', '2025-10-22 17:02:00', 'Envío de primer correo a SIST PORTUARIO ENSENADA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('4382f058-ddd6-4753-a0f8-d6b977bd078f', '2025-10-22 17:03:00', 'Envío de primer correo a PRYSMIAN GRROUP', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ebe72403-0764-407c-8b17-15ae2ad68240', '2025-10-22 17:03:00', 'Envío de primer correo a Jhaziel de GRUPO GINEZ', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('a8c7bea5-313b-4abf-8a21-82c317de13ee', '2025-10-22 17:04:00', 'Envío de primer correo a Erick de DULCES DE LA ROSA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('aaff20c4-3b59-43bf-8790-01db0ba5ba0d', '2025-10-22 17:05:00', 'Envío de primer correo a Javier de MEDICA SUR', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('2de55b4d-ca32-4578-bb43-c5665228d4d0', '2025-10-22 17:05:00', 'Envío de primer correo a Yuri de MIELE', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('264ab1ff-e4e3-4c46-b617-ba794dfc3df1', '2025-10-22 17:06:00', 'Envío de primer correo a Aldo de SCHNELLECKE LOGISTICS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('c2e722e1-5a8c-44ec-a58d-b2281b3015f7', '2025-10-23 12:36:00', 'Envío de primer correo a Benny Castañeda de ARCELOR MITTAL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('78d9a638-9533-4094-bc88-b84529cd0b71', '2025-10-23 14:00:00', 'Expo Technology', 'Evento', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ef7e7dec-413f-48e4-992f-3be7496bf19b', '2025-10-24 10:39:00', 'Envío de invitación a TECH BRUNCH CDMX a ERIC de DAIMLER TRUCK', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('5770ba4c-478d-47f9-b2f3-b73d8155e4a2', '2025-10-24 09:16:00', 'Nueva propuesta enviada con modificaciones', 'Correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f99e1b44-636b-466a-b4f4-6fb866980249', '2025-10-24 11:18:00', 'Envío de 3 brochures de servicios a contactos de la ExpoTech', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('8c5bf4f5-0593-4abe-bd04-f9fbbe36efdf', '2025-10-20 03:52:00', 'Se contacta a Hector Ceniceros de IPEC vía LinkedIn', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('d11fc8ed-b331-4b01-9c2a-5247bf6e8eae', '2025-10-24 14:43:00', 'Enviar Minuta de la reunión', 'Correo', '6182781a-4f62-4970-8e4b-91e1999a52a4', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('e4271272-6ee4-4cb8-935b-ddbc64b16369', '2025-10-27 15:48:00', 'Intento de contacto para programar una sesión, sin respuesta', 'Correo', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('47ccace4-1129-4a1e-a929-b65472063ebb', '2025-10-28 12:48:00', 'Invitación al evento CDMX', 'Correo', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('332a8e02-7216-400b-ac11-dac7b6c34676', '2025-10-28 12:52:00', 'Se envío invitacion del evento CDMX', 'Correo', '6182781a-4f62-4970-8e4b-91e1999a52a4', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6fe4d452-3a1c-4213-9418-fdea47a23d2a', '2025-10-28 16:16:00', 'Seguimiento Grupo GINEZ contemplar hasta 2026', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3ae7ad0b-dc7a-4fc4-a77d-20f559dbe762', '2025-10-28 16:17:00', 'Seguimiento DULCES DE LA ROSA contemplar hasta 2026', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('2cd85ba2-4d5d-4f23-9ac5-341fb508e6e0', '2025-10-28 16:17:00', 'Primer contacto con GERDAU CORSA ', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('31e91242-27ba-4cab-af64-d9068a19e65c', '2025-10-28 16:18:00', 'Primer contacto con CLASE AZUL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('90c075b7-4204-446e-95bb-ea4d44e48bb5', '2025-10-28 16:18:00', 'Seguimiento a ARCELOR MITTAL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('32bc098a-abae-4442-b698-4d89829984f7', '2025-10-28 16:25:00', 'Primer contacto con RH de GRUPO BACHOCO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('35e24c79-4910-41fc-bcb3-8a1e68b867f9', '2025-10-29 12:01:00', 'Invitación al evento CDMX', 'Correo', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('29842de4-7bf4-4ea5-9736-aec8d6aec937', '2025-10-29 12:14:00', 'Invitación al evento CDMX', 'Correo', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('96fd12fd-67a0-4a88-aa74-949bbf70b029', '2025-10-29 12:17:00', 'Invitación al evento CDMX', 'Correo', '3758043d-a008-4131-b247-68e19f6abc40', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('9758a8bb-62c6-4d6b-b719-04100ab5bd40', '2025-10-29 12:31:00', 'Invitación al evento CDMX /Grupo GIGANTE/Sandra Arrollo/searroyo@gigante.com.mx', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('1b58ead4-f18e-415b-af83-8043aff702c4', '2025-10-29 12:35:00', 'Invitación al evento CDMX/fernando.dominguez@vertiche.com.mx/VERTICHE', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('cefca53e-1149-4f5b-98e8-c972bd15655e', '2025-10-29 12:36:00', 'Invitación al evento CDMX/raul.benitez@nrfm.com.mx/NRFinanceMexico', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6eb24a1d-fc46-4024-a1fd-a60b49ebd8f6', '2025-10-29 12:38:00', 'Invitación al evento CDMX/jgazca@medix.com.mx/JesúsGarza/MEDIX', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('d15c7288-7a3e-462d-8dc8-111568eee815', '2025-10-29 12:40:00', 'Invitación al evento CDMX/david.diazrivera@edenred.com/DavidDiaz/EDENRED', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('65f60522-0c3c-4626-8bde-b31a1c18e22f', '2025-10-29 12:42:00', 'Invitación al evento CDMX/jgomez@fujifilm.com.mx/JesúsGarduño/FUJIFILMS', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('d1bba801-bac4-4e24-9b79-0eb4cccc4b06', '2025-10-29 12:44:00', 'Invitación al evento CDMX/dponce@saljamex.com/SalchichasJamonesMex', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('f59b731a-73ea-4f56-924c-fa172bdcfe23', '2025-10-29 17:27:00', 'Envío de 55 Invitaciones a Tech Brunch CDMX', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6fd06668-2b2a-4cbd-8b4d-68cad1cb644b', '2025-10-30 09:51:00', 'Invitación al evento CDMX/GuillermoLeon/GrupoBIA', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('f7e4a217-e1cd-48d9-b279-973939ba5bff', '2025-10-30 16:33:00', 'Envío de Brochure a CIO de GRUPO BACHOCO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('5a558812-e6d1-4379-bf62-bb4bcc46bdbd', '2025-10-30 16:34:00', 'Envío de Brochure a Head of IT de GRUPO BACHOCO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('55dc2ad0-8c8f-4cc0-95af-d10c9068935b', '2025-10-30 16:35:00', 'Envío de Brochure a IT Corporate Manager de GRUMA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('861417d8-803b-4e46-9894-6065e3b7b54b', '2025-10-30 16:37:00', 'Envío de Brochure a IT Manager de GRUPO LALA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ab161ba5-ac30-4fb0-91ed-5e17b720b171', '2025-10-30 16:40:00', 'Invitación a TECH BRUNCH a CFO de CONSTELLATION BRANDS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('5cfa53fe-ff86-4472-89b5-cd94dfa791c9', '2025-10-30 16:40:00', 'Invitación a TECH BRUNCH a Financial Planning de TERZA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('d4220b12-74ae-42ac-9067-a4b11f0b62ed', '2025-10-30 16:47:00', 'Se envió correo de primer contacto a Gte de Logística de ALSUPER CUU', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('02888199-3478-45ea-9cf2-a7f34fd44a85', '2025-10-30 10:44:00', 'Envío de Brochure a IT PROJECT MANAGER de FOXCONN Juarez', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('2dcf712b-a0fb-4fda-a6d3-cd823271ae19', '2025-10-30 16:49:00', 'Envío de Brochure a Coordinador Infraestructura de FOXCONN Juarez', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('97c79142-fb88-48cb-9d9b-16864655ec2a', '2025-10-30 17:27:00', '87 invitaciones enviadas para el brunch de CDMX', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('dcdf7813-fd5f-484e-9c56-c48963de75e2', '2025-10-30 17:48:00', 'Seguimiento si ya tienen perfiles que mencionaban y quedaron de enviar', 'Correo', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f802e13f-3216-405c-952f-948a3e8683e2', '2025-10-31 10:49:00', 'Richi esta preaprando una presentación para Tibs Venta(Portal de Recep facturas)', 'Evento', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('ab928b7d-fc8b-4115-9340-affd2ed7bd1a', '2025-10-31 11:08:00', 'Seguimiento para agendar una próxima sesión', 'Correo', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('e2aa92bd-0522-4215-ac20-9e79d5f7a8b3', '2025-10-31 11:48:00', 'Invitación al evento CDMX/PalaceResorts/WilbertMay', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('01642ed4-e3e5-49ab-87b9-1af025220ad1', '2025-10-31 11:50:00', 'Invitación al evento CDMX/ZobeleMexico/AndreaMeléndez', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('41b3bb8c-cc87-45e7-b7b7-0a426552f9a8', '2025-11-03 17:42:00', 'Envío de invitaciones para Tech-Brunch y espera de conexiones por Linkedin', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('b5e9830c-d654-4a84-9652-585b4617b7b0', '2025-11-04 10:19:00', 'Seguimiento ', 'Correo', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('3909a8ee-5016-4678-8783-59aed4a5cf1d', '2025-11-06 11:46:00', 'Primer contacto con RH de ABENGOA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ab133518-8066-47a1-8c3c-496153ef57f9', '2025-11-06 11:47:00', 'Primer contacto con RH de AMAZON MEXICO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('700796cb-ec73-479d-a98d-3c5be9ae4460', '2025-11-06 11:48:00', 'Primer contacto con RH de ANAYAKA TI', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('fa5106f3-517c-4b76-b4b9-b5b87a520d86', '2025-11-06 11:48:00', 'Primer contacto con RH de AXA SEGUROS', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('314107c4-0260-4766-ba09-21c46dd98dd3', '2025-11-06 11:49:00', 'Primer contacto con RH de BAXTER', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('a936ef7d-a0e8-47aa-8af9-96b7a9d71842', '2025-11-06 11:49:00', 'Primer contacto con RH de BBVA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('31117a97-cd48-455e-a3a5-a8e7739ec7e4', '2025-11-06 11:49:00', 'Primer contacto con RH de CEMENTOS CRUZ AZUL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('e8070539-d87f-4179-aa5b-c88320f8ea05', '2025-11-06 11:49:00', 'Primer contacto con RH de CEMENTOS MOCTEZUMA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3a8f6597-3f61-4e7e-aba0-e2338cf1e807', '2025-11-06 11:49:00', 'Primer contacto con RH de GENERAL MOTORS MEXICO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('cbef8772-86a2-4625-8b8f-0173362bacd9', '2025-11-06 11:49:00', 'Primer contacto con RH de GRUPO GIGANTE', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('a0f1c45f-e913-4423-935b-eb4e1c7cfebc', '2025-11-06 11:49:00', 'Primer contacto con RH de HIDROSINA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('0d00ebf5-15f2-4922-9d41-adcd6da15d5d', '2025-11-06 11:50:00', 'Primer contacto con RH de JABIL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ff457409-d009-473a-8740-24c9171f9d24', '2025-11-06 11:50:00', 'Primer contacto con RH de JUGOS DEL VALLE', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('db77df6f-b693-429f-9fe7-1d15e349a436', '2025-11-06 11:50:00', 'Primer contacto con RH de LOREAL MEXICO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('c6f412fa-8554-4d44-a74c-1cec5e2b17c8', '2025-11-06 17:47:00', 'Envío de Brochure a Gerente Operaciones de FORZA STEEL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('40c31ecb-aada-4cf1-a166-e4c5780df045', '2025-11-06 17:48:00', 'Envío de Brochure a  Director de Operaciones de TUBACERO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('d218ac91-7ee1-49f2-9b35-53df1a0db987', '2025-11-06 17:48:00', 'Envío de Brochure a  Gerente de Operaciones de VILLACERO', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('fa208645-c609-41cc-8247-36150509a5e4', '2025-11-06 17:48:00', 'Envío de Brochure a  Director de Operaciones de HOMEX', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('9c400d26-c79d-4d80-b092-f444edd51af7', '2025-11-06 17:48:00', 'Envío de Brochure a  Gerente de Operaciones de URBI', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('9443cf5a-463b-4ee3-ae98-560ea2f086a5', '2025-11-06 17:48:00', 'Envío de Brochure a  Director Operaciones y logística de NEBUCOR', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('13c4b989-a2fa-405e-99f5-c20c12a34e88', '2025-11-06 17:48:00', 'Envío de Brochure a  Jefe de Operaciones Logísticas de ARCA CONTINENTAL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('015945c0-a219-468b-9028-1c59730af443', '2025-11-06 17:49:00', 'Envío de Brochure a  Gerente de operaciones de GEPP', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('2aa68e6a-9723-425a-8b1b-0f473018b572', '2025-11-06 17:49:00', 'Envío de Brochure a  Director Operaciones  de GRUPO PROMAX', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('57e47c57-54de-4df3-81eb-ce98257bae0d', '2025-11-06 17:49:00', 'Envío de Brochure a  Director Operaciones  de NAVISTAR', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ddec5e89-91ce-40d3-a03d-97a1725f221d', '2025-11-06 17:49:00', 'Envío de Brochure a  Director nacional de ventas y operaciones  de BAFAR ', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('175d72cc-6dbf-4b2c-80a5-a30d8b797d5e', '2025-11-06 17:49:00', 'Envío de Brochure a Gerente Regional Noreste  de BAFAR', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('a8c407f5-eeab-474d-a9d7-b3448283dc1c', '2025-11-07 15:04:00', 'Envío Invitación evento CDMX/Grupo Diagnostico PROA', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('91bf48b2-c10d-4909-a745-cec95e10ab91', '2025-11-07 15:05:00', 'Envío Invitación Evento CDMX / Sanchez y Martín', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('77456225-2083-4bd8-8a85-b7b4e3cfef92', '2025-11-07 15:05:00', 'Envío Invitación Evento CDMX / Grupo Sánchez', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('7468ca92-c004-42c5-a4b9-332ea8e93f7e', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / Hyundai', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('b990cbfb-0466-4ea9-b35f-3f65d02eabb6', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / Grupo AUDACE', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('09042186-e319-4c29-8257-36dcc8759db4', '2025-11-07 15:06:00', 'Envío Invitación Evento CDMX / PARAMOUNT BED MEXICO', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('e8bc5621-852b-4bbb-894f-05a43c0db918', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / RECKITT BENCKISER MEXICO SA DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('b0983e08-9efa-4502-b7f0-9ca448fd977b', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / VENGLO INMOBILIARIA SA DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('c093aeec-81c0-4746-9e61-0da2c7d30661', '2025-11-07 15:07:00', 'Envío Invitación Evento CDMX / SINBIOTIK INTERNACIONAL S.A. DE C.V. ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('21933505-94ac-4fc8-a425-772e08948419', '2025-11-07 15:08:00', 'Envío Invitación Evento CDMX / SULZER PUMPS MEXICO S A DE C V ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6ef88939-2311-468f-adac-351ad90783e3', '2025-11-07 15:08:00', 'Envío Invitación Evento CDMX / SULZER CHEMTECH S DE RL DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('ee19005d-1daf-423c-9ed7-a4634f4c533c', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / INDUX SA DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('bf7ce646-ffee-4304-a361-2118a2fe6836', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / SOY SANO SA DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('128e18ba-968f-424c-a669-74dcce1731db', '2025-11-07 15:09:00', 'Envío Invitación Evento CDMX / CHEP MEXICO SA DE CV ', 'Correo', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6de8cecb-e1eb-481a-ad00-16f9916d1bb1', '2025-11-07 15:10:00', 'Se recibieron los documentos del cliente para crear los Pompts', 'Correo', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('5f3bedff-361b-4993-b849-da2ac8139bd1', '2025-11-10 15:41:00', 'Seguimiento LA COSTEÑA ', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('6878024d-60af-4f95-aaf8-2aa88699ae1a', '2025-11-10 16:00:00', 'Seguimiento INTERCERAMIC', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('16fb6903-0778-4723-9a03-197b1898b1c7', '2025-11-10 16:00:00', 'Seguimiento SUKARNE', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('0062b373-691b-47bd-b8ef-f0239ee179ae', '2025-11-10 16:47:00', 'seguimiento a ABITAT', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('8a0453d6-cb0d-4f58-aedc-8e0cbab16149', '2025-11-11 15:19:00', 'Seguimiento para ajustes de propuesta de servicio', 'Correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('b7b736db-ffc7-4a64-8e34-d6c5abc9daab', '2025-11-12 10:58:00', 'Seguimiento para servicio de evaluaciones ', 'Correo', '90321cca-9746-4f73-b338-5d327e33387b', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('d18b751b-8cae-4015-b0f3-f9e73b05e580', '2025-11-13 15:46:00', 'Enviada propuesta agregando estimado de MVP', 'Correo', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('d4e3f41e-2d4d-46d1-b939-7cb41d55dd2d', '2025-11-13 15:47:00', 'Mensajes por Linkedin para presentación de servicios (8 empresas)', 'Correo', NULL, '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('7184bedb-508e-4b75-98a9-c4a3d959ab75', '2025-11-14 09:33:00', 'Envío de Propuesta de Servicios', 'Correo', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9a04364a-2246-4057-a1f7-936f1a18eb2d', '2025-11-14 11:20:00', 'Seguimiento ARCELORMITTAL', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('88325b1c-7eae-42b6-95cc-12ae2842dac3', '2025-11-14 11:23:00', 'Seguimiento GERDAU CORSA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('1e2ef8f6-dae3-46d6-b4f1-3e4594bf3b38', '2025-11-14 11:23:00', 'Seguimiento REGIOPYTSA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b8cdc18f-b828-494e-a4a5-3146ec7c4975', '2025-11-14 11:23:00', 'Seguimiento CORPORACIÓN MOCTEZUMA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ddbee759-e778-44ba-938b-ba98cd004deb', '2025-11-14 11:24:00', 'Seguimiento NEMAK', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('794dd14d-6cf5-427b-bd35-1f53f934e929', '2025-11-14 11:24:00', 'Seguimiento GRUPO CALIDRA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('e63c47b9-09f9-43a8-b93b-d3976e106236', '2025-11-14 11:24:00', 'Seguimiento GRUPO LA MODERNA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('40c783ae-5037-4f62-a067-127ed8057aa2', '2025-11-14 11:24:00', 'Seguimiento GRUMA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('0fc9eb3f-95c5-4e14-9ae4-95a698d4906f', '2025-11-14 11:24:00', 'Seguimiento GRUPO HERDEZ', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('37c492af-0984-4915-aac6-8b89acf16228', '2025-11-14 11:24:00', 'Seguimiento METALSA', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b326bdcc-a3c2-40c1-9dc0-ec1e1da59ff2', '2025-11-14 11:25:00', 'Seguimiento NEMAK', 'Correo', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('1dc1e119-4d23-4a41-9248-184d9b097b3e', '2025-11-14 12:15:00', 'Presentación de servicios al Head of Finance', 'Presentación Servicios En Línea', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('fc647582-12db-4349-a323-35f77b5c4f53', '2025-11-18 10:22:00', 'Seguimiento para Propuesta de Servicio', 'Correo', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f9d2cd9f-63a8-4a20-8825-23e6654c4ead', '2025-11-13 17:24:00', 'Seguimiento sin respuesta', 'Correo', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('0a0a0b36-b647-417b-8a4b-efa62a5daaf4', '2025-10-16 10:06:00', 'Envíe correo de seguimiento ', 'Seguimiento Oportunidad Línea', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('f6fe5a31-87ab-49b4-bb78-b7dfe1cefa42', '2025-10-15 12:45:00', 'Envío de propuesta sin alcance extendido. ', 'Seguimiento Oportunidad Línea', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('009b4e83-d749-4b0d-bd37-6d4d0e1ae661', '2025-10-16 06:46:00', 'Sesión para extension de proyecto con Pablo ', 'Seguimiento Oportunidad Línea', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('4f0f9b43-9593-4588-8993-14998ca2458e', '2025-10-14 12:50:00', 'Se presentó roadmap y se determino nuevo alcance acotado', 'Seguimiento Oportunidad Línea', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7fc30a25-9076-42f6-885e-679c8386d737', '2025-10-16 12:51:00', 'Se busca reemplazar factura de CuboMinería con la BDH ', 'Seguimiento Oportunidad Línea', '7c3019f6-3725-451b-af89-570aa989d1f9', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('a7ded3ed-29b5-4c71-ba99-a9ba1c5a1788', '2025-10-16 12:52:00', 'Se buscará implementar una POC para determinar servicio e implementación', 'Seguimiento Oportunidad Línea', '53bd52ac-e889-4f97-901d-dcac8c6eb3f3', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('dd2c4b9f-2564-4fa8-8db3-175111cb1d9d', '2025-10-13 12:54:00', 'Se tuvo sesión para revisar BUGS detectados y determinar CC ', 'Seguimiento Oportunidad Línea', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('28f7c5f6-cb2b-4992-b032-d2a893ab1cfd', '2025-10-13 12:54:00', 'Se tuvo sesión para revisar BUGS detectados y determinar CC ', 'Seguimiento Oportunidad Línea', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('eb654a66-db1a-4881-86dd-bf04d9bb54d5', '2025-10-09 12:55:00', 'Se presento Propuesta de Servicio con TI, Compras y Negocio. ', 'Seguimiento Oportunidad Línea', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('fec82b1a-3a7a-4031-8718-4af2be0f8d73', '2025-10-16 12:56:00', 'Se solicito fecha de resolución, buscara que sea a finales de oct. ', 'Seguimiento Oportunidad Línea', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('22ce114c-c822-4002-8769-b42652ee361a', '2025-10-14 12:57:00', 'Se ha buscado por correo, Linkedin y no hay respuesta', 'Seguimiento Oportunidad Línea', 'de986524-e4b8-4a95-a49f-d193185bed05', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('76e590c8-20e8-4e92-95de-b1a8df0c50ee', '2025-10-16 11:00:00', 'Reunión con avalia para profundizar en sus necesidades', 'Seguimiento Oportunidad Línea', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('0ac45911-843e-4857-866f-a7f977721294', '2025-10-14 17:59:00', 'Llamada: Luis no ha recibido confirmación por parte de su dir de oper para demo', 'Seguimiento Oportunidad Línea', 'c621b04c-5fa5-41f6-b19b-e01a3de3882a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6b56c37e-2893-431a-95e4-94e413c53fc4', '2025-10-14 18:03:00', 'Se solicito una reunión para levantamiento Portal de Fact.', 'Seguimiento Oportunidad Línea', 'd30069d6-655b-4460-8375-f7cf2b561806', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('482c4e3e-75b4-45dd-9544-d2af913adeda', '2025-10-14 09:12:00', 'Se pregunto al equipo técnico de Tibs si tenian + dudas. su repusta fue NO', 'Seguimiento Oportunidad Línea', NULL, 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('213a7a74-87a2-4e08-bbc5-18143552ee81', '2025-10-14 16:16:00', 'Sky ANgel nos solicito el alcance técnico', 'Seguimiento Oportunidad Línea', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('017cff5a-b97f-4658-b4ec-a262d33698ed', '2025-10-14 23:17:00', 'Esta en negociación la aprobación entre Sky Angel y Walmart', 'Seguimiento Oportunidad Línea', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('93b9c7f3-21db-4f66-8c45-f6633deb4b5c', '2025-10-13 17:21:00', 'El clinte comento que esta concluyendo un proceso de desición interno.', 'Seguimiento Oportunidad Línea', '3758043d-a008-4131-b247-68e19f6abc40', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('8cb287d7-b819-47ca-aaa9-7a5f5dcb5a32', '2025-10-16 18:31:00', 'Se envío mensaje con otro enfoque.', 'Seguimiento Oportunidad Línea', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('9efb828d-0599-495c-8775-12e05743dd6b', '2025-10-17 10:13:00', 'Hable con Juan Carlos para preguntarle al respecto', 'Seguimiento Oportunidad Línea', '2c5bc58c-a953-4c94-8bb1-2fc0e96d048e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('9e686b8c-fcb5-487b-9cc5-4e93c4de05fe', '2025-10-20 11:25:00', 'Richard confirmo que el miercoles 22 de Oct envía la propuesta.', 'Seguimiento Oportunidad Línea', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('aa701b56-268f-429c-a6ad-9cec6460041b', '2025-10-21 17:34:00', 'Seguimiento para información adicional para Prueba de Concepto', 'Seguimiento Oportunidad Línea', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('a221e935-790f-4659-8757-46ff140fe545', '2025-10-22 13:32:00', 'Contacto con área de compras por correo, sin respuesta', 'Seguimiento Oportunidad Línea', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('59d47025-41b0-4dbe-9985-b45877a0452f', '2025-10-22 13:33:00', 'Correo para concretar una sesión con equipo técnico, sin respuesta', 'Seguimiento Oportunidad Línea', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1af2dba4-a204-47f5-9cfd-26281a9a1d38', '2025-10-22 17:00:00', 'Sesión para resolver dudas de la propuesta de servicio', 'Seguimiento Oportunidad Línea', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1863e5eb-0b2d-410a-8cb4-e0478f29635d', '2025-10-23 12:35:00', 'Llamada a Hector Ceniceros de IPEC', 'Seguimiento Oportunidad Línea', NULL, 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('592853a9-66ed-4ac4-b212-200b1b9004f7', '2025-10-27 17:28:00', 'Correo de seguimiento de la propuesta de servicio', 'Seguimiento Oportunidad Línea', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('d3e8bc08-2c7e-4b8b-84a5-4c57d6417c26', '2025-11-17 15:47:00', 'Solicitar DEMO Planning Analytics + IA a Synnex', 'Seguimiento Oportunidad Línea', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('ca60ede5-8500-4bc9-85c5-77eb9a97c354', '2025-10-28 10:42:00', 'Sesión agendada para el viernes con equipo técnico', 'Seguimiento Oportunidad Línea', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('215c9660-23a0-4b35-9e96-0dcb9050ed2a', '2025-10-29 09:21:00', 'Sesión POC agendada para la próxima semana', 'Seguimiento Oportunidad Línea', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('357be721-9fef-4563-995c-d4c2c2c7f4db', '2025-10-31 10:47:00', 'Se reviso la Propuesta con Ariel y su equipo técnico', 'Seguimiento Oportunidad Línea', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('45295732-98ad-4317-b427-0b891074214a', '2025-10-31 10:48:00', 'Se hablo con Juan Manuel, no tuvieron tiempo de atendernos esta semana ', 'Seguimiento Oportunidad Línea', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('cc7c75d5-5594-4d6c-860c-d6c5773b5480', '2025-10-31 10:58:00', 'Sesión con equipo técnico para evaluar automatizaciones', 'Seguimiento Oportunidad Línea', 'fc563b86-6645-4901-aed7-ccb666a70bfb', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('a8e51664-7d00-443a-ab4a-e8c64c6fba3b', '2025-10-30 11:32:00', 'Envíe mensaje via Wpp de seguimiento ', 'Seguimiento Oportunidad Línea', '9faffa11-f57b-46e3-a886-8ab1082d0ee5', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('748f6166-e373-4b12-8a98-16adec7e721c', '2025-10-31 12:01:00', 'El viernes 31 de oct enviara los 20 ejemplos para elñ Prompt', 'Seguimiento Oportunidad Línea', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('44d36193-bda0-4b90-95ac-c2b1d2f6c6ac', '2025-11-04 10:19:00', 'Correo preguntando si ya tomaron una decisión o tienen update', 'Seguimiento Oportunidad Línea', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('8e882ff8-46b1-457d-a77b-f5c7cf2ab4df', '2025-11-05 17:14:00', 'Resolución de dudas y negociación basado en propuesta de servicio', 'Seguimiento Oportunidad Línea', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('93218367-48ca-4dc0-9104-d03309fcd205', '2025-11-06 09:53:00', 'Presentación prueba de concepto', 'Seguimiento Oportunidad Línea', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('c62223e7-b682-4c32-93b9-7ac7c9a39fee', '2025-11-07 15:13:00', 'Se reviso propuesta y surgieron mas necesidades', 'Seguimiento Oportunidad Línea', 'a689919a-b00e-4178-8c45-3fb40747c045', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('f41c1b74-49cc-4f3c-b555-9446fcbd36e1', '2025-11-07 15:14:00', 'Llamada con Ariel - Sigue en Stand by la decisión', 'Seguimiento Oportunidad Línea', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('02cdedee-39b5-4d13-b3a2-93e16275c6e7', '2025-11-07 15:15:00', 'Contacte al cliente final (Fernando-ONE) para revisar Propuesta. Él nos informa', 'Seguimiento Oportunidad Línea', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('96dedc67-6c5a-4b99-951b-33f5ec29f2e1', '2025-11-14 09:47:00', 'Envíe mensaje via Wpp de seguimiento ', 'Seguimiento Oportunidad Línea', '1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('9ee70952-e8ce-42cf-9b5e-eaabd019aaa0', '2025-11-07 15:17:00', 'Se pregunto al cliente y él comento que están evaluando el requerimiento', 'Seguimiento Oportunidad Línea', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6ddd26f0-b722-431c-90aa-4887979e6c2b', '2025-11-10 12:11:00', 'Envíe correo de seguimiento ', 'Seguimiento Oportunidad Línea', '4ff9968a-7bd8-49bf-853b-225144c2676e', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ccf1f1a8-1097-4c33-8f46-6808f888e801', '2025-11-10 17:30:00', 'Correo preguntando si hay alguna novedad', 'Seguimiento Oportunidad Línea', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('e7cb99b3-7665-4139-8d7c-84a3b8d1942f', '2025-11-10 17:52:00', 'Programada sesión de presentación de demos para el viernes', 'Seguimiento Oportunidad Línea', '87868565-0b10-472f-afa1-994cac8f3d6b', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2464b8a5-71e3-4c73-ba15-5bd28c98449f', '2025-11-11 11:36:00', 'Contacto con Adrián, ya no está Pedro, pedir update', 'Seguimiento Oportunidad Línea', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('31d9dc38-b47f-46ec-ac2b-10cf06e5a02e', '2025-11-11 11:38:00', 'Mensaje a Candi y a Sergio para update con dirección', 'Seguimiento Oportunidad Línea', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2a6193cd-63f9-4328-a8a9-59168d0a8fc2', '2025-11-12 09:46:00', 'Comunicación con Sergio y Candi sin respuesta', 'Seguimiento Oportunidad Línea', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f34f358d-7f74-48bf-ad5c-c162b28c9e09', '2025-11-12 15:56:00', 'Darle seguimiento para que el cliente envíe un par de documentos para la DEMO', 'Seguimiento Oportunidad Línea', '9642b008-e953-4fb1-8754-76e10e849bc7', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('de74ce69-d56c-477d-b80d-f31f2477d8fc', '2025-11-13 13:19:00', 'Viernes o Lunes Próximo enviara la definición de JSON para completar las pruebas', 'Seguimiento Oportunidad Línea', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('3381a779-d195-4d22-85a2-b05968fa2083', '2025-11-13 15:46:00', 'Llamadas y mensajes a Candi y Sergio sin respuesta', 'Seguimiento Oportunidad Línea', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('0a6daf1d-68db-4fce-9f96-27f1db815ef5', '2025-11-14 09:48:00', 'Envíe correo de seguimiento ', 'Seguimiento Oportunidad Línea', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('b75ffe41-bbe5-4a8b-ae53-d41a7711e84a', '2025-11-18 09:41:00', 'Reunión Interna acordar la DEMO - Ivonne enviara la facha y hora', 'Seguimiento Oportunidad Línea', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('70163f9f-f8af-4822-a71c-ad24127c5f7f', '2025-11-18 12:22:00', 'Seguimiento sin respuesta', 'Seguimiento Oportunidad Línea', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', '218506fb-a00a-49db-bbfb-1c02075a96f5');



--
-- Data for Name: opportunities; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.opportunities
INSERT INTO staging.opportunities (id, nombre_proyecto, cliente_id, empresa, ejecutivo_id, etapa, monto_licenciamiento, monto_servicios, monto_total, moneda, linea_negocio, tipo_entrega, licenciamiento, proposal_document_path, archived, "tipoCambio", description, estimated_closure_date, "createdAt") VALUES
  ('fdff99c1-d090-4725-83c8-bc049faec948', 'ABC Alta de Cuenta en Banco - GCC', 'c533b360-ecdd-48cb-9343-9cb8d817cfd9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '1325800.00', '1325800.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('9faffa11-f57b-46e3-a886-8ab1082d0ee5', 'Vacante Data Steward - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '77473.00', '77473.00', 'MXN', 'RH', 'Asignacion', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'Talent IT', 'b6651f01-674f-477e-b4b8-ee06e1436036', 'Grupo EI CDMX', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('2c5bc58c-a953-4c94-8bb1-2fc0e96d048e', 'Aportaciones - GCC', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '215000.00', '215000.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('98063f16-41c1-4246-b237-0e5d49f97811', 'Vacante Analista Help Desk - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '20000.00', '20000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('f8586d2b-aa1a-44de-ab10-857f9b27523d', 'Licencias Power BI - Leoni', '4633fda2-4748-422e-a65a-96eef1f86d36', 'Leoni', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '1800.00', '0.00', '1800.00', 'USD', 'Datos', 'Licencia', 'Microsoft', NULL, 'f', '19.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('3a017b60-3c2a-49ed-b477-6925e76d3b95', 'CC Plataforma Proveedores ', '4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'STRD GO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '0.00', '65000.00', '65000.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('7c3019f6-3725-451b-af89-570aa989d1f9', 'Bolsa Horas - Autlan', '3a8b247a-f8f0-45bb-a017-ac5bf96f7ab9', 'Autlan', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '0.00', '212180.00', '212180.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', 'uploads\7c3019f6-3725-451b-af89-570aa989d1f9\Propuesta de Servicio_Bolsa de Horas_Autlan_20251013.pdf', 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', 'CC App Consulta - GCC', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '37000.00', '37000.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('3758043d-a008-4131-b247-68e19f6abc40', 'Soluciónón de OCR + IA', '595fe239-642f-4f36-a599-13d15be6e58e', 'GFM Logística y Aduanas', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '10000.00', '9344.00', '19344.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '19.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', 'Asesoría Watsonx', 'b8b886b3-155f-4352-b175-29ae8756a4c1', 'Matcor-Matsu', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'Migración AZURE', 'a2f3288f-2b18-48f4-b88d-0f5963f9edf5', 'Sky Angel', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '133416.00', '12000.00', '145416.00', 'USD', 'Datos', 'Licencia', 'Microsoft', NULL, 'f', '19.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('da170cae-3a57-421f-9b3c-923f70c7303e', 'Planning Analytics', '18687d62-33bb-483a-a491-698ef4af365c', 'Sky Angel', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('c621b04c-5fa5-41f6-b19b-e01a3de3882a', 'Business Intelligence (Tableros)', 'd97efafe-a2de-467a-8806-2bee1dae981d', 'Citizen', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('d30069d6-655b-4460-8375-f7cf2b561806', 'Portal de facturación', 'd97efafe-a2de-467a-8806-2bee1dae981d', 'Citizen', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('373f51e5-d2ac-4427-9711-5471a3ec74b4', 'Dashboards en Power BI ', 'd1569f34-195f-42b4-98d8-cffc96b51d17', 'Guarda Express', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '24211.00', '236000.00', '260211.00', 'MXN', 'Datos', 'Proyecto', 'Microsoft', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('3709a36d-efa6-4147-b3fe-19d1d039789b', 'Bolsa de Horas - Angular ', '2ed0ec41-8850-46e6-9263-5b625accd0a1', 'Afirme Seguros', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '261500.00', '261500.00', 'MXN', 'Desarrollo', 'Bolsa de Horas', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('81c990dd-1a8b-4c61-ae96-2deaa154a38f', '4 Vacantes DevExpress', 'a7599890-ea0c-47e1-99d5-beb64a88fa09', 'Transportes FEMA', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'RH', 'Asignacion', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('445c926b-00fe-4383-b117-df1be0d9bd3e', 'Vacante Analista de Gobierno de TI - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '50000.00', '50000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('d1df4fb7-f3eb-4106-b19d-e2c352e41a73', 'App Rec Mobile - GCC', 'e55c9968-d30e-474b-be56-3ebb88dbdacd', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '194800.00', '194800.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('44a8bf14-709d-4262-a11c-e3f127efcd2d', 'Portal de facturación', 'a2f3288f-2b18-48f4-b88d-0f5963f9edf5', 'Sky Angel', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Standby', '0.00', '100000.00', '100000.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, 'uploads\44a8bf14-709d-4262-a11c-e3f127efcd2d\Cotización Portal Recepción y Validación de Facturas para ONE.pdf', 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('66031b4d-cc1a-4543-9981-c9f3029bc1f5', 'Monthly Earnings - Tableau KOSTAL', '8408cd80-0f1f-4dc9-a8f9-7e6da4e84326', 'Grupo KOSTAL', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Standby', '0.00', '171990.00', '171990.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('fc563b86-6645-4901-aed7-ccb666a70bfb', 'Transformación Digital', '6b52a768-c684-4f58-91ac-6249e9aa9b29', 'Sage Automotive Interiors', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('7741605c-7994-457e-919b-13ba0c18b13c', 'Recuperación de Cartera con IA ', '7761e4b5-7b34-43a0-970d-8161a2b274af', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '27087.30', '77880.00', '104967.30', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '18.50', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('15e058d7-64d0-41ee-b19b-b2902a65384c', 'Reportes Daños - Datamart', '17fd701b-cd32-45a3-852b-e7a11b9b1817', 'Seguros El Potosi', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '97620.00', '97620.00', 'USD', 'Datos', 'Proyecto', NULL, NULL, 'f', '18.50', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('03ae88ce-052d-44fb-9394-0aedcd30c79f', 'Planeación Financiera México ', '7761e4b5-7b34-43a0-970d-8161a2b274af', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '888550.00', '888550.00', 'MXN', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('dd54fa82-a281-4b0c-be46-d82683630799', 'Consolidación Financiera Global ', '6d787e67-6092-479a-aab5-d168e05d8c90', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '93477.75', '253520.00', '346997.75', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '18.50', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('7b532ed5-5f2f-41b8-afa0-51dde90c19a9', 'Plataforma de Datos PAYNAU', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'PAYNAU', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Standby', '0.00', '1152100.00', '1152100.00', 'MXN', 'Datos', 'Bolsa de Horas', NULL, 'uploads\7b532ed5-5f2f-41b8-afa0-51dde90c19a9\Propuesta de servicio - Proyecto de plataforma de datos PayNau_20251113.pdf', 'f', '0.00', 'Bolsa de horas de consultoría: $225,500
MVP: $926,600', NULL, '2025-01-01 16:14:11.98062'),
  ('8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'Portal agentes - Eiyo to kenko ', '592fb6fc-74d6-4f7d-a6ea-5c4f0b76bbac', 'Eiyo to kenko', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '1650000.00', '1650000.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('8bf4c50f-7d06-4009-99f8-ec82a7327058', 'WebMethods', '187eccac-685d-496a-8dc3-9302673f9076', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '64735.62', '0.00', '64735.62', 'USD', 'Datos', 'Proyecto', 'IBM', 'uploads\8bf4c50f-7d06-4009-99f8-ec82a7327058\Licencimiento WebMethods_XPD Global_20251014.pdf', 'f', '17.30', NULL, NULL, '2026-01-01 12:00:00'),
  ('1110a27e-cc24-4ec3-aa3d-8d5e0f8c9082', 'Vacante Admin Accesos - GCC', '4a04f10d-7e3d-4ccb-ba59-326922bc8612', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-02-27', '2026-02-24 12:00:00'),
  ('b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'Planning Analytics + IA', '5306c9a3-d49d-4332-baf1-7b5235bd3152', 'ACH FOODS MEXICO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Preparar una Presentación-DEMO de Planning Analytics que incluya IA. Kin nos puede ayudar a reunirnos con el tomador de desición de ACH FOOD.', NULL, '2026-01-01 12:00:00'),
  ('06842f0c-1d02-4d6a-ad5d-a1fe2c83602e', 'Licencia Alteryx ', '20aaa558-2b9d-4ae4-9c4c-9532643c79b0', 'INTEX', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '5900.00', '0.00', '5900.00', 'USD', 'Datos', 'Licencia', 'Alteryx', NULL, 'f', '17.20', '', '2026-02-18', '2026-02-18 14:00:00'),
  ('f53d7bf7-eaff-4766-ad58-46b3cecb93ad', 'Bolsa de Horas Power BI ', 'eb43e096-5252-4cf9-8986-6651f78f4ab8', 'Tenova', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '92000.00', '92000.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', 'Bolsa de Horas para Asesoria, Desarrollo y Soporte en DAX ', '2026-03-31', '2026-03-18 12:00:00'),
  ('3fa33b33-d95b-4c06-ac49-76682954e01b', 'Automatización de Proyectos de Mejora', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'TECHGEN', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Licitación para el desarrollo de un Gestor de proyectos', '2026-03-31', '2026-01-13 18:00:00'),
  ('8d608aa8-e43a-495d-9d0d-cf4f962645fd', 'Proyecciones Comerciales ', '3a8b247a-f8f0-45bb-a017-ac5bf96f7ab9', 'Autlan', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2026-01-01 18:00:00'),
  ('143a4a62-0f84-4fbf-868a-92aae524c187', 'RPA para XPD', '187eccac-685d-496a-8dc3-9302673f9076', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-02-10', '2026-02-10 18:00:00'),
  ('6182781a-4f62-4970-8e4b-91e1999a52a4', 'OCR ( IBM Watsonx.ai )', 'b6651f01-674f-477e-b4b8-ee06e1436036', 'Grupo EI CDMX', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Licencia', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('4ff9968a-7bd8-49bf-853b-225144c2676e', 'App Dirección - GCC', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '12500.00', '12500.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('aa2f2c01-aef9-4f45-801d-cf450de10e87', 'Cubo Minería - Autlan', '00eba21b-a657-4f6e-9cdb-a11d06c3fdd7', 'Autlán', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('e521621f-c4f0-4a1f-a7a8-a5e18fdeed6a', 'Vacante Desarrollador - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '50000.00', '50000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2025-01-01 16:14:11.98062'),
  ('1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e', 'Cubo de Producción - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '40800.00', '40800.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2025-01-01 16:14:11.98062'),
  ('90321cca-9746-4f73-b338-5d327e33387b', 'Servicio evaluaciones', '5b7df910-1a31-46ed-951f-bf47700b402f', 'Platinum Pack', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Ganada', '0.00', '20000.00', '20000.00', 'MXN', 'RH', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Dos vacantes: 
Ejecutivo de Cuenta Sr
Coordinador de Ventas y Marketing', NULL, '2025-01-01 16:14:11.98062'),
  ('f0650475-faf4-4a59-88fa-27589e9f86e4', 'Licencias Mirantis - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '2362.00', '0.00', '2362.00', 'USD', 'Datos', 'Licencia', 'No Aplica', NULL, 'f', '18.32', '', NULL, '2025-01-01 16:14:11.98062'),
  ('fe76c543-b161-45dd-b76d-08f90b3a2997', 'Vacante Analista de Gobierno de TI - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '50000.00', '50000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('75fdec71-4f26-4fab-a94a-c75989232a0c', 'Gestor de Documentos con IA ', '17fd701b-cd32-45a3-852b-e7a11b9b1817', 'Seguros El Potosi', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('31ee6490-1a15-4209-a95c-5430f752a8d2', 'Vacante DBA - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', 'Esta vacante se modificó', NULL, '2026-01-01 12:00:00'),
  ('d743540b-7a72-41e1-94d2-7292fa2731af', 'Asistente AI RH ', '56e88c9e-2e25-41fb-b79a-ad026f389806', 'Super Chivas', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('9642b008-e953-4fb1-8754-76e10e849bc7', 'OCR ( IBM Watsonx.ai )', 'fbd4af89-5633-4448-ac89-5b094a63bbcf', 'Axias Group', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', 'El cliente requiere organizar sus ordenes de compra que provienen de diferentes imputs (IMSS, ISSTE, Gobierno) para ello le propsimos la solución de WATSON.IA (OCR). El clinete enviara algunos ejemplos para que nosotros desarrollemos el Prompt y agendemos una reunión para una DEMO', NULL, '2026-01-01 12:00:00'),
  ('d2e9ac9b-6d36-4706-94a0-a1c95e60c59c', 'Predicciones en RH ', 'c5b44cfd-105c-423b-b26a-038c64dda1f0', 'Bepensa ', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'BEPENSA busca, 


A corto o mediano plazo temas de análisis predictivo, descriptivo y predictivo referente a todo lo que es el talento organizacional para tomar decisiones más objetivas y que pues mejor el aprovechamiento tanto para el colaborador como para la empresa, todo el potencial que tenemos con el talento que contamos. ', NULL, '2026-01-01 16:14:11.98062'),
  ('9e898a3b-4719-4fcb-949b-8cdb24fe6af3', 'Bolsa de Horas iOS / Android - GCC', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '75000.00', '75000.00', 'MXN', 'Desarrollo', 'Bolsa de Horas', NULL, NULL, 'f', '0.00', NULL, NULL, '2026-01-01 12:00:00'),
  ('db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'Migración Modelos de Riesgo SAS a Python ', '2ed0ec41-8850-46e6-9263-5b625accd0a1', 'Afirme Seguros', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '1575450.00', '1575450.00', 'MXN', 'Datos', 'Proyecto', NULL, 'uploads\db1abb37-d0af-45be-ae8c-1f31a3c10cc5\Propuesta de servicio - Migración de Modelos de Riesgo SAS a Python_AFIRME SEGUROS_20251003.pdf', 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('75aec45f-2ab9-45ca-ae08-dc1126be9c78', 'BDH WebMethods ', '4cbeb279-e659-48d0-ba65-30f81b3d4646', 'TRANSMEX / IBM', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '53300.00', '53300.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '18.50', 'Servicio de configuración y desarrollo en WebMEthods para TRANSMEX ', NULL, '2026-01-01 16:14:11.98062'),
  ('371187c3-abe8-461f-9ba0-8d5679a11a97', 'Carga Tablas Enlace a DataLake', 'adf7c586-4848-43d6-837c-65acd2ccba77', 'chubb', '568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Ganada', '0.00', '29000.00', '29000.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', 'uploads\371187c3-abe8-461f-9ba0-8d5679a11a97\PropuestaChubbReplicaTablasEnlace_20250912.pdf', 'f', '18.50', NULL, NULL, '2026-01-01 12:00:00'),
  ('127e6496-d274-4233-a6b9-e2fa937e0271', 'WebMethods ', 'ef26112c-975f-4661-8d34-475fc4703be5', 'GT Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '0.00', 'Apoyar a GT global con la integración de sus aplicaciones ', NULL, '2026-01-01 14:00:00'),
  ('17c12f44-ae2a-4476-8022-1a1c1dc002e1', 'Vacante Ejecutivo de Cuentas Sr', 'c300d731-63d7-4bb1-b097-b512929703e2', 'Platinum Pack', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'RH', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2025-01-01 16:14:11.98062'),
  ('c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Prueba', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'PAYNAU', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '5000.00', '1000.00', '6000.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 't', '18.19', '', '2025-12-09', '2025-01-01 16:14:11.98062'),
  ('38700b57-f773-4082-a629-e9efb971cd82', 'Desarrollo Dashboards - BI', 'c9972d67-a5b3-4529-ae8b-7bb1ffb19d29', 'Salud Digna', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Ganada', '0.00', '55000.00', '55000.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', 'uploads\38700b57-f773-4082-a629-e9efb971cd82\Propuesta de Servicio_PowerBI_SaludDigna2025.pdf', 'f', '0.00', 'Servicio de desarrollo de tableros en Power BI', '2025-12-31', '2025-01-01 16:14:11.98062'),
  ('63ffac9a-3667-48f6-85ab-fa6b9b02e550', 'App Consulta Testflight', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '10500.00', '10500.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-19', '2025-01-01 16:14:11.98062'),
  ('b59790bd-5fbe-42b6-bc4a-5b44d781db5f', 'IA - AFIRME', '09b37b18-0eb8-419e-a3e8-a5ffa3dc750c', 'Erik', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Estimación', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '0.00', '', '2026-02-18', '2026-02-18 14:00:00'),
  ('749e69ad-a491-4b67-83a0-e3b0b3310aac', 'Vacante Financiero - GCC', '4a04f10d-7e3d-4ccb-ba59-326922bc8612', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-02-28', '2026-02-24 12:00:00'),
  ('b191291b-c7cd-4a9d-9e99-7224e186274b', 'Licencia Alteryx', '112944dc-5ada-44b1-a1f6-a5e50afb6e75', 'Ragasa', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '5360.00', '0.00', '5360.00', 'USD', 'Datos', 'Licencia', 'Alteryx', NULL, 'f', '18.46', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('49c8ce45-6b6d-48ca-989b-ffc42b6b346b', 'CC3 - Portal de Proveedores', '4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'STRD GO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '0.00', '21000.00', '21000.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-18', '2026-01-01 16:14:11.98062'),
  ('124615c1-b567-4542-b94e-0fdbf997f56e', 'Bolsa Horas - Power Apps', 'd79d8afc-f33a-41c9-8e67-8d04b77b0427', 'Tecpetrol', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Perdida', '0.00', '1870000.00', '1870000.00', 'MXN', 'Desarrollo', 'Bolsa de Horas', 'No Aplica', 'uploads\124615c1-b567-4542-b94e-0fdbf997f56e\Price Table - 24762781 - Servicio especializado de soporte para el desarollo de formularios digitales en Microsoft Power Apps-2025-08-21_142359-7269565.xlsx', 'f', '0.00', 'Servicio formularios POWER APPS-1700 Horas
Flujos Power Automate, visualización de tableros.', NULL, '2026-01-01 16:14:11.98062'),
  ('2e8c99c5-84a8-45f8-a5cd-6828c1ff0369', 'Vacante Portafolio TI - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '30000.00', '30000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-02', '2026-01-01 12:00:00'),
  ('fdddce16-eacf-4879-afaf-2474526c5665', 'ERP Contakto', 'e479bcb9-a0d7-4e9d-acb5-03398635439d', 'Contact', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '79240.00', '79240.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '18.00', NULL, NULL, '2026-01-01 12:00:00'),
  ('7408172b-bbf8-451c-ad9e-935e6eaa8263', 'Dashboards Tableu - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-26', '2026-01-01 18:00:00'),
  ('48b654c6-d75f-4b4c-b4bf-a7fc873bba90', 'Cambios Consolidación Financiera - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2026-01-01 18:00:00'),
  ('53bd52ac-e889-4f97-901d-dcac8c6eb3f3', 'WebMethods', '4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'STRD GO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '32879.88', '10449.00', '43328.88', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '18.50', NULL, NULL, '2026-01-01 18:00:00'),
  ('fe3bd828-0464-40b9-8923-27af7966abeb', 'Integraciones con WebMethods ', '8b5b0c1a-f214-4784-bfe7-3cbf0c3868f6', 'GCC', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Negociación', '227505.60', '48000.00', '275505.60', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '17.47', 'Integraciones con WebMethods para GCC reemplazar FUSE. ', NULL, '2026-01-01 18:00:00'),
  ('87a44983-6df6-423e-8a45-9d86fadda21a', 'RPA - Viáticos ', '08c65d20-45e9-43e5-88d2-706d73658b6b', 'Cosmocel', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2026-01-01 18:00:00'),
  ('42973736-7468-45bb-ba8d-eeade5724027', 'Curso PA - PROLAMSA', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '95000.00', '95000.00', 'MXN', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2026-01-01 18:00:00'),
  ('6815286d-1fd2-4c6b-a429-a5b049d79321', 'Vacante BASIS - GCC', '4a04f10d-7e3d-4ccb-ba59-326922bc8612', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-26', '2026-01-01 18:00:00'),
  ('c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'Planning Analytics', '8ef32617-991c-4b06-8916-c65263f1e652', 'Grupo Diagnostico PROA', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('c6e62741-a66f-4940-908e-ab5357f6a2e5', 'Aut. Mensajes Whatsapp Cobranza ', 'c7561b2d-d404-4c99-975b-e25d937f1e1d', 'Vía APIA ', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', NULL, NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('de986524-e4b8-4a95-a49f-d193185bed05', 'Dashboards Ejecutivos - Analítica', '8e958d2d-08ff-413d-a075-96fe2c80e10a', 'Audi', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '0.00', '0.00', 'MXN', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('6cbff638-f0c8-4e35-ab34-c1d7d1ab03a0', 'Automatización de procesos', '7c784b9e-817f-4ef1-90f6-a1c15630833d', 'Sanborns', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 't', '0.00', '', '2026-07-30', '2026-02-19 12:00:00'),
  ('5d0f2791-edec-42d7-8a96-139f79d9d491', 'Automatización de procesos de RH', '0f5d48f6-fa97-4234-8994-3bf9d62f0b0b', 'Madison International School', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'RH', 'Proyecto', 'No Aplica', NULL, 't', '0.00', '', '2026-04-30', '2026-02-17 12:00:00'),
  ('78400467-6417-4131-aa63-33c7395bdcab', 'OCR para ADMIN ', '4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'STRD GO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Estimación', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '0.00', 'Facturas y Bill of ladings 
370 embarques al mes aprox y cada embarque tiene aproximadamente 5 documentos mixtos entre Facturas y BOL.
', '2026-02-18', '2026-02-18 14:00:00'),
  ('d48d5414-5854-4c8c-96f9-27e6cc54257c', 'Planning Analytics para Avalia', '0b60252a-3a40-4c1d-a91a-4691657b60cd', 'Avalia', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '18963.50', '16123.08', '35086.58', 'USD', 'Datos', 'Proyecto', 'IBM', 'uploads\d48d5414-5854-4c8c-96f9-27e6cc54257c\Propuesta de servicio - Proyecto-Presupuestos_Avalia_251114.pdf', 'f', '18.32', NULL, NULL, '2025-01-01 16:14:11.98062'),
  ('fc8dd53b-1b07-4420-9622-5737cb899c2e', 'CC2 Plataforma Proveedores ', '4a3620ce-8e75-4581-9ce2-c9a6251c16bf', 'STRD GO', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Ganada', '0.00', '68400.00', '68400.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Nuevos requerimientos a la plataforma original. ', '2025-12-05', '2025-01-01 16:14:11.98062'),
  ('9dbb6491-6ae3-445a-9625-c795b1093945', 'CC2 App Consulta - GCC', '590511a6-a3b8-4572-886a-7e3422b71ea9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-01-20', '2026-01-13 12:00:00'),
  ('348f4d64-e454-43db-93d7-4ac669afbb89', 'Cotizador', 'e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'IPEC', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Standby', '0.00', '549500.00', '549500.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Desarrollo de Softwatre con IA y Licenciamiento de IBM Watsonx Orchestrate', '2026-02-28', '2025-01-01 16:14:11.98062'),
  ('cde7f0b0-5411-4717-a20e-177ba87f48c6', 'Licenciamiento IBM Watson Orchestrate', 'e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'IPEC', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Standby', '6720.00', '0.00', '6720.00', 'USD', 'Desarrollo', 'Licencia', 'IBM', NULL, 'f', '0.00', 'Licenciamiento por contrato anual', '2026-02-28', '2025-01-01 16:14:11.98062'),
  ('cd75151c-0f8d-4daf-b046-15b86bde0a10', 'Asignación SISS SQL', 'ad8d7875-bbed-435a-a600-25f605d44254', 'CHUBB', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '74000.00', '74000.00', 'MXN', 'Datos', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', 'Asiganción de un perfil tipo Sofía Mendez (tenemos a Hector Briseo) ', NULL, '2025-01-01 16:14:11.98062'),
  ('4fda362b-2210-413f-a7b9-34caaace34ec', 'Vacante Soporte - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '30000.00', '30000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2026-01-01 12:00:00'),
  ('682fe67a-9e76-4044-b7ea-4621292fce64', 'Vacante Financiero - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-01-30', '2026-01-30 12:00:00'),
  ('5ff3e69c-800b-48ae-a324-d53d3cfd59ee', 'Staffing', '10441e5c-c211-437a-ab2d-db4efb29ddd1', 'Konfío', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-16', '2026-01-16 12:00:00'),
  ('66db9769-a26c-4b54-a08d-c287291c0d0a', 'Asignación Toño', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '178560.00', '178560.00', 'MXN', 'Datos', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-03-06', '2026-03-06 18:00:00'),
  ('603e4f29-6123-47f7-9565-6dd9c42e4b43', 'OCR-Logística', '22be53a0-a681-4e9a-beb8-e9cbc71ce241', 'BAFAR', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Solución OCR dirigida al área de logística de Grupo BAFAR', NULL, '2026-01-01 13:00:00'),
  ('abc1e95e-c730-4faa-906f-7ac420539c75', 'Capacitación SISS ', '92596e84-03e3-42b6-86d0-36496e647845', 'Grupo Mexico', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 't', '0.00', '', '2026-02-10', '2026-02-10 12:00:00'),
  ('aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Visualizador de alertas', 'ee7e27c5-7263-431b-9751-3f6ad791eb21', 'Fertilizantes TEPEYAC', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '493280.00', '493280.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Visualizador de alertas de acuerdo a distintos KPIs que ya se tienen definidos en bases de datos locales', '2026-05-31', '2026-03-03 18:00:00'),
  ('d22a0562-5df1-4503-be76-d4753d640ec1', 'Asignación Aurora ', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '256000.00', '256000.00', 'MXN', 'Datos', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-03-06', '2026-03-06 12:00:00'),
  ('18bfd5ba-36d8-43c4-884b-a47abe73f592', 'Plataforma de Datos', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'PAYNAU', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '1152100.00', '1152100.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-07-31', '2026-01-22 12:00:00'),
  ('8be61c96-e44f-4058-b101-c2bff29b082a', 'Recuperación de Cartera con IA ', '7761e4b5-7b34-43a0-970d-8161a2b274af', 'XPD Global', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '16673.04', '39265.00', '55938.04', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '17.30', '', '2026-02-28', '2026-01-28 12:00:00'),
  ('7f89279a-8810-49b6-9b6f-fd458d0ca0e8', 'Cotizador con IA', 'e5ffeffc-f060-44ae-8280-510c3cdfa50b', 'IPEC', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-30', '2026-02-17 18:00:00'),
  ('726b65a0-394a-48c5-a8fe-cf6e3981f94d', 'Vacante Soporte Configuraciones - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-02-26', '2026-02-26 18:00:00'),
  ('bb95720a-a1d7-4d77-b534-3537951b8875', 'Sistema Carga de Presupuesto - GCC', 'c533b360-ecdd-48cb-9343-9cb8d817cfd9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '0.00', '0.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2025-12-30', '2026-01-01 18:00:00'),
  ('403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'Identificación de transporte', '455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'ArcelorMittal', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Estimación', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-31', '2026-02-26 18:00:00'),
  ('e92094c6-e5f2-49a2-9d45-77397e52d8d6', 'Viaticos Alejandro', '8b5b0c1a-f214-4784-bfe7-3cbf0c3868f6', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '15724.00', '15724.00', 'MXN', 'RH', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-03-06', '2026-03-06 18:00:00'),
  ('8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Digitalización y Automatización del Sistema de Gestion Integral SASISOPA', '835c3f9c-4dfe-464a-8a72-03980e534a6b', 'TECHGEN', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Negociación', '0.00', '2137000.00', '2137000.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', 'uploads\8e7e51ca-c397-45fd-9270-4f74bfb1eb5c\Propuesta Tecnica_TECHGEN_Proy SASISOPA_20260128_v1-3.pdf', 'f', '0.00', 'Proceso de Licitación con EXIROS cierra el 28 de Enero', '2026-03-31', '2026-01-12 18:00:00'),
  ('6c147c42-47f4-45f2-ae85-031848a65906', 'Servicios IA', '3b39427a-0ede-4018-96c0-c131d4ce34cd', 'TOTALPLAY', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-02-23', '2026-02-23 18:00:00'),
  ('c84c690f-0685-4d8b-b32f-4cdde3c95674', 'Vacante Fullstack - GCC', '4a04f10d-7e3d-4ccb-ba59-326922bc8612', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-03-20', '2026-03-20 18:00:00'),
  ('180630eb-1e00-4284-9052-9f2ec4bfee37', 'Vacante Dev CPOS - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-01-30', '2026-01-30 18:00:00'),
  ('eed44d07-ebd0-487d-bc5d-976f0828725c', 'CC Dashboards ', '3452c8cb-65f4-4ac4-9cad-e12d3166d3e7', 'Schneider Electric', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '79800.00', '79800.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('d097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Encuestas Clima organizacional', '891c965b-029a-48d0-a2a2-3d353ccd30cc', 'Grupo Lala', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Perdida', '0.00', '1948500.00', '1948500.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-30', '2026-02-19 18:00:00'),
  ('1c2bcefa-b79d-4290-b884-1be9c3b38057', 'OCR ( IBM Watsonx.ai )', '879c931b-c618-42e5-8521-6c6da2c47fe0', 'Grupo EI', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Estimación', '120000.00', '25242.00', '145242.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '18.00', NULL, NULL, '2026-01-01 12:00:00'),
  ('fac1185d-9ddd-49f4-a746-7104c3a95bae', 'Aut. Prespuestos ', 'c2196603-32d9-4d13-aefc-8b3f61cfeec6', 'Wieland', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'IBM', NULL, 'f', '0.00', NULL, NULL, '2026-01-01 16:14:11.98062'),
  ('aa1db809-2330-46d2-894a-08539ad3d41d', 'MAS 360', '59611499-7da9-4e55-b599-bcf84ffb46c1', 'Jersey', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Licencia', 'IBM', NULL, 'f', '0.00', 'MDM', '2026-04-22', '2026-06-22 18:00:00'),
  ('a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Sistema de Gestión de Activos', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 'Oxford University Press', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Negociación', '0.00', '710790.00', '710790.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', 'uploads/a167b4fe-927e-48ea-810f-81a6d21b2bde/Propuesta Licencimiento Oxford University Press (1).pdf', 'f', '0.00', '', '2026-05-10', '2026-02-10 12:00:00'),
  ('1d1a2269-b87f-4970-90ec-0b5835df4922', 'Bolsa de Horas - Optimización y Algoritmos Matemáticos ', 'baf471e0-4bbd-457b-a712-482a040ecf45', 'RegioPYTSA', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', 'Empresa en ecosistema Microsoft con alta dependencia de Excel y uso de SAP. Ya aplican modelos matemáticos en Python para optimización (set-ups, compras a proveedores y carga de camiones).

Prioridad en algoritmos de optimización y soluciones personalizadas. Interés en reducir uso de Excel, automatizar captura de datos de máquinas, integrar datos en tiempo real (Manufactura 4.0) y fortalecer visualización en Power BI.

Oportunidad de apoyo en desarrollo de interfaces, modelos de optimización y posible plataforma digital para auditorías.', '2026-04-28', '2026-01-28 12:00:00'),
  ('01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'OCR+IA ', '565eed95-cb17-4b78-8169-0a2cf3210627', 'Dart', 'cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Cancelada', '10000.00', '38150.00', '48150.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', NULL, 'f', '18.00', '', '2026-01-31', '2026-01-01 13:00:00'),
  ('72e67258-5d97-4199-ad06-37d04e1c6f48', 'Asignación - Instalación de Software', '9661c8f4-0262-414e-bd24-ef45e96e607f', 'Maysoft', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Asignacion', 'No Aplica', 'uploads\72e67258-5d97-4199-ad06-37d04e1c6f48\Maysoft - Resumen de servicios.docx', 'f', '0.00', 'Instalación de Software a equipos de cómputo nuevos y migración de información de equipos obsoletos. Entrega de equipos con "puesta a punto" en distintas ubicaciones de CDMX.', '2026-03-20', '2026-02-19 12:00:00'),
  ('17befe8b-91c3-4fe2-b288-d18f060ffbd6', 'Billy Cobranza', 'df63d823-d0fb-46f9-8a9e-c30f54fd4245', 'Grupo DAGS', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-03-05', '2026-03-05 17:00:00'),
  ('73176e11-565b-48c7-b330-ef0001ce3401', 'Gestión de Personal', '0be3b5f6-d484-45c0-9247-67ee62eb3ad8', 'PrimeComms', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Solución para gestión de personal en campo. Competircon One APP', '2026-04-30', '2026-03-30 18:00:00'),
  ('6a2c47ad-c9c9-4dc9-82b4-113a78234993', 'Asistente, RPA + IA', '0ad900f1-1730-45db-b14c-026767f2c88a', 'Nadro', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Es una compañía de logística farmacéutica que ya tiene desarrollos y automatizaciones internas. Le gusta el desarrollo de RPA para poder dar atención al cliente mediante un sistema automatizado.', '2026-06-30', '2026-03-12 12:00:00'),
  ('61ae2418-e508-4609-af58-cf92f86ea673', 'MKT-Billy S&S', '7f59e3bf-52b5-487b-bace-b5c682b1ba94', 'Esfuno', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Perdida', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Llenaron formulario para ser contactados, son una compañía que se dedica a dar cursos y talleres principalmente para particulares, industria y gobierno, le interesa conocer la herramienta S&S en una demo', '2026-09-30', '2026-07-06 18:00:00'),
  ('280a539d-65de-43b8-925e-d02badd2fa53', '#APOLLO Billy S&S - Gmail', '8e7d05d0-9f2a-4d5a-a3fe-0404f6f6bad9', 'RSI México', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-08-23', '2026-07-23 18:00:00'),
  ('7f8bc091-21a6-41bb-80e5-56129f716e02', 'Consumo Azure - Leoni', '23261509-d2c3-4fd0-9edc-ac75d9b43b3f', 'Leoni', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '117.74', '0.00', '117.74', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-14', '2026-04-14 18:00:00'),
  ('50aa0ca1-4d26-4e5a-b47b-cb03fa9f49b7', 'Planning + AI ', '39b78d4c-add3-4e07-9c28-776ff6f06de4', 'Seguros El Aguila', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', NULL, '2026-01-01 18:00:00'),
  ('87868565-0b10-472f-afa1-994cac8f3d6b', 'RPA Conciliación bancaria y gestión de tesorería', 'e28aa1f6-86da-443f-862b-cd04ac3e3220', 'Oxford University Press', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Negociación', '87523.00', '522880.00', '610403.00', 'MXN', 'Datos', 'Proyecto', 'Microsoft', 'uploads\87868565-0b10-472f-afa1-994cac8f3d6b\Propuesta Fase 0_Piloto_Conciliación Bancaria (2).pdf', 'f', '0.00', '', NULL, '2026-01-01 18:00:00'),
  ('a2841e6e-3ae7-48ea-8b55-556737d98208', 'WebMethods Para EDI', '59611499-7da9-4e55-b599-bcf84ffb46c1', 'Jersey', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Licencia', 'IBM', NULL, 'f', '0.00', 'Posible oportunidad para automatización EDI', '2026-04-22', '2026-06-22 18:00:00'),
  ('a689919a-b00e-4178-8c45-3fb40747c045', 'Automatizar el Proceso de Facturación', '18687d62-33bb-483a-a491-698ef4af365c', 'Sky Angel', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Perdida', '0.00', '1925000.00', '1925000.00', 'MXN', 'Desarrollo', 'Proyecto', 'No Aplica', 'uploads\a689919a-b00e-4178-8c45-3fb40747c045\Propuesta de servicio - Automatización de Facturacion_2026.pdf', 'f', '0.00', NULL, '2026-04-30', '2026-01-01 18:00:00'),
  ('59f8ded8-b29a-48eb-a00a-173b4fcc00d8', 'Proyecto Automatización de Proceso Producción', '8e6df780-aae3-4281-9421-d355f7974b7f', 'TMM Store', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-30', '2026-03-27 18:00:00'),
  ('bc12f5de-63a0-456d-8761-73e0889f78bc', 'Agente AI para mesa ayuda', '9661c8f4-0262-414e-bd24-ef45e96e607f', 'Maysoft', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Agente para Mesa de ayuda en clientes como Fonacot y SEP.', '2026-05-30', '2026-03-30 18:00:00'),
  ('d03fc94c-6758-4b4b-9ada-c5ee64a62aff', 'Vacante Comercial - GCC', '2ef30837-6dee-4940-890f-0f6e15d78899', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '45000.00', '45000.00', 'MXN', 'RH', 'Asignacion', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-14', '2026-04-14 18:00:00'),
  ('c44f21d1-d4e8-4133-b703-c0b52261b802', 'Observabilidad (Instana) | Cloudability', '7c784b9e-817f-4ef1-90f6-a1c15630833d', 'Sanborns', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-07-30', '2026-03-30 18:00:00'),
  ('439c6fdd-5034-48c9-83c0-9fc2a6a650b6', 'Talleres Arquitectura de Datos', 'b19ec9cb-e6f2-4852-8eaa-2fa81df75a0b', 'Exemplis', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '86000.00', '86000.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Del evento de Tijuana', '2026-05-27', '2026-02-27 18:00:00'),
  ('33f729c3-5348-4667-b637-9c5873828fd5', 'Solución OCR+IA', '455b9da8-a0b3-489b-a8be-ddc394fa82e5', 'ArcelorMittal', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Estimación', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-31', '2026-02-23 18:00:00'),
  ('a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Licenciamiento IBM  Cognos Analytics & WatsonX.IA', '92596e84-03e3-42b6-86d0-36496e647845', 'Grupo Mexico', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Ganada', '20676.00', '0.00', '20676.00', 'USD', 'Datos', 'Licencia', 'IBM', NULL, 'f', '18.00', 'Licenciamiento Cognos & Watosonx.IA', '2025-12-30', '2026-01-01 18:00:00'),
  ('bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'CCA Ambiental_ Energy Check', '3c56e8cf-017d-4170-9f1d-bc424dc4936f', 'CCA Ambiental', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'en evento Switch Industrial comentó buscar automatizar procesos con IA, facturación, seguimientos, etc 

Interés en automatizar procesos administrativos, especialmente en cotizaciones y seguimiento de proyectos, que actualmente se realizan manualmente en Excel. Menciona que su empresa es familiar y que la automatización es crucial para no quedarse atrás.

Se discute la posibilidad de implementar procesos automatizados para gestionar el proceso de ventas, desde la carga del cliente hasta el cierre y el seguimiento de proyectos. Subcontrata el servicio de TI ', '2026-09-30', '2026-06-04 18:00:00'),
  ('4f01d5aa-507b-4a0c-bbab-764385faebdc', 'BeFashion (CTRENDY) - Asistente de RH-IA', '2900d268-a2ec-41ed-b360-8af3726b663e', 'BeFashion (CTRENDY)', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-09-06', '2026-04-30 18:00:00'),
  ('7d40aafb-798b-48df-8355-3bd809eb29cb', 'Bolsa de horas - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Cancelada', '0.00', '0.00', '0.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-30', '2026-04-30 18:00:00'),
  ('473a347a-6a8f-47af-a5b1-1ac98de3da0c', 'Agente IA Comercial', '27fca84a-ea94-47a8-9cd5-525fdd93e108', 'Paynau', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-26', '2026-05-06 18:00:00'),
  ('5dfeacfd-ba05-4b6c-a183-6d112689e27c', 'Billy IDP y S&S', 'f974e54f-a69a-4835-944f-ec60d6ed8533', 'UDEM', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-25', '2026-05-25 18:00:00'),
  ('986576f4-f3af-4ec2-b9ff-6dd376cf6575', 'Migración Micostrategy - PROLAMSA', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '159000.00', '159000.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-29', '2026-05-29 18:00:00'),
  ('c2cea0f5-850e-487b-b9b8-c59225c6b6ee', 'Vacante RH', 'c300d731-63d7-4bb1-b097-b512929703e2', 'Platinum Pack', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Propuesta', '0.00', '32000.00', '32000.00', 'MXN', 'RH', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-22', '2026-05-22 18:00:00'),
  ('5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'F-Tech - Proceso de RH', 'd6fbc7ee-aa61-406a-86b8-d4660e488257', 'F-Tech', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Propuesta', '858400.00', '0.00', '858400.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-08-30', '2026-04-30 18:00:00'),
  ('bf9df4ed-b0bf-49e8-971f-f62cbc1b78cd', 'Bachoco - Instana', 'b95421f5-c183-4feb-9cfb-eb33776be357', 'Grupo Bachoco', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Tiene poca visibilidad de servidores y baja rapidez en la solución de incidentes.', '2026-07-30', '2026-05-22 18:00:00'),
  ('5d8ef242-18c0-4431-af95-4c4a86132de4', 'Licencias Cognos / Migración - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-29', '2026-05-29 18:00:00'),
  ('00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Solarmex_Billy S&S', 'dda08a38-0ae1-42fe-b1af-ba744c61c530', 'Solarmex', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Negociación', '282535.00', '0.00', '282535.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-07-30', '2026-06-05 18:00:00'),
  ('7b1d7bc6-276e-4ef2-95e7-5a3f2734b525', 'Billy IDP', 'b4dc9782-48a5-4924-927f-c53d4e18b65d', 'OxxO', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Del Tech Summit', '2026-06-01', '2026-06-01 18:00:00'),
  ('6834a74d-af5b-4983-91b9-cad2459075d6', 'BOB - AI Coding', 'fed0a33b-c4d2-4e09-bdda-ad74ece19cbe', 'PAYNAU', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Perdida', '81005.00', '22316.00', '103321.00', 'USD', 'Desarrollo', 'Proyecto', 'IBM', 'uploads/6834a74d-af5b-4983-91b9-cad2459075d6/Propuesta Licenciamiento TIBS AI Coding PAYNAU.pdf', 'f', '17.38', '', '2026-06-02', '2026-06-02 18:00:00'),
  ('c2fc3d81-4cf8-4bd2-8779-7b96a04653b1', 'Bolsa Soporte - Prolamsa ', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Ganada', '0.00', '90000.00', '90000.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-29', '2026-05-29 18:00:00'),
  ('023ff1d6-3f06-44c2-b75d-00175bf8f9ad', 'Bolsa de horas - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Perdida', '0.00', '90000.00', '90000.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-22', '2026-05-22 18:00:00'),
  ('0497b77e-1471-4192-8f9f-d0f5239c24dc', '#MKT_ Data BI - Billy IDP', '473a1fcc-e938-46e9-bb9b-84dad2e631ed', 'Databi CR', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Standby', '980.00', '0.00', '980.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-09-30', '2026-07-02 18:00:00'),
  ('c75a06a1-eaae-4cc0-99b4-db056b60d1a8', 'Gestión de Auditorias - GCC', 'd6a4036f-29c7-4322-ac8f-44d2185a47bd', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-04-30', '2026-04-30 18:00:00'),
  ('61f77ac3-1676-4f9e-80ea-e586019a158d', 'Billy IDP y S&S', '3edfdc9e-46bb-448d-a96b-272b92b87d89', 'Casa Garza de Monterrey', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Standby', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-05-25', '2026-05-25 18:00:00'),
  ('ade764c5-9cf1-460f-96d0-ac2ac578f6eb', 'Norma Erivez', 'b9da80dd-54e2-418d-9822-641371469845', '(Jumex)', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Empresa hermana menor de Jumex (hacen nectares) quieren conocer sobre IA, les llamó la atención Visual Inspection y automatizar tareas con IA para su operación. ', '2026-08-31', '2026-06-08 18:00:00'),
  ('488dafaf-78a7-474e-802d-33412ff6445f', 'DINCO - Visual Inspection', '3cbed245-fb4a-4882-808b-301eb17b117f', 'Dinco', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Maximo Visual Inspection / Mtto en infraestructura ', '2026-08-31', '2026-06-08 18:00:00'),
  ('3df8a49b-a3b3-4ad8-b90a-be1ade00dc4c', 'Configuración TRM SAP- GCC', 'c1bb0295-b1d5-4f81-8383-56676ea252f9', 'GCC', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Negociación', '0.00', '760330.00', '760330.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-01', '2026-06-01 18:00:00'),
  ('20b388fe-19df-4c51-b66d-acb23f4af59b', 'Transformación Datos Comerciales', 'e84185b8-0efd-4367-a717-fe098ffb63f1', 'Paynau', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Propuesta', '0.00', '825600.00', '825600.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-25', '2026-05-06 18:00:00'),
  ('fb7e03d4-640c-4549-87d6-d35a6b36c741', 'Migración Datos Daltile ', 'f5a2a118-d3a2-4a4e-9807-4a69261f1bcf', 'Daltile', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Perdida', '0.00', '3005186.00', '3005186.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Migración y Modernización de Datos ', '2026-07-31', '2026-05-22 18:00:00'),
  ('ed0fdec8-8fd8-405e-b34d-c094b72070a7', 'CIME_BILLY S&S - CRM', 'cf02a860-f428-4215-94af-1365f07d587a', 'CIME Power Systems', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Propuesta', '237100.00', '0.00', '237100.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-08-28', '2026-06-25 18:00:00'),
  ('ca9d57bb-4683-4676-9317-136fae22ea72', 'Grupo Rosa_CRM', '5e089020-9888-48b8-a54b-626e780147c8', 'Grupo Rosa', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Estimación', '255800.00', '0.00', '255800.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-09-26', '2026-06-05 18:00:00'),
  ('48eaa8fa-06d0-4f21-b5aa-ddbddf962b95', 'Bolsa de horas SQL - Prolamsa', '54838ce0-d4d1-4640-94ba-813dfac00d9b', 'PROLAMSA', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Standby', '0.00', '85000.00', '85000.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-03', '2026-06-03 18:00:00'),
  ('24835020-0cc0-48f5-8f34-890d80369c92', 'Estado de Resultados Prorrateo en Artus BI', '45010a30-7467-43be-82d6-3b3acc2bef8b', 'Berel', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Negociación', '0.00', '917800.00', '917800.00', 'MXN', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Estado de Resultados Prorrateo en
Artus BI', '2026-06-03', '2026-05-20 18:00:00'),
  ('4ef596d2-6d94-41c3-9e62-d265be23013e', 'Renovación PA ', '7a9d117c-fe3b-46b7-a010-ed66b0372a9b', 'Autlán', 'c2793945-a827-4649-b4ec-fb983fcb6174', 'Negociación', '25084.05', '0.00', '25084.05', 'USD', 'Datos', 'Licencia', 'IBM', NULL, 'f', '17.47', '', '2026-06-30', '2026-06-02 18:00:00'),
  ('71b5225e-13a7-417c-80e5-df70d31e03e7', 'Invernaderos Mesa Grande', '97d6ac09-2dda-4ef9-8c7d-09d23fb220ef', 'Invernaderos Mesa Grande', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-08-29', '2026-04-30 18:00:00'),
  ('1c324109-2420-456d-b0c6-d89defdf5d60', 'Billy IDP', '473a1fcc-e938-46e9-bb9b-84dad2e631ed', 'Databi CR', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 't', '0.00', 'Llegó por leads de marketing, es de Costa Rica', '2026-06-26', '2026-06-26 18:00:00'),
  ('52fa0666-595c-41e9-9bbd-cad26ba2627f', '#MKT Billy S&S', '3dad64ac-a545-4783-a77d-80661b00e82d', 'HG Supply', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Interés en Billy S&S, lead de campañas de Marketing', '2026-06-22', '2026-06-22 18:00:00'),
  ('ad00d82c-3098-472a-bf21-e34b0a367042', 'Workshop IA Discovery', 'ccda5ba3-a7a0-4972-8cee-6da9a399c50e', 'AFFISA', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Interesados en el workshop ', '2026-07-15', '2026-07-03 18:00:00'),
  ('8973ed1e-39f9-4760-986f-f63b41321f98', '#MKT Billy IDP', '41d31e59-7f49-4f02-8da0-6fef1fd3098d', 'MYS Consultoría Energética', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Cancelada', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-07-02', '2026-07-02 18:00:00'),
  ('b897154a-7f9b-4ab1-9b38-3e866e87d9eb', '#MKT Billy IDP', 'ff25f4d2-9bff-4611-a5ec-757d25afe7ad', 'Notaría 10 Acapulco', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Propuesta', '0.00', '0.00', '0.00', 'USD', 'Desarrollo', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-01', '2026-06-01 18:00:00'),
  ('427de668-1d60-441c-89c2-ee7239e91e2b', 'FUNO_IBM', '5e7b2f09-747a-4f14-9eba-7f75bdcff012', 'Fibra Uno', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Descubrimiento', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Instana
Cloudability
BOB', '2026-09-17', '2026-07-15 18:00:00'),
  ('91fd1fdc-8940-4588-b1eb-eb38c945133b', 'Plataforma de Datos', 'e84185b8-0efd-4367-a717-fe098ffb63f1', 'Paynau', '218506fb-a00a-49db-bbfb-1c02075a96f5', 'Perdida', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', '', '2026-06-02', '2026-06-02 18:00:00'),
  ('631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Reportes KPIs y automatizaciones', 'cf02a860-f428-4215-94af-1365f07d587a', 'CIME P ower Systems', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Perdida', '0.00', '349250.00', '349250.00', 'MXN', 'Datos', 'Bolsa de Horas', 'No Aplica', NULL, 'f', '0.00', 'Cime Power Systems es una empresa mexicana fundada en 1944, especializada en soluciones de energía eléctrica. Ofrecen una amplia gama de servicios incluyendo:
- Plantas de luz y generadores eléctricos con motores a gas LP, gas natural, diesel, y más.
- Sistemas de energía ininterrumpida (UPS).
- Servicio de instalación y mantenimiento de equipos, con personal técnico altamente capacitado disponible las 24 horas.
- Distribución de marcas reconocidas como Generac y AKSA.

La compañía está conformada por 80 personas.

Actualmente las necesidades principales pueden ser en Ventas para todo el tema de ver situación actual del negocio y Servicios ya que quieren poder ver polizas de mantenimiento, poder tomar decisiones administrativas y que eso se derive en decisiones de compras, hoy tienen exceles por etapas.', '2026-05-30', '2026-03-13 18:00:00'),
  ('501ce274-5a76-4a63-9630-b3301fdac82a', 'Workshop IA Discovery', 'ee3b37a6-61dc-4f83-9d13-aa07d96d401b', 'Bolsa Mexicana de Valores', 'c6bab003-146f-492b-95dd-b530d69d6e42', 'Nuevo', '0.00', '0.00', '0.00', 'USD', 'Datos', 'Proyecto', 'No Aplica', NULL, 'f', '0.00', 'Se esta evaluando la posibilidad de poder ejecutar este workshop', '2026-08-31', '2026-07-30 18:00:00');



--
-- Data for Name: opportunity_trackings; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.opportunity_trackings
INSERT INTO staging.opportunity_trackings (id, opportunity_id, stage, "changedAt", changed_by_id) VALUES
  ('e3228889-e375-4453-bff1-3fec8d1c5fee', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'Negociación', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('7688f5ce-5a88-4bf4-abb6-4ca0efe51810', '42973736-7468-45bb-ba8d-eeade5724027', 'Negociación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('1a927c46-f2df-4ea4-8e21-9b6cd2db0bf1', '9e898a3b-4719-4fcb-949b-8cdb24fe6af3', 'Negociación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('8af51711-49d3-488d-b075-d4f05394c0f8', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('53db78ba-7bf4-4707-8f5c-2f13d5160580', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', 'Cancelada', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2ace4efd-f42c-4f1f-9d7d-6f41a7180756', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', 'Propuesta', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('babab57e-768b-445b-a510-4765e5239859', 'b191291b-c7cd-4a9d-9e99-7224e186274b', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c5737838-caba-4ebd-93d9-ac0310f04f3f', '8d608aa8-e43a-495d-9d0d-cf4f962645fd', 'Descubrimiento', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('43cb1863-9e21-417d-8bf2-e657bb418dce', '53bd52ac-e889-4f97-901d-dcac8c6eb3f3', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2e839f8d-ac93-41c7-a39e-3902f19ad290', '75fdec71-4f26-4fab-a94a-c75989232a0c', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('968cab04-856b-4bb1-93a5-1b976e0d04d7', '7741605c-7994-457e-919b-13ba0c18b13c', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('45495568-11f9-4590-9e88-ecaa72163997', '15e058d7-64d0-41ee-b19b-b2902a65384c', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ab4dc9b1-de14-428f-8c18-26274a42d796', '03ae88ce-052d-44fb-9394-0aedcd30c79f', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('fc90a1c7-9ff3-432c-84ca-e7b61671707f', 'dd54fa82-a281-4b0c-be46-d82683630799', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('0f4d8257-1024-4346-96d5-f0352b5c2a6b', '87a44983-6df6-423e-8a45-9d86fadda21a', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('e753ed51-ddf0-402e-b76a-421555cf31e7', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('44078d9e-4052-4bba-ad63-ac219a1755ef', 'c6e62741-a66f-4940-908e-ab5357f6a2e5', 'Cancelada', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('78c31e94-25ce-4a69-8983-eadfcf834bb3', 'de986524-e4b8-4a95-a49f-d193185bed05', 'Perdida', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('77fca01a-ed18-4f4f-aad5-afa7ccb5b83e', 'fdff99c1-d090-4725-83c8-bc049faec948', 'Perdida', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('0f062c73-8979-4687-b5b6-4b98fed40bce', '9faffa11-f57b-46e3-a886-8ab1082d0ee5', 'Cancelada', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('4b444b0e-d8bb-4424-afe3-26e127a21890', 'fc563b86-6645-4901-aed7-ccb666a70bfb', 'Estimación', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('370c15a5-db12-494b-b8b5-04799a3c6c07', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'Nuevo', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('66c17766-a3a2-492a-a345-1697236634b3', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Estimación', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('7257e37c-55c0-45e8-a98c-651be1a5e18e', '2c5bc58c-a953-4c94-8bb1-2fc0e96d048e', 'Perdida', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('00f2e3f2-b86d-44f0-9527-3580c203f70d', '98063f16-41c1-4246-b237-0e5d49f97811', 'Cancelada', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('b94a5a24-5455-4e62-ae70-38041cdb1fad', 'fe76c543-b161-45dd-b76d-08f90b3a2997', 'Perdida', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ef08e58b-d7a5-4120-8750-639d160cfc34', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', 'Negociación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('73358d99-2dd2-48ac-9363-6d2292cec204', '3758043d-a008-4131-b247-68e19f6abc40', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('26d80299-9688-434c-aa82-aa54fcfeb047', '445c926b-00fe-4383-b117-df1be0d9bd3e', 'Cancelada', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('6a4ab21d-7869-4918-8f7a-faeedcbd68b7', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1', 'Cancelada', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('11959b92-463a-44a8-9c70-598caecf8867', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c69cef3e-fe64-463c-bb63-334efeaa3a04', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', 'Negociación', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f8c0c848-2002-4369-9d9c-cffc0de36ecf', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'Negociación', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('15907f30-045d-49b3-81dc-aa1f8fe16a61', 'da170cae-3a57-421f-9b3c-923f70c7303e', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('784b5da2-7ece-4321-a1df-e7359048fa37', 'c621b04c-5fa5-41f6-b19b-e01a3de3882a', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('673c207d-c6d4-4d65-912d-6dac746fcabe', 'd30069d6-655b-4460-8375-f7cf2b561806', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('4e3396ce-0313-479c-94fd-0af84a862eb8', '3709a36d-efa6-4147-b3fe-19d1d039789b', 'Perdida', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('8c2752cb-e063-4f67-ba15-53ff6c366819', '81c990dd-1a8b-4c61-ae96-2deaa154a38f', 'Cancelada', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('8ba97ceb-ae83-46a3-8e75-1f022d289b98', 'e521621f-c4f0-4a1f-a7a8-a5e18fdeed6a', 'Estimación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('4a53582c-a759-4127-b99b-dd82b25f4d48', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'Negociación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2ce18928-68de-4fd8-8615-47fafcb1ff95', '371187c3-abe8-461f-9ba0-8d5679a11a97', 'Negociación', '2025-11-18 21:30:56.861488', '568d5e34-cfb0-4545-9c7f-2dbac618343e'),
  ('0b178ea7-caff-4827-bc0a-801f21c4d0e6', 'fdddce16-eacf-4879-afaf-2474526c5665', 'Descubrimiento', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('5808e08b-e504-4c33-a0ce-e183d764246f', '4fda362b-2210-413f-a7b9-34caaace34ec', 'Estimación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ddb2c62f-ce76-4da5-ba27-6b09e250b377', 'd743540b-7a72-41e1-94d2-7292fa2731af', 'Descubrimiento', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('8ea330ba-3aa1-45bf-9dd5-2eaae60b4318', 'f0650475-faf4-4a59-88fa-27589e9f86e4', 'Estimación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('fbb84965-4715-48c0-9f12-9b67b3aaa356', 'fac1185d-9ddd-49f4-a746-7104c3a95bae', 'Estimación', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f0591afb-5108-4095-9c78-1f52697e8d32', '6182781a-4f62-4970-8e4b-91e1999a52a4', 'Cancelada', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('92934ee5-8a51-42aa-92d6-c794d4e01d98', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'Descubrimiento', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('0069dc06-2b35-4802-95ab-a70097c3da35', 'aa2f2c01-aef9-4f45-801d-cf450de10e87', 'Cancelada', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('29b49277-d116-40f4-8c37-85f86ab5dc33', 'eed44d07-ebd0-487d-bc5d-976f0828725c', 'Propuesta', '2025-11-18 21:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('eef4bda3-e612-4daa-97e2-825e555568da', '1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e', 'Negociación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a1311a62-1ddb-4ae4-9fa3-605c92ef6b3d', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'Nuevo', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('7f78518b-bdff-4a56-bc24-fcd5c5ecd085', '9642b008-e953-4fb1-8754-76e10e849bc7', 'Nuevo', '2025-11-18 21:30:56.861488', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('53ac9f9f-228e-4f15-85de-7078914c509b', '87868565-0b10-472f-afa1-994cac8f3d6b', 'Descubrimiento', '2025-11-18 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('57863ebb-40c9-4352-b223-35aefe84045e', '31ee6490-1a15-4209-a95c-5430f752a8d2', 'Estimación', '2025-11-18 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('12f5de8a-6e31-40f1-b84b-12020b3510a1', '373f51e5-d2ac-4427-9711-5471a3ec74b4', 'Ganada', '2025-11-10 18:38:42.438246', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d07bfbb1-a375-4f54-b64d-428293c04201', '373f51e5-d2ac-4427-9711-5471a3ec74b4', 'Negociación', '2025-11-07 18:38:36.208754', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('a8532512-8771-4254-8f96-a9aef562b329', 'f0650475-faf4-4a59-88fa-27589e9f86e4', 'Propuesta', '2025-11-20 15:42:02.554665', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('19cf6f33-e29c-48c3-8601-bd7a39100c1b', 'f0650475-faf4-4a59-88fa-27589e9f86e4', 'Negociación', '2025-11-20 16:21:53.796748', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('7978a647-969a-495f-9b4b-5215d6ea66a7', 'b191291b-c7cd-4a9d-9e99-7224e186274b', 'Ganada', '2025-11-20 16:58:17.536575', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('3853ba36-340e-4ca0-8ba1-fc4753f28aa7', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'Negociación', '2025-11-20 17:00:05.762403', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('eff5c033-9ad8-439c-b649-a84fe1ada8e3', 'eed44d07-ebd0-487d-bc5d-976f0828725c', 'Negociación', '2025-11-20 17:00:59.642977', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c37ee7b1-cc63-48e9-8681-1910cc47c96a', 'f0650475-faf4-4a59-88fa-27589e9f86e4', 'Cancelada', '2025-11-20 17:39:50.760169', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('49d64c68-df6d-482e-8756-371ca96d7111', 'cd75151c-0f8d-4daf-b046-15b86bde0a10', 'Propuesta', '2025-11-20 21:36:11.16027', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('b8d718e3-b1f2-4385-acc0-b9c3366af052', '124615c1-b567-4542-b94e-0fdbf997f56e', 'Descubrimiento', '2025-11-20 23:25:04.610477', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('67a4a091-4725-4010-bd8b-870441841e23', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', 'Nuevo', '2025-11-21 18:43:42.88261', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('cef1191b-e34a-4ecb-ac42-533f14aa25b2', '75aec45f-2ab9-45ca-ae08-dc1126be9c78', 'Nuevo', '2025-11-24 17:39:53.693005', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('eb0ff220-f461-4b1d-8395-5c38e361eec8', '16f9203a-7a14-4ca5-9e70-65b2d1f75488', 'Cancelada', '2025-11-24 22:20:05.295701', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('a4d804d4-7907-4237-8724-95ca4f4f816e', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Cancelada', '2025-11-24 22:22:29.879053', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('cfdfd38f-9e1c-4393-b044-4058b0a34bb0', '2743b385-7f41-404e-9ea7-e46ebb8a85fd', 'Cancelada', '2025-11-24 22:22:54.005205', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6cc49e93-f0dd-4948-8645-cb9a50a80cd7', 'e521621f-c4f0-4a1f-a7a8-a5e18fdeed6a', 'Perdida', '2025-11-25 15:55:35.212421', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('609f677c-b256-41d2-b551-96519cfa965b', '124615c1-b567-4542-b94e-0fdbf997f56e', 'Estimación', '2025-11-25 15:57:00.902067', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('1c519f8a-333f-4ac5-9012-4e5823095153', '48b654c6-d75f-4b4c-b4bf-a7fc873bba90', 'Descubrimiento', '2025-11-25 16:15:14.603284', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('419ed1ac-7bed-4e5a-88a7-9d1327404382', 'f8586d2b-aa1a-44de-ab10-857f9b27523d', 'Ganada', '2025-10-27 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('84de8e04-1b08-4c99-a6b5-1a03af1982be', '3a017b60-3c2a-49ed-b477-6925e76d3b95', 'Ganada', '2025-10-18 17:30:56.861488', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2417f817-a7dd-4e28-8f85-a5977c32639a', '7c3019f6-3725-451b-af89-570aa989d1f9', 'Ganada', '2025-10-24 00:00:00', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7d0d93b8-67bc-4b6a-8a5e-491b26196035', '1aa89cf2-a90d-40e5-8c1f-4d9f4ce7054d', 'Ganada', '2025-11-05 21:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('5a431a3e-097f-4030-9228-08fc6eb43bf9', '4ff9968a-7bd8-49bf-853b-225144c2676e', 'Ganada', '2025-11-18 13:30:56.861488', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('393fe549-acd5-478c-876d-f16d87a1e54d', '1b5ced92-52a1-4ebe-9d91-b68ca3dcbe2e', 'Ganada', '2025-11-17 22:13:05.162609', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('8c7e86d6-7459-4d51-a5e7-4a41dc9422bc', '90321cca-9746-4f73-b338-5d327e33387b', 'Ganada', '2025-11-14 21:30:56.861488', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('bc7acc05-7c0f-42bd-b625-efafdffdd481', '127e6496-d274-4233-a6b9-e2fa937e0271', 'Descubrimiento', '2025-11-25 17:53:28.165151', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d0d946bc-117e-4445-9e6e-7adef090c892', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Nuevo', '2025-11-25 18:20:28.733206', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c2aba097-0fa2-4044-9c56-8b5efdd0d34f', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'Nuevo', '2025-11-25 18:25:31.546337', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('cdd919bc-83b7-4135-9d43-1285f625ad05', 'f0650475-faf4-4a59-88fa-27589e9f86e4', 'Perdida', '2025-11-25 18:52:28.584875', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('35cf8cfc-7496-48d3-a997-20999b20d19b', '445c926b-00fe-4383-b117-df1be0d9bd3e', 'Perdida', '2025-11-25 18:52:32.101319', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a29be013-c487-4fad-8eeb-74fab51adbdc', '98063f16-41c1-4246-b237-0e5d49f97811', 'Perdida', '2025-11-25 18:52:34.124958', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('921a1f7a-b07b-434c-89b7-e32afeb536fd', '98063f16-41c1-4246-b237-0e5d49f97811', 'Cancelada', '2025-11-25 18:52:36.199389', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('843fb630-39cf-4da9-9444-88a34ef59efe', '9e898a3b-4719-4fcb-949b-8cdb24fe6af3', 'Cancelada', '2025-11-25 19:03:31.392615', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('cd460caa-6f77-407f-9d11-67c32f62239b', 'fdddce16-eacf-4879-afaf-2474526c5665', 'Estimación', '2025-11-25 19:10:56.923315', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ef8d6a6a-5aeb-46d9-9867-8626c4c09e62', 'd743540b-7a72-41e1-94d2-7292fa2731af', 'Nuevo', '2025-11-25 19:11:00.637743', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f5aba490-f58a-46fd-b6a8-8bda00d4b969', '4fda362b-2210-413f-a7b9-34caaace34ec', 'Propuesta', '2025-11-26 16:34:51.419221', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ffe5aa5a-1de2-427b-af08-2956b8f812ca', '31ee6490-1a15-4209-a95c-5430f752a8d2', 'Propuesta', '2025-11-26 16:34:53.412248', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e7cde962-a9e3-4033-ba13-c3404afd4683', '124615c1-b567-4542-b94e-0fdbf997f56e', 'Propuesta', '2025-11-26 23:49:39.094484', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('20497ba8-e4da-4cc2-988c-7b43d61ffed5', '50aa0ca1-4d26-4e5a-b47b-cb03fa9f49b7', 'Nuevo', '2025-11-27 18:24:41.111419', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('01a75ea0-4f43-4cc6-a4a6-920fe60b8b43', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'Negociación', '2025-11-27 18:25:13.585846', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('3cf028d0-10ce-4e97-af16-3dd1a08f52d1', 'd2e9ac9b-6d36-4706-94a0-a1c95e60c59c', 'Nuevo', '2025-11-28 19:55:13.457963', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c4a3385d-c3e5-4a3c-8295-86bb0c66e0a8', '2e8c99c5-84a8-45f8-a5cd-6828c1ff0369', 'Estimación', '2025-12-02 15:43:12.340023', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('457cd157-f640-43d0-a862-f2c2270df76f', 'fe76c543-b161-45dd-b76d-08f90b3a2997', 'Cancelada', '2025-12-02 16:01:33.614253', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('92b1b17f-db31-490e-aba8-12a83b7c810d', 'd48d5414-5854-4c8c-96f9-27e6cc54257c', 'Cancelada', '2025-12-04 15:14:40.739287', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1cce48b3-e2d3-4b44-aab1-83aac69bf19f', '38700b57-f773-4082-a629-e9efb971cd82', 'Propuesta', '2025-12-04 23:22:40.402096', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('87b8f407-9046-4d98-b453-1cfe396c1f70', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'Nuevo', '2025-12-04 23:55:21.641236', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('07cd0a2f-81d0-4651-91c9-5c475f12a385', 'fc8dd53b-1b07-4420-9622-5737cb899c2e', 'Negociación', '2025-12-05 00:06:26.975406', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('0c232b8c-1d80-4ada-97b2-51ecc1431194', 'fc8dd53b-1b07-4420-9622-5737cb899c2e', 'Ganada', '2025-12-05 00:06:38.073862', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('581e3935-8b57-4612-aa19-72b47bc6e894', 'a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Nuevo', '2025-12-05 18:00:55.601908', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('d831427a-3a44-4dd9-9111-dc2560f53bd3', 'a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Propuesta', '2025-12-05 18:01:04.840443', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('5bf2c3e4-0620-48c7-8a58-7553835844f5', 'd1df4fb7-f3eb-4106-b19d-e2c352e41a73', 'Standby', '2025-12-05 18:49:41.747122', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('584d985f-d077-4c13-9a16-3b88463863f6', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Standby', '2025-12-05 18:53:55.61323', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('5c2e76d4-4952-4918-9b90-eac567cc643e', '1c2bcefa-b79d-4290-b884-1be9c3b38057', 'Estimación', '2025-12-05 18:55:06.429273', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('6fe4b51e-97ef-42a0-8740-54ff3e2697f0', '44a8bf14-709d-4262-a11c-e3f127efcd2d', 'Standby', '2025-12-05 18:55:24.310131', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('133d571b-38c1-417f-a24f-ce6800682d3b', 'fc563b86-6645-4901-aed7-ccb666a70bfb', 'Propuesta', '2025-12-05 18:55:40.858267', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6df8f4e2-a34b-48b5-a020-64324506759b', '348f4d64-e454-43db-93d7-4ac669afbb89', 'Standby', '2025-12-05 19:42:59.397842', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b33e9b11-7ef2-4c20-8131-653dbe354130', 'cde7f0b0-5411-4717-a20e-177ba87f48c6', 'Standby', '2025-12-05 19:45:19.346191', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('f26a184e-75d1-4953-abd3-392f4737d4a9', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Descubrimiento', '2025-12-09 14:52:06.30331', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d3ad8c2b-e6a5-4a13-8870-0c188e1df2bc', '17c12f44-ae2a-4476-8022-1a1c1dc002e1', 'Cancelada', '2025-12-09 15:05:13.855575', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1a91454f-b8b0-4466-b560-41384e1d2f7b', 'fc563b86-6645-4901-aed7-ccb666a70bfb', 'Standby', '2025-12-09 15:05:40.302878', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f093a760-3fbb-46d2-9dff-6a31ff19b7c8', '66031b4d-cc1a-4543-9981-c9f3029bc1f5', 'Standby', '2025-12-09 15:55:28.980719', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('84cb4948-6252-4b4b-9f6c-057a1911fd5e', '38700b57-f773-4082-a629-e9efb971cd82', 'Negociación', '2025-12-09 18:27:38.537042', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('50465efe-8d48-45b3-a811-8cf8ab89bf2d', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Nuevo', '2025-12-09 21:41:36.706461', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('85bd1b16-3e8f-48fb-a7a1-ae7811d9c22e', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Descubrimiento', '2025-12-09 21:41:41.386573', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('4d99809d-5e93-4485-9164-edf39fbcf84c', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Estimación', '2025-12-09 21:41:44.434772', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6f1954fb-d3b7-49a5-917a-ab501ad13690', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Propuesta', '2025-12-09 21:41:47.148648', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('52216a6d-2f8a-43c9-a7ff-1abf1a9de82f', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Negociación', '2025-12-09 21:41:50.5387', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9afd6412-4862-462f-b4c9-5b29a811b196', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Ganada', '2025-12-09 21:42:01.713638', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f53e26d7-fabd-4cc6-93e7-561b1762559f', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Propuesta', '2025-12-09 21:42:05.957384', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('dc3cc3d3-87da-4569-b13a-5057ac801044', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Negociación', '2025-12-09 21:42:09.093939', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6331dd5a-6305-4a15-b8e1-5560ed51b498', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Ganada', '2025-12-09 21:42:10.99917', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('df610621-afa1-4797-b627-4a622b5a9cd1', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Perdida', '2025-12-09 21:42:16.68691', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('359b4e45-bf46-4a48-a756-186e6d8b9df3', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Cancelada', '2025-12-09 21:42:23.23937', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('12003e3e-5822-4fb0-8ca2-bbba820ac0b3', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Standby', '2025-12-09 21:42:28.271595', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ac982f1e-ac0e-47ca-bd65-9034bee427df', 'c3458866-6edb-4f75-8ec1-f2d8c5b9355b', 'Cancelada', '2025-12-09 21:42:38.402972', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('8be040b3-2c9f-433d-82f6-700527dd4b96', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'Descubrimiento', '2025-12-11 16:29:49.227376', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('5cec3031-2e41-421f-8eaf-3592e0bcb4e4', 'a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Negociación', '2025-12-12 16:38:39.47597', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('e4da9c47-40ee-4d09-9f09-0c45d4a72e19', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Estimación', '2025-12-12 18:08:17.028107', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('afd12de4-92fa-4915-8bc0-ea2ef479b453', '7408172b-bbf8-451c-ad9e-935e6eaa8263', 'Descubrimiento', '2025-12-12 18:09:30.874213', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e96e81f3-c0ae-4d99-8a1e-589f22e9ed4c', '38700b57-f773-4082-a629-e9efb971cd82', 'Ganada', '2025-12-12 18:30:16.191612', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('9f35da3a-7cbc-465a-9123-5e16ffafc214', '4fda362b-2210-413f-a7b9-34caaace34ec', 'Estimación', '2025-12-12 18:39:35.209662', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a77494f9-b42f-44f2-afbf-22e61ed8b570', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Propuesta', '2025-12-16 15:34:58.251305', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('2261108b-071a-4c70-8d40-e8b0f0963713', '124615c1-b567-4542-b94e-0fdbf997f56e', 'Negociación', '2025-12-17 19:32:24.685035', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('7de8f829-672f-419c-b60d-681a571dec0f', '7741605c-7994-457e-919b-13ba0c18b13c', 'Standby', '2025-12-18 22:26:49.238499', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2d9116f1-4540-4253-bd22-919976f9ab31', '15e058d7-64d0-41ee-b19b-b2902a65384c', 'Standby', '2025-12-18 22:26:55.143596', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('5b845caa-0d23-40ed-b8cf-4ac9c019fc6e', '03ae88ce-052d-44fb-9394-0aedcd30c79f', 'Standby', '2025-12-18 22:26:58.384743', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7814b1ef-2edc-4084-8f2e-7525667a0371', 'dd54fa82-a281-4b0c-be46-d82683630799', 'Standby', '2025-12-18 22:27:01.773114', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('90327d0f-b561-447b-8cd4-9863e446a630', '49c8ce45-6b6d-48ca-989b-ffc42b6b346b', 'Negociación', '2025-12-18 22:30:44.162028', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7a231cbe-7f20-4d71-a934-86cc9180e06c', 'cd75151c-0f8d-4daf-b046-15b86bde0a10', 'Perdida', '2025-12-18 22:31:06.6678', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f9a5ef50-6d05-4316-9e99-7b412771bdf8', '87a44983-6df6-423e-8a45-9d86fadda21a', 'Estimación', '2025-12-18 22:31:14.972586', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2c11c436-bb4e-4b81-ae3a-a1735f2d148f', '75fdec71-4f26-4fab-a94a-c75989232a0c', 'Descubrimiento', '2025-12-18 22:31:18.523287', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('723cd6d5-46fa-404c-bd58-f9b9cd2b22a2', 'fac1185d-9ddd-49f4-a746-7104c3a95bae', 'Descubrimiento', '2025-12-18 22:32:02.453737', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('b437b37e-c20f-4e3a-b092-36b087b9b798', '50aa0ca1-4d26-4e5a-b47b-cb03fa9f49b7', 'Descubrimiento', '2025-12-18 22:32:20.590794', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c0915e8d-4bc9-4414-9bb3-ee1ce5f7667e', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'Estimación', '2025-12-18 23:36:02.744643', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('99cb5705-23f9-4cea-81bf-c762edafe3ee', '9e898a3b-4719-4fcb-949b-8cdb24fe6af3', 'Negociación', '2025-12-19 00:12:51.103423', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('eaad6659-2ad2-45a9-b156-84c87bd743a2', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Negociación', '2025-12-19 00:12:54.658208', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('222dd0cc-3176-47cf-9837-56f23c94ee5d', '63ffac9a-3667-48f6-85ab-fa6b9b02e550', 'Negociación', '2025-12-19 00:13:49.676144', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('b47b5b60-1a24-41a6-9656-132a0b6a2130', '6815286d-1fd2-4c6b-a429-a5b049d79321', 'Estimación', '2025-12-19 18:23:49.924557', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a84b3622-eefa-4dba-90b0-31970b2ef79c', '87868565-0b10-472f-afa1-994cac8f3d6b', 'Estimación', '2025-12-20 00:00:08.331205', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2a2aede6-7856-4a55-a957-6cdf89a842be', '7b532ed5-5f2f-41b8-afa0-51dde90c19a9', 'Standby', '2025-12-22 15:41:13.898804', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6ebb9be8-8c3d-4b38-85f1-1a6f564554de', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Propuesta', '2025-12-22 21:30:48.095223', 'e3b6293e-6e95-4fc5-b61d-96dba1d896b3'),
  ('f0861c5d-a1d7-4134-a6dd-b7fff4c62949', '87868565-0b10-472f-afa1-994cac8f3d6b', 'Propuesta', '2026-01-09 09:52:41.925468', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('29288d85-63aa-4af5-b335-ab6ce8ab7e08', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Descubrimiento', '2026-01-12 18:04:35.717361', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('732d8aae-df59-4c88-95cb-f230bb655722', '9dbb6491-6ae3-445a-9625-c795b1093945', 'Descubrimiento', '2026-01-13 09:17:43.280115', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('9064b665-229a-4179-b5c1-730fd16bcf41', '6815286d-1fd2-4c6b-a429-a5b049d79321', 'Propuesta', '2026-01-13 09:19:35.59011', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('299f36d8-2788-45b2-afca-1d1b9b116cb5', '63ffac9a-3667-48f6-85ab-fa6b9b02e550', 'Ganada', '2025-12-19 00:32:55.189547', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a3d62559-b2c4-43d4-9db5-37c605973cf1', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Nuevo', '2026-01-12 15:03:56.338973', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3a44adc3-8230-4d2c-bfb1-d749d0de1f22', '49c8ce45-6b6d-48ca-989b-ffc42b6b346b', 'Ganada', '2026-01-12 17:10:27.127703', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('b5ca52fb-101b-4835-8ec9-89193ac79848', 'fdddce16-eacf-4879-afaf-2474526c5665', 'Negociación', '2026-01-12 17:11:51.51567', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c08746e3-da9d-41f5-84f2-4c4caa4de10a', '4fda362b-2210-413f-a7b9-34caaace34ec', 'Propuesta', '2026-01-13 09:19:51.153115', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('25348aaf-fa76-49a1-b02a-03400b7201eb', '3fa33b33-d95b-4c06-ac49-76682954e01b', 'Nuevo', '2026-01-13 17:10:33.307358', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('c48a5385-e04c-46f6-bb1b-aec242057c9f', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Estimación', '2026-01-14 17:27:44.908038', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('3e4de3c7-0290-4f6b-9dc9-83031a1d2296', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Descubrimiento', '2026-01-14 17:27:47.646807', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('8a6fef96-c6f6-4c65-9061-9205a07e5f4a', '3fa33b33-d95b-4c06-ac49-76682954e01b', 'Descubrimiento', '2026-01-14 17:27:53.819708', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('07ff82c3-1a9a-420b-8202-60dfb77c70fa', '8d608aa8-e43a-495d-9d0d-cf4f962645fd', 'Nuevo', '2026-01-15 14:35:22.984113', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ac991f4e-9e5f-44b3-bbd1-2c5ead40259e', 'fac1185d-9ddd-49f4-a746-7104c3a95bae', 'Cancelada', '2026-01-15 14:37:02.884663', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('487e7529-b48e-4727-8cbf-cf84107e2364', '50aa0ca1-4d26-4e5a-b47b-cb03fa9f49b7', 'Estimación', '2026-01-15 14:37:12.563554', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c97c577f-9e4d-499d-9284-59be2609bf40', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Estimación', '2026-01-16 09:57:36.798022', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('894645d0-11c5-40cc-8300-95e3dcdf8543', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', 'Nuevo', '2026-01-16 10:59:11.746459', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('c7f645cb-6051-434c-acb8-6cb84e5008e1', '9dbb6491-6ae3-445a-9625-c795b1093945', 'Estimación', '2026-01-16 11:20:16.733123', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('93e6e02a-4ea3-47bd-8fe2-ec3a53abd9e2', '9e898a3b-4719-4fcb-949b-8cdb24fe6af3', 'Cancelada', '2026-01-16 11:20:31.067423', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('f19a8fac-003a-4f8a-ae11-f1d041a42242', '124615c1-b567-4542-b94e-0fdbf997f56e', 'Perdida', '2026-01-18 16:29:06.079999', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('6235081f-9a77-40b8-b677-4b16e8f49078', 'db1abb37-d0af-45be-ae8c-1f31a3c10cc5', 'Perdida', '2026-01-19 12:51:33.392423', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f7d476f4-874d-4d9b-8f80-c3b0cbd72c5f', 'a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Perdida', '2026-01-19 12:53:15.372789', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('288f782b-775e-4670-85d7-0eb1c6393e07', 'a07c79e3-bde1-48e5-a3bc-ce7745fed9ad', 'Ganada', '2026-01-19 12:53:17.120914', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('0262b14d-a117-4d77-a0d4-e19b77ff27b7', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Negociación', '2026-01-19 12:53:58.025234', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ff394ec4-4cc7-471f-a8b2-4b542378babb', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'Propuesta', '2026-01-19 13:50:00.663207', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ac0255e0-8740-4ade-953f-81a8766ec01d', '18bfd5ba-36d8-43c4-884b-a47abe73f592', 'Standby', '2026-01-22 15:46:16.197839', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2fedc030-9d6e-45c2-addf-de6eedafa5db', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Propuesta', '2026-01-22 16:27:46.898956', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b127afa5-15da-45f5-8497-9991fe9ba0ee', '2e8c99c5-84a8-45f8-a5cd-6828c1ff0369', 'Cancelada', '2026-01-23 12:47:22.742166', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('02facfd8-d641-4168-b1e1-c77533024fe9', '9dbb6491-6ae3-445a-9625-c795b1093945', 'Cancelada', '2026-01-23 12:47:51.658046', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('be46671c-b031-4e9a-b23e-1e4c21279d43', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Estimación', '2026-01-23 12:50:52.88216', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('45b0d0e4-b2ce-4f0b-8b69-d507c842b997', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Descubrimiento', '2026-01-26 17:10:28.301865', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ad46ba7c-96f4-4ad8-bf88-90ee7194faae', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'Standby', '2026-01-27 15:39:52.11406', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('f4a08c74-ef0a-42fb-b5f9-79dde985734b', '1d1a2269-b87f-4970-90ec-0b5835df4922', 'Nuevo', '2026-01-28 14:03:40.500604', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('db57f875-08a5-4128-b78a-851573f1c93b', '8bd2fcf4-dd9e-4870-aa84-8551c81b6446', 'Perdida', '2026-01-28 15:34:50.240875', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('60409b42-39a9-40f1-86cb-a192fbeb906c', '8be61c96-e44f-4058-b101-c2bff29b082a', 'Estimación', '2026-01-28 15:36:36.191865', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('74ced744-2485-4efc-8715-ecc77e873153', '42973736-7468-45bb-ba8d-eeade5724027', 'Propuesta', '2026-01-28 16:55:45.029865', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('46ab5396-0d47-40f3-8e38-cd9cde992a52', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Propuesta', '2026-01-28 16:55:47.471176', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('3757fbf1-d068-4f35-ac73-3ee96c38beb3', 'eed44d07-ebd0-487d-bc5d-976f0828725c', 'Propuesta', '2026-01-28 16:55:50.569209', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('9adccc3e-5cbc-4c33-b42f-9b6b3510d832', '180630eb-1e00-4284-9052-9f2ec4bfee37', 'Estimación', '2026-01-30 12:08:49.126963', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('5cecd877-1d64-41d1-a58b-02c6367caf0f', '180630eb-1e00-4284-9052-9f2ec4bfee37', 'Descubrimiento', '2026-01-30 12:08:54.375193', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('5e3aede5-3164-47bc-b862-37000437c2a8', '682fe67a-9e76-4044-b7ea-4621292fce64', 'Descubrimiento', '2026-01-30 12:10:46.900852', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e12d1c08-dd27-4bc3-8b00-d1872d9b004f', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Propuesta', '2026-01-30 12:18:09.32546', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('0a74f6c7-3dd1-42eb-ba97-119475b36017', '4fda362b-2210-413f-a7b9-34caaace34ec', 'Perdida', '2026-02-04 09:13:52.216106', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a15ef13c-d50b-4d10-855c-f3884f6c5a1a', '682fe67a-9e76-4044-b7ea-4621292fce64', 'Propuesta', '2026-02-04 12:23:13.387926', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('45bf3ed5-d0f9-4c2d-b91f-45c9e1627de3', '180630eb-1e00-4284-9052-9f2ec4bfee37', 'Estimación', '2026-02-04 12:23:19.653501', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('eab5dcdc-dcc2-4e6c-b44e-20882d5c8c17', '1d1a2269-b87f-4970-90ec-0b5835df4922', 'Descubrimiento', '2026-02-04 13:22:42.026375', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('c2089f4d-c1e4-4138-bb84-a6866b172b0d', '8be61c96-e44f-4058-b101-c2bff29b082a', 'Negociación', '2026-02-04 22:51:40.376398', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('bbff0153-b6fc-4edc-814d-671f92439391', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c', 'Negociación', '2026-02-05 08:56:10.402339', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('b022ab8d-9606-4324-839e-67c963a9b9b3', '682fe67a-9e76-4044-b7ea-4621292fce64', 'Standby', '2026-02-05 10:10:40.062645', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('36d3bdef-f945-4b6b-87cc-9bfad957f604', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', 'Descubrimiento', '2026-02-06 12:53:17.042035', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('217a02c2-f4a8-4c35-8d99-d4fa835a1b1a', '8be61c96-e44f-4058-b101-c2bff29b082a', 'Ganada', '2026-02-09 12:59:06.602541', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d3cdbc9f-d044-46d2-960f-80707d96cee1', '8bf4c50f-7d06-4009-99f8-ec82a7327058', 'Ganada', '2026-02-09 12:59:45.292351', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('1dcd9eb6-0dbb-4d0c-9607-710ff1a96cc9', '75aec45f-2ab9-45ca-ae08-dc1126be9c78', 'Cancelada', '2026-02-09 13:13:41.455844', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('bb5a7757-faf2-4b3b-8170-793b1b69608d', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a', 'Cancelada', '2026-02-09 13:13:53.306625', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('687cc037-0b4e-4b26-b966-a48d55d9c863', 'd743540b-7a72-41e1-94d2-7292fa2731af', 'Standby', '2026-02-09 13:14:01.067316', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('aa6b951a-af01-4390-abd7-18327eed8533', '9642b008-e953-4fb1-8754-76e10e849bc7', 'Cancelada', '2026-02-09 13:14:07.756701', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7108bfda-b49b-46ec-afe3-19701e3eff04', '371187c3-abe8-461f-9ba0-8d5679a11a97', 'Ganada', '2026-02-09 13:14:40.584784', '568d5e34-cfb0-4545-9c7f-2dbac618343e'),
  ('fa0c15f5-1059-46ef-aacf-181c3df9f243', '143a4a62-0f84-4fbf-868a-92aae524c187', 'Nuevo', '2026-02-10 10:55:28.299072', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('76baa91f-7945-4472-bf14-9969742cc97c', 'abc1e95e-c730-4faa-906f-7ac420539c75', 'Nuevo', '2026-02-10 10:56:00.220003', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('c6061f5d-9ba3-4108-a4b0-b73df6431477', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Nuevo', '2026-02-10 13:11:56.156713', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('3651e13c-c19d-415e-b38d-1610d544edab', '5d0f2791-edec-42d7-8a96-139f79d9d491', 'Nuevo', '2026-02-17 13:03:22.606406', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('7e27d31a-6ead-4811-a275-41ec65e2bd06', '5d0f2791-edec-42d7-8a96-139f79d9d491', 'Descubrimiento', '2026-02-17 13:03:33.670842', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5347c58d-02ff-4edc-9522-a7ac7dcec628', '5d0f2791-edec-42d7-8a96-139f79d9d491', 'Nuevo', '2026-02-17 13:03:36.296116', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('570cd115-43ab-45cd-bc2d-e8df8faf68fe', '7f89279a-8810-49b6-9b6f-fd458d0ca0e8', 'Nuevo', '2026-02-17 17:33:36.851054', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('4e82187c-5656-4f63-9428-204b21693246', '127e6496-d274-4233-a6b9-e2fa937e0271', 'Standby', '2026-02-18 13:25:20.050916', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('fd8d469e-20cd-4630-948d-987c3acc7edc', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Descubrimiento', '2026-02-18 13:25:33.045034', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('b0abae40-b5a3-4275-bfbe-5537133b6c88', '143a4a62-0f84-4fbf-868a-92aae524c187', 'Descubrimiento', '2026-02-18 13:25:46.756849', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('9e38a4a0-498d-4b08-a51d-3d558b51caa1', '06842f0c-1d02-4d6a-ad5d-a1fe2c83602e', 'Propuesta', '2026-02-18 13:31:11.969494', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f870846e-3a74-4c1a-8b15-5a27839a81de', 'b59790bd-5fbe-42b6-bc4a-5b44d781db5f', 'Descubrimiento', '2026-02-18 13:32:56.244201', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('7c02b755-4186-4ea3-b5b4-5b9a0b260ad6', '78400467-6417-4131-aa63-33c7395bdcab', 'Descubrimiento', '2026-02-18 16:53:54.209342', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('0ac76015-db23-443d-b648-ac5fb239ea46', '72e67258-5d97-4199-ad06-37d04e1c6f48', 'Estimación', '2026-02-19 12:49:37.616535', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('1d56a89d-7fc0-4ec6-b1cf-e26454ab99b7', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Nuevo', '2026-02-19 12:57:13.68763', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5ff41bd6-59b0-43bc-a6d4-e9cb2e0bf77f', '6cbff638-f0c8-4e35-ab34-c1d7d1ab03a0', 'Nuevo', '2026-02-19 13:09:02.589555', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('10a251d7-9102-4520-84eb-c47fb8ae3022', '6c147c42-47f4-45f2-ae85-031848a65906', 'Nuevo', '2026-02-23 11:42:27.043827', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('8e45b205-b3ae-4731-b409-b830e9395fd2', '33f729c3-5348-4667-b637-9c5873828fd5', 'Nuevo', '2026-02-23 17:22:45.250796', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('bbf153c9-0f78-4ec9-b6a7-675745e813f9', '1110a27e-cc24-4ec3-aa3d-8d5e0f8c9082', 'Estimación', '2026-02-24 09:33:10.642995', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('3af62e7a-c711-47ad-8e56-75e4c1a1edfb', '749e69ad-a491-4b67-83a0-e3b0b3310aac', 'Estimación', '2026-02-24 09:34:44.512658', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('65542195-2245-448d-96b4-d2805fb5ad8a', '72e67258-5d97-4199-ad06-37d04e1c6f48', 'Standby', '2026-02-24 14:34:57.465488', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('e849e086-e942-47ae-84db-3a2178d106b3', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Descubrimiento', '2026-02-24 14:48:14.479173', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('f13b8546-7778-43f8-be2d-1c60a35026b9', '87a44983-6df6-423e-8a45-9d86fadda21a', 'Nuevo', '2026-02-25 11:12:38.085123', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('44880f71-3d9c-480d-a123-ac40bf670621', 'b59790bd-5fbe-42b6-bc4a-5b44d781db5f', 'Estimación', '2026-02-25 11:13:08.428786', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('f60b125b-b2bd-43e3-b565-f05f2d0efc29', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Estimación', '2026-02-25 11:13:14.646083', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2ead975b-b163-444a-91e8-117671b04c6a', '78400467-6417-4131-aa63-33c7395bdcab', 'Estimación', '2026-02-25 11:13:18.183334', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('07aac991-c9cc-49b0-97ad-e7a1d5924c25', '31ee6490-1a15-4209-a95c-5430f752a8d2', 'Estimación', '2026-02-26 10:28:38.577356', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('7e25f31d-4a5b-4bbb-80c0-a4b236602e6a', '180630eb-1e00-4284-9052-9f2ec4bfee37', 'Propuesta', '2026-02-26 10:29:04.636573', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('1accd91a-78d9-4277-a821-5352937c0c7e', '726b65a0-394a-48c5-a8fe-cf6e3981f94d', 'Estimación', '2026-02-26 10:30:01.66395', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('68c37b74-d451-4f1b-8ab2-209b90c11410', '749e69ad-a491-4b67-83a0-e3b0b3310aac', 'Perdida', '2026-02-26 10:32:09.585466', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('17ecafaf-d646-4188-8da5-467be8fc725e', '1110a27e-cc24-4ec3-aa3d-8d5e0f8c9082', 'Propuesta', '2026-02-26 10:34:02.231392', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ddfae77d-b103-462d-a0e9-a0a7b095e2f2', '33f729c3-5348-4667-b637-9c5873828fd5', 'Descubrimiento', '2026-02-26 16:35:23.422112', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('7417314f-ebc7-41b8-9d85-6732ded7202c', '33f729c3-5348-4667-b637-9c5873828fd5', 'Estimación', '2026-02-26 16:35:26.736368', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('be1fc00b-79ac-49c5-895a-cfcbf4175b1b', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'Nuevo', '2026-02-26 16:36:19.672161', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('20eb9948-c662-40fc-9c6c-4201af870345', '6c147c42-47f4-45f2-ae85-031848a65906', 'Descubrimiento', '2026-02-26 16:36:50.07519', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('76f98b0b-9c31-49ef-ab5b-299b61cedcc2', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', 'Nuevo', '2026-02-27 09:19:57.79287', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('5d955af2-7856-46d8-899f-1896a0ffeced', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Estimación', '2026-02-27 09:29:31.427922', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ba51a195-835d-4eba-85d3-23c12e529bc4', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Descubrimiento', '2026-03-03 12:56:13.873042', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('80de4b5d-50ef-4ffc-b5ec-4c20d6fae2e2', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'Descubrimiento', '2026-03-05 09:07:55.489963', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('782dab6b-fdf8-433e-85fa-132ece153997', '17befe8b-91c3-4fe2-b288-d18f060ffbd6', 'Nuevo', '2026-03-05 16:06:17.924935', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('29300993-ef5b-4808-ac53-74ae8d4c47d5', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d', 'Estimación', '2026-03-05 18:01:41.17132', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('1b7cd841-bb49-490b-8233-410b63ee90c7', '66db9769-a26c-4b54-a08d-c287291c0d0a', 'Negociación', '2026-03-06 09:58:42.242913', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('be49bcc9-940f-47f7-b58e-dc0eea3ef8ee', 'd22a0562-5df1-4503-be76-d4753d640ec1', 'Negociación', '2026-03-06 09:59:17.749241', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('621c0291-62b5-44e0-bde7-0c7ccf7616e1', '1110a27e-cc24-4ec3-aa3d-8d5e0f8c9082', 'Cancelada', '2026-03-06 10:03:40.924025', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('9d614e55-13e0-48fc-87d6-a183899a0a49', 'e92094c6-e5f2-49a2-9d45-77397e52d8d6', 'Negociación', '2026-03-06 10:05:44.259371', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('6e845bdc-014b-4c13-b0ca-deaf9b3a88f9', '726b65a0-394a-48c5-a8fe-cf6e3981f94d', 'Propuesta', '2026-03-06 12:05:06.675563', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('cf0893bb-af68-49ae-a14f-17e1f419b289', '31ee6490-1a15-4209-a95c-5430f752a8d2', 'Cancelada', '2026-03-06 12:05:36.151911', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ed37a686-c66a-4e89-ab9c-7cb7f0d04e11', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Estimación', '2026-03-12 11:31:25.2621', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('40c727f6-2b6c-4229-9f98-48701f27eb14', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Propuesta', '2026-03-12 11:58:55.215298', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ee770b5e-3855-4dde-ac01-43b395a3b27d', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Descubrimiento', '2026-03-13 11:22:52.416567', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('77a9940a-9741-42c1-a0f2-60f95ba0c5af', '6a2c47ad-c9c9-4dc9-82b4-113a78234993', 'Nuevo', '2026-03-13 11:31:24.340952', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('f8cf808a-3c03-401e-8861-a1cdb123ea63', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Propuesta', '2026-03-13 11:31:41.721359', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('6aa3779e-d4e3-4db2-a39e-037f8adf16be', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Estimación', '2026-03-13 16:54:34.108861', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('fca4ed32-4559-4806-b537-b30d13130ca3', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Propuesta', '2026-03-18 09:29:27.495893', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('a262afa0-2243-4637-af82-b2ea3d0bc0ed', 'f53d7bf7-eaff-4766-ad58-46b3cecb93ad', 'Propuesta', '2026-03-18 12:16:23.689721', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('3801f47a-07ee-43fd-9942-cf424047244c', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Estimación', '2026-03-18 15:42:29.542446', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('12a2c7d4-753e-4948-bd81-11a1b634fa05', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Propuesta', '2026-03-19 09:29:13.015318', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('568bbc3c-af14-4cc9-a527-8b6b13931eb7', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Propuesta', '2026-03-19 17:06:45.903273', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('944c23c7-6f76-4729-bce5-439351001e8a', 'c84c690f-0685-4d8b-b32f-4cdde3c95674', 'Descubrimiento', '2026-03-20 09:29:11.990534', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('01f69447-1eb5-4d95-8c65-a34cb75a5574', 'd22a0562-5df1-4503-be76-d4753d640ec1', 'Ganada', '2026-03-20 11:10:03.998911', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('f341c4ec-79b1-4f78-b4a9-dd26390d7e50', 'd22a0562-5df1-4503-be76-d4753d640ec1', 'Negociación', '2026-03-20 11:10:07.584448', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ee4910c4-8980-4c81-867e-276cb3f3ad76', '66db9769-a26c-4b54-a08d-c287291c0d0a', 'Ganada', '2026-03-26 17:55:39.742635', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('9eda6e6c-7c60-499b-9f91-3d7e4b4d85be', '59f8ded8-b29a-48eb-a00a-173b4fcc00d8', 'Descubrimiento', '2026-03-27 17:48:46.455624', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2a1d6184-82df-497d-909f-4ff35d50d4f5', 'a167b4fe-927e-48ea-810f-81a6d21b2bde', 'Negociación', '2026-03-30 15:48:05.317106', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1e39548b-7c96-4cc0-a78c-7479185ca275', '87868565-0b10-472f-afa1-994cac8f3d6b', 'Negociación', '2026-03-30 15:48:10.787056', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('aa7786f2-5c64-4f35-aaa4-b7f9db2eadfa', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', 'Descubrimiento', '2026-03-30 15:48:41.956524', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('572a2708-dcaf-4a9c-93e6-7b199bc0e29f', '5ff3e69c-800b-48ae-a324-d53d3cfd59ee', 'Nuevo', '2026-03-30 15:50:11.012071', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('45e28139-e41f-4bbf-9c29-f0f2fcabbef9', '1d1a2269-b87f-4970-90ec-0b5835df4922', 'Nuevo', '2026-03-30 15:50:17.820721', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('cb6afb88-2559-40d4-90c1-762b2de30e30', '72e67258-5d97-4199-ad06-37d04e1c6f48', 'Perdida', '2026-03-30 16:03:53.02324', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5ee391a4-1a45-47fd-927d-ba82d83a5832', '06842f0c-1d02-4d6a-ad5d-a1fe2c83602e', 'Cancelada', '2026-03-30 16:14:36.053642', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('a1ea1d64-0ffa-46eb-bc46-45f9b3e86114', 'f53d7bf7-eaff-4766-ad58-46b3cecb93ad', 'Perdida', '2026-03-30 16:14:42.768911', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('0ba2845e-abef-408d-b733-839c4f73a2f6', '603e4f29-6123-47f7-9565-6dd9c42e4b43', 'Cancelada', '2026-03-30 16:59:22.541421', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('0d2d7320-7dd0-424b-bade-37ff9694cee0', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a', 'Cancelada', '2026-03-30 17:15:08.095387', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('be9f208c-94d6-48bf-b490-bd3abea6bcd3', '72e67258-5d97-4199-ad06-37d04e1c6f48', 'Cancelada', '2026-03-30 23:46:24.794105', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('23e62356-6a93-4dc4-8152-1b8244147dd9', 'bc12f5de-63a0-456d-8761-73e0889f78bc', 'Descubrimiento', '2026-03-30 23:48:31.651845', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('ac44c481-e084-4fbb-8757-2ee1621c221b', 'c44f21d1-d4e8-4133-b703-c0b52261b802', 'Nuevo', '2026-03-30 23:50:33.655658', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5532cae6-63c8-48d2-83af-bc57dff4ae86', 'c44f21d1-d4e8-4133-b703-c0b52261b802', 'Descubrimiento', '2026-03-30 23:50:39.483788', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('a2659dab-2694-4bf7-8bd8-62b75ea8fcb1', 'bc12f5de-63a0-456d-8761-73e0889f78bc', 'Nuevo', '2026-03-30 23:50:55.017009', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('0b2b9181-728e-4299-a3db-8e232a8c3977', 'c44f21d1-d4e8-4133-b703-c0b52261b802', 'Nuevo', '2026-03-30 23:51:02.67269', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('47efb4f8-21d0-4ced-b7bd-2d8593566dfd', 'bc12f5de-63a0-456d-8761-73e0889f78bc', 'Descubrimiento', '2026-03-30 23:51:04.35347', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('85d6d64f-0561-4008-9e1e-0b0bdd3c31be', '73176e11-565b-48c7-b330-ef0001ce3401', 'Nuevo', '2026-03-30 23:54:48.369827', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('21ed0bd9-5656-4a8d-8409-1af049bafdde', '73176e11-565b-48c7-b330-ef0001ce3401', 'Cancelada', '2026-03-31 16:49:30.342101', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5d15df5c-3147-4bf0-be88-a9ba3a17b1d0', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Estimación', '2026-03-31 23:18:05.232357', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('722b5d7a-c788-4fe5-90ab-66ee9b4aab3a', '6a2c47ad-c9c9-4dc9-82b4-113a78234993', 'Cancelada', '2026-03-31 23:18:44.926161', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('cffcbd8a-95ec-4af4-9622-d02bcdd4f7cf', '6c147c42-47f4-45f2-ae85-031848a65906', 'Cancelada', '2026-04-01 16:11:33.515754', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('11f2c153-b554-4207-9962-6c6dca106d43', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Negociación', '2026-04-02 15:04:42.965119', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('7f3ce27b-4d0c-43a9-8322-a3e6e6d03083', '17befe8b-91c3-4fe2-b288-d18f060ffbd6', 'Cancelada', '2026-04-06 14:44:12.110822', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('55d2ce1d-8cdd-4dc7-943c-2becdbd2c703', 'bc12f5de-63a0-456d-8761-73e0889f78bc', 'Standby', '2026-04-06 14:44:50.142033', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('c118c26f-1b66-42ca-ab10-818be2bf7f21', 'd22a0562-5df1-4503-be76-d4753d640ec1', 'Ganada', '2026-04-08 14:43:32.225705', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('0c46044a-3b12-4627-ab1a-0c1938ae159a', 'a689919a-b00e-4178-8c45-3fb40747c045', 'Perdida', '2026-04-08 15:54:02.857716', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('6752ba0a-9196-4816-b1d3-4303a6313342', 'fdddce16-eacf-4879-afaf-2474526c5665', 'Perdida', '2026-04-08 15:54:11.011024', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('386eb2fa-82b4-4152-8ca7-a58f9b736e26', '8be61c96-e44f-4058-b101-c2bff29b082a', 'Perdida', '2026-04-08 15:55:30.650943', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d7e978d6-0f82-499b-b496-3b2d72bf9b14', '6c147c42-47f4-45f2-ae85-031848a65906', 'Descubrimiento', '2026-04-09 20:44:15.660738', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('53bbc2ae-3c3a-49cf-970e-4a8df9e82b17', '726b65a0-394a-48c5-a8fe-cf6e3981f94d', 'Cancelada', '2026-04-13 15:33:35.22286', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('edf9a05f-47ca-4e8f-ab13-dd831c1d46b7', 'd03fc94c-6758-4b4b-9ada-c5ee64a62aff', 'Estimación', '2026-04-14 14:20:03.673003', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d4504615-3769-4ff9-9173-422ac1b567d7', '7f8bc091-21a6-41bb-80e5-56129f716e02', 'Ganada', '2026-04-14 14:23:34.003263', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d74e9263-315c-426c-9954-791e2bffd375', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', 'Estimación', '2026-04-16 15:14:03.92949', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f6cfb9b1-e7b4-4957-a8f0-8ef8929bff38', 'a2841e6e-3ae7-48ea-8b55-556737d98208', 'Descubrimiento', '2026-04-22 17:33:59.617824', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('2ac44b80-b3b8-48d3-9c02-dc9e8c2a2af0', 'aa1db809-2330-46d2-894a-08539ad3d41d', 'Nuevo', '2026-04-22 17:37:29.842523', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('c740891f-a897-4cba-999e-b2d3d3b6069c', '1d1a2269-b87f-4970-90ec-0b5835df4922', 'Cancelada', '2026-04-27 19:50:38.791992', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('55285d5f-02e7-455a-96fd-6179a8264210', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Negociación', '2026-04-29 18:54:27.448244', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('cdf1e5f3-1082-448f-9ed2-e017a85d2d90', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Negociación', '2026-04-29 18:54:35.897389', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('a96d3abd-7c48-419c-ada1-af517fa86bf5', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'Nuevo', '2026-04-30 17:27:49.558448', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('d9990f52-e1a9-4534-8b0f-29829b26217e', '4f01d5aa-507b-4a0c-bbab-764385faebdc', 'Nuevo', '2026-04-30 17:30:38.115694', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('89841e40-f9d6-4edf-a392-1046f9746a7c', 'c75a06a1-eaae-4cc0-99b4-db056b60d1a8', 'Descubrimiento', '2026-04-30 17:30:49.462085', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('b53132fb-4ff1-44b6-a1d9-54dce0cff9f2', 'c44f21d1-d4e8-4133-b703-c0b52261b802', 'Descubrimiento', '2026-04-30 17:30:51.738283', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('2fe2f5f9-6124-4386-85c6-105bb2985b36', 'e92094c6-e5f2-49a2-9d45-77397e52d8d6', 'Ganada', '2026-04-30 17:34:03.469393', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('95434d1a-9735-4cc7-a153-7910dbcbc2ab', '71b5225e-13a7-417c-80e5-df70d31e03e7', 'Nuevo', '2026-04-30 17:34:35.279403', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('4b568d8b-4a04-45ed-aaa5-f1bc8159918e', '7d40aafb-798b-48df-8355-3bd809eb29cb', 'Estimación', '2026-04-30 17:35:51.267898', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('8e1fe8c3-2827-459a-9477-45a183f833b8', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'Descubrimiento', '2026-04-30 20:46:36.21532', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5a4b201e-6c4d-420d-af5d-c148e0c47f21', '7408172b-bbf8-451c-ad9e-935e6eaa8263', 'Cancelada', '2026-04-30 23:11:28.156272', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('cf0b6988-21d7-4044-b6f2-d0d5a904191c', '48b654c6-d75f-4b4c-b4bf-a7fc873bba90', 'Cancelada', '2026-04-30 23:11:44.895604', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('452358db-e9d9-44f1-9a46-5d2f57a5d98a', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Cancelada', '2026-04-30 23:23:12.335182', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('a436bd88-5030-4cb9-a1ef-78aadb83d6f9', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Perdida', '2026-05-04 16:20:53.917123', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('b7e1c78b-402f-4445-b20c-9359cc40ca31', 'aaa27a18-3056-4af5-81c6-e90cf73e7af1', 'Cancelada', '2026-05-04 16:20:56.610179', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('4c118f9a-825e-4727-9ee0-e55dbbb12947', '473a347a-6a8f-47af-a5b1-1ac98de3da0c', 'Nuevo', '2026-05-06 21:16:36.378454', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1a9c409e-495a-4b5d-b4d0-208301efa7f6', '20b388fe-19df-4c51-b66d-acb23f4af59b', 'Nuevo', '2026-05-06 21:17:14.017954', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ef70f256-b963-4fca-9f75-248d6e575e22', '20b388fe-19df-4c51-b66d-acb23f4af59b', 'Descubrimiento', '2026-05-11 15:37:32.427476', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('69c15455-4e13-4693-94b7-d33abe6d4e22', '473a347a-6a8f-47af-a5b1-1ac98de3da0c', 'Descubrimiento', '2026-05-11 15:37:34.434092', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9e02e289-52d7-405f-89c9-dc7a0783c0eb', '18bfd5ba-36d8-43c4-884b-a47abe73f592', 'Cancelada', '2026-05-11 15:37:58.49942', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9737bd80-9c62-4fac-a996-dd173fac864a', '4f01d5aa-507b-4a0c-bbab-764385faebdc', 'Standby', '2026-05-11 17:14:51.282744', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('519d37a8-35e4-47f6-94bb-6e4c668bec5a', '439c6fdd-5034-48c9-83c0-9fc2a6a650b6', 'Cancelada', '2026-05-15 18:09:41.273884', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('a885f0a8-ae2b-463b-9321-77b3a3b772ae', '20b388fe-19df-4c51-b66d-acb23f4af59b', 'Estimación', '2026-05-21 17:12:56.700837', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('bd280a59-c531-4a34-a836-7fd53345d908', '143a4a62-0f84-4fbf-868a-92aae524c187', 'Nuevo', '2026-05-22 17:29:06.287307', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('071b5bac-c6cb-4012-9547-1d8dd77a6fb7', '6c147c42-47f4-45f2-ae85-031848a65906', 'Cancelada', '2026-05-22 17:57:50.388543', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('ae2d4fb1-ae8a-411f-8aba-e2088efdcf1b', '7f89279a-8810-49b6-9b6f-fd458d0ca0e8', 'Cancelada', '2026-05-22 17:58:00.41812', 'cd5e17a2-854d-452b-b2f0-2877d2907dda'),
  ('31a7df10-8220-45d6-bf3c-7f5eb62ba272', '53bd52ac-e889-4f97-901d-dcac8c6eb3f3', 'Standby', '2026-05-22 17:58:32.706482', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('3c6c3963-0fc1-4b16-b610-27f708de6d0a', 'fb7e03d4-640c-4549-87d6-d35a6b36c741', 'Negociación', '2026-05-22 18:00:47.935961', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('4c00d99b-c8f5-4e8b-a1e9-cba1cfd05640', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'Estimación', '2026-05-22 18:20:48.919145', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('1251487f-942d-43cb-8a9e-d2f2c3a5f8ed', 'bf9df4ed-b0bf-49e8-971f-f62cbc1b78cd', 'Nuevo', '2026-05-22 18:25:09.30258', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('70bb0841-4d09-40d4-b7ed-bdeb7ab65724', 'c2cea0f5-850e-487b-b9b8-c59225c6b6ee', 'Nuevo', '2026-05-22 19:36:20.18011', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('17ad3dd2-444a-45b0-b436-d591946018a3', 'c84c690f-0685-4d8b-b32f-4cdde3c95674', 'Estimación', '2026-05-22 21:18:12.800855', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a13f529c-a376-40d7-8221-36d11422e545', '180630eb-1e00-4284-9052-9f2ec4bfee37', 'Cancelada', '2026-05-22 21:18:39.330154', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e4ec0be4-1fa5-4e27-b932-97391e46cb1f', '023ff1d6-3f06-44c2-b75d-00175bf8f9ad', 'Nuevo', '2026-05-22 21:20:27.762289', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('34df1d67-452a-412e-8583-3cc411f6cc3f', '023ff1d6-3f06-44c2-b75d-00175bf8f9ad', 'Propuesta', '2026-05-22 21:20:35.248862', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('2cc4150d-9a54-4d45-9ed9-d50fb6a1a066', 'c84c690f-0685-4d8b-b32f-4cdde3c95674', 'Propuesta', '2026-05-22 21:20:52.352495', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('3965c361-ef1f-428a-855b-c6e1044f33a5', 'd03fc94c-6758-4b4b-9ada-c5ee64a62aff', 'Propuesta', '2026-05-22 21:20:56.403152', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a891e9d2-0b4a-4266-9a6c-79066556fa45', '7d40aafb-798b-48df-8355-3bd809eb29cb', 'Cancelada', '2026-05-22 21:26:06.342647', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('73fab635-91d3-4d5c-a153-914d1c44f8d2', '473a347a-6a8f-47af-a5b1-1ac98de3da0c', 'Standby', '2026-05-25 17:09:49.505974', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('1a654445-25d1-4b54-8228-f30a4ed810d5', '5dfeacfd-ba05-4b6c-a183-6d112689e27c', 'Nuevo', '2026-05-25 18:41:56.010106', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('75e3909e-5807-45e3-ac12-af88408fa2a6', '61f77ac3-1676-4f9e-80ea-e586019a158d', 'Nuevo', '2026-05-25 18:42:26.786628', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('a5c7c0b8-9b15-4910-8004-484694422b3a', '986576f4-f3af-4ec2-b9ff-6dd376cf6575', 'Estimación', '2026-05-29 17:14:30.345732', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e7853ca3-067e-41db-88a2-5f26b880349b', '5d8ef242-18c0-4431-af95-4c4a86132de4', 'Estimación', '2026-05-29 17:15:19.90353', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d1f9569f-07f5-41d3-8bb5-f7bd291bc697', 'c2fc3d81-4cf8-4bd2-8779-7b96a04653b1', 'Negociación', '2026-05-29 18:23:34.737502', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('17d1b446-399d-450e-bedc-6149e6f66eeb', '5d8ef242-18c0-4431-af95-4c4a86132de4', 'Descubrimiento', '2026-05-29 18:52:02.196594', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('a0dafb43-3360-416d-a9ac-91275d9a27a1', '20b388fe-19df-4c51-b66d-acb23f4af59b', 'Propuesta', '2026-06-01 15:58:41.575656', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('818a12df-db49-4756-839c-3cd4a2c1d7b0', 'b897154a-7f9b-4ab1-9b38-3e866e87d9eb', 'Nuevo', '2026-06-01 16:41:19.95353', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6540f807-93c5-42e9-8a5b-50bd0c5311b1', 'c2cea0f5-850e-487b-b9b8-c59225c6b6ee', 'Descubrimiento', '2026-06-01 16:47:43.454481', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ae6139dc-9515-459a-be41-b61251c92330', '7b1d7bc6-276e-4ef2-95e7-5a3f2734b525', 'Nuevo', '2026-06-01 19:45:33.273716', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('7112e938-604a-4424-82cd-2ee785ee1534', '3df8a49b-a3b3-4ad8-b90a-be1ade00dc4c', 'Descubrimiento', '2026-06-01 22:01:58.30963', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('7f65e042-d604-40e6-b204-0704bb568d8d', '7b1d7bc6-276e-4ef2-95e7-5a3f2734b525', 'Descubrimiento', '2026-06-02 17:05:36.905855', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('b3e60ee1-cac4-48c4-ba2a-a81d12bb8b96', '6834a74d-af5b-4983-91b9-cad2459075d6', 'Nuevo', '2026-06-02 22:47:47.339206', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('2c8406a2-ad39-4016-a0d8-27edf1aff4b4', '91fd1fdc-8940-4588-b1eb-eb38c945133b', 'Nuevo', '2026-06-02 22:48:09.526118', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('e2db864c-56de-4b8a-aec4-a57c0d1a1587', 'b897154a-7f9b-4ab1-9b38-3e866e87d9eb', 'Descubrimiento', '2026-06-02 22:48:24.860114', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('f5ec0909-2e81-4f7f-b03d-507f67230824', '4ef596d2-6d94-41c3-9e62-d265be23013e', 'Propuesta', '2026-06-03 15:55:01.681848', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('6c4102e6-1872-45e2-a151-6dda2c8f4533', 'eed44d07-ebd0-487d-bc5d-976f0828725c', 'Cancelada', '2026-06-03 15:55:39.104397', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('26ecdaa0-7b19-479a-8f69-bca44bfbc14e', '50aa0ca1-4d26-4e5a-b47b-cb03fa9f49b7', 'Standby', '2026-06-03 15:56:03.014792', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d4b59365-9139-4279-8313-a6f52c7c8c8f', '59f8ded8-b29a-48eb-a00a-173b4fcc00d8', 'Perdida', '2026-06-03 15:56:26.462213', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('29c4659d-9c9c-46ea-9efe-62d60ffdd133', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Propuesta', '2026-06-03 15:56:38.383239', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('ea21cca6-aeaf-444d-81b6-61c1277c588c', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Negociación', '2026-06-03 15:56:41.875612', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('091f95bb-6f37-42e8-9f7e-65cee8bf9c6d', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Estimación', '2026-06-03 15:56:44.136582', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('aee60e61-a32a-4a38-8d4a-edc66e3ef02c', '87a44983-6df6-423e-8a45-9d86fadda21a', 'Cancelada', '2026-06-03 15:57:07.094303', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('6b1a489c-5d8a-4ba4-b71d-79b7f7d3444d', '24835020-0cc0-48f5-8f34-890d80369c92', 'Propuesta', '2026-06-03 16:28:39.645796', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('d250d062-b6b6-43b4-8ea1-497eb15374fa', '42973736-7468-45bb-ba8d-eeade5724027', 'Cancelada', '2026-06-03 17:39:15.257502', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('11672707-4479-4d8c-b47c-3137fc90d0ef', '48eaa8fa-06d0-4f21-b5aa-ddbddf962b95', 'Estimación', '2026-06-03 17:39:52.960145', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('57672858-18e5-4655-b6a0-e8138a1d8032', '48eaa8fa-06d0-4f21-b5aa-ddbddf962b95', 'Descubrimiento', '2026-06-03 17:40:06.500361', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('40c84fad-049b-4abb-83e3-b444fcca3c2a', '023ff1d6-3f06-44c2-b75d-00175bf8f9ad', 'Perdida', '2026-06-03 17:54:11.299951', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('86e84d82-dd07-45cf-a981-05b8e13a10d1', 'bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'Nuevo', '2026-06-04 19:27:52.192905', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('f14d2b61-1556-4226-a852-523208444779', '48eaa8fa-06d0-4f21-b5aa-ddbddf962b95', 'Negociación', '2026-06-04 23:45:37.418862', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('db59d30e-019b-459d-84c3-25f8f93b0cb1', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Nuevo', '2026-06-05 18:39:27.984813', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('6f4e2c82-5ea4-4efc-92ad-5263d95ea4d9', 'ca9d57bb-4683-4676-9317-136fae22ea72', 'Nuevo', '2026-06-05 19:00:50.749698', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('07e8de10-5cc4-4054-ba8d-ed0dcdb2e3ca', '61f77ac3-1676-4f9e-80ea-e586019a158d', 'Descubrimiento', '2026-06-08 15:25:20.529359', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('40661a34-1d7c-465c-b89e-a9a9f975ea30', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Cancelada', '2026-06-08 15:25:57.886579', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('8867c6c1-9e80-4a33-ba28-eba2f08717ec', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Standby', '2026-06-08 15:26:01.977201', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('e9debaa2-28db-4a4b-b99f-53133e8bb8f8', 'bc12f5de-63a0-456d-8761-73e0889f78bc', 'Cancelada', '2026-06-08 15:26:08.329572', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('a95936b2-9c8d-4b40-adbf-0008b87a1b97', '4f01d5aa-507b-4a0c-bbab-764385faebdc', 'Cancelada', '2026-06-08 15:26:14.590164', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('6ae57d40-b7ea-4be3-91da-ef11667b3352', 'c2fc3d81-4cf8-4bd2-8779-7b96a04653b1', 'Ganada', '2026-06-08 18:17:28.759426', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('93930979-7060-4392-ba2d-7934cd558ee2', '3df8a49b-a3b3-4ad8-b90a-be1ade00dc4c', 'Estimación', '2026-06-08 18:20:45.41553', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('22995e23-d2e9-4f5f-9208-c3e0122c7b62', 'c75a06a1-eaae-4cc0-99b4-db056b60d1a8', 'Standby', '2026-06-08 18:55:22.694796', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('df631ba9-36a2-4966-92a4-fede34f4f0d4', 'bb95720a-a1d7-4d77-b534-3537951b8875', 'Standby', '2026-06-08 18:55:35.161697', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('affb5ce1-1213-40ce-bcbb-bb171e2ec5a3', 'bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'Descubrimiento', '2026-06-08 19:20:38.63987', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('95e778da-3a59-48ad-ab5e-65e5ef7ffada', '488dafaf-78a7-474e-802d-33412ff6445f', 'Nuevo', '2026-06-08 23:25:59.730717', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('882d5044-b4d2-4663-b632-d3f51e70ef09', 'ade764c5-9cf1-460f-96d0-ac2ac578f6eb', 'Nuevo', '2026-06-08 23:28:01.211048', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('fe6e8224-46a0-4789-b9e1-aab6a81566a8', 'ca9d57bb-4683-4676-9317-136fae22ea72', 'Descubrimiento', '2026-06-12 14:54:39.588435', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('3513e028-f755-443d-b66b-eafab0abe282', '488dafaf-78a7-474e-802d-33412ff6445f', 'Descubrimiento', '2026-06-12 14:55:25.770525', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('7d8ea134-4f1f-44bc-acec-ab0b8c741800', '986576f4-f3af-4ec2-b9ff-6dd376cf6575', 'Negociación', '2026-06-12 15:05:01.386639', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('bb3fdccc-63a4-4280-8978-37e20f0b826a', '6815286d-1fd2-4c6b-a429-a5b049d79321', 'Cancelada', '2026-06-12 15:15:30.0446', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('ccb737c0-08b5-4b2d-b0ec-8911bd0b14af', 'c84c690f-0685-4d8b-b32f-4cdde3c95674', 'Cancelada', '2026-06-12 15:15:42.131346', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('6f47af53-3bd3-4af9-a1b0-e89f57dfd281', 'd03fc94c-6758-4b4b-9ada-c5ee64a62aff', 'Cancelada', '2026-06-12 15:15:51.637628', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('f87ef0aa-3ea1-4dc1-a7d5-6a8fed8404ac', '6834a74d-af5b-4983-91b9-cad2459075d6', 'Estimación', '2026-06-15 15:28:17.557261', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9fdd8512-4849-4b94-91ff-595478196246', 'c2cea0f5-850e-487b-b9b8-c59225c6b6ee', 'Propuesta', '2026-06-16 22:16:30.829558', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('9efc47ef-27da-49f9-bb02-a0164aa5ee7e', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Descubrimiento', '2026-06-17 15:54:58.204848', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('fbcda1db-25e9-41d9-8ded-4655b557cf26', '6834a74d-af5b-4983-91b9-cad2459075d6', 'Propuesta', '2026-06-19 15:11:03.08826', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('4c5def2b-7855-4fae-9f6f-7b52b38743f7', '61f77ac3-1676-4f9e-80ea-e586019a158d', 'Standby', '2026-06-19 15:11:19.594494', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('808782be-736e-4167-bc45-17c23e799695', '91fd1fdc-8940-4588-b1eb-eb38c945133b', 'Descubrimiento', '2026-06-19 17:59:01.292621', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('082cdfd7-3f15-414a-9cb2-a871eb98a7b0', '52fa0666-595c-41e9-9bbd-cad26ba2627f', 'Nuevo', '2026-06-22 19:57:33.813719', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('cabfa140-2333-4ad4-a281-61e1caea379d', 'ca9d57bb-4683-4676-9317-136fae22ea72', 'Estimación', '2026-06-24 18:46:29.019368', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('e21290de-4a9d-431b-8c2b-e108d3080420', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Estimación', '2026-06-24 18:46:38.194141', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('5576afc4-ea9f-4260-856a-aa63c0018143', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Descubrimiento', '2026-06-24 18:46:42.710451', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('650fc601-f1fa-4922-9f81-6582a21c6d65', '5f14faa6-4f00-4eef-95bd-6cc5474e8a96', 'Propuesta', '2026-06-25 15:54:25.85519', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('0f6f3324-85d7-4ccf-89aa-f6ec58bf803d', 'ed0fdec8-8fd8-405e-b34d-c094b72070a7', 'Nuevo', '2026-06-25 15:55:41.170021', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('ac02224d-8c1b-4361-8ba6-7d87ed19ad6f', 'ed0fdec8-8fd8-405e-b34d-c094b72070a7', 'Propuesta', '2026-06-25 15:55:46.993034', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('fc28fcb6-b8c2-4c90-9522-6bceb0cb9cad', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Estimación', '2026-06-25 15:56:51.297909', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('f11f38ed-3103-494b-bc9c-b3adceca9fb3', 'bf321fbd-d5d3-4f69-b74f-d92f3a71339f', 'Nuevo', '2026-06-25 15:57:03.384696', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('e9523887-e2c2-45e9-a04f-142daec16ddd', '1c324109-2420-456d-b0c6-d89defdf5d60', 'Nuevo', '2026-06-26 17:30:43.637859', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('c5843615-90ba-47ae-a794-0b8e485dd379', 'b897154a-7f9b-4ab1-9b38-3e866e87d9eb', 'Estimación', '2026-06-26 17:35:14.243344', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('4769241a-9e66-480a-85b2-1d0fbc2516c9', '6834a74d-af5b-4983-91b9-cad2459075d6', 'Perdida', '2026-06-29 21:51:41.599629', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('03ec0745-31d6-4627-a928-070aeba045f3', 'd097e2a9-f8d9-4c74-8ba9-3c4a04501a4f', 'Perdida', '2026-06-29 22:07:52.534895', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('0750cf49-efa3-4744-8ef4-594fa3a2b26d', 'fb7e03d4-640c-4549-87d6-d35a6b36c741', 'Perdida', '2026-06-30 17:39:27.157794', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('782243fe-7018-46f1-9d25-445f1e37b581', '4ef596d2-6d94-41c3-9e62-d265be23013e', 'Negociación', '2026-06-30 17:40:41.172606', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('10e6d9f7-c710-4b94-99ea-5978149ae6c3', '24835020-0cc0-48f5-8f34-890d80369c92', 'Negociación', '2026-06-30 17:40:46.577227', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('e3c5b2fc-ec54-4ebc-a043-46b488127222', 'fe3bd828-0464-40b9-8923-27af7966abeb', 'Negociación', '2026-06-30 17:41:12.273282', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('4bff6648-18bd-43bf-9b7f-2b6cbdcfbd19', '3df8a49b-a3b3-4ad8-b90a-be1ade00dc4c', 'Propuesta', '2026-07-01 15:07:12.927287', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('d61dc825-7751-4fdd-b1d0-4b1c051daf90', '1c324109-2420-456d-b0c6-d89defdf5d60', 'Descubrimiento', '2026-07-02 16:11:58.008521', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('8dcc3f04-130e-44ce-9e72-e5b7bf25a5b3', '3df8a49b-a3b3-4ad8-b90a-be1ade00dc4c', 'Negociación', '2026-07-02 16:21:27.042216', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('e2b3e852-ec91-4a04-a9c4-21bdd0e10948', '48eaa8fa-06d0-4f21-b5aa-ddbddf962b95', 'Standby', '2026-07-02 16:21:36.889943', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('7b656b1b-b6c1-4bd7-8b3f-d5af3601012b', '986576f4-f3af-4ec2-b9ff-6dd376cf6575', 'Standby', '2026-07-02 16:21:49.654991', '31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6'),
  ('51b31c71-1bd6-452d-99bb-82b3d60cfff9', '0497b77e-1471-4192-8f9f-d0f5239c24dc', 'Descubrimiento', '2026-07-02 16:32:37.433331', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('05bfab81-4705-46bc-bef3-6a6cf31f976b', '8973ed1e-39f9-4760-986f-f63b41321f98', 'Nuevo', '2026-07-02 16:41:24.52565', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('91bdc36c-9d8a-455c-93a6-2f1765ad08bf', '0497b77e-1471-4192-8f9f-d0f5239c24dc', 'Estimación', '2026-07-03 16:29:38.56391', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('b88d1d9d-a23a-4faf-a2f2-4b2b924531bc', 'ad00d82c-3098-472a-bf21-e34b0a367042', 'Descubrimiento', '2026-07-03 22:21:35.824757', 'c6bab003-146f-492b-95dd-b530d69d6e42'),
  ('cb85364d-d692-4783-9b9b-012e090c4154', '52fa0666-595c-41e9-9bbd-cad26ba2627f', 'Descubrimiento', '2026-07-03 22:31:29.991052', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('6984b588-6039-46e6-8595-65a7dde9be3f', 'ad00d82c-3098-472a-bf21-e34b0a367042', 'Nuevo', '2026-07-03 22:44:56.624331', 'c6bab003-146f-492b-95dd-b530d69d6e42'),
  ('236707a1-56ff-414e-8167-c1ea4d2af80f', '61ae2418-e508-4609-af58-cf92f86ea673', 'Nuevo', '2026-07-07 00:26:47.322228', 'c6bab003-146f-492b-95dd-b530d69d6e42'),
  ('babfbb0a-324e-4246-95bb-24316cb92ad6', '8973ed1e-39f9-4760-986f-f63b41321f98', 'Descubrimiento', '2026-07-10 17:45:33.051876', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('4c3a026b-5b4b-44ab-8e58-88a13eec49b2', '8973ed1e-39f9-4760-986f-f63b41321f98', 'Perdida', '2026-07-13 19:14:59.311892', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('ac7ba591-b99c-42de-b988-5c255a35c0eb', '8973ed1e-39f9-4760-986f-f63b41321f98', 'Cancelada', '2026-07-13 19:15:07.453238', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('c5767e95-db7e-42ae-af5b-d0ad8c682a49', '00ec4a80-2bfc-4315-9faf-3f7a08c98be8', 'Negociación', '2026-07-14 15:27:30.59825', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('fe871df8-5b72-41a6-8110-e329d0b4747f', '0497b77e-1471-4192-8f9f-d0f5239c24dc', 'Propuesta', '2026-07-14 15:27:45.415259', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('0c5844c5-6698-4491-87d2-6c18e1609b33', '8d608aa8-e43a-495d-9d0d-cf4f962645fd', 'Standby', '2026-07-15 16:58:28.890197', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('8c747df1-78a7-4442-9294-3fd3fb63a8b2', '143a4a62-0f84-4fbf-868a-92aae524c187', 'Standby', '2026-07-15 16:58:42.348975', 'c2793945-a827-4649-b4ec-fb983fcb6174'),
  ('3ffc2cf2-ae5e-4e56-8d98-e02218a40fc1', '61ae2418-e508-4609-af58-cf92f86ea673', 'Perdida', '2026-07-15 17:26:16.116722', 'c6bab003-146f-492b-95dd-b530d69d6e42'),
  ('8fc1a609-2d10-4e5c-89d8-600aaaf19a55', '427de668-1d60-441c-89c2-ee7239e91e2b', 'Nuevo', '2026-07-15 20:22:38.673816', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('f10db901-779b-4a35-85fb-1ab383c41aa0', '427de668-1d60-441c-89c2-ee7239e91e2b', 'Descubrimiento', '2026-07-16 16:53:12.25912', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('260f0fda-473f-44d1-a94e-456a7020fd4f', 'b897154a-7f9b-4ab1-9b38-3e866e87d9eb', 'Propuesta', '2026-07-16 18:18:16.531517', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('cf3eabb9-5d8d-4f80-84b8-257f36e6bfaf', '71b5225e-13a7-417c-80e5-df70d31e03e7', 'Cancelada', '2026-07-17 18:06:46.85965', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('96330dc3-819d-4edc-97d0-109c01a9e181', '280a539d-65de-43b8-925e-d02badd2fa53', 'Nuevo', '2026-07-23 18:38:16.307607', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('0a3c8eab-53d2-473d-92fe-52e8643d82b3', '280a539d-65de-43b8-925e-d02badd2fa53', 'Descubrimiento', '2026-07-23 18:38:25.210934', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('bc12e192-a017-4c81-9bfd-ccf6891c0c9a', '91fd1fdc-8940-4588-b1eb-eb38c945133b', 'Perdida', '2026-07-27 21:55:08.797246', '218506fb-a00a-49db-bbfb-1c02075a96f5'),
  ('799f62e8-7704-45af-847e-078ee015f363', '0497b77e-1471-4192-8f9f-d0f5239c24dc', 'Standby', '2026-07-28 15:52:11.715497', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('ae4a4a7d-3105-4a1f-974c-fab5b61fef46', '631626ef-acd1-4d16-a0e3-611cff4f5a7c', 'Perdida', '2026-07-28 15:52:19.077974', 'ccc0ba67-f6b7-445f-ad65-18deb6285bbb'),
  ('28bc851b-b68c-4b58-9efa-8e51e2218c5a', '501ce274-5a76-4a63-9630-b3301fdac82a', 'Nuevo', '2026-07-30 16:10:48.085518', 'c6bab003-146f-492b-95dd-b530d69d6e42');



--
-- Data for Name: reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.reminders
INSERT INTO staging.reminders (id, title, date, opportunity_id) VALUES
  ('fc961980-8848-4f29-9dfa-17fb0ceeb64c', 'Seguimiento ', '2025-10-08 15:50:00', 'bf5e43b6-a79a-417b-bc1c-e4492b0f3bf1'),
  ('c3aa3539-b4fa-4817-a439-5905842bd113', 'Llamar al cliente ', '2025-10-20 16:00:00', 'c621b04c-5fa5-41f6-b19b-e01a3de3882a'),
  ('fd2551c8-110f-4ff0-8e7d-d6bee3692554', 'Llamar al cliente ', '2025-10-20 16:00:00', 'd30069d6-655b-4460-8375-f7cf2b561806'),
  ('b07853fd-40f0-4703-b089-5dbe4e0166a7', 'Solicitar fecha a equipo técnico de Tibs entrega de Propuesta', '2025-10-17 18:15:00', 'a689919a-b00e-4178-8c45-3fb40747c045'),
  ('de82de91-a478-443f-9060-8e3820e99eb1', 'Llamar a Richi encargado del alcance técnico', '2025-10-17 15:17:00', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('d1b54fbc-567b-4328-ac46-8b6d3e00ee1f', 'Llamar al cliente ', '2025-10-20 15:30:00', '3758043d-a008-4131-b247-68e19f6abc40'),
  ('a79fb19a-77a6-4207-8f2f-e1392dcf9d7a', 'Llamar al cliente ', '2025-10-20 16:37:00', 'c5afdc59-58f4-44b4-b467-a3622fbc8aad'),
  ('9bdb6277-647a-4cc6-b2dd-b334f34bb21a', 'Llamar a Richi si es que no envía la propuesta', '2025-10-22 17:25:00', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('0b2fa877-35a5-470f-a40f-62669dbaabd3', 'Envio de Mail', '2025-10-23 19:57:00', 'da170cae-3a57-421f-9b3c-923f70c7303e'),
  ('81b1944b-34e8-476e-86ac-164f420c12bd', 'Coordinar con IBM la DEMO', '2025-10-27 21:43:00', '6182781a-4f62-4970-8e4b-91e1999a52a4'),
  ('fce0e917-7e30-480e-b71a-352215f3afa7', 'Enviar par de fechas para reunión (DEMO)', '2025-11-10 21:12:00', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('c42c633d-c637-45d7-bd33-6d5e5850a1fd', 'Agendar Proxima cita', '2025-11-10 21:14:00', 'a689919a-b00e-4178-8c45-3fb40747c045'),
  ('8794d1cf-7e2b-4132-b058-a4733b84118a', 'Llamar a Ariel', '2025-11-11 21:15:00', '16f9203a-7a14-4ca5-9e70-65b2d1f75488'),
  ('0b9c5f61-f2ce-4bd9-8d50-c6b7b34da3e1', 'Fernando - ONE', '2025-11-10 21:16:00', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('099ff183-ec23-452f-8ab4-381aa55e2a83', 'Llamar a Gabriel para seguimiento de esta app', '2025-11-10 21:19:00', '2743b385-7f41-404e-9ea7-e46ebb8a85fd'),
  ('df6a2f9e-fa77-42fd-8c4a-02a2e75aa96c', 'Llamar a Edgar (Synnex)', '2025-11-17 21:49:00', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a'),
  ('9a0d277f-2188-4931-90d3-15cdf1fe21f0', 'Llamar al cliente ', '2025-11-17 21:57:00', '9642b008-e953-4fb1-8754-76e10e849bc7'),
  ('ea5b5f54-ad32-4aa7-99d9-ab14747ab408', 'Llamar al cliente ', '2025-11-17 13:20:00', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('f0775358-d88f-4ad6-a02e-42f3696c1f39', 'Llamar a Ivonne', '2025-11-18 15:00:00', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a'),
  ('d47a66ec-9c48-4d5d-8817-952ccbb4a513', 'Llamarlo la siguiente semana', '2025-11-24 11:58:00', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('ce315600-401c-4778-9f17-127ae266cffc', 'Sesión de continuidad', '2026-01-15 16:00:00', '603e4f29-6123-47f7-9565-6dd9c42e4b43'),
  ('ca4dd6c1-d436-47c7-8a6d-9a7d1f82e75a', 'Recordar a Tibs si esta lista la DEMO con los cambios', '2025-11-28 14:54:00', '1c2bcefa-b79d-4290-b884-1be9c3b38057'),
  ('e15ed3f7-6cd5-48b6-8faa-57009aa5c06f', 'Llamar al cliente ', '2025-12-02 10:41:00', '9642b008-e953-4fb1-8754-76e10e849bc7'),
  ('07dea4d6-ee9b-408c-a2e9-a5c4bcfc8ec5', 'Llamar al cliente ', '2025-12-01 10:43:00', '44a8bf14-709d-4262-a11c-e3f127efcd2d'),
  ('74355d3d-81c5-4b32-9cf8-47bc949b1a58', 'Recorda al equipo Tibs si ya tenemos la DEMOS', '2025-11-28 11:44:00', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a'),
  ('03c7028a-32f2-45e6-9fa3-3516ec995570', 'Lista la DEMO', '2026-01-16 10:12:00', 'b70434c2-feb2-4b91-99f9-149f03ce1d8a'),
  ('1dc0bca7-d57f-479b-a972-fcf71a18a861', 'Sesión dudas técnicas', '2026-01-18 10:00:00', '8e7e51ca-c397-45fd-9270-4f74bfb1eb5c'),
  ('59029ff2-f292-40de-961a-cb6b4ef08837', 'Presentación de propuesta', '2026-01-27 13:30:00', '01d936a6-1a3a-4d6e-99fc-fd4c0505885a'),
  ('bae9b920-ac31-4b64-a99a-3af6e00ea34b', 'Retomar conversación con Adrián', '2026-03-10 10:00:00', '18bfd5ba-36d8-43c4-884b-a47abe73f592'),
  ('99f32e48-3085-4d44-9108-3698b0e97e95', 'Reunión para conocer requerimiento de Cámaras', '2026-03-04 17:00:00', '403f4ac9-f2be-40b5-9b96-62d290dbdd5d'),
  ('05b1cb10-1fd6-4cd8-89a4-9e17a8a39a81', 'Preguntarle a Jessica cant de usuarios', '2026-08-03 15:40:00', '5d8ef242-18c0-4431-af95-4c4a86132de4');



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- Converted COPY for staging.users
INSERT INTO staging.users (id, username, email, password, role, "isActive", "profileImageUrl", reset_password_token, reset_password_expires) VALUES
  ('31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6', 'Valeria Vázquez', 'valeria.vazquez@tibs.com.mx', '$2b$10$MEr4CZHazv1bkvfgaMiYnOGcErlm91XmMzGRq9kDxl.0ttpziO082', 'executive', 't', '/uploads/users/31ea3561-ed13-46a2-8bcb-0d4aa0cae4a6/WhatsApp Image 2025-10-10 at 15.13.46.jpeg', NULL, NULL),
  ('568d5e34-cfb0-4545-9c7f-2dbac618343e', 'Mario monroy', 'mario.monroy@tibs.com.mx', '$2b$10$INeX.MGgO7uS7pv4gzIk6OWObRcM2723CuYQKOiT/iDpEo/nbhmQS', 'admin', 't', '/uploads/users/568d5e34-cfb0-4545-9c7f-2dbac618343e/WhatsApp Image 2025-10-10 at 15.14.52.jpeg', NULL, NULL),
  ('218506fb-a00a-49db-bbfb-1c02075a96f5', 'Paula Rosselli', 'paula.rosselli@tibs.com.mx', '$2b$10$vULEN4MMYX6IXv8YbFcR4uYs463jF7gvxjkuJ9Kv7koRuyqFxI6Z.', 'executive', 't', '/uploads/users/218506fb-a00a-49db-bbfb-1c02075a96f5/WhatsApp Image 2025-10-10 at 15.20.10.jpeg', NULL, NULL),
  ('e3b6293e-6e95-4fc5-b61d-96dba1d896b3', 'Oscar Esperón', 'oscar.esperon@tibs.com.mx', '$2b$10$G7ErkjtWa5m0Kem57OmW3.3TmJUJ62pZgn2Vg7IJ1QUO9nkOEEmxS', 'executive', 'f', '/uploads/users/e3b6293e-6e95-4fc5-b61d-96dba1d896b3/Screenshot 2025-10-09 at 12.00.23 p.m..png', NULL, NULL),
  ('ccc0ba67-f6b7-445f-ad65-18deb6285bbb', 'Elizabeth Cortez', 'elizabeth.cortez@tibs.com.mx', '$2b$10$pp8mwgPxfr6malJm8zyb8uG187PUFFbuzbOxDK6WNYK9rQ3W58yzG', 'executive', 't', '/uploads/users/ccc0ba67-f6b7-445f-ad65-18deb6285bbb/Screenshot 2026-02-09 at 1.13.02 p.m..png', NULL, NULL),
  ('3d1d28f1-0a90-42bb-b4d3-63f1acc03601', 'Hector Esparza', 'hector.esparza@tibs.com.mx', '$2b$10$b1FW2rkJm8qp9N0n8KH5o.UXdFFbOXMmsaPEf88ZrIH0HNRRlMnqK', 'executive', 't', '/uploads/users/3d1d28f1-0a90-42bb-b4d3-63f1acc03601/imagenperfil.jpg', NULL, NULL),
  ('c2793945-a827-4649-b4ec-fb983fcb6174', 'Ivonne Cabriales', 'ivonne.cabriales@tibs.com.mx', '$2b$10$asFdUm9WxTkzKBNZBawb/..vhFviMspFsdMZxMLRkUTyBF/QK7npq', 'admin', 't', '/uploads/users/c2793945-a827-4649-b4ec-fb983fcb6174/Screenshot 2025-10-10 at 3.09.31 p.m..png', NULL, NULL),
  ('cd5e17a2-854d-452b-b2f0-2877d2907dda', 'Mónica Lechuga ', 'monica.lechuga@tibs.com.mx', '$2b$10$mca6VVS/88V7j5OODt9vo.U8T4YCDIPuIE9gJpokHXvAixrs/m8DC', 'executive', 'f', '/uploads/users/cd5e17a2-854d-452b-b2f0-2877d2907dda/Screenshot 2025-11-20 at 7.14.06 p.m..png', NULL, NULL),
  ('c6bab003-146f-492b-95dd-b530d69d6e42', 'Andrea Alva', 'veronica.alva@tibs.com.mx', '$2b$10$JLdBSzvnj1VhZsKrY86wrO20YwMcs48CUyEmQfsLYnAwsfKNP/HnC', 'executive', 't', '/uploads/users/c6bab003-146f-492b-95dd-b530d69d6e42/WhatsApp Image 2026-07-10 at 12.43.15.jpeg', NULL, NULL);



--
-- Name: opportunity_trackings PK_32e9af2b60e5b2fac0bc224fdcb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunity_trackings
    ADD CONSTRAINT "PK_32e9af2b60e5b2fac0bc224fdcb" PRIMARY KEY (id);


--
-- Name: reminders PK_38715fec7f634b72c6cf7ea4893; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.reminders
    ADD CONSTRAINT "PK_38715fec7f634b72c6cf7ea4893" PRIMARY KEY (id);


--
-- Name: opportunities PK_4bd9cd12ddc0ff48a5a97ddebce; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunities
    ADD CONSTRAINT "PK_4bd9cd12ddc0ff48a5a97ddebce" PRIMARY KEY (id);


--
-- Name: activities PK_7f4004429f731ffb9c88eb486a8; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.activities
    ADD CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY (id);


--
-- Name: interactions PK_911b7416a6671b4148b18c18ecb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.interactions
    ADD CONSTRAINT "PK_911b7416a6671b4148b18c18ecb" PRIMARY KEY (id);


--
-- Name: expenses PK_94c3ceb17e3140abc9282c20610; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.expenses
    ADD CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: clients PK_f1ab7cf3a5714dbc6bb4e1c28a4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.clients
    ADD CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY (id);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: clients UQ_d2608642672a2ac41adc4733561; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.clients
    ADD CONSTRAINT "UQ_d2608642672a2ac41adc4733561" UNIQUE (correo);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: expenses FK_07d9d152ff3961d3af9c0ab095d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.expenses
    ADD CONSTRAINT "FK_07d9d152ff3961d3af9c0ab095d" FOREIGN KEY (opportunity_id) REFERENCES staging.opportunities(id);


--
-- Name: reminders FK_3ce7e1ecb0bee6873c2a6566ed6; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.reminders
    ADD CONSTRAINT "FK_3ce7e1ecb0bee6873c2a6566ed6" FOREIGN KEY (opportunity_id) REFERENCES staging.opportunities(id) ON DELETE CASCADE;


--
-- Name: expenses FK_5761adee29a8e328e2aa57ce302; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.expenses
    ADD CONSTRAINT "FK_5761adee29a8e328e2aa57ce302" FOREIGN KEY (client_id) REFERENCES staging.clients(id);


--
-- Name: activities FK_5a2cfe6f705df945b20c1b22c71; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.activities
    ADD CONSTRAINT "FK_5a2cfe6f705df945b20c1b22c71" FOREIGN KEY ("userId") REFERENCES staging.users(id);


--
-- Name: expenses FK_62c7e24a2ae141ffb1ccb290744; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.expenses
    ADD CONSTRAINT "FK_62c7e24a2ae141ffb1ccb290744" FOREIGN KEY (usuario_id) REFERENCES staging.users(id);


--
-- Name: clients FK_72b2a0a93d100c703ac4b231042; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.clients
    ADD CONSTRAINT "FK_72b2a0a93d100c703ac4b231042" FOREIGN KEY (ejecutivo_id) REFERENCES staging.users(id);


--
-- Name: opportunity_trackings FK_78da6ee7da20601b1d27a52b940; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunity_trackings
    ADD CONSTRAINT "FK_78da6ee7da20601b1d27a52b940" FOREIGN KEY (opportunity_id) REFERENCES staging.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_trackings FK_adb2651fd6ce68d8d3f5c44a088; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunity_trackings
    ADD CONSTRAINT "FK_adb2651fd6ce68d8d3f5c44a088" FOREIGN KEY (changed_by_id) REFERENCES staging.users(id);


--
-- Name: opportunities FK_b0b2fece2e13b1f38bd5cfe1da0; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunities
    ADD CONSTRAINT "FK_b0b2fece2e13b1f38bd5cfe1da0" FOREIGN KEY (ejecutivo_id) REFERENCES staging.users(id);


--
-- Name: opportunities FK_b12ed2b583eebb41169a8fb64de; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.opportunities
    ADD CONSTRAINT "FK_b12ed2b583eebb41169a8fb64de" FOREIGN KEY (cliente_id) REFERENCES staging.clients(id);


--
-- Name: activities FK_b89493b1633169dca906755762b; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.activities
    ADD CONSTRAINT "FK_b89493b1633169dca906755762b" FOREIGN KEY ("opportunityId") REFERENCES staging.opportunities(id) ON DELETE SET NULL;


--
-- Name: interactions FK_cf5831be29befbb5ac5d1f7c412; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.interactions
    ADD CONSTRAINT "FK_cf5831be29befbb5ac5d1f7c412" FOREIGN KEY (opportunity_id) REFERENCES staging.opportunities(id) ON DELETE CASCADE;


--
-- Name: activities FK_fc9d6236c8a32fecdd82fae816a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY staging.activities
    ADD CONSTRAINT "FK_fc9d6236c8a32fecdd82fae816a" FOREIGN KEY ("clientId") REFERENCES staging.clients(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

-- \unrestrict BjRYXoxYpAqVN82zhcfVUAB5kXFzlqvcTEb16PjdUKrnyCZkkAE85x2HXYHxdKu

