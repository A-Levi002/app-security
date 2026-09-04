import React from 'react';
import { View } from 'react-native';
import { DotPatternLayer } from './DotPatternLayer';
import { colors } from '../theme';

interface AmbientBackgroundProps {
  theme?: 'dark' | 'light';
}

// Fondo negro monocromático con la retícula de puntitos de la versión web.
// (Los blobs/anillos difuminados de la versión anterior se retiran por diseño.)
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ theme = 'dark' }) => {
  const isLight = theme === 'light';
  const dotColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)';

  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
        { backgroundColor: isLight ? colors.lightBg : colors.darkBg, zIndex: 0 },
      ]}
    >
      <DotPatternLayer color={dotColor} dotRadius={1.3} opacity={0.75} />
    </View>
  );
};