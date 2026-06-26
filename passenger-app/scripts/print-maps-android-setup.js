#!/usr/bin/env node
/**
 * Información de configuración de mapas para passenger-app (Google Maps SDK).
 */
const appJson = require('../app.json');

console.log('\n=== Mapas — passenger-app (Google Maps SDK nativo) ===\n');
console.log(`Package name: ${appJson.expo.android.package}`);
console.log('\nVariables de entorno requeridas (.env):');
console.log('  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=tu_clave_con_Maps_SDK_Android_y_iOS');
console.log('\nEn Google Cloud Console, habilitá:');
console.log('  - Maps SDK for Android');
console.log('  - Maps SDK for iOS');
console.log('\nDespués de cambiar dependencias nativas, ejecutá:');
console.log('  npx expo prebuild --clean --platform android && npx expo run:android');
console.log('  npx expo prebuild --clean --platform ios && npx expo run:ios\n');
