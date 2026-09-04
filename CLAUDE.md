@AGENTS.md

# Extensión de contexto — SECURE_OS

Este archivo complementa `AGENTS.md` (que sigue siendo la fuente de verdad).

## Stack

- **App**: Expo SDK 57 / React Native, expo-router, TypeScript estricto.
  - Pantallas en `src/screens/`, componentes/modales en `src/components/`.
  - Capa IA: `src/lib/ai.ts` → Edge Function `analyze-incident` (con fallback local).
  - Capa datos: `src/lib/db.ts`, cliente `src/lib/supabase.ts` (PKCE).
- **Backend**: Supabase. Edge Functions en `supabase/functions/` (Deno/TS).
  Solo `analyze-incident` está implementada; el resto son contratos en `backend/`.

## Convenciones

- Config en `app.json` + `app.config.js` (inyecta la Maps key y projectId EAS).
- `.env` gitignored; la clave de Gemini y credenciales van en **Secrets** de
  Supabase, nunca en el cliente.
- No commitees credenciales. `secure_os/` (referencia web) no se modifica.

## Verificación

```bash
npx tsc --noEmit    # tipo de la app
deno check --allow-import ... supabase/functions/analyze-incident/index.ts  # Edge Function
npx expo lint
npx expo export --platform android   # bundle
```
