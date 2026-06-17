-- Agregar columna intmaxdays a la tabla tblstagescatalog si no existe
ALTER TABLE tblstagescatalog ADD COLUMN IF NOT EXISTS intmaxdays integer;

-- Agregar columna stage_entered_at a la tabla opportunities si no existe
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_entered_at timestamp;
