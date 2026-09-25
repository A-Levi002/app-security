// SECURE_OS / Alert.IA — Edge Function: ai-chat
// ---------------------------------------------------------------------------
// Punto ÚNICO de IA de la app. Triaje por turno del chat con SECURE_OS CORE:
// decide cada mensaje/evidencia del ciudadano entre:
//   sin_riesgo / dudoso / emergencia
// y solo en "emergencia" emite campos de despacho (unidad, base, ETA,
// severidad, tipo_respuesta). El cliente escala (mapa/ruta/llamadas) si
// decision === "emergencia" y confianza >= 0.6.
//
// Diseñada para ser RÁPIDA y LIGERA del lado del servidor:
//   - Es un endpoint de clasificación PURO: no escribe en la BD (persistencia
//     la hace el cliente con el flujo normal de reportes). Menos IO → menor
//     latencia.
//   - El historial viaja SOLO en texto (los medios se describen por tipo), y la
//     única media inline es la evidencia más reciente (foto redimensionada o
//     video breve). El audio viaja únicamente como transcripción.
//   - Modelo con thinkingConfig LOW y maxOutputTokens acotado.
//   - En el log se registra el tiempo (Date.now()) de cada etapa para medir
//     latencia real.
//
// Seguridad: JWT obligatorio (verify_jwt = true). La clave de Gemini vive solo
// en el secret GEMINI_API_KEY del backend.
// ---------------------------------------------------------------------------
import { getUserFromRequest } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";
import {
  runChatTriage,
  ChatHistorialItem,
  DispatchStep,
  MediaInput,
} from "../_shared/ai.ts";

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");
  const t0 = Date.now();

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }
  const tAuth = Date.now();

  if (!Deno.env.get("GEMINI_API_KEY")) {
    return json(
      {
        error: "GEMINI_API_KEY no configurada en Secrets de Edge Functions.",
        fallback: true,
      },
      500
    );
  }

  let body: {
    categoria?: string;
    categoriaLabel?: string;
    historial?: ChatHistorialItem[];
    mensajeActual?: string;
    subtipoAmbiental?: string;
    unidadAsignada?: string;
    dispatchStep?: DispatchStep;
    fotoBase64?: string;
    mediaMimeType?: string;
    videoBase64?: string;
    videoMimeType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido.", fallback: true }, 400);
  }
  const tRead = Date.now();

  if (!body.categoria) {
    return json({ error: "categoria es requerida.", fallback: true }, 400);
  }

  // La media inline es OPCIONAL y ya debe venir recortada del cliente:
  // foto <= 1024 px (JPEG) o video breve <= 4 MB. El audio viaja como texto.
  const media: MediaInput = {
    fotoBase64: body.fotoBase64,
    fotoMimeType: body.mediaMimeType,
    videoBase64: body.videoBase64,
    videoMimeType: body.videoMimeType,
  };

  let result;
  try {
    result = await runChatTriage({
      categoria: body.categoria,
      categoriaLabel: body.categoriaLabel,
      historial: body.historial,
      mensajeActual: body.mensajeActual,
      subtipoAmbiental: body.subtipoAmbiental,
      unidadAsignada: body.unidadAsignada,
      dispatchStep: body.dispatchStep,
      media,
    });
  } catch (err) {
    console.error(
      "ai-chat:",
      err instanceof Error ? err.message : err,
      "| createdAt(ms):",
      Date.now() - t0
    );
    return json(
      {
        error: "La IA no respondió a tiempo. Intenta nuevamente.",
        fallback: false,
        retriable: true,
      },
      503
    );
  }
  const tModel = Date.now();

  console.log(
    `[ai-chat] auth ${tAuth - t0}ms | body ${tRead - tAuth}ms | model ${
      tModel - tRead
    }ms | total ${tModel - t0}ms | decision=${result.decision} confianza=${result.confianza}`
  );

  return json({
    ...result,
    timing: {
      authMs: tAuth - t0,
      bodyMs: tRead - tAuth,
      modelMs: tModel - tRead,
      totalMs: tModel - t0,
    },
  });
});