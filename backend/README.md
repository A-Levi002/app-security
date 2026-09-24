# SECURE_OS / Alert.IA — Backend (guía de arquitectura)

> **Este directorio es la base de trabajo para el equipo de backend.**
> Los **flujos ciudadano** (reportes, perfil, contactos, configuración,
> notificaciones e IA del chat) ya viven en Edge Functions reales
> (`backend/supabase/functions/`). Los flujos **institucionales** (despacho,
> push, SOS, IoT) siguen simulados en el cliente para la demo; esta guía indica
> qué parte debe vivir en cada lado y qué le toca construir al backend.

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
- **Backend** → Edge Functions en `backend/supabase/functions/` (Deno/TypeScript) + RPC
  de Postgres + cron. Es el único que puede usar credenciales privilegiadas.
- **Base de datos** → `backend/database/` (esquema + migración ya implementados).

## Qué está hecho y qué queda para backend

| Área | Hoy (frontend) | Lo que debe hacer el backend |
| --- | --- | --- |
| **Auth / perfil** | `/login` Google (supabase.auth) + **Edge Function `profile`** | Registro/verificación ya via Supabase Auth. Perfil extendido, avatar/banner a Storage. |
| **Catálogos** | Se resuelven en el servidor (`reports`/`analyze-incident` leen `tipos_emergencia`, `niveles_gravedad`, `estados_reporte`) | Nada: el cliente ya no consulta catálogos. |
| **Reportes** | Cliente fino en `src/lib/db.ts` → **Edge Function `reports`** (CRUD + `ubicaciones`) | Listo. |
| **Contactos** | Cliente fino → **Edge Function `contacts`** (CRUD por `id_externo`) | Listo. |
| **Configuración** | Cliente fino → **Edge Function `settings`** | Listo. |
| **IA (clasificación + chat)** | `src/lib/ai.ts` → **Edge Functions `analyze-incident` y `ai-respond`** (LangChain → Gemini). Fallback local si no responde | Listo. |
| **Despacho de unidades** | **SIMULADO** en `HomeScreen.tsx` / `AIEmergencyChatModal` (timeline fija) | Edge Function `dispatch`: asigna `recursos` →`asignaciones_recursos` + `notificaciones` + push a la institución. Transmite avances por **Realtime**. |
| **Notificaciones ciudadano** | Cliente fino → **Edge Function `notifications`** | Listo (registro/lectura). Push a contactos/instituciones queda en `notify`. |
| **Notificaciones push** | Solo pide permiso en `PermissionsModal.tsx` | Edge Function `notify` (FCM/Expo): contactos en SOS, confirmación de despacho, alertas. Registro de `token_dispositivo` en `sesiones_usuario`. |
| **SOS / alerta** | UI en `TacticalCallModal.tsx` + `HomeScreen` | Edge Function `sos`: crea `llamadas_sos`, notifica contactos (`contactos_confianza`), ubica la unidad más cercana. |
| **Live GPS** | `LiveTrackingScreen.tsx` (posición local) | Publicar posición a Realtime (tabla `historial_ubicaciones_recurso`) + ubicación ciudadana en `reportes` cuando hay emergencia activa. |
| **Evidencia (foto/video/audio)** | URIs locales (`expo-image-picker`, `expo-audio`) | Subir a **Storage** (`archivos_multimedia`) vía Edge Function o bucket público con RLS; entregar URL firmada. |
| **IoT (sensores ESP32)** | Nada en app | Ingesta `eventos_sensor` + `dispositivos_iot`. Webhook/mensaje desde broker MQTT → Edge Function. |
| **Auditoría / KPIs** | Nada en app | Ya en DB (triggers + `vw_indicadores_kpi`). Dashboard institucional lo consume. |
| **Cron** | Nada | `fn_purgar_historial_ubicaciones()` ya existe; agendarlo en Supabase (Database → Cron). |

## Estructura

```
backend/supabase/
├── config.toml            # Configuración del proyecto Supabase (CLI)
└── functions/             # EDGE FUNCTIONS (Deno/TS)
    ├── _shared/           # Módulos compartidos (cors, client, catalog, ai) — no se despliega
    ├── analyze-incident/  # ✅ IMPLEMENTADA — IA: clasificar severidad/tipo (Gemini/LangChain)
    ├── ai-respond/        # ✅ IMPLEMENTADA — IA: chat conversacional de seguimiento
    ├── reports/           # ✅ IMPLEMENTADA — CRUD de reportes + ubicaciones del ciudadano
    ├── profile/           # ✅ IMPLEMENTADA — perfil del ciudadano (usuarios)
    ├── contacts/          # ✅ IMPLEMENTADA — contactos de confianza (CRUD)
    ├── settings/          # ✅ IMPLEMENTADA — configuración del ciudadano
    ├── notifications/     # ✅ IMPLEMENTADA — registro/lectura de notificaciones
    ├── dispatch/          # Pendiente — Asignar recursos a un reporte + push
    ├── notify/            # Pendiente — Push a contactos/instituciones (FCM/Expo)
    ├── sos/               # Pendiente — Generar llamada SOS + notificar red de confianza
    └── iot-ingest/        # Pendiente — Webhook de sensores ESP32 → eventos_sensor
```

- Las 7 funciones del flujo ciudadano tienen código real (`index.ts` + `deno.json`).
- `dispatch/`, `notify/`, `sos/`, `iot-ingest/` contienen **contratos** (specs
  `README.md`) en `backend/functions/<nombre>/README.md`; su `index.ts` aún no está
  implementado a propósito — el equipo de backend los desarrolla.

## Reglas de oro

1. **El cliente nunca usa `service_role`**. Toda operación privilegiada pasa por
   Edge Function autenticada (`auth.uid()`); las escrituras del server chequean
   explícitamente el uid del JWT.
2. **Secretos** (Gemini API key, FCM server key, SMTP) viven en
   **Secrets** de Supabase Edge Functions, jamás en `.env` del cliente.
3. **Supabase Auth** es la única puerta de identidad; las funciones usan el JWT
   del usuario para autorizar.
4. El contrato con la app son los **tipos de `src/types.ts`** y las funciones de
   `src/lib/db.ts` / `src/lib/ai.ts`: si cambia una tabla o un campo, cambiar ambos lados.

## Comandos útiles

```bash
# Desplegar TODAS las funciones del flujo ciudadano (analyze-incident + 6 más)
npm run deploy:all
# Solo la IA del chat (clasificación)
npm run deploy:ia

# Vincular el proyecto (una vez)
npx supabase login
npx supabase --workdir backend link --project-ref lbofnnfihrdubcqdplcm
```

## Checklist de puesta en producción

1. `npx supabase login` (o variable `SUPABASE_ACCESS_TOKEN`).
2. Aplicar SQL en el SQL Editor: `backend/database/secure_os_supabase_schema.sql`
   (si no está aplicado) y luego `backend/database/000_citizen_flows.sql`.
3. **Secrets** (Supabase → Edge Functions): `GEMINI_API_KEY` (obligatorio para la IA).
4. `npm run deploy:all` (o `npx supabase --workdir backend functions deploy <fn>`).
5. Enviar el template de email: `npx supabase --workdir backend config push`.

## Email de confirmación personalizado

La plantilla del correo de "confirmar cuenta" (`backend/database/supabase_email_confirmacion.html`)
se versiona en `backend/supabase/config.toml` bajo `[auth.email.template.confirmation]`.
Para que Supabase use ese diseño:

```bash
npx supabase --workdir backend link --project-ref lbofnnfihrdubcqdplcm
npx supabase --workdir backend config push
```

> Nota: si `config push` reporta un problema de ruta (hay un bug conocido de la CLI
> que puede duplicar `supabase/supabase/...`), probar con una **ruta absoluta** al
> HTML. La plantilla usa la variable `{{ .ConfirmationURL }}`.

## Ver también

- `backend/database/README.md` → esquema, migración y cómo aplicar.
- `README.md` (raíz) → cómo levantar la app y probar el frontend.
- `secure_os/` → prototipo web de referencia (Vite, no es el producto final).