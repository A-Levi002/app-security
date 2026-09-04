import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Shield, Settings, Radio, CheckCircle, Wifi } from 'lucide-react-native';

interface TopAppBarProps {
  onOpenSettings: () => void;
  onGoHome: () => void;
  title?: string;
  theme?: 'dark' | 'light';
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  onOpenSettings,
  onGoHome,
  title = 'SECURE_OS',
  theme = 'dark',
}) => {
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';

  const barColors = isLight
    ? { bg: 'rgba(255,255,255,0.9)', border: 'rgba(0,0,0,0.1)', text: '#000' }
    : { bg: 'rgba(19,19,19,0.85)', border: 'rgba(255,255,255,0.1)', text: '#fff' };

  return (
    <View style={[styles.header, { backgroundColor: barColors.bg, borderBottomColor: barColors.border, height: 64 + insets.top, paddingTop: insets.top }]}>
      {/* Left: Shield status */}
      <View>
        <TouchableOpacity
          onPress={() => setShowStatusPopover(!showStatusPopover)}
          style={[styles.iconBtn, isLight ? styles.iconBtnLight : styles.iconBtnDark]}
          accessibilityLabel="Estado del Sistema"
        >
          <Shield width={20} height={20} color={barColors.text} />
          <View style={styles.pulseDot} />
        </TouchableOpacity>

        {showStatusPopover && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(150)}
            style={[
              styles.popover,
              isLight
                ? { backgroundColor: 'rgba(255,255,255,0.98)', borderColor: 'rgba(0,0,0,0.15)' }
                : { backgroundColor: 'rgba(24,24,26,0.98)', borderColor: 'rgba(255,255,255,0.2)' },
            ]}
          >
            <View style={[styles.popoverHeaderRow, { borderBottomColor: barColors.border }]}>
              <View style={styles.rowGap}>
                <Radio width={14} height={14} color="#10b981" />
                <Text style={[styles.monoBold, { color: barColors.text }]}>SECURE_OS // 2.4.0</Text>
              </View>
              <Text style={styles.onlineBadge}>EN LÍNEA</Text>
            </View>

            <View style={styles.popoverBody}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Cifrado Cuántico</Text>
                <View style={styles.rowGap}>
                  <CheckCircle width={12} height={12} color="#10b981" />
                  <Text style={[styles.statValue, { color: barColors.text }]}>AES-256</Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Enlace Táctico</Text>
                <View style={styles.rowGap}>
                  <Wifi width={12} height={12} color="#10b981" />
                  <Text style={[styles.statValue, { color: barColors.text }]}>12 ms</Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>GPS Telemetría</Text>
                <Text style={[styles.statValue, { color: barColors.text }]}>Fijado (±0.8m)</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Center title */}
      <TouchableOpacity onPress={onGoHome} activeOpacity={0.85}>
        <Text style={[styles.title, { color: barColors.text }]}>{title}</Text>
      </TouchableOpacity>

      {/* Right: Settings */}
      <View style={styles.rightRow}>
        <TouchableOpacity
          onPress={onOpenSettings}
          style={[styles.iconBtn, isLight ? styles.iconBtnLight : styles.iconBtnDark]}
          accessibilityLabel="Ajustes"
        >
          <Settings width={20} height={20} color={barColors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnLight: { backgroundColor: 'transparent' },
  iconBtnDark: { backgroundColor: 'transparent' },
  pulseDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  title: {
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popover: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 256,
    borderRadius: 24,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
    elevation: 8,
  },
  popoverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monoBold: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  onlineBadge: {
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.15)',
    color: '#059669',
    fontWeight: '700',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.3)',
    overflow: 'hidden',
  },
  popoverBody: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    color: '#8e9192',
  },
  statValue: {
    fontSize: 11,
    fontWeight: '700',
  },
});
