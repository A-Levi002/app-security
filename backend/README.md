# SECURE_OS / Alert.IA — Backend (guía de arquitectura)

> **Este directorio es la base de trabajo para el equipo de backend.**
> Hoy la app móvil (`. /`→ `src/`) funciona en **modo de demostración**: varios
> flujos críticos están simulados en el cliente para poder presentar la UX.
> Esta guía deja indicado **qué parte debe vivir en cada lado** y **qué le toca
> construir al backend** para llevarlos a producción.

## Arquitectura objetivo

```
┌─────────────────────┐        ┌─────────────────────────────────────────┐
│  FRONTEND (app RN)  │        │  SUPABASE (BaaS — ya configurado)       │
│  src/ en la raíz    │        │  Auth · Postgres · Storage · Realtime   │
│                     │        └───────────────────┬─────────────────────┘
│  Expo / React Native│                            │ RLS (por tabla)
│  expo-router        │                            ▼
└────────┬────────────┘       ┌─────────────────────────────────────────┐
         │ Supabase client    │  EDGE FUNCTIONS (backend propio)        │
         │ (anon key + RLS)   │  IA · despacho · push · SOS · IoT       │
         └────────────────────┼─────────────────────────────────────────┤
                              │  CRON (pg_cron): purgado, TTL, KPIs      │
                              └─────────────────────────────────────────┘
```

- **Frontend** → habla con Supabase directo vía anon key + **RLS** (nunca usa la
  service_role key). Para IA, push, despacho y flujos institucionales llama a
  Edge Functions.
- **Backend** → Edge Functions en `supabase/functions/` (Deno/TypeScript) + RPC
  de Postgres + cron. Es el único que puede usar credenciales privilegiadas.
- **Base de datos** → `database/` (esquema + migración ya implementados).

## Qué está hecho y qué queda para backend

| Área | Hoy (frontend) | Lo que debe hacer el backend |
| --- | --- | --- |
| **Auth / perfil** | `/login` Google (supabase.auth) + `src/lib/db.ts` (usuarios) | Registro/verificación ya via Supabase Auth. Perfil extendido, avatar/banner a Storage. |
| **Catálogos** | `db.ts::loadCatalogs()` (SELECT a tablas) | Nada: se lee directo con RLS (ya funcional). |
| **Reportes** | `db.ts::saveReport/fetchReports` (INSERT/UPDATE con RLS) | Funciona ya. Opcional: validar `datos_extra` con un RPC. |
| **IA (clasificación)** | **Implementada** vía `src/lib/ai.ts` → Edge Function `analyze-incident` (Gemini): recibe contexto/audio/foto → `analisis_ia` + `reportes_emergencia`. | Listo. Fallback local en cliente si la función no responde. |
| **Despacho de unidades** | **SIMULADO** en `HomeScreen.tsx` / `AIEmergencyChatModal` (timeline fija: recibido→clasificado→asignado→en_ruta→resuelto) | Edge Function `dispatch`: asigna `recursos` →`asignaciones_recursos` + `notificaciones` + push a la institución. Transmite avances por **Realtime**. |
| **Notificaciones push** | Solo pide permiso en `PermissionsModal.tsx` | Edge Function `notify` (FCM/Expo): contactos en SOS, confirmación de despacho, alertas. Registro de `token_dispositivo` en `sesiones_usuario`. |
| **SOS / alerta** | UI en `TacticalCallModal.tsx` + `HomeScreen` | Edge Function `sos`: crea `llamadas_sos`, notifica contactos (`contactos_confianza`), ubica la unidad más cercana. |
| **Live GPS** | `LiveTrackingScreen.tsx` (posición local) | Publicar posición a Realtime (tabla `historial_ubicaciones_recurso`) + ubicación ciudadana en `reportes` cuando hay emergencia activa. |
| **Evidencia (foto/video/audio)** | URIs locales (`expo-image-picker`, `expo-audio`) | Subir a **Storage** (`archivos_multimedia`) vía Edge Function o bucket público con RLS; entregar URL firmada. |
| **IoT (sensores ESP32)** | Nada en app | Ingesta `eventos_sensor` + `dispositivos_iot`. Webhook/mensaje desde broker MQTT → Edge Function. |
| **Auditoría / KPIs** | Nada en app | Ya en DB (triggers + `vw_indicadores_kpi`). Dashboard institucional lo consume. |
| **Cron** | Nada | `fn_purgar_historial_ubicaciones()` ya existe; agendarlo en Supabase (Database → Cron). |

## Estructura

```
supabase/functions/
├── analyze-incident/     # ✅ IMPLEMENTADA — IA: clasificar severidad/tipo (Gemini)
├── dispatch/             # Pendiente — Asignar recursos a un reporte + push
├── notify/               # Pendiente — Push a contactos/instituciones (FCM/Expo)
├── sos/                  # Pendiente — Generar llamada SOS + notificar red de confianza
└── iot-ingest/           # Pendiente — Webhook de sensores ESP32 → eventos_sensor
```

- `analyze-incident/` es la única con código real (`index.ts` + `README.md`).
- Las carpetas restantes contienen solo su `README.md` con el contrato esperado
  (endpoint, inputs, outputs, tablas); el `index.ts` aún no está implementado a
  propósito — el equipo de backend los desarrolla.

## Reglas de oro

1. **El cliente nunca usa `service_role`**. RLS protege todo; cualquier operación
   privilegiada pasa por Edge Function autenticada (`auth.uid()`).
2. **Secretos** (Gemini API key, FCM server key, SMTP) viven en
   **Secrets** de Supabase Edge Functions, jamás en `.env` del cliente.
3. **Supabase Auth** es la única puerta de identidad; las funciones usan el JWT
   del usuario para autorizar.
4. El contrato con la app son los **tipos de `src/types.ts`** y las funciones de
   `src/lib/db.ts`: si cambia una tabla o un campo, cambiar ambos lados.

## Comandos útiles

```bash
# Subir funciones de ejemplo (cuando existan)
npx supabase functions deploy analyze-incident

# Vincular el proyecto (una vez)
npx supabase login
npx supabase link --project-ref <ref>
```

## Email de confirmación personalizado

La plantilla del correo de "confirmar cuenta" (`database/supabase_email_confirmacion.html`)
se versiona en `supabase/config.toml` bajo `[auth.email.template.confirmation]`.
Para que Supabase use ese diseño:

```bash
npx supabase link --project-ref lbofnnfihrdubcqdplcm
npx supabase config push
```

> Nota: si `config push` reporta un problema de ruta (hay un bug conocido de la CLI
> que puede duplicar `supabase/supabase/...`), probar con una **ruta absoluta** al
> HTML. La plantilla usa la variable `{{ .ConfirmationURL }}`.

## Ver también

- `database/README.md` → esquema, migración y cómo aplicar.
- `README.md` (raíz) → cómo levantar la app y probar el frontend.
- `secure_os/` → prototipo web de referencia (Vite, no es el producto final).