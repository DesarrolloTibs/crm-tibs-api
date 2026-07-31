-- ==============================================================================
-- SCRIPT DE CARGA Y TRANSFORMACIÓN MASIVA DE DATOS (CON UUIDs ALEATORIOS)
-- CRM TIBS: Desde esquema 'staging' (backup viejo) a esquema 'public' (BD nueva)
-- ==============================================================================

-- INSTRUCCIONES DE USO:
-- 1. En tu cliente SQL (pgAdmin/DBeaver), asegúrate de estar conectado a la BD nueva.
-- 2. Crea el esquema staging:
--      CREATE SCHEMA IF NOT EXISTS staging;
-- 3. Restaura 'backup_staging.sql' dentro de la BD.
-- 4. Ejecuta este script.

BEGIN;

-- ------------------------------------------------------------------------------
-- PASO 1: CREAR Y POBLAR CATÁLOGOS BASE (UUIDs GENERADOS ALEATORIAMENTE)
-- ------------------------------------------------------------------------------

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1.1 Pipeline Principal
INSERT INTO public.tblpipelinescatalog (id, name, description, is_default, created_at, updated_at)
SELECT gen_random_uuid(), 'Pipeline Principal', 'Pipeline migrado de sistema anterior', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.tblpipelinescatalog WHERE name = 'Pipeline Principal');

-- 1.2 Etapas
INSERT INTO public.tblstagescatalog (id, name, "order", probability, pipeline_id, created_at, updated_at)
SELECT gen_random_uuid(), val.name, val.ord, val.prob, p.id, NOW(), NOW()
FROM (VALUES 
  ('Nuevo', 1, 10),
  ('Descubrimiento', 2, 25),
  ('Estimación', 3, 50),
  ('Propuesta', 4, 75),
  ('Negociación', 5, 90),
  ('Ganada', 6, 100),
  ('Perdida', 7, 0),
  ('Cancelada', 8, 0),
  ('Standby', 9, 0)
) AS val(name, ord, prob)
CROSS JOIN public.tblpipelinescatalog p
WHERE p.name = 'Pipeline Principal'
  AND NOT EXISTS (SELECT 1 FROM public.tblstagescatalog s WHERE LOWER(s.name) = LOWER(val.name));

-- 1.3 Líneas de negocio
INSERT INTO public.tblbusinesslines (id, name, created_at, updated_at)
SELECT gen_random_uuid(), val.name, NOW(), NOW()
FROM (VALUES ('Datos'), ('Desarrollo'), ('RH')) AS val(name)
WHERE NOT EXISTS (SELECT 1 FROM public.tblbusinesslines b WHERE LOWER(b.name) = LOWER(val.name));

-- 1.4 Tipos de entrega
INSERT INTO public.tbldeliverytypes (id, name, created_at, updated_at)
SELECT gen_random_uuid(), val.name, NOW(), NOW()
FROM (VALUES ('Proyecto'), ('Licencia'), ('Asignacion'), ('Bolsa de Horas')) AS val(name)
WHERE NOT EXISTS (SELECT 1 FROM public.tbldeliverytypes d WHERE LOWER(d.name) = LOWER(val.name));

-- 1.5 Licenciamientos
INSERT INTO public.tblicensings (id, name, created_at, updated_at)
SELECT gen_random_uuid(), val.name, NOW(), NOW()
FROM (VALUES ('No Aplica'), ('Microsoft'), ('IBM'), ('Qlik'), ('Alteryx'), ('KNIME')) AS val(name)
WHERE NOT EXISTS (SELECT 1 FROM public.tblicensings l WHERE LOWER(l.name) = LOWER(val.name));

-- 1.6 Tipos de actividad
INSERT INTO public.tbltypeactivities (name)
SELECT val.name
FROM (VALUES 
  ('Correo'),
  ('Presentación Servicios Presencial'),
  ('Presentación Servicios En Línea'),
  ('Evento'),
  ('Seguimiento Oportunidad Línea'),
  ('Llamada'),
  ('Seguimiento Oportunidad Presencial'),
  ('Otros')
) AS val(name)
WHERE NOT EXISTS (SELECT 1 FROM public.tbltypeactivities ta WHERE LOWER(ta.name) = LOWER(val.name));

-- ------------------------------------------------------------------------------
-- PASO 2: MIGRACIÓN DE USUARIOS
-- ------------------------------------------------------------------------------
INSERT INTO public.users (id, username, email, password, role, "isActive", "profileImageUrl", reset_password_token, reset_password_expires)
SELECT id, username, email, password, role::text::public.users_role_enum, "isActive", "profileImageUrl", reset_password_token, reset_password_expires
FROM staging.users
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 3: MIGRACIÓN DE EMPRESAS (COMPANIES)
-- Extrae empresas únicas desde clientes y oportunidades de staging
-- ------------------------------------------------------------------------------
INSERT INTO public.companies (id, nombre, estatus, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(), 
    TRIM(empresa_name), 
    true, 
    NOW(), 
    NOW()
FROM (
    SELECT DISTINCT empresa AS empresa_name FROM staging.clients WHERE empresa IS NOT NULL AND TRIM(empresa) != ''
    UNION
    SELECT DISTINCT empresa AS empresa_name FROM staging.opportunities WHERE empresa IS NOT NULL AND TRIM(empresa) != ''
) AS e
WHERE NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE LOWER(c.nombre) = LOWER(TRIM(e.empresa_name))
);

-- ------------------------------------------------------------------------------
-- PASO 4: MIGRACIÓN DE CLIENTES
-- ------------------------------------------------------------------------------
INSERT INTO public.clients (id, nombre, apellido, correo, empresa, puesto, telefono, estatus, ejecutivo_id, category, "companyId")
SELECT 
    c.id, 
    c.nombre, 
    c.apellido, 
    c.correo, 
    c.empresa, 
    c.puesto, 
    c.telefono, 
    c.estatus, 
    c.ejecutivo_id, 
    c.category::text,
    comp.id AS "companyId"
FROM staging.clients c
LEFT JOIN public.companies comp ON LOWER(TRIM(c.empresa)) = LOWER(comp.nombre)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 5: MIGRACIÓN DE OPORTUNIDADES CON BUSQUEDA DINÁMICA DE UUIDs
-- ------------------------------------------------------------------------------
INSERT INTO public.opportunities (
    id, 
    nombre_proyecto, 
    cliente_id, 
    empresa, 
    ejecutivo_id, 
    monto_licenciamiento, 
    monto_servicios, 
    monto_total, 
    moneda, 
    proposal_document_path, 
    archived, 
    "tipoCambio", 
    description, 
    estimated_closure_date, 
    "createdAt",
    pipeline_id,
    stage_id,
    linea_negocio_id,
    tipo_entrega_id,
    licenciamiento_id,
    "companyId"
)
SELECT 
    o.id, 
    o.nombre_proyecto, 
    o.cliente_id, 
    o.empresa, 
    o.ejecutivo_id, 
    o.monto_licenciamiento, 
    o.monto_servicios, 
    o.monto_total, 
    o.moneda::text, 
    o.proposal_document_path, 
    o.archived, 
    o."tipoCambio", 
    o.description, 
    o.estimated_closure_date, 
    o."createdAt",
    (SELECT id FROM public.tblpipelinescatalog WHERE name = 'Pipeline Principal' LIMIT 1) AS pipeline_id,
    COALESCE(st.id, (SELECT id FROM public.tblstagescatalog WHERE LOWER(name) = 'nuevo' LIMIT 1)) AS stage_id,
    bl.id AS linea_negocio_id,
    dt.id AS tipo_entrega_id,
    lc.id AS licenciamiento_id,
    comp.id AS "companyId"
FROM staging.opportunities o
LEFT JOIN public.tblstagescatalog st ON LOWER(TRIM(o.etapa::text)) = LOWER(st.name)
LEFT JOIN public.tblbusinesslines bl ON LOWER(TRIM(o.linea_negocio::text)) = LOWER(bl.name)
LEFT JOIN public.tbldeliverytypes dt ON LOWER(TRIM(o.tipo_entrega::text)) = LOWER(dt.name)
LEFT JOIN public.tblicensings lc ON LOWER(TRIM(o.licenciamiento::text)) = LOWER(lc.name)
LEFT JOIN public.companies comp ON LOWER(TRIM(o.empresa)) = LOWER(comp.nombre)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 6: MIGRACIÓN DE TRACKING DE OPORTUNIDADES
-- ------------------------------------------------------------------------------
INSERT INTO public.opportunity_trackings (id, opportunity_id, "changedAt", changed_by_id, stage_id)
SELECT 
    ot.id,
    ot.opportunity_id,
    ot."changedAt",
    ot.changed_by_id,
    COALESCE(st.id, (SELECT id FROM public.tblstagescatalog WHERE LOWER(name) = 'nuevo' LIMIT 1)) AS stage_id
FROM staging.opportunity_trackings ot
LEFT JOIN public.tblstagescatalog st ON LOWER(TRIM(ot.stage::text)) = LOWER(st.name)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 7: MIGRACIÓN DE ACTIVIDADES
-- ------------------------------------------------------------------------------
INSERT INTO public.activities (id, date, activity, "opportunityId", "userId", "clientId", flaghistory, "typeActivityId", "companyId")
SELECT 
    a.id,
    a.date,
    a.activity,
    a."opportunityId",
    a."userId",
    a."clientId",
    a.flaghistory,
    ta.id AS "typeActivityId",
    c."companyId" AS "companyId"
FROM staging.activities a
LEFT JOIN public.tbltypeactivities ta ON LOWER(TRIM(a."activityType"::text)) = LOWER(ta.name)
LEFT JOIN public.clients c ON a."clientId" = c.id
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 8: MIGRACIÓN DE REMINDERS, EXPENSES E INTERACCIONES
-- ------------------------------------------------------------------------------
INSERT INTO public.reminders (id, title, date, opportunity_id)
SELECT id, title, date, opportunity_id
FROM staging.reminders
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.expenses (id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt")
SELECT id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt"
FROM staging.expenses
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.interactions (id, comment, created_at, opportunity_id)
SELECT id, comment, created_at, opportunity_id
FROM staging.interactions
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 9: POBLAR TABLAS DE ASOCIACIÓN MANY-TO-MANY (CONTACTOS)
-- ------------------------------------------------------------------------------
INSERT INTO public.opportunity_contacts ("opportunitiesId", "clientsId")
SELECT DISTINCT id AS "opportunitiesId", cliente_id AS "clientsId"
FROM public.opportunities
WHERE cliente_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.activity_contacts ("activitiesId", "clientsId")
SELECT DISTINCT id AS "activitiesId", "clientId" AS "clientsId"
FROM public.activities
WHERE "clientId" IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
