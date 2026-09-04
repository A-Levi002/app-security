import React, { useMemo } from 'react';
import { View, StyleSheet, PanResponder, type PanResponderGestureState } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// ---------------------------------------------------------------------------
// SwitchToggle (portado de https://www.animatereactnative.com/post/switch-xx)
// - El pulgar se desliza con gesto (PanResponder) o tap y vuelve con resorte.
// - Mantener presionado lo escala ligeramente (sensación de "agarre").
// - Opcional: pulso ámbar mientras se solicita un permiso del sistema.
// ---------------------------------------------------------------------------

export const SWITCH_TRACK_W = 50;
export const SWITCH_TRACK_H = 28;
export const SWITCH_THUMB = 22;
const SWITCH_PAD = 2;
export const SWITCH_TRAVEL = SWITCH_TRACK_W - SWITCH_THUMB - SWITCH_PAD * 2;

interface SwitchToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  isLight: boolean;
  disabled?: boolean;
  requesting?: boolean;
  hapticsEnabled?: boolean;
}

export const SwitchToggle: React.FC<SwitchToggleProps> = ({
  value,
  onValueChange,
  isLight,
  disabled = false,
  requesting = false,
  hapticsEnabled = true,
}) => {
  const pos = useSharedValue(value ? SWITCH_TRAVEL : 0);
  const base = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const pulse = useSharedValue(1);

  const settle = (next: boolean) => {
    pos.value = withSpring(next ? SWITCH_TRAVEL : 0, { damping: 15, stiffness: 220, mass: 0.6 });
    pressScale.value = withSpring(1, { damping: 18, stiffness: 260 });
    if (hapticsEnabled && next !== value) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (next !== value) {
      onValueChange(next);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          base.value = pos.value;
          pressScale.value = withSpring(1.15, { damping: 18, stiffness: 260 });
        },
        onPanResponderMove: (_e, g: PanResponderGestureState) => {
          const next = Math.min(SWITCH_TRAVEL, Math.max(0, base.value + g.dx));
          pos.value = next;
        },
        onPanResponderRelease: (_e, g: PanResponderGestureState) => {
          const tapped = Math.abs(g.dx) < 6;
          const target = tapped ? !value : pos.value > SWITCH_TRAVEL / 2;
          settle(target);
        },
        onPanResponderTerminate: () => {
          settle(value);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, disabled, onValueChange, hapticsEnabled]
  );

  React.useEffect(() => {
    pos.value = withSpring(value ? SWITCH_TRAVEL : 0, { damping: 15, stiffness: 220, mass: 0.6 });
  }, [value, pos]);

  React.useEffect(() => {
    if (requesting) {
      pulse.value = withRepeat(withTiming(0.5, { duration: 480, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [requesting, pulse]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value }, { scale: pressScale.value }],
  }));

  const thumbPulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.track,
        requesting
          ? { backgroundColor: 'rgba(245,158,11,0.25)', borderColor: '#f59e0b' }
          : value
          ? { backgroundColor: isLight ? '#000' : '#fff', borderColor: isLight ? '#000' : '#fff' }
          : { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'transparent', borderColor: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' },
      ]}
    >
      <Animated.View style={[thumbStyle, thumbPulseStyle]}>
        <View
          style={[
            styles.thumb,
            requesting
              ? { backgroundColor: '#f59e0b' }
              : value
              ? { backgroundColor: isLight ? '#fff' : '#131313' }
              : { backgroundColor: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)' },
          ]}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: SWITCH_TRACK_W,
    height: SWITCH_TRACK_H,
    borderRadius: SWITCH_TRACK_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SWITCH_PAD,
    justifyContent: 'center',
  },
  thumb: { width: SWITCH_THUMB, height: SWITCH_THUMB, borderRadius: SWITCH_THUMB / 2 },
});