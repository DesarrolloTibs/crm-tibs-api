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
