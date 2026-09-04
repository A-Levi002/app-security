import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HomeScreenProps {
  onTriggerEmergency: () => void;
  theme?: 'dark' | 'light';
}

// Reusable pulsing ring driven by Reanimated (replaces the `motion.div` keyframe animation)
const PulseRing: React.FC<{ size: number; color: string; delay?: number; duration?: number }> = ({
  size,
  color,
  delay = 0,
  duration = 3500,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, false)
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const scale = 1 + progress.value * 0.4;
    const opacity = progress.value < 0.5 ? 0.35 * (1 - progress.value * 2) + 0.15 : 0;
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        style,
      ]}
    />
  );
};

const RadarRing: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
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

// Satélite: puntito que orbita alrededor del SOS en una trayectoria circular.
// Cada satélite tiene órbita, velocidad y dirección propias (anticlockwise si reverse).
const OrbitDot: React.FC<{
  radius: number;
  size: number;
  color: string;
  duration: number;
  reverse?: boolean;
  trail?: boolean;
}> = ({ radius, size, color, duration, reverse = false, trail = false }) => {
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
    opacity: 0.55 + halo.value * 0.45,
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
      {trail && (
        <Animated.View
          style={[
            styles.orbitDot,
            {
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: size * 0.3,
              backgroundColor: color,
              top: -size * 0.3,
              left: radius - size * 0.6 * 0.5 - size * 0.6,
              opacity: 0.25,
            },
          ]}
        />
      )}
    </Animated.View>
  );
};

// Marquee de avisos en bucle (replicar animate-marquee-scroll del web)
const TICKER_CONTENT = ['MANTÉN LA CALMA', 'CONEXIÓN IA ACTIVA', 'RESPUESTA INMEDIATA'];

const MarqueeTicker: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const translateX = useSharedValue(0);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth <= 0) return;
    translateX.value = withRepeat(
      withTiming(-contentWidth, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
  }, [contentWidth, translateX]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.tickerMask}>
      <Animated.View style={[styles.tickerTrack, style]}>
        {[0, 1].map((copy) => (
          <Animated.View
            key={copy}
            style={styles.tickerGroup}
            onLayout={(e) => {
              if (copy === 0) {
                setContentWidth(e.nativeEvent.layout.width);
              }
            }}
          >
            {TICKER_CONTENT.map((item) => (
              <Text
                key={item}
                style={[styles.tickerText, { color: isLight ? '#5f6368' : '#8e9192' }]}
              >
                {'///'} {item}
              </Text>
            ))}
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ onTriggerEmergency, theme = 'dark' }) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';

  const ringColor = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
  const ringColor2 = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)';

  // Desvelado secuencial: primero el elemento redondo, y a los ~2s el texto.
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withDelay(2000, withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }));
  }, [reveal]);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 12 }],
  }));

  return (
    <View style={[styles.container, { paddingTop: 64 + insets.top + 16, paddingBottom: 96 + insets.bottom }]}>
      <View style={styles.topArea}>
        <MarqueeTicker isLight={isLight} />
      </View>

      {/* Center SOS trigger */}
      <View style={styles.center}>
        <View style={styles.reticleWrap}>
          <PulseRing size={288} color={ringColor} duration={3500} />
          <PulseRing size={256} color={ringColor2} duration={3500} delay={1200} />
          <RadarRing size={242} color={ringColor} />

          {/* Satélites orbitando el SOS */}
          <OrbitDot radius={142} size={5} color="#10b981" duration={9000} />
          <OrbitDot radius={120} size={4} color={isLight ? '#000' : '#fff'} duration={7000} reverse trail />
          <OrbitDot radius={98} size={3.5} color={isLight ? '#000' : '#fff'} duration={5200} />

          <View style={[styles.fixedRing, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }]}>
            <View style={[styles.crossTop, { backgroundColor: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)' }]} />
            <View style={[styles.crossBottom, { backgroundColor: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)' }]} />
            <View style={[styles.crossLeft, { backgroundColor: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)' }]} />
            <View style={[styles.crossRight, { backgroundColor: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)' }]} />
          </View>

          <TouchableOpacity
            onPress={onTriggerEmergency}
            activeOpacity={0.85}
            style={[
              styles.sosButton,
              isLight
                ? { backgroundColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }
                : { backgroundColor: '#fff', borderColor: 'rgba(255,255,255,0.4)' },
            ]}
            accessibilityLabel="SOS Activar Protocolo"
          >
            <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={isLight ? '#fff' : '#131313'} strokeWidth={2}>
              <Circle cx="12" cy="12" r="9" />
              <Circle cx="12" cy="12" r="4" />
              <Path d="M12 2v2" />
              <Path d="M12 20v2" />
              <Path d="M2 12h2" />
              <Path d="M20 12h2" />
              <Line x1="12" y1="8" x2="12" y2="12" />
              <Line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={3} />
            </Svg>
            <Text style={[styles.sosText, { color: isLight ? '#fff' : '#131313' }]}>SOS</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.subtextWrap, revealStyle]}>
          <Text style={[styles.subtextBold, { color: isLight ? '#000' : '#fff' }]}>
            PULSA PARA ACTIVAR PROTOCOLO
          </Text>

          <View style={styles.dotsRow}>
            <View style={[styles.smallDot, { backgroundColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.bigDot, { backgroundColor: isLight ? '#000' : '#fff' }]} />
            <View style={[styles.smallDot, { backgroundColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)' }]} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    width: '100%',
  },
  topArea: { width: '100%', alignItems: 'center', gap: 8 },
  tickerMask: { width: '100%', maxWidth: 320, overflow: 'hidden', marginTop: 4 },
  tickerTrack: { flexDirection: 'row', width: 'auto' },
  tickerGroup: { flexDirection: 'row', gap: 32, paddingRight: 40 },
  tickerText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reticleWrap: { alignItems: 'center', justifyContent: 'center' },
  orbit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  orbitDot: { position: 'absolute', top: -3 },
  ring: { position: 'absolute', borderWidth: 1 },
  dashedRing: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed' },
  fixedRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossTop: { position: 'absolute', top: 0, width: 8, height: 2 },
  crossBottom: { position: 'absolute', bottom: 0, width: 8, height: 2 },
  crossLeft: { position: 'absolute', left: 0, height: 8, width: 2 },
  crossRight: { position: 'absolute', right: 0, height: 8, width: 2 },
  sosButton: {
    width: 192,
    height: 192,
    borderRadius: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    elevation: 10,
  },
  sosText: { fontWeight: '700', fontSize: 30, letterSpacing: -0.5, textTransform: 'uppercase', marginTop: 2 },
  subtextWrap: { marginTop: 32, alignItems: 'center' },
  subtextBold: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  dotsRow: { marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  smallDot: { width: 6, height: 6, borderRadius: 3 },
  bigDot: { width: 8, height: 8, borderRadius: 4 },
});
