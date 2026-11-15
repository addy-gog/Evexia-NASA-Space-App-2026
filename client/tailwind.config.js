/** @type {import('tailwindcss').Config} */
// Evexia light "mission control" tokens (design canvas: Handoff spec).
// Blue is the only brand accent; green, amber and red are reserved for health status.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: { DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)', 2: 'rgb(var(--c-surface-2) / <alpha-value>)' },
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', 2: 'rgb(var(--c-ink-2) / <alpha-value>)', 3: 'rgb(var(--c-ink-3) / <alpha-value>)' },
        accent: { DEFAULT: '#1F4FD8', strong: '#163BA6', soft: '#E8EEFC' },
        visor: '#14213D',
        body: '#E6EBF3',
        ok: { fg: '#0B6B41', bg: '#E2F4EA', dot: '#1E9E61', line: '#9ED3B6' },
        warn: { fg: '#8A4B00', bg: '#FFF1D6', dot: '#E08A00', line: '#F0C77A' },
        crit: { fg: '#B3141F', bg: '#FDE6E8', dot: '#D92332', line: '#F2A3AA' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: { card: '20px', tile: '14px', input: '12px' },
      boxShadow: {
        float: '0 12px 32px rgba(14,23,38,.14)',
        panel: '0 24px 60px rgba(14,23,38,.18)',
        sel: '0 0 0 3px rgba(31,79,216,.14)',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      maxWidth: { page: '1360px' },
    },
  },
  plugins: [],
};
