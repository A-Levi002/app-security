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
├── backend/                 # BACKEND — Edge Functions (supabase/), BD (database/) y contratos (functions/)
└── secure_os/               # prototipo web de referencia (Vite, fuera del build)
```

| Capa | Ubicación | Estado |
| --- | --- | --- |
| Frontend | `src/` | Implementado (flujo completo: boot → setup → login → permisos → home) |
| Base de datos | `backend/database/` | Esquema + migraciones listos (RLS, triggers, vistas, auditoría) |
| Backend Edge Functions | `backend/supabase/functions/` | **7 funciones implementadas** (LangChain + Gemini) |
| Backend (contratos) | `backend/functions/` | Referencia de contratos para despacho, sos, notify, iot-ingest |

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
Ver `backend/database/README.md` para detalles.

## Backend

Todo el muta de datos del flujo ciudadano pasa por **Edge Functions**
(`backend/supabase/functions/`): reports, profile, contacts, settings,
notifications y las dos de IA (`analyze-incident`, `ai-respond`, ambas con
**LangChain** → Gemini). El frontend (`src/lib/db.ts`) es un cliente fino
que solo invoca funciones; ya no accede a tablas.

- La clave de Gemini va en **Secrets** de Supabase (`GEMINI_API_KEY`), nunca
  en el cliente.
- Despliegue: `npm run deploy:all` (requiere `npx supabase login`). Ver
  `backend/README.md` para el checklist.
- Los demás flujos institucionales (despacho, push, SOS, IoT) siguen
  **simulados en el frontend** para la demo (contratos en `backend/functions/`).

## Documentación aplicable

- Supabase: https://supabase.com/docs
- Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/