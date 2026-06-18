const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  // Variables de entorno y mocks globales ANTES de cargar módulos
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Busca tests en __tests__ (excluyendo helpers/) o archivos con sufijo .test.js / .spec.js
  testMatch: [
    '**/__tests__/**/!(helpers)/**/*.{js,mjs}',
    '**/__tests__/*.{js,mjs}',
    '**/*.{test,spec}.{js,mjs}',
  ],
  // Excluir helpers de forma explícita
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Carpeta de salida del reporte de cobertura
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'app/api/Agente_IA/**/*.js',
    'src/**/*.{js,jsx}',
    '!**/*.test.{js,mjs}',
    '!**/node_modules/**',
  ],
  // Muestra nombre de cada test en la consola
  verbose: true,
};

module.exports = createJestConfig(config);
