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
  sustancia_detectada: z
    .string()
    .nullable()
    .optional()
    .describe(
      "SOLO si la categoría es ambiental y la evidencia muestra un producto, químico, envase o contenedor: nombre del producto/sustancia identificado (ej: 'cloro', 'gasolina', 'pesticida', 'aceite industrial', 'amoníaco') y qué hace. Lee etiquetas, número UN, pictogramas y color del contenedor. null si no es identificable o no aplica"
    ),
  tipo_respuesta: z
    .enum(["policia", "ambulancia", "bomberos", "autoridad_ambiental"])
    .nullable()
    .optional()
    .describe(
      "Qué servicio de emergencia debe responder según la conversación/evidencia: 'policia' si hay actividad ilegal o delito (ej: fábrica haciendo algo prohibido, vertido clandestino, botadero ilegal); 'ambulancia' si una persona tocó/exhaló/presenta síntomas por el químico; 'bomberos' si hay fuga con riesgo de explosión o incendio; 'autoridad_ambiental' para contaminación sin riesgo vital inmediato. null si no aplica"
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
// Triaje por turno (Edge Function "ai-chat"): decide cada mensaje/evidencia del
// ciudadano entre sin_riesgo / dudoso / emergencia. NUNCA inventa despacho si
// el contenido no lo justifica; solo en "emergencia" se llenan los campos de
// despacho (y el cliente escala si confianza >= 0.6).
// ---------------------------------------------------------------------------

export const CHAT_SCHEMA = z.object({
  decision: z.enum(["sin_riesgo", "dudoso", "emergencia"]),
  categoria_corregida: z
    .enum(CATEGORIES)
    .nullable()
    .optional()
    .describe(
      "Si la evidencia demuestra una emergencia REAL de otra categoría distinta a la declarada, la categoría correcta; null si la declarada es correcta o no hay emergencia"
    ),
  severidad: z
    .enum(["baja", "media", "alta", "critica"])
    .nullable()
    .optional()
    .describe(
      "SOLO si decision=emergencia: gravedad. critica=riesgo vital/inmediato, alta=lesiones/peligro considerable, media=requiere atención, baja=menor. null en otro caso"
    ),
  confianza: z
    .number()
    .min(0)
    .max(1)
    .describe("Qué tan seguro estás de tu decisión, 0.0 a 1.0"),
  evidencia_insuficiente: z
    .boolean()
    .describe(
      "true si el contenido recibido NO basta para confirmar una emergencia real válida"
    ),
  pedir_evidencia: z
    .enum(["foto", "video", "audio", "foto_o_video"])
    .nullable()
    .optional()
    .describe(
      "Qué evidencia pedir al ciudadano cuando evidencia_insuficiente=true (ej: foto del lugar/vehículo/reporte escrito, video breve, audio describiendo). null si no aplica"
    ),
  motivo: z
    .string()
    .describe("Explicación breve y en español de tu decisión"),
  respuesta: z
    .string()
    .describe(
      "Respuesta breve, calmada, directa y en español dirigida al ciudadano. No inventes despachos que no hayas emitido."
    ),
  sustancia_detectada: z
    .string()
    .nullable()
    .optional()
    .describe(
      "SOLO si es de categoría ambiental y la evidencia muestra un producto/químico/envase: nombre del producto/sustancia y qué hace. Lee etiquetas, número UN, pictogramas y color del contenedor. null si no es identificable"
    ),
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
    .describe("Solo si es de categoría ambiental: subtipo detectado"),
  tipo_respuesta: z
    .enum(["policia", "ambulancia", "bomberos", "autoridad_ambiental"])
    .nullable()
    .optional()
    .describe(
      "Qué servicio debe responder SEGÚN la conversación/evidencia: 'policia' si hay delito/actividad ilegal; 'ambulancia' si alguien presenta síntomas/exposición; 'bomberos' si hay fuga con riesgo de incendio/explosión; 'autoridad_ambiental' para contaminación sin riesgo vital. null si no aplica o no hay emergencia"
    ),
  unidad_recomendada: z
    .string()
    .nullable()
    .optional()
    .describe("SOLO si decision=emergencia: código del recurso a despachar (ej: PATRULLA_T8, AMBULANCIA_T2). null en otro caso"),
  base_origen: z
    .string()
    .nullable()
    .optional()
    .describe("SOLO si decision=emergencia y unidad_recomendada no es null: base o estación de origen"),
  eta_minutos: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("SOLO si decision=emergencia y unidad_recomendada no es null: tiempo estimado de llegada en minutos"),
  guardar_reporte: z
    .boolean()
    .describe(
      "true si hay un incidente real que conviene conservar en el historial como reporte (aunque sea de baja severidad); false si la conversación demuestra que no hubo emergencia (broma, prueba, nothing real) y conviene descartar el reporte"
    ),
  finalizar: z
    .boolean()
    .describe(
      "true únicamente si la conversación indica claramente que el incidente quedó resuelto o el ciudadano pide cerrarlo"
    ),
});
export type ChatTriageResult = z.infer<typeof CHAT_SCHEMA>;

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------
// Gemini 3.x: NO se baja `temperature` (da resultados peores). En su lugar se
// controla la profundidad de razonamiento con `thinkingConfig.thinkingLevel`.
// Variantes cacheadas por (modelo, nivel): el chat de triaje usa "LOW" para
// responder rápido; analyze-incident/ai-respond usan el modelo por defecto.

// Nivel de pensamiento en Gemini 3.x (subset del enum del SDK: LOW/MEDIUM/HIGH).
type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

const modelCache = new Map<string, ChatGoogleGenerativeAI | null>();

export function getChatModel(opts?: {
  model?: string;
  thinkingLevel?: ThinkingLevel;
}): ChatGoogleGenerativeAI | null {
  const key = `${opts?.model ?? "default"}|${opts?.thinkingLevel ?? "none"}`;
  if (modelCache.has(key)) return modelCache.get(key)!;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    modelCache.set(key, null);
    return null;
  }
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model:
      opts?.model ??
      (Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash"),
    maxOutputTokens: 2048,
    ...(opts?.thinkingLevel
      ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } }
      : {}),
  });
  modelCache.set(key, model);
  return model;
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
2) IDENTIFICA EL PRODUCTO: si la foto/video muestra un envase, contenedor, cilindro, fuga o mancha,
   describe qué sustancia/producto es (lee etiquetas, número UN, pictogramas, color del contenedor,
   estado físico, olor) y pon el nombre en "sustancia_detectada" (ej: cloro, gasolina, ácido,
   amoníaco, pesticida). Si no se puede identificar, deja null.
3) QUÉ HACE: en "respuesta_asistente" explica brevemente qué hace ese producto/peligro (corrosivo,
   inflamable, tóxico, asfixiante) y el riesgo inmediato para las personas.
4) QUÉ AYUDA DESPACHAR: decide "tipo_respuesta" según la situación y la conversación:
   - ambulancia: si alguien tocó, respiró o presenta síntomas por el químico (contacto con la piel,
     ojos, inhalación, intoxicación).
   - policia: si hay actividad ilegal o delito asociado (fábrica/planta vertiendo o incinerando
     desechos sin permiso, robo de químicos, botadero clandestino con fines delictivos).
   - bomberos: si hay fuga con riesgo de incendio o explosión.
   - autoridad_ambiental: contaminación de agua/suelo o residuos sin riesgo vital inmediato.
5) Gravedad: baja, media o alta (crítica si hay riesgo vital inmediato).
6) A quién avisar (bomberos, autoridad ambiental municipal, contactos de confianza).
No des instrucciones de limpieza de sustancias peligrosas: indica alejarse y esperar a personal
capacitado. Recuerda que el despacho de unidades depende de "tipo_respuesta": si hay exposición
humana al químico despacha ambulancia, si hay delito despacha policía.`;

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

const CHAT_SYSTEM_PROMPT = `Eres SECURE_OS CORE, el asistente de triaje de emergencias de la app SECURE_OS. Respondes por turno a un ciudadano que reporta algo a través de la categoría declarada. Respondes SIEMPRE en español, breve, calmado, directo y sin jerga de teléfono.

Por cada turno recibes: la categoría declarada, el historial reciente del chat, el mensaje/descripción actual y, cuando llega, evidencia multimedia (foto, video breve o transcripción de audio).

DECIDE exactamente entre tres decisiones:

- "sin_riesgo": NO hay emergencia real. Incluye saludos, cortesías, "hola", "probando", comandos de prueba, bromas, selfies, imágenes/videos sin contexto de riesgo, música o textos que niegan la emergencia ("no pasa nada", "era broma", "falsa alarma"). En "respuesta" dile con tono claro pero educado que SECURE_OS es EXCLUSIVAMENTE para emergencias reales (no hay modo de juego/prueba), que NO se genera ningún despacho, y que debe reportar por cámara/voz cuando haya un riesgo actual. No llenes ningún campo de despacho.
- "dudoso": hay un riesgo posible pero la evidencia es INSUFICIENTE para confirmar (descripción ambigua, sospecha sin foto/video, o evidencia contradictoria). Pon evidencia_insuficiente=true, pide en "pedir_evidencia" el tipo concreto que falta, y en "respuesta" guía al ciudadano a aportarla. No escales ni despaches.
- "emergencia": hay una emergencia REAL y actual respaldada por la conversación y/o la evidencia multimedia (fuego/humo visible, heridos, conflicto, delito, fuga con riesgo, accidente, exposición a químicos, basura vertida en un cuerpo de agua, etc.). Solo en este caso llenas severidad, tipo_respuesta, unidad_recomendada, base_origen y eta_minutos (los códigos de recurso deben ser POCO VERDADEROS al estilo de la app: PATRULLA_T#, AMBULANCIA_T#, QUIMICO_T#, por ejemplo). Si "confianza" queda por debajo de 0.6, trata el caso como dudoso.

ANÁLISIS DE LA EVIDENCIA (IMPORTANTE): cuando recibas foto/video, interpreta el CONTENIDO REAL (fuego, humo, personas lastimadas, vehículos chocados, contenedores etiquetados). Para decidir usa la evidencia JUNTO con la transcripción/descripción, no solo la categoría declarada.

SEVERIDAD (solo emergencia): critica = riesgo vital/inmediato; alta = lesiones o peligro considerable; media = requiere atención pero no es crítico; baja = incidente menor. Si dudas, media.

BLOQUE AMBIENTAL (ODS 12 — categoría "ambiental"): cuando aplique, identifica el subtipo (derrame_quimico, fuga_gas, quema_residuos, botadero_ilegal, contaminacion_agua_suelo) y, si la evidencia muestra un envase/etiqueta/mancha, nombra la sustancia en "sustancia_detectada" (lee etiquetas, número UN, pictogramas, color) y en "respuesta" explica brevemente qué hace (corrosivo, inflamable, tóxico, asfixiante) y el riesgo inmediato. Decide "tipo_respuesta": ambulancia si alguien presentó síntomas/exposición; policia si hay delito o vertido clandestino; bomberos si hay fuga con riesgo de incendio/explosión; autoridad_ambiental si es contaminación sin riesgo vital. NUNCA des instrucciones de limpieza de sustancias peligrosas: indícale alejarse y esperar a personal capacitado.

GUARDAR/CIERRE: guardar_reporte=true si existe un incidente real (aunque sea menor) que conviene conservar; false si quedó demostrado que no hubo emergencia. finalizar=true solo si la conversación muestra que el incidente quedó resuelto (unidad en escena + controlado, o el ciudadano pide cerrar). confianza: 0.0-1.0.

Catálogo de categorías (clave = "nombre"):
${CATALOGO_EMERGENCIAS}`;

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
  // inferencia; fuera de categoría ambiental no hay subtipo/sustancia/ayuda.
  if (input.subtipoAmbiental) {
    result.subtipo_ambiental = input.subtipoAmbiental as AnalysisResult["subtipo_ambiental"];
  }
  if (input.categoria !== "ambiental") {
    result.subtipo_ambiental = null;
    result.sustancia_detectada = null;
    result.tipo_respuesta = null;
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
// Triaje por turno (Edge Function "ai-chat")
// ---------------------------------------------------------------------------

export interface ChatHistorialItem {
  sender?: "ciudadano" | "asistente";
  kind?: "text" | "photo" | "video" | "audio" | "live_tracking_card";
  text?: string;
  transcript?: string;
  description?: string;
}

// Historial SOLO en texto (nunca base64): describe la media por tipo para que
// el modelo entienda el contexto sin re-decodificar nada (más rápido y ligero).
export function chatHistorialToPrompt(
  items: ChatHistorialItem[] | undefined,
  max = 10
): string {
  const list = (items ?? []).slice(-max);
  if (list.length === 0) return "(sin historial previo)";
  return list
    .map((m) => {
      const who = m.sender === "asistente" ? "Asistente" : "Ciudadano";
      const kind = m.kind ?? "text";
      if (kind === "photo") {
        return `${who} envió FOTO${m.transcript ? ` (${m.transcript})` : ""}`;
      }
      if (kind === "video") {
        return `${who} envió VIDEO breve${m.transcript ? ` (${m.transcript})` : ""}`;
      }
      if (kind === "audio") {
        return `${who} envió AUDIO (${m.transcript ?? "sin transcripción"})`;
      }
      if (kind === "live_tracking_card") {
        return `${who}: [tarjeta de seguimiento en vivo — unidad en despliegue]`;
      }
      return `${who}: ${(m.text ?? m.description ?? "").slice(0, 400)}`;
    })
    .join("\n");
}

export async function runChatTriage(input: {
  categoria: string;
  categoriaLabel?: string;
  historial?: ChatHistorialItem[];
  mensajeActual?: string;
  subtipoAmbiental?: string;
  unidadAsignada?: string;
  dispatchStep?: DispatchStep;
  media?: MediaInput;
}): Promise<ChatTriageResult> {
  // El triaje usa razonamiento LOW: suficiente para decidir y mucho más rápido.
  const model = getChatModel({ thinkingLevel: "LOW" });
  if (!model) {
    throw new Error(
      "GEMINI_API_KEY no configurada en Secrets de Edge Functions."
    );
  }
  const categoriaDeclarada =
    input.categoriaLabel ?? CATEGORY_TO_TIPO[input.categoria as EmergencyCategory] ?? input.categoria;

  const contexto = [
    `Categoría DECLARADA por el ciudadano: ${categoriaDeclarada} (clave: ${input.categoria})`,
    input.subtipoAmbiental
      ? `Subtipo ambiental declarado: ${input.subtipoAmbiental}`
      : "",
    input.unidadAsignada
      ? `Unidad YA asignada en el incidente: ${input.unidadAsignada}`
      : "",
    input.dispatchStep && input.dispatchStep !== "received"
      ? `Estado del incidente: ${input.dispatchStep}`
      : "",
    `Historial del chat (últimos turnos):\n${chatHistorialToPrompt(input.historial)}`,
    input.mensajeActual
      ? `Mensaje/descripción actual del ciudadano:\n${input.mensajeActual}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    messageParts(contexto, input.media),
  ];

  return structuredOrFallback(model, CHAT_SCHEMA, messages);
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