import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Shield,
  ShieldAlert,
  Mic,
  Phone,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Sparkles,
  Play,
  Pause,
  Activity,
  Radio,
  Volume2,
  VolumeX,
  Camera,
  AlertTriangle,
  Video,
  X,
  RotateCw,
  LogOut,
  ImagePlus,
  Menu,
  Send,
  Leaf,
} from 'lucide-react-native';
import {
  EmergencyCategory,
  IncidentReport,
  ChatMessage,
  DispatchStep,
  IncidentSeverity,
  SystemSettings,
  EnvironmentalSubtype,
} from '../types';
import { LiveTrackingScreen } from '../screens/LiveTrackingScreen';
import { IncidentMap } from './IncidentMap';
import { DotPatternLayer } from './DotPatternLayer';
import { PlaceSearchModal } from './PlaceSearchModal';
import {
  aiChat,
  transcribeAudioWithAI,
  AIUnavailableError,
  AIChatMedia,
  AIChatResult,
  AIChatHistorialItem,
} from '../lib/ai';
import { reverseGeocode } from '../lib/locationApi';
import { PREVENCION_AMBIENTAL } from '../constants/prevencionAmbiental';
import { useNearbyFactories } from '../hooks/useNearbyFactories';
import { formatDistanceKm } from '../constants/industrialCatalog';

// ---------------------------------------------------------------------------
// AIEmergencyChatModal (React Native)
// - getUserMedia/MediaRecorder -> expo-camera (CameraView)
// - speechSynthesis -> expo-speech
// - <input type=file> + FileReader -> expo-image-picker
// - video playback -> expo-video (VideoView)
// - grabación de audio real -> expo-audio (useAudioRecorder / RecordingPresets)
// ---------------------------------------------------------------------------

interface AIEmergencyChatModalProps {
  category: EmergencyCategory;
  onClose: () => void;
  onSaveReport?: (report: IncidentReport) => void;
  onCallContact?: (name: string, phone?: string) => void;
  existingReport?: IncidentReport | null;
  theme?: 'dark' | 'light';
  settings?: Partial<SystemSettings>;
}

const CATEGORY_DETAILS: Record<EmergencyCategory, { label: string; unit: string; depot: string }> = {
  traffic: {
    label: 'Accidente Vial',
    unit: 'AMBULANCIA_T4',
    depot: 'Estación Central de Paramédicos',
  },
  fire: {
    label: 'Incendio',
    unit: 'BOMBEROS_B2',
    depot: 'Estación de Bomberos #4',
  },
  medical: {
    label: 'Emergencia Médica',
    unit: 'AMBULANCIA_M1',
    depot: 'Hospital General - Urgencias Tácticas',
  },
  robbery: {
    label: 'Robo / Intrusión',
    unit: 'PATRULLA_T8',
    depot: 'Comando de Respuesta Rápida Delta',
  },
  suspicious_person: {
    label: 'Persona Sospechosa',
    unit: 'PATRULLA_S3',
    depot: 'Módulo de Vigilancia K9',
  },
  violence: {
    label: 'Violencia / Agresión',
    unit: 'PATRULLA_INTERVENCION_V1',
    depot: 'Unidad de Intervención Inmediata',
  },
  vandalism: {
    label: 'Vandalismo',
    unit: 'UNIDAD_CONTROL_U6',
    depot: 'Base de Control Urbano',
  },
  ambiental: {
    label: 'Incidente Ambiental',
    unit: 'UNIDAD_AMBIENTAL_A1',
    depot: 'Autoridad Ambiental Municipal',
  },
  other: {
    label: 'Otro Incidente',
    unit: 'CENTRAL_DESPACHO_911',
    depot: 'Central de Despacho 911',
  },
};

// ODS 12 — subtipos ambientales mostrados al elegir la categoría Ambiental.
const ENVIRONMENTAL_SUBTYPE_OPTIONS: { value: EnvironmentalSubtype; label: string }[] = [
  { value: 'derrame_quimico', label: 'Derrame o fuga química' },
  { value: 'fuga_gas', label: 'Fuga de gas' },
  { value: 'quema_residuos', label: 'Quema de residuos' },
  { value: 'botadero_ilegal', label: 'Botadero ilegal' },
  { value: 'contaminacion_agua_suelo', label: 'Contaminación de agua o suelo' },
];

// Número de emergencia por defecto (Bolivia 911; los contactos de confianza y
// el despacho de unidades usan sus propios teléfonos).
const EMERGENCY_NUMBER = '911';

// Fase E — chips dinámicos de ayuda según el análisis (policía/ambulancia/etc.).
const TIPO_RESPUESTA_CALL: Record<string, { label: string; color: string }> = {
  policia: { label: 'LLAMAR A POLICÍA', color: '#2563eb' },
  ambulancia: { label: 'LLAMAR A AMBULANCIA', color: '#10b981' },
  bomberos: { label: 'LLAMAR A BOMBEROS', color: '#dc2626' },
};

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
let idSeq = 0;
const uid = (): string => `id-${Date.now()}-${idSeq++}`;

// Parámetros de un turno de triaje (texto o evidencia) re-ejecutables en Retry.
type TurnArgs = { mensajeActual: string; media?: AIChatMedia };

const audioMimeForUri = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  return 'audio/mp4';
};

// Reportes guardados antes de la versión con reloj real traen solo
// etaMinutes/etaSeconds. Les fijamos las marcas de tiempo al abrirlos para que
// el conteo siga con el reloj (no depende de que el chat esté abierto).
const ensureEtaTimestamps = (report: IncidentReport): IncidentReport => {
  if (report.etaTotalSeconds && report.etaStartedAt) return report;
  const hasRemaining = report.etaMinutes > 0 || report.etaSeconds > 0;
  if (!hasRemaining) return report;
  return {
    ...report,
    etaTotalSeconds: report.etaMinutes * 60 + report.etaSeconds,
    etaStartedAt: Date.now(),
  };
};

export const AIEmergencyChatModal: React.FC<AIEmergencyChatModalProps> = ({
  category,
  onClose,
  onSaveReport,
  onCallContact,
  existingReport,
  theme = 'dark',
  settings = {},
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';
  const categoryInfo = CATEGORY_DETAILS[category] || CATEGORY_DETAILS.traffic;
  const isAmbiental = category === 'ambiental';
  const fg = isLight ? '#000' : '#fff';
  const muted = '#8e9192';

  const [incident, setIncident] = useState<IncidentReport>(() => {
    if (existingReport) return ensureEtaTimestamps(existingReport);
    const now = new Date();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dateStr = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    return {
      id: `#REP-${Math.floor(1000 + Math.random() * 9000)}`,
      category,
      categoryLabel: categoryInfo.label,
      title: `${categoryInfo.label} en curso`,
      description: 'Reporte táctico transmitido a través de voz y telemetría IA.',
      severity: 'medium' as IncidentSeverity,
      status: 'in_progress',
      // Sin escalada prefijada: solo el triaje de la IA (emergencia + confianza
      // suficiente) fija unidad/severidad. Hasta entonces queda "recibido".
      dispatchStep: 'received',
      date: dateStr,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      unitAssigned: '',
      originDepot: '',
      etaMinutes: 0,
      etaSeconds: 0,
      location: 'Obteniendo ubicación...',
      coordinates: { lat: 0, lng: 0 },
      aiVoiceMessage: '',
    };
  });

  // Obtener ubicación GPS real al crear el incidente (import dinámico para
  // no crashear el chat si expo-location falla).
  useEffect(() => {
    if (existingReport) return;
    let cancelled = false;
    (async () => {
      try {
        const Location = await import('expo-location');
        if (cancelled) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setIncident(prev => (cancelled ? prev : { ...prev, location: 'Permiso de ubicación denegado' }));
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        let addr = '';
        try {
          addr = (await reverseGeocode(latitude, longitude)) || '';
        } catch {
          // reverse geocoding puede fallar; usamos coordenadas numéricas
        }
        if (cancelled) return;
        setIncident(prev => ({ ...prev, location: addr || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, coordinates: { lat: latitude, lng: longitude } }));
      } catch {
        if (!cancelled) {
          setIncident(prev => ({ ...prev, location: 'No se pudo obtener ubicación' }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingReport]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (existingReport) {
      const history = existingReport.chat;
      if (history && history.length > 0) return history;
      return [
        { id: 'init-1', sender: 'ai', text: `Incidente activo ${existingReport.id} (${existingReport.categoryLabel}). Seguimiento táctico satelital en tiempo real.`, timestamp: 'Ahora' },
        { id: 'tracking-card', sender: 'system', text: 'Mapa de seguimiento satelital y estado del despacho', timestamp: 'En Vivo', type: 'live_tracking_card' },
      ];
    }
    return [
      {
        id: `ai-init-${uid()}`,
        sender: 'ai' as const,
        text: isAmbiental
          ? `Hola, soy SECURE_OS CORE. Cuéntame qué incidente ambiental estás viendo o adjunta una FOTO del lugar, envase o humo; la IA identifica la sustancia y el riesgo. Solo se movilizan unidades si confirmo un riesgo real.`
          : `Hola, soy SECURE_OS CORE. Cuéntame qué emergencia estás viendo: escribe, graba un audio describiendo la situación o adjunta foto/video de la evidencia. Solo se despachan unidades si confirmo un riesgo real.`,
        timestamp: 'Ahora',
      },
    ];
  });

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;
  const recordingMs = recorderState.durationMillis;

  // Corte automático por duración (dictado 45 s, audio de gravedad 90 s) con
  // un timer, no un effect que llame setState.
  const recordingLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRecordingLimit = () => {
    if (recordingLimitTimerRef.current) {
      clearTimeout(recordingLimitTimerRef.current);
      recordingLimitTimerRef.current = null;
    }
  };
  const scheduleRecordingLimit = (limitMs: number, onReached: () => void) => {
    clearRecordingLimit();
    recordingLimitTimerRef.current = setTimeout(onReached, limitMs);
  };

  // Limpia el timer de corte al desmontar el chat.
  useEffect(() => () => { clearRecordingLimit(); }, []);

  const [aiVoiceEnabled, setAIVoiceEnabled] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  // Error del último turno de IA: burbuja visible con "Reintentar" + llamada.
  const [aiError, setAiError] = useState<string | null>(null);
  const retryRef = useRef<{ payload: TurnArgs; base: ChatMessage[] } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showFullMapModal, setShowFullMapModal] = useState(false);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showQuickRail, setShowQuickRail] = useState(false);

  // ODS 12 — subtipo ambiental elegido para esta categoría y tarjeta de
  // prevención (se muestra tras el primer envío del reporte).
  const [subtipoAmbiental, setSubtipoAmbiental] = useState<EnvironmentalSubtype | null>(
    category === 'ambiental' && existingReport?.subtipoAmbiental ? existingReport.subtipoAmbiental : null
  );
  // Subtipo cuya tarjeta de prevención ya fue cerrada con "Entendido" (latch).
  // Si la IA infiere un subtipo distinto después, la tarjeta se actualiza.
  const [prevencionDismissedFor, setPrevencionDismissedFor] = useState<EnvironmentalSubtype | null>(null);

  const [showLiveCameraModal, setShowLiveCameraModal] = useState(false);
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<ScrollView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Auto scroll to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollToEnd({ animated: true });
  }, [messages, isRecording]);

  // ETA basado en reloj real: el cómputo vive dentro de TrackingCard (tick local)
  // y usa etaTotalSeconds+etaStartedAt desde el momento de la asignación, de modo
  // que el conteo SIGUE aunque el chat esté cerrado.

  // Guarda el hilo completo en el expediente del incidente (para el historial).
  // Devuelve el IncidentReport guardado para que los callers lo usen como única
  // fuente de verdad (evita guardar de nuevo objetos stale derivados del closure).
  const appendAndSave = (nextMessages: ChatMessage[], extraPatch?: Partial<IncidentReport>): IncidentReport => {
    setMessages(nextMessages);
    const updated = { ...incident, ...extraPatch, chat: nextMessages };
    setIncident(updated);
    if (onSaveReport) onSaveReport(updated);
    return updated;
  };

  // ODS 12 — tarjeta de prevención: estado derivado en render (sin effects).
  // Se muestra cuando ya hay reporte guardado y no ha sido cerrada para el
  // subtipo actual; no aparece si la IA canceló el reporte.
  const alreadySaved = messages.length > 1 || !!existingReport;
  const showPrevencionCard =
    category === 'ambiental' &&
    !!subtipoAmbiental &&
    incident.status !== 'resolved' &&
    alreadySaved &&
    subtipoAmbiental !== prevencionDismissedFor;

  const triageToSeverity = (s?: AIChatResult['severidad']): IncidentSeverity => {
    switch (s) {
      case 'critica':
        return 'critical';
      case 'alta':
        return 'high';
      case 'media':
        return 'medium';
      default:
        return 'low';
    }
  };

  // Historial SOLO textual (sin base64) para el triaje: medios como tipo + texto.
  const toHistorial = (base: ChatMessage[]): AIChatHistorialItem[] =>
    base.slice(-10).map((m) => {
      const sender = m.sender === 'ai' ? 'asistente' : 'ciudadano';
      if (m.type === 'photo') return { sender, kind: 'photo', transcript: m.text };
      if (m.type === 'video') return { sender, kind: 'video', transcript: m.text };
      if (m.type === 'audio') {
        return { sender, kind: 'audio', transcript: m.audioTranscript || m.text };
      }
      if (m.type === 'live_tracking_card') {
        return { sender: 'ciudadano', kind: 'live_tracking_card' };
      }
      return { sender, kind: 'text', text: m.text };
    });

  const ensureTrackingCard = (nextChat: ChatMessage[]): ChatMessage[] => {
    if (nextChat.some((m) => m.type === 'live_tracking_card')) return nextChat;
    return [...nextChat, { id: 'tracking-card', sender: 'system', text: 'Seguimiento satelital y telemetría de rescate', timestamp: 'En Vivo', type: 'live_tracking_card' }];
  };

  const resolveIncidentPatch = (): Partial<IncidentReport> => ({
    status: 'resolved',
    dispatchStep: 'resolved',
    etaMinutes: 0,
    etaSeconds: 0,
    etaTotalSeconds: 0,
    etaStartedAt: undefined,
  });

  // Aplica la decisión del triaje por turno (sin_riesgo | dudoso | emergencia).
  // NUNCA inventa despacho: solo se movilizan unidades si la IA emite
  // "emergencia" con confianza suficiente y un recurso concreto.
  const applyTriageOutcome = (base: ChatMessage[], triage: AIChatResult) => {
    const severity = triageToSeverity(triage.severidad ?? undefined);
    // ODS 12: subtipo viaja en el expediente — elección del usuario > IA > ya guardado.
    const subtipoResuelto: EnvironmentalSubtype | undefined =
      subtipoAmbiental ?? triage.subtipoAmbiental ?? incident.subtipoAmbiental;
    const subtipoPatch: Partial<IncidentReport> =
      category === 'ambiental' && subtipoResuelto ? { subtipoAmbiental: subtipoResuelto } : {};
    if (category === 'ambiental' && subtipoResuelto && !subtipoAmbiental) {
      setSubtipoAmbiental(subtipoResuelto);
    }
    // Fase E — sustancia identificada y servicio recomendado.
    const aiEvidencePatch: Partial<IncidentReport> = {
      ...(triage.sustancia_detectada ? { sustanciaDetectada: triage.sustancia_detectada } : {}),
      ...(triage.tipo_respuesta ? { tipoRespuesta: triage.tipo_respuesta } : {}),
    };

    const withFinalize = (
      patch: Partial<IncidentReport>,
      chat: ChatMessage[]
    ): { patch: Partial<IncidentReport>; chat: ChatMessage[] } => {
      if (!triage.finalizar) return { patch, chat };
      return {
        patch: { ...patch, ...resolveIncidentPatch() },
        chat: [...chat, { id: `sys-done-${uid()}`, sender: 'system', text: 'Incidente finalizado.', timestamp: nowTime() }],
      };
    };

    // sin_riesgo: no hay emergencia real → sin despacho. Si además la IA marca
    // guardar_reporte=false (broma/prueba) el incidente se cierra sin registro.
    if (triage.decision === 'sin_riesgo') {
      const sysNo: ChatMessage = { id: `sys-norisk-${uid()}`, sender: 'system', text: 'No se generó un despacho.', timestamp: nowTime() };
      const aiMsg: ChatMessage = { id: `ai-norisk-${uid()}`, sender: 'ai', text: triage.respuesta, timestamp: nowTime() };
      const patch: Partial<IncidentReport> = {
        ...subtipoPatch,
        ...aiEvidencePatch,
        severity,
        dispatchStep: 'received',
        status: 'in_progress',
      };
      if (!triage.guardar_reporte) {
        Object.assign(patch, resolveIncidentPatch(), { unitAssigned: '', originDepot: '' });
      }
      const nextChat = [...base, sysNo, aiMsg];
      appendAndSave(nextChat, patch);
      if (aiVoiceEnabled) speakAI('No se generó un despacho. Sin una emergencia confirmada no se movilizan unidades.');
      return;
    }

    // dudoso, o emergencia con confianza baja: responder pidiendo confirmar con
    // más evidencia; NO se despacha nada.
    if (triage.decision === 'dudoso' || (triage.decision === 'emergencia' && triage.confianza < 0.6)) {
      const aiMsg: ChatMessage = { id: `ai-confirm-${uid()}`, sender: 'ai', text: triage.respuesta, timestamp: nowTime() };
      const patch: Partial<IncidentReport> = {
        ...subtipoPatch,
        ...aiEvidencePatch,
        severity,
        dispatchStep: 'received',
        status: 'in_progress',
      };
      const { patch: fPatch, chat: fChat } = withFinalize(patch, [...base, aiMsg]);
      appendAndSave(fChat, fPatch);
      if (aiVoiceEnabled && triage.respuesta) speakAI(triage.respuesta);
      return;
    }

    // emergencia confirmada (confianza >= 0.6).
    const trackingBase = ensureTrackingCard(base);
    const correctedKey = triage.categoria_corregida && triage.categoria_corregida !== incident.category
      && CATEGORY_DETAILS[triage.categoria_corregida] ? triage.categoria_corregida : null;
    const corrected = correctedKey ? CATEGORY_DETAILS[correctedKey] : null;
    const unidad = triage.unidad_recomendada || (corrected ? corrected.unit : '');
    // Sin un recurso concreto la IA no habilitó despacho real → dudoso.
    if (!unidad) {
      const aiMsg: ChatMessage = { id: `ai-sinunidad-${uid()}`, sender: 'ai', text: triage.respuesta, timestamp: nowTime() };
      const patch: Partial<IncidentReport> = {
        ...subtipoPatch,
        ...aiEvidencePatch,
        severity,
        dispatchStep: 'received',
        status: 'in_progress',
      };
      const { patch: fPatch, chat: fChat } = withFinalize(patch, [...trackingBase, aiMsg]);
      appendAndSave(fChat, fPatch);
      if (aiVoiceEnabled && triage.respuesta) speakAI(triage.respuesta);
      return;
    }
    const baseOrigen = triage.base_origen || (corrected ? corrected.depot : '');
    const eta = triage.eta_minutos ?? 0;
    const textExtra = corrected
      ? `\n\nSe reclasificó el incidente a ${corrected.label} (antes ${incident.categoryLabel}).`
      : '';
    const aiMsg: ChatMessage = { id: `ai-escala-${uid()}`, sender: 'ai', text: `${triage.respuesta}${textExtra}`, timestamp: nowTime() };
    const patch: Partial<IncidentReport> = {
      ...subtipoPatch,
      ...aiEvidencePatch,
      severity,
      status: 'in_progress',
      dispatchStep: 'en_route',
      unitAssigned: unidad,
      originDepot: baseOrigen,
      ...(eta > 0 ? { etaMinutes: eta, etaSeconds: 0, etaTotalSeconds: eta * 60, etaStartedAt: Date.now() } : {}),
      ...(correctedKey
        ? { category: correctedKey, categoryLabel: corrected!.label, title: `${corrected!.label} en curso` }
        : {}),
    };
    const { patch: fPatch, chat: fChat } = withFinalize(patch, [...trackingBase, aiMsg]);
    appendAndSave(fChat, fPatch);
    if (aiVoiceEnabled) speakAI(`Despacho confirmado. ${unidad} en camino a tu ubicación.`);
  };

  // Turno completo de triaje: una sola llamada a ai-chat con el historial en
  // texto y (opcionalmente) la evidencia media del turno actual. En error se
  // guarda el payload para "Reintentar" (burbuja de error real, sin fallbacks).
  const performTurn = async (base: ChatMessage[], payload: TurnArgs) => {
    setIsResponding(true);
    setAiError(null);
    try {
      const triage = await aiChat({
        categoria: incident.category,
        categoriaLabel: incident.categoryLabel,
        historial: toHistorial(base),
        mensajeActual: payload.mensajeActual,
        subtipoAmbiental:
          category === 'ambiental' ? subtipoAmbiental ?? incident.subtipoAmbiental : undefined,
        unidadAsignada: incident.unitAssigned,
        dispatchStep: incident.dispatchStep,
        media: payload.media,
      });
      retryRef.current = null;
      applyTriageOutcome(base, triage);
    } catch (e) {
      const msg =
        e instanceof AIUnavailableError
          ? e.message
          : 'No se pudo conectar con la IA. Revisa tu conexión.';
      retryRef.current = { payload, base };
      setAiError(msg);
    } finally {
      setIsResponding(false);
    }
  };

  const retryTurn = () => {
    const r = retryRef.current;
    if (!r || isResponding) return;
    performTurn(r.base, r.payload);
  };

  // Voz IA: reproduce SOLO el texto real del triaje o del despacho. Nunca debe
  // haber frases estáticas haciéndose pasar por despacho de unidades.
  const speakAI = (text: string) => {
    if (!text) return;
    Speech.speak(text, { language: 'es-ES', rate: 0.95, onDone: () => { Speech.stop(); }, onStopped: () => { Speech.stop(); }, onError: () => { Speech.stop(); } });
  };

  // Interruptor para activar/desactivar la lectura por voz automática.
  const toggleAIVoice = () => {
    if (aiVoiceEnabled) {
      setAIVoiceEnabled(false);
      Speech.stop();
    } else {
      setAIVoiceEnabled(true);
    }
  };

  const dispatchPhotoMessage = async (photoUrl: string) => {
    const photoMsg: ChatMessage = {
      id: `usr-img-${uid()}`,
      sender: 'user',
      text: 'Evidencia fotográfica en tiempo real de la escena',
      timestamp: nowTime(),
      type: 'photo',
      photoUrl,
    };
    const withPhoto = ensureTrackingCard([...messages, photoMsg]);
    appendAndSave(withPhoto, { imageUrl: photoUrl });

    // Foto redimensionada <=1024px (JPEG q0.7) ANTES de leerla a base64: la
    // lectura en el hilo de UI y el body del triaje deben ser ligeros (ANR).
    let resizedUri = photoUrl;
    try {
      const resized = await manipulateAsync(
        photoUrl,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: SaveFormat.JPEG }
      );
      if (resized?.uri) resizedUri = resized.uri;
    } catch {}

    let fotoBase64: string | undefined;
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const fileInfo = await FileSystem.getInfoAsync(resizedUri);
      if (fileInfo.exists) {
        fotoBase64 = await FileSystem.readAsStringAsync(resizedUri, { encoding: FileSystem.EncodingType.Base64 });
      }
    } catch {}

    // Auto-análisis inmediato de la foto (una sola llamada, sin botón).
    await performTurn(withPhoto, {
      mensajeActual: 'El ciudadano envió una FOTO de la evidencia en la escena.',
      media: fotoBase64 ? { fotoBase64, mediaMimeType: 'image/jpeg' } : undefined,
    });
  };

  const dispatchVideoMessage = async (videoUrl: string) => {
    const videoMsg: ChatMessage = { id: `usr-vid-${uid()}`, sender: 'user', text: 'Evidencia de video grabada en la escena', timestamp: nowTime(), type: 'video', videoUrl };
    const withVideo = ensureTrackingCard([...messages, videoMsg]);
    appendAndSave(withVideo, {});

    // Video BREVE (recordAsync corta la grabación): solo así viaja inline a
    // Gemini. Si el archivo excede el límite, la evidencia va como texto.
    let videoBase64: string | undefined;
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const fileInfo = await FileSystem.getInfoAsync(videoUrl);
      if (fileInfo.exists && fileInfo.size && fileInfo.size <= 4 * 1024 * 1024) {
        videoBase64 = await FileSystem.readAsStringAsync(videoUrl, { encoding: FileSystem.EncodingType.Base64 });
      }
    } catch {}

    await performTurn(withVideo, {
      mensajeActual: 'El ciudadano envió un VIDEO breve de la evidencia en la escena.',
      media: videoBase64 ? { videoBase64, videoMimeType: 'video/mp4' } : undefined,
    });
  };

  // Grabación de audio REAL con expo-audio
  const startAudioRecording = async () => {
    if (incident.status === 'resolved' || isRecording) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setCameraError('Se requiere el permiso de micrófono para grabar audio.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      scheduleRecordingLimit(90000, () => { stopAudioRecording(); });
    } catch {
      setCameraError('No se pudo iniciar la grabación de audio.');
    }
  };

  async function stopAudioRecording() {
    clearRecordingLimit();
    if (!isRecording) return;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        setCameraError('No se pudo procesar el audio.');
        return;
      }
      const seconds = Math.max(1, Math.round(recordingMs / 1000));
      const audioDurationStr = `0:${String(seconds).padStart(2, '0')}`;
      const mime = audioMimeForUri(uri);

      // Base64 + transcripción por voz (para robustecer el análisis de la IA:
      // aunque Gemini no decodifique el m4a, la transcripción llega como texto).
      let audioBase64: string | undefined;
      let transcript: string | null = null;
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          transcript = await transcribeAudioWithAI({ audioBase64, audioMimeType: mime });
        }
      } catch {
        // Si falla la lectura o transcripción, enviamos sin audio
      }

      const userAudioMsg: ChatMessage = { id: `usr-aud-${uid()}`, sender: 'user', text: 'Nota de voz de emergencia (Gravedad evaluada)', timestamp: nowTime(), type: 'audio', audioDuration: audioDurationStr, audioUrl: uri, audioTranscript: transcript || undefined };
      const base = [...messages, userAudioMsg];
      appendAndSave(base, { audioNote: uri });
      // El audio viaja SOLO como transcripción (nunca base64): más rápido y
      // ligero. La IA escucha la transcripción junto con el historial.
      await performTurn(base, {
        mensajeActual: transcript
          ? `Audio del ciudadano (transcrito): ${transcript}`
          : 'El ciudadano envió un AUDIO de voz describiendo la situación.',
      });
    } catch {
      setCameraError('No se pudo procesar el audio.');
    }
  };

  // Voz → texto: mantén presionado el mic, habla y al soltar se transcribe el
  // texto al input del chat (Edge Function "transcribe" con Gemini).
  const startVoiceDictation = async () => {
    if (isResolved || isResponding || isRecording) return;
    setIsDictating(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setCameraError('Se requiere el permiso de micrófono para dictar por voz.');
        setIsDictating(false);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      scheduleRecordingLimit(45000, () => { stopVoiceDictation(); });
    } catch {
      setIsDictating(false);
      setCameraError('No se pudo iniciar el dictado por voz.');
    }
  };

  async function stopVoiceDictation() {
    clearRecordingLimit();
    setIsDictating(false);
    if (!isRecording) return;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        setCameraError('No se pudo procesar el dictado por voz.');
        return;
      }
      // Toques accidentales (muy cortos) se descartan en silencio.
      if (recordingMs < 700) return;

      let audioBase64: string | undefined;
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      } catch {}

      setIsTranscribing(true);
      const texto = await transcribeAudioWithAI({ audioBase64, audioMimeType: audioMimeForUri(uri) });
      setIsTranscribing(false);

      if (texto) {
        setChatInput((prev) => (prev && prev.trim() ? `${prev.trim()} ${texto}` : texto));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setCameraError('No se entendió el audio. Intenta de nuevo.');
      }
    } catch {
      setIsTranscribing(false);
      setCameraError('No se pudo procesar el dictado por voz.');
    }
  };

  // Límite de duración de grabación (dictado 45 s, audio 90 s) resuelto con
  // timers programados al iniciar cada grabación (scheduleRecordingLimit).

  // Foto desde galería
  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setCameraError('No se pudo acceder a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      dispatchPhotoMessage(result.assets[0].uri);
    }
  };

  const handleResolveIncident = () => {
    const resolveMsg: ChatMessage = { id: `system-${uid()}`, sender: 'system', text: 'Incidente finalizado.', timestamp: nowTime() };
    appendAndSave([...messages, resolveMsg], { status: 'resolved', dispatchStep: 'resolved', etaMinutes: 0, etaSeconds: 0, etaTotalSeconds: 0, etaStartedAt: undefined });
  };

  // Conversación libre con la IA → triaje por turno (Edge Function ai-chat).
  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || isResponding || isResolved) return;
    setChatInput('');

    const userMsg: ChatMessage = { id: `usr-txt-${uid()}`, sender: 'user', text, timestamp: nowTime() };
    const base = [...messages, userMsg];
    appendAndSave(base);

    // Un solo camino de IA: el triaje responde el texto y decide si hay despacho.
    await performTurn(base, { mensajeActual: text });
  };

  // Cámara en vivo
  const openCamera = (mode: 'picture' | 'video') => {
    setCameraError(null);
    setCameraMode(mode);
    setShowLiveCameraModal(true);
    if (!cameraPermission?.granted) {
      requestCameraPermission();
    }
  };

  const closeCamera = () => {
    if (isRecordingVideo) stopVideoRecording();
    setShowLiveCameraModal(false);
    setCameraError(null);
  };

  const toggleFacing = () => setFacing((prev) => (prev === 'back' ? 'front' : 'back'));

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, shutterSound: false });
      if (photo?.uri) {
        closeCamera();
        dispatchPhotoMessage(photo.uri);
      }
    } catch {
      setCameraError('No se pudo capturar la foto. Intenta de nuevo.');
    }
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecordingVideo) return;
    setIsRecordingVideo(true);
    setVideoRecordingSeconds(0);
    videoTimerRef.current = setInterval(() => setVideoRecordingSeconds((prev) => prev + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 18, maxFileSize: 4 * 1024 * 1024 });
      setIsRecordingVideo(false);
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (video?.uri) {
        closeCamera();
        dispatchVideoMessage(video.uri);
      }
    } catch {
      setIsRecordingVideo(false);
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      setCameraError('No se pudo grabar el video. Intenta de nuevo.');
    }
  };

  const stopVideoRecording = () => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    cameraRef.current?.stopRecording();
  };

  const timelineSteps: { id: DispatchStep; label: string }[] = [
    { id: 'received', label: 'Recibido' },
    { id: 'classified', label: 'Clasificado' },
    { id: 'resources_assigned', label: 'Asignado' },
    { id: 'en_route', label: 'En Ruta' },
    { id: 'resolved', label: 'Resuelto' },
  ];
  const currentStepIndex = timelineSteps.findIndex((s) => s.id === incident.dispatchStep);
  const isResolved = incident.status === 'resolved';

  // Efectos de emergencia en runtime según los ajustes:
  // - chime de confirmación SOS (o modo silencioso)
  // - vibración de emergencia intensa
  // - atenuar brillo si la pantalla discreta está activa
  useEffect(() => {
    const playChime = !settings.silentAlarmMode && settings.sosAudioChime !== false;
    if (playChime) {
      try {
        AudioModule.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      } catch {}
    }
    if (settings.hapticEmergencyVibe !== false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    let restoreBrightness: (() => void) | undefined;
    if (settings.screenPrivacyShield) {
      (async () => {
        try {
          const Brightness = await import('expo-brightness');
          const prev = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(0.08);
          restoreBrightness = () => {
            Brightness.setBrightnessAsync(prev).catch(() => {});
          };
        } catch {}
      })();
    }

    return () => {
      if (restoreBrightness) restoreBrightness();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSafeClose = () => {
    if (settings.confirmCancelEmergency !== false && !isResolved) {
      setShowExitConfirm(true);
      return;
    }
    onClose();
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    onClose();
  };

  const cancelExit = () => setShowExitConfirm(false);

  // Selector de subtipo ambiental (no bloquea): se muestra en la fase de audio
  // (por compatibilidad) y en la fase de foto (flujo ambiental imagen-primero).
  const renderAmbientSubtypeChips = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
      {ENVIRONMENTAL_SUBTYPE_OPTIONS.map((opt) => {
        const active = subtipoAmbiental === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setSubtipoAmbiental(opt.value)}
            style={[
              styles.envSubtypeChip,
              {
                borderColor: active ? '#22c55e' : isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
                backgroundColor: active ? 'rgba(34,197,94,0.15)' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
              },
            ]}
          >
            <Text style={{ color: active ? '#22c55e' : muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={[styles.overlay, { backgroundColor: isLight ? '#f7f7f8' : '#0c0c0d' }]}>
      {/* Retícula de puntitos de fondo */}
      <DotPatternLayer
        color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
        dotRadius={1.3}
        opacity={0.6}
      />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderBottomColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', paddingTop: 4 + insets.top }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleSafeClose} style={[styles.iconBtn, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
            <ArrowLeft size={18} color={fg} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Shield size={16} color={fg} />
          </View>
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.headerTitle, { color: fg }]}>SECURE_OS CORE</Text>
              <View style={styles.liveDot} />
            </View>
            <Text style={[styles.headerSub, { color: muted }]}>{categoryInfo.label}{' // '}{incident.id}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {isResolved ? (
            <View style={styles.resolvedBadge}>
              <CheckCircle2 size={14} color="#10b981" />
              <Text style={styles.resolvedText}>Resuelto</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.voiceBtn, { backgroundColor: aiVoiceEnabled ? '#10b981' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}
              onPress={toggleAIVoice}
            >
              {aiVoiceEnabled ? <Volume2 size={16} color="#fff" /> : <VolumeX size={16} color={fg} />}
              <Text style={{ color: aiVoiceEnabled ? '#fff' : fg, fontSize: 10, fontWeight: '700' }}>Voz {aiVoiceEnabled ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Conversation Thread */}
      <ScrollView
        ref={chatBottomRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Protocol timeline */}
        <View style={[styles.timelineCard, { backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,22,0.8)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
          <View style={styles.timelineHeader}>
            <Text style={[styles.timelineLabel, { color: muted }]}>PROTOCOLO DE DESPACHO</Text>
            <Text style={styles.timelineUnit}>{incident.unitAssigned}</Text>
          </View>
          <View style={styles.timelineRow}>
            {timelineSteps.map((st, idx) => {
              const isActive = idx <= currentStepIndex;
              return (
                <View key={st.id} style={styles.timelineItem}>
                  <View style={[styles.timelineBar, isActive ? { backgroundColor: '#10b981' } : isLight ? { backgroundColor: 'rgba(0,0,0,0.1)' } : { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                  <Text style={[styles.timelineStepLabel, { color: isActive ? fg : muted, fontWeight: isActive ? '700' : '400' }]} numberOfLines={1}>{st.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {messages.map((msg) => {
          if (msg.type === 'live_tracking_card') {
            return (
              <TrackingCard
                key={msg.id}
                incident={incident}
                isResolved={isResolved}
                isLight={isLight}
                fg={fg}
                muted={muted}
                onExpand={() => setShowFullMapModal(true)}
                onEtaExpired={handleResolveIncident}
              />
            );
          }

          const isAI = msg.sender === 'ai';
          const isUser = msg.sender === 'user';

          return (
            <View key={msg.id} style={[styles.bubbleRow, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
              <View style={[styles.bubbleWrap, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
                <View style={styles.bubbleInner}>
                  {isAI && (
                    <View style={[styles.aiAvatar, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                      <Sparkles size={14} color={fg} />
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isUser
                        ? isLight ? { backgroundColor: '#000' } : { backgroundColor: '#fff' }
                        : isLight ? { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' } : { backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
                      { maxWidth: '85%', borderBottomLeftRadius: isAI ? 2 : 16, borderBottomRightRadius: isUser ? 2 : 16 },
                    ]}
                  >
                    {msg.type === 'photo' && msg.photoUrl && (
                      <Image source={{ uri: msg.photoUrl }} style={styles.msgPhoto} resizeMode="cover" />
                    )}
                    {msg.type === 'video' && msg.videoUrl && (
                      <VideoMessage uri={msg.videoUrl} />
                    )}
                    {msg.type === 'audio' && (
                      <AudioBubble msg={msg} isUser={isUser} isLight={isLight} />
                    )}
                    <Text style={{ color: isUser ? (isLight ? '#fff' : '#000') : fg, fontSize: 13, lineHeight: 19 }}>{msg.text}</Text>
                  </View>
                </View>
                <Text style={[styles.bubbleTime, { color: muted }]}>{msg.timestamp}</Text>
              </View>
            </View>
          );
        })}
        {isResponding && (
          <View style={[styles.bubbleRow, { alignItems: 'flex-start' }]}>
            <View style={[styles.bubbleWrap, { alignItems: 'flex-start' }]}>
              <View style={styles.bubbleInner}>
                <View style={[styles.aiAvatar, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                  <Sparkles size={14} color={fg} />
                </View>
                <View
                  style={[
                    styles.bubble,
                    isLight ? { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' } : { backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
                    { maxWidth: '85%', borderBottomLeftRadius: 2 },
                  ]}
                >
                  <View style={styles.analyzingRow}>
                    <Activity size={14} color="#8b5cf6" />
                    <Text style={[styles.monoTiny, { color: '#8b5cf6' }]}>CORE está respondiendo…</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
        {aiError && (
          <View style={[styles.bubbleRow, { alignItems: 'flex-start' }]}>
            <View style={[styles.bubbleWrap, { alignItems: 'flex-start' }]}>
              <View style={styles.bubbleInner}>
                <View style={[styles.aiAvatar, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                  <AlertTriangle size={15} color="#ef4444" />
                </View>
                <View
                  style={[
                    styles.bubble,
                    { borderColor: 'rgba(239,68,68,0.5)', borderWidth: 1, maxWidth: '85%', borderBottomLeftRadius: 2 },
                    isLight ? { backgroundColor: '#fff' } : { backgroundColor: '#141416' },
                  ]}
                >
                  <Text style={[styles.monoTiny, { color: '#ef4444', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }]}>Falla de comunicación IA</Text>
                  <Text style={{ color: fg, fontSize: 13, lineHeight: 19 }}>{aiError}</Text>
                  <View style={[styles.trackingEtaRow, { marginTop: 10, flexWrap: 'wrap', gap: 8 }]}>
                    <TouchableOpacity
                      style={[styles.primaryPill, { backgroundColor: '#ef4444' }]}
                      onPress={retryTurn}
                      disabled={isResponding}
                      accessibilityLabel="Reintentar el análisis con IA"
                    >
                      {isResponding ? <Activity size={13} color="#fff" /> : <RotateCw size={13} color="#fff" />}
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Reintentar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryPill, isLight ? styles.primaryLight : styles.primaryDark]}
                      onPress={() => onCallContact && onCallContact('911', EMERGENCY_NUMBER)}
                      accessibilityLabel="Llamar al 911"
                    >
                      <Phone size={13} color={isLight ? '#fff' : '#000'} />
                      <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Llamar 911</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer: chat libre + llamadas discretas + escalada confirmada por triaje */}
      <View style={[styles.footer, { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderTopColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', paddingBottom: 16 + insets.bottom }]}>
        {isResolved ? (
          <View style={styles.resolvedFooter}>
            <View style={[styles.trackingEtaRow, styles.resolvedFooterTitleRow]}>
              <CheckCircle2 size={16} color="#10b981" />
              <Text style={[styles.resolvedFooterTitle, { color: '#10b981' }]}>Incidente finalizado</Text>
            </View>
            <TouchableOpacity style={[styles.bigPrimary, styles.resolvedSalir, isLight ? styles.primaryLight : styles.primaryDark]} onPress={onClose}>
              <LogOut size={16} color={isLight ? '#fff' : '#000'} />
              <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>Salir del Chat</Text>
            </TouchableOpacity>
          </View>
) : (
          <View style={styles.chatControls}>
              {/* ODS 12 — selector de subtipo ambiental (no bloquea el flujo) */}
              {isAmbiental && renderAmbientSubtypeChips()}
              {/* Llamadas discretas de emergencia — siempre visibles, sin estridencia. */}
              <View style={styles.callChipsRow}>
                {[
                  { label: 'POLICÍA 110', phone: '110', color: '#2563eb' },
                  { label: 'BOMBEROS 119', phone: '119', color: '#dc2626' },
                  { label: '911', phone: EMERGENCY_NUMBER, color: '#10b981' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.phone}
                    style={[styles.callChip, { backgroundColor: c.color }]}
                    onPress={() => onCallContact && onCallContact(c.label, c.phone)}
                    accessibilityLabel={`Llamar ${c.label}`}
                  >
                    <Phone size={12} color="#fff" />
                    <Text style={styles.callChipText}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Fase E — chip del servicio recomendado por el triaje: SOLO si hubo
                  escalada real (unidad asignada por la IA, confianza >= 0.6). */}
              {incident.tipoRespuesta && incident.unitAssigned && !isResolved &&
                TIPO_RESPUESTA_CALL[incident.tipoRespuesta] && (
                  <View style={styles.respuestaChips}>
                    <Text style={[styles.monoTiny, { color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                      AYUDA RECOMENDADA POR EL ANÁLISIS
                    </Text>
                    {(() => {
                      const opt = TIPO_RESPUESTA_CALL[incident.tipoRespuesta!];
                      return (
                        <TouchableOpacity
                          style={[styles.respuestaChip, { backgroundColor: opt.color }]}
                          onPress={() => onCallContact && onCallContact(opt.label.replace('LLAMAR A ', ''), EMERGENCY_NUMBER)}
                          accessibilityLabel={opt.label}
                        >
                          <Phone size={15} color="#fff" />
                          <Text style={styles.respuestaChipText}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                )}
              {/* Barra lateral de acciones rápidas (al costado, tipo IA) */}
              {showQuickRail && (
                <View style={[styles.quickRail, { backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,22,0.96)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
                  <TouchableOpacity style={styles.railItem} onPress={() => { setShowQuickRail(false); openCamera('picture'); }}>
                    <Camera size={16} color={fg} />
                    <Text style={styles.railItemLabel}>Cámara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.railItem} onPress={() => { setShowQuickRail(false); openCamera('video'); }}>
                    <Video size={16} color="#ef4444" />
                    <Text style={styles.railItemLabel}>Video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.railItem} onPress={() => { setShowQuickRail(false); if (isRecording) stopAudioRecording(); else startAudioRecording(); }}>
                    <Mic size={16} color={isRecording ? '#ef4444' : fg} />
                    <Text style={styles.railItemLabel}>Audio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.railItem} onPress={() => { setShowQuickRail(false); handlePickPhoto(); }}>
                    <ImagePlus size={16} color="#10b981" />
                    <Text style={styles.railItemLabel}>Foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.railItem} onPress={() => { setShowQuickRail(false); setShowFullMapModal(true); }}>
                    <Radio size={16} color={fg} />
                    <Text style={styles.railItemLabel}>Mapa</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Entrada de chat libre → triaje por turno (ai-chat) */}
              <View style={styles.chatInputRow}>
                <TouchableOpacity
                  style={[
                    styles.chatMicBtn,
                    {
                      backgroundColor: isDictating ? '#10b981' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                      borderColor: isDictating ? '#10b981' : isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                    },
                  ]}
                  onPressIn={startVoiceDictation}
                  onPressOut={stopVoiceDictation}
                  disabled={isResolved || isResponding}
                  accessibilityLabel="Mantén presionado para dictar por voz"
                >
                  {isTranscribing ? (
                    <Activity size={18} color="#10b981" />
                  ) : (
                    <Mic size={18} color={isDictating ? '#fff' : fg} />
                  )}
                </TouchableOpacity>
                <View style={[styles.chatInputWrap, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}>
                  <TextInput
                    style={[styles.chatInput, { color: fg }]}
                    placeholder={isDictating ? 'Grabando… suelta para enviar' : 'Escribe o mantén el micrófono para dictar…'}
                    placeholderTextColor={muted}
                    value={chatInput}
                    onChangeText={setChatInput}
                    onSubmitEditing={sendChatMessage}
                    returnKeyType="send"
                    editable={!isResolved && !isResponding && !isDictating}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.chatSendBtn, { backgroundColor: isResponding ? '#334155' : '#059669' }]}
                  onPress={sendChatMessage}
                  disabled={isResponding || isResolved}
                  accessibilityLabel="Enviar mensaje a la IA"
                >
                  {isResponding ? <Activity size={16} color="#fff" /> : <Send size={16} color="#fff" />}
                </TouchableOpacity>
              </View>

              <View style={styles.chatControlsRow}>
              {/* Toggle de la barra lateral (costado izquierdo) */}
              <TouchableOpacity
                style={[styles.railToggleBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: showQuickRail ? '#10b981' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                onPress={() => setShowQuickRail((v) => !v)}
              >
                {showQuickRail ? <X size={16} color="#fff" /> : <Menu size={16} color={fg} />}
              </TouchableOpacity>

              {/* Botón de llamada rápida (casi al centro) */}
              <View style={styles.callCenterSlot}>
                <TouchableOpacity
                  style={[styles.callMainBtn, { backgroundColor: '#059669' }]}
                  onPress={() => onCallContact && onCallContact(incident.unitAssigned, EMERGENCY_NUMBER)}
                >
                  <Phone size={18} color="#fff" />
                  <Text style={styles.callMainBtnText}>LLAMAR</Text>
                </TouchableOpacity>
              </View>

              {/* Finalizar (compacto) */}
              <TouchableOpacity style={[styles.controlPill, { backgroundColor: '#059669' }]} onPress={handleResolveIncident}>
                <CheckCircle2 size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Finalizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Live Camera Modal */}
      <Modal visible={showLiveCameraModal} animationType="slide" onRequestClose={closeCamera} statusBarTranslucent>
        <View style={styles.cameraModal}>
          <View style={[styles.cameraHeader, { paddingTop: 16 + insets.top }]}>
            <View style={styles.trackingEtaRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.cameraModeText}>{cameraMode === 'video' ? 'MODO VIDEO-EVIDENCIA' : 'MODO FOTO TÁCTICA'}</Text>
              {isRecordingVideo && <Text style={styles.recLabel}>REC</Text>}
            </View>
            <View style={styles.cameraHeaderBtns}>
              <TouchableOpacity style={styles.cameraHeaderBtn} onPress={toggleFacing}>
                <RotateCw size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraHeaderBtn} onPress={closeCamera}>
                <X size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.cameraPreviewWrap}>
            {cameraPermission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mode={cameraMode}
                active={showLiveCameraModal}
              >
                <View style={styles.viewfinder} pointerEvents="none">
                  <View style={styles.viewfinderBox} />
                </View>
              </CameraView>
            ) : (
              <View style={styles.cameraNoPerm}>
                <AlertTriangle size={36} color="#fbbf24" />
                <Text style={styles.cameraErrorText}>Se requiere permiso de cámara.</Text>
                <TouchableOpacity style={styles.cameraPermBtn} onPress={requestCameraPermission}>
                  <Text style={styles.cameraPermBtnText}>Otorgar Permiso</Text>
                </TouchableOpacity>
              </View>
            )}

            {cameraError && (
              <View style={styles.cameraErrorOverlay}>
                <AlertTriangle size={32} color="#fbbf24" />
                <Text style={styles.cameraErrorText}>{cameraError}</Text>
                <TouchableOpacity style={styles.cameraErrorAction} onPress={() => { setCameraError(null); handlePickPhoto(); }}>
                  <Text style={styles.cameraErrorActionText}>Subir Foto</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.cameraControls}>
            <View style={styles.cameraModeSwitch}>
              <TouchableOpacity
                style={[styles.cameraModeTab, cameraMode === 'picture' && { backgroundColor: '#fff' }]}
                onPress={() => { if (isRecordingVideo) stopVideoRecording(); setCameraMode('picture'); }}
              >
                <Text style={{ color: cameraMode === 'picture' ? '#000' : '#8e9192', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>Foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraModeTab, cameraMode === 'video' && { backgroundColor: '#ef4444' }]}
                onPress={() => setCameraMode('video')}
              >
                <Text style={{ color: cameraMode === 'video' ? '#fff' : '#8e9192', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>Video</Text>
              </TouchableOpacity>
            </View>

            {cameraMode === 'picture' ? (
              <TouchableOpacity style={styles.shutterBtn} onPress={takePhoto}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            ) : (
              <View style={styles.videoBtns}>
                <TouchableOpacity style={[styles.shutterBtn, isRecordingVideo && { borderColor: '#ef4444' }]} onPress={isRecordingVideo ? stopVideoRecording : startVideoRecording}>
                  <View style={[styles.shutterInner, isRecordingVideo ? styles.shutterRecording : styles.shutterVideo]} />
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 11, marginTop: 8 }}>
                  {isRecordingVideo ? `Grabando: 0:${String(videoRecordingSeconds).padStart(2, '0')} (Toca para enviar)` : 'Toca para iniciar grabación'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Full-screen map modal */}
      <Modal visible={showFullMapModal} animationType="fade" onRequestClose={() => setShowFullMapModal(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <LiveTrackingScreen
            incident={incident}
            onContactUnit={(unit) => onCallContact && onCallContact(unit, EMERGENCY_NUMBER)}
            onResolveIncident={() => {
              handleResolveIncident();
              setShowFullMapModal(false);
            }}
            onBackToHome={() => setShowFullMapModal(false)}
            onRequestPlaceSearch={() => setShowPlaceSearch(true)}
          />
        </View>
      </Modal>

      <PlaceSearchModal
        visible={showPlaceSearch}
        onClose={() => setShowPlaceSearch(false)}
        near={incident.coordinates ? { lat: incident.coordinates.lat, lng: incident.coordinates.lng } : undefined}
        onSelect={(place) => {
          const updated = {
            ...incident,
            location: place.label,
            coordinates: { lat: place.lat, lng: place.lng },
          };
          setIncident(updated);
          if (onSaveReport) onSaveReport(updated);
          setShowPlaceSearch(false);
        }}
      />

      {/* ODS 12 — Tarjeta de prevención ambiental (no bloquea el envío) */}
      <Modal visible={showPrevencionCard} transparent animationType="fade" onRequestClose={() => setPrevencionDismissedFor(subtipoAmbiental)} statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <DotPatternLayer
            color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
            dotRadius={1.3}
            opacity={0.6}
          />
          <View style={[styles.confirmCard, { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)' }]}>
            {(() => {
              const prev = subtipoAmbiental ? PREVENCION_AMBIENTAL[subtipoAmbiental] : null;
              if (!prev) return null;
              return (
                <>
                  <View style={[styles.confirmIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                    <Leaf size={28} color="#22c55e" />
                  </View>
                  <Text style={[styles.confirmTitle, { color: fg }]}>PREVENCIÓN · {prev.label.toUpperCase()}</Text>
                  <View style={styles.prevencionBlocks}>
                    <View style={[styles.prevencionBlock, { borderColor: 'rgba(16,185,129,0.35)' }]}>
                      <Text style={[styles.prevencionBlockTitle, { color: '#10b981' }]}>QUÉ HACER</Text>
                      {prev.hacer.map((t, i) => (
                        <Text key={`h-${i}`} style={[styles.prevencionItem, { color: fg }]}>• {t}</Text>
                      ))}
                    </View>
                    <View style={[styles.prevencionBlock, { borderColor: 'rgba(239,68,68,0.35)' }]}>
                      <Text style={[styles.prevencionBlockTitle, { color: '#ef4444' }]}>QUÉ NO HACER</Text>
                      {prev.noHacer.map((t, i) => (
                        <Text key={`n-${i}`} style={[styles.prevencionItem, { color: fg }]}>• {t}</Text>
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmBtnSolid, { backgroundColor: '#10b981' }]}
                    onPress={() => setPrevencionDismissedFor(subtipoAmbiental)}
                  >
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Entendido</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Confirmación de salida (diseño SECURE_OS) */}
      <Modal visible={showExitConfirm} transparent animationType="fade" onRequestClose={cancelExit} statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <DotPatternLayer
            color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
            dotRadius={1.3}
            opacity={0.6}
          />
          <View style={[styles.confirmCard, { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)' }]}>
            <View style={[styles.confirmIcon, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)' }]}>
              <ShieldAlert size={28} color={isLight ? '#000' : '#fff'} />
            </View>
            <Text style={[styles.confirmTitle, { color: fg }]}>ABANDONAR EMERGENCIA</Text>
            <Text style={styles.confirmText}>
              ¿Deseas cerrar el canal de emergencia sin finalizar el reporte? Las unidades pueden seguir en ruta.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnGhost, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }]}
                onPress={cancelExit}
              >
                <Text style={[styles.confirmBtnText, { color: fg }]}>Continuar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnSolid, { backgroundColor: '#ef4444' }]}
                onPress={confirmExit}
              >
                <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Tarjeta de seguimiento en vivo (mapa alargado, textos conservados, sin botones
// de acción: contactar/finalizar/mapa/buscar se movieron al mapa satelital).
// El contador ETA usa reloj REAL (etaTotalSeconds+etaStartedAt) con un tick
// local, así el conteo sigue aunque el chat esté cerrado. El botón de expandir
// del mapa (⤢) abre la vista satelital completa.
const TrackingCard = React.memo(function TrackingCard({
  incident,
  isResolved,
  isLight,
  fg,
  muted,
  onExpand,
  onEtaExpired,
}: {
  incident: IncidentReport;
  isResolved: boolean;
  isLight: boolean;
  fg: string;
  muted: string;
  onExpand: () => void;
  onEtaExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const hasEta =
    !!incident.etaStartedAt && !!incident.etaTotalSeconds && incident.etaTotalSeconds > 0;

  // Fase D — fábricas/plantas industriales cercanas para los marcadores del mapa.
  const { factories, nearest } = useNearbyFactories(
    incident.coordinates && incident.coordinates.lat !== 0 ? incident.coordinates : null,
    15
  );
  const pois = useMemo(
    () => factories.map((f) => ({ id: f.id, name: f.name, kind: f.kind, lat: f.lat, lng: f.lng })),
    [factories]
  );

  useEffect(() => {
    if (isResolved || !hasEta) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isResolved, hasEta]);

  const remaining = (() => {
    if (isResolved) return 0;
    if (hasEta) {
      return Math.max(
        0,
        (incident.etaTotalSeconds as number) -
          Math.floor((now - (incident.etaStartedAt as number)) / 1000)
      );
    }
    return (incident.etaMinutes || 0) * 60 + (incident.etaSeconds || 0);
  })();

  useEffect(() => {
    if (!isResolved && hasEta && remaining <= 0) {
      const t = setTimeout(onEtaExpired, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <View style={[styles.trackingCard, { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }]}>
      <View style={styles.trackingHeader}>
        <View style={styles.trackingTitleRow}>
          <View style={styles.liveDot} />
          <Text style={[styles.trackingTitle, { color: fg }]}>MAPA TÁCTICO & SEGUIMIENTO EN VIVO</Text>
        </View>
        <Text style={[styles.monoTiny, { color: muted }]}>{incident.id}</Text>
      </View>

      <IncidentMap
        key={`${incident.coordinates?.lat ?? 0},${incident.coordinates?.lng ?? 0}`}
        coordinates={incident.coordinates || { lat: 19.4326, lng: -99.1332 }}
        locationName={incident.location}
        category={incident.category}
        unitAssigned={incident.unitAssigned}
        originDepot={incident.originDepot}
        showRoute={!!incident.unitAssigned && !isResolved}
        height={300}
        interactive
        showControls
        onExpand={onExpand}
        // Fase D — fábricas/plantas industriales cercanas al punto del reporte.
        pois={pois}
      />

      <View style={styles.trackingFooter}>
        {/* Fase D — fábrica/planta más cercana + sustancia detectada (ambiental) */}
        {(nearest || incident.sustanciaDetectada) && (
          <View style={{ gap: 4 }}>
            {nearest && (
              <View style={styles.trackingEtaRow}>
                <Text style={[styles.monoTiny, { color: muted, fontWeight: '700' }]}>
                  FÁBRICA/PLANTA MÁS CERCANA: {nearest.name} ({formatDistanceKm(nearest.distanceKm)})
                </Text>
              </View>
            )}
            {incident.sustanciaDetectada && (
              <View style={styles.trackingEtaRow}>
                <Text style={[styles.monoTiny, { color: '#22c55e', fontWeight: '700' }]}>
                  SUSTANCIA DETECTADA: {incident.sustanciaDetectada}
                </Text>
              </View>
            )}
          </View>
        )}
        {isResolved ? (
          <View style={styles.trackingEtaRow}>
            <CheckCircle2 size={18} color="#10b981" />
            <Text style={[styles.trackingEta, { color: fg }]}>Incidente finalizado</Text>
          </View>
        ) : incident.unitAssigned ? (
          <View>
            <View style={styles.trackingEtaRow}>
              <Clock size={16} color="#10b981" />
              <Text style={[styles.trackingEta, { color: fg }]}>
                {hasEta || incident.etaMinutes > 0 || incident.etaSeconds > 0
                  ? `ETA: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} MIN`
                  : 'ETA: --:-- MIN'}
              </Text>
            </View>
            <Text style={[styles.monoTiny, { color: muted }]}>{incident.originDepot} ➜ Tu Ubicación</Text>
          </View>
        ) : (
          <View style={styles.trackingEtaRow}>
            <Activity size={16} color="#8b5cf6" />
            <Text style={[styles.trackingEta, { color: '#8b5cf6' }]}>ANALIZANDO EVIDENCIA…</Text>
          </View>
        )}
      </View>
    </View>
  );
});

const VideoMessage: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.videoMsg}>
      <VideoView player={player} style={styles.videoMsgView} contentFit="cover" nativeControls />
    </View>
  );
};

// Burbuja de audio del chat: reproduce el archivo real grabado con expo-audio
const AudioBubble: React.FC<{ msg: ChatMessage; isUser: boolean; isLight: boolean }> = ({ msg, isUser, isLight }) => {
  const player = useAudioPlayer(msg.audioUrl || null);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const bubbleFg = isUser ? (isLight ? '#fff' : '#000') : fgSign(isLight);
  const toggleBg = isUser ? (isLight ? '#fff' : '#000') : isLight ? '#000' : '#fff';
  const toggleFg = isUser ? (isLight ? '#000' : '#fff') : isLight ? '#fff' : '#000';

  return (
    <TouchableOpacity
      style={styles.audioRow}
      activeOpacity={0.8}
      onPress={() => (playing ? player.pause() : player.play())}
    >
      <View style={[styles.playBtn, { backgroundColor: toggleBg }]}>
        {playing ? (
          <Pause size={14} color={toggleFg} />
        ) : (
          <Play size={14} color={toggleFg} />
        )}
      </View>
      <View style={styles.audioBars}>
        {[3, 5, 2, 6, 4, 5].map((h, i) => (
          <View
            key={i}
            style={[styles.audioBar, { height: h * 2, backgroundColor: playing ? '#10b981' : bubbleFg, opacity: playing ? 1 : 0.8 }]}
          />
        ))}
      </View>
      <Text style={[styles.audioDur, { color: bubbleFg }]}>
        {playing && status.currentTime > 0 ? `${Math.floor(status.currentTime)}s` : msg.audioDuration || '0:05'}
      </Text>
    </TouchableOpacity>
  );
};

const fgSign = (isLight: boolean) => (isLight ? '#000' : '#fff');

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 60 },
  // Fase C — CTA de análisis consolidado de evidencia
  analyzeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    marginBottom: 10,
  },
  analyzeAllText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  // Fase E — chip de ayuda recomendada (policía/ambulancia/bomberos)
  respuestaChips: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, paddingHorizontal: 2 },
  respuestaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  respuestaChipText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Llamadas discretas de emergencia (110 / 119 / 911)
  callChipsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  callChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  callChipText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  // ODS 12 — tarjeta de prevención ambiental
  envSubtypeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  prevencionBlocks: { width: '100%', gap: 10, marginTop: 8 },
  prevencionBlock: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },
  prevencionBlockTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  prevencionItem: { fontSize: 11, lineHeight: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logoBadge: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  headerSub: { fontSize: 9, textTransform: 'uppercase' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resolvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  resolvedText: { color: '#10b981', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  voiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  thread: { flex: 1 },
  threadContent: { padding: 16, gap: 14 },
  timelineCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  timelineLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  timelineUnit: { color: '#10b981', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  timelineRow: { flexDirection: 'row', gap: 6 },
  timelineItem: { flex: 1, alignItems: 'center', gap: 5 },
  timelineBar: { height: 6, width: '100%', borderRadius: 3 },
  timelineStepLabel: { fontSize: 8, textTransform: 'uppercase' },
  trackingCard: { borderRadius: 28, padding: 16, borderWidth: 1, gap: 12 },
  trackingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackingTitle: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  monoTiny: { fontSize: 9, letterSpacing: 0.5 },
  trackingFooter: { paddingTop: 4, gap: 10 },
  trackingEtaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackingEta: { fontWeight: '800', fontSize: 16 },
  trackingActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  primaryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  ghostPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  finalizePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#059669' },
  primaryLight: { backgroundColor: '#000' },
  primaryDark: { backgroundColor: '#fff' },
  bubbleRow: { width: '100%' },
  bubbleWrap: { maxWidth: '85%' },
  bubbleInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  bubble: { borderRadius: 16, padding: 14, gap: 6 },
  msgPhoto: { width: 220, height: 140, borderRadius: 12, overflow: 'hidden' },
  videoMsg: { width: 220, height: 140, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  videoMsgView: { width: '100%', height: '100%' },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  audioBars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  audioBar: { width: 4, borderRadius: 2 },
  audioDur: { fontSize: 10, opacity: 0.8 },
  bubbleTime: { fontSize: 9, marginTop: 4, paddingHorizontal: 4 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { padding: 14, borderTopWidth: 1 },
  resolvedFooter: { alignItems: 'stretch', gap: 12 },
  resolvedFooterTitleRow: { justifyContent: 'center' },
  resolvedFooterTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  resolvedSalir: { justifyContent: 'center' },
  bigPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24 },
  audioPanel: { paddingVertical: 6 },
  recordingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444' },
  recStart: { alignItems: 'center' },
  recBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
  photoPanel: { alignItems: 'center' },
  photoActions: { flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'center' },
  photoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 16, minHeight: 44 },
  videoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 16, minHeight: 44, backgroundColor: '#dc2626' },
  ghostAction: { borderWidth: 1 },
  chatControls: { position: 'relative' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chatMicBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInputWrap: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, minHeight: 42, justifyContent: 'center' },
  chatInput: { fontSize: 13, fontWeight: '600', paddingVertical: 8 },
  chatSendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  chatControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatControlsBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  controlPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  railToggleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  callCenterSlot: { flex: 1, alignItems: 'center' },
  callMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 26,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  callMainBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  quickRail: {
    position: 'absolute',
    left: 0,
    bottom: 54,
    zIndex: 30,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  railItemLabel: { color: '#8e9192', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(12,12,13,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 340, borderRadius: 28, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8 },
  confirmIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  confirmTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  confirmText: { fontSize: 12, color: '#8e9192', textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  confirmBtnGhost: { borderWidth: 1 },
  confirmBtnSolid: { borderWidth: 0 },
  confirmBtnText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  cameraModal: { flex: 1, backgroundColor: '#000' },
  cameraHeader: {
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  cameraModeText: { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  recLabel: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: '#dc2626', color: '#fff', fontSize: 10, fontWeight: '700' },
  cameraHeaderBtns: { flexDirection: 'row', gap: 8 },
  cameraHeaderBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewWrap: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewfinder: { ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center' },
  viewfinderBox: { width: 200, height: 200, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 20 },
  cameraNoPerm: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  cameraErrorText: { color: '#c4c7c8', fontSize: 12, textAlign: 'center' },
  cameraPermBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, backgroundColor: '#fff' },
  cameraPermBtnText: { color: '#000', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  cameraErrorOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '30%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center',
    gap: 12,
  },
  cameraErrorAction: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff' },
  cameraErrorActionText: { color: '#000', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  cameraControls: { alignItems: 'center', padding: 20, gap: 16, backgroundColor: 'rgba(0,0,0,0.9)' },
  cameraModeSwitch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  cameraModeTab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  shutterBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: '100%', height: '100%', borderRadius: 30, backgroundColor: '#fff' },
  shutterRecording: { borderRadius: 8, backgroundColor: '#dc2626', width: 28, height: 28 },
  shutterVideo: { backgroundColor: '#dc2626' },
  videoBtns: { alignItems: 'center' },
});
