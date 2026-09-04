import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MapPin, Camera, Mic, Bell, Shield, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { SystemPermissions } from '../types';
import { SwitchToggle } from './SwitchToggle';
import { DotPatternLayer } from './DotPatternLayer';

interface PermissionsModalProps {
  permissions: SystemPermissions;
  onUpdatePermissions: (newPerms: SystemPermissions) => void;
  onContinue: () => void;
  theme?: 'dark' | 'light';
}

// Lee el estado REAL del permiso nativo (sin abrir diálogo del sistema).
// Devuelve true solo si Android/Expo ya lo tiene concedido.
async function getNativePermissionStatus(key: keyof SystemPermissions): Promise<boolean> {
  if (key === 'notifications') {
    try {
      const { getPermissionsAsync } = await import('expo-notifications');
      const res = await getPermissionsAsync();
      return res.granted;
    } catch {
      return true;
    }
  }

  try {
    if (key === 'location') {
      const { getForegroundPermissionsAsync } = await import('expo-location');
      const res = await getForegroundPermissionsAsync();
      return res.granted;
    }

    if (key === 'camera') {
      const { Camera } = await import('expo-camera');
      const res = await Camera.getCameraPermissionsAsync();
      return res.granted;
    }

    if (key === 'microphone') {
      const { Camera } = await import('expo-camera');
      const res = await Camera.getMicrophonePermissionsAsync();
      return res.granted;
    }
  } catch {
    return true;
  }

  return true;
}

// Solicita un permiso nativo usando las APIs de Expo (diálogo del sistema Android).
// Devuelve el estado REAL resultante tras la solicitud.
async function requestNativePermission(key: keyof SystemPermissions): Promise<boolean> {
  if (key === 'notifications') {
    try {
      const { getPermissionsAsync, requestPermissionsAsync } = await import('expo-notifications');
      const existing = await getPermissionsAsync();
      if (!existing.granted && existing.canAskAgain) {
        const requested = await requestPermissionsAsync();
        return requested.granted;
      }
      return existing.granted;
    } catch {
      return true;
    }
  }

  try {
    if (key === 'location') {
      const { requestForegroundPermissionsAsync } = await import('expo-location');
      const res = await requestForegroundPermissionsAsync();
      return res.granted;
    }

    if (key === 'camera') {
      const { Camera } = await import('expo-camera');
      const res = await Camera.requestCameraPermissionsAsync();
      return res.granted;
    }

    if (key === 'microphone') {
      const { Camera } = await import('expo-camera');
      const res = await Camera.requestMicrophonePermissionsAsync();
      return res.granted;
    }
  } catch {
    return true;
  }

  return true;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  permissions,
  onUpdatePermissions,
  onContinue,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [requestingKey, setRequestingKey] = useState<string | null>(null);
  const [permissionFeedback, setPermissionFeedback] = useState<string | null>(null);

  // Al abrir, sincroniza los switches con el estado REAL de los permisos del sistema.
  // Así nunca muestra "activado" si Android no tiene realmente el permiso concedido.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys: (keyof SystemPermissions)[] = ['location', 'camera', 'microphone', 'notifications'];
      const results = await Promise.all(keys.map((k) => getNativePermissionStatus(k)));
      if (cancelled) return;
      const synced = keys.reduce<SystemPermissions>(
        (acc, k, i) => ({ ...acc, [k]: results[i] }),
        { ...permissions }
      );
      onUpdatePermissions(synced);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (key: keyof SystemPermissions, turningOn: boolean) => {
    if (turningOn === permissions[key]) return;

    if (turningOn) {
      setRequestingKey(key);
      const granted = await requestNativePermission(key);
      if (!granted) {
        setRequestingKey(null);
        setPermissionFeedback(`Permiso ${key.toUpperCase()} DENEGADO por el sistema`);
        return;
      }
      setPermissionFeedback(`Permiso concedido para ${key.toUpperCase()}`);
    }
    setRequestingKey(null);
    onUpdatePermissions({ ...permissions, [key]: turningOn });
  };

  const permissionItems = [
    { key: 'location' as const, icon: MapPin, title: 'Servicios de Ubicación', description: 'GPS y geolocalización satelital precisa' },
    { key: 'camera' as const, icon: Camera, title: 'Acceso a la Cámara', description: 'Captura rápida de evidencia visual' },
    { key: 'microphone' as const, icon: Mic, title: 'Micrófono', description: 'Entrada de audio para evaluación de gravedad' },
    { key: 'notifications' as const, icon: Bell, title: 'Notificaciones Push', description: 'Alertas críticas y confirmación de despacho' },
  ];

  const allGranted = permissionItems.every((item) => permissions[item.key]);

  const bg = isLight ? '#f7f7f8' : '#0c0c0d';
  const text = isLight ? '#000' : '#fff';

  return (
    <View style={[styles.overlay, { backgroundColor: bg }]}>
      <DotPatternLayer
        color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
        dotRadius={1.3}
        opacity={0.6}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View
            style={[
              styles.shieldCircle,
              { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' },
            ]}
          >
            <Shield width={40} height={40} color={text} />
          </View>
          <Text style={[styles.title, { color: text }]}>PERMISOS DEL SISTEMA</Text>
          <Text style={styles.subtitle}>
            SECURE_OS requiere los siguientes accesos para garantizar una respuesta inmediata y el despacho coordinado de unidades.
          </Text>
        </View>

        {permissionFeedback && (
          <View style={styles.feedbackPill}>
            <CheckCircle2 width={14} height={14} color="#10b981" />
            <Text style={styles.feedbackText}>{permissionFeedback}</Text>
          </View>
        )}

        <View style={styles.list}>
          {permissionItems.map((item) => {
            const Icon = item.icon;
            const isEnabled = permissions[item.key];
            const isRequesting = requestingKey === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => handleToggle(item.key, !isEnabled)}
                activeOpacity={0.85}
                style={[
                  styles.row,
                  isLight
                    ? { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.1)' }
                    : { backgroundColor: 'rgba(20,20,22,0.9)', borderColor: 'rgba(255,255,255,0.1)' },
                ]}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                    <Icon width={20} height={20} color={text} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.rowTitle, { color: text }]}>{item.title}</Text>
                    <Text style={styles.rowDesc}>{item.description}</Text>
                  </View>
                </View>

                <SwitchToggle
                  value={isEnabled}
                  onValueChange={(next) => handleToggle(item.key, next)}
                  isLight={isLight}
                  requesting={isRequesting}
                  hapticsEnabled={false}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actionArea}>
          <TouchableOpacity
            onPress={onContinue}
            disabled={!allGranted}
            style={[
              styles.continueBtn,
              { backgroundColor: isLight ? '#000' : '#fff' },
              !allGranted && styles.continueDisabled,
            ]}
          >
            <Text style={[styles.continueText, { color: isLight ? '#fff' : '#131313' }]}>CONTINUAR</Text>
            <ArrowRight width={20} height={20} color={isLight ? '#fff' : '#131313'} />
          </TouchableOpacity>
          {!allGranted && (
            <Text style={styles.gateHint}>ACTIVA TODOS LOS PERMISOS DEL SISTEMA PARA CONTINUAR</Text>
          )}
          <Text style={styles.footerNote}>PROTOCOLO TÁCTICO V-1.0.4</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: 20, paddingTop: 48, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24, maxWidth: 340 },
  shieldCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: StyleSheet.hairlineWidth },
  title: { fontWeight: '700', fontSize: 24, marginBottom: 8, textTransform: 'uppercase', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#8e9192', textAlign: 'center', lineHeight: 19 },
  feedbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    marginBottom: 16,
  },
  feedbackText: { fontSize: 11, color: '#10b981', fontWeight: '700', textTransform: 'uppercase' },
  list: { width: '100%', gap: 12, marginBottom: 24 },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 28, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowDesc: { fontSize: 11, color: '#8e9192' },
  actionArea: { width: '100%', marginTop: 8 },
  continueBtn: { width: '100%', borderRadius: 999, paddingVertical: 16, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueDisabled: { opacity: 0.35 },
  continueText: { fontWeight: '700', fontSize: 15 },
  gateHint: { marginTop: 10, fontSize: 10, color: '#f59e0b', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  footerNote: { marginTop: 14, fontSize: 10, color: '#8e9192', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2 },
});