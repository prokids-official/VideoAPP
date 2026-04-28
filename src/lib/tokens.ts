export const tokens = {
  color: {
    bg: '#0a0a0b',
    surface: '#131316',
    surface2: '#18181d',
    surface3: '#1e1e24',
    border: '#25252c',
    borderHi: '#35353d',
    text: '#f5f5f7',
    text2: '#a1a1a8',
    text3: '#6b6b72',
    text4: '#4a4a50',
    accent: '#9b7cff',
    accentHi: '#b294ff',
    accentBg: 'rgba(155,124,255,0.12)',
    accentBorder: 'rgba(155,124,255,0.35)',
    good: '#4ade80',
    warn: '#fbbf24',
    bad: '#f87171',
  },
  gradientBrand: 'linear-gradient(135deg, #9b7cff 0%, #e879f9 100%)',
} as const;

export type Tokens = typeof tokens;
