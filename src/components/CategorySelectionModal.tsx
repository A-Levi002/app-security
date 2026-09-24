import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Flame, HeartPulse, ShieldAlert, UserX, Swords, Paintbrush, Leaf, HelpCircle, X } from 'lucide-react-native';
import { EmergencyCategory } from '../types';
import { DotPatternLayer } from './DotPatternLayer';

interface CategorySelectionModalProps {
  onSelectCategory: (category: EmergencyCategory) => void;
  onCancel: () => void;
  theme?: 'dark' | 'light';
}

interface CategoryOption {
  id: EmergencyCategory;
  title: string;
  subtitle: string;
  icon: any;
}

export const CategorySelectionModal: React.FC<CategorySelectionModalProps> = ({
  onSelectCategory,
  onCancel,
  theme = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';

  const categories: CategoryOption[] = [
    { id: 'traffic', title: 'Accidente Vial', subtitle: 'Colisión vehicular o atropello', icon: Car },
    { id: 'fire', title: 'Incendio', subtitle: 'Fuego activo o fuga de gas', icon: Flame },
    { id: 'medical', title: 'Emergencia Médica', subtitle: 'Ambulancia, salud o crisis', icon: HeartPulse },
    { id: 'robbery', title: 'Robo / Intrusión', subtitle: 'Asalto, riesgo o peligro activo', icon: ShieldAlert },
    { id: 'suspicious_person', title: 'Persona Sospechosa', subtitle: 'Merodeo, acecho o conducta anómala', icon: UserX },
    { id: 'violence', title: 'Violencia / Agresión', subtitle: 'Conflicto físico o agresión en curso', icon: Swords },
    { id: 'vandalism', title: 'Vandalismo', subtitle: 'Daños a propiedad o vía pública', icon: Paintbrush },
    { id: 'ambiental', title: 'Ambiental', subtitle: 'Materiales peligrosos, residuos o contaminación (ODS 12)', icon: Leaf },
    { id: 'other', title: 'Otro Incidente', subtitle: 'Situación imprevista de seguridad', icon: HelpCircle },
  ];

  const bg = isLight ? '#f7f7f8' : '#0c0c0d';
  const text = isLight ? '#000' : '#fff';

  return (
    <View style={[styles.overlay, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <DotPatternLayer
        color={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
        dotRadius={1.3}
        opacity={0.6}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.rowGap}>
              <View style={styles.liveDot} />
              <Text style={styles.eyebrow}>DESPACHO INMEDIATO 911</Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.closeBtn, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
            >
              <X width={16} height={16} color={text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: text }]}>Tipo de Incidente</Text>
          <Text style={styles.subtitle}>
            Selecciona la categoría para iniciar la evaluación táctica con la IA.
          </Text>
        </View>

        {/* 2x2 Grid */}
        <View style={styles.grid}>
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <Animated.View key={cat.id} entering={FadeInDown.delay(idx * 60)} style={styles.gridItem}>
                <TouchableOpacity
                  onPress={() => onSelectCategory(cat.id)}
                  activeOpacity={0.85}
                  style={[
                    styles.card,
                    isLight
                      ? { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.1)' }
                      : { backgroundColor: 'rgba(20,20,22,0.9)', borderColor: 'rgba(255,255,255,0.15)' },
                  ]}
                >
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' },
                    ]}
                  >
                    <Icon width={28} height={28} color={text} />
                  </View>
                  <Text style={[styles.cardTitle, { color: text }]}>{cat.title}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {cat.subtitle}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* Cancel button */}
        <TouchableOpacity
          onPress={onCancel}
          style={[
            styles.cancelBtn,
            isLight
              ? { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.2)' }
              : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)' },
          ]}
        >
          <X width={16} height={16} color={isLight ? '#000' : '#c4c7c8'} />
          <Text style={[styles.cancelText, { color: isLight ? '#000' : '#c4c7c8' }]}>CANCELAR</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 48,
  },
  header: { width: '100%', paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  eyebrow: { fontSize: 10, color: '#8e9192', textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '700', fontSize: 26, textTransform: 'uppercase', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: '#8e9192', marginTop: 4, lineHeight: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  gridItem: { width: '47%' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 16,
    minHeight: 155,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 14, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 },
  cardSubtitle: { fontSize: 10, color: '#8e9192', textAlign: 'center' },
  cancelBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelText: { fontWeight: '700', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
});
