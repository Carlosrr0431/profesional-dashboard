/**
 * jest.setup.js — Corre ANTES de que cualquier módulo sea importado.
 * Aquí se configuran variables de entorno falsas y mocks globales.
 *
 * ⚠️  No importar nada de route.js aquí. Este archivo es ejecutado por
 * Jest como "setupFiles" (pre-framework), antes de que los tests carguen
 * los módulos bajo prueba.
 */

// ── Variables de entorno requeridas por route.js ────────────────────────────
process.env.GOOGLE_MAPS_API_KEY              = 'test-google-maps-key';
process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  = 'test-google-maps-key';
process.env.OPENAI_API_KEY                   = 'sk-test-openai-key';
process.env.WASENDER_API_KEY                 = 'test-wasender-key';
process.env.WASENDER_BASE_URL                = 'https://test.wasenderapi.com/api';
process.env.SUPABASE_URL                     = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY        = 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_URL         = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY    = 'test-anon-key';
process.env.CRON_SECRET                      = 'test-cron-secret';
process.env.WHATSAPP_TRIP_TRANSITION_SECRET  = 'test-transition-secret';
process.env.TRACKING_BASE_URL                = 'http://localhost:3000';
process.env.VERCEL                           = '';   // simular entorno local (no serverless)
process.env.WHATSAPP_IMMEDIATE_PROCESSING    = 'true';
process.env.WHATSAPP_ACCUMULATION_MS         = '0';  // sin espera en tests
process.env.TOMTOM_API_KEY                   = 'test-tomtom-key';
process.env.EXPO_PUBLIC_OSRM_URL             = 'https://test-osrm.example';
process.env.EXPO_PUBLIC_NOMINATIM_URL        = 'https://test-nominatim.example';

const { installGeoFetchMock } = require('./__tests__/helpers/geo-fetch-mock');
installGeoFetchMock((url) => {
  const urlStr = String(url);
  if (urlStr.includes('wasenderapi.com') || urlStr.includes('test.wasenderapi.com')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { msgId: 'test-msg' } }),
      text: () => Promise.resolve(JSON.stringify({ success: true })),
    });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
});
