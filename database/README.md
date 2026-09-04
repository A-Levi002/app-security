# Base de datos — SECURE_OS / Alert.IA

La base de datos vive en **Supabase (PostgreSQL)**. Este directorio contiene el
esquema completo y la migración que la app móvil consume.

## Archivos

| Archivo | Qué es | Cuándo se aplica |
| --- | --- | --- |
| `secure_os_supabase_schema.sql` | Esquema completo: tablas, catálogos, triggers, funciones, vistas, RLS y auditoría | **Una sola vez**, en un proyecto vacío |
| `secure_os_supabase_migration_app.sql` | Columnas y políticas extra que usa el cliente móvil (React Native) | **Después** del esquema, es idempotente |

## Cómo aplicar

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta `secure_os_supabase_schema.sql`.
3. Pega y ejecuta `secure_os_supabase_migration_app.sql` (puedes correrlo todas
   las veces que quieras).
4. Copia `.env.example` a `.env` y pega tus credenciales
   (`EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

> El esquema asume **Supabase Auth** (`auth.users`). Los usuarios se registran
> con la API de autenticación de Supabase y el trigger
> `trg_on_auth_user_created` crea automáticamente su fila en `usuarios`.
> Google OAuth se habilita desde **Authentication → Providers**.

## Contenido del esquema

- **Perfiles**: `usuarios` (1:1 con `auth.users`), `roles`.
- **Catálogos**: `tipos_emergencia`, `niveles_gravedad`, `estados_reporte`,
  `estados_recurso`, `estados_asignacion`.
- **Incidentes**: `reportes_emergencia` (con `datos_extra` JSONB para los
  campos propios de la app), `historial_estados_reporte`,
  `archivos_multimedia`, `analisis_ia`.
- **Instituciones y despacho**: `instituciones`, `personal_institucional`,
  `recursos`, `historial_ubicaciones_recurso`, `asignaciones_recursos`.
- **IoT**: `dispositivos_iot`, `eventos_sensor`.
- **SOS y notificación**: `llamadas_sos`, `preguntas_triage_llamada`,
  `lineas_institucion`, `notificaciones`, `contactos_confianza`,
  `configuracion_usuario`, `sesiones_usuario`.
- **Auditoría**: `auditoria_seguridad` + triggers `fn_auditoria_generica`.

## Seguridad (RLS)

Regla general del esquema: **sin política, sin acceso**.

- Catálogos y datos públicos: solo lectura para cualquier rol autenticado.
- `usuarios`, `configuracion_usuario`, `contactos_confianza`,
  `sesiones_usuario`, `llamadas_sos`: solo sobre filas propias
  (`auth.uid()`).
- `reportes_emergencia`: el ciudadano gestiona los suyos; la institución
  asignada lee y actualiza el estado de los que le corresponden
  (`fn_institucion_actual()` / `fn_reporte_visible()`).
- `recursos` y `asignaciones_recursos`: por institución.
- `auditoria_seguridad`: sin políticas (solo la escriben los triggers
  `SECURITY DEFINER`).

## Vista y mantenimiento

- `vw_indicadores_kpi`: tiempos de respuesta/resolución por reporte.
- `vw_reportes_publicos`: agregación pública no sensible.
- `fn_purgar_historial_ubicaciones()`: borra tracking de recursos mayor a 90
  días. En Supabase se agenda con **Database → Cron Jobs** (pg_cron).

## Cómo lo consume el frontend

Ver `src/lib/db.ts` en la raíz del repo. Traduce el modelo de la app
(`src/types.ts`) a estas tablas usando los catálogos como puente.