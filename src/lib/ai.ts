import { supabase } from './supabase';
import {
  DispatchStep,
  EmergencyCategory,
  EmergencyResponseType,
  EnvironmentalSubtype,
} from '../types';

// ---------------------------------------------------------------------------
// Capa de invocación de las Edge Functions de IA (Gemini) vía LangChain.
// - La clave de Gemini vive en Secrets de Supabase (nunca en el cliente).
// - NADA de esto devuelve texto estático: si la función falla o tarda, SE
//   LANZA un error (AIUnavailableError) para que la UI muestre una burbuja de
//   error real con "Reintentar" + sugerencia de llamada. Nunca un análisis o
//   despacho falsos haciéndose pasar por la IA.
// ---------------------------------------------------------------------------

export interface AIChatMedia {
  fotoBase64?: string;
  mediaMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
}

// Historial SOLO textual: los medios van como tipo + transcripción (nunca
// base64) para que el triaje sea rápido y ligero en el servidor.
export interface AIChatHistorialItem {
  sender?: 'ciudadano' | 'asistente';
  kind?: 'text' | 'photo' | 'video' | 'audio' | 'live_tracking_card';
  text?: string;
  transcript?: string;
  description?: string;
}

export interface AIChatResult {
  /** sin_riesgo | dudoso | emergencia — decisión del triaje por turno */
  decision: 'sin_riesgo' | 'dudoso' | 'emergencia';
  categoria_corregida?: EmergencyCategory | null;
  severidad?: 'baja' | 'media' | 'alta' | 'critica' | null;
  confianza: number;
  evidencia_insuficiente: boolean;
  pedir_evidencia?: 'foto' | 'video' | 'audio' | 'foto_o_video' | null;
  motivo?: string;
  respuesta: string;
  /** ODS 12 — sustancia/producto identificado en evidencia ambiental */
  sustancia_detectada?: string | null;
  /** ODS 12 — subtipo ambiental (solo categoría ambiental) */
  subtipoAmbiental?: EnvironmentalSubtype | null;
  /** ODS 12 — servicio que debe responder */
  tipo_respuesta?: EmergencyResponseType | null;
  unidad_recomendada?: string | null;
  base_origen?: string | null;
  eta_minutos?: number | null;
  /** true si conviene conservar el reporte; false descarta (broma/prueba) */
  guardar_reporte: boolean;
  finalizar: boolean;
  timing?: { authMs: number; bodyMs: number; modelMs: number; totalMs: number };
}

export interface AIChatParams {
  categoria: EmergencyCategory;
  categoriaLabel?: string;
  historial?: AIChatHistorialItem[];
  mensajeActual: string;
  subtipoAmbiental?: EnvironmentalSubtype | null;
  unidadAsignada?: string;
  dispatchStep?: DispatchStep;
  media?: AIChatMedia;
}

const AI_CHAT_TIMEOUT_MS = 25000;

export class AIUnavailableError extends Error {}

export async function aiChat(params: AIChatParams): Promise<AIChatResult> {
  let outcome: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AIUnavailableError('timeout')), AI_CHAT_TIMEOUT_MS)
    );
    outcome = await Promise.race([
      supabase.functions.invoke('ai-chat', {
        body: {
          categoria: params.categoria,
          categoriaLabel: params.categoriaLabel,
          historial: params.historial,
          mensajeActual: params.mensajeActual,
          subtipoAmbiental: params.subtipoAmbiental,
          unidadAsignada: params.unidadAsignada,
          dispatchStep: params.dispatchStep,
          fotoBase64: params.media?.fotoBase64,
          mediaMimeType: params.media?.mediaMimeType,
          videoBase64: params.media?.videoBase64,
          videoMimeType: params.media?.videoMimeType,
        },
      }),
      timeout,
    ]);
  } catch (e) {
    if (e instanceof AIUnavailableError) throw e;
    throw new AIUnavailableError(e instanceof Error ? e.message : 'error');
  }

  const data = outcome.data as (AIChatResult & { error?: string }) | null | undefined;
  if (!outcome.error && data && !data.error && typeof data.respuesta === 'string') {
    return data;
  }
  throw new AIUnavailableError(
    outcome.error && 'message' in outcome.error && outcome.error.message
      ? outcome.error.message
      : 'La IA no respondió a tiempo. Revisa tu conexión e inténtalo de nuevo.'
  );
}

// ---------------------------------------------------------------------------
// Voz → texto (Edge Function "transcribe"). Usa Gemini por servidor para no
// añadir dependencias nativas; el texto resultante se pega en el input del chat.
// ---------------------------------------------------------------------------

export async function transcribeAudioWithAI(params: {
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('transcribe', {
      body: { audioBase64: params.audioBase64, audioMimeType: params.audioMimeType },
    });
    if (error) {
      console.warn('[ai] transcribe error:', error.message);
      return null;
    }
    if (data?.fallback) return null;
    const text = typeof data?.texto === 'string' ? data.texto.trim() : '';
    return text || null;
  } catch (e) {
    console.warn('[ai] transcribe exception:', e);
    return null;
  }
}