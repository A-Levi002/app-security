import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

interface DotPatternLayerProps {
  color?: string;
  spacing?: number;
  dotRadius?: number;
  opacity?: number;
}

// Retícula de puntitos reutilizable (traducción del radial-gradient de la web).
export const DotPatternLayer: React.FC<DotPatternLayerProps> = ({
  color = 'rgba(255,255,255,0.16)',
  spacing = 18,
  dotRadius = 1.1,
  opacity = 0.6,
}) => {
  const rawId = React.useId();
  const patternId = `dotgrid-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} opacity={opacity}>
        <Defs>
          <Pattern id={patternId} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <Circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill={color} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
};