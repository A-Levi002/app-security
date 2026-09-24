// SECURE_OS / Alert.IA — Edge Function: transcribe
// ---------------------------------------------------------------------------
// Voz → texto para el chat de emergencia. Recibe el audio grabado (base64) y
// devuelve la transcripción literal en español usando Gemini:
//   { audioBase64, audioMimeType } -> { texto }
// Se usa con el botón "mantén presionado para dictar" y también para enriquecer
// el análisis de gravedad (audioTranscript) cuando la decodificación directa
// del m4a pueda fallar.
//
// Seguridad: idéntica a analyze-incident — JWT obligatorio (verify_jwt = true).
// ---------------------------------------------------------------------------
import { getUserFromRequest } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";
import { runTranscript } from "../_shared/ai.ts";

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }

  if (!Deno.env.get("GEMINI_API_KEY")) {
    return json(
      {
        error: "GEMINI_API_KEY no configurada en Secrets de Edge Functions.",
        fallback: true,
      },
      500
    );
  }

  let body: { audioBase64?: string; audioMimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido.", fallback: true }, 400);
  }

  if (!body.audioBase64) {
    return json({ error: "audioBase64 es requerido.", fallback: true }, 400);
  }

  let texto: string;
  try {
    texto = await runTranscript({
      audioBase64: body.audioBase64,
      audioMimeType: body.audioMimeType,
    });
  } catch (err) {
    console.error(
      "transcribe:",
      err instanceof Error ? err.message : err
    );
    return json(
      {
        error: "La IA no respondió a tiempo. Intenta nuevamente.",
        fallback: true,
      },
      503
    );
  }

  return json({ texto });
});