import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0b',
        surface: {
          DEFAULT: '#131316',
          2: '#18181d',
          3: '#1e1e24',
        },
        border: {
          DEFAULT: '#25252c',
          hi: '#35353d',
        },
        text: {
          DEFAULT: '#f5f5f7',
          2: '#a1a1a8',
          3: '#6b6b72',
          4: '#4a4a50',
        },
        accent: {
          DEFAULT: '#9b7cff',
          hi: '#b294ff',
        },
        good: '#4ade80',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '15px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        md: ['16px', '24px'],
        lg: ['17px', '24px'],
        xl: ['22px', '28px'],
        '4xl': ['40px', '44px'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #9b7cff 0%, #e879f9 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(155, 124, 255, 0.35)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
