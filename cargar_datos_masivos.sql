-- ==============================================================================
-- SCRIPT DE CARGA Y TRANSFORMACIÓN MASIVA DE DATOS
-- CRM TIBS: Desde esquema 'staging' (backup viejo) a esquema 'tenant_tibs' (BD nueva)
-- ==============================================================================

-- INSTRUCCIONES DE USO:
-- 1. En tu cliente SQL (pgAdmin/DBeaver), asegúrate de estar conectado a la BD nueva.
-- 2. Si ocurrió un error en una ejecución previa, asegúrate de correr 'ROLLBACK;' antes.
-- 3. Ejecuta este script para migrar los datos operativos hacia 'tenant_tibs'.

BEGIN;

SET search_path TO tenant_tibs, staging, public;

-- ------------------------------------------------------------------------------
-- PASO 1: MIGRACIÓN DE USUARIOS A tenant_tibs
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.users (id, username, email, password, role, "isActive", "profileImageUrl", reset_password_token, reset_password_expires)
SELECT id, username, email, password, role::text, "isActive", "profileImageUrl", reset_password_token, reset_password_expires
FROM staging.users
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 2: MIGRACIÓN DE EMPRESAS (COMPANIES) A tenant_tibs
-- Extrae empresas únicas desde clientes y oportunidades de staging
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.companies (id, nombre, estatus, "createdAt", "updatedAt")
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
    SELECT 1 FROM tenant_tibs.companies c WHERE LOWER(c.nombre) = LOWER(TRIM(e.empresa_name))
);

-- ------------------------------------------------------------------------------
-- PASO 3: MIGRACIÓN DE CLIENTES A tenant_tibs
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.clients (id, nombre, apellido, correo, empresa, puesto, telefono, estatus, ejecutivo_id, category, "companyId")
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
LEFT JOIN tenant_tibs.companies comp ON LOWER(TRIM(c.empresa)) = LOWER(comp.nombre)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 4: MIGRACIÓN DE OPORTUNIDADES A tenant_tibs (USANDO CATÁLOGOS EXISTENTES)
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.opportunities (
    id, 
    nombre_proyecto, 
    description,
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
    o.description,
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
    o.estimated_closure_date, 
    o."createdAt",
    COALESCE(
        (SELECT id FROM tenant_tibs.tblpipelinescatalog WHERE LOWER(strname) LIKE '%principal%' LIMIT 1),
        (SELECT id FROM tenant_tibs.tblpipelinescatalog LIMIT 1)
    ) AS pipeline_id,
    COALESCE(
        st.id, 
        (SELECT id FROM tenant_tibs.tblstagescatalog WHERE LOWER(strname) = 'nuevo' LIMIT 1),
        (SELECT id FROM tenant_tibs.tblstagescatalog ORDER BY display_order ASC LIMIT 1)
    ) AS stage_id,
    bl.id AS linea_negocio_id,
    dt.id AS tipo_entrega_id,
    lc.id AS licenciamiento_id,
    comp.id AS "companyId"
FROM staging.opportunities o
LEFT JOIN tenant_tibs.tblstagescatalog st ON LOWER(TRIM(o.etapa::text)) = LOWER(st.strname)
LEFT JOIN tenant_tibs.tblbusinesslines bl ON LOWER(TRIM(o.linea_negocio::text)) = LOWER(bl.strname)
LEFT JOIN tenant_tibs.tbldeliverytypes dt ON LOWER(TRIM(o.tipo_entrega::text)) = LOWER(dt.strname)
LEFT JOIN tenant_tibs.tblicensings lc ON LOWER(TRIM(o.licenciamiento::text)) = LOWER(lc.strname)
LEFT JOIN tenant_tibs.companies comp ON LOWER(TRIM(o.empresa)) = LOWER(comp.nombre)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 5: MIGRACIÓN DE TRACKING DE OPORTUNIDADES A tenant_tibs
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.opportunity_trackings (id, opportunity_id, "changedAt", changed_by_id, stage_id)
SELECT 
    ot.id,
    ot.opportunity_id,
    ot."changedAt",
    ot.changed_by_id,
    COALESCE(
        st.id, 
        (SELECT id FROM tenant_tibs.tblstagescatalog WHERE LOWER(strname) = 'nuevo' LIMIT 1),
        (SELECT id FROM tenant_tibs.tblstagescatalog ORDER BY display_order ASC LIMIT 1)
    ) AS stage_id
FROM staging.opportunity_trackings ot
LEFT JOIN tenant_tibs.tblstagescatalog st ON LOWER(TRIM(ot.stage::text)) = LOWER(st.strname)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 6: MIGRACIÓN DE ACTIVIDADES A tenant_tibs
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.activities (id, date, activity, "opportunityId", "userId", "clientId", flaghistory, "typeActivityId", "companyId")
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
LEFT JOIN tenant_tibs.tbltypeactivities ta ON LOWER(TRIM(a."activityType"::text)) = LOWER(ta.strname)
LEFT JOIN tenant_tibs.clients c ON a."clientId" = c.id
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 7: MIGRACIÓN DE RECORDATORIOS (REMINDERS), GASTOS (EXPENSES) E INTERACCIONES
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.reminders (id, title, date, notified)
SELECT id, title, date, false
FROM staging.reminders
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_tibs.expenses (id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt")
SELECT id, fecha, concepto, monto, client_id, opportunity_id, usuario_id, "receiptUrl", "createdAt"
FROM staging.expenses
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_tibs.interactions (id, comment, created_at, opportunity_id)
SELECT id, comment, created_at, opportunity_id
FROM staging.interactions
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- PASO 8: POBLAR TABLAS DE ASOCIACIÓN MANY-TO-MANY EN tenant_tibs
-- ------------------------------------------------------------------------------
INSERT INTO tenant_tibs.opportunity_contacts ("opportunitiesId", "clientsId")
SELECT DISTINCT id AS "opportunitiesId", cliente_id AS "clientsId"
FROM tenant_tibs.opportunities
WHERE cliente_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO tenant_tibs.activity_contacts ("activitiesId", "clientsId")
SELECT DISTINCT id AS "activitiesId", "clientId" AS "clientsId"
FROM tenant_tibs.activities
WHERE "clientId" IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
