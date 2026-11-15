/** @type {import('tailwindcss').Config} */
// Evexia tokens: "deep space" dark theme (default) and a light theme, switched by html[data-theme].
// Brand accent is the logo red; green, amber and rose are reserved for health status
// and are always paired with an icon and a word, never colour alone.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: { DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)', 2: 'rgb(var(--c-surface-2) / <alpha-value>)' },
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', 2: 'rgb(var(--c-ink-2) / <alpha-value>)', 3: 'rgb(var(--c-ink-3) / <alpha-value>)' },
        // Logo red. `text` is the lighter tint used for red text on dark glass (≥4.5:1).
        accent: { DEFAULT: '#D7333A', strong: '#B3242B', soft: 'rgb(var(--accent-soft) / <alpha-value>)', text: 'rgb(var(--accent-text) / <alpha-value>)', glow: '#FF4D55' },
        // Secondary space accents from the background glow (decoration and charts only).
        nebula: { teal: '#4FD1C5', indigo: '#818CF8', sky: '#7DD3FC' },
        visor: '#0B1022',
        body: '#1A2340',
        // Status colours are theme variables (index.css): light text on dark tints, dark text on light tints.
        ok: { fg: 'rgb(var(--ok-fg) / <alpha-value>)', bg: 'rgb(var(--ok-bg) / <alpha-value>)', dot: '#22C55E', line: 'rgb(var(--ok-line) / <alpha-value>)' },
        warn: { fg: 'rgb(var(--warn-fg) / <alpha-value>)', bg: 'rgb(var(--warn-bg) / <alpha-value>)', dot: '#F59E0B', line: 'rgb(var(--warn-line) / <alpha-value>)' },
        crit: { fg: 'rgb(var(--crit-fg) / <alpha-value>)', bg: 'rgb(var(--crit-bg) / <alpha-value>)', dot: '#F43F5E', line: 'rgb(var(--crit-line) / <alpha-value>)' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: { card: '22px', tile: '14px', input: '12px' },
      boxShadow: {
        float: '0 16px 40px rgba(0,0,0,.45)',
        panel: '0 24px 60px rgba(0,0,0,.55)',
        sel: '0 0 0 3px rgba(255,77,85,.28)',
        glow: '0 0 0 1px rgba(255,77,85,.35), 0 8px 30px rgba(215,51,58,.35)',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      maxWidth: { page: '1440px' },
    },
  },
  plugins: [],
};
