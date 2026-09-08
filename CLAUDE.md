@AGENTS.md

# Extensión de contexto — SECURE_OS

Este archivo complementa `AGENTS.md` (que sigue siendo la fuente de verdad).

## Stack

- **App**: Expo SDK 57 / React Native, expo-router, TypeScript estricto.
  - Pantallas en `src/screens/`, componentes/modales en `src/components/`.
  - Capa IA: `src/lib/ai.ts` → Edge Function `analyze-incident` (con fallback local).
  - Capa datos: `src/lib/db.ts`, cliente `src/lib/supabase.ts` (PKCE).
- **Backend**: Supabase. Edge Functions en `backend/supabase/functions/` (Deno/TS).
  Solo `analyze-incident` está implementada; el resto son contratos en `backend/functions/`.

## Convenciones

- Config en `app.config.js` (inyecta la Maps key y projectId EAS); ya no hay `app.json`.
- La config del proyecto Supabase vive en `backend/supabase/config.toml`; los
  comandos `supabase functions deploy|link|config push` se corren con `--workdir backend`.
- `.env` gitignored; la clave de Gemini y credenciales van en **Secrets** de
  Supabase, nunca en el cliente.
- No commitees credenciales. `secure_os/` (referencia web) no se modifica.

## Verificación

```bash
npx tsc --noEmit    # tipo de la app
deno check --allow-import ... backend/supabase/functions/analyze-incident/index.ts  # Edge Function
npx expo lint
npx expo export --platform android   # bundle
```
