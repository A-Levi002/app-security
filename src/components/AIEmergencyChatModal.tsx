import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Shield,
  ShieldAlert,
  Mic,
  MicOff,
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
  Upload,
  AlertTriangle,
  Video,
  X,
  RotateCw,
  LogOut,
  ImagePlus,
} from 'lucide-react-native';
import {
  EmergencyCategory,
  IncidentReport,
  ChatMessage,
  DispatchStep,
  IncidentSeverity,
  SystemSettings,
} from '../types';
import { LiveTrackingScreen } from '../screens/LiveTrackingScreen';
import { IncidentMap } from './IncidentMap';
import { DotPatternLayer } from './DotPatternLayer';
import {
  analyzeIncidentWithAI,
  AIAnalysisResult,
} from '../lib/ai';

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
};

type ProtocolStep = 'audio_gravity' | 'photo_evidence' | 'location_dispatch' | 'completed';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
let idSeq = 0;
const uid = (): string => `id-${Date.now()}-${idSeq++}`;

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
  const fg = isLight ? '#000' : '#fff';
  const muted = '#8e9192';

  const [incident, setIncident] = useState<IncidentReport>(() => {
    if (existingReport) return existingReport;
    const now = new Date();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dateStr = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    return {
      id: `#REP-${Math.floor(1000 + Math.random() * 9000)}`,
      category,
      categoryLabel: categoryInfo.label,
      title: `${categoryInfo.label} en curso`,
      description: 'Reporte táctico transmitido a través de voz y telemetría IA.',
      severity: 'high' as IncidentSeverity,
      status: 'in_progress',
      dispatchStep: 'classified',
      date: dateStr,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      unitAssigned: categoryInfo.unit,
      originDepot: categoryInfo.depot,
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
          const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (place) addr = `${place.street || ''} ${place.name || ''}, ${place.city || ''}`.trim();
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
  }, []);

  const [protocolStep, setProtocolStep] = useState<ProtocolStep>(() =>
    existingReport ? 'completed' : 'audio_gravity'
  );

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
      { id: 'ai-step-1', sender: 'ai', text: `Hola, soy SECURE_OS CORE. Protocolo de emergencia iniciado para ${categoryInfo.label}.`, timestamp: 'Ahora' },
      { id: 'ai-step-2', sender: 'ai', text: 'Por favor, graba un audio de voz indicando la gravedad del incidente, personas afectadas y la situación actual.', timestamp: 'Ahora' },
    ];
  });

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;
  const recordingMs = recorderState.durationMillis;

  const [aiVoiceEnabled, setAIVoiceEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showFullMapModal, setShowFullMapModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

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
  }, [messages, isRecording, protocolStep]);

  // ETA countdown timer
  useEffect(() => {
    if (incident.status !== 'in_progress') return;
    const timer = setInterval(() => {
      setIncident((prev: IncidentReport) => {
        if (prev.status === 'resolved') {
          return { ...prev, etaMinutes: 0, etaSeconds: 0 };
        }
        if (prev.etaMinutes === 0 && prev.etaSeconds <= 1) {
          return { ...prev, etaMinutes: 0, etaSeconds: 0, dispatchStep: 'resolved', status: 'resolved' };
        }
        let newSec = (prev.etaSeconds || 0) - 1;
        let newMin = prev.etaMinutes;
        if (newSec < 0) {
          newSec = 59;
          newMin = Math.max(0, newMin - 1);
        }
        return {
          ...prev,
          etaMinutes: newMin,
          etaSeconds: newSec,
          dispatchStep: (newMin < 2 ? 'en_route' : prev.dispatchStep) as DispatchStep,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [incident.status]);

  // Guarda el hilo completo en el expediente del incidente (para el historial)
  const appendAndSave = (nextMessages: ChatMessage[], extraPatch?: Partial<IncidentReport>) => {
    setMessages(nextMessages);
    const updated = { ...incident, ...extraPatch, chat: nextMessages };
    setIncident(updated);
    if (onSaveReport) onSaveReport(updated);
  };

  const aiSeverityToIncident = (s: AIAnalysisResult['severidad']): IncidentSeverity => {
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

  // Aplica la decisión de la IA (proceed/correct/cancel) sobre el incidente y el chat.
  // Devuelve el IncidentReport actualizado (o null si la cancelación resolvió el incidente en curso).
  const applyAIOutcome = (baseMessages: ChatMessage[], analysis: AIAnalysisResult): IncidentReport | null => {
    const severity = aiSeverityToIncident(analysis.severidad);
    let updatedIncident = { ...incident, severity, aiVoiceMessage: analysis.mensaje_voz };

    if (analysis.decision === 'cancel') {
      // Falsa emergencia / broma: se cancela el reporte y se informa al ciudadano.
      const cancelSystem: ChatMessage = { id: `cancel-sys-${uid()}`, sender: 'system', text: 'Reporte finalizado tras verificación.', timestamp: nowTime() };
      const cancelAi: ChatMessage = {
        id: `ai-cancel-${uid()}`,
        sender: 'ai',
        text: analysis.motivo
          ? `No se confirmó una emergencia real. ${analysis.motivo}`
          : 'La evidencia no permitió confirmar una emergencia real, por lo que se cancela el despacho.',
        timestamp: nowTime(),
      };
      appendAndSave([...baseMessages, cancelSystem, cancelAi], {
        ...(incident.aiVoiceMessage
            ? { aiVoiceMessage: 'No se confirmó una emergencia real. El despacho fue cancelado.' }
            : {}),
        severity,
        status: 'resolved',
        dispatchStep: 'resolved',
        etaMinutes: 0,
        etaSeconds: 0,
      });
      if (aiVoiceEnabled) speakAI('No se confirmó una emergencia real. El despacho fue cancelado.');
      return { ...updatedIncident, status: 'resolved', dispatchStep: 'resolved', etaMinutes: 0, etaSeconds: 0 };
    }

    if (analysis.decision === 'correct' && analysis.categoria_corregida && CATEGORY_DETAILS[analysis.categoria_corregida]) {
      const corrected = CATEGORY_DETAILS[analysis.categoria_corregida];
      const beforeLabel = incident.categoryLabel;
      updatedIncident = {
        ...updatedIncident,
        category: analysis.categoria_corregida,
        categoryLabel: corrected.label,
        title: `${corrected.label} en curso`,
        unitAssigned: corrected.unit,
        originDepot: corrected.depot,
      };
      const correctMsg: ChatMessage = {
        id: `ai-correct-${uid()}`,
        sender: 'ai',
        text: analysis.motivo
          ? `Se reclasificó la emergencia a ${corrected.label} (antes ${beforeLabel}). ${analysis.motivo}`
          : `La evidencia indica una ${corrected.label}. Despacho reasignado.`,
        timestamp: nowTime(),
      };
      appendAndSave([...baseMessages, correctMsg], {
        aiVoiceMessage: analysis.mensaje_voz,
        severity,
        category: analysis.categoria_corregida,
        categoryLabel: corrected.label,
        title: `${corrected.label} en curso`,
        unitAssigned: corrected.unit,
        dispatchStep: 'en_route',
      });
      setIncident(updatedIncident);
      if (aiVoiceEnabled) speakAI(analysis.mensaje_voz);
      return updatedIncident;
    }

    // proceed (o unknown): respuesta estándar de confirmación.
    const aiConfirm: ChatMessage = {
      id: `ai-confirm-${uid()}`,
      sender: 'ai',
      text: analysis.respuesta_asistente,
      timestamp: nowTime(),
    };
    appendAndSave([...baseMessages, aiConfirm], {
      aiVoiceMessage: analysis.mensaje_voz,
      severity,
      dispatchStep: 'en_route',
    });
    if (aiVoiceEnabled) speakAI(analysis.mensaje_voz);
    return { ...updatedIncident, aiVoiceMessage: analysis.mensaje_voz };
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
    const trackingCardMsg: ChatMessage = { id: 'tracking-card', sender: 'system', text: 'Seguimiento satelital y telemetría de rescate', timestamp: 'En Vivo', type: 'live_tracking_card' };
    const hasTrackingCard = messages.some((m) => m.type === 'live_tracking_card');
    const withPhoto = [...messages, photoMsg];
    if (!hasTrackingCard) withPhoto.push(trackingCardMsg);
    appendAndSave(withPhoto, { imageUrl: photoUrl, dispatchStep: 'en_route' });
    setProtocolStep('completed');

    // Leer foto como base64 para enviar a Gemini
    let fotoBase64: string | undefined;
    try {
      const FileSystem = await import('expo-file-system');
      const fileInfo = await FileSystem.getInfoAsync(photoUrl);
      if (fileInfo.exists) {
        fotoBase64 = await FileSystem.readAsStringAsync(photoUrl, { encoding: FileSystem.EncodingType.Base64 });
      }
    } catch {
      // Si falla la lectura, enviamos sin foto
    }

    setIsAnalyzing(true);
    const analysis = await analyzeIncidentWithAI({
      categoria: category,
      descripcion: 'Evidencia fotográfica capturada en la escena.',
      fotoBase64,
      mediaMimeType: 'image/jpeg',
    });
    setIsAnalyzing(false);

    const updated = applyAIOutcome(withPhoto, analysis);
    if (updated && onSaveReport) onSaveReport(updated);
  };

  const dispatchVideoMessage = async (videoUrl: string) => {
    const videoMsg: ChatMessage = { id: `usr-vid-${uid()}`, sender: 'user', text: 'Evidencia de video grabada en la escena', timestamp: nowTime(), type: 'video', videoUrl };
    const trackingCardMsg: ChatMessage = { id: 'tracking-card', sender: 'system', text: 'Seguimiento satelital y telemetría de rescate', timestamp: 'En Vivo', type: 'live_tracking_card' };
    const hasTrackingCard = messages.some((m) => m.type === 'live_tracking_card');
    const withVideo = [...messages, videoMsg];
    if (!hasTrackingCard) withVideo.push(trackingCardMsg);
    appendAndSave(withVideo, { dispatchStep: 'en_route' });
    setProtocolStep('completed');

    // Leer video como base64 para enviar a Gemini
    let videoBase64: string | undefined;
    try {
      const FileSystem = await import('expo-file-system');
      const fileInfo = await FileSystem.getInfoAsync(videoUrl);
      if (fileInfo.exists) {
        videoBase64 = await FileSystem.readAsStringAsync(videoUrl, { encoding: FileSystem.EncodingType.Base64 });
      }
    } catch {
      // Si falla la lectura, enviamos sin video
    }

    setIsAnalyzing(true);
    const analysis = await analyzeIncidentWithAI({
      categoria: category,
      descripcion: 'Evidencia de video grabada en la escena.',
      fotoBase64: videoBase64,
      mediaMimeType: 'video/mp4',
    });
    setIsAnalyzing(false);

    const updated = applyAIOutcome(withVideo, analysis);
    if (updated && onSaveReport) onSaveReport(updated);
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
    } catch {
      setCameraError('No se pudo iniciar la grabación de audio.');
    }
  };

  const stopAudioRecording = async () => {
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
      const userAudioMsg: ChatMessage = { id: `usr-aud-${uid()}`, sender: 'user', text: 'Nota de voz de emergencia (Gravedad evaluada)', timestamp: nowTime(), type: 'audio', audioDuration: audioDurationStr, audioUrl: uri };
      appendAndSave([...messages, userAudioMsg], { audioNote: uri });
      setProtocolStep('photo_evidence');

      // Leer audio como base64 para enviar a Gemini
      let audioBase64: string | undefined;
      try {
        const FileSystem = await import('expo-file-system');
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists) {
          audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      } catch {
        // Si falla la lectura, enviamos sin audio
      }

      setIsAnalyzing(true);
      const analysis = await analyzeIncidentWithAI({
        categoria: category,
        descripcion: 'Nota de voz grabada por el ciudadano indicando la gravedad del incidente.',
        audioBase64,
        audioMimeType: 'audio/mp4',
      });
      setIsAnalyzing(false);

      const base = [...messages, userAudioMsg];
      const updated = applyAIOutcome(base, analysis);
      if (analysis.decision === 'cancel' || analysis.decision === 'correct') {
        if (updated && onSaveReport) onSaveReport(updated);
        return;
      }
      // En "proceed" añadimos el siguiente paso del protocolo.
      const aiNextStepMsg: ChatMessage = { id: `ai-next-step-${uid()}`, sender: 'ai', text: 'Paso 2: Adjunta una foto o graba un video con tu cámara para verificar la escena y calcular recursos exactos.', timestamp: nowTime() };
      appendAndSave([...base, aiNextStepMsg], {
        audioNote: uri,
        dispatchStep: 'resources_assigned',
      });
      if (updated && onSaveReport) onSaveReport(updated);
    } catch {
      setCameraError('No se pudo procesar el audio.');
    }
  };

  // Foto desde galería
  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setCameraError('No se pudo acceder a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      dispatchPhotoMessage(result.assets[0].uri);
    }
  };

  // Voz IA
  const speakAI = (text?: string) => {
    const toSpeak = text || incident.aiVoiceMessage || 'Unidad de respuesta táctica en camino. Mantenga la calma y permanezca a resguardo.';
    Speech.speak(toSpeak, { language: 'es-ES', rate: 0.95, onDone: () => { Speech.stop(); }, onStopped: () => { Speech.stop(); }, onError: () => { Speech.stop(); } });
  };

  // Interruptor para activar/desactivar la lectura por voz automática de cada respuesta de la IA.
  const toggleAIVoice = () => {
    if (aiVoiceEnabled) {
      setAIVoiceEnabled(false);
      Speech.stop();
    } else {
      setAIVoiceEnabled(true);
    }
  };

  const handleResolveIncident = () => {
    const resolveMsg: ChatMessage = { id: `system-${uid()}`, sender: 'system', text: 'Incidente finalizado.', timestamp: nowTime() };
    appendAndSave([...messages, resolveMsg], { status: 'resolved', dispatchStep: 'resolved', etaMinutes: 0, etaSeconds: 0 });
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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, shutterSound: false });
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
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
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
              <View key={msg.id} style={[styles.trackingCard, { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }]}>
                <View style={styles.trackingHeader}>
                  <View style={styles.trackingTitleRow}>
                    <View style={styles.liveDot} />
                    <Text style={[styles.trackingTitle, { color: fg }]}>MAPA TÁCTICO & SEGUIMIENTO EN VIVO</Text>
                  </View>
                  <Text style={[styles.monoTiny, { color: muted }]}>{incident.id}</Text>
                </View>

                <IncidentMap
                  coordinates={incident.coordinates || { lat: 19.4326, lng: -99.1332 }}
                  locationName={incident.location}
                  category={incident.category}
                  unitAssigned={incident.unitAssigned}
                  originDepot={incident.originDepot}
                  showRoute={!isResolved}
                  height={190}
                  interactive
                  showControls
                />

                <View style={styles.trackingFooter}>
                  {isResolved ? (
                    <View style={styles.trackingEtaRow}>
                      <CheckCircle2 size={18} color="#10b981" />
                      <Text style={[styles.trackingEta, { color: fg }]}>Incidente finalizado</Text>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.trackingEtaRow}>
                        <Clock size={16} color="#10b981" />
                        <Text style={[styles.trackingEta, { color: fg }]}>
                          ETA: {String(incident.etaMinutes).padStart(2, '0')}:{String(incident.etaSeconds).padStart(2, '0')} MIN
                        </Text>
                      </View>
                      <Text style={[styles.monoTiny, { color: muted }]}>{incident.originDepot} ➜ Tu Ubicación</Text>
                    </View>
                  )}

                  <View style={styles.trackingActions}>
                    {!isResolved && (
                      <TouchableOpacity style={[styles.primaryPill, isLight ? styles.primaryLight : styles.primaryDark]} onPress={() => setShowFullMapModal(true)}>
                        <Radio size={14} color={isLight ? '#fff' : '#000'} />
                        <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>MAPA</Text>
                      </TouchableOpacity>
                    )}
                    {!isResolved && onCallContact && (
                      <TouchableOpacity style={[styles.ghostPill, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]} onPress={() => onCallContact(incident.unitAssigned, '+52 55 9110 0021')}>
                        <Phone size={14} color="#10b981" />
                        <Text style={{ color: fg, fontSize: 9, textTransform: 'uppercase', fontWeight: '700' }}>Contactar</Text>
                      </TouchableOpacity>
                    )}
                    {isResolved ? (
                      <TouchableOpacity style={[styles.primaryPill, isLight ? styles.primaryLight : styles.primaryDark]} onPress={onClose}>
                        <LogOut size={14} color={isLight ? '#fff' : '#000'} />
                        <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Salir</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.finalizePill} onPress={handleResolveIncident}>
                        <CheckCircle2 size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Finalizar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
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
        {isAnalyzing && (
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
                    <Activity size={14} color="#10b981" />
                    <Text style={[styles.monoTiny, { color: '#10b981' }]}>Analizando con IA…</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer: protocol controls */}
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
        ) : protocolStep === 'audio_gravity' ? (
          <View style={styles.audioPanel}>
            {isRecording ? (
              <View style={styles.recordingBar}>
                <View style={styles.trackingEtaRow}>
                  <View style={styles.recordingDot} />
                  <Text style={{ color: fg, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                    GRABANDO AUDIO // {Math.floor(recordingMs / 60000)}:{String(Math.floor((recordingMs % 60000) / 1000)).padStart(2, '0')}
                  </Text>
                </View>
                <TouchableOpacity style={[styles.primaryPill, isLight ? styles.primaryLight : styles.primaryDark]} onPress={stopAudioRecording}>
                  <MicOff size={14} color={isLight ? '#fff' : '#000'} />
                  <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Enviar Audio</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.recStart}>
                <Text style={[styles.monoTiny, { color: muted, marginBottom: 10 }]}>Presiona para grabar el audio de gravedad del incidente</Text>
                <TouchableOpacity
                  style={[styles.recBtn, isLight ? { backgroundColor: '#000' } : { backgroundColor: '#fff' }]}
                  onPress={startAudioRecording}
                >
                  <Mic size={28} color={isLight ? '#fff' : '#000'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : protocolStep === 'photo_evidence' ? (
          <View style={styles.photoPanel}>
            <Text style={[styles.monoTiny, { color: muted, textAlign: 'center', marginBottom: 8 }]}>
              Captura fotos o graba videos en vivo para respaldar el reporte:
            </Text>
            <View style={styles.photoActions}>
              <TouchableOpacity style={[styles.photoActionBtn, isLight ? styles.primaryLight : styles.primaryDark]} onPress={() => openCamera('picture')}>
                <Camera size={15} color={isLight ? '#fff' : '#000'} />
                <Text numberOfLines={1} style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', flexShrink: 1 }}>
                  Cámara Vivo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.videoActionBtn} onPress={() => openCamera('video')}>
                <Video size={15} color="#fff" />
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', flexShrink: 1 }}>
                  Grabar Video
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoActionBtn, styles.ghostAction, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)', backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.1)' }]} onPress={handlePickPhoto}>
                <Upload size={15} color={fg} />
                <Text numberOfLines={1} style={{ color: fg, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', flexShrink: 1 }}>
                  Subir Archivo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.chatControls}>
            <View style={styles.chatControlsBtns}>
              <TouchableOpacity style={[styles.ghostIconBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]} onPress={() => openCamera('picture')}>
                <Camera size={16} color={fg} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostIconBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]} onPress={() => openCamera('video')}>
                <Video size={16} color="#ef4444" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostIconBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isRecording ? '#ef4444' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                onPress={() => (isRecording ? stopAudioRecording() : startAudioRecording())}
              >
                <Mic size={16} color={isRecording ? '#fff' : fg} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostIconBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]} onPress={handlePickPhoto}>
                <ImagePlus size={16} color="#10b981" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostIconBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]} onPress={() => setShowFullMapModal(true)}>
                <Radio size={16} color={isLight ? '#000' : '#fff'} />
              </TouchableOpacity>
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
            onContactUnit={(unit) => onCallContact && onCallContact(unit, '+52 55 9110 0021')}
            onResolveIncident={() => {
              handleResolveIncident();
              setShowFullMapModal(false);
            }}
            onBackToHome={() => setShowFullMapModal(false)}
          />
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
  chatControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  chatControlsBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  controlPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
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
