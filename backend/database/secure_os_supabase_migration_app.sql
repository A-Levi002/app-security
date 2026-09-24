-- =========================================================
-- SECURE_OS / Alert.IA — MIGRACIÓN para la app móvil (RN)
-- Aplica agregando las columnas que el cliente usa (usuarios,
-- reportes, contactos y configuración). Es idempotente: puedes
-- ejecutarlo en el SQL editor de Supabase todas las veces que quieras.
-- =========================================================

-- Perfil extendido en usuarios (app móvil)
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS grupo_sanguineo VARCHAR(10),
    ADD COLUMN IF NOT EXISTS alergias VARCHAR(255),
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS banner_url VARCHAR(500);

-- Datos extra del reporte táctico (app móvil)
ALTER TABLE public.reportes_emergencia
    ADD COLUMN IF NOT EXISTS datos_extra JSONB;

-- Contactos: id estable del cliente + avatar
ALTER TABLE public.contactos_confianza
    ADD COLUMN IF NOT EXISTS id_externo VARCHAR(50),
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

-- Configuración: ajustes completos como JSON
ALTER TABLE public.configuracion_usuario
    ADD COLUMN IF NOT EXISTS datos_extra JSONB;

-- Índice para buscar reportes por el id local de la app (#REP-XXXX)
CREATE INDEX IF NOT EXISTS idx_reportes_local_id
    ON public.reportes_emergencia ((datos_extra ->> 'id'));

-- Policy DELETE que faltaba (la app elimina reportes propios)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'reportes_emergencia'
          AND policyname = 'reportes_eliminar_propio'
    ) THEN
        CREATE POLICY reportes_eliminar_propio ON public.reportes_emergencia
            FOR DELETE
            USING (id_usuario = auth.uid());
    END IF;
END $$;
