// SECURE_OS / Alert.IA — _shared/ai.ts
// Capa de IA con LangChain (@langchain/google sobre Gemini).
// Única responsable de construir los chains de análisis y de conversación.
//   - runAnalysis: clasifica el incidente (structured output con Zod) y
//     recomienda recurso/base/ETA para la app ciudadana.
//   - runRespond: conversación de seguimiento con contexto del incidente.
// Se usa el secret GEMINI_API_KEY (nunca vive en el cliente). Si no está
// configurado, las funciones llamadoras fallan explícito (sin fallback
// hardcodeado): el cliente tiene su propio fallback local de UX.
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ContentBlock } from "@langchain/core/messages";
import { z } from "zod";
import {
  CATEGORIES,
  EmergencyCategory,
  CATEGORY_TO_TIPO,
} from "./catalog.ts";

export interface MediaInput {
  fotoBase64?: string;
  fotoMimeType?: string;
  audioBase64?: string;
  audioMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
}

export const DISPATCH_STEPS = [
  "received",
  "classified",
  "resources_assigned",
  "en_route",
  "resolved",
] as const;
export type DispatchStep = (typeof DISPATCH_STEPS)[number];

// ---------------------------------------------------------------------------
// Esquemas Zod (structured output → responseSchema de Gemini)
// ---------------------------------------------------------------------------

export const ANALYSIS_SCHEMA = z.object({
  decision: z.enum(["proceed", "correct", "cancel"]),
  categoria_corregida: z.enum(CATEGORIES).nullable(),
  severidad: z.enum(["baja", "media", "alta", "critica"]),
  tipo_emergencia: z
    .string()
    .describe("Nombre de la emergencia en español (catálogo SECURE_OS)"),
  confianza: z
    .number()
    .min(0)
    .max(1)
    .describe("Qué tan seguro estás de la decisión, 0.0 a 1.0"),
  motivo: z.string().describe("Explicación breve y en español de la decisión"),
  subtipo_ambiental: z
    .enum([
      "derrame_quimico",
      "fuga_gas",
      "quema_residuos",
      "botadero_ilegal",
      "contaminacion_agua_suelo",
    ])
    .nullable()
    .optional()
    .describe(
      "SOLO si la categoría es ambiental: subtipo detectado en la evidencia; null si no aplica o no es identificable"
    ),
  respuesta_asistente: z
    .string()
    .describe("Texto corto en español para el ciudadano en el chat"),
  mensaje_voz: z
    .string()
    .describe("Frase corta en español, tranquila, para lectura por voz"),
  unidad_recomendada: z
    .string()
    .optional()
    .describe("Código del recurso a despachar, ej: PATRULLA_T8"),
  base_origen: z
    .string()
    .optional()
    .describe("Base o estación de origen del recurso"),
  eta_minutos: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Tiempo estimado de llegada en minutos"),
});
export type AnalysisResult = z.infer<typeof ANALYSIS_SCHEMA>;

export const RESPOND_SCHEMA = z.object({
  respuesta: z
    .string()
    .describe("Respuesta breve, calmada y en español al ciudadano"),
  mensaje_voz: z
    .string()
    .optional()
    .describe("Frase opcional para lectura por voz"),
  siguiente_paso: z
    .enum(DISPATCH_STEPS)
    .nullable()
    .describe("Paso de despacho al que se avanza, o null si no cambia"),
  finalizar: z
    .boolean()
    .optional()
    .describe("true solo si la emergencia quedó resuelta"),
});
export type RespondResult = z.infer<typeof RESPOND_SCHEMA>;

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

let modelSingleton: ChatGoogleGenerativeAI | null | undefined;
export function getChatModel(): ChatGoogleGenerativeAI | null {
  if (modelSingleton !== undefined) return modelSingleton;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    modelSingleton = null;
    return null;
  }
  modelSingleton = new ChatGoogleGenerativeAI({
    apiKey,
    model: Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash",
    temperature: 0.4,
  });
  return modelSingleton;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const CATALOGO_EMERGENCIAS = Object.entries(CATEGORY_TO_TIPO)
  .map(([clave, nombre]) => `${clave} (\"${nombre}\")`)
  .join(", ");

const ANALYSIS_SYSTEM_PROMPT = `Eres SECURE_OS CORE, el asistente táctico de emergencias de la app SECURE_OS.
Protocolo activo. Responde SIEMPRE en español, breve, directo y calmado, dirigido a un ciudadano
que está reportando una emergencia. El usuario te indica una CATEGORIA DECLARADA y te da una
evidencia (transcripción de voz, descripción y/o foto/audio/video).

ANÁLISIS MULTIMEDIA (IMPORTANTE): cuando recibas foto, video o audio, trabájalos JUNTOS con la
transcripción/descripción disponibles. Interpreta el CONTENIDO REAL de lo que ves/oyes, no la
categoría declarada:
- En una IMAGEN/VIDEO evalúa: fuego o humo visible, personas heridas o en conflicto, objetos
  dañados, vehículos chocados, policías/bomberos en escena, etc. Si hay fuego visible → incendio.
- En el AUDIO evalúa: gritos, explosiones, sirenas, llanto, tono de pánico. Un audio con música,
  risas o sin contexto de emergencia NO demuestra una emergencia.
- Asigna severidad con base en lo que la evidencia muestra (crítica = riesgo vital/inmediato;
  alta = lesiones/peligro considerable; media = requiere atención; baja = menor. Si dudas, media).

Tu tarea es decidir si la evidencia SE CORRESPONDE con la categoría declarada.

DECIDE ASÍ:
- "proceed": la evidencia es coherente y demuestra la emergencia de la categoria_declarada.
- "correct": la evidencia demuestra una emergencia REAL pero de OTRA categoría distinta a la
  declarada (ej: declaró "robbery" pero describe un incendio, o declaró "traffic" pero es una
  emergencia médica). En ese caso pon en "categoria_corregida" la categoría REAL correcta,
  actualiza "tipo_emergencia", "severidad" y redacta "respuesta_asistente"/"mensaje_voz" acordes
  a esa emergencia corregida.
- "cancel": la evidencia NO demuestra ninguna emergencia real (bromas, risas, música, texto sin
  sentido, memes, selfies, comandos de prueba/"hola"/"probando", o descripciones que niegan la
  emergencia: "no pasa nada", "es broma", "mentira"). En ese caso "respuesta_asistente" debes
  decirle al ciudadano, con tono claro pero educado, que SECURE_OS es EXCLUSIVAMENTE para
  emergencias reales (no hay modo de juego/prueba), que el despacho fue cancelado y que debe
  reportar por voz/cámara cuando de verdad haya un riesgo actual.

Reglas de severidad:
- critica = riesgo vital/inmediato. alta = lesiones moderadas/peligro considerable.
- media = requiere atención pero no crítico. baja = incidente menor. Si dudas, media.

Catálogo de emergencias (clave = "nombre en BD"):
${CATALOGO_EMERGENCIAS}

Recomienda siempre la unidad y base acordes (unidad_recomendada, base_origen, eta_minutos).
confianza: 0.0-1.0 según qué tan segura estés de tu decisión.

---
BLOQUE AMBIENTAL (ODS 12 — categorías "ambiental" / "Incidente Ambiental"):
Si el reporte es de categoría ambiental, analiza la evidencia (foto, video o audio) y responde con:
1) Tipo de incidente (derrame químico, fuga de gas, quema de residuos, botadero ilegal o
   contaminación de agua o suelo).
2) Gravedad: baja, media o alta.
3) Riesgo inmediato para las personas (sí o no) y a qué distancia mantenerse.
4) Máximo 3 recomendaciones de manejo seguro.
5) A quién avisar (bomberos, autoridad ambiental municipal, contactos de confianza).
No des instrucciones de limpieza de sustancias peligrosas: indica alejarse y esperar a personal
capacitado.`;

const RESPOND_SYSTEM_PROMPT = `Eres SECURE_OS CORE, el asistente táctico de emergencias de la app SECURE_OS.
Protocolo activo. Respondes a un ciudadano con una emergencia EN CURSO. Usa SIEMPRE el contexto
que recibes (categoría, unidad asignada, paso de despacho e historial del chat) para responder.
Sé breve, calmado, directo y en español. Nunca inventes que se resolvió algo que el contexto no
indica: si no hay información, sugiere mantener la calma y resguardarse.

Si el ciudadano hace bromas, usa la app de prueba o envía texto sin sentido, recuérdale con tono
educado que SECURE_OS es EXCLUSIVAMENTE para emergencias reales y que las bromas generan despachos
innecesarios; en ese caso no avances ningún paso de despacho (siguiente_paso = null) y no lo
marques como finalizado.

Decides sobre dos campos de control:
- siguiente_paso: avanza el estado del despacho (received/classified/resources_assigned/en_route)
  SOLO si la conversación lo justifica (ej: el ciudadano confirmó la llegada de la unidad o dio
  datos que cierran una fase). null si no cambia.
- finalizar: true únicamente si la conversación indica claramente que la emergencia terminó
  (unidad en escena + situación controlada, o el ciudadano pide cerrar el incidente).
- mensaje_voz: frase opcional corta para lectura por voz.

---
BLOQUE AMBIENTAL (ODS 12): si el contexto indica que el incidente es de categoría ambiental,
orienta tus respuestas a: tipo de incidente (derrame químico, fuga de gas, quema de residuos,
botadero ilegal o contaminación de agua o suelo), riesgo inmediato y distancia de seguridad,
máximo 3 recomendaciones de manejo seguro y a quién avisar (bomberos, autoridad ambiental
municipal, contactos de confianza). No des instrucciones de limpieza de sustancias peligrosas:
indica alejarse y esperar a personal capacitado.`;

// ---------------------------------------------------------------------------
// Generación con structured output + fallback a JSON plano
// ---------------------------------------------------------------------------

function messageParts(text: string, media?: MediaInput) {
  const parts: ContentBlock[] = [{ type: "text", text }];
  const items: Array<["image" | "audio" | "video", string | undefined, string]> = [
    ["image", media?.fotoBase64, media?.fotoMimeType ?? "image/jpeg"],
    ["audio", media?.audioBase64, media?.audioMimeType ?? "audio/mpeg"],
    ["video", media?.videoBase64, media?.videoMimeType ?? "video/mp4"],
  ];
  for (const [kind, b64, mime] of items) {
    if (b64) {
      parts.push({
        type: kind,
        url: `data:${mime};base64,${b64}`,
        mimeType: mime,
      });
    }
  }
  return new HumanMessage({ content: parts });
}

const JSON_SHAPE_HINT = (schema: z.ZodTypeAny) => {
  const shape: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    reflectObjectShape(schema)
  )) {
    shape[key] = value;
  }
  return JSON.stringify(shape, null, 2);
};

function reflectObjectShape(schema: z.ZodTypeAny): Record<string, unknown> {
  const entries = schema._def?.shape ? Object.entries(schema._def.shape) : [];
  return entries.reduce((acc, [key, inner]) => {
    acc[key] = `(${(inner as z.ZodTypeAny)._def?.typeName ?? "any"})`;
    return acc;
  }, {} as Record<string, unknown>);
}

async function structuredOrFallback<V>(model: ChatGoogleGenerativeAI, schema: z.ZodSchema<V>, messages: unknown[]) {
  try {
    const structured = model.withStructuredOutput(schema);
    const out = await structured.invoke(messages as never);
    return schema.parse(out);
  } catch (err) {
    console.error(
      "[ai] structured output fallback:",
      err instanceof Error ? err.message : err
    );
    const raw = await model.invoke([
      ...(messages as never[]),
      new HumanMessage({
        content: `Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin comentarios) con exactamente esta forma:\n${JSON_SHAPE_HINT(schema)}`,
      }),
    ]);
    const text =
      typeof raw?.content === "string"
        ? raw.content
        : JSON.stringify(raw?.content ?? "");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return schema.parse(parsed);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runAnalysis(input: {
  categoria: string;
  contexto: string;
  media?: MediaInput;
  subtipoAmbiental?: string;
}): Promise<AnalysisResult> {
  const model = getChatModel();
  if (!model) {
    throw new Error(
      "GEMINI_API_KEY no configurada en Secrets de Edge Functions."
    );
  }
  const categoriaDeclarada = CATEGORY_TO_TIPO[
    input.categoria as EmergencyCategory
  ] ?? input.categoria;
  const contexto = [
    `Categoría DECLARADA por el usuario: ${categoriaDeclarada} (clave: ${input.categoria})`,
    // ODS 12 — pasar a la IA el subtipo ambiental cuando exista.
    input.subtipoAmbiental
      ? `Subtipo ambiental declarado: ${input.subtipoAmbiental}`
      : "",
    input.contexto,
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    new SystemMessage(ANALYSIS_SYSTEM_PROMPT),
    messageParts(contexto, input.media),
  ];

  const result = await structuredOrFallback(
    model,
    ANALYSIS_SCHEMA,
    messages
  );

  // Normalización: "cancel" no tiene tipo/severidad útil.
  if (result.decision === "cancel") {
    return { ...result, tipo_emergencia: "No aplica", severidad: "baja" };
  }
  if (
    result.decision === "correct" &&
    result.categoria_corregida &&
    CATEGORY_TO_TIPO[result.categoria_corregida]
  ) {
    result.tipo_emergencia = CATEGORY_TO_TIPO[result.categoria_corregida];
  }
  // ODS 12 — el subtipo declarado por el ciudadano tiene prioridad sobre la
  // inferencia; fuera de categoría ambiental no hay subtipo.
  if (input.subtipoAmbiental) {
    result.subtipo_ambiental = input.subtipoAmbiental as AnalysisResult["subtipo_ambiental"];
  }
  if (input.categoria !== "ambiental") {
    result.subtipo_ambiental = null;
  }
  return result;
}

export async function runRespond(input: {
  contexto: string;
  pregunta: string;
  subtipoAmbiental?: string;
}): Promise<RespondResult> {
  const model = getChatModel();
  if (!model) {
    throw new Error(
      "GEMINI_API_KEY no configurada en Secrets de Edge Functions."
    );
  }
  const messages = [
    new SystemMessage(RESPOND_SYSTEM_PROMPT),
    new HumanMessage({
      content: `${input.contexto}\n\nPregunta del ciudadano:\n${input.pregunta}`,
    }),
  ];
  return structuredOrFallback(model, RESPOND_SCHEMA, messages);
}

// ---------------------------------------------------------------------------
// Voz → texto (Edge Function "transcribe"). Devuelve el texto literal del audio
// en español. Usado por el botón "mantén presionado para dictar" del chat.
// ---------------------------------------------------------------------------

export async function runTranscript(input: MediaInput): Promise<string> {
  const model = getChatModel();
  if (!model) {
    throw new Error(
      "GEMINI_API_KEY no configurada en Secrets de Edge Functions."
    );
  }
  const parts: ContentBlock[] = [
    {
      type: "text",
      text: "Transcribe fielmente el audio adjunto al ESPAÑOL (o el idioma que se hable). Devuelve SOLO el texto literal que se escucha, sin comillas, sin comentarios, sin mayúsculas extra. Si no hay voz o el audio está vacío, devuelve una cadena vacía.",
    },
  ];
  if (input.audioBase64) {
    const mime = input.audioMimeType || "audio/mp4";
    parts.push({
      type: "audio",
      url: `data:${mime};base64,${input.audioBase64}`,
      mimeType: mime,
    });
  }
  const raw = await model.invoke([new HumanMessage({ content: parts })]);
  const text =
    typeof raw?.content === "string"
      ? raw.content
      : JSON.stringify(raw?.content ?? "");
  return (text || "").trim().replace(/^"+|"+$/g, "");
}