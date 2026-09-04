import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Clock,
  MapPin,
  ChevronRight,
  Trash2,
  X,
  Car,
  Flame,
  HeartPulse,
  ShieldAlert,
  HelpCircle,
  CheckCircle,
  Mic,
  Image as ImageIcon,
  CheckCircle2,
  Eye,
  Navigation,
  Play,
  Pause,
  MessageSquare,
} from 'lucide-react-native';
import { IncidentReport, EmergencyCategory, ChatMessage } from '../types';
import { IncidentMap } from '../components/IncidentMap';

// ---------------------------------------------------------------------------
// HistoryScreen (React Native)
// - div/Tailwind -> View/StyleSheet
// - motion.div -> Animated.View (reanimated) con entering=FadeInUp
// - Modal fixed inset-0 -> <Modal> nativo con transparent + animationType
// - overflow-y-auto -> ScrollView
// ---------------------------------------------------------------------------

interface HistoryScreenProps {
  reports: IncidentReport[];
  onSelectReport?: (report: IncidentReport) => void;
  onOpenCreateIncident?: () => void;
  onDeleteReport?: (id: string) => void;
  theme?: 'dark' | 'light';
}

type FilterCategory = 'all' | 'in_progress' | 'resolved' | 'closed';

const CATEGORY_ICONS: Record<EmergencyCategory, any> = {
  traffic: Car,
  fire: Flame,
  medical: HeartPulse,
  robbery: ShieldAlert,
};

// Audio del chat (reproducido con expo-audio)
const PlayableAudio: React.FC<{ uri: string; transcript?: string; isLight: boolean }> = ({ uri, transcript, isLight }) => {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  const statusText =
    playing
      ? 'PLAYING'
      : status.currentTime > 0 && status.duration > 0
      ? `${Math.floor(status.currentTime)} / ${Math.ceil(status.duration)} s`
      : 'Grabación';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => (playing ? player.pause() : player.play())}
      style={[
        styles.audioRow,
        { backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)' },
      ]}
    >
      <View style={[styles.audioToggle, { backgroundColor: isLight ? '#000' : '#fff' }]}>
        {playing ? (
          <Pause size={14} color={isLight ? '#fff' : '#000'} />
        ) : (
          <Play size={14} color={isLight ? '#fff' : '#000'} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.audioLabel, { color: isLight ? '#000' : '#fff' }]} numberOfLines={1}>
          {transcript || 'Registro de voz IA'}
        </Text>
        <View style={styles.equalizer}>
          {[0.5, 0.9, 0.4, 1, 0.6, 0.85, 0.45].map((h, i) => (
            <View key={i} style={[styles.eqBar, { height: 4 + h * 12, backgroundColor: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.4)' }]} />
          ))}
        </View>
      </View>
      <Text style={[styles.audioTime, { color: isLight ? '#000' : '#fff' }]}>{statusText}</Text>
    </TouchableOpacity>
  );
};

// Video del chat (reproducido con expo-video)
const PlayableVideo: React.FC<{ uri: string; isLight: boolean }> = ({ uri, isLight }) => {
  const player = useVideoPlayer(uri);
  return (
    <View style={[styles.videoRow, { backgroundColor: isLight ? '#000' : '#0a0a0b', borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)' }]}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture
      />
      <View style={styles.videoMeta}>
        <Play size={12} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
          Evidencia en video del incidente
        </Text>
      </View>
    </View>
  );
};

// Burbujas y tarjetas del chat persistido dentro del expediente
const ChatThreadItem: React.FC<{ msg: ChatMessage; isLight: boolean; textMuted: string }> = ({ msg, isLight, textMuted }) => {
  const bg = msg.sender === 'ai' ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)') : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
  const border = msg.sender === 'ai' ? 'rgba(16,185,129,0.3)' : isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';

  if (msg.type === 'photo' && msg.photoUrl) {
    return (
      <View style={[styles.chatBubble, { backgroundColor: bg, borderColor: border }]}>
        <Image source={{ uri: msg.photoUrl }} style={styles.chatPhoto} resizeMode="cover" />
        {msg.text ? <Text style={[styles.chatText, { color: isLight ? '#000' : '#fff' }]}>{msg.text}</Text> : null}
      </View>
    );
  }
  if (msg.type === 'video' && msg.videoUrl) {
    return (
      <View style={[styles.chatBubble, { backgroundColor: bg, borderColor: border }]}>
        <PlayableVideo uri={msg.videoUrl} isLight={isLight} />
        {msg.text ? <Text style={[styles.chatText, { color: isLight ? '#000' : '#fff' }]}>{msg.text}</Text> : null}
      </View>
    );
  }
  if (msg.type === 'audio' && msg.audioUrl) {
    return (
      <View style={[styles.chatBubble, { backgroundColor: bg, borderColor: border }]}>
        <PlayableAudio uri={msg.audioUrl} transcript={msg.audioTranscript} isLight={isLight} />
      </View>
    );
  }
  if (msg.type === 'live_tracking_card') {
    return (
      <View style={[styles.chatBubble, { backgroundColor: bg, borderColor: border }]}>
        <View style={styles.trackingRow}>
          <MapPin size={13} color="#10b981" />
          <Text style={[styles.chatText, { color: isLight ? '#000' : '#fff' }]}>
            {msg.text || 'Unidad en seguimiento táctico desde tu ubicación.'}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.chatBubble, { backgroundColor: bg, borderColor: border }]}>
      <Text
        style={[styles.chatSender, { color: msg.sender === 'ai' ? '#10b981' : textMuted }]}
      >
        {msg.sender === 'ai' ? 'IA // CENTRAL' : msg.sender === 'system' ? 'SISTEMA' : 'TU'}
      </Text>
      <Text style={[styles.chatText, { color: isLight ? '#000' : '#fff' }]}>{msg.text}</Text>
      <Text style={[styles.chatTime, { color: textMuted }]}>{msg.timestamp}</Text>
    </View>
  );
};

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  reports,
  onSelectReport,
  onOpenCreateIncident,
  onDeleteReport,
  theme = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';
  const [selectedDetailReport, setSelectedDetailReport] = useState<IncidentReport | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterCategory>('all');

  const sortedAndFilteredReports = useMemo(() => {
    let result = [...reports];
    if (filterStatus !== 'all') {
      result = result.filter((rep) => rep.status === filterStatus);
    }
    return result;
  }, [reports, filterStatus]);

  const getCategoryIcon = (category: EmergencyCategory) => CATEGORY_ICONS[category] || HelpCircle;

  const renderStatusBadge = (status: IncidentReport['status']) => {
    switch (status) {
      case 'in_progress':
        return (
          <View style={[styles.statusBadge, styles.statusInProgress]}>
            <View style={styles.pulseDotAmber} />
            <Text style={[styles.statusBadgeText, { color: '#f59e0b' }]}>EN CURSO</Text>
          </View>
        );
      case 'resolved':
        return (
          <View style={[styles.statusBadge, styles.statusResolved]}>
            <CheckCircle size={10} color="#059669" />
            <Text style={[styles.statusBadgeText, { color: '#059669' }]}>RESUELTO</Text>
          </View>
        );
      case 'closed':
        return (
          <View style={[styles.statusBadge, styles.statusClosed]}>
            <CheckCircle2 size={10} color="#0891b2" />
            <Text style={[styles.statusBadgeText, { color: '#0891b2' }]}>ARCHIVADO</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const textMuted = isLight ? '#6b6f70' : '#8e9192';
  const cardBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';

  return (
    <View style={[styles.container, { paddingTop: 76 + insets.top }]}>
      {/* Título / header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTopLeft}>
            <View style={styles.emeraldDot} />
            <Text style={[styles.eyebrow, { color: textMuted }]}>
              HISTORIAL
            </Text>
          </View>
        </View>
        <Text style={[styles.title, { color: isLight ? '#000' : '#fff' }]}>Reportes</Text>
        <Text style={[styles.subtitle, { color: textMuted }]}>
          Vista cronológica completa desde el primer reporte registrado hasta el último.
        </Text>
      </View>

      {/* Filtro por estado */}
      <View style={styles.controlsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          {(
            [
              { key: 'all', label: `Todos (${reports.length})`, activeColor: isLight ? '#000' : '#fff' },
              {
                key: 'in_progress',
                label: `En curso (${reports.filter((r) => r.status === 'in_progress').length})`,
                activeColor: '#f59e0b',
              },
              {
                key: 'resolved',
                label: `Resueltos (${reports.filter((r) => r.status === 'resolved').length})`,
                activeColor: '#059669',
              },
              {
                key: 'closed',
                label: `Archivados (${reports.filter((r) => r.status === 'closed').length})`,
                activeColor: '#0891b2',
              },
            ] as { key: FilterCategory; label: string; activeColor: string }[]
          ).map((chip) => {
            const active = filterStatus === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setFilterStatus(chip.key)}
                style={[
                  styles.chip,
                  { borderColor: active ? chip.activeColor : cardBorder },
                  active && { backgroundColor: `${chip.activeColor}22` },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? chip.activeColor : textMuted }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Lista de reportes */}
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 36, gap: 18 }}>
        {sortedAndFilteredReports.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <CheckCircle2 size={44} color="#10b981" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={[styles.emptyTitle, { color: isLight ? '#000' : '#fff' }]}>
              No hay reportes en esta categoría
            </Text>
            <Text style={[styles.emptyText, { color: textMuted }]}>
              Todos los incidentes generados aparecerán en esta lista con su ubicación georreferenciada en el mapa.
            </Text>
          </View>
        ) : (
          sortedAndFilteredReports.map((report, index) => {
            const Icon = getCategoryIcon(report.category);
            const originalIndex = reports.findIndex((r) => r.id === report.id);
            const recordNumber = originalIndex !== -1 ? originalIndex + 1 : index + 1;
            const isFirstRecord = originalIndex === 0;
            const isLastRecord = originalIndex === reports.length - 1;

            return (
              <Animated.View
                key={report.id}
                entering={FadeInUp.delay(index * 40).duration(300)}
                style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderLeft}>
                    <View
                      style={[
                        styles.cardIconBox,
                        { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)', borderColor: cardBorder },
                      ]}
                    >
                      <Icon size={20} color={isLight ? '#000' : '#fff'} />
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <View style={styles.cardBadgesRow}>
                        <View
                          style={[
                            styles.recordNumberBadge,
                            { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' },
                          ]}
                        >
                          <Text style={{ fontSize: 9, fontWeight: '700', color: isLight ? '#000' : '#fff' }}>
                            #{recordNumber}
                          </Text>
                        </View>
                        {report.id ? (
                          <Text style={[styles.recordIdText, { color: textMuted }]} numberOfLines={1}>
                            {report.id}
                          </Text>
                        ) : null}
                        {isFirstRecord && (
                          <View style={styles.firstRecordBadge}>
                            <Text style={styles.firstRecordText}>Primer Registro</Text>
                          </View>
                        )}
                        {isLastRecord && (
                          <View style={styles.lastRecordBadge}>
                            <Text style={styles.lastRecordText}>Último Registro</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.cardCategoryLabel, { color: isLight ? '#000' : '#fff' }]}>
                        {report.categoryLabel}
                      </Text>
                    </View>
                  </View>
                  {renderStatusBadge(report.status)}
                </View>

                <Text style={[styles.cardTitle, { color: isLight ? '#000' : '#fff' }]} numberOfLines={1}>
                  {report.title}
                </Text>
                <Text style={[styles.cardDescription, { color: textMuted }]} numberOfLines={2}>
                  {report.description}
                </Text>

                <View style={styles.mapWrapper}>
                  <IncidentMap
                    coordinates={report.coordinates || { lat: 19.4326, lng: -99.1332 }}
                    locationName={report.location}
                    category={report.category}
                    height={170}
                    interactive
                    showControls
                    unitAssigned={report.unitAssigned}
                    originDepot={report.originDepot}
                    onExpand={() => setSelectedDetailReport(report)}
                  />
                </View>

                <View style={[styles.cardFooter, { borderTopColor: cardBorder }]}>
                  <View style={styles.cardFooterLeft}>
                    <Clock size={13} color={textMuted} />
                    <Text style={{ color: textMuted, fontSize: 10 }}>
                      {report.date} • {report.time}
                    </Text>
                  </View>
                  {report.status === 'in_progress' ? (
                    <TouchableOpacity
                      style={styles.enterButton}
                      activeOpacity={0.85}
                      onPress={() =>
                        onSelectReport ? onSelectReport(report) : setSelectedDetailReport(report)
                      }
                    >
                      <Navigation size={13} color="#000" />
                      <Text style={styles.enterButtonText}>Ingresar</Text>
                      <ChevronRight size={12} color="#000" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.detailsButton,
                        { backgroundColor: isLight ? '#000' : '#fff' },
                      ]}
                      onPress={() => setSelectedDetailReport(report)}
                    >
                      <Eye size={13} color={isLight ? '#fff' : '#000'} />
                      <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 11, fontWeight: '700' }}>
                        Ver Detalles
                      </Text>
                      <ChevronRight size={12} color={isLight ? '#fff' : '#000'} />
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Modal de expediente completo */}
      <Modal
        visible={!!selectedDetailReport}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDetailReport(null)}
      >
        {selectedDetailReport && (
          <View style={[styles.modalOverlay, { backgroundColor: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(12,12,13,0.95)' }]}>
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <Animated.View entering={FadeIn.duration(220)} style={styles.modalInner}>
                {/* Barra superior del modal */}
                <View style={styles.modalTopBar}>
                  <View style={styles.headerTopLeft}>
                    <View style={styles.emeraldDot} />
                    <Text style={[styles.modalTopBarTitle, { color: isLight ? '#000' : '#fff' }]}>
                      EXPEDIENTE // {selectedDetailReport.id}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.modalCloseButton,
                      {
                        backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
                        borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
                      },
                    ]}
                    onPress={() => setSelectedDetailReport(null)}
                  >
                    <X size={16} color={isLight ? '#000' : '#fff'} />
                  </TouchableOpacity>
                </View>

                {/* Tarjeta principal del expediente */}
                <View
                  style={[
                    styles.modalCard,
                    { backgroundColor: isLight ? '#f7f7f8' : '#141416', borderColor: cardBorder },
                  ]}
                >
                  <View style={[styles.modalSectionRow, { borderBottomColor: cardBorder }]}>
                    <View>
                      <Text style={[styles.smallEyebrow, { color: textMuted }]}>CATEGORÍA DE INCIDENTE</Text>
                      <Text style={[styles.modalCategoryTitle, { color: isLight ? '#000' : '#fff' }]}>
                        {selectedDetailReport.categoryLabel}
                      </Text>
                    </View>
                    {renderStatusBadge(selectedDetailReport.status)}
                  </View>

                  <View>
                    <Text style={[styles.modalIncidentTitle, { color: isLight ? '#000' : '#fff' }]}>
                      {selectedDetailReport.title}
                    </Text>
                    <Text style={[styles.modalIncidentDesc, { color: textMuted }]}>
                      {selectedDetailReport.description}
                    </Text>
                  </View>

                  <View>
                    <View style={styles.sectionLabelRow}>
                      <MapPin size={13} color={textMuted} />
                      <Text style={[styles.smallEyebrow, { color: textMuted }]}>
                        Mapa Satelital & Geoposicionamiento
                      </Text>
                    </View>
                    <View style={{ height: 240, borderRadius: 20, overflow: 'hidden' }}>
                      <IncidentMap
                        coordinates={selectedDetailReport.coordinates || { lat: 19.4326, lng: -99.1332 }}
                        locationName={selectedDetailReport.location}
                        category={selectedDetailReport.category}
                        interactive
                        showControls
                        unitAssigned={selectedDetailReport.unitAssigned}
                      />
                    </View>
                  </View>

                  {selectedDetailReport.imageUrl && (
                    <View>
                      <View style={styles.sectionLabelRow}>
                        <ImageIcon size={13} color={textMuted} />
                        <Text style={[styles.smallEyebrow, { color: textMuted }]}>
                          Evidencia Fotográfica Registrada
                        </Text>
                      </View>
                      <Image
                        source={{ uri: selectedDetailReport.imageUrl }}
                        style={styles.evidenceImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {selectedDetailReport.aiVoiceMessage && (
                    <View
                      style={[
                        styles.aiNoteBox,
                        { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)', borderColor: cardBorder },
                      ]}
                    >
                      <Mic size={16} color="#10b981" style={{ marginTop: 2 }} />
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[styles.smallEyebrow, { color: textMuted }]}>
                          Transcripción & Análisis IA
                        </Text>
                        <Text style={[styles.aiNoteText, { color: isLight ? '#000' : '#fff' }]}>
                          {'\u201C'}{selectedDetailReport.aiVoiceMessage}{'\u201D'}
                        </Text>
                      </View>
                    </View>
                  )}

                  {selectedDetailReport.chat && selectedDetailReport.chat.length > 0 && (
                    <View>
                      <View style={styles.sectionLabelRow}>
                        <MessageSquare size={13} color={textMuted} />
                        <Text style={[styles.smallEyebrow, { color: textMuted }]}>
                          Evidencias y Conversación Completa
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.chatThread,
                          { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: cardBorder },
                        ]}
                      >
                        {selectedDetailReport.chat.map((msg, idx) => (
                          <ChatThreadItem key={idx} msg={msg} isLight={isLight} textMuted={textMuted} />
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Grid de metadatos */}
                  <View style={[styles.metaGrid, { borderTopColor: cardBorder }]}>
                    {[
                      ['Unidad Asignada', selectedDetailReport.unitAssigned || 'Sin asignar'],
                      ['Base de Origen', selectedDetailReport.originDepot || 'Sin estación'],
                      ['Fecha y Hora', `${selectedDetailReport.date} - ${selectedDetailReport.time}`],
                      ['Nivel de Gravedad', (selectedDetailReport.severity || 'No definida').toUpperCase()],
                    ].map(([label, value]) => (
                      <View
                        key={label}
                        style={[
                          styles.metaCell,
                          { backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.05)', borderColor: cardBorder },
                        ]}
                      >
                        <Text style={[styles.metaCellLabel, { color: textMuted }]}>{label}</Text>
                        <Text style={[styles.metaCellValue, { color: isLight ? '#000' : '#fff' }]}>{value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.addressRow, { borderTopColor: cardBorder }]}>
                    <MapPin size={15} color={textMuted} />
                    <Text style={{ color: textMuted, fontSize: 11, flexShrink: 1 }}>
                      {selectedDetailReport.location}
                    </Text>
                  </View>
                </View>

                {/* Botones de acción */}
                {selectedDetailReport.status === 'in_progress' && onSelectReport && (
                  <TouchableOpacity
                    style={styles.enterChatButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      const rep = selectedDetailReport;
                      setSelectedDetailReport(null);
                      onSelectReport(rep);
                    }}
                  >
                    <Navigation size={16} color="#000" />
                    <Text style={styles.enterChatButtonText}>INGRESAR AL CHAT EN VIVO</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.closeFileButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
                  onPress={() => setSelectedDetailReport(null)}
                >
                  <Text style={{ color: isLight ? '#fff' : '#131313', fontWeight: '800', fontSize: 14 }}>
                    CERRAR EXPEDIENTE
                  </Text>
                </TouchableOpacity>

                {onDeleteReport && (
                  <TouchableOpacity
                    style={[styles.deleteButton, { borderColor: cardBorder }]}
                    onPress={() => {
                      onDeleteReport(selectedDetailReport.id);
                      setSelectedDetailReport(null);
                    }}
                  >
                    <Trash2 size={14} color="#8e9192" />
                    <Text style={{ color: '#8e9192', fontSize: 11 }}>Eliminar del historial</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { paddingBottom: 12 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emeraldDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700' },
  title: { fontWeight: '800', fontSize: 26, textTransform: 'uppercase' },
  subtitle: { fontSize: 11, marginTop: 6 },
  controlsWrapper: { gap: 10, marginBottom: 16 },
  chipsRow: { flexGrow: 0 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 6 },
  chipText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  list: { flex: 1 },
  emptyCard: { borderRadius: 28, padding: 32, borderWidth: 1, marginTop: 24 },
  emptyTitle: { fontWeight: '800', fontSize: 16, textAlign: 'center', textTransform: 'uppercase' },
  emptyText: { fontSize: 11, marginTop: 6, textAlign: 'center', lineHeight: 16 },
  card: { borderRadius: 24, padding: 16, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  cardIconBox: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardBadgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  recordNumberBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  recordIdText: { fontSize: 9, fontWeight: '700', fontVariant: ['tabular-nums'] },
  firstRecordBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  firstRecordText: { fontSize: 8, fontWeight: '700', color: '#059669', textTransform: 'uppercase' },
  lastRecordBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(8,145,178,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.3)',
  },
  lastRecordText: { fontSize: 8, fontWeight: '700', color: '#0891b2', textTransform: 'uppercase' },
  cardCategoryLabel: { fontWeight: '800', fontSize: 14, marginTop: 2 },
  cardTitle: { fontWeight: '700', fontSize: 13, marginBottom: 4 },
  cardDescription: { fontSize: 11, lineHeight: 15, marginBottom: 12 },
  mapWrapper: { height: 170, borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  cardFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  enterButtonText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  statusInProgress: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' },
  statusResolved: { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.3)' },
  statusClosed: { backgroundColor: 'rgba(8,145,178,0.15)', borderColor: 'rgba(8,145,178,0.3)' },
  pulseDotAmber: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  modalOverlay: { flex: 1 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalInner: { maxWidth: 420, width: '100%', alignSelf: 'center', gap: 10 },
  modalTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTopBarTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: { borderRadius: 28, padding: 20, borderWidth: 1, gap: 14 },
  modalSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  smallEyebrow: { fontSize: 10, textTransform: 'uppercase', fontWeight: '700' },
  modalCategoryTitle: { fontWeight: '800', fontSize: 18, textTransform: 'uppercase' },
  modalIncidentTitle: { fontWeight: '800', fontSize: 15, textTransform: 'uppercase', marginBottom: 4 },
  modalIncidentDesc: { fontSize: 12, lineHeight: 17 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  evidenceImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16 },
  aiNoteBox: { padding: 12, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10 },
  aiNoteText: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTopWidth: 1 },
  metaCell: { width: '47%', padding: 10, borderRadius: 12, borderWidth: 1 },
  metaCellLabel: { fontSize: 9, textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 },
  metaCellValue: { fontSize: 12, fontWeight: '700' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1 },
  closeFileButton: { paddingVertical: 14, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  enterChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  enterChatButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 28,
    borderWidth: 1,
  },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1 },
  audioToggle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  audioLabel: { fontSize: 11, fontWeight: '700' },
  equalizer: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eqBar: { width: 3, borderRadius: 2 },
  audioTime: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  videoRow: { borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  videoPlayer: { width: '100%', aspectRatio: 16 / 10 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  chatThread: { borderRadius: 18, padding: 10, borderWidth: 1, gap: 8 },
  chatBubble: { borderRadius: 14, padding: 10, borderWidth: 1, gap: 6 },
  chatSender: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chatText: { fontSize: 12, lineHeight: 17 },
  chatTime: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  chatPhoto: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
