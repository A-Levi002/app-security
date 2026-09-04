import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Layout } from 'react-native-reanimated';
import { Shield, Clock, User } from 'lucide-react-native';
import { NavigationTab, NavTab } from '../types';

export type { NavTab, NavigationTab };

interface BottomNavBarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  theme?: 'dark' | 'light';
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  theme = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';

  const navItems: { id: NavigationTab; label: string; icon: any }[] = [
    { id: 'home', label: 'SOS', icon: Shield },
    { id: 'history', label: 'Historial', icon: Clock },
    { id: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <View style={[styles.wrapper, { bottom: 24 + insets.bottom }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          isLight
            ? { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.1)' }
            : { backgroundColor: 'rgba(19,19,19,0.92)', borderColor: 'rgba(255,255,255,0.1)' },
        ]}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onSelectTab(item.id)}
              activeOpacity={0.8}
              style={styles.item}
            >
              {isActive && (
                <Animated.View
                  layout={Layout.springify().stiffness(450).damping(35)}
                  style={[
                    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
                    styles.indicator,
                    { backgroundColor: isLight ? '#000' : '#fff' },
                  ]}
                />
              )}
              <View style={styles.itemContent}>
                <Icon
                  width={20}
                  height={20}
                  color={isActive ? (isLight ? '#fff' : '#131313') : isLight ? '#6e6e73' : '#8e9192'}
                />
                <Text
                  style={[
                    styles.label,
                    { color: isActive ? (isLight ? '#fff' : '#131313') : isLight ? '#6e6e73' : '#8e9192' },
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    width: '92%',
    maxWidth: 320,
  },
  item: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  indicator: {
    borderRadius: 999,
  },
  itemContent: {
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
