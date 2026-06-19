/**
 * Servicios geoespaciales (OSRM + Nominatim). El mapa base usa Google Maps vía react-native-maps.
 */
export const OSRM_BASE_URL =
  process.env.EXPO_PUBLIC_OSRM_URL
  || 'https://profesional-osrm-production.up.railway.app';

/** API de geocodificación Nominatim. Producción: Railway. */
export const NOMINATIM_BASE_URL =
  process.env.EXPO_PUBLIC_NOMINATIM_URL
  || 'https://profesional-nominatim-production.up.railway.app';

/** User-Agent exigido por la política de uso de Nominatim. */
export const NOMINATIM_USER_AGENT =
  process.env.EXPO_PUBLIC_NOMINATIM_USER_AGENT
  || 'ProfesionalConductorDriverApp/1.0';

export const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL
  || 'https://profesional-dashboard.vercel.app';
