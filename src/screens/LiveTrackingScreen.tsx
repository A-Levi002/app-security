import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import {
  Phone,
  Volume2,
  VolumeX,
  CheckCircle,
  Navigation,
  MapPin,
  Car,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { IncidentReport } from '../types';
import { IncidentMap } from '../components/IncidentMap';

// ---------------------------------------------------------------------------
// LiveTrackingScreen (React Native)
// Cambios clave respecto a la versión web:
// - <div>/Tailwind -> View/StyleSheet
// - framer-motion (motion/react) -> react-native-reanimated (FadeIn/Layout)
// - window.speechSynthesis -> expo-speech (Speech.speak)
// - Gradiente CSS -> expo-linear-gradient
// - IncidentMap ahora usa react-native-maps (ver IncidentMap.tsx)
// ---------------------------------------------------------------------------

interface LiveTrackingScreenProps {
  incident: IncidentReport;
  onContactUnit: (unit: string) => void;
  onResolveIncident: (id: string) => void;
  onBackToHome: () => void;
}

export const LiveTrackingScreen: React.FC<LiveTrackingScreenProps> = ({
  incident,
  onContactUnit,
  onResolveIncident,
  onBackToHome,
}) => {
  const insets = useSafeAreaInsets();
  const [secondsRemaining, setSecondsRemaining] = useState(
    incident.status === 'resolved' ? 0 : incident.etaMinutes * 60 + incident.etaSeconds || 225
  );
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentStage, setCurrentStage] = useState<'despachada' | 'en_ruta' | 'en_sitio'>(
    incident.status === 'resolved' ? 'en_sitio' : 'en_ruta'
  );
  const [isExpanded, setIsExpanded] = useState(false);

  // Countdown en tiempo real
  useEffect(() => {
    if (incident.status === 'resolved' || secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCurrentStage('en_sitio');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining, incident.status]);

  // Voz de asistencia táctica (reemplaza window.speechSynthesis)
  const playCalmingVoice = () => {
    if (isPlayingAudio) {
      Speech.stop();
      setIsPlayingAudio(false);
      return;
    }

    const messageText =
      incident.aiVoiceMessage ||
      'Unidad de respuesta de emergencia en camino hacia su ubicación. Mantenga la calma y permanezca en un lugar seguro.';

    setIsPlayingAudio(true);
    Speech.speak(messageText, {
      language: 'es-ES',
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setIsPlayingAudio(false),
      onStopped: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const formatETA = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const coords = incident.coordinates || { lat: 19.4326, lng: -99.1332 };

  return (
    <View style={styles.container}>
      {/* 1. Mapa satelital/táctico a pantalla completa */}
      <View style={StyleSheet.absoluteFill}>
        <IncidentMap
          coordinates={coords}
          locationName={incident.location}
          category={incident.category}
          unitAssigned={incident.unitAssigned}
          originDepot={incident.originDepot}
          showRoute
          interactive
          showControls
          fullScreen
          initialLayer="satellite"
        />
        {/* Viñeta sutil arriba/abajo */}
        <LinearGradient
          colors={['rgba(10,10,12,0.85)', 'transparent', 'rgba(10,10,12,0.9)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      {/* 2. Header superior */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={onBackToHome} style={styles.backButton} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#fff" />
          <Text style={styles.backButtonText}>INICIO</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <View style={styles.pulsingDot} />
            <Text style={styles.headerTitle}>MAPA SATELITAL</Text>
          </View>
          <Text style={styles.headerSubtitle}>SEGUIMIENTO EN TIEMPO REAL</Text>
        </View>

        <TouchableOpacity
          onPress={playCalmingVoice}
          activeOpacity={0.8}
          style={[styles.voiceButton, isPlayingAudio && styles.voiceButtonActive]}
        >
          {isPlayingAudio ? (
            <Volume2 size={14} color="#fff" />
          ) : (
            <VolumeX size={14} color="#fff" />
          )}
          <Text style={styles.voiceButtonText}>
            {isPlayingAudio ? 'Hablando' : 'Asistente IA'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. HUD flotante inferior */}
      <View style={styles.hudWrapper}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.hudCard}>
          {/* Fila 1: Unidad + ETA */}
          <View style={styles.row}>
            <View style={styles.unitInfo}>
              <View style={styles.unitIconBox}>
                <Car size={20} color="#000" />
              </View>
              <View style={styles.unitTextBox}>
                <View style={styles.unitNameRow}>
                  <Text style={styles.unitName} numberOfLines={1}>
                    {incident.unitAssigned || 'AMBULANCIA_T4'}
                  </Text>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>EN RUTA</Text>
                  </View>
                </View>
                <Text style={styles.unitOrigin} numberOfLines={1}>
                  Desde: {incident.originDepot || 'Estación Central'}
                </Text>
              </View>
            </View>

            <View style={styles.etaBox}>
              <Text style={styles.etaValue}>{formatETA(secondsRemaining)}</Text>
              <Text style={styles.etaLabel}>TIEMPO DE ARRIBO</Text>
            </View>
          </View>

          {/* Fila 2: progreso de 3 pasos */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text
                style={[
                  styles.progressLabelText,
                  currentStage === 'despachada' && styles.progressLabelActive,
                ]}
              >
                1. Despachada
              </Text>
              <View style={styles.progressLabelCenter}>
                <Navigation
                  size={10}
                  color={currentStage === 'en_ruta' ? '#f87171' : '#c4c7c8'}
                />
                <Text
                  style={[
                    styles.progressLabelText,
                    currentStage === 'en_ruta' && { color: '#f87171', fontWeight: '700' },
                  ]}
                >
                  2. En Camino
                </Text>
              </View>
              <Text
                style={[
                  styles.progressLabelText,
                  currentStage === 'en_sitio' && { color: '#34d399', fontWeight: '700' },
                ]}
              >
                3. En Sitio
              </Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressSegment, { backgroundColor: '#fff' }]} />
              <View
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor:
                      currentStage === 'en_ruta' || currentStage === 'en_sitio'
                        ? '#ef4444'
                        : 'rgba(255,255,255,0.1)',
                  },
                ]}
              />
              <View
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor:
                      currentStage === 'en_sitio' ? '#34d399' : 'rgba(255,255,255,0.1)',
                  },
                ]}
              />
            </View>
          </View>

          {/* Detalles expandibles */}
          {isExpanded && (
            <Animated.View entering={FadeIn.duration(200)} layout={Layout} style={styles.expandedSection}>
              <View style={styles.expandedRow}>
                <MapPin size={14} color="#fff" />
                <Text style={styles.expandedText} numberOfLines={1}>
                  {incident.location}
                </Text>
              </View>
              {incident.imageUrl && (
                <Image source={{ uri: incident.imageUrl }} style={styles.evidenceImage} resizeMode="cover" />
              )}
              <View style={styles.expandedFooterRow}>
                <Text style={styles.expandedIdText}>ID REPORTE: {incident.id}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (currentStage === 'despachada') setCurrentStage('en_ruta');
                    else if (currentStage === 'en_ruta') setCurrentStage('en_sitio');
                    else setCurrentStage('despachada');
                  }}
                >
                  <Text style={styles.advanceStageText}>Avanzar etapa ➜</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* Toggle detalles */}
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.toggleButton}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleButtonText}>
              {isExpanded ? 'Ocultar detalles' : 'Ver detalles del incidente'}
            </Text>
            {isExpanded ? (
              <ChevronUp size={12} color="#8e9192" />
            ) : (
              <ChevronDown size={12} color="#8e9192" />
            )}
          </TouchableOpacity>

          {/* Fila 3: acciones */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.contactButton}
              activeOpacity={0.85}
              onPress={() => onContactUnit(incident.unitAssigned || 'AMBULANCIA_T4')}
            >
              <Phone size={14} color="#131313" />
              <Text style={styles.contactButtonText}>CONTACTAR UNIDAD</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resolveButton}
              activeOpacity={0.85}
              onPress={() => {
                onResolveIncident(incident.id);
                onBackToHome();
              }}
            >
              <CheckCircle size={16} color="#34d399" />
              <Text style={styles.resolveButtonText}>FINALIZAR</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'space-between',
  },
  header: {
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(19,19,19,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
  },
  backButtonText: {
    fontSize: 11,
    color: '#c4c7c8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  headerTitle: {
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 2,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#ffb4ab',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(19,19,19,0.85)',
  },
  voiceButtonActive: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  voiceButtonText: {
    color: '#fff',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  hudWrapper: {
    zIndex: 30,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  hudCard: {
    width: '100%',
    backgroundColor: 'rgba(20,20,22,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 28,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  unitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  unitIconBox: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitTextBox: {
    flexShrink: 1,
  },
  unitNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitName: {
    fontWeight: '800',
    fontSize: 15,
    color: '#fff',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  statusPillText: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: '700',
  },
  unitOrigin: {
    color: '#8e9192',
    fontSize: 10,
  },
  etaBox: {
    alignItems: 'flex-end',
  },
  etaValue: {
    fontWeight: '800',
    fontSize: 24,
    color: '#fff',
  },
  etaLabel: {
    fontSize: 9,
    color: '#ffb4ab',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  progressSection: {
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabelCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressLabelText: {
    fontSize: 9,
    color: '#c4c7c8',
  },
  progressLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressSegment: {
    flex: 1,
    height: '100%',
  },
  expandedSection: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandedText: {
    color: '#c4c7c8',
    fontSize: 11,
    flexShrink: 1,
  },
  evidenceImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  expandedFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedIdText: {
    color: '#8e9192',
    fontSize: 10,
  },
  advanceStageText: {
    color: '#fff',
    fontSize: 10,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toggleButtonText: {
    color: '#8e9192',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
  },
  contactButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  contactButtonText: {
    color: '#131313',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resolveButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resolveButtonText: {
    color: '#6ee7b7',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
