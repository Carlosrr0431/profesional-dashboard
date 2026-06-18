/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        light: {
          50: '#FFFFFF',
          100: '#F8F9FC',
          200: '#F1F3F8',
          300: '#E8ECF2',
          400: '#D1D8E4',
          500: '#94A3B8',
        },
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#1E3A5F',
          600: '#2D4A73',
          500: '#3B5E8C',
        },
        accent: '#DC2626',
        'accent-light': '#EF4444',
        'accent-dim': 'rgba(220,38,38,0.08)',
        'navy-accent': '#1E3A5F',
        'navy-dim': 'rgba(30,58,95,0.08)',
        online: '#22C55E',
        'online-dim': 'rgba(34,197,94,0.08)',
        offline: '#94A3B8',
        'offline-dim': 'rgba(148,163,184,0.08)',
        danger: '#EF4444',
        warning: '#F59E0B',
      },
    },
  },
  plugins: [],
};
