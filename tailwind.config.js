/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B1120',
          800: '#111B2E',
          700: '#162036',
          600: '#253352',
          500: '#334565',
        },
        accent: '#DC2626',
        'accent-light': '#EF4444',
        'accent-dim': 'rgba(220,38,38,0.12)',
        online: '#4ADE80',
        'online-dim': 'rgba(74,222,128,0.12)',
        offline: '#94A3B8',
        'offline-dim': 'rgba(148,163,184,0.12)',
        danger: '#FB7185',
        warning: '#FBBF24',
      },
    },
  },
  plugins: [],
};
