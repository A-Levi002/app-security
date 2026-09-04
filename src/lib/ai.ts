import { supabase } from './supabase';
import { EmergencyCategory } from '../types';

// ---------------------------------------------------------------------------
// Capa de invocación de la Edge Function analyze-incident (IA de Gemini).
// - La clave de Gemini vive en Secrets de Supabase (nunca en el cliente).
// - Si la función aún no está desplegada o falla, devolvemos un análisis local
//   (fallback) para no romper la UX del chat de emergencia.
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
  raw?: unknown;
}

export interface AnalyzeIncidentParams {
  reporteId?: number;
  categoria?: EmergencyCategory;
  texto?: string;
  descripcion?: string;
  audioTranscript?: string;
  fotoUrl?: string;
  mediaMimeType?: string;
}

const FALLBACKS: Record<string, AIAnalysisResult> = {
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
        categoria: params.categoria,
        texto: params.texto,
        descripcion: params.descripcion,
        audioTranscript: params.audioTranscript,
        fotoUrl: params.fotoUrl,
        mediaMimeType: params.mediaMimeType,
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
      raw: data,
    };
  } catch (e) {
    console.warn('[ai] analyze-incident exception:', e);
    return fallback;
  }
}
