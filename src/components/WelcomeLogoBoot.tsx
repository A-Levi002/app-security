import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { DotPatternLayer } from './DotPatternLayer';

interface WelcomeLogoBootProps {
  theme?: 'dark' | 'light';
  onComplete: () => void;
}

// Matriz 5x5 que dibuja el glifo "anillo" de Nothing (mismo patrón que la versión web)
const GLYPH_MATRIX = [
  0, 1, 1, 1, 0,
  1, 0, 0, 0, 1,
  1, 0, 1, 0, 1,
  1, 0, 0, 0, 1,
  0, 1, 1, 1, 0,
];

// Orden de los puntos del anillo (en el sentido de las agujas del reloj) para
// que la luz "recorra" el borde del redondo de forma continua. El centro (12)
// pulsa de forma independiente.
const RING_ORDER = [1, 2, 3, 9, 14, 19, 23, 22, 21, 15, 10, 5];
const CENTER_INDEX = 12;

// Anillo exterior giratorio (radar) con reanimated
const RadarRing: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 16000, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dashedRing,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        style,
      ]}
    />
  );
};

// Onda de pulso (strobe) con reanimated
const StrobeRing: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.45 }],
    opacity: 0.4 - progress.value * 0.35,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.strobeRing,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        style,
      ]}
    />
  );
};

// Punto satélite que orbita alrededor del icono central (visible movimiento).
const OrbitDot: React.FC<{
  radius: number;
  size: number;
  color: string;
  duration: number;
  reverse?: boolean;
}> = ({ radius, size, color, duration, reverse = false }) => {
  const rotation = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(reverse ? -360 : 360, { duration, easing: Easing.linear }),
      -1,
      false
    );
    halo.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [rotation, halo, reverse, duration]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + halo.value * 0.4,
    transform: [{ scale: 0.8 + halo.value * 0.5 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.orbit, { width: radius * 2, height: radius * 2, borderRadius: radius }, ringStyle]}
    >
      <Animated.View
        style={[
          styles.orbitDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            top: -size / 2,
            left: radius - size / 2,
          },
          dotStyle,
        ]}
      />
    </Animated.View>
  );
};

// Punto del glifo con parpadeo escalonado. `phase` es la posición en el anillo
// (0..N): cada punto se enciende uno tras otro, creando una onda de luz que
// recorre el redondo. `phase < 0` = punto del centro (pulso propio).
const GlyphDot: React.FC<{ on: boolean; color: string; colorOff: string; phase: number }> = ({
  on,
  color,
  colorOff,
  phase,
}) => {
  const opacity = useSharedValue(on ? 0.4 : 0.2);
  const scale = useSharedValue(on ? 0.9 : 0.8);

  useEffect(() => {
    if (!on) return;
    const isCenter = phase < 0;
    // Desfase por posición en el anillo: la luz avanza de punto en punto.
    const delay = isCenter ? 0 : phase * 110;
    // El centro late más lento y continuo; el anillo simula una onda viajera.
    const bright = isCenter ? 500 : 320;

    const loopOpacity = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: bright, easing: Easing.out(Easing.quad) })),
        withTiming(isCenter ? 0.5 : 0.2, { duration: bright, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 300, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    opacity.value = loopOpacity;

    const loopScale = withRepeat(
      withSequence(
        withDelay(delay, withTiming(isCenter ? 1.15 : 1.45, { duration: bright, easing: Easing.out(Easing.quad) })),
        withTiming(1, { duration: bright, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.85, { duration: 300, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    scale.value = loopScale;
  }, [on, phase, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[{ backgroundColor: on ? color : colorOff }, styles.glyphDot, style]} />;
};

export const WelcomeLogoBoot: React.FC<WelcomeLogoBootProps> = ({ theme = 'dark', onComplete }) => {
  const insets = useSafeAreaInsets();
  const [bootStep, setBootStep] = useState(0);
  const [typedText, setTypedText] = useState('');
  const fullText = 'SECURE_OS';
  const isLight = theme === 'light';

  // Parpadeo del cursor de tipeo
  const cursorOpacity = useSharedValue(1);
  useEffect(() => {
    cursorOpacity.value = withRepeat(withTiming(0, { duration: 520 }), -1, true);
  }, [cursorOpacity]);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  // Efecto typewriter para el título de marca
  useEffect(() => {
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx <= fullText.length) {
        setTypedText(fullText.slice(0, currentIdx));
        currentIdx++;
      } else {
        clearInterval(interval);
      }
    }, 45);
    return () => clearInterval(interval);
  }, []);

  // Progresión de pasos de arranque
  useEffect(() => {
    const t1 = setTimeout(() => setBootStep(1), 600);
    const t2 = setTimeout(() => setBootStep(2), 1400);
    const t3 = setTimeout(() => setBootStep(3), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const text = isLight ? '#121212' : '#e5e2e1';
  const bg = isLight ? '#f7f7f8' : '#0c0c0d';
  const ringColor = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  const ringColorSoft = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
  const dotOn = isLight ? '#000' : '#fff';
  const dotOff = isLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.28)';
  const dotSatellite = isLight ? '#000' : '#fff';
  const dotSatelliteSoft = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  const dotLayer = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)';

  const steps = [
    { label: 'KERNEL', done: bootStep >= 1 },
    { label: 'GPS_FIX', done: bootStep >= 2 },
    { label: 'AI_AGENT', done: bootStep >= 3 },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bg, paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom },
      ]}
    >
      {/* Retícula de puntitos de fondo */}
      <DotPatternLayer color={dotLayer} dotRadius={1.3} opacity={0.75} />

      <View style={styles.main}>
        {/* Redondo central: glifo de puntos animados + anillos giratorios + satélites */}
        <View style={styles.glyphWrap}>
          <RadarRing size={224} color={ringColor} />
          <StrobeRing size={176} color={ringColorSoft} />
          <OrbitDot radius={118} size={8} color={dotSatellite} duration={7000} />
          <OrbitDot radius={98} size={5} color={dotSatelliteSoft} duration={5200} reverse />
          <OrbitDot radius={80} size={6} color={dotSatellite} duration={4000} />
          <View
            style={[
              styles.glyphFace,
              { backgroundColor: isLight ? '#fff' : '#141416', borderColor: ringColor },
            ]}
          >
            <View style={styles.glyphGrid}>
              {GLYPH_MATRIX.map((val, idx) => (
                <GlyphDot
                  key={idx}
                  on={val === 1}
                  color={dotOn}
                  colorOff={dotOff}
                  phase={val === 1 ? (idx === CENTER_INDEX ? -1 : RING_ORDER.indexOf(idx)) : -2}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Título tipeado + tagline */}
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: text }]}>{typedText}</Text>
            <Animated.View style={[styles.cursor, { backgroundColor: text }, cursorStyle]} />
          </View>
          <Text style={styles.tagline}>
            La IA al servicio de la vida // Sistema de Emergencias 911
          </Text>
        </View>

        {/* Indicadores de telemetría */}
        <View style={styles.stepsRow}>
          {steps.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.stepChip,
                item.done
                  ? { backgroundColor: isLight ? '#000' : '#fff', borderColor: isLight ? '#000' : '#fff' }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: ringColorSoft,
                      opacity: 0.5,
                    },
              ]}
            >
              <View
                style={[
                  styles.stepDot,
                  { backgroundColor: item.done ? (isLight ? '#fff' : '#000') : '#9ca3af' },
                ]}
              />
              <Text
                style={[
                  styles.stepLabel,
                  { color: item.done ? (isLight ? '#fff' : '#000') : '#8e9192', fontWeight: item.done ? '700' : '400' },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.ctaBtn, { backgroundColor: isLight ? '#000' : '#fff' }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.ctaText, { color: isLight ? '#fff' : '#000' }]}>
          COMENZAR
        </Text>
        <ArrowRight size={18} color={isLight ? '#fff' : '#000'} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  main: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28 },
  glyphWrap: { width: 232, height: 232, alignItems: 'center', justifyContent: 'center' },
  dashedRing: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed' },
  strobeRing: { position: 'absolute', borderWidth: 1 },
  orbit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  orbitDot: { position: 'absolute', top: -3 },
  glyphFace: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyphGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 76,
    gap: 9,
    justifyContent: 'center',
  },
  glyphDot: { width: 10, height: 10, borderRadius: 5 },
  titleBlock: { alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontWeight: '700', fontSize: 19, letterSpacing: 2, textTransform: 'uppercase' },
  cursor: { width: 8, height: 20, borderRadius: 2, marginLeft: 6 },
  tagline: {
    fontSize: 10,
    color: '#8e9192',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 15,
  },
  stepsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepLabel: { fontSize: 10 },
  ctaBtn: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 8,
  },
  ctaText: {
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    textAlign: 'center',
    flexShrink: 1,
  },
});
