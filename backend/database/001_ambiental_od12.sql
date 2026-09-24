-- ===========================================================================
-- SECURE_OS / Alert.IA — ODS 12: incidentes ambientales (idempotente)
-- ---------------------------------------------------------------------------
-- Añade la categoría "Ambiental / Materiales peligrosos" al flujo ciudadano:
--   1. Columnas `categoria` y `subtipo_ambiental` en `reportes_emergencia`
--      (los reportes existentes quedan con categoria = 'general').
--      El valor también viaja duplicado en `datos_extra` (JSONB), que es lo
--      que las Edge Functions ya leen/escriben; las columnas permiten
--      consultas/filtros SQL directos y estadísticas.
--   2. Tipo de emergencia "Incidente Ambiental" en `tipos_emergencia`
--      (mapea la clave `ambiental` de `_shared/catalog.ts`).
--   3. Comentario sobre los subtipos válidos (documentación en BD).
-- Re-ejecutable: todo es IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columnas de categoría ambiental en la tabla de reportes
-- ---------------------------------------------------------------------------

ALTER TABLE public.reportes_emergencia
    ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'general';

ALTER TABLE public.reportes_emergencia
    ADD COLUMN IF NOT EXISTS subtipo_ambiental TEXT;

-- Los reportes existentes quedan con categoria = 'general' (DEFAULT).
-- Reportes previos ya ambiental (creados entre despliegues) se normalizan:
UPDATE public.reportes_emergencia
SET categoria = 'ambiental'
WHERE categoria IS NULL
  AND datos_extra->>'category' = 'ambiental';

UPDATE public.reportes_emergencia
SET subtipo_ambiental = datos_extra->>'subtipoAmbiental'
WHERE subtipo_ambiental IS NULL
  AND datos_extra->>'subtipoAmbiental' IS NOT NULL;

-- Índice para filtrar/contar ambientales rápido (panel de estadísticas).
CREATE INDEX IF NOT EXISTS idx_reportes_categoria
    ON public.reportes_emergencia (categoria);

-- ---------------------------------------------------------------------------
-- 2. Catálogo: tipo de emergencia para la categoría ambiental
-- ---------------------------------------------------------------------------

INSERT INTO public.tipos_emergencia (nombre, descripcion) VALUES
    ('Incidente Ambiental', 'ODS 12: derrame químico, fuga de gas, quema de residuos, botadero ilegal o contaminación de agua o suelo')
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Documentación de subtipos válidos (CHECK opcional comentado: la
--    validación fuerte vive en `_shared/catalog.ts`; los valores llegan de
--    la app ya validada y quiero tolerar histórico/parcial).
--    Subtipos válidos:
--      derrame_quimico | fuga_gas | quema_residuos | botadero_ilegal |
--      contaminacion_agua_suelo
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.reportes_emergencia.categoria IS
    'ODS 12: ''general'' (seguridad ciudadana) o ''ambiental'' (materiales peligrosos/residuos).';

COMMENT ON COLUMN public.reportes_emergencia.subtipo_ambiental IS
    'Solo si categoria=''ambiental'': derrame_quimico|fuga_gas|quema_residuos|botadero_ilegal|contaminacion_agua_suelo.';

COMMIT;
