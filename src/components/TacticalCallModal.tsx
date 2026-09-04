import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, Radio, Headphones } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotPatternLayer } from './DotPatternLayer';

interface TacticalCallModalProps {
  contactName: string;
  phoneNumber?: string;
  onEndCall: () => void;
  theme?: 'dark' | 'light';
}

// A single animated sound-wave bar. In the web version this was `animate-pulse`
// on a fixed-height <span>; here we drive scaleY with Reanimated.
const WaveBar: React.FC<{ height: number; delay: number }> = ({ height, delay }) => {
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 500 }), -1, true)
    );
  }, [delay, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return <Animated.View style={[styles.waveBar, { height }, style]} />;
};

export const TacticalCallModal: React.FC<TacticalCallModalProps> = ({
  contactName,
  phoneNumber,
  onEndCall,
  theme = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [status, setStatus] = useState('CONECTANDO CANAL SEGURO...');

  useEffect(() => {
    const connectTimer = setTimeout(() => setStatus('CANAL SEGURO ESTABLECIDO'), 1500);
    const interval = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    return () => {
      clearTimeout(connectTimer);
      clearInterval(interval);
    };
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const bg = isLight ? 'rgba(247,247,248,0.97)' : 'rgba(14,14,14,0.97)';
  const text = isLight ? '#000' : '#fff';

  return (
    <Modal
      transparent
      animationType="fade"
      statusBarTranslucent
      visible
      onRequestClose={onEndCall}
    >
      <Animated.View entering={FadeIn.duration(200)} style={[styles.overlay, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Retícula de puntitos de fondo */}
      <DotPatternLayer
        color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
        dotRadius={1.3}
        opacity={0.6}
      />
      {/* Header */}
      <View style={styles.headerArea}>
        <View style={styles.statusChip}>
          <Radio width={14} height={14} color="#10b981" />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.avatarWrap}>
          <View style={styles.pulseRing} />
          <View
            style={[
              styles.avatarCircle,
              isLight ? { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.15)' } : { backgroundColor: '#2a2a2a', borderColor: 'rgba(255,255,255,0.2)' },
            ]}
          >
            <Headphones width={40} height={40} color={text} />
          </View>
        </View>

        <Text style={[styles.contactName, { color: text }]}>{contactName}</Text>
        <Text style={styles.phoneNumber}>{phoneNumber || 'LÍNEA CIFRADA ALPHA-9'}</Text>
        <Text style={[styles.duration, { color: text }]}>{formatDuration(callDuration)}</Text>
      </View>

      {/* Sound wave */}
      <View style={styles.waveRow}>
        {[16, 32, 40, 24, 36, 20, 28, 12].map((h, i) => (
          <WaveBar key={i} height={h} delay={i * 80} />
        ))}
      </View>

      {/* Controls */}
      <View style={styles.controlsArea}>
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={() => setIsMuted(!isMuted)}
            style={[
              styles.circleBtn,
              isMuted
                ? { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#f87171' }
                : isLight
                ? { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.15)' }
                : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' },
            ]}
            accessibilityLabel="Silenciar micrófono"
          >
            {isMuted ? (
              <MicOff width={24} height={24} color="#ef4444" />
            ) : (
              <Mic width={24} height={24} color={text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSpeaker(!isSpeaker)}
            style={[
              styles.circleBtn,
              isSpeaker
                ? { backgroundColor: isLight ? '#000' : '#fff', borderColor: isLight ? '#000' : '#fff' }
                : isLight
                ? { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.15)' }
                : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' },
            ]}
            accessibilityLabel="Altavoz"
          >
            {isSpeaker ? (
              <Volume2 width={24} height={24} color={isLight ? '#fff' : '#000'} />
            ) : (
              <VolumeX width={24} height={24} color="#8e9192" />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={onEndCall} style={styles.endCallBtn} accessibilityLabel="Colgar llamada">
          <PhoneOff width={28} height={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  headerArea: { alignItems: 'center', paddingTop: 32 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.3)',
    marginBottom: 16,
  },
  statusText: { fontSize: 10, color: '#059669', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  avatarWrap: { marginVertical: 16, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  avatarCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontWeight: '700', fontSize: 24, marginTop: 8 },
  phoneNumber: { fontSize: 12, color: '#8e9192', marginTop: 4 },
  duration: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48 },
  waveBar: { width: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  controlsArea: { alignItems: 'center', gap: 24, paddingBottom: 24 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  circleBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  endCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
