import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Sun,
  Moon,
  Radio,
  Activity,
  Lock,
  Mic,
  Users,
  Vibrate,
  LogOut,
  EyeOff,
  Sparkles,
  ShieldAlert,
  Smartphone,
  Volume2,
  Crosshair,
  FileCheck,
  CheckCircle2,
} from 'lucide-react-native';
import { SystemSettings, UserProfile } from '../types';
import { SwitchToggle } from '../components/SwitchToggle';

// ---------------------------------------------------------------------------
// SettingsScreen (React Native)
// - div/Tailwind -> View/StyleSheet
// - toggle "switch" -> SwitchToggle (animación Switch XX deslizable)
// - motion.button -> TouchableOpacity (los micro-scale hover no aplican en RN)
// - Vibración táctil real añadida con expo-haptics en cada toggle
// ---------------------------------------------------------------------------

interface SettingsScreenProps {
  settings: SystemSettings;
  onUpdateSettings: (newSettings: Partial<SystemSettings>) => void;
  onBack: () => void;
  onLogout: () => void;
  userProfile?: UserProfile;
}

// Fila con switch estilo "Nothing OS" (blanco/negro monocromático)
const ToggleRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  isLight: boolean;
  bordered?: boolean;
  hapticsEnabled?: boolean;
}> = ({ icon, title, subtitle, value, onToggle, isLight, bordered, hapticsEnabled = true }) => (
  <View
    style={[
      styles.toggleRow,
      bordered && { borderTopWidth: 1, borderTopColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)', paddingTop: 10 },
    ]}
  >
    <View style={styles.toggleRowLeft}>
      <View style={[styles.iconCircle, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
        {icon}
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.toggleTitle, { color: isLight ? '#131313' : '#fff' }]}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <SwitchToggle
      value={value}
      onValueChange={(next) => {
        if (next !== value) onToggle();
      }}
      isLight={isLight}
      hapticsEnabled={hapticsEnabled}
    />
  </View>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  onBack,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const isLight = settings.theme === 'light';
  const fg = isLight ? '#131313' : '#fff';
  const sectionBg = isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.05)';
  const sectionBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';

  return (
    <View style={[styles.container, { paddingTop: 76 + insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backButton, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
        >
          <ArrowLeft size={16} color={fg} />
          <Text style={{ color: fg, fontSize: 10, fontWeight: '700' }}>Volver</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: fg }]}>CONFIGURACIÓN</Text>
          <Text style={styles.headerSubtitle}>CONTROL TÁCTICO // OS</Text>
        </View>

        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
        {/* 1. Tema visual */}
        <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: fg }]}>Tema de Interfaz</Text>
              <Text style={styles.sectionSubtitle}>Estilo Nothing OS Monocromático</Text>
            </View>
            {isLight ? <Sun size={20} color="#f59e0b" /> : <Moon size={20} color="#fff" />}
          </View>

          <View style={styles.themeGrid}>
            <TouchableOpacity
              onPress={() => onUpdateSettings({ theme: 'dark' })}
              style={[
                styles.themeButton,
                !isLight
                  ? { backgroundColor: '#fff', borderColor: '#fff' }
                  : { backgroundColor: 'rgba(0,0,0,0.05)', borderColor: 'rgba(0,0,0,0.1)' },
              ]}
            >
              <Moon size={16} color={!isLight ? '#000' : '#666'} />
              <Text style={{ fontSize: 11, color: !isLight ? '#000' : '#666', fontWeight: '700' }}>
                Oscuro (Black)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onUpdateSettings({ theme: 'light' })}
              style={[
                styles.themeButton,
                isLight
                  ? { backgroundColor: '#000', borderColor: '#000' }
                  : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
              ]}
            >
              <Sun size={16} color={isLight ? '#fff' : '#8e9192'} />
              <Text style={{ fontSize: 11, color: isLight ? '#fff' : '#8e9192', fontWeight: '700' }}>
                Claro (White)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Respuesta y disuasión SOS */}
        <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: fg }]}>Respuesta y Disuasión SOS</Text>
          <Text style={[styles.sectionSubtitle, { marginBottom: 14 }]}>
            Comportamiento sonoro y de red ante pulsación
          </Text>

          <ToggleRow
            icon={<EyeOff size={16} color={fg} />}
            title="Modo Alerta Silenciosa"
            subtitle="Envía despacho policial sin sonido ni luces"
            value={settings.silentAlarmMode}
            onToggle={() => onUpdateSettings({ silentAlarmMode: !settings.silentAlarmMode })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
          />

          <View style={[styles.sirenSection, { borderTopColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
            <View style={styles.sirenHeaderRow}>
              <Text style={[styles.toggleTitle, { color: fg }]}>Volumen Sirena Local</Text>
              <Text style={styles.toggleSubtitle}>
                {settings.sirenVolume === 'off' ? 'Apagada' : settings.sirenVolume === 'low' ? 'Media' : 'Máxima 110dB'}
              </Text>
            </View>
            <View style={styles.sirenButtonsRow}>
              {(['off', 'low', 'max'] as const).map((vol) => {
                const active = settings.sirenVolume === vol;
                return (
                  <TouchableOpacity
                    key={vol}
                    onPress={() => onUpdateSettings({ sirenVolume: vol })}
                    style={[
                      styles.sirenButton,
                      active
                        ? { backgroundColor: isLight ? '#000' : '#fff', borderColor: isLight ? '#000' : '#fff' }
                        : { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor: sectionBorder },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: active ? (isLight ? '#fff' : '#000') : isLight ? '#666' : '#8e9192',
                      }}
                    >
                      {vol === 'off' ? 'Silencio' : vol === 'low' ? 'Bajo' : 'Máximo'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <ToggleRow
            icon={<Users size={16} color={fg} />}
            title="Aviso a Contactos SOS"
            subtitle="SMS instantáneo con enlace GPS"
            value={settings.autoNotifyContacts}
            onToggle={() => onUpdateSettings({ autoNotifyContacts: !settings.autoNotifyContacts })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />
        </View>

        {/* 3. Sensores y telemetría */}
        <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: fg }]}>Sensores y Telemetría</Text>
          <Text style={[styles.sectionSubtitle, { marginBottom: 14 }]}>
            Monitoreo inteligente en segundo plano
          </Text>

          <ToggleRow
            icon={<Radio size={16} color={fg} />}
            title="Transmisión GPS Continua"
            subtitle="Actualización cada 3 segundos"
            value={settings.autoGpsBroadcast}
            onToggle={() => onUpdateSettings({ autoGpsBroadcast: !settings.autoGpsBroadcast })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
          />
          <ToggleRow
            icon={<Activity size={16} color={fg} />}
            title="Detección de Caídas / Choques"
            subtitle="Alerta con temporizador de 15s"
            value={settings.fallImpactDetection}
            onToggle={() => onUpdateSettings({ fallImpactDetection: !settings.fallImpactDetection })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />
          <ToggleRow
            icon={<Vibrate size={16} color={fg} />}
            title="Respuesta Háptica"
            subtitle="Vibración en botones tácticos"
            value={settings.hapticFeedback}
            onToggle={() => onUpdateSettings({ hapticFeedback: !settings.hapticFeedback })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />
        </View>

        {/* 4. Seguridad y procesamiento IA */}
        <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: fg }]}>Seguridad y Procesamiento IA</Text>
          <Text style={[styles.sectionSubtitle, { marginBottom: 14 }]}>
            Privacidad y encriptación táctica
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
                <Lock size={16} color={fg} />
              </View>
              <View>
                <Text style={[styles.toggleTitle, { color: fg }]}>Encriptación AES-256 E2E</Text>
                <Text style={styles.toggleSubtitle}>Voz y telemetría cifradas</Text>
              </View>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVO</Text>
            </View>
          </View>

          <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)', paddingTop: 10 }]}>
            <View style={styles.toggleRowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]}>
                <CheckCircle2 size={16} color="#10b981" />
              </View>
              <View>
                <Text style={[styles.toggleTitle, { color: fg }]}>Enlace Satelital</Text>
                <Text style={styles.toggleSubtitle}>Conexión permanente con centros 911</Text>
              </View>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVO</Text>
            </View>
          </View>

          <ToggleRow
            icon={<Mic size={16} color={fg} />}
            title="Transcripción IA de Voz"
            subtitle="Análisis de gravedad en tiempo real"
            value={settings.voiceTranscription}
            onToggle={() => onUpdateSettings({ voiceTranscription: !settings.voiceTranscription })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />
        </View>

        {/* 5. Ajustes Adicionales */}
        <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: fg }]}>Ajustes Adicionales</Text>
              <Text style={styles.sectionSubtitle}>Preferencias tácticas opcionales</Text>
            </View>
            <Sparkles size={18} color="#10b981" />
          </View>

          <ToggleRow
            icon={<Vibrate size={16} color={fg} />}
            title="Vibración Háptica de Emergencia"
            subtitle="Patrón de pulsos intensos al activar SOS"
            value={settings.hapticEmergencyVibe}
            onToggle={() => onUpdateSettings({ hapticEmergencyVibe: !settings.hapticEmergencyVibe })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
          />

          <ToggleRow
            icon={<ShieldAlert size={16} color={fg} />}
            title="Confirmación al Cancelar"
            subtitle="Evita abortar un reporte por toque accidental"
            value={settings.confirmCancelEmergency}
            onToggle={() => onUpdateSettings({ confirmCancelEmergency: !settings.confirmCancelEmergency })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />

          <ToggleRow
            icon={<Smartphone size={16} color={fg} />}
            title="Modo Pantalla Discreta"
            subtitle="Atenúa el brillo durante alertas de riesgo"
            value={settings.screenPrivacyShield}
            onToggle={() => onUpdateSettings({ screenPrivacyShield: !settings.screenPrivacyShield })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />

          <ToggleRow
            icon={<Volume2 size={16} color={fg} />}
            title="Chime de Confirmación SOS"
            subtitle="Tono breve indicando enlace de auxilio"
            value={settings.sosAudioChime}
            onToggle={() => onUpdateSettings({ sosAudioChime: !settings.sosAudioChime })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />

          <ToggleRow
            icon={<Crosshair size={16} color={fg} />}
            title="GPS Satelital Alta Precisión"
            subtitle="Triangulación submétrica para el mapa"
            value={settings.highAccuracyGps}
            onToggle={() => onUpdateSettings({ highAccuracyGps: !settings.highAccuracyGps })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />

          <ToggleRow
            icon={<FileCheck size={16} color={fg} />}
            title="Auto-guardado en Bitácora"
            subtitle="Conserva audios y fotos en historial"
            value={settings.autoSaveTranscripts}
            onToggle={() => onUpdateSettings({ autoSaveTranscripts: !settings.autoSaveTranscripts })}
            isLight={isLight}
            hapticsEnabled={settings.hapticFeedback}
            bordered
          />
        </View>

        {/* 6. Sesión */}
        <View style={{ gap: 8 }}>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <LogOut size={16} color="#f87171" />
            <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              Cerrar Sesión Táctica
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontWeight: '800', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 },
  headerSubtitle: { fontSize: 9, color: '#8e9192', textTransform: 'uppercase', letterSpacing: 1 },
  section: { borderRadius: 28, padding: 18, borderWidth: 1 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  sectionSubtitle: { color: '#8e9192', fontSize: 10 },
  themeGrid: { flexDirection: 'row', gap: 10 },
  themeButton: { flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 8 },
  toggleRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontWeight: '800', fontSize: 13, textTransform: 'uppercase' },
  toggleSubtitle: { color: '#8e9192', fontSize: 10 },
  sirenSection: { paddingTop: 10, marginTop: 4, borderTopWidth: 1 },
  sirenHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sirenButtonsRow: { flexDirection: 'row', gap: 8 },
  sirenButton: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(16,185,129,0.2)' },
  activeBadgeText: { color: '#10b981', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    marginTop: 6,
  },
});
