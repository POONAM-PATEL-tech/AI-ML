/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F9FAFB',
        surface: '#FFFFFF',
        surface2: '#E5E7EB',
        ink: '#0F172A',
        inkSoft: '#1E293B',
        muted: '#64748B',
        brass: '#4F46E5',
        brassSoft: '#6366F1',
        approved: '#059669',
        rejected: '#DC2626',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 24px -4px rgba(15,23,42,0.08), 0 2px 6px -2px rgba(15,23,42,0.04)',
        cardHover: '0 8px 32px -4px rgba(15,23,42,0.12), 0 4px 8px -2px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
};
