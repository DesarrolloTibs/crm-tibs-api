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

