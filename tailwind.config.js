/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#161625',
          800: '#1C1C35',
          700: '#232345',
          600: '#333360',
          500: '#444478',
        },
        accent: '#8B83FF',
        'accent-light': '#A8A2FF',
        'accent-dim': 'rgba(139,131,255,0.12)',
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
