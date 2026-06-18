/**
 * URLs de servicios geoespaciales (OSRM, Nominatim, tiles).
 * Compatible CommonJS — usado por dashboard, apps y tests.
 */

function readEnv(...keys) {
  if (typeof process === 'undefined' || !process.env) return '';
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

const MAP_STYLE_URL = readEnv(
  'EXPO_PUBLIC_MAP_STYLE_URL',
  'NEXT_PUBLIC_MAP_STYLE_URL',
) || 'https://tiles.openfreemap.org/styles/liberty';

const OSRM_BASE_URL = readEnv(
  'EXPO_PUBLIC_OSRM_URL',
  'OSRM_BASE_URL',
  'NEXT_PUBLIC_OSRM_URL',
) || 'https://profesional-osrm-production.up.railway.app';

const NOMINATIM_BASE_URL = readEnv(
  'EXPO_PUBLIC_NOMINATIM_URL',
  'NOMINATIM_BASE_URL',
  'NEXT_PUBLIC_NOMINATIM_URL',
) || 'https://profesional-nominatim-production.up.railway.app';

const NOMINATIM_USER_AGENT = readEnv(
  'EXPO_PUBLIC_NOMINATIM_USER_AGENT',
  'NOMINATIM_USER_AGENT',
) || 'ProfesionalApp/1.0';

const NOMINATIM_SELF_HOSTED = readEnv(
  'EXPO_PUBLIC_NOMINATIM_SELF_HOSTED',
  'NOMINATIM_SELF_HOSTED',
) !== 'false';

/** Salta Capital — viewbox Nominatim: oeste,sur,este,norte */
const SALTA_VIEWBOX = '-65.55,-24.90,-65.30,-24.70';
const SALTA_COUNTRY = 'ar';

module.exports = {
  MAP_STYLE_URL,
  OSRM_BASE_URL,
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_SELF_HOSTED,
  SALTA_VIEWBOX,
  SALTA_COUNTRY,
};
