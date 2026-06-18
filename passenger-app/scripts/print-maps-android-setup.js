#!/usr/bin/env node
/**
 * Información de configuración de mapas para passenger-app (MapLibre + OSM).
 */
const appJson = require('../app.json');

console.log('\n=== Mapas — passenger-app (MapLibre + OpenFreeMap) ===\n');
console.log(`Package name: ${appJson.expo.android.package}`);
console.log('\nVariables de entorno recomendadas (.env):');
console.log('  EXPO_PUBLIC_OSRM_URL=https://profesional-osrm-production.up.railway.app');
console.log('  EXPO_PUBLIC_NOMINATIM_URL=https://profesional-nominatim-production.up.railway.app');
console.log('  EXPO_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty');
console.log('\nNo se requiere API key de Google Maps.');
console.log('Después de cambiar dependencias nativas, ejecutá:');
console.log('  npx expo prebuild --clean --platform android && npx expo run:android\n');
