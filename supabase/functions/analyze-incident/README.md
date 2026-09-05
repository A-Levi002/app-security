# Edge Function: analyze-incident

Clasifica un incidente de emergencia con **Gemini** (multimodal: texto + foto
inline) y escribe el resultado en la BD.

## Código de la función

El código real está en `supabase/functions/analyze-incident/index.ts` (Deno/TS).
Este es el archivo que se despliega, no un esqueleto.

- **Ruta nativa de Gemini**: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`
  Se usa la ruta **nativa** porque las claves Auth nuevas (prefijo `AQ.`) no
  funcionan por rutas OpenAI-compatible.
- **Autenticación**: exige JWT del usuario (`verify_jwt = true`). La respuesta
  side-effect se hace con la identidad del usuario que llamó.

## Invocación

`POST /functions/v1/analyze-incident` (autenticada con el Bearer del usuario)

**Input**:
```json
{
  "categoria": "traffic",
  "texto": "mensaje opcional",
  "descripcion": "descripción opcional",
  "audioTranscript": "transcripción opcional",
  "fotoUrl": "https://...",
  "mediaMimeType": "image/jpeg",
  "reporteId": 123
}
```

> El cliente (`src/lib/ai.ts`) ya **no** envía `reporteId` (era un id local
> inventado que no correspondía al SERIAL real). Si algún backend lo envía, se
> persiste; si no, la función solo clasifica.

**Output**:
```json
{
  "decision": "proceed|correct|cancel",
  "categoria_corregida": null | "traffic",
  "severidad": "baja|media|alta|critica",
  "tipo_emergencia": "Accidente de Tránsito",
  "confianza": 0.85,
  "motivo": "explicación breve de la decisión",
  "respuesta_asistente": "texto para el chat (ES)",
  "mensaje_voz": "frase corta para voz",
  "reporteId": 123,
  "niveles_id": 3,
  "tipos_id": 2
}
```

**Decisión** de la IA (IA inteligente):
- `proceed`: la evidencia es coherente con la categoría declarada → despacho normal.
- `correct`: es una emergencia REAL pero de otra categoría → la función devuelve
  `categoria_corregida` y el cliente re-clasifica.
- `cancel`: no hay emergencia real (broma/falsa) → no se actualiza el reporte
  (`aplicado = false`) y el cliente cancela/resuelve el incidente.

**Side-effect** (si llega `reporteId`): inserta fila en `analisis_ia`. Solo en
`proceed`/`correct` actualiza `reportes_emergencia`; en `cancel` no se toca.

## Despliegue

1. **Sube el código de la función** (`supabase/functions/analyze-incident/index.ts`).
   Con CLI:
   ```bash
   supabase functions deploy analyze-incident --project-ref lbofnnfihrdubcqdplcm
   ```
   o, desde el Dashboard de Supabase → **Edge Functions → Create Function** → pega
   el contenido de `index.ts`.

2. **Configura el secreto `GEMINI_API_KEY`**:
   Dashboard → **Project Settings → Edge Functions → Secrets** → añadir
   `GEMINI_API_KEY = <tu clave de Google AI Studio>`
   (opcional) `GEMINI_MODEL = gemini-3.6-flash`

   > La clave de Gemini vive ÚNICAMENTE en Secrets de Supabase. **Nunca** debe ir
   > en el cliente/APK (`.env`/`.env.example`).

3. **Prueba** desde tu app tras un build con el frontend ya conectado.

## Fallback

Si la función aún no está desplegada, o la clave no responde, el cliente
(`src/lib/ai.ts`) cae a un análisis **local** para no romper la UX del chat.

## Contrato con la app

Reemplaza el texto simulado en `src/components/AIEmergencyChatModal.tsx` por la
respuesta real de Gemini vía `src/lib/ai.ts` → `analyzeIncidentWithAI()`.