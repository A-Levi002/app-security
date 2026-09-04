# SECURE_OS / Alert.IA

Sistema de alerta y respuesta táctica: **botón SOS**, análisis de incidentes con
IA, despacho de unidades, registro y seguimiento de emergencias. Aplicación
móvil **Expo / React Native** (SDK 57), backend en **Supabase**.

## Estructura del proyecto

```
├── src/                     # FRONTEND — app móvil (Expo Router)
│   ├── app/                 # entradas de expo-router (index, _layout)
│   ├── screens/             # pantallas (Home, History, Profile, Settings, Login…)
│   ├── components/          # componentes y modales reutilizables
│   ├── lib/                 # supabase.ts (cliente), db.ts (capa de datos) y ai.ts
│   ├── data/                # datos semilla y avatares
│   ├── hooks/               # persistencia local (AsyncStorage)
│   └── types.ts             # modelo de dominio compartido
├── database/                # BD — esquema Supabase + migración (ver README)
├── supabase/functions/      # EDGE FUNCTIONS — implementadas (analyze-incident)
├── backend/                 # BACKEND — guía + contratos de funciones pendientes
└── secure_os/               # prototipo web de referencia (Vite, fuera del build)
```

| Capa | Ubicación | Estado |
| --- | --- | --- |
| Frontend | `src/` | Implementado (flujo completo: boot → setup → login → permisos → home) |
| Base de datos | `database/` | Esquema + migración listos (RLS, triggers, vistas, auditoría) |
| Backend (IA chat) | `supabase/functions/analyze-incident/` | **Implementada** (Gemini) |
| Backend (resto) | `backend/` | Guía/contratos — dispatch, sos, notify, iot-ingest pendientes |

## Cómo correr el frontend

```bash
npm install
cp .env.example .env   # pega EXPO_PUBLIC_SUPABASE_URL y ..._ANON_KEY
npx expo start
```

También: `npm run android` (build nativo, necesario para expo-audio),
`npm run lint` y `npx tsc --noEmit`.

## Base de datos

Aplica el esquema y la migración en el SQL Editor de Supabase, en ese orden.
Ver `database/README.md` para detalles.

## Backend

- La **IA del chat** está implementada: `supabase/functions/analyze-incident/`
  (Edge Function que clasifica el incidente con Gemini y escribe en
  `analisis_ia` / `reportes_emergencia`). La clave de Gemini va en **Secrets**
  de Supabase (nunca en el cliente). Ver su `README.md`.
- Los demás flujos (despacho, push, SOS, IoT) siguen **simulados en el
  frontend** para la demo. El equipo de backend los implementa según los
  contratos en `backend/functions/*/README.md` y el mapa de responsabilidades
  en `backend/README.md`.

## Documentación aplicable

- Supabase: https://supabase.com/docs
- Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/