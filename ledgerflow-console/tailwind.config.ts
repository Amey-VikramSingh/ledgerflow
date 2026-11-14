import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0B1220', // ledger-ink base
          800: '#0E1626',
          700: '#131C2E',     // surface
          600: '#1B263B',     // elevated
          500: '#26344F',     // border-strong
        },
        line: '#1E2A40',       // hairline border
        fg: { DEFAULT: '#E6EAF2', muted: '#8A97AD', faint: '#5A6683' },
        credit: { DEFAULT: '#3FB98C', soft: 'rgba(63,185,140,0.12)' },
        debit: { DEFAULT: '#E06B74', soft: 'rgba(224,107,116,0.12)' },
        action: { DEFAULT: '#5E7CE2', hover: '#7089E8', soft: 'rgba(94,124,226,0.14)' },
        warn: '#D9A441',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 30px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        tick: { '0%': { backgroundColor: 'rgba(94,124,226,0.18)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease both',
        tick: 'tick 1.2s ease',
      },
    },
  },
  plugins: [],
};
export default config;
