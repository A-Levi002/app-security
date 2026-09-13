// SECURE_OS / Alert.IA — Edge Function: analyze-incident
// ---------------------------------------------------------------------------
// Clasifica un incidente de emergencia con Gemini (multimodal: texto y, si se
// aporta, URL de media) y devuelve:
//   - severidad (baja|media|alta|critica)
//   - tipo de emergencia confirmado
//   - respuesta del asistente en español (para el chat)
//   - mensaje de voz opcional (TTS por voz de la IA)
// Como side-effect escribe en `analisis_ia` y actualiza `reportes_emergencia`.
//
// Seguridad:
//   - Requiere JWT de un usuario autenticado (verify_jwt = true).
//   - Usa `GEMINI_API_KEY` desde los Secrets de Edge Functions (nunca en cliente,
//     y SIN fallback hardcodeado en el código fuente).
//   - La clave de Gemini va por la RUTA NATIVA (?key= o x-goog-api-key), ya que
//     las claves Auth nuevas (prefijo AQ.) NO funcionan por rutas OpenAI-compatible.
//
// Resiliencia:
//   - Timeout de 12s por intento contra Gemini (AbortController).
//   - Reintento con backoff exponencial (hasta 2 veces) solo ante 503/UNAVAILABLE
//     o error de red/timeout. No reintenta ante 4xx (error del propio request).
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Modelo por defecto (flash = rápido/barato; habilita "thinking" si usas pro).
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";
const GEMINI_URL =
  Deno.env.get("GEMINI_API_URL") ||
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CATEGORY_TO_TIPO: Record<string, string> = {
  traffic: "Accidente de Tránsito",
  fire: "Incendio",
  medical: "Emergencia Médica",
  robbery: "Robo",
};

const SEVERITY_BY_NAME: Record<string, string> = {
  baja: "baja",
  media: "media",
  alta: "alta",
  critica: "critica",
};

const SYSTEM_PROMPT = `Eres SECURE_OS CORE, el asistente táctico de emergencias de la app SECURE_OS.
Protocolo activo. Responde SIEMPRE en español, breve, directo y calmado, dirigido a un ciudadano
que está reportando una emergencia. El usuario te indica una CATEGORIA DECLARADA y te da una
evidencia (transcripción de voz, descripción y/o foto).

Tu tarea es decidir si la evidencia SE CORRESPONDE con la categoría declarada.

DEVUELVE EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto fuera del JSON) con exactamente esta forma:

{
  "decision": "proceed|correct|cancel",
  "categoria_corregida": null | "traffic" | "fire" | "medical" | "robbery",
  "severidad": "baja|media|alta|critica",
  "tipo_emergencia": "Accidente de Tránsito|Incendio|Emergencia Médica|Robo",
  "confianza": 0.0-1.0,
  "motivo": "explicación breve y en español de la decisión",
  "respuesta_asistente": "texto corto en español para el ciudadano",
  "mensaje_voz": "frase corta en español para voz, tranquila"
}

DECIDE ASÍ:
- "proceed": la evidencia es coherente y demuestra la emergencia de la categoria_declarada.
- "correct": la evidencia demuestra una emergencia REAL pero de OTRA categoría distinta a la declarada
  (ej: declaró "robbery" pero describe un incendio, o declaró "traffic" pero es una emergencia médica).
  En ese caso pon en "categoria_corregida" la categoría REAL correcta, actualiza "tipo_emergencia",
  "severidad" y redacta "respuesta_asistente"/"mensaje_voz" acordes a esa emergencia corregida.
- "cancel": la evidencia NO demuestra ninguna emergencia real. Esto incluye bromas, risas, música,
  contenido irrelevante, texto sin sentido, o descripciones que niegan la emergencia (ej: "no pasa nada",
  "es broma", "mentira"). En vez de despachar unidades, informas que NO se pudo confirmar una emergencia
  real y se cancela el reporte.

Reglas de severidad: critica = riesgo vital/inmediato. alta = lesiones moderadas/peligro considerable.
media = requiere atención pero no crítico. baja = incidente menor. Si hay dudas, usa "media".
confianza: 0.0-1.0 según qué tan segura estés de tu decisión. Identifica la Categoría como mínimo
por sus nombres: traffic("Accidente de Tránsito"), fire("Incendio"), medical("Emergencia Médica"),
robbery("Robo").`;

// ---------------------------------------------------------------------------
// Llama a Gemini con timeout por intento y reintento con backoff exponencial
// ante 503 (UNAVAILABLE / alta demanda) o fallas de red/timeout.
// ---------------------------------------------------------------------------
async function callGeminiWithRetry(
  url: string,
  payload: unknown,
  maxRetries = 1,
  timeoutMs = 28000
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Reintentar solo si Gemini está saturado (503) y aún quedan intentos.
      // Un 503 real suele responder rápido, así que reintentar aquí tiene sentido.
      if (res.status === 503 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // Si fue timeout/abort (audio o imagen tardando en procesarse), NO reintentar:
      // reintentar solo duplicaría la espera del usuario sin resolver la causa.
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) break;
      if (attempt === maxRetries) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Gemini no respondió tras reintentos.");
}

Deno.serve(async (req: Request) => {
  // CORS para llamadas desde la app (expo) y test
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const apikey = req.headers.get("apikey") || "";
  if (!authHeader && !apikey) {
    return new Response(JSON.stringify({ error: "No autorizado." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  // Obtener el usuario autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Sesión no válida." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sin fallback hardcodeado: si falta el secret, fallar explícito.
  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "GEMINI_API_KEY no configurada en Secrets de Edge Functions.",
        fallback: true,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: {
    reporteId?: number;
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
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body JSON inválido." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const categoria = body.categoria || "traffic";
  const categoriaDeclarada = CATEGORY_TO_TIPO[categoria] ?? categoria;
  const contexto = [
    `Categoría DECLARADA por el usuario: ${categoriaDeclarada} (clave: ${categoria})`,
    body.texto ? `Mensaje del ciudadano: ${body.texto}` : "",
    body.descripcion ? `Descripción: ${body.descripcion}` : "",
    body.audioTranscript
      ? `Transcripción de audio de voz: ${body.audioTranscript}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Payload del prompt a Gemini. Si hay foto/audio en base64, la incluimos como inline_data.
  const parts: any[] = [
    { text: `${SYSTEM_PROMPT}\n\nContexto del incidente:\n${contexto}` },
  ];

  // Soporte para foto en base64 (enviada desde el cliente)
  if (body.fotoBase64) {
    parts.push({
      inline_data: {
        mime_type: body.mediaMimeType || "image/jpeg",
        data: body.fotoBase64,
      },
    });
  } else if (body.fotoUrl && /^https?:\/\//.test(body.fotoUrl)) {
    // Fallback: si viene una URL HTTP, la fetchamos
    try {
      const mediaRes = await fetch(body.fotoUrl);
      if (mediaRes.ok) {
        const blob = await mediaRes.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(blob).reduce(
            (s, b) => s + String.fromCharCode(b),
            ""
          )
        );
        parts.push({
          inline_data: {
            mime_type: body.mediaMimeType || "image/jpeg",
            data: b64,
          },
        });
      }
    } catch {
      // si la media no se puede leer, seguimos solo con texto
    }
  }

  // Soporte para audio en base64 (enviado desde el cliente)
  if (body.audioBase64) {
    parts.push({
      inline_data: {
        mime_type: body.audioMimeType || "audio/mp4",
        data: body.audioBase64,
      },
    });
  }

  // Soporte para video en base64 (enviado desde el cliente)
  if (body.videoBase64) {
    parts.push({
      inline_data: {
        mime_type: body.videoMimeType || "video/mp4",
        data: body.videoBase64,
      },
    });
  }

  let geminiRes: Response;
  try {
    geminiRes = await callGeminiWithRetry(
      `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        contents: [{ parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
      }
    );
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    console.error(
      "gemini fetch failed:",
      err instanceof Error ? err.message : err,
      isAbort ? "(timeout)" : "(network)"
    );
    return new Response(
      JSON.stringify({
        error: isAbort
          ? "El análisis de la IA está tardando más de lo esperado (audio/foto). Intenta de nuevo."
          : "La IA no respondió a tiempo. Intenta nuevamente en unos segundos.",
        fallback: true,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("gemini error:", geminiRes.status, errText);
    return new Response(
      JSON.stringify({
        error: "La IA no pudo procesar el incidente.",
        detail: errText,
        fallback: true,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const geminiJson = await geminiRes.json();
  const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let analysis: {
    decision: "proceed" | "correct" | "cancel";
    categoria_corregida: string | null;
    severidad: string;
    tipo_emergencia: string;
    confianza: number;
    motivo: string;
    respuesta_asistente: string;
    mensaje_voz: string;
  } = {
    decision: "proceed",
    categoria_corregida: null,
    severidad: "media",
    tipo_emergencia: categoriaDeclarada || "Emergencia Médica",
    confianza: 0.5,
    motivo: "",
    respuesta_asistente:
      "Se ha registrado tu emergencia. Permanece a resguardo y espera indicaciones.",
    mensaje_voz:
      "Unidad de respuesta en camino. Mantén la calma y espera a resguardo.",
  };

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.decision === "correct" || parsed.decision === "cancel") {
      analysis.decision = parsed.decision;
      analysis.categoria_corregida =
        parsed.decision === "correct" && CATEGORY_TO_TIPO[parsed.categoria_corregida]
          ? parsed.categoria_corregida
          : null;
    }
    if (parsed.decision === "cancel") {
      analysis.tipo_emergencia = "No aplica";
      analysis.severidad = "baja";
    } else if (parsed.decision === "correct" && analysis.categoria_corregida) {
      analysis.tipo_emergencia = CATEGORY_TO_TIPO[analysis.categoria_corregida];
      analysis.severidad =
        SEVERITY_BY_NAME[String(parsed.severidad).toLowerCase()] || "media";
    } else {
      analysis.severidad =
        SEVERITY_BY_NAME[String(parsed.severidad).toLowerCase()] || "media";
      analysis.tipo_emergencia = parsed.tipo_emergencia || analysis.tipo_emergencia;
    }
    analysis.confianza =
      typeof parsed.confianza === "number" ? parsed.confianza : 0.5;
    analysis.motivo = parsed.motivo || "";
    analysis.respuesta_asistente =
      parsed.respuesta_asistente || analysis.respuesta_asistente;
    analysis.mensaje_voz = parsed.mensaje_voz || analysis.mensaje_voz;
  } catch {
    // si Gemini no devuelve JSON válido, usamos el fallback
  }

  let nvgravedadId: number | undefined;
  let ntipoId: number | undefined;
  let reporteId = body.reporteId;

  try {
    const nivelName = analysis.severidad;
    const { data: nv } = await supabase
      .from("niveles_gravedad")
      .select("id_nivel_gravedad")
      .eq("nombre", nivelName)
      .maybeSingle();
    nvgravedadId = (nv as any)?.id_nivel_gravedad;

    const { data: tp } = await supabase
      .from("tipos_emergencia")
      .select("id_tipo_emergencia")
      .eq("nombre", analysis.tipo_emergencia)
      .maybeSingle();
    ntipoId = (tp as any)?.id_tipo_emergencia;
  } catch {
    // fallback: catálogos pueden no estar sincronizados
  }

  // Si venimos de un reporte ya guardado, registrar el análisis.
  if (reporteId != null) {
    await supabase
      .from("analisis_ia")
      .insert({
        id_reporte: reporteId,
        modelo_usado: GEMINI_MODEL,
        nivel_confianza: Number(analysis.confianza) || 0,
        resultado_json: analysis,
        aplicado: analysis.decision !== "cancel",
      });

    // Solo actualizamos el reporte si hay una emergencia REAL (proceed/correct).
    // En "cancel" no se toca tipo/severidad (fue una falsa emergencia/broma).
    if (analysis.decision !== "cancel") {
      await supabase
        .from("reportes_emergencia")
        .update({
          id_nivel_gravedad: nvgravedadId,
          id_tipo_emergencia: ntipoId,
        })
        .eq("id_reporte", reporteId);
    }
  }

  return new Response(
    JSON.stringify({
      ...analysis,
      reporteId,
      niveles_id: nvgravedadId ?? null,
      tipos_id: ntipoId ?? null,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});