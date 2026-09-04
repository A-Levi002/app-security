// Design tokens that replace the Tailwind CSS classes used in the web version.
// Import { colors, spacing, radius } wherever the original used Tailwind utility classes.

export const colors = {
  darkBg: '#0c0c0d',
  lightBg: '#f5f5f7',
  darkBlob: 'rgba(255,255,255,0.07)',
  darkBlob2: 'rgba(42,42,42,0.4)',
  lightBlob: 'rgba(0,0,0,0.05)',
  white: '#ffffff',
  black: '#000000',
  textPrimaryDark: '#f5f5f7',
  textPrimaryLight: '#0c0c0d',
  textSecondary: '#9a9a9a',
  cardDark: 'rgba(255,255,255,0.06)',
  cardLight: 'rgba(0,0,0,0.04)',
  borderDark: 'rgba(255,255,255,0.1)',
  borderLight: 'rgba(0,0,0,0.1)',
  danger: '#ff3b30',
  warning: '#ff9f0a',
  success: '#30d158',
  info: '#0a84ff',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 999,
};

export function getTheme(theme: 'dark' | 'light' = 'dark') {
  const isLight = theme === 'light';
  return {
    isLight,
    background: isLight ? colors.lightBg : colors.darkBg,
    text: isLight ? colors.textPrimaryLight : colors.textPrimaryDark,
    card: isLight ? colors.cardLight : colors.cardDark,
    border: isLight ? colors.borderLight : colors.borderDark,
  };
}
