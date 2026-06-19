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


