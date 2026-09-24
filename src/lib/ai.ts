import { supabase } from './supabase';
import { DispatchStep, EmergencyCategory, EnvironmentalSubtype } from '../types';

// ---------------------------------------------------------------------------
// Capa de invocación de las Edge Functions de IA (Gemini) vía LangChain.
// - La clave de Gemini vive en Secrets de Supabase (nunca en el cliente).
// - Si la función aún no está desplegada o falla, devolvemos una respuesta
//   local (fallback) para no romper la UX del chat de emergencia.
// ---------------------------------------------------------------------------

export interface AIAnalysisResult {
  decision: 'proceed' | 'correct' | 'cancel';
  categoria_corregida?: EmergencyCategory | null;
  severidad: 'baja' | 'media' | 'alta' | 'critica';
  tipo_emergencia: string;
  confianza: number;
  motivo?: string;
  respuesta_asistente: string;
  mensaje_voz: string;
  eta_minutos?: number;
  unidad_recomendada?: string;
  base_origen?: string;
  /** ODS 12 — subtipo ambiental detectado por la IA (solo categoría ambiental) */
  subtipoAmbiental?: EnvironmentalSubtype | null;
  raw?: unknown;
}

export interface AnalyzeIncidentParams {
  reporteId?: number;
  incidentId?: string;
  categoria?: EmergencyCategory;
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
  /** ODS 12 — solo para categoria 'ambiental' */
  subtipoAmbiental?: EnvironmentalSubtype;
}

export interface AIRespondParams {
  reporteId?: number;
  incidentId?: string;
  categoria: EmergencyCategory;
  categoriaLabel?: string;
  unidad?: string;
  dispatchStep?: DispatchStep;
  historial?: { sender?: string; text: string }[];
  pregunta: string;
  /** ODS 12 — solo para categoria 'ambiental' */
  subtipoAmbiental?: EnvironmentalSubtype;
}

export interface AIRespondResult {
  respuesta: string;
  mensaje_voz?: string;
  siguiente_paso?: DispatchStep | null;
  finalizar?: boolean;
}

const FALLBACKS: Record<string, AIAnalysisResult> = {
  // ODS 12 — fallback del análisis ambiental: gravedad media y respuesta de
  // manejo seguro (alejarse y avisar), sin instrucciones de limpieza.
  ambiental: {
    decision: 'proceed',
    categoria_corregida: null,
    severidad: 'media',
    tipo_emergencia: 'Incidente Ambiental',
    confianza: 0.5,
    motivo: '',
    respuesta_asistente:
      'Incidente ambiental registrado. Prioridad MEDIA evaluada. Aléjate de la zona, mantén a otras personas lejos y espera a personal capacitado (bomberos o autoridad ambiental municipal). No intentes limpiar ni manipular la sustancia.',
    mensaje_voz: 'Incidente ambiental registrado. Aléjate de la zona y espera a personal capacitado.',
  },
  traffic: {
    decision: 'proceed',
    categoria_corregida: null,
    severidad: 'alta',
    tipo_emergencia: 'Accidente de Tránsito',
    confianza: 0.5,
    motivo: '',
    respuesta_asistente:
      'Audio recibido y analizado por IA acústica. Prioridad ALTA asignada. Espera a resguardo junto a la vía, señaliza el punto y no abandones a los afectados.',
    mensaje_voz: 'Unidad de respuesta táctica en camino. Mantén la calma y permanece a resguardo.',
  },
  fire: {
    decision: 'proceed',
    categoria_corregida: null,
    severidad: 'critica',
    tipo_emergencia: 'Incendio',
    confianza: 0.5,
    motivo: '',
    respuesta_asistente:
      'Incendio detectado. Prioridad CRÍTICA. Aléjate de la zona, no respires humo y evacúa a un punto seguro.',
    mensaje_voz: 'Evacúa de inmediato a un punto seguro y espera a los bomberos.',
  },
  medical: {
    decision: 'proceed',
    categoria_corregida: null,
    severidad: 'alta',
    tipo_emergencia: 'Emergencia Médica',
    confianza: 0.5,
    motivo: '',
    respuesta_asistente:
      'Emergencia médica registrada. Prioridad ALTA. No muevas al afectado salvo riesgo vital y espera a la ambulancia.',
    mensaje_voz: 'Mantén al afectado tranquilo y espera la ambulancia.',
  },
  robbery: {
    decision: 'proceed',
    categoria_corregida: null,
    severidad: 'alta',
    tipo_emergencia: 'Robo',
    confianza: 0.5,
    motivo: '',
    respuesta_asistente:
      'Robo en curso reportado. Prioridad ALTA. No te enfrentes al delincuente, resguárdate y espera a la unidad.',
    mensaje_voz: 'Resguárdate y espera a la patrulla.',
  },
};

export async function analyzeIncidentWithAI(
  params: AnalyzeIncidentParams
): Promise<AIAnalysisResult> {
  const fallback =
    FALLBACKS[params.categoria || 'traffic'] || FALLBACKS.traffic;

  try {
    const { data, error } = await supabase.functions.invoke('analyze-incident', {
      body: {
        reporteId: params.reporteId,
        incidentId: params.incidentId,
        categoria: params.categoria,
        texto: params.texto,
        descripcion: params.descripcion,
        audioTranscript: params.audioTranscript,
        audioBase64: params.audioBase64,
        audioMimeType: params.audioMimeType,
        fotoUrl: params.fotoUrl,
        fotoBase64: params.fotoBase64,
        mediaMimeType: params.mediaMimeType,
        videoBase64: params.videoBase64,
        videoMimeType: params.videoMimeType,
        subtipoAmbiental: params.subtipoAmbiental,
      },
    });

    if (error) {
      console.warn('[ai] analyze-incident error:', error.message);
      return fallback;
    }

    if (data?.fallback || !data?.respuesta_asistente) {
      return fallback;
    }

    return {
      decision: data.decision || fallback.decision,
      categoria_corregida: data.categoria_corregida ?? null,
      severidad: data.severidad || fallback.severidad,
      tipo_emergencia: data.tipo_emergencia || fallback.tipo_emergencia,
      confianza: data.confianza ?? fallback.confianza,
      motivo: data.motivo || '',
      respuesta_asistente: data.respuesta_asistente || fallback.respuesta_asistente,
      mensaje_voz: data.mensaje_voz || fallback.mensaje_voz,
      eta_minutos: typeof data.eta_minutos === 'number' ? data.eta_minutos : undefined,
      unidad_recomendada: data.unidad_recomendada || undefined,
      base_origen: data.base_origen || undefined,
      subtipoAmbiental: (data.subtipoAmbiental as EnvironmentalSubtype | null | undefined) ?? null,
      raw: data,
    };
  } catch (e) {
    console.warn('[ai] analyze-incident exception:', e);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Chat conversacional (Edge Function "ai-respond").
// ---------------------------------------------------------------------------

function respondFallback(params: AIRespondParams): AIRespondResult {
  const unidad = params.unidad ?? 'la unidad asignada';
  switch (params.dispatchStep) {
    case 'received':
    case 'classified':
      return {
        respuesta: `Tu reporte de ${params.categoriaLabel ?? params.categoria} está clasificado. ${unidad} ha sido asignada y está en preparación. Permanece a resguardo.`,
        siguiente_paso: 'resources_assigned',
      };
    case 'resources_assigned':
      return {
        respuesta: `${unidad} ya está en ruta hacia tu ubicación. El tiempo estimado de llegada se muestra en el mapa.`,
        siguiente_paso: 'en_route',
      };
    case 'en_route':
      return {
        respuesta: `${unidad} está por llegar. Confírmame cuando veas el vehículo para cerrar el despacho.`,
      };
    case 'resolved':
      return {
        respuesta: 'Este incidente ya finalizó. ¿Necesitas iniciar otro reporte?',
      };
    default:
      return {
        respuesta: 'Tu emergencia está siendo atendida. Mantén la calma y espera indicaciones de la unidad asignada.',
      };
  }
}

export async function aiRespond(params: AIRespondParams): Promise<AIRespondResult> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-respond', {
      body: {
        reporteId: params.reporteId,
        incidentId: params.incidentId,
        categoria: params.categoria,
        categoriaLabel: params.categoriaLabel,
        unidad: params.unidad,
        dispatchStep: params.dispatchStep,
        historial: params.historial,
        pregunta: params.pregunta,
        subtipoAmbiental: params.categoria === 'ambiental' ? params.subtipoAmbiental : undefined,
      },
    });

    if (error) {
      console.warn('[ai] ai-respond error:', error.message);
      return respondFallback(params);
    }

    if (data?.fallback || !data?.respuesta) {
      return respondFallback(params);
    }

    return {
      respuesta: data.respuesta,
      mensaje_voz: data.mensaje_voz || undefined,
      siguiente_paso: data.siguiente_paso ?? null,
      finalizar: data.finalizar ?? false,
    };
  } catch (e) {
    console.warn('[ai] ai-respond exception:', e);
    return respondFallback(params);
  }
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
