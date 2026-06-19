/**
 * Google Places Autocomplete + Place Details (Salta Capital).
 * Usa GOOGLE_MAPS_API_KEY en servidor; no exponer en apps móviles.
 */
const { SALTA_VIEWBOX } = require('./mapConfig');

const SALTA_CENTER = { lat: -24.7829, lng: -65.4122 };
const SALTA_RADIUS_M = 22000;

function readGoogleApiKey() {
  if (typeof process === 'undefined' || !process.env) return '';
  return String(
    process.env.GOOGLE_MAPS_API_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    || '',
  ).trim();
}

function isGooglePlaceId(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return false;
  if (/^\d+$/.test(id)) return false;
  return /^[A-Za-z0-9_-]{8,}$/.test(id);
}

function parseViewboxCenter() {
  const parts = String(SALTA_VIEWBOX || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return SALTA_CENTER;
  }
  const [west, south, east, north] = parts;
  return {
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  };
}

async function googleMapsRequest(path, params = {}) {
  const key = readGoogleApiKey();
  if (!key) return null;

  const qs = new URLSearchParams({ ...params, key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/${path}?${qs.toString()}`);
  if (!response.ok) {
    throw new Error(`Google Maps HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'ZERO_RESULTS') {
    return { status: 'OK', predictions: [], results: [] };
  }
  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status || 'Google Maps error');
  }
  return data;
}

function mapPrediction(prediction) {
  const description = String(prediction?.description || '').trim();
  const main = String(prediction?.structured_formatting?.main_text || '').trim();
  const secondary = String(prediction?.structured_formatting?.secondary_text || '').trim();

  return {
    address: description,
    placeId: prediction.place_id,
    lat: null,
    lng: null,
    title: main || description.split(',')[0] || description,
    subtitle: secondary || description.split(',').slice(1).join(',').trim(),
  };
}

async function autocompletePlacesSalta(query, limit = 8) {
  const input = String(query || '').trim();
  if (input.length < 3) return [];

  const center = parseViewboxCenter();
  const data = await googleMapsRequest('place/autocomplete/json', {
    input,
    language: 'es',
    components: 'country:ar',
    location: `${center.lat},${center.lng}`,
    radius: String(SALTA_RADIUS_M),
    strictbounds: 'true',
    types: 'geocode',
  });

  if (!data?.predictions?.length) return [];

  return data.predictions
    .slice(0, Math.max(1, Math.min(limit, 8)))
    .map(mapPrediction);
}

async function getGooglePlaceDetails(placeId) {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('place_id inválido');

  const data = await googleMapsRequest('place/details/json', {
    place_id: id,
    language: 'es',
    fields: 'geometry,formatted_address',
  });

  const result = data?.result;
  const lat = Number(result?.geometry?.location?.lat);
  const lng = Number(result?.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('No se pudo obtener coordenadas del lugar');
  }

  return {
    lat,
    lng,
    formattedAddress: String(result.formatted_address || '').trim(),
  };
}

async function geocodeAddressGoogle(address) {
  const query = String(address || '').trim();
  if (!query) throw new Error('Dirección vacía');

  const data = await googleMapsRequest('geocode/json', {
    address: /salta/i.test(query) ? query : `${query}, Salta, Argentina`,
    language: 'es',
    region: 'ar',
    bounds: SALTA_VIEWBOX.split(',').slice(0, 2).concat(SALTA_VIEWBOX.split(',').slice(2)).join(','),
  });

  const result = Array.isArray(data?.results) ? data.results[0] : null;
  const lat = Number(result?.geometry?.location?.lat);
  const lng = Number(result?.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('No se encontró la dirección');
  }

  return {
    lat,
    lng,
    formattedAddress: String(result.formatted_address || query).trim(),
    placeId: result.place_id || null,
  };
}

function isGoogleConfigured() {
  return Boolean(readGoogleApiKey());
}

module.exports = {
  autocompletePlacesSalta,
  getGooglePlaceDetails,
  geocodeAddressGoogle,
  isGooglePlaceId,
  isGoogleConfigured,
};
