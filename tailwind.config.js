/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0f0f1a',
          800: '#141428',
          700: '#1a1a2e',
          600: '#2a2a4a',
          500: '#363660',
        },
        accent: '#7B73FF',
        'accent-light': '#9B95FF',
        online: '#34D399',
        offline: '#6B7280',
      },
    },
  },
  plugins: [],
};
