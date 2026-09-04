import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShieldAlert,
  Bot,
  MapPin,
  FileText,
  HeartPulse,
  Sun,
  Moon,
  EyeOff,
  Bell,
  ArrowRight,
  Sliders,
  Sparkles,
  X,
  Vibrate,
} from 'lucide-react-native';
import { SystemSettings } from '../types';
import { SwitchToggle } from './SwitchToggle';
import { DotPatternLayer } from './DotPatternLayer';

// ---------------------------------------------------------------------------
// AppTourAndSetupModal (React Native)
// - toggles -> componente SwitchToggle (traducción del switch web)
// - detalle por función -> <Modal transparent> (solo texto)
// ---------------------------------------------------------------------------

interface AppTourAndSetupModalProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onFinishTour: () => void;
}

interface FeatureItem {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  tag: string;
  title: string;
  desc: string;
  badge: string;
  details: string;
}

export const AppTourAndSetupModal: React.FC<AppTourAndSetupModalProps> = ({
  settings,
  onUpdateSettings,
  onFinishTour,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'features' | 'settings'>('features');
  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number | null>(null);

  const isLight = localSettings.theme === 'light';
  const bg = isLight ? '#f7f7f8' : '#0c0c0d';
  const fg = isLight ? '#121212' : '#e5e2e1';
  const muted = '#8e9192';

  const updateLocalSetting = (changes: Partial<SystemSettings>) => {
    const updated = { ...localSettings, ...changes };
    setLocalSettings(updated);
    onUpdateSettings(changes);
  };

  const handleUseDefaults = () => {
    onFinishTour();
  };

  const handleSaveAndContinue = () => {
    onUpdateSettings(localSettings);
    onFinishTour();
  };

  const featuresList: FeatureItem[] = [
    {
      icon: ShieldAlert,
      tag: '01 // DISPARADOR',
      title: 'Botón SOS Rápido en 1 Toque',
      desc: 'Activa un protocolo de emergencia geolocalizado en segundos.',
      badge: 'ALTA PRIORIDAD',
      details: 'Presiona el botón central para iniciar la cadena de auxilio inmediata. Emite coordenadas exactas en vivo y prepara el enlace con servicios de emergencia.',
    },
    {
      icon: Bot,
      tag: '02 // IA MULTIMODAL',
      title: 'Asistente de Emergencia IA',
      desc: 'Procesamiento en tiempo real de voz e imágenes de la escena.',
      badge: 'GEMINI IA // ACTIVA',
      details: 'Habla o envía fotos y video de la situación. La IA realiza un triage inteligente, calcula gravedad y sugiere pasos de primeros auxilios mientras llegan las unidades.',
    },
    {
      icon: MapPin,
      tag: '03 // TELEMETRÍA HD',
      title: 'Mapa Satelital y Rastreo en Vivo',
      desc: 'Visualización de la patrulla en ruta con ETA dinámico.',
      badge: 'GPS SATELITAL // 3D',
      details: 'Sigue en tiempo real el avance de la unidad policial o médica asignada a tu ubicación, con tiempo estimado de arribo y estado de despacho continuo.',
    },
    {
      icon: FileText,
      tag: '04 // BITÁCORA FORENSE',
      title: 'Historial Cronológico de Reportes',
      desc: 'Registro seguro de incidentes pasados con notas de voz.',
      badge: 'REGISTRO FORENSE',
      details: 'Accede a la bitácora completa de eventos anteriores o reanuda la conversación con la IA de cualquier incidente en curso.',
    },
    {
      icon: HeartPulse,
      tag: '05 // CONTACTOS Y SALUD',
      title: 'Ficha Médica y Círculo Seguro',
      desc: 'Grupo sanguíneo, alergias y llamada directa a contactos.',
      badge: 'CÍRCULO SEGURO',
      details: 'Tus contactos de emergencia recibirán alertas automáticas con tu ubicación satelital precisa ante cualquier activación SOS.',
    },
  ];

  const activeFeature = selectedFeatureIndex !== null ? featuresList[selectedFeatureIndex] : null;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Retícula de puntitos de fondo */}
      <DotPatternLayer
        color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
        dotRadius={1.3}
        opacity={0.65}
      />

      <View style={[styles.content, { paddingTop: 16 + insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: fg }]}>Bienvenido a SECURE_OS</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Conoce las capacidades del sistema y configura tus ajustes iniciales.
          </Text>

          {/* Tab Switcher */}
          <View
            style={[
              styles.tabContainer,
              { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'features' && (isLight ? styles.tabActiveLight : styles.tabActiveDark),
              ]}
              onPress={() => setActiveTab('features')}
            >
              <Sparkles size={16} color={activeTab === 'features' ? (isLight ? '#fff' : '#000') : muted} />
              <Text style={[styles.tabText, { color: activeTab === 'features' ? (isLight ? '#fff' : '#000') : muted }]}>
                Funciones (5)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'settings' && (isLight ? styles.tabActiveLight : styles.tabActiveDark),
              ]}
              onPress={() => setActiveTab('settings')}
            >
              <Sliders size={16} color={activeTab === 'settings' ? (isLight ? '#fff' : '#000') : muted} />
              <Text style={[styles.tabText, { color: activeTab === 'settings' ? (isLight ? '#fff' : '#000') : muted }]}>
                Ajustes Iniciales
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content */}
        <ScrollView style={styles.main} contentContainerStyle={{ paddingBottom: 4 }}>
          {activeTab === 'features' ? (
            <Animated.View key="features-view" entering={FadeIn.duration(120)} style={styles.mainInner}>
              {featuresList.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.85}
                    onPress={() => setSelectedFeatureIndex(idx)}
                    style={[
                      styles.featureCard,
                      {
                        backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)',
                        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                      },
                    ]}
                  >
                    <View style={styles.featureCardLeft}>
                      <View style={[styles.iconTile, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                        <Icon size={20} color={fg} />
                      </View>
                      <View style={styles.featureText}>
                        <View style={styles.featureTagRow}>
                          <Text style={[styles.featureTag, { color: muted }]}>{item.tag}</Text>
                          <Text style={styles.featureBadge}>{item.badge}</Text>
                        </View>
                        <Text style={[styles.featureTitle, { color: fg }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.featureDesc, { color: muted }]} numberOfLines={2}>
                          {item.desc}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.expandIconCircle, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                      <ArrowRight size={14} color={fg} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          ) : (
            <Animated.View key="settings-view" entering={FadeIn.duration(120)} style={styles.mainInner}>
              {/* 1. Tema */}
              <View
                style={[
                  styles.settingsCard,
                  { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
                ]}
              >
                <View style={styles.settingsCardHeader}>
                  <View>
                    <Text style={[styles.settingsCardTitle, { color: fg }]}>Tema de Visualización</Text>
                    <Text style={[styles.settingsCardSub, { color: muted }]}>Estilo Nothing OS Monocromático</Text>
                  </View>
                  {isLight ? <Sun size={20} color="#f59e0b" /> : <Moon size={20} color="#fff" />}
                </View>
                <View style={styles.themeGrid}>
                  <TouchableOpacity
                    onPress={() => updateLocalSetting({ theme: 'light' })}
                    style={[
                      styles.themeButton,
                      { borderWidth: 1 },
                      isLight
                        ? { backgroundColor: '#000', borderColor: '#000' }
                        : { backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.1)' },
                    ]}
                  >
                    <Sun size={16} color={isLight ? '#fff' : '#8e9192'} />
                    <Text style={{ color: isLight ? '#fff' : '#8e9192', fontWeight: '700', fontSize: 11 }}>
                      Claro (White)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateLocalSetting({ theme: 'dark' })}
                    style={[
                      styles.themeButton,
                      { borderWidth: 1 },
                      !isLight
                        ? { backgroundColor: '#fff', borderColor: '#fff' }
                        : { backgroundColor: 'rgba(0,0,0,0.05)', borderColor: 'rgba(0,0,0,0.1)' },
                    ]}
                  >
                    <Moon size={16} color={!isLight ? '#000' : '#8e9192'} />
                    <Text style={{ color: !isLight ? '#000' : '#8e9192', fontWeight: '700', fontSize: 11 }}>
                      Oscuro (Black)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. Alerta Silenciosa */}
              <View
                style={[
                  styles.settingsRowCard,
                  { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
                ]}
              >
                <View style={styles.settingRowLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                    <EyeOff size={16} color={fg} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.settingRowTitle, { color: fg }]}>Alerta Silenciosa</Text>
                    <Text style={[styles.settingRowSub, { color: muted }]}>Despacho sin sirena ni destello LED</Text>
                  </View>
                </View>
                <SwitchToggle
                  value={localSettings.silentAlarmMode}
                  onValueChange={(next) => updateLocalSetting({ silentAlarmMode: next })}
                  isLight={isLight}
                />
              </View>

              {/* 3. Avisar a Familiares */}
              <View
                style={[
                  styles.settingsRowCard,
                  { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
                ]}
              >
                <View style={styles.settingRowLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                    <Bell size={16} color={fg} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.settingRowTitle, { color: fg }]}>Avisar a Familiares</Text>
                    <Text style={[styles.settingRowSub, { color: muted }]}>Envío de coordenadas y estado en 1 toque</Text>
                  </View>
                </View>
                <SwitchToggle
                  value={localSettings.autoNotifyContacts}
                  onValueChange={(next) => updateLocalSetting({ autoNotifyContacts: next })}
                  isLight={isLight}
                />
              </View>

              {/* 4. Vibración Háptica */}
              <View
                style={[
                  styles.settingsRowCard,
                  { backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
                ]}
              >
                <View style={styles.settingRowLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                    <Vibrate size={16} color={fg} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.settingRowTitle, { color: fg }]}>Vibración Háptica Táctica</Text>
                    <Text style={[styles.settingRowSub, { color: muted }]}>Confirmación física en pulsaciones SOS</Text>
                  </View>
                </View>
                <SwitchToggle
                  value={localSettings.hapticFeedback}
                  onValueChange={(next) => updateLocalSetting({ hapticFeedback: next })}
                  isLight={isLight}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: 32 + insets.bottom }]}>
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.footerDefault,
                { borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' },
                isLight ? styles.footerDefaultLight : styles.footerDefaultDark,
              ]}
              onPress={handleUseDefaults}
            >
              <Text style={{ color: isLight ? '#000' : '#fff', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
                Dejar Predeterminado
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.footerPrimary,
                isLight ? styles.footerPrimaryLight : styles.footerPrimaryDark,
              ]}
              onPress={handleSaveAndContinue}
            >
              <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
                Guardar y Continuar
              </Text>
              <ArrowRight size={16} color={isLight ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Lightbox */}
      <Modal
        visible={activeFeature != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFeatureIndex(null)}
      >
        <Pressable style={styles.lightboxOverlay} onPress={() => setSelectedFeatureIndex(null)}>
          {activeFeature && (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.lightboxCard, { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }]}>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={styles.lightboxHeader}>
                  <Text style={[styles.lightboxTag, { color: muted }]}>{activeFeature.tag}</Text>
                  <TouchableOpacity
                    style={[styles.lightboxClose, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}
                    onPress={() => setSelectedFeatureIndex(null)}
                  >
                    <X size={16} color={fg} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.lightboxBadge, { borderColor: 'rgba(255,255,255,0.2)' }]}>
                  <Text style={styles.lightboxBadgeText}>{activeFeature.badge}</Text>
                </View>

                <Text style={[styles.lightboxTitle, { color: fg }]}>{activeFeature.title}</Text>
                <Text style={[styles.lightboxDetails, { color: muted }]}>{activeFeature.details}</Text>

                <TouchableOpacity
                  style={[
                    styles.lightboxCta,
                    isLight ? styles.footerPrimaryLight : styles.footerPrimaryDark,
                  ]}
                  onPress={() => setSelectedFeatureIndex(null)}
                >
                  <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>
                    Entendido
                  </Text>
                </TouchableOpacity>
              </Pressable>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 0 },
  header: { marginBottom: 8 },
  title: { fontWeight: '800', fontSize: 24, textTransform: 'uppercase', lineHeight: 28 },
  subtitle: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  tabContainer: { flexDirection: 'row', padding: 4, borderRadius: 16, borderWidth: 1, marginTop: 12 },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabActiveLight: { backgroundColor: '#000' },
  tabActiveDark: { backgroundColor: '#fff' },
  tabText: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  main: { flex: 1, marginTop: 12 },
  mainInner: { gap: 10 },
  featureCard: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  featureCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  iconTile: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, minWidth: 0 },
  featureTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  featureTag: { fontSize: 8, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  featureBadge: {
    fontSize: 8,
    textTransform: 'uppercase',
    fontWeight: '700',
    color: '#10b981',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  featureTitle: { fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  featureDesc: { fontSize: 10, marginTop: 2 },
  expandIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  settingsCard: { borderRadius: 24, padding: 16, borderWidth: 1 },
  settingsCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  settingsCardTitle: { fontWeight: '700', fontSize: 14, textTransform: 'uppercase' },
  settingsCardSub: { fontSize: 10, marginTop: 2 },
  themeGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  themeButton: { flex: 1, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  settingsRowCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingRowTitle: { fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  settingRowSub: { fontSize: 10, marginTop: 2 },
  footer: { paddingTop: 10, paddingBottom: 12 },
  footerRow: { flexDirection: 'row', gap: 10 },
  footerButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
  },
  footerDefault: {},
  footerDefaultLight: { backgroundColor: '#fff' },
  footerDefaultDark: { backgroundColor: 'rgba(255,255,255,0.1)' },
  footerPrimary: { borderWidth: 0, shadowRadius: 8, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 } },
  footerPrimaryLight: { backgroundColor: '#000' },
  footerPrimaryDark: { backgroundColor: '#fff' },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxCard: {
    maxWidth: 448,
    width: '100%',
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
  },
  lightboxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  lightboxTag: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  lightboxClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lightboxBadge: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
  },
  lightboxBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  lightboxTitle: { fontWeight: '800', fontSize: 18, textTransform: 'uppercase', marginBottom: 6, lineHeight: 22 },
  lightboxDetails: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  lightboxCta: {
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
