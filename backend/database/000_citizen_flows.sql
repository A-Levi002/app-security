-- ===========================================================================
-- SECURE_OS / Alert.IA — Flujos ciudadano (idempotente)
-- ---------------------------------------------------------------------------
-- Este archivo NO reinventa el esquema: asume `secure_os_supabase_schema.sql`
-- (tablas existentes) y añade únicamente lo que el flujo ciudadano de la app
-- (Edge Functions + cliente fino) necesita, de forma re-ejecutable:
--   1. Sincroniza los catálogos por nombre (8 tipos, 4 severidades, estados).
--   2. Garantiza columnas del ciudadano (contactos/avatar, settings en
--      `configuracion_usuario`, notificaciones con estado).
--   3. Asegura políticas RLS de LECTURA del ciudadano sobre su información.
--      (Las escrituras las hace el server con service_role, que ignora RLS.)
--   4. Re-sincroniza secuencias SERIAL (IDs explícitos de INSERTs previos).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGOS — seed por nombre (ídem a `_shared/catalog.ts`)
-- ---------------------------------------------------------------------------

INSERT INTO public.tipos_emergencia (nombre, descripcion) VALUES
    ('Accidente de Tránsito', 'Colisión o incidente vehicular en vía pública'),
    ('Incendio', 'Conato o incendio activo en estructura o terreno'),
    ('Emergencia Médica', 'Asistencia médica de urgencia para una persona'),
    ('Robo', 'Robo, asalto o hurto en curso'),
    ('Persona Sospechosa', 'Merodeo, acecho o conducta anómala'),
    ('Violencia', 'Conflicto físico o agresión en curso'),
    ('Vandalismo', 'Daños a propiedad o vía pública'),
    ('Otro', 'Situación imprevista de seguridad')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.niveles_gravedad (nombre, prioridad_numerica) VALUES
    ('baja', 1),
    ('media', 2),
    ('alta', 3),
    ('critica', 4)
ON CONFLICT (prioridad_numerica) DO NOTHING;

INSERT INTO public.estados_reporte (id_estado_reporte, nombre) VALUES
    (1, 'recibido'),
    (2, 'en_proceso'),
    (3, 'resuelto'),
    (4, 'cerrado')
ON CONFLICT (id_estado_reporte) DO NOTHING;

-- Re-sincroniza secuencias tras IDs explícitos.
SELECT setval('public.tipos_emergencia_id_tipo_emergencia_seq', GREATEST((SELECT COALESCE(MAX(id_tipo_emergencia),1) FROM public.tipos_emergencia), 1));
SELECT setval('public.niveles_gravedad_id_nivel_gravedad_seq', GREATEST((SELECT COALESCE(MAX(id_nivel_gravedad),1) FROM public.niveles_gravedad), 1));
SELECT setval('public.estados_reporte_id_estado_reporte_seq', GREATEST((SELECT COALESCE(MAX(id_estado_reporte),1) FROM public.estados_reporte), 1));

-- ---------------------------------------------------------------------------
-- 2. COLUMNAS DEL CIUDADANO (solo si faltan; nunca las reinventa)
-- ---------------------------------------------------------------------------

ALTER TABLE public.contactos_confianza
    ADD COLUMN IF NOT EXISTS id_externo VARCHAR(50),
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

ALTER TABLE public.configuracion_usuario
    ADD COLUMN IF NOT EXISTS idioma VARCHAR(20) DEFAULT 'es';

ALTER TABLE public.reportes_emergencia
    ADD COLUMN IF NOT EXISTS descripcion TEXT;

ALTER TABLE public.notificaciones
    ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'push';

-- ---------------------------------------------------------------------------
-- 3. RLS — lectura del ciudadano sobre su propia información
--    (DROP+CREATE con nombre propio: no toca las políticas originales)
-- ---------------------------------------------------------------------------

ALTER TABLE public.reportes_emergencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contactos_confianza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_citizen_select_reports" ON public.reportes_emergencia;
CREATE POLICY "app_citizen_select_reports" ON public.reportes_emergencia
  FOR SELECT USING (id_usuario = auth.uid());

DROP POLICY IF EXISTS "app_citizen_select_ubicaciones" ON public.ubicaciones;
CREATE POLICY "app_citizen_select_ubicaciones" ON public.ubicaciones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reportes_emergencia re
      WHERE re.id_ubicacion = ubicaciones.id_ubicacion AND re.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "app_citizen_select_contactos" ON public.contactos_confianza;
CREATE POLICY "app_citizen_select_contactos" ON public.contactos_confianza
  FOR SELECT USING (id_usuario = auth.uid());

DROP POLICY IF EXISTS "app_citizen_select_config" ON public.configuracion_usuario;
CREATE POLICY "app_citizen_select_config" ON public.configuracion_usuario
  FOR SELECT USING (id_usuario = auth.uid());

DROP POLICY IF EXISTS "app_citizen_select_analisis" ON public.analisis_ia;
CREATE POLICY "app_citizen_select_analisis" ON public.analisis_ia
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reportes_emergencia re
      WHERE re.id_reporte = analisis_ia.id_reporte AND re.id_usuario = auth.uid()
    )
  );

DROP POLICY IF EXISTS "app_citizen_select_notificaciones" ON public.notificaciones;
CREATE POLICY "app_citizen_select_notificaciones" ON public.notificaciones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reportes_emergencia re
      WHERE re.id_reporte = notificaciones.id_reporte AND re.id_usuario = auth.uid()
    )
  );

COMMIT;