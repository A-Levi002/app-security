// SECURE_OS / Alert.IA — Edge Function: analyze-incident
// ---------------------------------------------------------------------------
// Clasifica un incidente de emergencia con Gemini vía LangChain
// (@langchain/google, structured output con Zod) y devuelve:
//   - decisión (proceed|correct|cancel) + categoría corregida (8 tipos)
//   - severidad (baja|media|alta|critica)
//   - respuesta del asistente en español (para el chat) y mensaje de voz
//   - recurso recomendado (unidad, base, ETA) para el despacho ciudadano
// Como side-effect escribe en `analisis_ia` y actualiza `reportes_emergencia`.
//
// Seguridad:
//   - Requiere JWT de un usuario autenticado (verify_jwt = true).
//   - Las escrituras usan el cliente service-role (SOLO backend) pero con
//     chequeo explícito del uid del JWT: nunca se escribe una fila de otro.
//   - La clave de Gemini es el secret GEMINI_API_KEY (nunca en el cliente, y
//     SIN fallback hardcodeado en el código fuente).
//
// Resiliencia:
//   - Si el structured output falla, LangChain reintenta con JSON plano.
//   - El análisis con media (audio/foto/video) se envía inline como data URL.
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";
import { runAnalysis } from "../_shared/ai.ts";
import { MediaInput } from "../_shared/ai.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";

async function fetchToBase64(url: string): Promise<{
  data?: string;
  mimeType?: string;
}> {
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (const byte of buf) binary += String.fromCharCode(byte);
    return { data: btoa(binary), mimeType: res.headers.get("content-type") ?? undefined };
  } catch {
    return {};
  }
}

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

  let body: {
    reporteId?: number;
    incidentId?: string;
    categoria?: string;
    texto?: string;
    descripcion?: string;
    audioTranscript?: string;
    audioBase64?: string;
    audioMimeType?: string;
    fotoUrl?: string;
    fotoBase64?: string;
    mediaMimeType?: string;
    videoBase64?: string;
    videoMimeType?: string;
    subtipoAmbiental?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido.", fallback: true }, 400);
  }

  const categoria = body.categoria || "traffic";
  // ODS 12 — subtipo declarado por el ciudadano (puede llegar vacío; la IA lo infiere).
  const subtipoDeclarado =
    categoria === "ambiental" && typeof body.subtipoAmbiental === "string"
      ? body.subtipoAmbiental
      : undefined;

  const contexto = [
    body.texto ? `Mensaje del ciudadano: ${body.texto}` : "",
    body.descripcion ? `Descripción: ${body.descripcion}` : "",
    body.audioTranscript
      ? `Transcripción de audio de voz: ${body.audioTranscript}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const media: MediaInput = {
    fotoBase64: body.fotoBase64,
    fotoMimeType: body.mediaMimeType,
    audioBase64: body.audioBase64,
    audioMimeType: body.audioMimeType,
    videoBase64: body.videoBase64,
    videoMimeType: body.videoMimeType,
  };

  // Compatibilidad: si la media llega como URL HTTP, la pasamos a base64.
  if (!media.fotoBase64 && body.fotoUrl && /^https?:\/\//.test(body.fotoUrl)) {
    const read = await fetchToBase64(body.fotoUrl);
    media.fotoBase64 = read.data;
    media.fotoMimeType = read.mimeType || media.fotoMimeType;
  }

  let analysis;
  try {
    analysis = await runAnalysis({
      categoria,
      contexto,
      media,
      // ODS 12 — subtipo ambiental declarado (solo aplica a categoría ambiental)
      subtipoAmbiental: subtipoDeclarado,
    });
  } catch (err) {
    console.error(
      "analyze-incident:",
      err instanceof Error ? err.message : err
    );
    return json(
      {
        error: "La IA no respondió a tiempo. Intenta nuevamente en unos segundos.",
        fallback: true,
      },
      503
    );
  }

  const svc = getSvcClient();

  // Resolver IDs de catálogo por nombre (service-role, sin depender de RLS).
  let nvgravedadId: number | null = null;
  let ntipoId: number | null = null;
  try {
    const { data: nv } = await svc
      .from("niveles_gravedad")
      .select("id_nivel_gravedad")
      .eq("nombre", analysis.severidad)
      .maybeSingle();
    nvgravedadId = (nv as { id_nivel_gravedad?: number } | null)?.id_nivel_gravedad ?? null;

    if (analysis.decision !== "cancel") {
      const { data: tp } = await svc
        .from("tipos_emergencia")
        .select("id_tipo_emergencia")
        .eq("nombre", analysis.tipo_emergencia)
        .maybeSingle();
      ntipoId = (tp as { id_tipo_emergencia?: number } | null)?.id_tipo_emergencia ?? null;
    }
  } catch {
    // catálogos pueden no estar sincronizados; seguimos sin IDs
  }

  // Resolver el id_reporte: piso por reporteId o por el id local del cliente
  // (datos_extra->>id) — siempre restringiendo al uid del JWT.
  let reporteId: number | null = body.reporteId ?? null;
  if (reporteId == null && body.incidentId) {
    try {
      const { data: existing } = await svc
        .from("reportes_emergencia")
        .select("id_reporte")
        .eq("id_usuario", user.id)
        .eq("datos_extra->>id", body.incidentId)
        .maybeSingle();
      reporteId = (existing as { id_reporte?: number } | null)?.id_reporte ?? null;
    } catch {
      reporteId = null;
    }
  }

  // Sólo persistir si el reporte pertenece al usuario del JWT.
  if (reporteId != null) {
    try {
      const { data: owned } = await svc
        .from("reportes_emergencia")
        .select("id_usuario, datos_extra")
        .eq("id_reporte", reporteId)
        .maybeSingle();
      if (!owned || owned.id_usuario !== user.id) {
        return json({ error: "Reporte no encontrado.", fallback: true }, 404);
      }

      await svc.from("analisis_ia").insert({
        id_reporte: reporteId,
        modelo_usado: GEMINI_MODEL,
        nivel_confianza: Number(analysis.confianza) || 0,
        resultado_json: analysis,
        aplicado: analysis.decision !== "cancel",
      });

      if (analysis.decision !== "cancel") {
        const extra = ((owned as { datos_extra?: Record<string, unknown> | null })
          .datos_extra ?? {}) as Record<string, unknown>;
        await svc
          .from("reportes_emergencia")
          .update({
            id_nivel_gravedad: nvgravedadId,
            id_tipo_emergencia: ntipoId,
            datos_extra: {
              ...extra,
              unitAssigned: analysis.unidad_recomendada ?? extra.unitAssigned ?? "",
              originDepot: analysis.base_origen ?? extra.originDepot ?? "",
              etaMinutes: analysis.eta_minutos ?? extra.etaMinutes ?? 0,
              etaSeconds: 0,
            },
          })
          .eq("id_reporte", reporteId);
      }
    } catch (err) {
      console.error("persist:", err instanceof Error ? err.message : err);
    }
  }

  return json({
    ...analysis,
    subtipoAmbiental: analysis.subtipo_ambiental ?? body.subtipoAmbiental ?? null,
    reporteId,
    niveles_id: nvgravedadId,
    tipos_id: ntipoId,
  });
});