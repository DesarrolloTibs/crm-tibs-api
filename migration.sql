-- Agregar columna intmaxdays a la tabla tblstagescatalog si no existe
ALTER TABLE tblstagescatalog ADD COLUMN IF NOT EXISTS intmaxdays integer;

-- Agregar columna stage_entered_at a la tabla opportunities si no existe
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_entered_at timestamp;



-- Migración de reminders a actividades

-- Eliminar constraint y columna de oportunidad (ya no aplica)
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS fk_reminders_opportunity;
ALTER TABLE reminders DROP COLUMN IF EXISTS opportunity_id;

-- Añadir columna activity_id (FK a activities, cascade al eliminar la actividad)
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS activity_id uuid NULL;

-- Añadir FK fk_reminders_activity solo si no existe aún
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_reminders_activity'
      AND conrelid = 'reminders'::regclass
  ) THEN
    ALTER TABLE reminders
      ADD CONSTRAINT fk_reminders_activity
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índice único: máximo 1 recordatorio por actividad
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_activity_id
  ON reminders (activity_id)
  WHERE activity_id IS NOT NULL;

-- Alterar columna activity de la tabla activities para no tener límite de caracteres (cambiar a text)
ALTER TABLE activities ALTER COLUMN activity TYPE text;

-- Catálogo de productos y vinculación con oportunidades
CREATE TABLE IF NOT EXISTS products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text NULL,
  "precioBase" numeric(10,2) NOT NULL DEFAULT 0.00,
  status boolean NOT NULL DEFAULT true,
  "imagenPortada" varchar(512) NULL,
  "createdById" uuid NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_products PRIMARY KEY (id),
  CONSTRAINT fk_products_created_by FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "fileName" varchar(255) NOT NULL,
  "filePath" varchar(512) NOT NULL,
  title varchar(255) NULL,
  "productId" uuid NOT NULL,
  "uploadedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_product_files PRIMARY KEY (id),
  CONSTRAINT fk_product_files_product FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS opportunity_products (
  "opportunitiesId" uuid NOT NULL,
  "productsId" uuid NOT NULL,
  CONSTRAINT pk_opportunity_products PRIMARY KEY ("opportunitiesId", "productsId"),
  CONSTRAINT fk_opportunity_products_opportunity FOREIGN KEY ("opportunitiesId") REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT fk_opportunity_products_product FOREIGN KEY ("productsId") REFERENCES products(id) ON DELETE CASCADE
);

-- Eliminar columna stock de la tabla products
ALTER TABLE products DROP COLUMN IF EXISTS stock;

-- Crear tablas para catálogos dinámicos
CREATE TABLE IF NOT EXISTS tblbusinesslines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tblbusinesslines PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tbldeliverytypes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tbldeliverytypes PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tblicensings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tblicensings PRIMARY KEY (id)
);

-- Poblar catálogos con opciones por defecto y UUIDs estáticos
INSERT INTO tblbusinesslines (id, strname, blnstatus) VALUES
  ('a8b6d804-94c9-4a0b-bc77-cfc8152e93db', 'Datos', true),
  ('b2f0a149-14a0-410a-8bf8-28564f7b60cc', 'Desarrollo', true),
  ('c5d72bc1-12c8-47bc-8a7e-128a192bfa77', 'RH', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tbldeliverytypes (id, strname, blnstatus) VALUES
  ('d29ab9f7-7b89-4089-a299-cf9b0cb617cf', 'Proyecto', true),
  ('e20c3a2a-43d9-482a-88cb-b09b0b4b2efc', 'Licencia', true),
  ('f22db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Asignacion', true),
  ('012db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Bolsa de Horas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tblicensings (id, strname, blnstatus) VALUES
  ('112db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'No Aplica', true),
  ('212db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Microsoft', true),
  ('312db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'IBM', true),
  ('412db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Qlik', true),
  ('512db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Alteryx', true),
  ('612db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'KNIME', true)
ON CONFLICT (id) DO NOTHING;

-- Agregar nuevas columnas UUID de clasificación a la tabla opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "linea_negocio_id" uuid NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "tipo_entrega_id" uuid NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "licenciamiento_id" uuid NULL;

-- Mapear y migrar datos existentes de enums/varchars a llaves foráneas UUID
UPDATE opportunities SET "linea_negocio_id" = 'a8b6d804-94c9-4a0b-bc77-cfc8152e93db' WHERE "linea_negocio"::text = 'Datos';
UPDATE opportunities SET "linea_negocio_id" = 'b2f0a149-14a0-410a-8bf8-28564f7b60cc' WHERE "linea_negocio"::text = 'Desarrollo';
UPDATE opportunities SET "linea_negocio_id" = 'c5d72bc1-12c8-47bc-8a7e-128a192bfa77' WHERE "linea_negocio"::text = 'RH';

UPDATE opportunities SET "tipo_entrega_id" = 'd29ab9f7-7b89-4089-a299-cf9b0cb617cf' WHERE "tipo_entrega"::text = 'Proyecto';
UPDATE opportunities SET "tipo_entrega_id" = 'e20c3a2a-43d9-482a-88cb-b09b0b4b2efc' WHERE "tipo_entrega"::text = 'Licencia';
UPDATE opportunities SET "tipo_entrega_id" = 'f22db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "tipo_entrega"::text = 'Asignacion';
UPDATE opportunities SET "tipo_entrega_id" = '012db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "tipo_entrega"::text = 'Bolsa de Horas';

UPDATE opportunities SET "licenciamiento_id" = '112db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'No Aplica';
UPDATE opportunities SET "licenciamiento_id" = '212db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Microsoft';
UPDATE opportunities SET "licenciamiento_id" = '312db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'IBM';
UPDATE opportunities SET "licenciamiento_id" = '412db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Qlik';
UPDATE opportunities SET "licenciamiento_id" = '512db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Alteryx';
UPDATE opportunities SET "licenciamiento_id" = '612db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'KNIME';

-- Eliminar columnas de tipo enum antiguas
ALTER TABLE opportunities DROP COLUMN IF EXISTS "linea_negocio";
ALTER TABLE opportunities DROP COLUMN IF EXISTS "tipo_entrega";
ALTER TABLE opportunities DROP COLUMN IF EXISTS "licenciamiento";

-- Agregar constraints de llaves foráneas a las nuevas columnas
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_linea_negocio FOREIGN KEY ("linea_negocio_id") REFERENCES tblbusinesslines(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_tipo_entrega FOREIGN KEY ("tipo_entrega_id") REFERENCES tbldeliverytypes(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_licenciamiento FOREIGN KEY ("licenciamiento_id") REFERENCES tblicensings(id) ON DELETE SET NULL;


-- Tabla tbloportunitylabels: agregar columna field_key para mapear campos personalizables
ALTER TABLE tbloportunitylabels ADD COLUMN IF NOT EXISTS field_key character varying(50) NULL;

-- Agregar constraint UNIQUE a field_key si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_tbloportunitylabels_field_key'
      OR (conname = 'tbloportunitylabels_field_key_key' AND conrelid = 'tbloportunitylabels'::regclass)
  ) THEN
    ALTER TABLE tbloportunitylabels
      ADD CONSTRAINT uq_tbloportunitylabels_field_key UNIQUE (field_key);
  END IF;
END $$;

-- Poblar tbloportunitylabels si está vacía
INSERT INTO tbloportunitylabels (id, strname, field_key, blnstatus, dtmlastmodified) VALUES
  ('f509fa84-0b73-45f8-b3ab-b8471e98822e', 'Línea de Negocio', 'linea_negocio', true, now()),
  ('7d90d810-74d3-4613-882d-8e814a029db5', 'Tipo de Entrega', 'tipo_entrega', true, now()),
  ('c6d3df39-53e7-40b9-8e2b-f1de16b5394f', 'Licenciamiento', 'licenciamiento', true, now())
ON CONFLICT (id) DO NOTHING;

-- Sincronizar field_key en registros existentes (si la tabla ya tenía datos pero con field_key nulo)
UPDATE tbloportunitylabels 
SET field_key = 'linea_negocio' 
WHERE field_key IS NULL 
  AND (id = 'f509fa84-0b73-45f8-b3ab-b8471e98822e' 
       OR lower(strname) LIKE '%negocio%' 
       OR lower(strname) LIKE '%linea%');

UPDATE tbloportunitylabels 
-- Agregar columna intmaxdays a la tabla tblstagescatalog si no existe
ALTER TABLE tblstagescatalog ADD COLUMN IF NOT EXISTS intmaxdays integer;

-- Agregar columna stage_entered_at a la tabla opportunities si no existe
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_entered_at timestamp;



-- Migración de reminders a actividades

-- Eliminar constraint y columna de oportunidad (ya no aplica)
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS fk_reminders_opportunity;
ALTER TABLE reminders DROP COLUMN IF EXISTS opportunity_id;

-- Añadir columna activity_id (FK a activities, cascade al eliminar la actividad)
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS activity_id uuid NULL;

-- Añadir FK fk_reminders_activity solo si no existe aún
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_reminders_activity'
      AND conrelid = 'reminders'::regclass
  ) THEN
    ALTER TABLE reminders
      ADD CONSTRAINT fk_reminders_activity
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índice único: máximo 1 recordatorio por actividad
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_activity_id
  ON reminders (activity_id)
  WHERE activity_id IS NOT NULL;

-- Alterar columna activity de la tabla activities para no tener límite de caracteres (cambiar a text)
ALTER TABLE activities ALTER COLUMN activity TYPE text;

-- Catálogo de productos y vinculación con oportunidades
CREATE TABLE IF NOT EXISTS products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text NULL,
  "precioBase" numeric(10,2) NOT NULL DEFAULT 0.00,
  status boolean NOT NULL DEFAULT true,
  "imagenPortada" varchar(512) NULL,
  "createdById" uuid NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_products PRIMARY KEY (id),
  CONSTRAINT fk_products_created_by FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "fileName" varchar(255) NOT NULL,
  "filePath" varchar(512) NOT NULL,
  title varchar(255) NULL,
  "productId" uuid NOT NULL,
  "uploadedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_product_files PRIMARY KEY (id),
  CONSTRAINT fk_product_files_product FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS opportunity_products (
  "opportunitiesId" uuid NOT NULL,
  "productsId" uuid NOT NULL,
  CONSTRAINT pk_opportunity_products PRIMARY KEY ("opportunitiesId", "productsId"),
  CONSTRAINT fk_opportunity_products_opportunity FOREIGN KEY ("opportunitiesId") REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT fk_opportunity_products_product FOREIGN KEY ("productsId") REFERENCES products(id) ON DELETE CASCADE
);

-- Eliminar columna stock de la tabla products
ALTER TABLE products DROP COLUMN IF EXISTS stock;

-- Crear tablas para catálogos dinámicos
CREATE TABLE IF NOT EXISTS tblbusinesslines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tblbusinesslines PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tbldeliverytypes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tbldeliverytypes PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tblicensings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_tblicensings PRIMARY KEY (id)
);

-- Poblar catálogos con opciones por defecto y UUIDs estáticos
INSERT INTO tblbusinesslines (id, strname, blnstatus) VALUES
  ('a8b6d804-94c9-4a0b-bc77-cfc8152e93db', 'Datos', true),
  ('b2f0a149-14a0-410a-8bf8-28564f7b60cc', 'Desarrollo', true),
  ('c5d72bc1-12c8-47bc-8a7e-128a192bfa77', 'RH', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tbldeliverytypes (id, strname, blnstatus) VALUES
  ('d29ab9f7-7b89-4089-a299-cf9b0cb617cf', 'Proyecto', true),
  ('e20c3a2a-43d9-482a-88cb-b09b0b4b2efc', 'Licencia', true),
  ('f22db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Asignacion', true),
  ('012db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Bolsa de Horas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tblicensings (id, strname, blnstatus) VALUES
  ('112db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'No Aplica', true),
  ('212db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Microsoft', true),
  ('312db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'IBM', true),
  ('412db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Qlik', true),
  ('512db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'Alteryx', true),
  ('612db2a2-4a08-410a-ba8c-b01b0b5b2efc', 'KNIME', true)
ON CONFLICT (id) DO NOTHING;

-- Agregar nuevas columnas UUID de clasificación a la tabla opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "linea_negocio_id" uuid NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "tipo_entrega_id" uuid NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS "licenciamiento_id" uuid NULL;

-- Mapear y migrar datos existentes de enums/varchars a llaves foráneas UUID
UPDATE opportunities SET "linea_negocio_id" = 'a8b6d804-94c9-4a0b-bc77-cfc8152e93db' WHERE "linea_negocio"::text = 'Datos';
UPDATE opportunities SET "linea_negocio_id" = 'b2f0a149-14a0-410a-8bf8-28564f7b60cc' WHERE "linea_negocio"::text = 'Desarrollo';
UPDATE opportunities SET "linea_negocio_id" = 'c5d72bc1-12c8-47bc-8a7e-128a192bfa77' WHERE "linea_negocio"::text = 'RH';

UPDATE opportunities SET "tipo_entrega_id" = 'd29ab9f7-7b89-4089-a299-cf9b0cb617cf' WHERE "tipo_entrega"::text = 'Proyecto';
UPDATE opportunities SET "tipo_entrega_id" = 'e20c3a2a-43d9-482a-88cb-b09b0b4b2efc' WHERE "tipo_entrega"::text = 'Licencia';
UPDATE opportunities SET "tipo_entrega_id" = 'f22db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "tipo_entrega"::text = 'Asignacion';
UPDATE opportunities SET "tipo_entrega_id" = '012db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "tipo_entrega"::text = 'Bolsa de Horas';

UPDATE opportunities SET "licenciamiento_id" = '112db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'No Aplica';
UPDATE opportunities SET "licenciamiento_id" = '212db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Microsoft';
UPDATE opportunities SET "licenciamiento_id" = '312db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'IBM';
UPDATE opportunities SET "licenciamiento_id" = '412db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Qlik';
UPDATE opportunities SET "licenciamiento_id" = '512db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'Alteryx';
UPDATE opportunities SET "licenciamiento_id" = '612db2a2-4a08-410a-ba8c-b01b0b5b2efc' WHERE "licenciamiento"::text = 'KNIME';

-- Eliminar columnas de tipo enum antiguas
ALTER TABLE opportunities DROP COLUMN IF EXISTS "linea_negocio";
ALTER TABLE opportunities DROP COLUMN IF EXISTS "tipo_entrega";
ALTER TABLE opportunities DROP COLUMN IF EXISTS "licenciamiento";

-- Agregar constraints de llaves foráneas a las nuevas columnas
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_linea_negocio FOREIGN KEY ("linea_negocio_id") REFERENCES tblbusinesslines(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_tipo_entrega FOREIGN KEY ("tipo_entrega_id") REFERENCES tbldeliverytypes(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_licenciamiento FOREIGN KEY ("licenciamiento_id") REFERENCES tblicensings(id) ON DELETE SET NULL;


-- Tabla tbloportunitylabels: agregar columna field_key para mapear campos personalizables
ALTER TABLE tbloportunitylabels ADD COLUMN IF NOT EXISTS field_key character varying(50) NULL;

-- Agregar constraint UNIQUE a field_key si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_tbloportunitylabels_field_key'
      OR (conname = 'tbloportunitylabels_field_key_key' AND conrelid = 'tbloportunitylabels'::regclass)
  ) THEN
    ALTER TABLE tbloportunitylabels
      ADD CONSTRAINT uq_tbloportunitylabels_field_key UNIQUE (field_key);
  END IF;
END $$;

-- Poblar tbloportunitylabels si está vacía
INSERT INTO tbloportunitylabels (id, strname, field_key, blnstatus, dtmlastmodified) VALUES
  ('f509fa84-0b73-45f8-b3ab-b8471e98822e', 'Línea de Negocio', 'linea_negocio', true, now()),
  ('7d90d810-74d3-4613-882d-8e814a029db5', 'Tipo de Entrega', 'tipo_entrega', true, now()),
  ('c6d3df39-53e7-40b9-8e2b-f1de16b5394f', 'Licenciamiento', 'licenciamiento', true, now())
ON CONFLICT (id) DO NOTHING;

-- Sincronizar field_key en registros existentes (si la tabla ya tenía datos pero con field_key nulo)
UPDATE tbloportunitylabels 
SET field_key = 'linea_negocio' 
WHERE field_key IS NULL 
  AND (id = 'f509fa84-0b73-45f8-b3ab-b8471e98822e' 
       OR lower(strname) LIKE '%negocio%' 
       OR lower(strname) LIKE '%linea%');

UPDATE tbloportunitylabels 
SET field_key = 'tipo_entrega' 
WHERE field_key IS NULL 
  AND (id = '7d90d810-74d3-4613-882d-8e814a029db5' 
       OR lower(strname) LIKE '%entrega%' 
       OR lower(strname) LIKE '%servicio%');

UPDATE tbloportunitylabels 
SET field_key = 'licenciamiento' 
WHERE field_key IS NULL 
  AND (id = 'c6d3df39-53e7-40b9-8e2b-f1de16b5394f' 
       OR lower(strname) LIKE '%licencia%');


-- =========================================================================
-- MÓDULO MESA DE AYUDA (TICKETS)
-- =========================================================================

-- 1. Tabla de Mesas de Ayuda
CREATE TABLE IF NOT EXISTS helpdesks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(255) NOT NULL,
  strdescription text NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  dtmcreated timestamp NOT NULL DEFAULT now(),
  dtmlastmodified timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_helpdesks PRIMARY KEY (id)
);

-- Poblar la mesa de ayuda principal por defecto
INSERT INTO helpdesks (id, strname, strdescription, blnstatus, dtmcreated, dtmlastmodified) VALUES
  ('a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 'Mesa de Ayuda Principal', 'Canal principal para soporte a clientes.', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. Tabla de Etapas de Tickets (Ticket Stages)
CREATE TABLE IF NOT EXISTS ticket_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  strname character varying(120) NOT NULL,
  blnstatus boolean NOT NULL DEFAULT true,
  helpdesk_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  strcolor character varying(20) NULL,
  blninitial boolean NOT NULL DEFAULT false,
  intmaxdays integer NULL,
  dtmcreated timestamp NOT NULL DEFAULT now(),
  dtmlastmodified timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_ticket_stages PRIMARY KEY (id),
  CONSTRAINT fk_ticket_stages_helpdesk FOREIGN KEY (helpdesk_id) REFERENCES helpdesks(id) ON DELETE CASCADE
);

-- Poblar etapas por defecto asociadas a la mesa de ayuda principal
INSERT INTO ticket_stages (id, strname, blnstatus, helpdesk_id, display_order, strcolor, blninitial, intmaxdays, dtmcreated, dtmlastmodified) VALUES
  ('a01df1e2-b00d-4a1e-8e81-cfc8152e93db', 'Nuevo',      true, 'a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 0, '#3b82f6', true,  NULL, now(), now()),
  ('a02df1e2-b00d-4a1e-8e81-cfc8152e93db', 'En Proceso', true, 'a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 1, '#fbbf24', false, NULL, now(), now()),
  ('a03df1e2-b00d-4a1e-8e81-cfc8152e93db', 'En Espera',  true, 'a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 2, '#9ca3af', false, NULL, now(), now()),
  ('a04df1e2-b00d-4a1e-8e81-cfc8152e93db', 'Resuelto',   true, 'a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 3, '#10b981', false, NULL, now(), now()),
  ('a05df1e2-b00d-4a1e-8e81-cfc8152e93db', 'Cancelado',  true, 'a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 4, '#ef4444', false, NULL, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Crear secuencia para numeración de tickets
CREATE SEQUENCE IF NOT EXISTS tickets_ticket_number_seq;

-- 3. Tabla de Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number integer DEFAULT nextval('tickets_ticket_number_seq'),
  strtitle character varying(255) NOT NULL,
  tipo_incidencia character varying(255) NOT NULL,
  description text NOT NULL,
  fecha_apertura timestamp NOT NULL DEFAULT now(),
  fecha_cierre timestamp NULL,
  notas_resolucion text NULL,
  priority integer NOT NULL DEFAULT 1,
  alert_sent boolean NOT NULL DEFAULT false,
  cliente_id uuid NULL,
  responsable_id uuid NULL,
  helpdesk_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  "contactName" character varying(255) NULL,
  "contactEmail" character varying(255) NULL,
  "contactPhone" character varying(255) NULL,
  stage_entered_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_tickets PRIMARY KEY (id),
  CONSTRAINT fk_tickets_client FOREIGN KEY (cliente_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_responsable FOREIGN KEY (responsable_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_helpdesk FOREIGN KEY (helpdesk_id) REFERENCES helpdesks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_stage FOREIGN KEY (stage_id) REFERENCES ticket_stages(id)
);

-- 4. Agregar campo de prioridad en oportunidades
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 1;

-- 5. Agregar campo archived en tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- =========================================================================
-- CONFIGURACIÓN DE CRON DE MESA DE AYUDA (2024-06-24)
-- =========================================================================

-- Tabla para almacenar la configuración del cron de notificaciones de tickets
-- sin asignar en etapa inicial. Relación 1:1 con helpdesks.
CREATE TABLE IF NOT EXISTS helpdesk_cron_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  helpdesk_id uuid NOT NULL,
  cron_mode character varying(20) NOT NULL DEFAULT 'fixed', -- 'fixed' | 'interval'
  cron_time character varying(5) NULL,          -- formato 'HH:MM' (solo para modo 'fixed')
  cron_interval_hours integer NULL,             -- horas del intervalo (modo 'interval')
  cron_interval_minutes integer NULL,           -- minutos del intervalo (modo 'interval')
  blnstatus boolean NOT NULL DEFAULT true,
  dtmcreated timestamp NOT NULL DEFAULT now(),
  dtmlastmodified timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pk_helpdesk_cron_config PRIMARY KEY (id),
  CONSTRAINT fk_helpdesk_cron_config_helpdesk FOREIGN KEY (helpdesk_id)
    REFERENCES helpdesks(id) ON DELETE CASCADE,
  CONSTRAINT uq_helpdesk_cron_config_helpdesk UNIQUE (helpdesk_id)
);

-- Insertar configuración por defecto (hora fija 08:00) para la mesa de ayuda principal
INSERT INTO helpdesk_cron_config (helpdesk_id, cron_mode, cron_time, cron_interval_hours, cron_interval_minutes, blnstatus)
VALUES ('a00df1e2-b00d-4a1e-8e81-cfc8152e93db', 'fixed', '08:00', NULL, NULL, true)
ON CONFLICT (helpdesk_id) DO NOTHING;

-- =========================================================================
-- HISTORIAL DE TICKETS DE MESA DE AYUDA (2026-06-25)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ticket_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  ticket_id uuid NOT NULL,
  CONSTRAINT pk_ticket_interactions PRIMARY KEY (id),
  CONSTRAINT fk_ticket_interactions_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- =========================================================================
-- RECORDATORIOS EN TIEMPO REAL (2026-06-29)
-- =========================================================================
-- Agregar columna notified a la tabla reminders si no existe
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS notified boolean NOT NULL DEFAULT false;

-- =========================================================================
-- ACTUALIZACIÓN CATÁLOGO DE PRODUCTOS (S&S / Billy Sales & Service) (2026-07-27)
-- =========================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS "unidadMedida" text NOT NULL DEFAULT 'Pieza';
ALTER TABLE products ADD COLUMN IF NOT EXISTS "observaciones" text NULL;
ALTER TABLE products DROP COLUMN IF EXISTS "requiere_analisis";


